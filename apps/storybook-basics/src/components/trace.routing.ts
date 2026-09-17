// src/components/trace.routing.ts — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/blocks/connections/connectionRouting.ts:1-134,204-248` —
//     `getConnectionControlPoints`, `defaultCurvedPath`,
//     `defaultCurvedMidpoint`, `getCurveWaypoint`, `bentCurvedPath`,
//     `getBentCurveCubicControlPoints`, and the kind dispatch. Every
//     per-function WHY travels with its function (docs/TRACE-PLAN.md's
//     provenance rule).
//   • `src/systemSketchArrow.tsx:424-502` — `getSlantedArrowDeparture`,
//     `getSlantedArrowPoints`, and the ELK-POLYLINE / React-Flow
//     `sourcePosition` provenance comment, verbatim.
//
// WHAT CHANGED in the port, exhaustively — so a future re-sync is a diff
// and not an archaeology exercise:
//
//   1. tldraw's `Vec`/`VecLike` -> the frozen `Point` from `./trace.layout`.
//      The donor used `Vec` purely as an {x, y} carrier here (no `.add`,
//      no `.len`, no `.uni`), so this is a type substitution, not a
//      behaviour change. `Vec.From(start)` becomes a plain object copy.
//   2. tldraw's `clamp` -> the local three-liner below, same semantics.
//   3. The slanted departure's EDITOR lookup is DROPPED:
//      `slantedDepartureFromStartBinding` read a tldraw binding's
//      `normalizedAnchor` to guess which face an arrow left by. A
//      `TraceTerminalSpec` STATES its flow tangent, so `departure =
//      from.dir` and the guess is unnecessary. The loose-endpoint fallback
//      `getSlantedArrowDeparture` still ports — it is the honest answer
//      when no tangent is known at all, and `routeTrace` never needs it.
//   4. The dispatch's `elbow` case is DROPPED — `components/elbow/` (P3)
//      owns that router. `DirectRouting` names the three kinds this file
//      serves, so asking for `elbow` here is a type error at the call
//      site rather than a runtime throw or a silent fallback to curved
//      (which is what the donor's `getConnectionPath` does when it has no
//      route: `connectionRouting.ts:216`).
//   5. `ConnectionRoutingKind` -> `DirectRouting`, `ConnectionCurve` ->
//      `TraceCurve`, `ConnectionExitSide` -> the frozen `TraceDir` (the
//      two were already the identical four strings, which is why the
//      frozen contract chose that vocabulary).
//
// ADDED here, in neither donor, each marked again at its own definition:
// `routeTrace`'s `{ path, points, waypoint, sides }` result, the slanted
// waypoint, `slantedAutomaticLead`, and `TRACE_ROUTING_TANGENTS` /
// `routingTangents`.
//
// Zero imports of a canvas engine, zero DOM, zero React: points in,
// points out.

import {
  polylinePath,
  traceSideOf,
  type Point,
  type TraceDir,
  type TraceRouting,
  type TraceTerminalSpec,
} from "./trace.layout";

/**
 * PORTED substitution for tldraw's `clamp` (`connectionRouting.ts:15`
 * imported it). Identical semantics. Restated locally because the whole
 * point of this app is that a routing function imports no canvas engine
 * (repo CLAUDE.md, "the one rule the design rests on").
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * The routings this file serves. `elbow` is deliberately absent: it is
 * P3's `components/elbow/` A* router, ~2,300 verbatim lines that have no
 * business being imported by a 200-line geometry module. Typed as a
 * subset of the frozen `TraceRouting` so the two can never drift apart —
 * add a fourth kind to the contract and this line stops compiling.
 */
export type DirectRouting = Extract<TraceRouting, "straight" | "slanted" | "curved">;

export const DIRECT_ROUTINGS = [
  "straight",
  "slanted",
  "curved",
] as const satisfies readonly DirectRouting[];

/** Offset of a bent route's visible midpoint from the endpoint midpoint.
 * PORTED as `ConnectionCurve` (`connectionRouting.ts:29-32`). */
export interface TraceCurve {
  dx: number;
  dy: number;
}

/* ------------------------- curved (kit default) ------------------------- */

/**
 * Which way a cable leaves the face it is welded to. PORTED as
 * `ConnectionExitSides` (`connectionRouting.ts:39-42`); the donor's
 * `ConnectionExitSide` union is the frozen `TraceDir`, unchanged.
 *
 * NOTE these are EXIT sides, not flow tangents — the normal points AWAY
 * from the endpoint into free space. `traceSideOf` is what converts a
 * terminal's flow tangent into one of these, and it is the only place
 * that conversion happens.
 */
