// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowRouter.ts`).
//
// ONE edit below this banner, and it is documentation only: the dangling
// `THIRD_PARTY_NOTICES.md` reference in the donor's THIRD-PARTY NOTICE is
// replaced by the full inlined MIT notice (docs/TRACE-PLAN.md D9). That file
// does not exist in the donor tree; this repo does not inherit the broken
// promise. Not one line of code changed, and all 8 `@ported Excalidraw` tags
// are present.
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
 * Multi-bend orthogonal ("elbow") cable routing.
 *
 * ---------------------------------------------------------------------------
 * THIRD-PARTY NOTICE
 *
 * The routing core below — the dynamic keep-out boxes, the non-uniform grid,
 * the A* search with its bend penalty and its remaining-bend heuristic — is
 * ported from Excalidraw, MIT licensed, Copyright (c) 2020 Excalidraw.
 *
 *   upstream file: https://github.com/excalidraw/excalidraw/blob/e1bb9ff8f8931e783c11d104abb8967ac6605c9a/packages/element/src/elbowArrow.ts
 *   revision:      e1bb9ff8f8931e783c11d104abb8967ac6605c9a  (master, fetched 2026-08-26)
 *
 * Ported functions are marked `@ported` with their upstream name; everything
 * else here is pyblocks' own.
 *
 * DEVIATION from the donor header, and the ONLY edit made to this file in the
 * port (bbox-ui, docs/TRACE-PLAN.md D9). The donor said "the full MIT
 * permission notice travels with this repository in `THIRD_PARTY_NOTICES.md`"
 * — and that file does not exist anywhere in `/home/bam/systemsketch`
 * (verified by `find`, 2026-09-17). A promise pointing at nothing is worse
 * than no promise, so rather than inherit the dangling reference, the notice
 * is inlined here beside the code it covers, where it cannot rot:
 *
 *   MIT License
 *
 *   Copyright (c) 2020 Excalidraw
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a
 *   copy of this software and associated documentation files (the
 *   "Software"), to deal in the Software without restriction, including
 *   without limitation the rights to use, copy, modify, merge, publish,
 *   distribute, sublicense, and/or sell copies of the Software, and to
 *   permit persons to whom the Software is furnished to do so, subject to
 *   the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included
 *   in all copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 *   OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 *   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 *   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 *   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 *   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 *   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Excalidraw is copied rather than depended on: its published packages carry no
 * semver (`@excalidraw/element@latest` resolves to a commit-hashed build such as
 * `0.18.0-f0063e113`) and `@excalidraw/math` does not publish the `./ellipse`
 * subpath that `@excalidraw/element` imports, so the dependency does not install
 * cleanly in the first place.
 * ---------------------------------------------------------------------------
 *
 * tldraw's own elbow arrows cannot do this. `arrowKinds = ['arc', 'elbow']`
 * (`@tldraw/tlschema/src/shapes/TLArrowShape.ts:21`) and the whole elbow route
 * is steered by a single scalar `elbowMidPoint` (`:176`, default `0.5` at
 * `tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx:245`). The arrow exposes
 * exactly three handle ids — `start`, `middle`, `end` (`:84-88`) — and the elbow
 * branch of `getHandles` pushes **at most one** `middle` handle, guarded by
 * `info.route.midpointHandle` which is typed `ElbowArrowMidpointHandle | null`
 * (`elbow/definitions.ts:56`). So: one bend, one scalar, one handle. Everything
 * in this folder exists because that is not enough.
 */

import { BinaryHeap } from './binaryHeap'
import {
	hasElbowSoftClearancePreference,
	resolveElbowSoftClearanceOptions,
	softClearanceCost,
	softClearanceGuideLines,
	type ElbowSoftClearanceOptions,
	type ElbowSoftRoute,
} from './softClearance'
import type {
  ElbowAxis,
  ElbowBounds,
  ElbowPoint,
  ElbowRect,
  ElbowSide,
} from './geometry'
import {
  ELBOW_SIDE_AXIS,
  ELBOW_SIDE_DELTA,
  ELBOW_SIDE_OPPOSITE,
  boundsAroundPoint,
  boundsOfRect,
  crossAxis,
  expandBounds,
  isFinitePoint,
  manhattan,
  nearlyEqual,
  offsetFromSide,
  pointInsideBounds,
  pointsEqual,
  unionBounds,
} from './geometry'
import type { ElbowPin } from './elbowPins'
import { createPin, mergePin, resolvePin } from './elbowPins'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface ElbowEndpoint {
  /** Where the cable actually terminates — the port dot, in page space. */
  point: ElbowPoint
  /** The outward normal: an output port leaves `'right'`, an input enters `'left'`. */
  side: ElbowSide
  /** The owning shape's box, when the endpoint is bound to one. */
  box?: ElbowRect | null
}

/**
 * One axis-aligned routing keep-out.
 *
 * Most obstacles inherit the route's normal padding. Small painted details
 * such as port labels may ask for a tighter clearance without weakening the
 * clearance around structural Blocks and Branch regions.
 */
