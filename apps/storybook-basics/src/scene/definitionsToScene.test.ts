// src/scene/definitionsToScene.test.ts — ACCEPTANCE for lane
// `scv-rung-a-scene` (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §5/§6).
// Committed BEFORE the lane exists and OFF-LIMITS to its builder.
//
// The fixture is the FROZEN cross-repo contract:
// docs/acceptance/pyblocks/stereo_definitions.expected.json — the same bytes
// pyblocks' `tests/test_definition_graph.py` (lane `scv-definitions-
// partition`) asserts its own output equals. Two lanes, one literal: if
// either drifts from the JSON, its own test goes red, never the other's.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isCodeCell } from "./codeCell";
import { definitionsToScene, REFERENCE_EDGE_TYPE, UNKNOWN_ROOT_ANCHOR, type DefinitionsView } from "./definitionsToScene";
import { isRegion, REGION_NODE_TYPE } from "./region";
import { findDanglingEdges } from "./scene";

const FIXTURE = fileURLToPath(new URL("../../../../docs/acceptance/pyblocks/stereo_definitions.expected.json", import.meta.url));
const VIEW: DefinitionsView = JSON.parse(readFileSync(FIXTURE, "utf8"));

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

describe("the frozen fixture is internally consistent (guards the contract itself)", () => {
  it("is a definitions view of the stereo module with 7 definitions in source order", () => {
    expect(VIEW.schemaVersion).toBe(1);
    expect(VIEW.kind).toBe("definitions");
    expect(VIEW.definitions.map((definition) => definition.anchor)).toEqual([
      "<module>",
      "EstimatePairOut",
      "rectify",
      "estimate_pair",
      "Pipeline",
      "Pipeline.__init__",
      "Pipeline.run",
    ]);
  });

  it("every contentHash is the sha256 of its own text, and the module's equals source.sha256", () => {
    for (const definition of VIEW.definitions) expect(definition.contentHash).toBe(sha256(definition.text));
    expect(VIEW.definitions[0].contentHash).toBe(`sha256:${VIEW.source.sha256}`);
  });
});

/** Computed inside each test, never at collection time — a throwing body
 *  must fail ONE test, not take the whole file (and its fixture guards)
 *  down with it. */
function fromModule() {
  return definitionsToScene(VIEW, { rootAnchor: "<module>", mintId: counter("id"), uri: "stereo.py" });
}