export interface TraceExitSides {
  start?: TraceDir;
  end?: TraceDir;
}

const EXIT_NORMAL: Readonly<Record<TraceDir, Point>> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/**
 * The kit's default cubic, leaving each end along its own face normal.
 *
 * WHY the sides matter: the original always offset horizontally, which is the
 * whole truth only while every port lives on a left or right edge. Once a
 * socket can sit on the top or bottom wall, a horizontal control point makes
 * the curve leave the face TANGENTIALLY — it slides along the card's underside
 * before turning, instead of departing perpendicular to the wall it is welded
 * to. The elbow router already reads `elbowSide` for exactly this reason; this
 * is the curved renderer catching up to the same fact.
 *
 * An absent side keeps the historical horizontal behaviour, so every cable
 * between two ordinary left/right ports draws exactly as it always did.
 */
export function getConnectionControlPoints(
  start: Point,
  end: Point,
  sides: TraceExitSides = {},
): [Point, Point] {
  const distance = end.x - start.x;
  const horizontalOffset = Math.max(
    30,
    distance > 0 ? distance / 3 : clamp(Math.abs(distance) + 30, 0, 100),
  );
  const verticalDistance = end.y - start.y;
  const verticalOffset = Math.max(
    30,
    Math.abs(verticalDistance) > 0 ? Math.min(Math.abs(verticalDistance) / 3 + 30, 140) : 30,
  );
  const control = (point: Point, side: TraceDir | undefined, fallbackX: number): Point => {
    if (!side) return { x: point.x + fallbackX, y: point.y };
    const normal = EXIT_NORMAL[side];
    const reach = normal.x !== 0 ? horizontalOffset : verticalOffset;
    return { x: point.x + normal.x * reach, y: point.y + normal.y * reach };
  };
  return [control(start, sides.start, horizontalOffset), control(end, sides.end, -horizontalOffset)];
}

export function defaultCurvedPath(start: Point, end: Point, sides?: TraceExitSides): string {
  const [cp1, cp2] = getConnectionControlPoints(start, end, sides);
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;
}

export function defaultCurvedMidpoint(start: Point, end: Point, sides?: TraceExitSides): Point {
  const [cp1, cp2] = getConnectionControlPoints(start, end, sides);
  // Cubic Bezier at t=.5: (P0 + 3P1 + 3P2 + P3) / 8.
  return {
    x: (start.x + 3 * cp1.x + 3 * cp2.x + end.x) / 8,
    y: (start.y + 3 * cp1.y + 3 * cp2.y + end.y) / 8,
  };
}

/* --------------------- bend (an activated control point) ----------------- */

/** Where the control point sits once it has been dragged. */
export function getCurveWaypoint(start: Point, end: Point, curve: TraceCurve): Point {
  return { x: (start.x + end.x) / 2 + curve.dx, y: (start.y + end.y) / 2 + curve.dy };
}

export function bentCurvedPath(start: Point, end: Point, curve: TraceCurve): string {
  // Quadratic control that makes the path cross the waypoint at t=0.5.
  const controlX = (start.x + end.x) / 2 + curve.dx * 2;
  const controlY = (start.y + end.y) / 2 + curve.dy * 2;
  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}

/** The bent quadratic expressed as a cubic, for a host that wants one
 * (the donor fed tldraw's `CubicBezier2d`). */
export function getBentCurveCubicControlPoints(
  start: Point,
  end: Point,
  curve: TraceCurve,
): [Point, Point] {
  const controlX = (start.x + end.x) / 2 + curve.dx * 2;
  const controlY = (start.y + end.y) / 2 + curve.dy * 2;
  return [
    { x: start.x + (2 / 3) * (controlX - start.x), y: start.y + (2 / 3) * (controlY - start.y) },
    { x: end.x + (2 / 3) * (controlX - end.x), y: end.y + (2 / 3) * (controlY - end.y) },
  ];
}

/* --------------------------------- slanted -------------------------------- */

/**
 * The endpoint-gapped polyline used by established graph routers, not a new
 * obstacle solver. `getConnectionControlPoints` is already our shared
 * readable-output lead; rotating its scalar lead gives this arrow a short run
 * along the source direction.
 *
 * WHY: ELK's POLYLINE option is the right prior art for the short-then-sloped
 * reading, while React Flow makes that first direction explicit as
 * `sourcePosition`. SystemSketch reads the bound source face when it has one;
 * a loose tldraw arrow uses its dominant endpoint axis. Neither case asks a
 * layout engine to move author-owned endpoints, and SVG orients the endpoint
 * marker along the final segment.
 *
 * PORT NOTE: "reads the bound source face when it has one" is the editor
 * lookup this port drops (change 3 in the header) — here the source face
 * IS `from.dir`, stated rather than inferred. This fallback survives for
 * the case with no stated tangent at all.
 */
