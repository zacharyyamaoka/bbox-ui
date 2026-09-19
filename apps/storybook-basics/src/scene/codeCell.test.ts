// src/scene/codeCell.test.ts — ACCEPTANCE for lane `scv-rung-a-scene`
// (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §4, Rung A). Committed BEFORE the
// lane exists and OFF-LIMITS to its builder: these assertions define done.
//
// The load-bearing claim is collapse.test.ts's, one level up: collapse to a
// CODE CELL then expand is the identity on the scene, and the cell's text
// is annotation that never touches the blocks.

import { describe, expect, it } from "vitest";

import { CODE_CELL_LANGUAGE_PLAINTEXT, codeCellHeader, collapseToCode, expandCode, isCodeCell, type CodeCellData } from "./codeCell";
import { collapseToRegion, EMPTY_SELECTION } from "./collapse";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import { isRegion, REGION_NODE_TYPE } from "./region";
import type { BlockScene, SceneNode } from "./scene";

/* Same fixture as collapse.test.ts — every edge class present at once. */
function fixture(): BlockScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 100 }, data: { name: "Source" } },
      { id: "a", position: { x: 200, y: 40 }, data: { name: "A" } },
      { id: "b", position: { x: 340, y: 120 }, data: { name: "B" } },
      { id: "c", position: { x: 300, y: 260 }, data: { name: "C" } },
      { id: "sink", position: { x: 600, y: 120 }, data: { name: "Sink" } },
      { id: "other", position: { x: 0, y: 600 }, data: { name: "Other" } },
      { id: "other2", position: { x: 200, y: 600 }, data: { name: "Other2" } },
    ],
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in", data: { colour: "teal" } },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

