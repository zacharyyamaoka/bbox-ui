// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/geometry.ts`).
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
 * Pure orthogonal-routing geometry. No tldraw, no React, no runtime deps — this
 * file (and everything else under `src/blocks/elbow/`) must stay importable from
 * a plain node script, a vitest run and the browser bundle alike.
 */

export interface ElbowPoint {
  x: number
  y: number
}

/** Axis-aligned rectangle, top-left + size — the shape of a tldraw shape box. */
export interface ElbowRect {
  x: number
  y: number
  w: number
  h: number
}

/** `[minX, minY, maxX, maxY]`. The routing core works in bounds, not rects. */
export type ElbowBounds = readonly [number, number, number, number]

/** The side of a box a cable leaves from / enters through. */
export type ElbowSide = 'top' | 'right' | 'bottom' | 'left'

/** `'x'` = the segment runs horizontally, so dragging it changes its `y`. */
export type ElbowAxis = 'x' | 'y'

export const ELBOW_EPSILON = 1e-6

/** Unit vectors pointing *out* of each side. */
export const ELBOW_SIDE_DELTA: Record<ElbowSide, ElbowPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export const ELBOW_SIDE_OPPOSITE: Record<ElbowSide, ElbowSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

/** The axis a cable *travels* along when it leaves through this side. */
export const ELBOW_SIDE_AXIS: Record<ElbowSide, ElbowAxis> = {
  top: 'y',
  right: 'x',
  bottom: 'y',
  left: 'x',
}

export function oppositeAxis(axis: ElbowAxis): ElbowAxis {
  return axis === 'x' ? 'y' : 'x'
}

/** The coordinate a segment on `axis` is free to move along when dragged. */
export function crossAxis(axis: ElbowAxis): ElbowAxis {
  return oppositeAxis(axis)
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

export function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

export function nearlyEqual(first: number, second: number, epsilon = ELBOW_EPSILON): boolean {
  return Math.abs(first - second) <= epsilon
}

export function pointsEqual(
  first: ElbowPoint,
  second: ElbowPoint,
  epsilon = ELBOW_EPSILON,
): boolean {
  return nearlyEqual(first.x, second.x, epsilon) && nearlyEqual(first.y, second.y, epsilon)
}

export function isFinitePoint(point: ElbowPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function boundsOfRect(rect: ElbowRect): ElbowBounds {
  return [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h]
}

export function rectOfBounds(bounds: ElbowBounds): ElbowRect {
  return { x: bounds[0], y: bounds[1], w: bounds[2] - bounds[0], h: bounds[3] - bounds[1] }
}

/** A degenerate box standing in for a free endpoint that is bound to nothing. */
export function boundsAroundPoint(point: ElbowPoint, radius = 2): ElbowBounds {
  return [point.x - radius, point.y - radius, point.x + radius, point.y + radius]
}

export function unionBounds(all: readonly ElbowBounds[]): ElbowBounds {
  return [
    Math.min(...all.map((bounds) => bounds[0])),
    Math.min(...all.map((bounds) => bounds[1])),
    Math.max(...all.map((bounds) => bounds[2])),
    Math.max(...all.map((bounds) => bounds[3])),
  ]
}

/**
 * Inflate by a per-side amount, in `[up, right, down, left]` order — the same
 * order {@link offsetFromSide} produces.
 */
export function inflateBounds(
  bounds: ElbowBounds,
  offset: readonly [number, number, number, number],
): ElbowBounds {
  return [
    bounds[0] - offset[3],
    bounds[1] - offset[0],
    bounds[2] + offset[1],
    bounds[3] + offset[2],
  ]
}

export function expandBounds(bounds: ElbowBounds, amount: number): ElbowBounds {
  return inflateBounds(bounds, [amount, amount, amount, amount])
}

/**
 * `head` is applied to the side the cable exits through, `side` to the other
 * three. Returned in `[up, right, down, left]` order.
 *
 * Ported from Excalidraw's `offsetFromHeading` — see the header of
 * `elbowRouter.ts` for the licence notice and the pinned upstream revision.
 */
export function offsetFromSide(
  side: ElbowSide,
  head: number,
  flank: number,
): [number, number, number, number] {
  switch (side) {
    case 'top':
      return [head, flank, flank, flank]
    case 'right':
      return [flank, head, flank, flank]
    case 'bottom':
      return [flank, flank, head, flank]
    default:
      return [flank, flank, flank, head]
  }
}

/** Strictly inside — a point sitting exactly on the border is *not* inside. */
export function pointInsideBounds(
  point: ElbowPoint,
  bounds: ElbowBounds,
  epsilon = ELBOW_EPSILON,
): boolean {
  return (
    point.x > bounds[0] + epsilon
    && point.x < bounds[2] - epsilon
    && point.y > bounds[1] + epsilon
    && point.y < bounds[3] - epsilon
  )
}

export function boundsOverlap(first: ElbowBounds, second: ElbowBounds): boolean {
  return (
    first[0] < second[2] && second[0] < first[2] && first[1] < second[3] && second[1] < first[3]
  )
}

/** Manhattan distance — the only metric an orthogonal route can actually travel. */
export function manhattan(first: ElbowPoint, second: ElbowPoint): number {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

/** The side of `bounds` whose outward normal best matches `point`'s position. */
export function nearestSide(bounds: ElbowBounds, point: ElbowPoint): ElbowSide {
  const distances: Array<[ElbowSide, number]> = [
    ['left', Math.abs(point.x - bounds[0])],
    ['right', Math.abs(point.x - bounds[2])],
    ['top', Math.abs(point.y - bounds[1])],
    ['bottom', Math.abs(point.y - bounds[3])],
  ]
  distances.sort((first, second) => first[1] - second[1])
  return distances[0][0]
}
