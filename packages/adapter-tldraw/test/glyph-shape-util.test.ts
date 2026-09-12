/**
 * Pure helpers behind `BBoxGlyphShapeUtil` — the size cascade and the
 * resize handler's core, exercised without any tldraw Editor at all, plus
 * the picker's open/close atom (which does need a real headless Editor,
 * since it is keyed by one).
 */
import { describe, expect, it } from "vitest";

import { createShapeId } from "tldraw";

import {
  BBoxGlyphShapeUtil,
  glyphShapeFootprint,
  isGlyphPickerOpen,
  resizeGlyphProps,
  setGlyphPickerOpen,
  type BBoxGlyphShape,
  type BBoxGlyphShapeProps,
} from "../src/glyph-shape-util";
import { createHeadlessEditor } from "./headlessEditor";

function glyphProps(overrides: Partial<BBoxGlyphShapeProps> = {}): BBoxGlyphShapeProps {
  return { w: 18, h: 18, content: "", sizePreset: "sm", size: null, padding: 0, ...overrides };
}

describe("glyphShapeFootprint", () => {
  it("resolves from the preset when size is null (the persisted 'no override' spelling)", () => {
    expect(glyphShapeFootprint(glyphProps({ sizePreset: "lg" }))).toEqual({
      size: 36,
      padding: 0,
      w: 36,
      h: 36,
    });
  });

  it("an explicit size overrides the preset", () => {
    expect(glyphShapeFootprint(glyphProps({ sizePreset: "sm", size: 52 }))).toEqual({
      size: 52,
      padding: 0,
      w: 52,
      h: 52,
    });
  });

  it("size: 0 is a real override, not treated as absent", () => {
    // The same rule glyph.layout.ts's glyphFootprint documents: `!== undefined`,
    // never `??`/truthiness — an explicit 0 must not fall back to the preset.
    expect(glyphShapeFootprint(glyphProps({ sizePreset: "xl", size: 0 })).size).toBe(0);
  });

  it("padding grows the outer box without changing the inner size", () => {
    const footprint = glyphShapeFootprint(glyphProps({ sizePreset: "md", padding: 6 }));
    expect(footprint).toEqual({ size: 24, padding: 6, w: 36, h: 36 });
  });
});

describe("resizeGlyphProps", () => {
  it("a plain drag to w=h becomes that size, minus padding", () => {
    expect(resizeGlyphProps({ padding: 0 }, 52, 52)).toEqual({ w: 52, h: 52, size: 52 });
  });

  it("takes the SMALLER of w/h, so a shrink always shrinks", () => {
    // A corner drag that (from resize-math rounding) hands back slightly
    // unequal w/h must not let the larger axis win — that would let one
    // corner's shrink grow the glyph on the other axis's account.
    expect(resizeGlyphProps({ padding: 0 }, 40, 44).size).toBe(40);
    expect(resizeGlyphProps({ padding: 0 }, 44, 40).size).toBe(40);
  });

  it("subtracts padding from the dragged box to get the inner size override", () => {
    expect(resizeGlyphProps({ padding: 8 }, 60, 60)).toEqual({ w: 60, h: 60, size: 44 });
  });

  it("floors at 8px (the validator's own minimum), never goes negative or zero", () => {
    expect(resizeGlyphProps({ padding: 20 }, 10, 10).size).toBe(8);
  });

  it("caps at 512px (docs/GLYPH-PLAN.md's contract table maximum)", () => {
    expect(resizeGlyphProps({ padding: 0 }, 5000, 5000).size).toBe(512);
  });

  it("rounds to a whole pixel", () => {
    expect(resizeGlyphProps({ padding: 0 }, 33.4, 33.6).size).toBe(33);
  });
});

