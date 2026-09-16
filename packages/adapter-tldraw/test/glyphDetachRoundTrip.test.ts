/**
 * The detach → rebuild acceptance matrix for the standalone Glyph, the
 * same shape `detachRoundTrip.test.ts` already runs for Port and Block —
 * kept in its own file per this lane's `test/glyph*.test.ts` naming
 * rather than appended to a file outside this lane's edit list.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createShapeId } from "tldraw";
import type { Editor, TLShapeId } from "tldraw";

import { BBOX_UI_META_KEY, DETACHABLE_KINDS, rebuildDetachedShapes, runDetachSweep } from "../src/index";
import { glyphShapeFootprint, type BBoxGlyphShapeProps } from "../src/glyph-shape-util";
import { createHeadlessEditor } from "./headlessEditor";

// WHY w/h are DERIVED from `glyphShapeFootprint`, never hand-typed: the
// live shape util enforces "w/h always equal the footprint of the
// resolved size" (docs/GLYPH-PLAN.md) on every create/update via
// `onBeforeCreate`/`onBeforeUpdate`, so a fixture that hardcoded a stale
// pair (this file used to pin w:18,h:18 under every sizePreset override)
// would get silently corrected by the editor and could never catch a
// regression in that enforcement — see glyph-shape-util.test.ts's own
// invariant tests for the direct coverage.
function glyphProps(
  overrides: Partial<Omit<BBoxGlyphShapeProps, "w" | "h">> = {},
): BBoxGlyphShapeProps {
  const cascade = { sizePreset: "sm" as const, size: null, padding: 0, ...overrides };
  const footprint = glyphShapeFootprint(cascade);
  return { w: footprint.w, h: footprint.h, content: "lucide:rocket", ...cascade };
}

let editor: Editor;

beforeEach(() => {
  editor = createHeadlessEditor();
});

afterEach(() => {
  editor.dispose();
});

function roundTrip(props: BBoxGlyphShapeProps, options: { rotateBy?: number } = {}) {
  const id = createShapeId();
  editor.createShape({ id, type: "bbox-glyph", x: 160, y: 140, props });
  if (options.rotateBy) editor.rotateShapesBy([id], options.rotateBy);
  const original = editor.getShape(id)!;

  runDetachSweep(editor, [id], DETACHABLE_KINDS);
  expect(editor.getShape(id)).toBeUndefined();
  const remaining = editor.getCurrentPageShapes();
  expect(remaining.some((shape) => shape.type.startsWith("bbox-"))).toBe(false);
  // A Glyph always lowers to exactly one primitive — tldraw refuses to
  // group a single shape, so the box itself is the carrier.
  expect(remaining).toHaveLength(1);
  const carrier = remaining[0];
  expect((carrier.meta as any)[BBOX_UI_META_KEY].props).toEqual(original.props);
  expect(carrier.type).toBe("geo");
  expect((carrier.props as any).geo).toBe("x-box");

  const { createdIds } = rebuildDetachedShapes(editor);
  expect(createdIds).toHaveLength(1);
  const rebuilt = editor.getShape(createdIds[0])!;
  expect(rebuilt.type).toBe("bbox-glyph");
  return { original, rebuilt, carrierId: carrier.id as TLShapeId };
}

function expectSamePose(
  original: { x: number; y: number; rotation: number },
  rebuilt: { x: number; y: number; rotation: number },
) {
  expect(rebuilt.x).toBeCloseTo(original.x, 6);
  expect(rebuilt.y).toBeCloseTo(original.y, 6);
  expect(rebuilt.rotation).toBeCloseTo(original.rotation, 6);
}

describe("detach → rebuild: standalone glyph", () => {
  it("round-trips a lucide glyph at its default size", () => {
    const { original, rebuilt } = roundTrip(glyphProps());
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("round-trips an emoji glyph with padding", () => {
    const { original, rebuilt } = roundTrip(
      glyphProps({ content: "emoji:🚀", sizePreset: "lg", padding: 8 }),
    );
    expect(rebuilt.props).toEqual(original.props);
    // WHY this assertion matters here specifically: the sole primitive is
    // planted at the glyph's INNER origin (origin + padding, see
    // glyphPrimitives.ts), so a rebuild that forgot to undo that offset
    // would still pass every `props` check above while quietly walking the
    // shape `padding` px from where it started.
    expectSamePose(original, rebuilt);
  });

  it("round-trips a padded, rotated glyph without drifting by the padding", () => {
    const { original, rebuilt } = roundTrip(
      glyphProps({ content: "lucide:rocket", sizePreset: "md", padding: 12 }),
      { rotateBy: Math.PI / 4 },
    );
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("round-trips padding 20 (the finish-line lane's own regression value), unrotated", () => {
    const { original, rebuilt } = roundTrip(
      glyphProps({ content: "lucide:rocket", sizePreset: "lg", padding: 20 }),
    );
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("round-trips padding 20, rotated — both axes of the offset correction exercised together", () => {
    const { original, rebuilt } = roundTrip(
      glyphProps({ content: "emoji:🚀", sizePreset: "xl", padding: 20 }),
      { rotateBy: Math.PI / 3 },
    );
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("round-trips a glyph with an explicit size override", () => {
    const { original, rebuilt } = roundTrip(glyphProps({ size: 52 }));
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips an empty (unset) glyph", () => {
    const { original, rebuilt } = roundTrip(glyphProps({ content: "" }));
    expect(rebuilt.props).toEqual(original.props);
  });

  it("round-trips a rotated glyph, pose included", () => {
    const { original, rebuilt } = roundTrip(glyphProps({ sizePreset: "xl" }), {
      rotateBy: Math.PI / 6,
    });
    expect(rebuilt.props).toEqual(original.props);
    expectSamePose(original, rebuilt);
  });

  it("the detached box excludes padding — it is the inner glyph, not the outer footprint", () => {
    const id = createShapeId();
    const props = glyphProps({ sizePreset: "md", padding: 6 }); // size 24, footprint 36
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props });
    runDetachSweep(editor, [id], DETACHABLE_KINDS);
    const [box] = editor.getCurrentPageShapes();
    expect((box.props as any).w).toBe(24);
    expect((box.props as any).h).toBe(24);
  });
});