export interface ElbowRoutingObstacle extends ElbowRect {
  clearance?: number
}

export interface ElbowRouteOptions {
  /** Clearance kept around every box. */
  padding: number
  /**
   * Minimum straight stub used by the deterministic fallback route. The A*
   * routes take their stub from `padding`, clamped to the midline between the
   * two boxes when that is closer.
   */
  legLength: number
  /** Grid coordinates closer than this collapse, which kills sub-pixel jogs. */
  gridSnap: number
  /** Default corner rounding for {@link elbowPath}. */
  cornerRadius: number
}

/**
 * Local, non-blocking cable references for an automatic route. This only
 * participates when supplied by an explicit caller such as Tidy edges; normal
 * live routing remains the legacy one-edge planner.
 */
export interface ElbowRouteSoftClearance {
	routes: readonly ElbowSoftRoute[]
	options?: Partial<ElbowSoftClearanceOptions>
}

export const DEFAULT_ELBOW_OPTIONS: ElbowRouteOptions = {
  padding: 24,
  legLength: 20,
  gridSnap: 0.5,
  cornerRadius: 8,
}

export interface ElbowRouteInput {
  start: ElbowEndpoint
  end: ElbowEndpoint
  /** Boxes to steer around, in addition to the two endpoints' own boxes. */
  obstacles?: readonly ElbowRoutingObstacle[]
	/** User-dragged bends. Indices address the *auto* route's segments. */
	pins?: readonly ElbowPin[]
	options?: Partial<ElbowRouteOptions>
	/** Optional local preference for clearing nearby automatic cables. */
	softClearance?: ElbowRouteSoftClearance
}

export interface ElbowSegment {
  /**
   * Index into the auto route's segment list — stable across pin application,
   * and the index a new {@link ElbowPin} must carry.
   */
  index: number
  axis: ElbowAxis
  start: ElbowPoint
  end: ElbowPoint
  midpoint: ElbowPoint
  length: number
  /** First and last segments touch a fixed endpoint and cannot be pinned. */
  pinnable: boolean
}

export interface ElbowRoute {
  /** The drawn polyline, endpoints included. Always ≥ 2 points. */
  points: ElbowPoint[]
  segments: ElbowSegment[]
  /** Pins that were applied. */
  pins: ElbowPin[]
  /** Pins whose segment no longer exists (or changed axis) and were discarded. */
  droppedPins: ElbowPin[]
  /** True when A* found no path and the deterministic stub route was used. */
  fallback: boolean
}

// ---------------------------------------------------------------------------
// Grid + search internals
// ---------------------------------------------------------------------------

interface GridNode {
  f: number
  g: number
  h: number
  closed: boolean
  visited: boolean
  parent: GridNode | null
  col: number
  row: number
  pos: ElbowPoint
}

interface Grid {
  cols: number
  rows: number
  data: (GridNode | null)[]
}

const NEIGHBOUR_SIDES: readonly ElbowSide[] = ['top', 'right', 'bottom', 'left']

/**
 * @ported Excalidraw `calculateGrid`. Not a uniform grid: the candidate lines
 * are the edges of the keep-out boxes plus the endpoint rails, which is why the
 * search space stays in the tens of nodes instead of the tens of thousands.
 */
function buildGrid(
  keepOuts: readonly ElbowBounds[],
  startDongle: ElbowPoint,
  startSide: ElbowSide,
  endDongle: ElbowPoint,
  endSide: ElbowSide,
  outerBounds: ElbowBounds,
  snap: number,
  extraXs: readonly number[] = [],
  extraYs: readonly number[] = [],
): Grid {
  const xs: number[] = [...extraXs]
  const ys: number[] = [...extraYs]

  if (ELBOW_SIDE_AXIS[startSide] === 'x') ys.push(startDongle.y)
  else xs.push(startDongle.x)
  if (ELBOW_SIDE_AXIS[endSide] === 'x') ys.push(endDongle.y)
  else xs.push(endDongle.x)
  xs.push(startDongle.x, endDongle.x)
  ys.push(startDongle.y, endDongle.y)

  for (const bounds of keepOuts) {
    xs.push(bounds[0], bounds[2])
    ys.push(bounds[1], bounds[3])
  }
  xs.push(outerBounds[0], outerBounds[2])
  ys.push(outerBounds[1], outerBounds[3])

  const columns = collapse(xs, snap, [startDongle.x, endDongle.x])
  const rows = collapse(ys, snap, [startDongle.y, endDongle.y])

  const data: (GridNode | null)[] = []
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < columns.length; col += 1) {
      data.push({
        f: 0,
        g: 0,
        h: 0,
        closed: false,
        visited: false,
        parent: null,
        col,
        row,
        pos: { x: columns[col], y: rows[row] },
      })
    }
  }
  return { cols: columns.length, rows: rows.length, data }
}

/**
 * Sort, then merge coordinates that sit within `snap` of one another. Two grid
 * lines a third of a pixel apart produce a visible kink and no useful freedom,
 * so they become one — except where a dongle sits, which must survive exactly or
 * the endpoint stops being reachable.
 */
