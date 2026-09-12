import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  atom,
  resizeBox,
  useContainer,
  type Atom,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
  type TLShapeId,
} from "tldraw";

import { glyphFootprint, type GlyphFootprint, type GlyphSize } from "@bbox-ui/core";
import { GlyphPicker } from "@bbox-ui/glyph-picker";

/**
 * A standalone Glyph on the canvas — docs/GLYPH-PLAN.md's contract table.
 * `size` is the cascade's OVERRIDE layer: `null` (not `undefined` — a
 * persisted shape prop needs a JSON-safe "absent") means the preset alone
 * decides; a resize handle or the inspector's number box writes a real
 * px value here, same rule `glyphFootprint` already enforces for the
 * presentational `Glyph`.
 */
export interface BBoxGlyphShapeProps {
  w: number;
  h: number;
  content: string;
  sizePreset: GlyphSize;
  size: number | null;
  padding: number;
}

// tldraw 5.x custom shapes register their props on the global map so the
// shape type participates in TLShape (the documented augmentation path).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-glyph": BBoxGlyphShapeProps;
  }
}

export type BBoxGlyphShape = TLBaseShape<"bbox-glyph", BBoxGlyphShapeProps>;

/**
 * The size-cascade footprint of a `bbox-glyph` shape's PERSISTED props —
 * pure, so the shape util, its detach and its tests share one source of
 * truth for "what square does this glyph occupy." `size: null` (the
 * validator's own "no override" spelling) is translated to `undefined`
 * for `glyphFootprint`, which is what its `!== undefined` override check
 * expects — never `??`, since an explicit `size: 0` is a real override a
 * drag can legally reach.
 */
export function glyphShapeFootprint(
  props: Pick<BBoxGlyphShapeProps, "sizePreset" | "size" | "padding">,
): GlyphFootprint {
  return glyphFootprint({
    sizePreset: props.sizePreset,
    size: props.size === null ? undefined : props.size,
    padding: props.padding,
  });
}

// docs/GLYPH-PLAN.md's contract table: `size | number px, min 8, max 512`.
const GLYPH_SIZE_MIN_PX = 8;
const GLYPH_SIZE_MAX_PX = 512;

/**
 * The resize handler's pure core (unit-tested on its own): a drag to a
 * new w×h becomes a new `size` OVERRIDE, never a stretched box.
 *
 * WHY the smaller side, not the larger: `isAspectRatioLocked` keeps
 * tldraw's own `resizeBox` producing a (near-)square w/h already, but
 * rounding/handle math can still hand this a w slightly ahead of h or
 * vice versa. Picking the larger would let shrinking one corner grow the
 * glyph on the other axis's account — the smaller side is the one every
 * shrink drag agrees on, so shrinking always shrinks.
 */
export function resizeGlyphProps(
  props: Pick<BBoxGlyphShapeProps, "padding">,
  w: number,
  h: number,
): { w: number; h: number; size: number } {
  const side = Math.min(
    GLYPH_SIZE_MAX_PX,
    Math.max(GLYPH_SIZE_MIN_PX, Math.round(Math.min(w, h) - 2 * props.padding)),
  );
  const footprint = glyphFootprint({ size: side, padding: props.padding });
  return { w: footprint.w, h: footprint.h, size: side };
}

/**
 * Which one glyph's picker is open, per editor — the canvas equivalent of
 * Notion's "one popover at a time." A `WeakMap` scopes it to the editor
 * exactly like `receivedPortsAtom` in block-shape-util.tsx, for the same
 * reason: `editor.dispose()` drops a document without deleting its
 * shapes, so a module-global flag would outlive the editor it belonged to.
 */
const glyphOpenPickerByEditor = new WeakMap<Editor, Atom<TLShapeId | null>>();

function glyphOpenPickerAtom(editor: Editor): Atom<TLShapeId | null> {
  let openId = glyphOpenPickerByEditor.get(editor);
  if (!openId) {
    openId = atom<TLShapeId | null>("bbox glyph open picker", null);
    glyphOpenPickerByEditor.set(editor, openId);
  }
  return openId;
}

/**
 * Set (or clear) which glyph's picker is open.
 *
 * WHY `open: true` is unconditional rather than a toggle: the ShapeUtil's
 * own `onClick` below (see `PointingShape.onPointerUp` in tldraw's select
 * tool) always calls this with `true` on every non-drag click — it never
 * reads current state first.
 */
export function setGlyphPickerOpen(editor: Editor, shapeId: TLShapeId, open: boolean) {
  glyphOpenPickerAtom(editor).update((current) => {
    if (open) return shapeId;
    return current === shapeId ? null : current;
  });
}

