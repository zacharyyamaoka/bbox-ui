// src/scene/portEdgeCrossing.ts — "take a trace in, output a location out."
//
// Zach, 2026-09-18: "this line intersection logic with the port edge is
// super helpful and 100% we should implement pure functions for it as it's
// used again and again — kind of it should take a trace in, and output like
// a location out."
//
// ── WHAT IS ALREADY WRITTEN, AND WHY THIS FILE IS THIN ──────────────────
//
// The intersection math he is describing ALREADY EXISTS in this repo, and
// it already names his exact use case. `src/components/elbow/
// boundaryCrossing.ts` is a byte-for-byte copy of SystemSketch's
// `src/blocks/elbow/boundaryCrossing.ts` (copied 2026-09-17 under that
// file's "zero code edits" banner), and its own docstring lists, verbatim:
//
//     * a group or frame boundary port, for a cable that crosses in or out
//       of a collapsed group;
//
// It is Liang–Barsky, exact, handles diagonal segments, and documents its
// corner/boundary tie-breaks. Writing a second clipper here would be the
// "two derivations of one number is how they stop agreeing" failure
// `trace.routing.ts`'s `slantedAutomaticLead` header already warns about,
// and it would compete with a donor suite that was written against the
// donor, by the donor, before this repo existed.
//
// So this file writes NO intersection math. It is the SCENE-LAYER ADAPTER
// over that clipper, and it exists because the clipper's answer is not yet
// the answer a port needs. `BoundaryCrossing` reports `{point, side, t,
// distance}` where `t` is "position along the SEGMENT that crossed" — an
// artefact of which polyline segment happened to straddle the wall. What
// places a port is "how far along THAT WALL", which is a different number
// entirely and is nowhere in the donor. Converting one to the other, plus
// the two honesty facts below, is the whole job:
//
//   1. A ROUTE IS NOT ALWAYS A POLYLINE. `TraceRoute.points` is `null` for
//      a curved trace — its own doc: "`null` is not 'not computed yet' — it
//      is the honest answer". Zach asked for "best-effort from where the
//      wire or a straight line crosses the edge", so the chord stands in —
//      and `by: "chord"` says so in the result rather than letting a
//      caller mistake an approximation for a measurement.
//   2. THE INSET IS PART OF THE ANSWER. `boundaryCrossings` insets the box
//      before testing and returns a point on the INSET wall. Normalising
//      that point against the un-inset box silently pushes `t` outside
//      0..1. The normalisation below uses the same inset bounds that
//      produced the crossing.
//
// ── PROVENANCE ──────────────────────────────────────────────────────────
// Class (c) "ours, ad hoc" per docs/ALGORITHM-PROVENANCE.md: `alongSide` is
// a linear remap, not an algorithm, and no prior art is claimed for it. The
// clipper it stands on is class (a) and is cited above. Nothing here is
// from memory.
//
// Pure: no React, no DOM, no canvas engine — `src/scene/`'s rule. It
// imports `src/components/elbow/`, which is itself dependency-free by
// design ("must stay importable from a plain node script"), and types from
// `src/components/port.layout`. It WRITES nothing there.

import {
  boundaryCrossings,
  boundsOfRect,
  type BoundaryCrossing,
  type CrossingDirection,
  type ElbowBounds,
  type ElbowPoint,
  type ElbowRect,
  type ElbowSide,
} from "../components/elbow";
import type { BlockSide } from "../components/port.layout";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * `ElbowSide` and `BlockSide` are the SAME four strings — `'top' | 'right'
 * | 'bottom' | 'left'` in `elbow/geometry.ts`, `"left" | "right" | "top" |
 * "bottom"` in `port.layout.ts`. This assignment is the proof, checked by
 * the compiler on every build: add a fifth member to either and this line
 * stops compiling, which is the moment to write a translation table — not
 * before. No runtime mapping exists precisely because none is needed.
 */
const SIDES_AGREE: readonly BlockSide[] = ["top", "right", "bottom", "left"] satisfies readonly ElbowSide[];
void SIDES_AGREE;

/** A route that has real vertices, or a straight chord standing in for one
 *  that does not. Both spellings accepted so a caller never has to decide
 *  which shape this function wants. */