function collapse(values: readonly number[], snap: number, pinned: readonly number[]): number[] {
  const sorted = [...values].sort((first, second) => first - second)
  const kept: number[] = []
  for (const value of sorted) {
    const last = kept[kept.length - 1]
    if (kept.length === 0 || Math.abs(value - last) > snap) {
      kept.push(value)
      continue
    }
    // Collapsed onto the previous line — unless this one is a dongle rail, in
    // which case the dongle wins and replaces it.
    if (pinned.some((exact) => nearlyEqual(exact, value, 1e-9))) {
      kept[kept.length - 1] = value
    }
  }
  return kept
}

function nodeAt(grid: Grid, col: number, row: number): GridNode | null {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null
  return grid.data[row * grid.cols + col] ?? null
}

/** @ported Excalidraw `pointToGridNode`. */
function gridNodeForPoint(point: ElbowPoint, grid: Grid): GridNode | null {
  for (const node of grid.data) {
    if (node && nearlyEqual(node.pos.x, point.x, 1e-9) && nearlyEqual(node.pos.y, point.y, 1e-9)) {
      return node
    }
  }
  return null
}

function sideFromDelta(deltaX: number, deltaY: number): ElbowSide {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? 'right' : 'left'
  return deltaY >= 0 ? 'bottom' : 'top'
}

/**
 * @ported Excalidraw `estimateSegmentCount`. The A* heuristic: how many bends
 * are still unavoidable between a node travelling `fromSide` and an end that
 * must be entered against `toSide`. Multiplying this by the bend penalty is what
 * makes the search prefer the route a human would draw rather than merely the
 * shortest one.
 */
function estimateBendCount(
  from: ElbowPoint,
  to: ElbowPoint,
  fromSide: ElbowSide,
  toSide: ElbowSide,
): number {
  if (toSide === 'right') {
    switch (fromSide) {
      case 'right':
        if (from.x >= to.x) return 4
        if (from.y === to.y) return 0
        return 2
      case 'top':
        return from.y > to.y && from.x < to.x ? 1 : 3
      case 'bottom':
        return from.y < to.y && from.x < to.x ? 1 : 3
      case 'left':
        return from.y === to.y ? 4 : 2
    }
  } else if (toSide === 'left') {
    switch (fromSide) {
      case 'right':
        return from.y === to.y ? 4 : 2
      case 'top':
        return from.y > to.y && from.x > to.x ? 1 : 3
      case 'bottom':
        return from.y < to.y && from.x > to.x ? 1 : 3
      case 'left':
        if (from.x <= to.x) return 4
        if (from.y === to.y) return 0
        return 2
    }
  } else if (toSide === 'top') {
    switch (fromSide) {
      case 'right':
        return from.y > to.y && from.x < to.x ? 1 : 3
      case 'top':
        if (from.y >= to.y) return 4
        if (from.x === to.x) return 0
        return 2
      case 'bottom':
        return from.x === to.x ? 4 : 2
      case 'left':
        return from.y > to.y && from.x > to.x ? 1 : 3
    }
  } else if (toSide === 'bottom') {
    switch (fromSide) {
      case 'right':
        return from.y < to.y && from.x < to.x ? 1 : 3
      case 'top':
        return from.x === to.x ? 4 : 2
      case 'bottom':
        if (from.y <= to.y) return 4
        if (from.x === to.x) return 0
        return 2
      case 'left':
        return from.y < to.y && from.x > to.x ? 1 : 3
    }
  }
  return 0
}

/**
 * @ported Excalidraw `astar` (which credits the standard A* formulation).
 *
 * Two modifications carried over, both of them aesthetic rather than
 * algorithmic: a direction change costs `bendPenalty³` so routes bend as few
 * times as they can, and a step that reverses the previous one is rejected
 * outright so the line never doubles back over itself.
 */
