// src/scene/pyblocksScene.test.ts — ACCEPTANCE for the pyblocks → scene
// loader (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`).
// Committed BEFORE the implementation exists and expected to be RED until
// the lane lands. Off-limits to the builder: if an assertion cannot be met,
// that is a finding to report, never a line to soften.
//
// The fixtures are the contract both sides test against: pyblocks' own
// acceptance (docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py)
// asserts its projection EQUALS these bytes; this file asserts the loader
// accepts them and lays them out. Node project, no DOM:
// `pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { hostPortsOf, topLevelNodes, type HostScene } from "../hosts/hostScene";
import { isRegion } from "./region";
import { childrenOf, findDanglingEdges, rank } from "./scene";
import {
  PYBLOCKS_SCENE_KIND,
  PYBLOCKS_SCENE_SCHEMA_VERSION,
  PyblocksSceneError,
  layoutUnplaced,
  loadPyblocksScene,
  parsePyblocksScene,
  type PyblocksSceneDocument,
} from "./pyblocksScene";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../../../../docs/fixtures/pyblocks-scene");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

const LINEAR = "linear_chain.scene.json";
const REGION = "region_for_if.scene.json";

const BOUNDARY = "function:run@3:0/boundary:selected-function";
const DECODE = "function:run@3:0/transform:call@4:12-4:23";
const SCALE = "function:run@3:0/transform:call@5:13-5:35";
const LITERAL = "function:run@3:0/data:literal@5:29-5:32";

const FOR_REGION = "function:sort_frame@4:0/region:for@8:4-14:44";
const IF_REGION = "function:sort_frame@4:0/region:if@10:8-13:41";
const SORT_BOUNDARY = "function:sort_frame@4:0/boundary:selected-function";

/* ------------------------------------------------------------------ */
/* parse — the document is accepted verbatim, or refused loudly         */
/* ------------------------------------------------------------------ */

describe("parsePyblocksScene", () => {
  test("accepts both frozen fixtures and returns them structurally unchanged", () => {
    for (const name of [LINEAR, REGION]) {
      const raw = fixture(name);
      const doc = parsePyblocksScene(raw);
      expect(doc.schemaVersion).toBe(PYBLOCKS_SCENE_SCHEMA_VERSION);
      expect(doc.kind).toBe(PYBLOCKS_SCENE_KIND);
      // Pass-through, not a re-serialization: the same facts, byte for byte.
      expect(JSON.stringify(doc)).toBe(JSON.stringify(raw));
    }
  });

  test("refuses a wrong schemaVersion or kind with PyblocksSceneError", () => {
    const raw = fixture(LINEAR) as PyblocksSceneDocument;
    expect(() => parsePyblocksScene({ ...raw, schemaVersion: 2 })).toThrow(PyblocksSceneError);
    expect(() => parsePyblocksScene({ ...raw, kind: "tldraw" })).toThrow(PyblocksSceneError);
    expect(() => parsePyblocksScene(null)).toThrow(PyblocksSceneError);
    expect(() => parsePyblocksScene("{}")).toThrow(PyblocksSceneError);
  });

  test("refuses a scene edge whose end names no node, or a parentId naming no node", () => {
    const raw = fixture(LINEAR) as PyblocksSceneDocument;
    const badEdge = { ...raw, scene: { ...raw.scene, edges: [...raw.scene.edges, { id: "ghost", source: "nope", target: DECODE, data: { pyblocks: { edgeId: "ghost", kind: "data" } } }] } };
    expect(() => parsePyblocksScene(badEdge)).toThrow(PyblocksSceneError);
    const badParent = { ...raw, scene: { ...raw.scene, nodes: raw.scene.nodes.map((node) => (node.id === LITERAL ? { ...node, parentId: "nope" } : node)) } };
    expect(() => parsePyblocksScene(badParent)).toThrow(PyblocksSceneError);
  });

  test("never lets a control edge or an __inner handle into the scene (Zach: never mix data and control lines)", () => {
    const raw = fixture(REGION) as PyblocksSceneDocument;
    const smuggled = {
      ...raw,
      scene: { ...raw.scene, edges: [...raw.scene.edges, { id: "c", source: IF_REGION, sourceHandle: "in-bins", target: FOR_REGION, targetHandle: "in-bins", data: { pyblocks: { edgeId: "c", kind: "control" } } }] },
    };
    expect(() => parsePyblocksScene(smuggled)).toThrow(PyblocksSceneError);
    const twin = {
      ...raw,
      scene: { ...raw.scene, edges: raw.scene.edges.map((edge, i) => (i === 0 ? { ...edge, sourceHandle: `${edge.sourceHandle}__inner` } : edge)) },
    };
    expect(() => parsePyblocksScene(twin)).toThrow(PyblocksSceneError);
  });
});

