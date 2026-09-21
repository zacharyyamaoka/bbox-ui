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
import { Polyline2d, ShapeUtil, T, createShapePropsMigrationSequence, type Editor, type TLBaseShape, type TLShapeUtilCanBindOpts, type VecLike } from "tldraw";

import { TRACE_HIT_CORRIDOR_PX } from "@trunk/components/trace.hit";

import { PointV } from "../shared/props";
import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import { WireFace } from "./WireFace";
import { wireRoutePoints, wireTerminals } from "./wireGeometry";

export interface WireShapeProps {
  variant: "data" | "async" | "delayed";
  routing: "straight" | "slanted" | "curved" | "elbow";
  color: string;
  /** Shape-local LOOSE terminal positions, read only for a terminal that has
   *  no binding. A bound terminal is re-derived from the port's measured
   *  anchor, never from these numbers. */
  start: { x: number; y: number };
  end: { x: number; y: number };
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
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the
  // sequence is what gives these props a version number in a saved file, and
  // it cannot be retrofitted once boards exist.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): WireShapeProps {
    // Elbow is Zach's datum (plan §2, from the archive's own toolbar default
    // at /home/bam/systemsketch/src/toolbar/toolbarModel.ts:38-46): a system
    // diagram reads as orthogonal runs.
    return { variant: "data", routing: "elbow", color: "", start: { x: 0, y: 0 }, end: { x: 120, y: 0 } };
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
    return new WireGrabCorridor({ points: wireRoutePoints(from, to, shape.props.routing) }, this.editor);
  }

  override getIndicatorPath(shape: WireShape) {
    const { from, to } = wireTerminals(this.editor, shape);
    const points = wireRoutePoints(from, to, shape.props.routing);
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) path.lineTo(point.x, point.y);
    return path;
  }

  override component(shape: WireShape) {
    return <WireFace shape={shape} />;
  }
}