function search(
  start: GridNode,
  end: GridNode,
  grid: Grid,
  startSide: ElbowSide,
	endSide: ElbowSide,
	keepOuts: readonly ElbowBounds[],
	softClearance: ElbowRouteSoftClearance | undefined,
): GridNode[] | null {
  const bendPenalty = manhattan(start.pos, end.pos)
  const open = new BinaryHeap<GridNode>((node) => node.f)
  open.push(start)
  const softOptions = softClearance
    ? resolveElbowSoftClearanceOptions(softClearance.options)
    : null
  const softEnabled = softOptions !== null && hasElbowSoftClearancePreference(softOptions)

  while (open.size > 0) {
    const current = open.pop()
    if (!current || current.closed) continue
    if (current === end) return tracePath(start, current)
    current.closed = true

    for (let index = 0; index < 4; index += 1) {
      const side = NEIGHBOUR_SIDES[index]
      const delta = ELBOW_SIDE_DELTA[side]
      const neighbour = nodeAt(grid, current.col + delta.x, current.row + delta.y)
      if (!neighbour || neighbour.closed) continue

      // A step is legal only if its *middle* clears every keep-out. Testing the
      // middle rather than the ends is what lets a route run flush along a box
      // edge without being rejected for touching it.
      const middle = {
        x: (neighbour.pos.x + current.pos.x) / 2,
        y: (neighbour.pos.y + current.pos.y) / 2,
      }
      if (keepOuts.some((bounds) => pointInsideBounds(middle, bounds))) continue

      const previousSide = current.parent
        ? sideFromDelta(current.pos.x - current.parent.pos.x, current.pos.y - current.parent.pos.y)
        : startSide

      const reversing = side === ELBOW_SIDE_OPPOSITE[previousSide]
      const backIntoStart = neighbour === start && side === startSide
      const throughEnd = neighbour === end && side === endSide
      if (reversing || backIntoStart || throughEnd) continue

			const turned = previousSide !== side
			const softCost = softEnabled
				? softClearanceCost([current.pos, neighbour.pos], softClearance!.routes, softOptions!)
				: 0
			const gScore = current.g
				+ manhattan(neighbour.pos, current.pos)
				+ (turned ? bendPenalty ** 3 : 0)
				// Soft policy is expressed in bend-equivalents. Scaling it by this
				// route's own bend cost makes the same knobs meaningful on both a
				// compact card pair and a wide expanded Block.
				+ softCost * bendPenalty ** 3

      if (neighbour.visited && gScore >= neighbour.g) continue

      const wasVisited = neighbour.visited
      neighbour.visited = true
      neighbour.parent = current
      neighbour.g = gScore
      neighbour.h = manhattan(end.pos, neighbour.pos)
        + estimateBendCount(neighbour.pos, end.pos, side, endSide) * bendPenalty ** 2
      neighbour.f = neighbour.g + neighbour.h
      if (wasVisited) open.rescore(neighbour)
      else open.push(neighbour)
    }
  }
  return null
}

/** @ported Excalidraw `pathTo`. */
function tracePath(start: GridNode, node: GridNode): GridNode[] {
  const path: GridNode[] = []
  let current: GridNode | null = node
  while (current && current.parent) {
    path.unshift(current)
    current = current.parent
  }
  path.unshift(start)
  return path
}

/**
 * @ported Excalidraw `generateDynamicAABBs` (condensed).
 *
 * Two keep-out boxes that always touch: each grows toward the other only as far
 * as the midline between them, and away from the other by the full padding. That
 * single property is what makes the route leave a shape with a clean stub and
 * then run down the middle of the gap, and it is why a naive "inflate both boxes
 * by 24px" router jams the moment two blocks sit 30px apart.
 */
function dynamicKeepOuts(
  first: ElbowBounds,
  second: ElbowBounds,
  common: ElbowBounds,
  firstOffset: readonly [number, number, number, number],
  secondOffset: readonly [number, number, number, number],
  /**
   * `'midline'` lets each box grow all the way to the halfway line, which puts
   * the dongles on a shared rail and produces the classic Z. `'tight'` stops at
   * the padding instead, leaving the whole gap navigable — which is what
   * obstacle avoidance needs, because a midline rail is exactly the thing an
   * obstacle in the gap sits on.
   */
  reach: 'midline' | 'tight',
): [ElbowBounds, ElbowBounds] {
  const toward = (midline: number, padded: number, sign: 1 | -1): number => {
    if (reach === 'midline') return midline
    return sign === 1 ? Math.min(midline, padded) : Math.max(midline, padded)
  }
  const grow = (
    self: ElbowBounds,
    other: ElbowBounds,
    offset: readonly [number, number, number, number],
  ): ElbowBounds => {
    const [up, right, down, left] = offset
    return [
      self[0] > other[2]
        ? toward((self[0] + other[2]) / 2, self[0] - left, -1)
        : self[0] > other[0] ? self[0] - left : common[0] - left,
      self[1] > other[3]
        ? toward((self[1] + other[3]) / 2, self[1] - up, -1)
        : self[1] > other[1] ? self[1] - up : common[1] - up,
      self[2] < other[0]
        ? toward((self[2] + other[0]) / 2, self[2] + right, 1)
        : self[2] < other[2] ? self[2] + right : common[2] + right,
      self[3] < other[1]
        ? toward((self[3] + other[1]) / 2, self[3] + down, 1)
        : self[3] < other[3] ? self[3] + down : common[3] + down,
    ]
  }
  return [grow(first, second, firstOffset), grow(second, first, secondOffset)]
}

/** @ported Excalidraw `getDonglePosition`. */
function donglePosition(bounds: ElbowBounds, side: ElbowSide, point: ElbowPoint): ElbowPoint {
  switch (side) {
    case 'top':
      return { x: point.x, y: bounds[1] }
    case 'right':
      return { x: bounds[2], y: point.y }
    case 'bottom':
      return { x: point.x, y: bounds[3] }
    default:
      return { x: bounds[0], y: point.y }
  }
}

/**
 * Shorten an endpoint keep-out when a third-party keep-out occupies its normal
 * dongle rail. The endpoint's own padding is aesthetic; obstacle clearance is
 * a hard constraint. Clamping the dongle to the obstacle boundary preserves
 * both: the cable still leaves through the requested side and may turn in the
 * small legal pocket before the obstacle.
 */
