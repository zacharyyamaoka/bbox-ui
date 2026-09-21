// src/blockPlacement.smoke.test.tsx — P-045 in REAL HEADLESS CHROMIUM: arm the
// Block tool the way a person does and place blocks with real pointer input,
// then read back which view each gesture produced.
//
// The pure grammar has its own node test (src/shapes/block/blockPlacement.test.ts).
// This file is the half that can actually fail for integration reasons: that
// the click path has a hook at all, that `onCreate` sees the drawn box before
// the hug measurement rewrites it, and that a drag hands the editor back to
// `select` instead of parking it in `select.resizing`.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, BLOCK_TOOL_ID } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/** Arm the Block tool the way the dock does — its own `b`, asserted armed. */
async function armBlockTool() {
  await userEvent.keyboard("b");
  await waitFor(() => app!.editor.getCurrentToolId() === BLOCK_TOOL_ID, { what: "the Block tool armed by B" });
}

function blocksNow(): Set<TLShapeId> {
  return new Set(app!.editor.getCurrentPageShapes().filter((s) => s.type === BLOCK_SHAPE_TYPE).map((s) => s.id));
}

async function newBlockSince(before: Set<TLShapeId>): Promise<BlockShape> {
  return waitFor(() => app!.editor.getCurrentPageShapes().find((s) => s.type === BLOCK_SHAPE_TYPE && !before.has(s.id)) as BlockShape | undefined, {
    what: "a newly placed ss-block",
  });
}

/** Click once on the canvas with the Block tool armed. */
async function placeByClick(at: { x: number; y: number }): Promise<BlockShape> {
  const before = blocksNow();
  await armBlockTool();
  await userEvent.click(canvasOf(app!.root), { position: at });
  return newBlockSince(before);
}

/** Draw a box of exactly `w` x `h` starting at `at`, with the Block tool armed. */
async function placeByDrag(at: { x: number; y: number }, w: number, h: number): Promise<BlockShape> {
  const before = blocksNow();
  await armBlockTool();
  const canvas = canvasOf(app!.root);
  await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: at, targetPosition: { x: at.x + w, y: at.y + h } });
  return newBlockSince(before);
}

/** A fixture block on the board, rendered, so its real box can be measured. */
async function putBlock(name: string, at: { x: number; y: number }): Promise<TLShapeId> {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x: at.x, y: at.y, props: { name, view: "simple", w: 60, h: 40 } });
  await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"]`), { what: `the ${name} block rendered` });
  return id;
}

/** A shape's MEASURED on-screen box, canvas-relative. */
async function canvasBoxOf(id: TLShapeId): Promise<{ x: number; y: number; w: number; h: number }> {
  const el = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"]`), { what: "the fixture block" });
  const shape = el.getBoundingClientRect();
  const canvas = canvasOf(app!.root).getBoundingClientRect();
  return { x: Math.round(shape.left - canvas.left), y: Math.round(shape.top - canvas.top), w: Math.round(shape.width), h: Math.round(shape.height) };
}

/** A canvas-relative box `pad` px outside `id`'s MEASURED on-screen box. */
async function ringAround(id: TLShapeId, pad: number): Promise<{ x: number; y: number; w: number; h: number }> {
  const at = await canvasBoxOf(id);
  return { x: at.x - pad, y: at.y - pad, w: at.w + pad * 2, h: at.h + pad * 2 };
}

/** `placeByDrag` taking a box. */
async function placeByDragBox(box: { x: number; y: number; w: number; h: number }): Promise<BlockShape> {
  return placeByDrag({ x: box.x, y: box.y }, box.w, box.h);
}

/** The view the shape SETTLED on — the hug measurement lands a frame later. */
async function settledView(shape: BlockShape): Promise<string> {
  await waitFor(() => app!.editor.getShape(shape.id), { what: "the block still on the page" });
  return (app!.editor.getShape(shape.id) as BlockShape).props.view;
}