/** Whether `shapeId`'s picker should render open right now. */
export function isGlyphPickerOpen(editor: Editor, shapeId: TLShapeId): boolean {
  return glyphOpenPickerAtom(editor).get() === shapeId;
}

/**
 * tldraw host adapter for the standalone Glyph. Geometry, resize and
 * rotation all key off ONE thing — the footprint's resolved `size` — so
 * the shape can never disagree with the `Glyph` component it wraps about
 * how big it is.
 *
 * CLICK OPENS, DRAG MOVES (docs/GLYPH-PLAN.md D5): implemented entirely
 * through `ShapeUtil.onClick`, tldraw's OWN click-vs-drag lifecycle hook
 * (`PointingShape.onPointerUp` in tldraw's select tool calls it only when
 * `onPointerMove` never saw `inputs.getIsDragging()` become true — a drag
 * transitions to the `translating` state before pointer-up and `onClick`
 * is never reached). No pointer-threshold math is reinvented here; the
 * picker's own open flag is the only new state, and it lives in the atom
 * above rather than as a shape prop because "which picker is open" is
 * ephemeral UI state, never something a `.tldr` should persist.
 */
export class BBoxGlyphShapeUtil extends ShapeUtil<BBoxGlyphShape> {
  static override type = "bbox-glyph" as const;

  static override props = {
    w: T.number,
    h: T.number,
    content: T.string,
    sizePreset: T.literalEnum("sm", "md", "lg", "xl"),
    size: T.nullable(T.number),
    padding: T.number,
  };

  override getDefaultProps(): BBoxGlyphShape["props"] {
    // D1: Zach's table says `sm`; the pre-plan standalone Glyph defaulted
    // to `xl`.
    const footprint = glyphFootprint({ sizePreset: "sm", padding: 0 });
    return {
      w: footprint.w,
      h: footprint.h,
      content: "",
      sizePreset: "sm",
      size: null,
      padding: 0,
    };
  }