export function getSlantedArrowDeparture(start: Point, end: Point): TraceDir {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function slantedDepartureAxis(departure: TraceDir): "x" | "y" {
  return departure === "left" || departure === "right" ? "x" : "y";
}

function slantedDepartureSign(departure: TraceDir): number {
  return departure === "right" || departure === "bottom" ? 1 : -1;
}

export function getSlantedArrowPoints(
  start: Point,
  end: Point,
  elbowT: number | null = null,
  departure: TraceDir = getSlantedArrowDeparture(start, end),
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // The documented degeneracy: with either delta under a thousandth of a
  // pixel there is no diagonal left to draw, so the lead would BE the whole
  // line. Two points — i.e. exactly what `straight` returns, which the
  // `Routings` story asserts rather than describes.
  if (Math.abs(dx) < 0.001 || Math.abs(dy) < 0.001) {
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ];
  }
  const axis = slantedDepartureAxis(departure);
  const span = axis === "x" ? Math.abs(dx) : Math.abs(dy);
  // Run the shared output-gap helper in a canonical positive axis. The helper
  // is deliberately direction-agnostic here: departing left/up needs the same
  // readable lead as departing right/down.
  const [control] = getConnectionControlPoints({ x: 0, y: 0 }, { x: span, y: 0 });
  const automaticLead = Math.min(Math.abs(control.x), span / 2);
  const lead = elbowT === null ? automaticLead : span * Math.max(0, Math.min(1, elbowT));
  const signedLead = slantedDepartureSign(departure) * lead;
  const elbow =
    axis === "x"
      ? { x: start.x + signedLead, y: start.y }
      : { x: start.x, y: start.y + signedLead };
  return [{ x: start.x, y: start.y }, elbow, { x: end.x, y: end.y }];
}

/**
 * ADDED (neither donor exports this): the automatic lead on its own, so a
 * caller can SAY what `slantT: null` resolves to instead of restating the
 * `min(|control.x|, span/2)` expression somewhere else and drifting from
 * it. Reads the same helper `getSlantedArrowPoints` reads, on purpose —
 * two derivations of one number is how they stop agreeing.
 */
export function slantedAutomaticLead(span: number): number {
  const [control] = getConnectionControlPoints({ x: 0, y: 0 }, { x: span, y: 0 });
  return Math.min(Math.abs(control.x), span / 2);
}

/* ----------------------------- kind dispatch ----------------------------- */

export interface TraceRouteOptions {
  /**
   * `straight` and `curved`: offset of the visible midpoint from the
   * endpoint midpoint — the centre control point, once dragged. Absent or
   * `null` is the un-bent default.
   */
  curve?: TraceCurve | null;
  /**
   * `slanted` only: where along the departure axis the single bend sits,
   * 0..1 (the donor's `elbowT`). Absent or `null` is the automatic
   * readable lead.
   */
  slantT?: number | null;
}

/**
 * ADDED (the donor splits this across `getConnectionPath` and
 * `getConnectionCenterPoint`, which each recompute the same control
 * points). One call, one derivation, four facts:
 */
export interface TraceRoute {
  routing: DirectRouting;
  /** The SVG `d`. */
  path: string;
  /**
   * Exact vertices, or `null` when the route is a Bezier and therefore
   * HAS no vertices. `null` is not "not computed yet" — it is the honest
   * answer, and the reason P6 measures a curved trace's polyline off the
   * mounted `SVGPathElement` (`getPointAtLength`) instead of asking this
   * module for one it cannot truthfully supply.
   */
  points: Point[] | null;
  /**
   * Where the centre control point sits — the donor's
   * `getConnectionCenterPoint` (`connectionRouting.ts:226-248`) for
   * straight/curved. The `slanted` case is ADDED: the donor has none,
   * because slanted lives on a different surface there, and the honest
   * answer is the elbow vertex, since that is the point `slantT` moves.
   */
  waypoint: Point;
  /** The exit sides actually consumed, via `traceSideOf`. Exposed so a
   * gallery can SHOW the `side(to) = OPPOSITE_DIR[to.dir]` derivation
   * rather than restate it beside the thing it describes. */
  sides: { start: TraceDir; end: TraceDir };
}