function clampDongleBeforeObstacles(
  keepOut: ElbowBounds,
  endpoint: ElbowEndpoint,
  obstacles: readonly ElbowBounds[],
): ElbowBounds {
  let [left, top, right, bottom] = keepOut
  const { point, side } = endpoint
  for (const obstacle of obstacles) {
    if (side === 'right') {
      const crossesRail = point.y > obstacle[1] + 1e-6 && point.y < obstacle[3] - 1e-6
      if (crossesRail && obstacle[0] > point.x + 1e-6 && obstacle[0] < right) right = obstacle[0]
    } else if (side === 'left') {
      const crossesRail = point.y > obstacle[1] + 1e-6 && point.y < obstacle[3] - 1e-6
      if (crossesRail && obstacle[2] < point.x - 1e-6 && obstacle[2] > left) left = obstacle[2]
    } else if (side === 'bottom') {
      const crossesRail = point.x > obstacle[0] + 1e-6 && point.x < obstacle[2] - 1e-6
      if (crossesRail && obstacle[1] > point.y + 1e-6 && obstacle[1] < bottom) bottom = obstacle[1]
    } else {
      const crossesRail = point.x > obstacle[0] + 1e-6 && point.x < obstacle[2] - 1e-6
      if (crossesRail && obstacle[3] < point.y - 1e-6 && obstacle[3] > top) top = obstacle[3]
    }
  }
  return [left, top, right, bottom]
}

// ---------------------------------------------------------------------------
// Polyline hygiene — pyblocks' own, ported from src/whiteboard/elbowRouting.ts
// ---------------------------------------------------------------------------

function dedupe(points: readonly ElbowPoint[], epsilon = 1e-6): ElbowPoint[] {
  return points
    .filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1], epsilon))
    .map((point) => ({ ...point }))
}

/** @ported Excalidraw `getElbowArrowCornerPoints` — drop points mid-straight. */
function dropCollinear(points: readonly ElbowPoint[]): ElbowPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }))
  const kept: ElbowPoint[] = [{ ...points[0] }]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = kept[kept.length - 1]
    const point = points[index]
    const next = points[index + 1]
    const straightX = nearlyEqual(previous.x, point.x) && nearlyEqual(point.x, next.x)
    const straightY = nearlyEqual(previous.y, point.y) && nearlyEqual(point.y, next.y)
    if (straightX || straightY) continue
    kept.push({ ...point })
  }
  kept.push({ ...points[points.length - 1] })
  return kept
}

function segmentAxisOf(start: ElbowPoint, end: ElbowPoint, fallback: ElbowAxis): ElbowAxis {
  const deltaX = Math.abs(end.x - start.x)
  const deltaY = Math.abs(end.y - start.y)
  if (deltaY <= 1e-6 && deltaX > 1e-6) return 'x'
  if (deltaX <= 1e-6 && deltaY > 1e-6) return 'y'
  return fallback
}

/**
 * Re-project every interior corner onto the alternating orthogonal grammar,
 * then weld the final corner to the true endpoint. Ported from
 * `src/whiteboard/elbowRouting.ts:normalizeElbowRoute` — the React Flow app's
 * answer to the same problem, which is what makes "endpoint moved, bend follows"
 * exactly orthogonal rather than orthogonal-to-a-pixel.
 */
function enforceOrthogonal(points: readonly ElbowPoint[]): ElbowPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }))
  const full = points.map((point) => ({ ...point }))
  const startAxis = segmentAxisOf(full[0], full[1], 'x')
  const axisAt = (index: number): ElbowAxis => (
    index % 2 === 0 ? startAxis : (startAxis === 'x' ? 'y' : 'x')
  )
  for (let index = 0; index < full.length - 2; index += 1) {
    if (axisAt(index) === 'x') full[index + 1].y = full[index].y
    else full[index + 1].x = full[index].x
  }
  const last = full.length - 1
  if (axisAt(last - 1) === 'x') full[last - 1].y = full[last].y
  else full[last - 1].x = full[last].x
  return full
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