describe("BBoxGlyphShapeUtil defaults and geometry", () => {
  it("defaults to sizePreset sm, size null, padding 0, w=h=18 (D1)", () => {
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    expect(util.getDefaultProps()).toEqual({
      w: 18,
      h: 18,
      content: "",
      sizePreset: "sm",
      size: null,
      padding: 0,
    });
    editor.dispose();
  });

  it("locks the aspect ratio and allows resize", () => {
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    const shape = { props: glyphProps() } as unknown as BBoxGlyphShape;
    expect(util.isAspectRatioLocked(shape)).toBe(true);
    expect(util.canResize(shape)).toBe(true);
    editor.dispose();
  });
});

describe("BBoxGlyphShapeUtil keeps w/h synced to the size cascade for EVERY writer", () => {
  // onResize is not the only path that changes sizePreset/size/padding —
  // the inspector's own preset selector and number box (plan phase 5)
  // write those fields directly, with no drag involved. onBeforeCreate /
  // onBeforeUpdate are the seam that keeps `w`/`h` honest for those too;
  // without it the shape's geometry (built from `props.w/h`) disagrees
  // with what the resolved footprint — and the `Glyph` inside — actually
  // paint.
  it("normalizes w/h at creation even when the caller hands it a stale pair", () => {
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({
      id,
      type: "bbox-glyph",
      x: 0,
      y: 0,
      props: glyphProps({ sizePreset: "xl", w: 18, h: 18 }),
    });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    expect(shape.props.w).toBe(44);
    expect(shape.props.h).toBe(44);
    editor.dispose();
  });

  it("re-syncs w/h when sizePreset changes on an existing shape — the inspector's own write path", () => {
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    editor.updateShape({ id, type: "bbox-glyph", props: { sizePreset: "xl" } });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    expect(shape.props.w).toBe(44);
    expect(shape.props.h).toBe(44);
    editor.dispose();
  });

  it("re-syncs w/h when an explicit `size` override is written directly", () => {
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    editor.updateShape({ id, type: "bbox-glyph", props: { size: 52 } });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    expect(shape.props.w).toBe(52);
    expect(shape.props.h).toBe(52);
    editor.dispose();
  });

  it("clearing a size override (back to null) snaps w/h back to the preset's footprint", () => {
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({
      id,
      type: "bbox-glyph",
      x: 0,
      y: 0,
      props: glyphProps({ sizePreset: "sm", size: 52 }),
    });
    editor.updateShape({ id, type: "bbox-glyph", props: { size: null } });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    expect(shape.props.w).toBe(18);
    expect(shape.props.h).toBe(18);
    editor.dispose();
  });

  it("leaves w/h untouched when an unrelated prop (content) changes", () => {
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    editor.updateShape({ id, type: "bbox-glyph", props: { content: "lucide:rocket" } });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    expect(shape.props.w).toBe(18);
    expect(shape.props.h).toBe(18);
    editor.dispose();
  });
});

describe("glyph picker open/close atom", () => {
  it("opens exactly the shape asked for, and only that one", () => {
    const editor = createHeadlessEditor();
    const a = createShapeId();
    const b = createShapeId();
    expect(isGlyphPickerOpen(editor, a)).toBe(false);
    setGlyphPickerOpen(editor, a, true);
    expect(isGlyphPickerOpen(editor, a)).toBe(true);
    expect(isGlyphPickerOpen(editor, b)).toBe(false);
    // Opening b closes a — one picker open at a time, Notion's own rule.
    setGlyphPickerOpen(editor, b, true);
    expect(isGlyphPickerOpen(editor, a)).toBe(false);
    expect(isGlyphPickerOpen(editor, b)).toBe(true);
    editor.dispose();
  });

  it("a close call only clears the shape it names, never a different one that opened since", () => {
    const editor = createHeadlessEditor();
    const a = createShapeId();
    const b = createShapeId();
    setGlyphPickerOpen(editor, a, true);
    setGlyphPickerOpen(editor, b, true); // b is now the open one
    setGlyphPickerOpen(editor, a, false); // a stale "close a" from a's own trigger
    expect(isGlyphPickerOpen(editor, b)).toBe(true);
    editor.dispose();
  });
});
