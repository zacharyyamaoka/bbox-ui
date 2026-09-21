// src/components/trace.hit.ts — the polyline a cable can be GRABBED by, for
// any of the four routings. Pure: no React, no DOM, no canvas engine.
//
// WHY this exists at all, and why it is not just `TraceGeometry.points`:
// `traceGeometry` answers `points: null` for `curved` and it is right to —
// "a cubic HAS no vertices, and `routeTrace` already says so rather than
// inventing some" (trace.tsx:656-660). But a HOST that hit-tests a cable
// needs a polyline for every routing, not three out of four, and the honest
// answer for a curve is a FLATTENING of the same cubic that gets drawn —
// not its chord.
//
// The chord is what a host reaches for when this function does not exist,
// and it is measurably wrong: `wireGeometry.ts` (apps/systemsketch) shipped
// `geometry.points ?? [geometry.start, geometry.end]` and said so out loud —
// "its hit geometry is the chord between its two terminals — up to a few
// tens of px away from the drawn bow at its middle". On a 300px span the
// default cubic bows ~50px off its chord, so a click on the middle of a
// visibly-drawn curve lands on empty canvas.
//
// NOTHING IS RE-DERIVED HERE. The control points come from
// `getConnectionControlPoints` / `getBentCurveCubicControlPoints` — the same
// two exported functions `defaultCurvedPath` and `bentCurvedPath` call to
// build the `d` that is painted, given the same `start`/`end`/`sides` the
// geometry carries. A second copy of the curve's control-point rule is
// exactly the drift `traceGeometryBetween`'s own `sides` note warns about
// ("a second derivation of one number is how the two stop agreeing").
import type { Point } from "./trace.layout";
import {
  getBentCurveCubicControlPoints,
  getConnectionControlPoints,
  type TraceCurve,
} from "./trace.routing";
import type { TraceGeometry } from "./trace";

/**
 * The full width, in SCREEN px, of the corridor a host should let a pointer
 * grab a cable by.
 *
 * 12 is the trunk's own published number for this — `TRACE_HIT_STROKE_PX`
 * (trace.tsx), the invisible band `Trace interactive` paints and
 * `hitRegions/HitRegionsTrace.stories.tsx` measures. Restated here as a
 * separate constant rather than imported, because the two are different
 * MECHANISMS that happen to agree: that one is an SVG stroke width in a DOM
 * host, this one is a number an engine host converts into its own hit-test
 * margin. Coupling them would make a change to the DOM band silently change
 * a canvas engine's geometry.
 */
export const TRACE_HIT_CORRIDOR_PX = 12;

/**
 * How many straight segments a flattened cubic is cut into.
 *
 * 16 is chosen against the corridor, not by taste. The worst-case sagitta of
 * a cubic segment spanning 1/16 of a curve is far under 1px for the spans
 * this kit draws (the default control reach is capped at 140px by
 * `getConnectionControlPoints`), so the flattening error disappears inside a
 * corridor that is 6px wide either side of the line. `trace.hit.test.ts`
 * measures that claim rather than asserting it.
 */
const CURVE_SAMPLES = 16;

function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

export interface TraceHitPolylineOptions {
  /** The bend, when the cable carries one — the same `curve` that was handed
   *  to `traceGeometry`. A `curved` trace with a bend is drawn as a QUADRATIC
   *  (`bentCurvedPath`), not the default cubic, so flattening the default one
   *  would miss the drawn path by the whole bend. */
  curve?: TraceCurve | null;
  /** Segments per curve. Defaults to `CURVE_SAMPLES`; exposed so a test can
   *  drive the flattening error down and show it converging. */
  samples?: number;
}

/**
 * The drawn route as a polyline, for every routing.
 *
 * `straight`, `slanted` and `elbow` already carry exact vertices and are
 * returned untouched — this function must never re-route them. Only `curved`
 * is flattened, and only because a cubic has no vertices to return.
 */
export function traceHitPolyline(geometry: TraceGeometry, options: TraceHitPolylineOptions = {}): Point[] {
  if (geometry.points) return [...geometry.points];

  const start: Point = { x: geometry.start.x, y: geometry.start.y };
  const end: Point = { x: geometry.end.x, y: geometry.end.y };
  const [c1, c2] = options.curve
    ? getBentCurveCubicControlPoints(start, end, options.curve)
    : getConnectionControlPoints(start, end, geometry.sides);

  const samples = Math.max(2, Math.floor(options.samples ?? CURVE_SAMPLES));
  const points: Point[] = [];
  for (let step = 0; step <= samples; step++) {
    points.push(cubicAt(start, c1, c2, end, step / samples));
  }
  return points;
}