describe("P-045 — drag-to-create picks the Block's view", () => {
  it("a click places a SIMPLE block (Zach's first sentence), and the tool hands back to select", async () => {
    app = await mountApp();
    const block = await placeByClick({ x: 300, y: 300 });
    expect(await settledView(block)).toBe("simple");
    await waitFor(() => app!.editor.getCurrentToolId() === "select", { what: "back to select after a click" });
  });

  it("a tiny drag is SIMPLE, and nothing clamps it to a minimum size", async () => {
    app = await mountApp();
    const block = await placeByDrag({ x: 200, y: 200 }, 48, 30);
    expect(await settledView(block)).toBe("simple");
    // Zach: "There should be no minium size to the block... I should be able
    // to draw it as small as I want." The drawn WIDTH is the shape's width —
    // the simple face only hugs its height.
    expect((app.editor.getShape(block.id) as BlockShape).props.w).toBeLessThan(160);
  });

  it("a block-sized drag is PORT", async () => {
    app = await mountApp();
    const block = await placeByDrag({ x: 200, y: 200 }, 220, 140);
    expect(await settledView(block)).toBe("port");
    await waitFor(() => app!.editor.getCurrentToolId() === "select", { what: "back to select after a drag" });
  });

  it("a really big drag is EXPANDED, around empty canvas, and keeps the box that was drawn", async () => {
    app = await mountApp();
    const block = await placeByDrag({ x: 150, y: 150 }, 420, 320);
    expect(await settledView(block)).toBe("expanded");
    const live = app.editor.getShape(block.id) as BlockShape;
    expect(Math.round(live.props.w)).toBeGreaterThanOrEqual(400);
    expect(Math.round(live.props.h)).toBeGreaterThanOrEqual(300);
  });

  it("a SMALL drag drawn around an existing block is EXPANDED and adopts it — enclosure wins at any size", async () => {
    app = await mountApp();
    const victim = await putBlock("inner", { x: 300, y: 300 });
    // MEASURED, not assumed: the victim HUGS (`measure.ts` writes its rendered
    // box back into props), so the box to draw around it is derived from where
    // it actually landed on screen rather than from the numbers it was created
    // with. `RING_PX` of clearance on every side.
    const box = await ringAround(victim, 24);
    expect(box.w, "the drawn box must stay UNDER the expanded rung, or size alone would explain the answer").toBeLessThan(320);
    expect(box.h).toBeLessThan(240);

    const block = await placeByDragBox(box);
    expect(await settledView(block)).toBe("expanded");
    await waitFor(() => app!.editor.getShape(victim)!.parentId === block.id, { what: "the inner block adopted by the new frame" });
    // Adoption is what keeps it VISIBLE: children paint above their parent, so
    // an expanded block that did NOT adopt would simply paint over it.
    const inner = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${victim}"]`), { what: "the inner block still in the DOM" });
    expect(inner.getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it("a box that only CLIPS a block does not enclose it: no adoption, and the size ladder decides alone", async () => {
    app = await mountApp();
    const neighbour = await putBlock("neighbour", { x: 420, y: 300 });
    const at = await canvasBoxOf(neighbour);
    // Overlaps the neighbour's left half and stops INSIDE it: vertically it
    // covers the block completely, horizontally it cuts through — and
    // `bounds.contains` needs both, which is the distinction being asserted.
    const clipping = { x: at.x - 140, y: at.y - 30, w: 140 + Math.floor(at.w / 2), h: at.h + 70 };
    const right = clipping.x + clipping.w;
    expect(right, "the drawn box must reach INTO the neighbour").toBeGreaterThan(at.x);
    expect(right, "...and stop short of its far edge").toBeLessThan(at.x + at.w);
    // Big enough that the ladder alone answers `port`, so an `expanded` here
    // could only have come from a false enclosure.
    expect(clipping.w).toBeGreaterThanOrEqual(160);
    expect(clipping.h).toBeGreaterThanOrEqual(100);
    expect(clipping.w).toBeLessThan(320);

    const block = await placeByDragBox(clipping);
    expect(await settledView(block)).toBe("port");
    expect(app.editor.getShape(neighbour)!.parentId).toBe(app.editor.getCurrentPageId());
  });
});