export function routeTrace(
  routing: DirectRouting,
  from: TraceTerminalSpec,
  to: TraceTerminalSpec,
  options: TraceRouteOptions = {},
): TraceRoute {
  const start: Point = { x: from.x, y: from.y };
  const end: Point = { x: to.x, y: to.y };
  const sides = { start: traceSideOf(from, "from"), end: traceSideOf(to, "to") };
  const curve = options.curve ?? null;
  const midpoint: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  switch (routing) {
    case "straight": {
      // WHY this branch is not simply a line: the donor's `straight` with
      // a dragged control point calls the SAME `bentCurvedPath` as
      // `curved` (`connectionRouting.ts:212-214`). Bending a straight line
      // does not produce a second kind of curve — it produces THE curve.
      // The gallery states that in one caption and one assertion on the
      // two `d` strings, rather than shipping two functions somebody has
      // to keep identical by hand.
      if (curve) {
        return {
          routing,
          path: bentCurvedPath(start, end, curve),
          points: null,
          waypoint: getCurveWaypoint(start, end, curve),
          sides,
        };
      }
      const points = [start, end];
      return { routing, path: polylinePath(points), points, waypoint: midpoint, sides };
    }
    case "slanted": {
      const points = getSlantedArrowPoints(start, end, options.slantT ?? null, from.dir);
      return {
        routing,
        path: polylinePath(points),
        points,
        // Degenerate slanted (see `getSlantedArrowPoints`) has two points
        // and therefore no bend for a control point to sit on; the chord
        // midpoint is then the only truthful answer.
        waypoint: points.length === 3 ? points[1] : midpoint,
        sides,
      };
    }
    case "curved":
    default: {
      if (curve) {
        return {
          routing: "curved",
          path: bentCurvedPath(start, end, curve),
          points: null,
          waypoint: getCurveWaypoint(start, end, curve),
          sides,
        };
      }
      return {
        routing: "curved",
        path: defaultCurvedPath(start, end, sides),
        points: null,
        waypoint: defaultCurvedMidpoint(start, end, sides),
        sides,
      };
    }
  }
}

/* --------------------------- tangent fidelity ---------------------------- */

/**
 * ADDED. How a routing treats the flow tangent at one end.
 *
 * "blind" is a FALSIFIABLE claim, not a vibe: it means the returned
 * geometry is INVARIANT under changing that end's `dir` — swap the dir
 * with the coordinates held fixed and you get a byte-identical `path`.
 * `TraceRouting.stories.tsx` proves every cell of the table that way,
 * rather than by eyeballing an arrival angle, because an arrival angle
 * can agree with a tangent by COINCIDENCE: a straight chord between two
 * horizontally separated terminals arrives travelling "right" without the
 * function ever having read a `dir`. That coincidence is exactly what
 * docs/TRACE-PLAN.md's matrix means by "looks right (chord happens to
 * align)", and it is why a cell is labelled from this table rather than
 * from what it happens to look like.
 *
 * `elbow` is deliberately NOT in this table. Declaring it honored/honored
 * here would be this lane asserting something about a router it does not
 * own and has never run; P3/P6 add that row where the evidence is.
 */
export type TangentFidelity = "honored" | "blind";

export interface RoutingTangents {
  from: TangentFidelity;
  to: TangentFidelity;
}

/** The DEFAULT route's fidelity — no control point dragged. */
export const TRACE_ROUTING_TANGENTS: Record<DirectRouting, RoutingTangents> = {
  straight: { from: "blind", to: "blind" },
  slanted: { from: "honored", to: "blind" },
  curved: { from: "honored", to: "honored" },
};

/**
 * Fidelity for an ACTUAL call, control point included.
 *
 * WHY this is a function and not just the table above: a BENT curve is
 * tangent-blind at both ends. `bentCurvedPath` takes only
 * `(start, end, curve)` — it never receives `sides` at all
 * (`connectionRouting.ts:115-120`), so dragging the centre control point
 * silently costs a curved trace both of the tangents its default cubic
 * honours. That is a real limitation of the donor's own model, surfaced
 * by porting it; the `BentCurveDropsTangents` story renders it instead of
 * hiding it, and this branch is what stops a caption claiming otherwise.
 */
export function routingTangents(
  routing: DirectRouting,
  options: TraceRouteOptions = {},
): RoutingTangents {
  if (routing === "curved" && options.curve) return { from: "blind", to: "blind" };
  return TRACE_ROUTING_TANGENTS[routing];
}

export function honorsTangent(
  routing: DirectRouting,
  end: "from" | "to",
  options: TraceRouteOptions = {},
): boolean {
  return routingTangents(routing, options)[end] === "honored";
}
