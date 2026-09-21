// src/shapes/wire/WireShapeUtil.tsx — `ss-wire`, the ONE edge kind.
//
// A wire is a DATA line and nothing else. There is no `variant: "control"`
// and there never will be (Zach, the 2026-09-18 ASK: "I didn't want to mix
// data lines and control lines. Because when you read Python code, the
// control is apparent from the structure itself"). Control flow is
// containment and arms — `parentId`, `ss-region`, `RegionArm` — so the
// validator below is the document-level enforcement: three data variants, no
// fourth.
//
// The shape/binding split is docs/TLDRAW-STARTER-KITS.md:169-206's finding,
// which both tldraw starter kits reached independently: "a connection is a
// custom shape AND two real bindings", never an arrow. The shape owns the
// paint and the hit geometry; `WireBindingUtil` owns which port each end
// landed on.
import { Polyline2d, ShapeUtil, T, createShapePropsMigrationSequence, type Editor, type TLBaseShape, type TLHandle, type TLHandleDragInfo, type TLShapePartial, type TLShapeUtilCanBindOpts, type VecLike } from "tldraw";

import type { ElbowPin } from "@trunk/components/elbow";
import { TRACE_HIT_CORRIDOR_PX } from "@trunk/components/trace.hit";

import { ElbowPinV, PointV } from "../shared/props";
import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import { WireFace } from "./WireFace";
import { wireAutomaticRoute, wirePinnedRoute, wireRoutePoints, wireRouteSegments, wireTerminals } from "./wireGeometry";

export interface WireShapeProps {
  variant: "data" | "async" | "delayed";
  routing: "straight" | "slanted" | "curved" | "elbow";
  color: string;
  /** Shape-local LOOSE terminal positions, read only for a terminal that has
   *  no binding. A bound terminal is re-derived from the port's measured
   *  anchor, never from these numbers. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  /**
   * P-028. The AUTHORED route: one `ElbowPin` per interior segment the user
   * has dragged. Empty — the default — means the route is AUTOMATIC and the
   * A* router owns every corner.
   *
   * WHY the persisted form is a pin and not the polyline the user sees: a pin
   * is a fraction in the frame spanned by the cable's two ENDPOINTS
   * (`@trunk/components/elbow/elbowPins.ts`, ported verbatim from
   * SystemSketch), so when a block moves, the authored corner moves WITH it.
   * Excalidraw stores a dragged segment as absolute element-local points and
   * Zach ruled that out by name: "When I drag the box, the arrow elbow stays
   * in the same place. This is not desirable."
   *
   * WHY there is no `routeMode: "auto" | "authored"` prop beside it, which is
   * what the donor's `ConnectionShapeUtil` carries: a mode flag and a pin
   * list are two answers to one question and can disagree. `pins.length > 0`
   * IS the mode, and it cannot be out of step with itself.
   *
   * READ BY ONE ROUTING. `traceGeometryBetween` hands `pins` to the router in
   * its `elbow` arm only; the three direct routings ignore them. That is why
   * switching a cable to `curved` does not clear this list — the authored
   * elbow is still there when you switch back.
   */
  pins: ElbowPin[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-wire": WireShapeProps;
  }
}

export type WireShape = TLBaseShape<"ss-wire", WireShapeProps>;

