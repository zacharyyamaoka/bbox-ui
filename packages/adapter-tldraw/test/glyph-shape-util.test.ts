/**
 * Pure helpers behind `BBoxGlyphShapeUtil` — the size cascade and the
 * resize handler's core, exercised without any tldraw Editor at all, plus
 * the picker's open/close atom (which does need a real headless Editor,
 * since it is keyed by one).
 */
import { describe, expect, it } from "vitest";

import {
  Vec,
  createShapeId,
  resizeBox,
  type TLResizeHandle,
  type TLResizeInfo,
} from "tldraw";

import {
  BBoxGlyphShapeUtil,
  glyphResizeAnchorOffset,
  glyphShapeFootprint,
  installGlyphClickToOpen,
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

describe("glyphResizeAnchorOffset", () => {
  it("is a no-op when the clamp never bit (raw === final)", () => {
    expect(glyphResizeAnchorOffset("top_left", 52, 52, 52, 52)).toEqual({ x: 0, y: 0 });
  });

  it("bottom_right anchors top-left — its own opposite corner is already fixed by x/y, so no correction", () => {
    // The floor clamp bites (raw 20 -> final 48), but for THIS handle the
    // fixed corner is top-left, i.e. x/y themselves, never touched by a
    // change in w/h.
    expect(glyphResizeAnchorOffset("bottom_right", 20, 20, 48, 48)).toEqual({ x: 0, y: 0 });
  });

  it("top_left corrects BOTH axes by the full delta — its opposite corner is bottom-right", () => {
    // Same floor clamp as above, opposite handle: bottom-right must stay
    // put, so x/y both have to move by (raw - final) to compensate.
    expect(glyphResizeAnchorOffset("top_left", 20, 20, 48, 48)).toEqual({ x: -28, y: -28 });
  });

  it("left/right split the x correction in half AND take the full y (their edge is vertical, so height still moves fully under aspect lock); top/bottom mirror that on the other axis", () => {
    // left/right: x is their own edge (full delta); the y move is only a
    // lock side-effect, so it's centered (half).
    expect(glyphResizeAnchorOffset("left", 20, 20, 48, 48)).toEqual({ x: -28, y: -14 });
    expect(glyphResizeAnchorOffset("right", 20, 20, 48, 48)).toEqual({ x: 0, y: -14 });
    // top/bottom: y is their own edge (full delta); x is the lock
    // side-effect (half).
    expect(glyphResizeAnchorOffset("top", 20, 20, 48, 48)).toEqual({ x: -14, y: -28 });
    expect(glyphResizeAnchorOffset("bottom", 20, 20, 48, 48)).toEqual({ x: -14, y: 0 });
  });

  it("also corrects the MAX-side clamp resizeBox itself leaves uncorrected", () => {
    // raw 18000 -> final 512 (the 512px cap): top_left's opposite corner
    // (bottom-right) still must not move.
    expect(glyphResizeAnchorOffset("top_left", 18000, 18000, 512, 512)).toEqual({
      x: 17488,
      y: 17488,
    });
  });

  it("a flipped axis gets NO correction, even when raw/final disagree", () => {
    // `resizeBox`'s own offset already anchors the true opposite corner at
    // ANY magnitude on a mirrored axis (computed from the raw scaled size,
    // before either of its clamps ever touch w/h) — stacking this
    // un-mirrored per-handle delta on top double-counts the direction. The
    // caller (`onResize`) is the one deciding which axes are flipped
    // (`info.scaleX/scaleY < 0`); this just has to honor `x`/`y` independently.
    expect(
      glyphResizeAnchorOffset("top_left", 18000, 18000, 512, 512, {
        flippedX: true,
        flippedY: true,
      }),
    ).toEqual({ x: 0, y: 0 });
    // Only the flipped axis is zeroed — a real drag with one axis mirrored
    // and the other not (e.g. a very oblique corner drag) still gets the
    // un-flipped axis corrected normally.
    expect(
      glyphResizeAnchorOffset("top_left", 18000, 18000, 512, 512, {
        flippedX: true,
        flippedY: false,
      }),
    ).toEqual({ x: 0, y: 17488 });
  });
});

describe("BBoxGlyphShapeUtil onResize keeps the handle-opposite corner fixed through the clamp", () => {
  // Integration-level, not just the pure helper above: drives the real
  // ShapeUtil method with a constructed TLResizeInfo, the way tldraw's own
  // Resizing state would, and checks the ACTUAL invariant — the corner
  // opposite the dragged handle lands at the same page point the drag
  // asked for before the clamp touched it — rather than re-deriving the
  // helper's own math a second time.
  function resizeInfo(overrides: {
    handle: TLResizeHandle;
    scaleX: number;
    scaleY: number;
    newPoint: { x: number; y: number };
    mode?: TLResizeInfo<BBoxGlyphShape>["mode"];
  }): TLResizeInfo<BBoxGlyphShape> {
    return {
      newPoint: new Vec(overrides.newPoint.x, overrides.newPoint.y),
      handle: overrides.handle,
      mode: overrides.mode ?? "resize_bounds",
      scaleX: overrides.scaleX,
      scaleY: overrides.scaleY,
      // Neither field is read by `resizeBox` or `resizeGlyphProps` — only
      // `newPoint`/`handle`/`scaleX`/`scaleY` are — so an empty stand-in is
      // enough; a real drag always hands a full `Box`/shape here.
      initialBounds: {} as TLResizeInfo<BBoxGlyphShape>["initialBounds"],
      initialShape: {} as BBoxGlyphShape,
    };
  }

  it("floor clamp: dragging top_left inward past the 8px minimum keeps bottom-right fixed", () => {
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    // padding 20, w=h=140 (size 100) at (100,100) -> bottom-right = (240,240).
    const shape = {
      id: "shape:probe" as BBoxGlyphShape["id"],
      type: "bbox-glyph",
      x: 100,
      y: 100,
      rotation: 0,
      props: glyphProps({ padding: 20, sizePreset: "sm", size: 100, w: 140, h: 140 }),
    } as unknown as BBoxGlyphShape;
    // scale 0.1 on a 140px box -> raw 14x14, well under the 8px MINIMUM
    // once padding is subtracted (14 - 40 = -26 -> floored to 8).
    const next = util.onResize(
      shape,
      resizeInfo({ handle: "top_left", scaleX: 0.1, scaleY: 0.1, newPoint: { x: 226, y: 226 } }),
    );
    expect(next.props.size).toBe(8);
    const bottomRightX = next.x + (next.props as BBoxGlyphShapeProps).w;
    const bottomRightY = next.y + (next.props as BBoxGlyphShapeProps).h;
    expect(bottomRightX).toBeCloseTo(240, 6);
    expect(bottomRightY).toBeCloseTo(240, 6);
    editor.dispose();
  });

  it("cap clamp: dragging top_left outward past the 512px maximum keeps bottom-right fixed", () => {
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    // padding 0, w=h=18 (size 18, sm) at (100,100) -> bottom-right = (118,118).
    const shape = {
      id: "shape:probe" as BBoxGlyphShape["id"],
      type: "bbox-glyph",
      x: 100,
      y: 100,
      rotation: 0,
      props: glyphProps({ padding: 0, sizePreset: "sm", size: null, w: 18, h: 18 }),
    } as unknown as BBoxGlyphShape;
    // scale 1000 on an 18px box -> raw 18000x18000, capped to 512.
    const next = util.onResize(
      shape,
      resizeInfo({
        handle: "top_left",
        scaleX: 1000,
        scaleY: 1000,
        newPoint: { x: 100 - 17982, y: 100 - 17982 },
      }),
    );
    expect(next.props.size).toBe(512);
    const bottomRightX = next.x + (next.props as BBoxGlyphShapeProps).w;
    const bottomRightY = next.y + (next.props as BBoxGlyphShapeProps).h;
    expect(bottomRightX).toBeCloseTo(118, 6);
    expect(bottomRightY).toBeCloseTo(118, 6);
    editor.dispose();
  });

  it("group/multi-selection resize (mode: 'scale_shape') leaves resizeBox's own x/y untouched", () => {
    // A `scale_shape` resize hands every member of a group/multi-selection
    // the SAME uniform scale at once — "the corner opposite the handle" is
    // a single-shape-bounds-resize idea (`mode: 'resize_bounds'`), and has
    // no meaning for one member of a group. Grouping a glyph with a geo
    // rect and resizing the group used to jump the glyph out of the
    // group's own resize: this shape must return `resizeBox`'s own x/y for
    // this mode, uncorrected, same as if it declared no `onResize` logic
    // at all beyond the footprint cascade.
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    const shape = {
      id: "shape:probe" as BBoxGlyphShape["id"],
      type: "bbox-glyph",
      x: 100,
      y: 100,
      rotation: 0,
      props: glyphProps({ padding: 0, sizePreset: "sm", size: null, w: 18, h: 18 }),
    } as unknown as BBoxGlyphShape;
    // A scale large enough that the cascade's own 512px cap bites too —
    // proving this isn't vacuously true because no clamp ever fired.
    const info = resizeInfo({
      handle: "top_left",
      scaleX: 100,
      scaleY: 100,
      newPoint: { x: 40, y: 40 },
      mode: "scale_shape",
    });
    const expected = resizeBox(shape, info, { minWidth: 8, minHeight: 8 });
    const next = util.onResize(shape, info);
    expect((next.props as BBoxGlyphShapeProps).size).toBe(512);
    expect(next.x).toBe(expected.x);
    expect(next.y).toBe(expected.y);
    editor.dispose();
  });

  it("a flipped drag (past the shape's own opposite edge) gets NO extra correction from us, at the floor and at the cap alike", () => {
    // `resizeBox`'s own mirrored-branch offset already anchors the box
    // correctly on a flipped axis at ANY magnitude — it's computed from the
    // raw scaled size, before either of ITS clamps (floor OR cap) ever
    // touch w/h. Stacking our un-mirrored per-handle delta on top of an
    // already-correct flipped anchor is exactly the bug this closes
    // (measured a 690px drift on a real flipped top_left past the 512
    // cap). The oracle here is `resizeBox` called with only our footprint
    // floor as `opts` (no max) — precisely what `onResize` calls before
    // any correction of its own — so a regression that reintroduces the
    // stacked correction fails this immediately.
    const floorCase = {
      shape: {
        id: "shape:probe" as BBoxGlyphShape["id"],
        type: "bbox-glyph",
        x: 100,
        y: 100,
        rotation: 0,
        props: glyphProps({ padding: 0, sizePreset: "sm", size: 100, w: 100, h: 100 }),
      } as unknown as BBoxGlyphShape,
      info: resizeInfo({
        handle: "top_left",
        scaleX: -0.02,
        scaleY: -0.02,
        newPoint: { x: 50, y: 50 },
      }),
    };
    const capCase = {
      shape: {
        id: "shape:probe" as BBoxGlyphShape["id"],
        type: "bbox-glyph",
        x: 100,
        y: 100,
        rotation: 0,
        props: glyphProps({ padding: 0, sizePreset: "sm", size: 400, w: 400, h: 400 }),
      } as unknown as BBoxGlyphShape,
      info: resizeInfo({
        handle: "top_left",
        scaleX: -3,
        scaleY: -3,
        newPoint: { x: 1700, y: 1700 },
      }),
    };

    for (const { shape, info } of [floorCase, capCase]) {
      const editor = createHeadlessEditor();
      const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
      const expected = resizeBox(shape, info, { minWidth: 8, minHeight: 8 });
      const next = util.onResize(shape, info);
      expect(next.x).toBeCloseTo(expected.x, 6);
      expect(next.y).toBeCloseTo(expected.y, 6);
      editor.dispose();
    }

    // The cap case really did clamp the size — proving the assertion above
    // isn't vacuously true because the 512px cap never fired.
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    const capped = util.onResize(capCase.shape, capCase.info);
    expect((capped.props as BBoxGlyphShapeProps).size).toBe(512);
    editor.dispose();
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

  it("snaps a directly-written w/h back to the footprint, even with the cascade untouched", () => {
    // onBeforeUpdate used to early-return "nothing in the cascade moved,"
    // trusting w/h to already be correct — true for onResize's own writes,
    // but not for a caller (a script, a stale fixture) that hands
    // `updateShape` a w/h with no cascade change alongside it. The
    // invariant is "w/h always equal the footprint," unconditionally.
    const editor = createHeadlessEditor();
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    editor.updateShape({ id, type: "bbox-glyph", props: { w: 400, h: 400 } });
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

describe("BBoxGlyphShapeUtil onDoubleClick", () => {
  it("absorbs a double click instead of falling through to a stray text shape", () => {
    // With neither `canEdit` nor `onDoubleClick` declared, SelectTool's
    // Idle state falls through to `handleDoubleClickOnCanvas` — its own
    // fallback for "double click on something that can't edit" — which
    // creates a brand-new `text` shape on top and starts editing it.
    const editor = createHeadlessEditor();
    const util = editor.getShapeUtil<BBoxGlyphShapeUtil>("bbox-glyph");
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    const shape = editor.getShape<BBoxGlyphShape>(id)!;
    const change = util.onDoubleClick(shape);
    expect(change).toEqual({ id: shape.id, type: "bbox-glyph" });
    editor.dispose();
  });
});

/**
 * The click-to-open mechanism itself (`installGlyphClickToOpen`) —
 * committed coverage for what, before this fix, only a gitignored CDP
 * script (`.scratch-host/drive-glyph.mjs`) ever exercised: deleting or
 * changing the arm/disarm logic, the per-event modifier guard, or the
 * `getOutermostSelectableShape` gate left the whole rest of this file's
 * suite green (verifier finding). Drives `editor.dispatch` directly with
 * real `TLPointerEventInfo` — the exact same public API and event shape
 * tldraw's own pointer handling in a real browser uses, per Editor.ts's own
 * doc example (`editor.dispatch(myPointerEvent)`) — never a call into
 * `installGlyphClickToOpen`'s private `handleEvent` closure.
 *
 * WHY `point` can be used directly as a page point: the headless editor's
 * default camera is `{x:0, y:0, z:1}` and its default instance
 * `screenBounds` is `{x:0, y:0, w:1080, h:720}` (tldraw's own defaults,
 * `InputsManager.updateFromEvent`'s own `sx/cz - cx` math), so client
 * space, screen space and page space all coincide — no viewport call is
 * needed to make a dispatched point land where a test expects it to.
 */
describe("installGlyphClickToOpen — the click-to-open mechanism, driven by dispatch", () => {
  function pointerEvent(
    name: "pointer_down" | "pointer_move" | "pointer_up",
    point: { x: number; y: number },
    modifiers: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
  ) {
    const shiftKey = modifiers.shiftKey ?? false;
    const ctrlKey = modifiers.ctrlKey ?? false;
    const altKey = modifiers.altKey ?? false;
    const metaKey = modifiers.metaKey ?? false;
    return {
      type: "pointer" as const,
      name,
      point: { x: point.x, y: point.y, z: 0.5 },
      pointerId: 1,
      button: 0,
      isPen: false,
      shiftKey,
      ctrlKey,
      altKey,
      metaKey,
      accelKey: ctrlKey || metaKey,
      target: "canvas" as const,
    };
  }

  it("a plain click on an unselected glyph opens its picker", () => {
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 100, y: 100, props: glyphProps() });
    // Center of an 18x18 glyph at (100,100).
    editor.dispatch(pointerEvent("pointer_down", { x: 109, y: 109 }));
    expect(editor.getPath()).toBe("select.pointing_shape");
    expect(isGlyphPickerOpen(editor, id)).toBe(false);
    editor.dispatch(pointerEvent("pointer_up", { x: 109, y: 109 }));
    expect(isGlyphPickerOpen(editor, id)).toBe(true);
    expect(editor.getSelectedShapeIds()).toEqual([id]);
    stop();
    editor.dispose();
  });

  it("a shift-held press never arms — the click's own selection stays additive, untouched", () => {
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 100, y: 100, props: glyphProps() });
    editor.dispatch(pointerEvent("pointer_down", { x: 109, y: 109 }, { shiftKey: true }));
    editor.dispatch(pointerEvent("pointer_up", { x: 109, y: 109 }, { shiftKey: true }));
    expect(isGlyphPickerOpen(editor, id)).toBe(false);
    stop();
    editor.dispose();
  });

  it("a click on a glyph inside a group selects the GROUP and never arms", () => {
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const rectId = createShapeId();
    const glyphId = createShapeId();
    editor.createShapes([
      { id: rectId, type: "geo", x: 0, y: 0, props: { geo: "rectangle", w: 100, h: 100 } },
      { id: glyphId, type: "bbox-glyph", x: 200, y: 0, props: glyphProps() },
    ]);
    editor.setSelectedShapes([rectId, glyphId]);
    const groupId = createShapeId();
    editor.groupShapes([rectId, glyphId], { groupId });
    editor.setSelectedShapes([]);
    // Center of the glyph at (200,0).
    editor.dispatch(pointerEvent("pointer_down", { x: 209, y: 9 }));
    editor.dispatch(pointerEvent("pointer_up", { x: 209, y: 9 }));
    expect(isGlyphPickerOpen(editor, glyphId)).toBe(false);
    expect(editor.getSelectedShapeIds()).toEqual([groupId]);
    stop();
    editor.dispose();
  });

  it("leaving 'select.pointing_shape' by any path disarms — no dialog on the eventual pointer_up", () => {
    // The mechanism's own doc comment names three ways out of
    // `pointing_shape` that all disarm through the SAME one check: a real
    // drag becoming `select.translating`, Escape/interrupt becoming
    // `select.idle`, or a tool switch leaving `select.` altogether. A real
    // drag needs tldraw's `DragAndDropManager`, which reaches for
    // `window.setInterval` — a browser API this package's shared headless
    // fixture (test/headlessEditor.ts, used by every shape util's tests,
    // not just this one) doesn't stub; that path is covered instead by the
    // real-browser proof (.scratch-host/drive-glyph.mjs, proof #2). This
    // exercises the identical disarm branch via `interrupt`, which needs
    // no such stub, PointingShape's own `onInterrupt` transitions to
    // `select.idle` exactly like Escape would.
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 100, y: 100, props: glyphProps() });
    editor.dispatch(pointerEvent("pointer_down", { x: 109, y: 109 }));
    expect(editor.getPath()).toBe("select.pointing_shape");
    editor.dispatch({ type: "misc", name: "interrupt" });
    expect(editor.getPath()).toBe("select.idle");
    editor.dispatch(pointerEvent("pointer_up", { x: 109, y: 109 }));
    expect(isGlyphPickerOpen(editor, id)).toBe(false);
    editor.dispose();
    stop();
  });

  it("deleting the armed shape between pointer_down and pointer_up never opens a stale picker", () => {
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 100, y: 100, props: glyphProps() });
    editor.dispatch(pointerEvent("pointer_down", { x: 109, y: 109 }));
    expect(editor.getPath()).toBe("select.pointing_shape");
    editor.deleteShape(id);
    editor.dispatch(pointerEvent("pointer_up", { x: 109, y: 109 }));
    expect(isGlyphPickerOpen(editor, id)).toBe(false);
    stop();
    editor.dispose();
  });

  it("deleting an ALREADY-OPEN shape clears the open flag too — not just a press in flight", () => {
    // A remote peer, or undo, can delete the shape whose picker is open
    // with no click of ours in the loop at all — no arm, no press,
    // nothing for the pointer_down/up branches above to catch. Without
    // ALSO clearing the atom in the same `registerBeforeDeleteHandler`,
    // an undo that restores a tldraw shape under the SAME id (tldraw's
    // own restore behaviour) reopens the picker with no pointer event of
    // any kind having reached it.
    const editor = createHeadlessEditor();
    const stop = installGlyphClickToOpen(editor);
    const id = createShapeId();
    editor.createShape({ id, type: "bbox-glyph", x: 0, y: 0, props: glyphProps() });
    setGlyphPickerOpen(editor, id, true);
    expect(isGlyphPickerOpen(editor, id)).toBe(true);
    editor.deleteShape(id);
    expect(isGlyphPickerOpen(editor, id)).toBe(false);
    stop();
    editor.dispose();
  });
});
