import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  Vec,
  atom,
  resizeBox,
  useContainer,
  type Atom,
  type Editor,
  type TLBaseShape,
  type TLEventInfo,
  type TLResizeHandle,
  type TLResizeInfo,
  type TLShapeId,
  type TLShapePartial,
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
 * The x/y correction that keeps the corner OPPOSITE the dragged handle
 * fixed when `resizeGlyphProps`'s own MAX clamp (512px) bites — i.e. the
 * drag would have produced a bigger box than the cap allows.
 *
 * The MIN side needs none of this any more: `onResize` below passes our
 * footprint floor to `resizeBox` (tldraw's own stock helper) as `opts`, and
 * `resizeBox`'s `minWidth`/`minHeight` handling is already flip-aware (see
 * its own per-handle `offset.x`/`offset.y` switch, including the mirrored
 * `w <= 0` branch for a drag that crosses the opposite edge) — so its
 * output already agrees with `resizeGlyphProps`'s floor exactly, with
 * nothing left for this function to add (`onResize` never even calls it
 * unless a delta remains). `resizeBox` never learns the MAX side, though —
 * it clamps `w`/`h` at the very end with a bare `Math.min`, no offset — so
 * that gap is still ours to close, driven by our own delta (raw vs.
 * clamped) rather than its min-only one.
 *
 * `flippedX`/`flippedY` zero the correction on a mirrored axis: on a real
 * flip, `resizeBox`'s own offset already anchors the true opposite corner
 * at ANY magnitude (it computes that offset from the raw scaled size,
 * before either clamp ever touches `w`/`h` — see its source), so stacking
 * this un-mirrored per-handle correction on top double-counts the
 * direction and drifts (measured 690px drifting the wrong way with a
 * flipped top_left past the cap). Skipping it there leaves `resizeBox`'s
 * already-correct flipped anchor exactly as it was pre-clamp.
 *
 * WHY the smaller side of a shrink is what resizeGlyphProps floors on (see
 * its own doc comment): a corner-opposite handle is still just one corner,
 * one axis of correction each — `left`/`right` only ever move x, `top`/
 * `bottom` only ever move y, matching resizeBox's own per-handle cases.
 */