const SELECTION = ["a", "b", "c"];
const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);
const typeOf: PortTypeOf = ({ portId }) => (portId === "out" || portId === "in" ? ["pose"] : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

function cellOf(scene: BlockScene, id: string): SceneNode<CodeCellData> {
  const node = scene.nodes.find((candidate) => candidate.id === id);
  if (!node || !isCodeCell(node)) throw new Error(`${id} is not a code cell`);
  return node;
}

describe("codeCellHeader — deterministic, exact", () => {
  it("names the members in order, singular/plural, two lines, trailing newline", () => {
    expect(codeCellHeader(["A", "B", "C"])).toBe(
      "# code cell — 3 blocks: A, B, C\n# annotation only until a backend is connected; expand restores the blocks\n",
    );
    expect(codeCellHeader(["A"])).toBe("# code cell — 1 block: A\n# annotation only until a backend is connected; expand restores the blocks\n");
    expect(codeCellHeader([])).toBe("# code cell — 0 blocks\n# annotation only until a backend is connected; expand restores the blocks\n");
  });
});

describe("collapseToCode → expandCode is the identity", () => {
  it("restores the scene EXACTLY — ids, ends, data, order and positions", () => {
    const before = fixture();
    const collapsed = collapseToCode(before, SELECTION, { mintId: counter("m"), directionOf, typeOf });
    expect(collapsed.ok).toBe(true);
    if (!collapsed.ok) return;
    const after = expandCode(collapsed.scene, collapsed.regionId);
    expect(after.scene).toEqual(before);
    expect(before).toEqual(fixture());
    expect(after.discardedText).toBe(codeCellHeader(["A", "B", "C"]));
    expect(after.textWasEdited).toBe(false);
  });

  it("the text is annotation: editing it changes nothing about the blocks, and expand reports the edit", () => {
    const before = fixture();
    const collapsed = collapseToCode(before, SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const cell = cellOf(collapsed.scene, collapsed.regionId);
    const edited: BlockScene = {
      ...collapsed.scene,
      nodes: collapsed.scene.nodes.map((node) =>
        node.id === cell.id ? { ...node, data: { ...node.data, codeCell: { ...cell.data.codeCell, source: "x = 1\n" } } } : node,
      ),
    };
    const after = expandCode(edited, collapsed.regionId);
    expect(after.scene).toEqual(before);
    expect(after.discardedText).toBe("x = 1\n");
    expect(after.textWasEdited).toBe(true);
  });

  it("survives a SECOND round trip unchanged", () => {
    const before = fixture();
    const once = collapseToCode(before, SELECTION, { mintId: counter("m"), directionOf });
    if (!once.ok) throw new Error("collapse refused");
    const back = expandCode(once.scene, once.regionId).scene;
    const twice = collapseToCode(back, SELECTION, { mintId: counter("n"), directionOf });
    if (!twice.ok) throw new Error("second collapse refused");
    expect(expandCode(twice.scene, twice.regionId).scene).toEqual(before);
  });
});

describe("what collapseToCode produced", () => {
  it("mints a REGION wearing a code face — same node kind, one extra fact on data", () => {
    const collapsed = collapseToCode(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const cell = cellOf(collapsed.scene, collapsed.regionId);
    expect(cell.type).toBe(REGION_NODE_TYPE);
    expect(isRegion(cell)).toBe(true);
    expect(isCodeCell(cell)).toBe(true);
    // "100% region is isolated" — a cell is a region, so never a definitionId.
    expect(cell.definitionId).toBeUndefined();
    expect(cell.data.codeCell).toEqual({
      language: CODE_CELL_LANGUAGE_PLAINTEXT,
      source: codeCellHeader(["A", "B", "C"]),
      origin: null,
    });
    // The children are re-parented under the cell — the single truth for expand.
    for (const id of SELECTION) {
      expect(collapsed.scene.nodes.find((node) => node.id === id)!.parentId).toBe(cell.id);
    }
  });

  it("is collapseToRegion byte for byte on everything but the face: same ports, conflicts, hidden, ids", () => {
    const viaCode = collapseToCode(fixture(), SELECTION, { mintId: counter("m"), directionOf, typeOf });
    const viaRegion = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!viaCode.ok || !viaRegion.ok) throw new Error("collapse refused");
    expect(viaCode.regionId).toBe(viaRegion.regionId);
    expect(viaCode.ports).toEqual(viaRegion.ports);
    expect(viaCode.conflicts).toEqual(viaRegion.conflicts);
    expect(viaCode.hidden).toBe(viaRegion.hidden);
    expect(viaCode.scene.edges).toEqual(viaRegion.scene.edges);
    // Every node identical except the region's `data`, which gained `codeCell`.
    const strip = (scene: BlockScene) => scene.nodes.map((node) => (node.id === viaCode.regionId ? { ...node, data: {} } : node));
    expect(strip(viaCode.scene)).toEqual(strip(viaRegion.scene));
  });

  it("keeps caller regionData beside the face, honours `language` and `nameOf`", () => {
    const collapsed = collapseToCode(fixture(), SELECTION, {
      mintId: counter("m"),
      directionOf,
      regionData: { name: "cell", w: 300 },
      language: "python",
      nameOf: (node) => `${node.id}!`,
    });
    if (!collapsed.ok) throw new Error("collapse refused");
    const cell = cellOf(collapsed.scene, collapsed.regionId);
    expect(cell.data.name).toBe("cell");
    expect(cell.data.w).toBe(300);
    expect(cell.data.codeCell.language).toBe("python");
    expect(cell.data.codeCell.source).toBe(codeCellHeader(["a!", "b!", "c!"]));
  });

  it("names only the selection ROOTS, in scene order — nested members ride along unnamed", () => {
    const before = fixture();
    before.nodes = before.nodes.map((node) => (node.id === "c" ? { ...node, parentId: "b", position: { x: 20, y: 30 } } : node));
    const collapsed = collapseToCode(before, ["a", "b"], { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    expect(cellOf(collapsed.scene, collapsed.regionId).data.codeCell.source).toBe(codeCellHeader(["A", "B"]));
    expect(expandCode(collapsed.scene, collapsed.regionId).scene).toEqual(before);
  });

  it("falls back to the node id when data.name is not a string", () => {
    const before = fixture();
    before.nodes = before.nodes.map((node) => (node.id === "a" ? { ...node, data: {} } : node));
    const collapsed = collapseToCode(before, SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    expect(cellOf(collapsed.scene, collapsed.regionId).data.codeCell.source).toBe(codeCellHeader(["a", "B", "C"]));
  });

  it("passes collapseToRegion's refusals through untouched", () => {
    const refused = collapseToCode(fixture(), ["nope"], { mintId: counter("m") });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.code).toBe(EMPTY_SELECTION);
  });
});

describe("expandCode is total and referentially honest", () => {
  it("unknown id → the SAME scene object, null text, not edited", () => {
    const scene = fixture();
    const result = expandCode(scene, "ghost");
    expect(result.scene).toBe(scene);
    expect(result.discardedText).toBeNull();
    expect(result.textWasEdited).toBe(false);
  });

  it("a plain region (no code face) still dissolves, reporting null text", () => {
    const before = fixture();
    const collapsed = collapseToRegion(before, SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const result = expandCode(collapsed.scene, collapsed.regionId);
    expect(result.scene).toEqual(before);
    expect(result.discardedText).toBeNull();
    expect(result.textWasEdited).toBe(false);
  });
});

describe("isCodeCell", () => {
  it("is a total predicate: block, plain region, cell", () => {
    expect(isCodeCell({ id: "x", position: { x: 0, y: 0 }, data: {} })).toBe(false);
    expect(isCodeCell({ id: "r", type: REGION_NODE_TYPE, position: { x: 0, y: 0 }, data: {} })).toBe(false);
    expect(
      isCodeCell({
        id: "c",
        type: REGION_NODE_TYPE,
        position: { x: 0, y: 0 },
        data: { codeCell: { language: "plaintext", source: "", origin: null } },
      }),
    ).toBe(true);
    // A block-typed node carrying the payload is NOT a cell — a cell is a region.
    expect(isCodeCell({ id: "b", position: { x: 0, y: 0 }, data: { codeCell: { language: "plaintext", source: "", origin: null } } })).toBe(false);
  });
});