export interface TraceChord {
  start: ElbowPoint;
  end: ElbowPoint;
}

export type TraceGeometry = readonly ElbowPoint[] | TraceChord;

/** How the polyline under a location was obtained. Never inferred by the
 *  caller — `"chord"` means the real curve was never consulted. */
export type CrossingSource = "route" | "chord";

export interface ResolvedPolyline {
  points: readonly ElbowPoint[];
  by: CrossingSource;
}

/**
 * Where a derived port belongs on a box's wall. This is the shape the
 * rendering lane paints and the shape `boundary.ts` promotes with.
 *
 * `t` is the field this module exists to produce; everything else is
 * forwarded from the donor crossing unchanged.
 */
export interface PortEdgeLocation {
  /** Which wall. Same four strings as the elbow router's `ElbowSide`. */
  side: BlockSide;
  /**
   * How far along that wall, 0..1, in the wall's own READING direction:
   * left→right on `top`/`bottom`, top→bottom on `left`/`right`. That is
   * the same main-axis convention `blockPort.layout.ts`'s `railBoxFor`
   * lays its rails out in (its column-axis case runs `bandStart` →
   * `bandEnd` downward; its row-axis case runs `blockLeft` rightward), so
   * a `t` handed to a rail needs no flip.
   *
   * Clamped to 0..1. A degenerate wall (zero extent on its main axis)
   * yields 0 — the only finite answer, and not an error.
   */
  t: number;
  /** The crossing point itself, in the box's own space. On the INSET wall
   *  when an inset was given — see this file's header, fact 2. */
  point: ElbowPoint;
  /** Leaving the box, or entering it. The donor's own word. */
  direction: CrossingDirection;
  /** Arc length from the start of the path, so several crossings order. */
  distance: number;
  /** `"route"` — measured on the cable's real vertices. `"chord"` — the
   *  route had none (a Bezier: `TraceRoute.points === null`), so a
   *  straight line between its endpoints stood in. */
  by: CrossingSource;
}

export interface PortEdgeCrossingOptions {
  /** Grow (+) or shrink (−) the box before testing, in the box's units —
   *  forwarded verbatim to `boundaryCrossings`, and also applied to the
   *  bounds `t` is normalised against. */
  inset?: number;
  /** Tolerance for "on the boundary". Forwarded verbatim. */
  epsilon?: number;
}

/* ------------------------------------------------------------------ */
/* The two numbers this file actually computes                         */
/* ------------------------------------------------------------------ */

function insetBounds(bounds: ElbowBounds, amount: number): ElbowBounds {
  if (!amount) return bounds;
  const [minX, minY, maxX, maxY] = bounds;
  return [minX - amount, minY - amount, maxX + amount, maxY + amount];
}

/**
 * The remap the donor does not do: a point known to sit on `side` of
 * `bounds`, as a 0..1 position ALONG that side.
 *
 * WHY this is not `BoundaryCrossing.t`: the donor's `t` is "position along
 * the polyline SEGMENT that crossed", so it moves when the cable is
 * re-routed with a different number of bends even though the cable still
 * meets the wall in exactly the same place. A port placed from that number
 * would slide for no visible reason. This one depends only on the geometry
 * of the meeting.
 *
 * Exported because the rendering lane needs it standalone: given a port
 * already placed at a point, it answers "where on the rail".
 */