export function glyphResizeAnchorOffset(
  handle: TLResizeHandle,
  rawW: number,
  rawH: number,
  finalW: number,
  finalH: number,
  flipped: { flippedX: boolean; flippedY: boolean } = { flippedX: false, flippedY: false },
): { x: number; y: number } {
  const deltaW = flipped.flippedX ? 0 : rawW - finalW;
  const deltaH = flipped.flippedY ? 0 : rawH - finalH;
  let x = 0;
  switch (handle) {
    case "top_left":
    case "left":
    case "bottom_left":
      x = deltaW;
      break;
    case "top":
    case "bottom":
      x = deltaW / 2;
      break;
    default:
      x = 0;
  }
  let y = 0;
  switch (handle) {
    case "top_left":
    case "top":
    case "top_right":
      y = deltaH;
      break;
    case "left":
    case "right":
      y = deltaH / 2;
      break;
    default:
      y = 0;
  }
  return { x, y };
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
 * WHY `open: true` is unconditional rather than a toggle: `installGlyphClickToOpen`
 * below always calls this with `true` once a press has been judged a click,
 * never a toggle — it never reads current state first.
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
 * CLICK OPENS, DRAG MOVES (docs/GLYPH-PLAN.md D5) — WITHOUT touching
 * selection at all. Three Opus verification rounds rejected every attempt
 * that declared `ShapeUtil.onClick`: tldraw's `PointingShape.onEnter`
 * special-cases ANY shape util with an `onClick` and skips its normal
 * select-on-enter for it (see that file's own comment,
 * "we might select it on pointer up!"), trusting `startTranslating`'s own
 * repair — but that repair only fires "if nothing was already selected",
 * so pressing this glyph while something else is selected left the WRONG
 * shape selected once a drag began, which a hand-rolled `onPointerDown`
 * "repair" then had to patch around — and broke shift-additive selection
 * and group drilling in the process (verifier #41), and read tldraw's
 * deliberately-sticky `editor.inputs.getShiftKey()` (cleared 150ms after
 * the real key-up, `Editor.ts`'s own `_shiftKeyTimeout`), which stayed
 * true long enough to swallow a plain click right after a shift gesture
 * (verifier #42).
 *
 * The fix respects the rule this file is under (tldraw stays stock): don't
 * declare `onClick` at all, so `PointingShape` runs its ENTIRELY NORMAL
 * select-on-enter/shift-add/group-drill/drag path for this shape exactly
 * like any plain rectangle. Instead, READ what the select tool already
 * decided, one `editor.on("event", ...)` listener per editor:
 *
 *   pointer_down — arm iff `editor.getPath() === "select.pointing_shape"`
 *     (tldraw itself just chose to enter that state — this listener runs
 *     AFTER `Editor._flushEventForTick`'s own `this.root.handleEvent(info);
 *     this.emit("event", info)`, so the state machine has already
 *     reacted), the press's own PER-EVENT modifiers
 *     (`info.shiftKey/ctrlKey/metaKey/altKey` — never the sticky
 *     `editor.inputs` getters, which is exactly verifier #42's bug) are
 *     all false, a fresh hit test at the press point is a `bbox-glyph`,
 *     and `getOutermostSelectableShape` agrees it IS the outermost
 *     selectable shape (a grouped glyph's outermost is its group, so a
 *     click inside a group never arms — the group takes the click like
 *     any other member). The hit test is `getHitShapeOnCanvasPointerDown`
 *     re-run by hand (`getShapeAtPoint` first, `getSelectedShapeAtPoint`
 *     as its own fallback), not `info.shape`/`info.target`: this shape's
 *     `HTMLContainer` sets no `pointer-events` override, so the real DOM
 *     target is always tldraw's canvas layer, never an individual shape
 *     element — every press arrives here as `target: "canvas"`, even one
 *     `Idle.onPointerDown` itself re-dispatched internally (a same-state
 *     method call, not a second `emit`) with `target: "shape"` to decide
 *     `pointing_shape` in the first place.
 *   any other event while armed — disarm the moment `getPath()` is no
 *     longer `"select.pointing_shape"`: a real drag became
 *     `"select.translating"`, Escape/interrupt became `"select.idle"`, a
 *     tool switch left `"select."` altogether. One check covers every one
 *     of those without naming them.
 *   pointer_up while still armed — the press never left `pointing_shape`,
 *     i.e. tldraw's own judgment is "this was a click, not a drag" (its
 *     `onPointerUp` is about to run its ordinary select logic, unaffected
 *     since this shape declares no `onClick`) — open that glyph's picker.
 *
 * A `registerBeforeDeleteHandler` disarms if the armed shape is deleted
 * out from under the press (e.g. a remote peer, or undo) with no
 * intervening event of our own to catch it — and, separately, clears the
 * OPEN-picker atom for that shape id too: an id can carry an open picker
 * with no press in flight at all (the picker was already open when the
 * delete happened), and undo restores tldraw shapes under the SAME id, so
 * without this a delete-while-open followed by Ctrl+Z reopens the picker
 * on the restored shape with no click of any kind.
 */
// Exported (via index.ts's own `export *`, same as the other testing seams
// below) for its committed regression test, test/glyph-shape-util.test.ts.
// Everything else this file exposes for testing is a pure helper or the
// picker atom; this is the one piece of actual BEHAVIOUR that otherwise
// only a real React render (`component()`, which calls
// `ensureGlyphClickToOpenInstalled` below) would ever install — which
// would leave the mechanism itself un-exercised by anything vitest runs.
export function installGlyphClickToOpen(editor: Editor): () => void {
  let armedShapeId: TLShapeId | null = null;

  // WHY named rather than passed inline: `editor.on()` (an `eventemitter3`
  // emitter, not a disposable-returning API) hands back `this`, not an
  // unsubscribe — the handler's own reference is what `editor.off()` below
  // needs to remove exactly this listener and no other.
  function handleEvent(info: TLEventInfo) {
    if (info.type === "pointer" && info.name === "pointer_down") {
      armedShapeId = null;
      if (editor.getPath() !== "select.pointing_shape") return;
      if (info.shiftKey || info.ctrlKey || info.metaKey || info.altKey) return;
      // WHY not `info.shape`/`info.target`: a headless (or any DOM-target)
      // click always arrives here as `target: 'canvas'` — tldraw's own
      // `.tl-html-container` default is `pointer-events: none` (this shape
      // sets no override, see the class doc comment), so the real DOM
      // pointer target is always the canvas layer, never an individual
      // shape element. `SelectTool/childStates/Idle.onPointerDown` does its
      // OWN hit test (`getHitShapeOnCanvasPointerDown`) and re-dispatches
      // internally with `target: 'shape'` to decide `pointing_shape` — but
      // that re-dispatch is a same-state-machine method call, never a
      // second `Editor.emit('event', …)`, so the ONE "event" this listener
      // ever sees keeps the original `target: 'canvas'`. Re-running that
      // exact hit test (`getHitShapeOnCanvasPointerDown`'s own two-step
      // lookup: geometry hit first, the already-selected shape at point
      // second) is what actually matches what the state machine used.
      const hit =
        editor.getShapeAtPoint(editor.inputs.getCurrentPagePoint(), {
          hitInside: false,
          margin: editor.getHitTestMargin(),
          renderingOnly: true,
        }) ?? editor.getSelectedShapeAtPoint(editor.inputs.getCurrentPagePoint());
      if (!hit || hit.type !== "bbox-glyph") return;
      if (editor.getOutermostSelectableShape(hit).id !== hit.id) return;
      armedShapeId = hit.id;
      return;
    }

    if (info.type === "pointer" && info.name === "pointer_up") {
      if (armedShapeId && editor.getShape(armedShapeId)) {
        setGlyphPickerOpen(editor, armedShapeId, true);
      }
      armedShapeId = null;
      return;
    }

    if (armedShapeId && editor.getPath() !== "select.pointing_shape") {
      armedShapeId = null;
    }
  }

  editor.on("event", handleEvent);

  const stopBeforeDelete = editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
    if (armedShapeId === shape.id) armedShapeId = null;
    setGlyphPickerOpen(editor, shape.id, false);
  });

  return () => {
    editor.off("event", handleEvent);
    stopBeforeDelete();
  };
}

/**
 * One `installGlyphClickToOpen` listener per editor, installed lazily on
 * first render (`component()` below) rather than from the constructor —
 * `ShapeUtil` IS a per-editor singleton (tldraw's `Editor` constructs
 * `new Util(this)` exactly once per registered shape type,
 * `_shapeUtils[Util.type] = new Util(this)`, not once per shape instance
 * and not once per mount), which looked like the natural place to do this
 * with zero app-level wiring — except `Editor`'s constructor builds every
 * shape util BEFORE it assigns `this.sideEffects` (`this.sideEffects =
 * this.store.sideEffects` is a plain statement partway down that same
 * constructor, not a class-field default), so `editor.sideEffects` is
 * still `undefined` at the point a `ShapeUtil` constructor runs. The first
 * `component()` call happens only once the `Editor` is fully built and
 * mounted, which is why the guard lives here instead.
 */
const glyphClickListenerInstalledFor = new WeakSet<Editor>();

function ensureGlyphClickToOpenInstalled(editor: Editor) {
  if (glyphClickListenerInstalledFor.has(editor)) return;
  glyphClickListenerInstalledFor.add(editor);
  const stop = installGlyphClickToOpen(editor);
  editor.disposables.add(() => {
    stop();
    glyphClickListenerInstalledFor.delete(editor);
  });
}

/**
 * tldraw host adapter for the standalone Glyph. Geometry, resize and
 * rotation all key off ONE thing — the footprint's resolved `size` — so
 * the shape can never disagree with the `Glyph` component it wraps about
 * how big it is. Click-to-open is `installGlyphClickToOpen` above; see
 * `ensureGlyphClickToOpenInstalled`'s own comment for why it is wired from
 * `component()`, and why that still needs no app-level wiring.
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
    // Pass our footprint FLOOR to `resizeBox` as `opts` so its own
    // flip-aware per-handle offset does that half of the clamp (see
    // `glyphResizeAnchorOffset`'s doc comment for why nothing further is
    // needed for the min side below). `maxWidth`/`maxHeight` are
    // deliberately NOT passed: `resizeBox` never corrects x/y for its own
    // cap either way (a bare `Math.min` at the very end, no offset), so
    // leaving it uncapped here keeps `resized.x/y` the trustworthy
    // "what would a plain box do" anchor that the max-side correction
    // below is measured against, flipped or not.
    const footprintFloor = GLYPH_SIZE_MIN_PX + 2 * shape.props.padding;
    const resized = resizeBox(shape, info, {
      minWidth: footprintFloor,
      minHeight: footprintFloor,
    });
    const next = resizeGlyphProps(shape.props, resized.props.w, resized.props.h);

    // A group/multi-selection resize (`mode: "scale_shape"`) hands this
    // shape a uniform scale of the WHOLE selection — "the corner opposite
    // the handle" has no meaning for one member of it, only for a
    // single-shape bounds resize (`mode: "resize_bounds"`) — so `resized`'s
    // own x/y stand here exactly as `resizeBox` computed them, uncorrected,
    // the same as any other shape in the group.
    if (info.mode !== "resize_bounds") {
      return { ...resized, props: { ...resized.props, ...next } };
    }

    // `resized.x/y` anchor the corner OPPOSITE `info.handle` for
    // `resized.props.w/h` — the size the drag actually asked for, before
    // `resizeGlyphProps`'s 512 cap (the floor already agrees with
    // `resized.props.w/h` exactly, via the `opts` above, so only the cap
    // can leave a delta here). When the cap changes that size, the anchor
    // needs the same correction (see `glyphResizeAnchorOffset`'s own doc
    // comment for why a flipped axis gets none) or the fixed corner
    // silently creeps as the drag keeps pulling past it.
    const anchor = glyphResizeAnchorOffset(
      info.handle,
      resized.props.w,
      resized.props.h,
      next.w,
      next.h,
      { flippedX: info.scaleX < 0, flippedY: info.scaleY < 0 },
    );
    const rotated = new Vec(anchor.x, anchor.y).rot(shape.rotation);
    return {
      ...resized,
      x: resized.x + rotated.x,
      y: resized.y + rotated.y,
      props: { ...resized.props, ...next },
    };
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

  override onBeforeUpdate(_prev: BBoxGlyphShape, next: BBoxGlyphShape): BBoxGlyphShape | void {
    // WHY unconditional, no "did the cascade move?" early return: a
    // caller can hand `updateShape` a stale/wrong w/h directly (not just
    // sizePreset/size/padding) — the invariant this seam exists to hold is
    // "w/h always equal the footprint," full stop, not "only when I can
    // tell something relevant changed." An early return here is exactly
    // the gap `resizeGlyphProps`' own onResize normalization doesn't need
    // guarding against, since resizeBox always feeds it real numbers, but
    // an inspector number box or a scripted `updateShape({props:{w,h}}})`
    // has no such guarantee.
    const footprint = glyphShapeFootprint(next.props);
    return { ...next, props: { ...next.props, w: footprint.w, h: footprint.h } };
  }

  // Rotation is a stock fact: the rotate handle writes `shape.rotation`
  // itself, nothing here needs to react to it (docs/GLYPH-PLAN.md D2).

  // No `onClick` (see the class doc comment above and
  // `installGlyphClickToOpen`'s own) and no pointer handler on the
  // container below: this shape declares NOTHING that changes how the
  // select tool treats a press on it, which is exactly the point — every
  // one of select-on-enter, shift-add, group-drill and drag is tldraw's
  // own untouched code path for an ordinary shape.

  /**
   * With neither `canEdit` nor `onDoubleClick` declared, `SelectTool`'s
   * `Idle` state (the "shape" case) falls through `util.canCrop` and
   * `editor.canEditShape` to `handleDoubleClickOnCanvas` — its own
   * fallback for "a double click on something that can't edit" — which
   * creates a brand-new TEXT shape on top of this one and starts editing
   * it. Declaring `onDoubleClick` stops there instead: `Idle.ts` calls
   * `editor.updateShapes([change])` and returns as soon as ANY change
   * comes back, so an identity no-op absorbs the double click rather than
   * turning it into a second, unwanted gesture. D5 is a SINGLE click opens
   * the picker; leaving a double click inert (not opening it either) is
   * the plan's own click behaviour, taken literally. `bbox-port` and
   * `bbox-block` leave the same hole open — out of this lane's file, not
   * fixed here.
   */
  override onDoubleClick(shape: BBoxGlyphShape): TLShapePartial<BBoxGlyphShape> {
    return { id: shape.id, type: "bbox-glyph" };
  }

  override component(shape: BBoxGlyphShape) {
    ensureGlyphClickToOpenInstalled(this.editor);
    const { props } = shape;
    const container = useContainer();
    const isOpen = glyphOpenPickerAtom(this.editor).get() === shape.id;
    return (
      <HTMLContainer style={{ overflow: "visible" }}>
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
          // The container's default `pointer-events: none` (tldraw's own
          // `.tl-html-container` rule, left untouched above) means the
          // trigger this renders never receives a real DOM click anyway —
          // opening is decided entirely by `installGlyphClickToOpen`, not
          // by anything firing here. Base UI's popover content itself
          // renders through `portalContainer`, outside this subtree, so it
          // is unaffected and stays interactive once open. A `false` here
          // (Escape, outside-click, the popover's own close) still needs
          // to clear the atom — nothing else does that when the user
          // closes it from inside the picker rather than by clicking the
          // glyph again.
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
