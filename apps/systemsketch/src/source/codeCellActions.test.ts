// src/source/codeCellActions.test.ts — lane scv:scv-origin-on-app-shape's
// own acceptance for the two menu rows' PURE half, committed before the
// implementation existed and not weakened afterwards.
//
// The subject is the app's `DocumentScene` (src/document/sceneFromStore.ts),
// not a hand-shaped `BlockScene`: the whole point of this seam is that the
// trunk's audited `collapseToCode`/`expandCode` run on the projection the
// app actually derives, and that `applyScene` can write the result back.
// Anything a test proves against a different scene shape proves nothing
// about the menu.
import { describe, expect, it } from "vitest";

import { codeCellHeader } from "@trunk/scene/codeCell";

import type { DocNodeData, DocumentScene } from "../document/sceneFromStore";
import { CONVERT_CROSSING_CABLES, isAppCodeCell, planConvertToCode, planExpandCode } from "./codeCellActions";

function node(id: string, data: Partial<DocNodeData> & { kind: DocNodeData["kind"] }, over: { parentId?: string; x?: number; y?: number } = {}) {
  return {
    id,
    type: data.kind,
    position: { x: over.x ?? 0, y: over.y ?? 0 },
    data: { name: "", ...data } as DocNodeData,
    ...(over.parentId ? { parentId: over.parentId } : {}),
  };
}

/** Two loose blocks, no cables — the shape the smoke drives. */
function twoBlocks(): DocumentScene {
  return {
    nodes: [
      node("shape:a", { kind: "block", name: "A", ports: { left: [], right: [], top: [], bottom: [] } }, { x: 100, y: 100 }),
      node("shape:b", { kind: "block", name: "B", ports: { left: [], right: [], top: [], bottom: [] } }, { x: 300, y: 140 }),
    ],
    edges: [],
  };
}

function counter() {
  let n = 0;
  return () => `shape:minted${++n}`;
}

describe("planConvertToCode — one code cell, the members kept underneath it", () => {
  it("mints ONE node of kind `code` and re-parents every selected root under it", () => {
    const plan = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const cell = plan.scene.nodes.find((one) => one.id === plan.cellId)!;
    expect(cell.data.kind).toBe("code");
    expect(plan.scene.nodes.filter((one) => one.data.kind === "code")).toHaveLength(1);
    expect(plan.scene.nodes.find((one) => one.id === "shape:a")!.parentId).toBe(plan.cellId);
    expect(plan.scene.nodes.find((one) => one.id === "shape:b")!.parentId).toBe(plan.cellId);
    // Nothing is deleted — expand is what puts them back, and it can only do
    // that because they never left.
    expect(plan.scene.nodes).toHaveLength(3);
  });

  it("the cell's `code` IS the trunk's deterministic header, naming the selection roots in order", () => {
    const plan = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!plan.ok) throw new Error("expected ok");
    const cell = plan.scene.nodes.find((one) => one.id === plan.cellId)!;
    expect(cell.data.code).toBe(codeCellHeader(["A", "B"]));
    expect(cell.data.language).toBe("plaintext");
  });

  it("the cell sits at the min corner of its members, which become local to it", () => {
    const plan = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!plan.ok) throw new Error("expected ok");
    const cell = plan.scene.nodes.find((one) => one.id === plan.cellId)!;
    expect(cell.position).toEqual({ x: 100, y: 100 });
    expect(plan.scene.nodes.find((one) => one.id === "shape:b")!.position).toEqual({ x: 200, y: 40 });
  });

  it("an empty selection refuses rather than minting an empty cell", () => {
    const plan = planConvertToCode(twoBlocks(), [], counter());
    expect(plan.ok).toBe(false);
  });

  it("REFUSES a selection a cable crosses, naming the reason — an ss-code shape cannot carry a port", () => {
    const scene = twoBlocks();
    scene.nodes.push(node("shape:c", { kind: "block", name: "C", ports: { left: [], right: ["out"], top: [], bottom: [] } }, { x: 600, y: 100 }));
    scene.nodes[0] = node("shape:a", { kind: "block", name: "A", ports: { left: ["in"], right: [], top: [], bottom: [] } }, { x: 100, y: 100 });
    scene.edges.push({ id: "shape:w1", source: "shape:c", sourceHandle: "out", target: "shape:a", targetHandle: "in", data: { variant: "data", routing: "elbow" } });

    const plan = planConvertToCode(scene, ["shape:a", "shape:b"], counter());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe(CONVERT_CROSSING_CABLES);
    expect(plan.reason).toMatch(/cable/i);
  });
});

describe("isAppCodeCell — what `Expand to blocks` is offered on", () => {
  it("is true for a node of kind code, false for a block and for an id that is not in the scene", () => {
    const plan = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!plan.ok) throw new Error("expected ok");
    expect(isAppCodeCell(plan.scene, plan.cellId)).toBe(true);
    expect(isAppCodeCell(plan.scene, "shape:a")).toBe(false);
    expect(isAppCodeCell(plan.scene, "shape:nope")).toBe(false);
  });
});

describe("planExpandCode — the inverse, and what it says it is discarding", () => {
  it("round-trips: the members come back to the top level, the cell is gone", () => {
    const converted = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!converted.ok) throw new Error("expected ok");
    const expanded = planExpandCode(converted.scene, converted.cellId);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    expect(expanded.scene.nodes.find((one) => one.id === converted.cellId)).toBeUndefined();
    expect(expanded.scene.nodes.find((one) => one.id === "shape:a")!.parentId).toBeUndefined();
    expect(expanded.scene.nodes.find((one) => one.id === "shape:b")!.parentId).toBeUndefined();
  });

  it("an UNTOUCHED header reports textWasEdited false — nothing to warn about", () => {
    const converted = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!converted.ok) throw new Error("expected ok");
    const expanded = planExpandCode(converted.scene, converted.cellId);
    if (!expanded.ok) throw new Error("expected ok");
    expect(expanded.discardedText).toBe(codeCellHeader(["A", "B"]));
    expect(expanded.textWasEdited).toBe(false);
  });

  it("text somebody TYPED reports textWasEdited true, and hands the text back", () => {
    const converted = planConvertToCode(twoBlocks(), ["shape:a", "shape:b"], counter());
    if (!converted.ok) throw new Error("expected ok");
    const edited: DocumentScene = {
      ...converted.scene,
      nodes: converted.scene.nodes.map((one) =>
        one.id === converted.cellId ? { ...one, data: { ...one.data, code: "gain = clamp(x, 0, 1)\n" } } : one,
      ),
    };
    const expanded = planExpandCode(edited, converted.cellId);
    if (!expanded.ok) throw new Error("expected ok");
    expect(expanded.discardedText).toBe("gain = clamp(x, 0, 1)\n");
    expect(expanded.textWasEdited).toBe(true);
  });

  it("an id that is not a code cell refuses rather than dissolving something else", () => {
    const expanded = planExpandCode(twoBlocks(), "shape:a");
    expect(expanded.ok).toBe(false);
  });
});