export function alongSide(bounds: ElbowBounds, side: BlockSide, point: ElbowPoint): number {
  const [minX, minY, maxX, maxY] = bounds;
  const horizontal = side === "top" || side === "bottom";
  const span = horizontal ? maxX - minX : maxY - minY;
  // A wall with no length has no "along" — 0 is the only finite answer,
  // and a zero-extent box is a legal (if silly) input, not a throw.
  if (!(span > 0)) return 0;
  const raw = horizontal ? (point.x - minX) / span : (point.y - minY) / span;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/**
 * A route's polyline, or the honest chord standing in for it.
 *
 * `route.points` is `TraceRoute.points` — `null` for `curved`, by that
 * type's own deliberate contract. `chord` is where the cable actually
 * starts and ends, which `TraceRoute` does not carry, so the caller
 * supplies it.
 */
export function tracePolyline(
  route: { readonly points: readonly ElbowPoint[] | null } | null | undefined,
  chord: TraceChord,
): ResolvedPolyline {
  const points = route?.points;
  if (points && points.length >= 2) return { points, by: "route" };
  return { points: [chord.start, chord.end], by: "chord" };
}

function normalizeGeometry(geometry: TraceGeometry): ResolvedPolyline {
  if (Array.isArray(geometry)) {
    const points = geometry as readonly ElbowPoint[];
    // Fewer than two points is not a path — there is nothing to cross
    // with, and inventing a second point would be a guess.
    return { points, by: "route" };
  }
  const chord = geometry as TraceChord;
  return { points: [chord.start, chord.end], by: "chord" };
}

/* ------------------------------------------------------------------ */
/* THE function — trace in, location out                               */
/* ------------------------------------------------------------------ */

/**
 * Every place `geometry` meets `box`'s boundary, as port-edge locations, in
 * path order. Thin by design: `boundaryCrossings` finds them (Liang–Barsky,
 * donor-verbatim), this adds `side`-relative `t` and the `by` provenance.
 *
 * Total: a path that misses the box entirely, a path wholly inside, or a
 * path with fewer than two points all yield `[]` — the honest nothing.
 */
export function portEdgeCrossings(
  geometry: TraceGeometry,
  box: ElbowRect,
  options: PortEdgeCrossingOptions = {},
): PortEdgeLocation[] {
  const { points, by } = normalizeGeometry(geometry);
  if (points.length < 2) return [];
  const bounds = insetBounds(boundsOfRect(box), options.inset ?? 0);
  const crossings: BoundaryCrossing[] = boundaryCrossings(points, box, options);
  return crossings.map((crossing) => ({
    side: crossing.side satisfies ElbowSide as BlockSide,
    t: alongSide(bounds, crossing.side, crossing.point),
    point: crossing.point,
    direction: crossing.direction,
    distance: crossing.distance,
    by,
  }));
}

export interface PortEdgeLocationOptions extends PortEdgeCrossingOptions {
  /**
   * Which crossing a port is wanted for. Default `"exit"` — the cable
   * LEAVING the box is where a derived boundary port belongs, which is the
   * donor's own `firstExit` framing ("the first place the path leaves the
   * box — where a derived port belongs").
   *
   * `"enter"` takes the LAST entry rather than the first, matching the
   * donor's `lastEntry`: a cable that weaves in and out finally settles
   * inside on its last crossing, and that is the one a port stands for.
   */
  direction?: CrossingDirection;
}

/**
 * "Take a trace in, output a location out" — the single call Zach named.
 *
 * Returns `null` when the path never crosses in the asked direction. It
 * does NOT silently answer with the other direction: a caller that wanted
 * an exit and got an entry would place a port on the wrong wall, and
 * "there is no exit" is a fact worth returning.
 */
export function portEdgeLocation(
  geometry: TraceGeometry,
  box: ElbowRect,
  options: PortEdgeLocationOptions = {},
): PortEdgeLocation | null {
  const want = options.direction ?? "exit";
  const all = portEdgeCrossings(geometry, box, options).filter((hit) => hit.direction === want);
  if (all.length === 0) return null;
  return want === "exit" ? all[0] : all[all.length - 1];
}

/**
 * One cable against several boxes — a block inside a region inside a frame.
 * Mirrors the donor's `firstExitPerBox` (which this deliberately does NOT
 * call: that one returns `BoundaryCrossing`, and re-normalising its `t`
 * afterwards would need the inset bounds recomputed per box anyway).
 * Boxes with no crossing in the asked direction are absent from the map, so
 * one pass derives a port per level.
 */
export function portEdgeLocationPerBox<Key extends string | number>(
  geometry: TraceGeometry,
  boxes: ReadonlyArray<{ key: Key; box: ElbowRect }>,
  options: PortEdgeLocationOptions = {},
): Map<Key, PortEdgeLocation> {
  const found = new Map<Key, PortEdgeLocation>();
  for (const { key, box } of boxes) {
    const hit = portEdgeLocation(geometry, box, options);
    if (hit) found.set(key, hit);
  }
  return found;
}