function applyPins(
  basePoints: readonly ElbowPoint[],
  pins: readonly ElbowPin[],
  start: ElbowPoint,
  end: ElbowPoint,
): { points: ElbowPoint[]; applied: ElbowPin[]; dropped: ElbowPin[] } {
  const points = basePoints.map((point) => ({ ...point }))
  const applied: ElbowPin[] = []
  const dropped: ElbowPin[] = []
  const lastSegment = points.length - 2

  for (const pin of [...pins].sort((first, second) => first.index - second.index)) {
    const interior = pin.index > 0 && pin.index < lastSegment
    const axis = interior
      ? segmentAxisOf(points[pin.index], points[pin.index + 1], pin.axis)
      : null
    if (!interior || axis !== pin.axis) {
      dropped.push(pin)
      continue
    }
    const value = resolvePin(pin, start, end)
    if (!Number.isFinite(value)) {
      dropped.push(pin)
      continue
    }
    if (pin.axis === 'x') {
      points[pin.index].y = value
      points[pin.index + 1].y = value
    } else {
      points[pin.index].x = value
      points[pin.index + 1].x = value
    }
    applied.push(pin)
  }
  return { points, applied, dropped }
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/**
 * Deterministic stub route, used when A* finds nothing (it can: an endpoint
 * sealed inside another obstacle has no legal exit). Never returns a
 * non-orthogonal polyline, so callers never have to special-case failure.
 */
function fallbackPoints(
  start: ElbowEndpoint,
  end: ElbowEndpoint,
  legLength: number,
): ElbowPoint[] {
  const startStub = {
    x: start.point.x + ELBOW_SIDE_DELTA[start.side].x * legLength,
    y: start.point.y + ELBOW_SIDE_DELTA[start.side].y * legLength,
  }
  const endStub = {
    x: end.point.x + ELBOW_SIDE_DELTA[end.side].x * legLength,
    y: end.point.y + ELBOW_SIDE_DELTA[end.side].y * legLength,
  }
  const startAxis = ELBOW_SIDE_AXIS[start.side]
  const endAxis = ELBOW_SIDE_AXIS[end.side]

  if (startAxis === endAxis) {
    const middle = startAxis === 'x'
      ? (startStub.x + endStub.x) / 2
      : (startStub.y + endStub.y) / 2
    const corners = startAxis === 'x'
      ? [{ x: middle, y: startStub.y }, { x: middle, y: endStub.y }]
      : [{ x: startStub.x, y: middle }, { x: endStub.x, y: middle }]
    return [start.point, startStub, ...corners, endStub, end.point]
  }
  const corner = startAxis === 'x'
    ? { x: endStub.x, y: startStub.y }
    : { x: startStub.x, y: endStub.y }
  return [start.point, startStub, corner, endStub, end.point]
}

// ---------------------------------------------------------------------------
// routeElbow
// ---------------------------------------------------------------------------

/** Does the polyline pass strictly through any of the given boxes? */
function polylineHits(points: readonly ElbowPoint[], boxes: readonly ElbowBounds[]): boolean {
  if (boxes.length === 0) return false
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const segment: ElbowBounds = [
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.max(from.x, to.x),
      Math.max(from.y, to.y),
    ]
    for (const box of boxes) {
      // A zero-thickness segment box overlaps a solid box exactly when the
      // segment passes through its interior.
      if (
        segment[0] < box[2] - 1e-6
        && box[0] < segment[2] - 1e-6
        && segment[1] < box[3] - 1e-6
        && box[1] < segment[3] - 1e-6
      ) return true
      // ...plus the degenerate case of a segment running along one axis only.
      const flatX = nearlyEqual(segment[0], segment[2])
      const flatY = nearlyEqual(segment[1], segment[3])
      if (flatX && segment[0] > box[0] + 1e-6 && segment[0] < box[2] - 1e-6
        && segment[1] < box[3] - 1e-6 && box[1] < segment[3] - 1e-6) return true
      if (flatY && segment[1] > box[1] + 1e-6 && segment[1] < box[3] - 1e-6
        && segment[0] < box[2] - 1e-6 && box[0] < segment[2] - 1e-6) return true
    }
  }
  return false
}

interface Attempt {
  points: ElbowPoint[] | null
}

