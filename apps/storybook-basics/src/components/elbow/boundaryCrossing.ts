// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/boundaryCrossing.ts`).
//
// Zero code edits below this banner — a byte-for-byte copy.
//
// WHY a copy and not a dependency, and WHY the comments travel: this folder is
// dependency-free by design — its own header says it "must stay importable from
// a plain node script" — so copying costs nothing and keeps bbox-ui's core rule
// intact (`CLAUDE.md`: the core imports no canvas engine). Zach's rule for the
// copy: "whenever possible just copy pasted code from those libraries. make
// sure to keep that documentation with the functions." Every `@ported
// Excalidraw` tag, PROVENANCE section and WHY comment below is the donor's,
// unedited. Keeping the directory shape file-for-file (docs/TRACE-PLAN.md D3)
// is what makes a future re-sync a plain `diff` rather than an archaeology dig.
// ============================================================================

/**
 * Where a routed path meets the edge of a box — the general form of "put the
 * derived port wherever the cable crosses the boundary".
 *
 * This is deliberately not about mutations. Any time something is derived from
 * a cable's relationship to an enclosing rectangle, it needs the same answer:
 *
 *  * a side-effect port, which appears where an effect cable leaves its block
 *    or its enclosing frame, and moves when you drag the cable;
 *  * a group or frame boundary port, for a cable that crosses in or out of a
 *    collapsed group;
 *  * a tunnel entry on a Branch region or a loop band;
 *  * a badge, label or clip marker placed where a cable enters a container.
 *
 * So it takes a rectangle and a polyline and answers three things: which side
 * was crossed, exactly where, and how far along the path that happened. It does
 * not know what the caller intends to put there.
 *
 * Pure geometry: no tldraw, no React, no DOM, no runtime deps, same as the rest
 * of `src/blocks/elbow/`. Segments may be diagonal — the clipper is Liang–Barsky,
 * so a curve flattened to a polyline works as well as an orthogonal route.
 *
 * ## Conventions
 *
 * A point exactly on the boundary counts as *on*, not outside: a cable that
 * starts on a block's top edge and runs upward exits at its own first point,
 * at `t = 0`, which is what makes "the port sits where the stub leaves" fall
 * out with no special case. A segment that runs *along* an edge never leaves,
 * so it produces no crossing.
 */

import { ELBOW_EPSILON, boundsOfRect } from './geometry'
import type { ElbowBounds, ElbowPoint, ElbowRect, ElbowSide } from './geometry'

/** Leaving the box, or coming into it. */
export type CrossingDirection = 'exit' | 'enter'

export interface BoundaryCrossing {
  /** Where the path meets the boundary, in the same space as the box. */
  point: ElbowPoint
  /** Which side of the box was crossed. */
  side: ElbowSide
  /** Whether the path was leaving the box here or entering it. */
  direction: CrossingDirection
  /** Index of the polyline segment the crossing happened on. */
  segmentIndex: number
  /** Position along that segment, 0..1. */
  t: number
  /** Arc length from the start of the path, so crossings can be ordered or a
   * pill placed by distance the way a delayed cable's pill already is. */
  distance: number
}

export interface BoundaryCrossingOptions {
  /**
   * Grow (positive) or shrink (negative) the box before testing, in the same
   * units as the box. Use a small positive value to place a port just outside a
   * frame's stroke, or a negative one to catch a cable that stops on the edge.
   */
  inset?: number
  /** Tolerance for "on the boundary". Defaults to `ELBOW_EPSILON`. */
  epsilon?: number
}

interface Clip {
  t0: number
  t1: number
  enterSide: ElbowSide | null
  exitSide: ElbowSide | null
}

function inset(bounds: ElbowBounds, amount: number): ElbowBounds {
  if (!amount) return bounds
  const [minX, minY, maxX, maxY] = bounds
  return [minX - amount, minY - amount, maxX + amount, maxY + amount]
}

/**
 * Liang–Barsky: the portion of segment a→b that lies inside the box, plus which
 * plane admitted it and which one let it out. Returns null when the segment
 * misses the box entirely.
 */
function clipSegment(a: ElbowPoint, b: ElbowPoint, bounds: ElbowBounds, epsilon: number): Clip | null {
  const [minX, minY, maxX, maxY] = bounds
  const dx = b.x - a.x
  const dy = b.y - a.y
  // (p, q, side) per plane: inside is p * t <= q.
  const planes: Array<[number, number, ElbowSide]> = [
    [-dx, a.x - minX, 'left'],
    [dx, maxX - a.x, 'right'],
    [-dy, a.y - minY, 'top'],
    [dy, maxY - a.y, 'bottom'],
  ]
  let t0 = 0
  let t1 = 1
  let enterSide: ElbowSide | null = null
  let exitSide: ElbowSide | null = null
  for (const [p, q, side] of planes) {
    if (Math.abs(p) <= epsilon) {
      // Parallel to this plane: outside it means the segment can never be inside.
      if (q < -epsilon) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1 + epsilon) return null
      if (r > t0 + epsilon) {
        t0 = r
        enterSide = side
      } else if (Math.abs(r - t0) <= epsilon && enterSide === null) {
        // The segment begins exactly on this plane. Ties resolve to the first
        // plane tested, so a corner always reports the same side.
        enterSide = side
      }
    } else {
      if (r < t0 - epsilon) return null
      if (r < t1 - epsilon) {
        t1 = r
        exitSide = side
      } else if (Math.abs(r - t1) <= epsilon && exitSide === null) {
        // The segment ends exactly on this plane — a cable drawn to land on the
        // boundary rather than through it, which is the common authored case.
        t1 = Math.min(t1, r)
        exitSide = side
      }
    }
  }
  if (t0 > t1 + epsilon) return null
  return { t0, t1, enterSide, exitSide }
}