  override getGeometry(shape: BBoxGlyphShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override isAspectRatioLocked(_shape: BBoxGlyphShape) {
    return true;
  }

  override onResize(shape: BBoxGlyphShape, info: TLResizeInfo<BBoxGlyphShape>) {
    const resized = resizeBox(shape, info);
    const next = resizeGlyphProps(shape.props, resized.props.w, resized.props.h);
    return { ...resized, props: { ...resized.props, ...next } };
  }

  /**
   * `onResize` is only ONE writer of `sizePreset`/`size`/`padding` — the
   * inspector's own number box and preset selector (plan phase 5) update
   * the same three fields directly, with no drag and no `resizeBox` in
   * between. Both stock create/update seams normalize `w`/`h` here so
   * every writer, not just a drag, keeps the invariant the plan states as
   * a property of the shape itself: "w/h always equal the footprint of
   * the resolved size." Without this, `getGeometry` (built from
   * `shape.props.w/h`) can disagree with what the `Glyph` inside actually
   * paints — the selection box, hit test and indicator all lie about the
   * picture, and `primitivesForGlyph` (which re-derives the footprint
   * fresh from props) detaches a box a different size than the shape's
   * own bounds ever showed.
   */
  override onBeforeCreate(next: BBoxGlyphShape): BBoxGlyphShape {
    const footprint = glyphShapeFootprint(next.props);
    return { ...next, props: { ...next.props, w: footprint.w, h: footprint.h } };
  }

  override onBeforeUpdate(prev: BBoxGlyphShape, next: BBoxGlyphShape): BBoxGlyphShape | void {
    if (
      prev.props.sizePreset === next.props.sizePreset &&
      prev.props.size === next.props.size &&
      prev.props.padding === next.props.padding
    ) {
      return; // Nothing in the cascade moved — leave w/h as onResize left them.
    }
    const footprint = glyphShapeFootprint(next.props);
    return { ...next, props: { ...next.props, w: footprint.w, h: footprint.h } };
  }

  // Rotation is a stock fact: the rotate handle writes `shape.rotation`
  // itself, nothing here needs to react to it (docs/GLYPH-PLAN.md D2).

  override onClick(shape: BBoxGlyphShape) {
    // WHY the modifier guard: `PointingShape.onPointerUp` calls this
    // unconditionally on every non-drag click, including a shift/ctrl/meta
    // one used to grow or shrink a multi-selection — tldraw's own additive
    // branch runs right after, regardless of what `onClick` does. Without
    // this guard a shift-click that is only adding the glyph to a
    // selection also pops the picker open over the canvas.
    const { inputs } = this.editor;
    if (inputs.getShiftKey() || inputs.getCtrlKey() || inputs.getMetaKey()) {
      return;
    }
    setGlyphPickerOpen(this.editor, shape.id, true);
    // No shape-prop change to return: opening the picker is out-of-band
    // UI state (the atom above), not a document edit. Returning `void`
    // (a falsy `change`) lets `PointingShape.onPointerUp` fall through to
    // its normal select-on-click path — "the click also selects, so the
    // inspector follows" (docs/GLYPH-PLAN.md's contract).
  }

  override component(shape: BBoxGlyphShape) {
    const { props } = shape;
    const container = useContainer();
    const isOpen = glyphOpenPickerAtom(this.editor).get() === shape.id;
    return (
      <HTMLContainer
        style={{ overflow: "visible", pointerEvents: "all" }}
        // WHY: tldraw's select tool special-cases any shape that declares
        // `onClick` (`PointingShape.onEnter`) — it deliberately skips its
        // normal select-on-enter for such a shape, trusting
        // `startTranslating` to repair the selection once a drag is
        // detected. But `startTranslating` only does that repair
        // "if (!didSelectOnEnter && !editor.getSelectedShapeIds().length)"
        // — i.e. only when NOTHING was selected before. Select a Block,
        // then press-drag a Glyph elsewhere on the canvas: tldraw enters
        // `translating` with the Block still the selection, and the drag
        // moves it instead of the glyph under the pointer. Selecting the
        // glyph on press — the same plain, non-additive select an ordinary
        // shape gets on enter — gives `translating` the right target
        // without reinventing any of tldraw's own drag/threshold state.
        //
        // Three guards keep that repair from fighting the tool it is
        // patching around:
        //  - only the select tool has a "translating" state to repair —
        //    draw/eraser/etc. must see this shape exactly like any other;
        //  - shift/ctrl/meta means the press is growing or shrinking a
        //    selection, `PointingShape`'s own additive branch on pointer-up
        //    already handles that correctly and must run untouched, or a
        //    pre-emptive `select()` here makes it read as "already
        //    selected" and DESELECT instead of add;
        //  - `getOutermostSelectableShape` (the same call `onEnter` makes
        //    for an ordinary shape) repairs the GROUP when the glyph is
        //    grouped, not the glyph itself — selecting the child directly
        //    bypasses tldraw's own group-drag logic and drags the glyph out
        //    of the group it is sitting in.
        onPointerDown={(event) => {
          if (this.editor.getCurrentToolId() !== "select") return;
          if (event.shiftKey || event.ctrlKey || event.metaKey) return;
          const target = this.editor.getOutermostSelectableShape(shape);
          if (!this.editor.getSelectedShapeIds().includes(target.id)) {
            this.editor.select(target.id);
          }
        }}
      >
        <GlyphPicker
          value={props.content}
          onChange={(next) =>
            this.editor.updateShape<BBoxGlyphShape>({
              id: shape.id,
              type: "bbox-glyph",
              props: { content: next },
            })
          }
          size={props.size ?? undefined}
          sizePreset={props.sizePreset}
          padding={props.padding}
          open={isOpen}
          // WHY a close-only listener: `GlyphPicker`'s own trigger is a
          // real `<button>` (the frozen skeleton wraps it there
          // regardless of `children`), and it sits ON the shape that just
          // got dragged — a drag keeps the shape (and its DOM) under the
          // pointer for its whole gesture, so the browser's native click
          // still fires on mouseup even though tldraw correctly saw a
          // drag, not a click (`onClick` below never runs for one). That
          // native click's own toggle would compute "open" from a closed
          // picker exactly the way a real click does, indistinguishable
          // from here — so this ignores every `true` it reports and lets
          // ONLY `ShapeUtil.onClick` (tldraw's own click/drag judgment)
          // open the picker; a `false` (closing an already-open one) still
          // passes through, since that can never turn an intended drag
          // into a stray open.
          onOpenChange={(next) => {
            if (!next) setGlyphPickerOpen(this.editor, shape.id, false);
          }}
          portalContainer={container}
        />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: BBoxGlyphShape) {
    // A 4px-radius square, drawn by hand rather than `Path2D.roundRect`
    // (a newer, less portable API) — four line segments and four
    // quarter-turn arcs, same technique tldraw's own geo indicators use.
    const { w, h } = shape.props;
    const r = Math.min(4, w / 2, h / 2);
    const path = new Path2D();
    path.moveTo(r, 0);
    path.lineTo(w - r, 0);
    path.arcTo(w, 0, w, r, r);
    path.lineTo(w, h - r);
    path.arcTo(w, h, w - r, h, r);
    path.lineTo(r, h);
    path.arcTo(0, h, 0, h - r, r);
    path.lineTo(0, r);
    path.arcTo(0, 0, r, 0, r);
    path.closePath();
    return path;
  }
}
