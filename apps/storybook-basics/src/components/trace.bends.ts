// src/components/trace.bends.ts — ADDED, no donor as code. The MODEL is the
// donor's own `elbow/elbowPins.ts` (PORTED VERBATIM there, read at
// `./elbow/elbowPins.ts`, itself from SystemSketch): a dragged control point
// stores a normalized scalar pair in the frame spanned by the two endpoints,
// never an absolute `{x, y}`, so it survives the endpoints moving instead of
// stranding itself in space. See that file's own "Why not Excalidraw's
// `fixedSegments`" for the general argument against absolute points; D1 of
// docs/TRACE-CONTROL-POINTS-PLAN.md is that argument applied to a straight
// chord's `(t, o)` — a fraction ALONG the chord and an offset PERPENDICULAR
// to it — instead of `ElbowPin`'s axis-aligned `(index, axis, t, offset)`,
// because a `straight` route has one segment to bend, not N axis-aligned
// rails.
//
// Pure geometry, no React, no DOM — this is where the round-trip is
// unit-tested (`trace.bends.test.ts`).

import type { Point } from "./trace.layout";

/**
 * One intermediate control point on a `straight` trace, stored in the
 * chord's own frame so it survives the endpoints moving.
 *
 * `t` — fraction along start→end (may leave 0..1; a bend is allowed to sit
 *       "behind" the start, which is how a hairpin is drawn).
 * `o` — perpendicular offset from the chord in px, positive to the LEFT of
 *       the direction of travel.
 */
export interface TraceBend {
  t: number;
  o: number;
}

/**
 * Below this chord length the frame has no direction to build `(t, o)` from
 * — `start` and `end` are the same point, or close enough that floating
 * point noise would dominate the unit vector. D1's fallback: use the screen
 * axes instead of throwing, so both conversions below stay TOTAL functions
 * over every `start`/`end` pair, degenerate ones included.
 */
const DEGENERATE_CHORD_EPS = 1e-6;

/**
 * `(t, o)` → the absolute point it names, given the chord's current
 * endpoints.
 *
 * The chord's unit tangent is `u = (end - start) / |end - start|`. "Left of
 * the direction of travel" in SCREEN space (y grows down) is `u` rotated
 * -90°, i.e. `p = (u.y, -u.x)` — walking along `u = (1, 0)` (rightward on
 * screen), `p = (0, -1)` is "up", which is where a left hand points when
 * facing right on a page. The point is then `start + t * length * u + o * p`.
 */
export function traceBendPoint(bend: TraceBend, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < DEGENERATE_CHORD_EPS) {
    // No direction to build a frame from. Fall back to the screen axes — t
    // along +x, o along −y — so the conversion stays total (D1).
    return { x: start.x + bend.t, y: start.y - bend.o };
  }
  const ux = dx / length;
  const uy = dy / length;
  const px = uy;
  const py = -ux;
  return {
    x: start.x + ux * bend.t * length + px * bend.o,
    y: start.y + uy * bend.t * length + py * bend.o,
  };
}

/**
 * The inverse of {@link traceBendPoint}: an absolute point → the `(t, o)`
 * that names it in the CURRENT chord's frame. Because `u`/`p` above are
 * orthonormal, `t * length = (point - start) · u` and `o = (point - start)
 * · p` — a plain projection, and `traceBendFrom(traceBendPoint(bend, s, e),
 * s, e)` round-trips `bend` exactly (modulo float error).
 */
export function traceBendFrom(point: Point, start: Point, end: Point): TraceBend {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const relX = point.x - start.x;
  const relY = point.y - start.y;
  if (length < DEGENERATE_CHORD_EPS) {
    return { t: relX, o: -relY };
  }
  const ux = dx / length;
  const uy = dy / length;
  const px = uy;
  const py = -ux;
  return {
    t: (relX * ux + relY * uy) / length,
    o: relX * px + relY * py,
  };
}