/* ------------------------------------------------------------------ */
/* the frozen documents say what the plan says they say                 */
/* ------------------------------------------------------------------ */

describe("the frozen fixtures (contract facts a consumer may rely on)", () => {
  test("linear_chain: everything is a block — 4 nodes, the function is the root REGION, the literal a value", () => {
    const doc = parsePyblocksScene(fixture(LINEAR));
    expect(doc.scene.nodes.map((node) => node.id)).toEqual([BOUNDARY, DECODE, SCALE, LITERAL]);
    const byId = new Map(doc.scene.nodes.map((node) => [node.id, node]));
    expect(byId.get(BOUNDARY)!.type).toBe("region");
    expect(isRegion(byId.get(BOUNDARY)!)).toBe(true);
    expect(byId.get(BOUNDARY)!.parentId).toBeUndefined();
    expect(byId.get(BOUNDARY)!.data.control).toEqual({ kind: "function", head: "run(raw: bytes) -> Frame" });
    for (const id of [DECODE, SCALE, LITERAL]) expect(byId.get(id)!.parentId).toBe(BOUNDARY);
    expect(byId.get(DECODE)!.type).toBe("block");
    expect(byId.get(LITERAL)!.type).toBe("value");
    expect(byId.get(LITERAL)!.data.value).toBe("2.0");
    expect(byId.get(LITERAL)!.data.readers).toEqual(["out-value"]);
    // A region never carries a definitionId (region.ts's isolation ruling).
    for (const node of doc.scene.nodes) if (isRegion(node)) expect(node.definitionId).toBeUndefined();
  });

  test("linear_chain: port labels are the authored NAMES, only for named ports; ids stay the semantic ids", () => {
    const doc = parsePyblocksScene(fixture(LINEAR));
    const scale = doc.scene.nodes.find((node) => node.id === SCALE)!;
    expect(scale.data.ports).toEqual({ left: ["in-frame", "in-gain"], right: ["out-scaled"] });
    expect(scale.data.portLabels).toEqual({ "in-frame": "frame", "in-gain": "gain", "out-scaled": "scaled" });
    expect(scale.data.portTypes).toEqual({ "in-frame": "Frame", "in-gain": "float", "out-scaled": "Frame" });
    const literal = doc.scene.nodes.find((node) => node.id === LITERAL)!;
    expect(literal.data.portLabels).toBeUndefined(); // `out-value` has no authored name
    const boundary = doc.scene.nodes.find((node) => node.id === BOUNDARY)!;
    expect(boundary.data.ports).toEqual({ left: ["boundary-input-raw"], right: ["boundary-output-scaled"] });
  });

  test("linear_chain: authored positions travel, unplaced nodes are flagged and sit at the origin", () => {
    const doc = parsePyblocksScene(fixture(LINEAR));
    const byId = new Map(doc.scene.nodes.map((node) => [node.id, node]));
    expect(byId.get(DECODE)!.position).toEqual({ x: 40, y: 80 });
    expect(byId.get(DECODE)!.data.pyblocks.authoredPosition).toBe(true);
    expect(byId.get(SCALE)!.position).toEqual({ x: 360, y: 80 });
    expect(byId.get(LITERAL)!.position).toEqual({ x: 0, y: 0 });
    expect(byId.get(LITERAL)!.data.pyblocks.authoredPosition).toBe(false);
    expect(byId.get(BOUNDARY)!.data.pyblocks.authoredPosition).toBe(false);
  });

  test("region_for_if: the P1 specimen — 11 nodes, three regions nested function ⊃ for ⊃ if, 17 wires, 2 control edges kept aside", () => {
    const doc = parsePyblocksScene(fixture(REGION));
    expect(doc.scene.nodes).toHaveLength(11);
    expect(doc.scene.edges).toHaveLength(17);
    expect(doc.controlEdges.map((edge) => edge.id)).toEqual(["y-bins-fallback", "y-bins-lookup"]);
    for (const edge of doc.controlEdges) expect(edge.kind).toBe("control");
    const byId = new Map(doc.scene.nodes.map((node) => [node.id, node]));
    expect(byId.get(SORT_BOUNDARY)!.type).toBe("region");
    expect(byId.get(FOR_REGION)!.type).toBe("region");
    expect(byId.get(FOR_REGION)!.parentId).toBe(SORT_BOUNDARY);
    expect(byId.get(FOR_REGION)!.data.control).toEqual({ kind: "for", head: "for detection in detections:" });
    expect(byId.get(IF_REGION)!.parentId).toBe(FOR_REGION);
    expect(byId.get(IF_REGION)!.data.control).toEqual({ kind: "if", head: 'if label == "unknown":' });
    // Every top-level BlockView block became a member of the function region.
    expect(topLevelNodes(doc.scene).map((node) => node.id)).toEqual([SORT_BOUNDARY]);
    expect(childrenOf(doc.scene, FOR_REGION).map((node) => node.id)).toEqual([
      "function:sort_frame@4:0/transform:call@9:16-9:34",
      IF_REGION,
      "function:sort_frame@4:0/transform:call@14:8-14:44",
    ]);
  });

  test("region_for_if: __inner twins fold onto ONE hierarchical pin per region port (collapse.ts's own shape)", () => {
    const doc = parsePyblocksScene(fixture(REGION));
    const forRegion = doc.scene.nodes.find((node) => node.id === FOR_REGION)!;
    expect(forRegion.data.ports).toEqual({ left: ["in-bins", "in-detections", "in-routed"], right: ["out-routed"] });
    for (const edge of doc.scene.edges) {
      expect(edge.sourceHandle?.endsWith("__inner")).toBe(false);
      expect(edge.targetHandle?.endsWith("__inner")).toBe(false);
    }
    // Outside half and inside half share the port `in-detections` on the region:
    const outer = doc.scene.edges.find((edge) => edge.id === "pe:45136d171173:1")!;
    expect([outer.target, outer.targetHandle]).toEqual([FOR_REGION, "in-detections"]);
    const inner = doc.scene.edges.find((edge) => edge.id === "x-detections-classify")!;
    expect([inner.source, inner.sourceHandle]).toEqual([FOR_REGION, "in-detections"]);
    expect(inner.data?.pyblocks.innerSource).toBe(true);
    // The carried-state edge is the DELAYED (z⁻¹) variant, never a second wire kind.
    const carry = doc.scene.edges.find((edge) => edge.id === "c-append-carry")!;
    expect(carry.data?.variant).toBe("delayed");
    expect(carry.data?.pyblocks.kind).toBe("state");
    expect(carry.data?.pyblocks.label).toBe("carried");
  });

  test("both fixtures: no dangling edge ends against the host's port vocabulary", () => {
    for (const name of [LINEAR, REGION]) {
      const doc = parsePyblocksScene(fixture(name));
      const scene = doc.scene as HostScene;
      expect(findDanglingEdges(scene, hostPortsOf(scene))).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* layout — deterministic, scoped, never touches authored geometry      */
/* ------------------------------------------------------------------ */

function siblingsOf(scene: HostScene, parentId: string | undefined) {
  return scene.nodes.filter((node) => node.parentId === parentId);
}

describe("layoutUnplaced", () => {
  test("is a no-op (same object) when every node is authored", () => {
    const doc = parsePyblocksScene(fixture(LINEAR));
    const authored: HostScene = {
      nodes: doc.scene.nodes.map((node) => ({ ...node, data: { ...node.data, pyblocks: { ...node.data.pyblocks, authoredPosition: true } } })),
      edges: doc.scene.edges,
    };
    expect(layoutUnplaced(authored)).toBe(authored);
  });

  test("places unplaced siblings left-to-right by rank and never overlaps two siblings", () => {
    for (const name of [LINEAR, REGION]) {
      const doc = parsePyblocksScene(fixture(name));
      const laid = layoutUnplaced(doc.scene as HostScene);
      const scopes = new Set(laid.nodes.map((node) => node.parentId));
      for (const parentId of scopes) {
        const siblings = siblingsOf(laid, parentId);
        const ids = new Set(siblings.map((node) => node.id));
        const local = { nodes: siblings, edges: laid.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
        const ranks = rank(local);
        for (const edge of local.edges) {
          const a = siblings.find((node) => node.id === edge.source)!;
          const b = siblings.find((node) => node.id === edge.target)!;
          if (ranks.has(a.id) && ranks.has(b.id) && ranks.get(a.id)! < ranks.get(b.id)!) {
            expect(a.position.x).toBeLessThan(b.position.x);
          }
        }
        const seen = new Set<string>();
        for (const node of siblings) {
          const key = `${node.position.x},${node.position.y}`;
          expect(seen.has(key), `two siblings at ${key} under ${parentId ?? "top"}`).toBe(false);
          seen.add(key);
          expect(Number.isFinite(node.position.x) && node.position.x >= 0).toBe(true);
          expect(Number.isFinite(node.position.y) && node.position.y >= 0).toBe(true);
        }
      }
    }
  });

  test("leaves authored positions byte-identical and lays out only the unplaced", () => {
    const doc = parsePyblocksScene(fixture(LINEAR));
    const laid = layoutUnplaced(doc.scene as HostScene);
    const byId = new Map(laid.nodes.map((node) => [node.id, node]));
    expect(byId.get(DECODE)!.position).toEqual({ x: 40, y: 80 });
    expect(byId.get(SCALE)!.position).toEqual({ x: 360, y: 80 });
    // The literal feeds scale and sat at the origin; now it has a real place
    // that is not on top of decode.
    expect(byId.get(LITERAL)!.position).not.toEqual({ x: 0, y: 0 });
    expect(byId.get(LITERAL)!.position).not.toEqual(byId.get(DECODE)!.position);
    // Same input, same output — determinism is a contract, not a hope.
    expect(JSON.stringify(layoutUnplaced(doc.scene as HostScene))).toBe(JSON.stringify(laid));
  });
});

/* ------------------------------------------------------------------ */
/* load — the one call an app makes                                     */
/* ------------------------------------------------------------------ */

describe("loadPyblocksScene", () => {
  test("returns a laid-out HostScene with no control edge in it and the document beside it", () => {
    const loaded = loadPyblocksScene(fixture(REGION));
    expect(loaded.document.controlEdges).toHaveLength(2);
    expect(loaded.scene.edges.map((edge) => edge.id)).not.toContain("y-bins-fallback");
    expect(loaded.scene.edges).toHaveLength(17);
    expect(loaded.scene.nodes).toHaveLength(11);
    expect(loaded.problems).toEqual([]);
    for (const node of loaded.scene.nodes) {
      const pyblocks = (node.data as { pyblocks?: { authoredPosition?: boolean } }).pyblocks;
      if (pyblocks?.authoredPosition === false) {
        // Every unplaced node was placed — except a lone first sibling, which
        // legitimately lands at the layout origin (40, 40), never (0, 0).
        expect(node.position).not.toEqual({ x: 0, y: 0 });
      }
    }
  });
});