/**
 * The cable's polyline, widened into a GRAB CORRIDOR (P-003).
 *
 * THE PROBLEM. A wire paints a 2px line, and tldraw hit-tests an open
 * geometry at `distance < editor.getHitTestMargin()` — 3 screen px either
 * side of the centreline (`@tldraw/editor` `Editor.getShapeAtPoint`, the
 * final `else` of its per-shape loop, and `options.hitTestMargin: 3`). So a
 * cable could only be grabbed inside a 6px-wide corridor, which in practice
 * meant grabbing it at its ENDS, where the dots are big enough to aim at.
 *
 * WHY THE PAD LIVES ON `distanceToPoint` AND NOT ANYWHERE ELSE. Three
 * tempting alternatives, each rejected for a measured reason:
 *
 *   - `editor.options.hitTestMargin` is GLOBAL. Raising it to 6 widens the
 *     ring around every block and region too, and `blockHitTest.smoke.test.tsx`
 *     is built on that ring being 3.
 *   - a `ShapeUtil.hitTestPoint` override does not exist as a seam:
 *     `getShapeAtPoint` reads `geometry.distanceToPoint` directly and never
 *     asks the util.
 *   - a CLOSED ribbon polygon around the route changes which BRANCH of
 *     `getShapeAtPoint` the cable is judged by, and that branch skips any
 *     shape whose page bounds contain the viewport (`continue`) — i.e. a long
 *     cable stops being clickable exactly when you zoom in on it.
 *
 * Overriding `distanceToPoint` is the one lever that widens SELECTION and
 * HOVER together, because `Polyline2d.hitTestPoint` is literally
 * `distanceToPoint(point, hitInside) <= margin` and `isPointInShape` goes
 * through it. `nearestPoint` is deliberately NOT touched: binding and snapping
 * must keep landing on the real centreline, not on the corridor's edge.
 *
 * WHY THE PAD IS READ LIVE INSTEAD OF BAKED IN AT CONSTRUCTION: the corridor
 * is a SCREEN measurement (12 screen px, the trunk's own `TRACE_HIT_CORRIDOR_PX`)
 * while the geometry is in page space, so the conversion needs the current
 * zoom. tldraw caches the geometry OBJECT per shape record, not per camera —
 * a zoom-dependent number computed in the constructor would be stale the
 * moment anyone scrolled. Reading it inside the method costs one atom read per
 * hit-test and is always right.
 *
 * `Math.max(0, …)` is what keeps this from ever making a cable HARDER to hit
 * than stock: on a coarse pointer tldraw already uses a larger margin
 * (`coarseHitTestMargin`), and there the pad is simply zero.
 */
class WireGrabCorridor extends Polyline2d {
  constructor(
    config: ConstructorParameters<typeof Polyline2d>[0],
    private readonly editor: Editor,
  ) {
    super(config);
  }

  override distanceToPoint(point: VecLike, hitInside?: boolean): number {
    const stock = this.editor.getHitTestMargin();
    const wanted = TRACE_HIT_CORRIDOR_PX / 2 / this.editor.getZoomLevel();
    return super.distanceToPoint(point, hitInside) - Math.max(0, wanted - stock);
  }
}

/** The one spelling of a pin handle's id, so the two functions below are the
 *  only places that know it. */
const PIN_HANDLE_PREFIX = "pin:";

/** `pin:<segment index>` -> the index, or `null` for any handle that is not
 *  one of ours. Never a bare `parseInt` on the whole id: a future handle kind
 *  on this shape must not be silently read as a pin. */