function at(a: ElbowPoint, b: ElbowPoint, t: number): ElbowPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function samePoint(a: ElbowPoint, b: ElbowPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon * 8 && Math.abs(a.y - b.y) <= epsilon * 8
}

/**
 * Every point at which `path` crosses the boundary of `box`, in path order.
 *
 * A path that starts inside and ends outside yields one `exit`. One that weaves
 * in and out yields them all, alternating. Touching a corner or running along an
 * edge without leaving yields none.
 */
export function boundaryCrossings(
  path: readonly ElbowPoint[],
  box: ElbowRect,
  options: BoundaryCrossingOptions = {},
): BoundaryCrossing[] {
  const epsilon = options.epsilon ?? ELBOW_EPSILON
  const bounds = inset(boundsOfRect(box), options.inset ?? 0)
  const crossings: BoundaryCrossing[] = []
  let distance = 0
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index]
    const b = path[index + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const clip = clipSegment(a, b, bounds, epsilon)
    const isFirst = index === 0
    const isLast = index === path.length - 2
    if (clip) {
      // The segment enters partway along: it began outside. A first segment that
      // begins *on* the boundary and heads inward enters there too.
      if ((clip.t0 > epsilon || (isFirst && clip.t0 <= epsilon)) && clip.enterSide) {
        crossings.push({
          point: at(a, b, clip.t0),
          side: clip.enterSide,
          direction: 'enter',
          segmentIndex: index,
          t: clip.t0,
          distance: distance + length * clip.t0,
        })
      }
      // The segment leaves before its end — or exactly at its start, which is
      // the case that puts a port on the edge a stub leaves from. A final segment
      // that stops exactly on the boundary leaves there: the cable was drawn to
      // land on the edge, and that is where the derived port belongs.
      if ((clip.t1 < 1 - epsilon || isLast) && clip.exitSide) {
        crossings.push({
          point: at(a, b, clip.t1),
          side: clip.exitSide,
          direction: 'exit',
          segmentIndex: index,
          t: clip.t1,
          distance: distance + length * clip.t1,
        })
      }
    }
    distance += length
  }
  // A crossing at a shared vertex is found twice, once on each segment.
  return crossings.filter((crossing, index) => {
    if (index === 0) return true
    const previous = crossings[index - 1]
    return !(previous.direction === crossing.direction && samePoint(previous.point, crossing.point, epsilon))
  })
}

/** The first place the path leaves the box — where a derived port belongs. */
export function firstExit(
  path: readonly ElbowPoint[],
  box: ElbowRect,
  options?: BoundaryCrossingOptions,
): BoundaryCrossing | null {
  return boundaryCrossings(path, box, options).find((crossing) => crossing.direction === 'exit') ?? null
}

/** The last place the path comes back into the box. */
export function lastEntry(
  path: readonly ElbowPoint[],
  box: ElbowRect,
  options?: BoundaryCrossingOptions,
): BoundaryCrossing | null {
  const entries = boundaryCrossings(path, box, options).filter((crossing) => crossing.direction === 'enter')
  return entries.length ? entries[entries.length - 1] : null
}

/**
 * One cable against a stack of nested containers — a block inside a region
 * inside a frame — giving the crossing for each, keyed by whatever the caller
 * uses to identify a box. Boxes with no exit are absent from the map, so a
 * caller can derive a port per level in a single pass.
 */
export function firstExitPerBox<Key extends string | number>(
  path: readonly ElbowPoint[],
  boxes: ReadonlyArray<{ key: Key; box: ElbowRect }>,
  options?: BoundaryCrossingOptions,
): Map<Key, BoundaryCrossing> {
  const found = new Map<Key, BoundaryCrossing>()
  for (const { key, box } of boxes) {
    const exit = firstExit(path, box, options)
    if (exit) found.set(key, exit)
  }
  return found
}

/**
 * Whether a crossing sits on the side a linter prefers. SystemSketch spends its
 * edges: left is values in, right is named values out, bottom is the loop lane —
 * so a derived effect port prefers the top. Callers pass their own preference;
 * this only reports, it never rewrites a route.
 */
export function prefersSide(crossing: BoundaryCrossing, preferred: ElbowSide): boolean {
  return crossing.side === preferred
}
