// src/components/elbow/traceContract.ts — NET-NEW. The one file in this
// directory that is NOT a port, and it says so at the top on purpose: every
// other file here is a verbatim copy of SystemSketch's `src/blocks/elbow/`
// (plus `collisionRouting.ts`, a verbatim copy of its `collisionAwareRouting`),
// so a future re-sync can `diff` the directory against the donor and expect
// silence. This file is the seam that lets the donor core be driven by THIS
// repo's frozen endpoint contract, and it is deliberately tiny.
//
// It derives nothing new. `traceSideOf` — the whole `side(from) = from.dir`,
// `side(to) = OPPOSITE_DIR[to.dir]` rule — already lives in
// `../trace.layout.ts` where the contract was frozen (docs/TRACE-PLAN.md).
// All this adds is the assembly.

import type { TraceTerminalSpec, Point } from "../trace.layout";
import { traceSideOf } from "../trace.layout";
import type {
  ElbowPin,
  ElbowRect,
  ElbowRoute,
  ElbowRouteInput,
  ElbowRouteOptions,
  ElbowRoutingObstacle,
} from "./index";

export interface TraceElbowRequest {
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  /** Keep-outs the route must not cross. A story fixture IS this list —
   * there is no obstacle COLLECTOR here, by design (the donor's
   * `routingObstacles.ts` reads live tldraw shapes and stayed behind). */
  obstacles?: readonly ElbowRoutingObstacle[];
  /** The owning card's box, when a terminal sits on one. Endpoint boxes get
   * the router's special treatment: the first/last leg may cross its own
   * card while leaving through the port, but no later segment may re-enter. */
  fromBox?: ElbowRect | null;
  toBox?: ElbowRect | null;
  pins?: readonly ElbowPin[];
  options?: Partial<ElbowRouteOptions>;
}

/**
 * `{x, y, dir}` pairs -> the router's `ElbowRouteInput`.
 *
 * The only interesting line is the side derivation, and it is NOT symmetric:
 * a wire LEAVES the `from` terminal along the flow, and ARRIVES at the `to`
 * terminal travelling `to.dir` — so the free space at the `to` end is BEHIND
 * it, which is `OPPOSITE_DIR[to.dir]`. Getting this backwards produces routes
 * that look plausible in the classic left-to-right case (where the two happen
 * to coincide) and loop absurdly for every other tangent, which is exactly
 * why the rule was frozen in the plan rather than re-derived per lane.
 */
export function elbowInputFromTerminals(request: TraceElbowRequest): ElbowRouteInput {
  const { from, to, obstacles, fromBox, toBox, pins, options } = request;
  return {
    start: { point: { x: from.x, y: from.y }, side: traceSideOf(from, "from"), box: fromBox ?? null },
    end: { point: { x: to.x, y: to.y }, side: traceSideOf(to, "to"), box: toBox ?? null },
    ...(obstacles ? { obstacles } : {}),
    ...(pins ? { pins } : {}),
    ...(options ? { options } : {}),
  };
}

/** The route's vertices as this app's `Point[]` — what `TraceBody`'s `points`
 * prop and `TraceBadge`'s drag math both take. A structural copy, so a caller
 * mutating it cannot reach back into a route. */
export function routePoints(route: ElbowRoute): Point[] {
  return route.points.map((point) => ({ x: point.x, y: point.y }));
}