function pinHandleIndex(handleId: string): number | null {
  if (!handleId.startsWith(PIN_HANDLE_PREFIX)) return null;
  const index = Number(handleId.slice(PIN_HANDLE_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * A valid tldraw fractional index for the n-th handle.
 *
 * `a0`..`az` in tldraw's own base-62 alphabet — 62 slots, where a route with
 * more than a handful of interior segments is already pathological. Past the
 * end every handle shares the last key, which only means the engine's
 * `sortByIndex` leaves them in the order they were generated; nothing here
 * reads a handle's index for anything but ordering (the shift-snap reference
 * `DraggingHandle` looks for is a `vertex` NEIGHBOUR, and these handles never
 * serve as one another's).
 */
const HANDLE_INDEX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function handleIndexKey(at: number): TLHandle["index"] {
  return `a${HANDLE_INDEX_ALPHABET[Math.min(at, HANDLE_INDEX_ALPHABET.length - 1)]}` as TLHandle["index"];
}

export class WireShapeUtil extends ShapeUtil<WireShape> {
  static override type = WIRE_SHAPE_TYPE;

  static override props = {
    // Three DATA variants. A control line is not a variant of a cable; it is
    // not a cable (plan §2). The validator is what makes that structural —
    // `documentModel.test.ts` puts a `variant: "control"` record at this
    // wall and requires it to throw.
    variant: T.literalEnum("data", "async", "delayed"),
    routing: T.literalEnum("straight", "slanted", "curved", "elbow"),
    color: T.string,
    start: PointV,
    end: PointV,
    pins: T.arrayOf(ElbowPinV),
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the
  // sequence is what gives these props a version number in a saved file, and
  // it cannot be retrofitted once boards exist.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): WireShapeProps {
    // Elbow is Zach's datum (plan §2, from the archive's own toolbar default
    // at /home/bam/systemsketch/src/toolbar/toolbarModel.ts:38-46): a system
    // diagram reads as orthogonal runs.
    // `pins: []` — a new cable is AUTOMATIC. Authoring is something the user
    // does, never a state a cable is born in.
    return { variant: "data", routing: "elbow", color: "", start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, pins: [] };
  }

  /**
   * A wire is a cable's OWN side (`fromId`) and never an endpoint (`toId`).
   *
   * WHY this is not simply `false`, which is what "a wire is never an
   * endpoint" reads like and what this method said until it was measured:
   * `editor.canBindShapes` asks BOTH utils —
   * `getShapeUtil(fromShapeType).canBind(...) &&
   * getShapeUtil(toShapeType).canBind(...)` (@tldraw/editor's
   * `Editor.canBindShapes`, and `createBindings` silently `continue`s on a
   * refusal) — so a flat `false` here refuses the wire's own start and end
   * bindings and no cable can ever be created. Measured: every case of
   * `src/wiring.smoke.test.tsx` timed out waiting for an `ss-wire` that was
   * never allowed to exist, with no error anywhere, because the refusal path
   * is a `continue`.
   *
   * The honest rule needs both ends named, and this is it: yes when the wire
   * is the FROM shape, no when it is the TO shape. Wire-to-wire would be a
   * junction — a real feature with real questions (where does the tee sit?
   * what happens when the host re-routes?) and no design yet — and tldraw
   * asks a single util when both types match, so the `toShapeType` clause is
   * what answers that case too.
   */
  override canBind(opts: TLShapeUtilCanBindOpts): boolean {
    const fromType: string = opts.fromShapeType;
    const toType: string = opts.toShapeType;
    return opts.bindingType === WIRE_BINDING_TYPE && fromType === WIRE_SHAPE_TYPE && toType !== WIRE_SHAPE_TYPE;
  }

  // A cable has no box to resize, nothing to rotate, and no text to edit. Its
  // shape IS its two ends, and those move by moving what they are bound to.
  override canResize(): boolean {
    return false;
  }

  override hideResizeHandles(): boolean {
    return true;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  override canEdit(): boolean {
    return false;
  }

  /**
   * The route, as a polyline the engine can hit-test and bound.
   *
   * WHY this reads the BOUND SHAPES' records instead of the wire's own props:
   * tldraw's geometry cache is a `createComputedCache` over the shape record,
   * and a computed tracks every signal read inside it — so reading the target
   * block's record here is exactly what makes the cached geometry invalidate
   * when that block moves. A version that read only `props.start`/`props.end`
   * would need a write to the wire on every frame of a block drag to stay
   * honest (see `WireBindingUtil`'s closing note for the write this avoids).
   *
   * `isFilled` is not offered by `Polyline2d`'s config and does not need to
   * be: a polyline is a line, so a click in the middle of the box a cable
   * spans is a click on the canvas. How WIDE that line is to a pointer is
   * `WireGrabCorridor`'s job — see its own note.
   */
  override getGeometry(shape: WireShape) {
    const { from, to } = wireTerminals(this.editor, shape);
    return new WireGrabCorridor({ points: wireRoutePoints(from, to, shape.props.routing, shape.props.pins) }, this.editor);
  }

  override getIndicatorPath(shape: WireShape) {
    const { from, to } = wireTerminals(this.editor, shape);
    const points = wireRoutePoints(from, to, shape.props.routing, shape.props.pins);
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) path.lineTo(point.x, point.y);
    return path;
  }

  /* ---------------------------------------------------------------- *
   * P-028 — authoring the route.
   *
   * tldraw's handle seam is used exactly as stock: `getHandles` publishes
   * grab points in SHAPE space, `select.idle` hit-tests them through its own
   * `shape_handle` overlay, and `DraggingHandle.update()` calls
   * `onHandleDrag` on every pointer move with the handle moved to the
   * pointer. Nothing here listens for a pointer itself — the gesture is the
   * engine's, which is ARCHITECTURE.md's rule for a canvas-spanning drag.
   *
   * WHY handles rather than a second in-shape affordance: a handle is only
   * offered when the cable is the ONLY selected shape
   * (`ShapeHandleOverlayUtil.isActive`), which is precisely "the user is
   * looking at this one cable" — and it costs no paint, no hit area and no
   * DOM on the other 99% of frames.
   * ---------------------------------------------------------------- */

  /**
   * One grab point per interior segment of the elbow route.
   *
   * `virtual` for a segment the router owns, `vertex` for one the user has
   * pinned — stock tldraw draws both, and the difference is the only place
   * "this route is authored" is visible on the canvas.
   *
   * A non-elbow routing gets NO handles, and that is a statement rather than
   * an omission: `pins` is read by the elbow router alone
   * (`wireGeometry.ts`'s `wireRoutePoints`), so a handle on a `curved` cable
   * would move a number that changes nothing on screen.
   */
  override getHandles(shape: WireShape): TLHandle[] {
    if (shape.props.routing !== "elbow") return [];
    const { from, to } = wireTerminals(this.editor, shape);
    return wireRouteSegments(from, to, shape.props.pins).map((segment, at) => ({
      id: `${PIN_HANDLE_PREFIX}${segment.index}`,
      type: segment.pinned ? "vertex" : "virtual",
      // A fractional index only orders handles; these are generated rather
      // than stored because the list is derived fresh from the route on every
      // read and has no identity to preserve between reads.
      index: handleIndexKey(at),
      x: segment.x,
      y: segment.y,
    }));
  }

  /**
   * The drag itself. `info.handle` arrives already moved to the pointer, in
   * shape space — and because every `ss-wire` sits at the page origin
   * (`WireFace`'s own note), shape space IS page space, so it can be handed
   * to the router untransformed.
   *
   * Returning `undefined` when the pin list did not change is not an
   * optimisation: `DraggingHandle.update()` writes the shape only when
   * `onHandleDrag` returns changes, so a segment that cannot be pinned
   * produces no record write at all instead of one identical write per
   * pointer move (and therefore no spurious entry under the single
   * `markHistoryStoppingPoint` the engine already opened).
   */
  override onHandleDrag(shape: WireShape, info: TLHandleDragInfo<WireShape>): TLShapePartial<WireShape> | undefined {
    const index = pinHandleIndex(info.handle.id);
    if (index === null || shape.props.routing !== "elbow") return undefined;
    const { from, to } = wireTerminals(this.editor, shape);
    const pins = wirePinnedRoute(from, to, shape.props.pins, index, { x: info.handle.x, y: info.handle.y });
    if (!pins) return undefined;
    return { id: shape.id, type: shape.type, props: { pins } };
  }

  /**
   * Double-click an authored corner to hand it back to the router — the
   * AUTHORED → AUTO direction, and the only way back short of deleting the
   * cable.
   *
   * WHY a double-click on the handle rather than a button in the selection
   * pill: the corner is the thing being un-authored, so the gesture lands on
   * it. This is also the seam stock tldraw already routes
   * (`SelectTool.Idle`'s `double_click` on `target: "handle"` calls
   * `onDoubleClickHandle` and, only if it returns nothing, falls through to
   * "start editing the shape"). Returning the changes is therefore also what
   * keeps a double-click on a cable from trying to edit it.
   */
  override onDoubleClickHandle(shape: WireShape, handle: TLHandle): TLShapePartial<WireShape> | undefined {
    const index = pinHandleIndex(handle.id);
    if (index === null) return undefined;
    const pins = wireAutomaticRoute(shape.props.pins, index);
    if (!pins) return undefined;
    return { id: shape.id, type: shape.type, props: { pins } };
  }

  override component(shape: WireShape) {
    return <WireFace shape={shape} />;
  }
}