describe("definitionsToScene from <module>", () => {
  it("produces one region-with-code-face per strict descendant, nested by parentId, no definitionId", () => {
    const result = fromModule();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { scene, nodeIdByAnchor } = result;
    expect(scene.nodes).toHaveLength(6);
    expect(Object.keys(nodeIdByAnchor).sort()).toEqual(["EstimatePairOut", "Pipeline", "Pipeline.__init__", "Pipeline.run", "estimate_pair", "rectify"]);
    for (const node of scene.nodes) {
      expect(node.type).toBe(REGION_NODE_TYPE);
      expect(isRegion(node)).toBe(true);
      expect(isCodeCell(node)).toBe(true);
      expect(node.definitionId).toBeUndefined();
      expect(Number.isFinite(node.position.x) && Number.isFinite(node.position.y)).toBe(true);
    }
    const byAnchor = (anchor: string) => scene.nodes.find((node) => node.id === nodeIdByAnchor[anchor])!;
    expect(byAnchor("Pipeline.run").parentId).toBe(nodeIdByAnchor["Pipeline"]);
    expect(byAnchor("Pipeline.__init__").parentId).toBe(nodeIdByAnchor["Pipeline"]);
    expect(byAnchor("rectify").parentId).toBeUndefined();
    // View order is scene order.
    expect(scene.nodes.map((node) => node.id)).toEqual(["EstimatePairOut", "rectify", "estimate_pair", "Pipeline", "Pipeline.__init__", "Pipeline.run"].map((a) => nodeIdByAnchor[a]));
  });

  it("each cell holds its exact span bytes as a python cache bound by origin {uri, anchor, contentHash}", () => {
    const result = fromModule();
    if (!result.ok) throw new Error("refused");
    for (const definition of VIEW.definitions.slice(1)) {
      const node = result.scene.nodes.find((candidate) => candidate.id === result.nodeIdByAnchor[definition.anchor])!;
      expect(node.data.name).toBe(definition.name);
      expect(node.data.codeCell).toEqual({
        language: "python",
        source: definition.text,
        origin: { uri: "stereo.py", anchor: definition.anchor, contentHash: definition.contentHash },
      });
      expect(node.data.definition).toEqual({
        kind: definition.kind,
        signature: definition.signature,
        parameters: definition.parameters,
        outputs: definition.outputs,
      });
    }
    const estimate = result.scene.nodes.find((node) => node.id === result.nodeIdByAnchor["estimate_pair"])!;
    expect(estimate.data.definition.parameters.map((parameter) => parameter.name)).toEqual(["left", "right"]);
    expect(estimate.data.definition.outputs.map((output) => output.name)).toEqual(["depth", "confidence"]);
  });

  it("draws every reference with BOTH endpoints produced as a node-level `reference` edge — a third lane, never a data cable", () => {
    const result = fromModule();
    if (!result.ok) throw new Error("refused");
    const id = result.nodeIdByAnchor;
    expect(result.scene.edges.map((edge) => ({ type: edge.type, source: edge.source, target: edge.target, data: edge.data, handles: [edge.sourceHandle, edge.targetHandle] }))).toEqual([
      { type: REFERENCE_EDGE_TYPE, source: id["estimate_pair"], target: id["EstimatePairOut"], data: { kind: "call", lines: [23] }, handles: [undefined, undefined] },
      { type: REFERENCE_EDGE_TYPE, source: id["estimate_pair"], target: id["EstimatePairOut"], data: { kind: "name", lines: [20] }, handles: [undefined, undefined] },
      { type: REFERENCE_EDGE_TYPE, source: id["estimate_pair"], target: id["rectify"], data: { kind: "call", lines: [21] }, handles: [undefined, undefined] },
      { type: REFERENCE_EDGE_TYPE, source: id["Pipeline.run"], target: id["estimate_pair"], data: { kind: "call", lines: [31] }, handles: [undefined, undefined] },
    ]);
    expect(findDanglingEdges(result.scene)).toEqual([]);
    expect(result.external).toEqual([]);
  });

  it("mints ids through the caller only: nodes first in view order, then edges", () => {
    const result = fromModule();
    if (!result.ok) throw new Error("refused");
    expect(result.scene.nodes.map((node) => node.id)).toEqual(["id1", "id2", "id3", "id4", "id5", "id6"]);
    expect(result.scene.edges.map((edge) => edge.id)).toEqual(["id7", "id8", "id9", "id10"]);
  });

  it("hangs direct children under `parentId` when given, and never mutates the view", () => {
    const snapshot = JSON.stringify(VIEW);
    const nested = definitionsToScene(VIEW, { rootAnchor: "<module>", mintId: counter("n"), uri: "stereo.py", parentId: "cell-1" });
    if (!nested.ok) throw new Error("refused");
    expect(nested.scene.nodes.find((node) => node.id === nested.nodeIdByAnchor["rectify"])!.parentId).toBe("cell-1");
    expect(nested.scene.nodes.find((node) => node.id === nested.nodeIdByAnchor["Pipeline.run"])!.parentId).toBe(nested.nodeIdByAnchor["Pipeline"]);
    expect(JSON.stringify(VIEW)).toBe(snapshot);
  });

  it("uses the caller's `place` with sibling index and depth, parent-relative", () => {
    const calls: [string, number, number][] = [];
    const placed = definitionsToScene(VIEW, {
      rootAnchor: "<module>",
      mintId: counter("p"),
      uri: "stereo.py",
      place: (definition, index, depth) => {
        calls.push([definition.anchor, index, depth]);
        return { x: depth * 100, y: index * 10 };
      },
    });
    if (!placed.ok) throw new Error("refused");
    expect(calls).toEqual([
      ["EstimatePairOut", 0, 0],
      ["rectify", 1, 0],
      ["estimate_pair", 2, 0],
      ["Pipeline", 3, 0],
      ["Pipeline.__init__", 0, 1],
      ["Pipeline.run", 1, 1],
    ]);
    expect(placed.scene.nodes.find((node) => node.id === placed.nodeIdByAnchor["Pipeline.run"])!.position).toEqual({ x: 100, y: 10 });
  });
});

describe("definitionsToScene from a nested root", () => {
  it("root Pipeline → its two methods, and the reference that crosses the root boundary is reported as external, not drawn", () => {
    const result = definitionsToScene(VIEW, { rootAnchor: "Pipeline", mintId: counter("id"), uri: "stereo.py" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.nodeIdByAnchor).sort()).toEqual(["Pipeline.__init__", "Pipeline.run"]);
    expect(result.scene.nodes.every((node) => node.parentId === undefined)).toBe(true);
    expect(result.scene.edges).toEqual([]);
    expect(result.external).toEqual([{ from: "Pipeline.run", to: "estimate_pair", kind: "call", lines: [31] }]);
  });

  it("root a leaf → an empty scene, not a refusal", () => {
    const result = definitionsToScene(VIEW, { rootAnchor: "rectify", mintId: counter("id"), uri: "stereo.py" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.nodes).toEqual([]);
    expect(result.scene.edges).toEqual([]);
    // estimate_pair → rectify has ONE endpoint at the root itself and none produced: dropped, not external.
    expect(result.external).toEqual([]);
  });

  it("unknown root → a Diagnostic-shaped refusal", () => {
    const result = definitionsToScene(VIEW, { rootAnchor: "Nope", mintId: counter("id"), uri: "stereo.py" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.code).toBe(UNKNOWN_ROOT_ANCHOR);
    expect(result.refusal.severity).toBe("error");
  });
});