function attemptRoute(
  start: ElbowEndpoint,
  end: ElbowEndpoint,
  obstacleBounds: readonly ElbowBounds[],
	options: ElbowRouteOptions,
	reach: 'midline' | 'tight',
	softClearance: ElbowRouteSoftClearance | undefined,
): Attempt {
  // Keep-outs are built from the *raw* boxes. Inflating first and clamping
  // afterwards looks equivalent and is not: two blocks 30px apart, each already
  // grown by a 20px leg, overlap — and the midline clamp then has nothing to
  // clamp, so the two dongles cross over each other and the cable comes out as a
  // five-segment staircase across a 30px gap. Clamping the raw boxes puts both
  // dongles on the same rail instead.
  const startElement = start.box ? boundsOfRect(start.box) : boundsAroundPoint(start.point)
  const endElement = end.box ? boundsOfRect(end.box) : boundsAroundPoint(end.point)
  const common = unionBounds([startElement, endElement])

  let [startKeepOut, endKeepOut] = dynamicKeepOuts(
    startElement,
    endElement,
    common,
    offsetFromSide(start.side, options.padding, options.padding),
    offsetFromSide(end.side, options.padding, options.padding),
    reach,
  )

  startKeepOut = clampDongleBeforeObstacles(startKeepOut, start, obstacleBounds)
  endKeepOut = clampDongleBeforeObstacles(endKeepOut, end, obstacleBounds)

  const startDongle = donglePosition(startKeepOut, start.side, start.point)
  const endDongle = donglePosition(endKeepOut, end.side, end.point)

  // An obstacle that has already swallowed a dongle cannot be respected, so it
  // is dropped rather than making the whole route unroutable.
  const live = obstacleBounds.filter((bounds) => (
    !pointInsideBounds(startDongle, bounds) && !pointInsideBounds(endDongle, bounds)
  ))
  const keepOuts: ElbowBounds[] = [startKeepOut, endKeepOut, ...live]
  const outer = expandBounds(unionBounds([common, ...keepOuts]), options.padding)

  // The halfway rails between the two boxes are always worth offering to the
  // search even in `tight` mode — they are what a person would draw.
  const midXs = [(startElement[2] + endElement[0]) / 2, (startElement[0] + endElement[2]) / 2]
  const midYs = [(startElement[3] + endElement[1]) / 2, (startElement[1] + endElement[3]) / 2]

	const softGuides = softClearance
		? softClearanceGuideLines(
			softClearance.routes,
			resolveElbowSoftClearanceOptions(softClearance.options),
		)
		: { xs: [], ys: [] }
	const grid = buildGrid(
    keepOuts,
    startDongle,
    start.side,
    endDongle,
    end.side,
		outer,
		options.gridSnap,
		[...midXs, ...softGuides.xs],
		[...midYs, ...softGuides.ys],
  )
  const startNode = gridNodeForPoint(startDongle, grid)
  const endNode = gridNodeForPoint(endDongle, grid)
  if (!startNode || !endNode) return { points: null }
  if (startNode === endNode) {
    return { points: [start.point, { ...startDongle }, end.point] }
  }

  // A dongle swallowed by the *other* keep-out has no legal first step, so the
  // two boxes stop being obstacles and only the true geometry matters.
  const swallowed = pointInsideBounds(startDongle, endKeepOut)
    || pointInsideBounds(endDongle, startKeepOut)
  const searchKeepOuts = swallowed ? live : keepOuts

	const path = search(startNode, endNode, grid, start.side, end.side, searchKeepOuts, softClearance)
  if (!path) return { points: null }
  return { points: [start.point, ...path.map((node) => ({ ...node.pos })), end.point] }
}

/**
 * Two routing regimes.
 *
 * The `midline` pass is Excalidraw's: both keep-outs grow until they meet, so
 * the dongles share a rail and a plain two-block cable comes out as the clean Z
 * everyone draws by hand. It has one blind spot — that shared rail is exactly
 * where a third box in the gap sits — so when the result actually hits an
 * obstacle we also consider `tight` keep-outs, which leave the whole gap
 * navigable. When both candidates use the same number of bends, the shorter
 * one wins; this prevents a legal midline route from taking a long trip around
 * the top of a frame while a nearby channel between Blocks is open.
 *
 * With no obstacles the second pass never runs, which is the common case.
 */
function routeQuality(points: readonly ElbowPoint[]): { bends: number; length: number } {
  const simplified = dropCollinear(dedupe(points))
  return {
    bends: Math.max(0, simplified.length - 2),
    length: simplified.slice(1).reduce(
      (total, point, index) => total + manhattan(simplified[index], point),
      0,
    ),
  }
}

function betterRoute(
	first: ElbowPoint[],
	second: ElbowPoint[],
	softClearance: ElbowRouteSoftClearance | undefined,
): ElbowPoint[] {
	const firstQuality = routeQuality(first)
	const secondQuality = routeQuality(second)
	if (softClearance) {
		const options = resolveElbowSoftClearanceOptions(softClearance.options)
		const firstSoftCost = softClearanceCost(first, softClearance.routes, options)
		const secondSoftCost = softClearanceCost(second, softClearance.routes, options)
		const firstScore = firstQuality.bends + firstSoftCost
		const secondScore = secondQuality.bends + secondSoftCost
		if (secondScore + 1e-6 < firstScore) return second
		if (firstScore + 1e-6 < secondScore) return first
	}
	if (secondQuality.bends < firstQuality.bends) return second
	if (secondQuality.bends > firstQuality.bends) return first
	return secondQuality.length + 1e-6 < firstQuality.length ? second : first
}

function autoPoints(
  start: ElbowEndpoint,
  end: ElbowEndpoint,
	obstacles: readonly ElbowRoutingObstacle[],
	options: ElbowRouteOptions,
	softClearance: ElbowRouteSoftClearance | undefined,
): { points: ElbowPoint[]; fallback: boolean } {
  const obstacleBounds = obstacles.map((rect) => expandBounds(
    boundsOfRect(rect),
    Math.max(0, rect.clearance ?? options.padding),
  ))

  // An output returning to its own input is a feedback loop, not a shortest
  // path problem. The two endpoint boxes are exactly equal, so A* has two
  // symmetric routes; choosing the lower one leaves the header and top-edge
  // effect ports clear, and makes the loop read consistently.
  const selfLoop = belowSelfLoopPoints(start, end, options.padding)
  if (selfLoop && !polylineHits(selfLoop, obstacleBounds)) {
    return { points: selfLoop, fallback: false }
  }

	const midline = attemptRoute(start, end, obstacleBounds, options, 'midline', softClearance)
  const clearMidline = midline.points && !polylineHits(midline.points, obstacleBounds)
    ? midline.points
    : null
	const hasSoftPreference = softClearance
		&& hasElbowSoftClearancePreference(resolveElbowSoftClearanceOptions(softClearance.options))
	if (clearMidline && obstacleBounds.length === 0 && !hasSoftPreference) {
		return { points: clearMidline, fallback: false }
	}

	const tight = attemptRoute(start, end, obstacleBounds, options, 'tight', softClearance)
  const clearTight = tight.points && !polylineHits(tight.points, obstacleBounds)
    ? tight.points
    : null
	if (clearMidline && clearTight) {
		return { points: betterRoute(clearMidline, clearTight, softClearance), fallback: false }
  }
  if (clearMidline) return { points: clearMidline, fallback: false }
  if (clearTight) return { points: clearTight, fallback: false }
  // Nothing clears everything. Prefer a real route over a stub, but say so.
  const best = tight.points ?? midline.points
  if (best) return { points: best, fallback: true }
  return { points: fallbackPoints(start, end, options.legLength), fallback: true }
}

/** The deterministic lower loop for an ordinary output returning to its own input. */
function belowSelfLoopPoints(
  start: ElbowEndpoint,
  end: ElbowEndpoint,
  padding: number,
): ElbowPoint[] | null {
  const box = start.box
  if (
    !box
    || !end.box
    || start.side !== 'right'
    || end.side !== 'left'
    || !nearlyEqual(box.x, end.box.x)
    || !nearlyEqual(box.y, end.box.y)
    || !nearlyEqual(box.w, end.box.w)
    || !nearlyEqual(box.h, end.box.h)
  ) return null

  const right = box.x + box.w + padding
  const left = box.x - padding
  const below = box.y + box.h + padding
  return [
    { ...start.point },
    { x: right, y: start.point.y },
    { x: right, y: below },
    { x: left, y: below },
    { x: left, y: end.point.y },
    { ...end.point },
  ]
}

function buildSegments(points: readonly ElbowPoint[]): ElbowSegment[] {
  const lastIndex = points.length - 2
  const segments: ElbowSegment[] = []
  for (let index = 0; index <= lastIndex; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y)
    if (length <= 1e-6) continue
    segments.push({
      index,
      axis: segmentAxisOf(start, end, 'x'),
      start: { ...start },
      end: { ...end },
      midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      length,
      pinnable: index > 0 && index < lastIndex,
    })
  }
  return segments
}

function degenerate(point: ElbowPoint): ElbowRoute {
  const points = [{ ...point }, { ...point }]
  return { points, segments: [], pins: [], droppedPins: [], fallback: false }
}

/**
 * The one entry point. Pure: same input, same output, no editor, no clock.
 *
 * The pipeline is auto-route → simplify → apply pins → re-orthogonalise, and
 * pin indices always address the *auto* route, never the pinned output. That is
 * what keeps a pin stable while the user drags a block around: the auto route
 * for a left-to-right cable keeps its three segments, so segment 1 keeps meaning
 * "the vertical rail in the middle".
 */
export function routeElbow(input: ElbowRouteInput): ElbowRoute {
  const options = { ...DEFAULT_ELBOW_OPTIONS, ...input.options }
  const { start, end } = input

  if (!isFinitePoint(start.point) || !isFinitePoint(end.point)) {
    return degenerate({ x: 0, y: 0 })
  }
  if (pointsEqual(start.point, end.point, 1e-6)) {
    return degenerate(start.point)
  }

	const auto = autoPoints(start, end, input.obstacles ?? [], options, input.softClearance)
  const basePoints = dropCollinear(dedupe(auto.points))

  const pins = input.pins ?? []
  if (pins.length === 0) {
    return {
      points: basePoints,
      segments: buildSegments(basePoints),
      pins: [],
      droppedPins: [],
      fallback: auto.fallback,
    }
  }

  const { points: pinned, applied, dropped } = applyPins(basePoints, pins, start.point, end.point)
  const straightened = enforceOrthogonal(pinned)
  return {
    points: dedupe(straightened),
    segments: buildSegments(straightened),
    pins: applied,
    droppedPins: dropped,
    fallback: auto.fallback,
  }
}

/**
 * Capture a segment drag as a pin. `pointer` is where the user let go; only the
 * coordinate perpendicular to the segment is used, because that is the only
 * direction a segment may move without breaking orthogonality.
 *
 * Returns the *whole* new pin list, ready to persist. Returns `null` when the
 * segment cannot be pinned (an endpoint segment, or one that no longer exists),
 * so callers can tell "nothing happened" from "here is an identical list".
 */
export function pinElbowSegment(
  input: ElbowRouteInput,
  segmentIndex: number,
  pointer: ElbowPoint,
): ElbowPin[] | null {
  const route = routeElbow({ ...input, pins: [] })
  const segment = route.segments.find((candidate) => candidate.index === segmentIndex)
  if (!segment || !segment.pinnable) return null

  const value = crossAxis(segment.axis) === 'x' ? pointer.x : pointer.y
  const pin = createPin(segment.index, segment.axis, value, input.start.point, input.end.point)
  return mergePin(input.pins ?? [], pin)
}
