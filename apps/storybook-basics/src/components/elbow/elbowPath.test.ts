// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowPath.test.ts`).
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

import { describe, expect, it } from 'vitest'

import { elbowPath, elbowPointAt, elbowRouteLength } from './elbowPath'
import type { ElbowRouteInput } from './elbowRouter'
import { pinElbowSegment, routeElbow } from './elbowRouter'

const SOURCE = { x: 0, y: 0, w: 160, h: 80 }
const TARGET = { x: 320, y: 200, w: 160, h: 80 }

const stacked: ElbowRouteInput = {
  start: { point: { x: 160, y: 40 }, side: 'right', box: SOURCE },
  end: { point: { x: 320, y: 240 }, side: 'left', box: TARGET },
}

describe('elbowPath', () => {
  it('starts at the start point and ends at the end point', () => {
    const path = elbowPath(routeElbow(stacked))
    expect(path.startsWith('M 160 40')).toBe(true)
    expect(path.endsWith('L 320 240')).toBe(true)
  })

  it('rounds every corner with a quadratic', () => {
    const route = routeElbow(stacked)
    const path = elbowPath(route)
    const corners = route.points.length - 2
    expect(path.split('Q').length - 1).toBe(corners)
  })

  it('draws hard corners at radius 0', () => {
    const path = elbowPath(routeElbow(stacked), { radius: 0 })
    expect(path).not.toContain('Q')
    expect(path.split('L').length - 1).toBe(routeElbow(stacked).points.length - 1)
  })

  it('never lets a corner radius eat more than half a segment', () => {
    // A 6px jog between two long runs: the radius must clamp to 3, so the
    // rounded corner cannot overshoot into its neighbour.
    const tight: ElbowRouteInput = {
      start: { point: { x: 160, y: 40 }, side: 'right', box: SOURCE },
      end: { point: { x: 320, y: 46 }, side: 'left', box: { ...TARGET, y: 6 } },
    }
    const route = routeElbow(tight)
    const path = elbowPath(route, { radius: 40 })
    for (const value of path.match(/-?\d+(\.\d+)?/g) ?? []) {
      expect(Number.isFinite(Number(value))).toBe(true)
    }
    // every drawn coordinate stays inside the polyline's own bounding box
    const xs = route.points.map((point) => point.x)
    const ys = route.points.map((point) => point.y)
    const coords = (path.match(/-?\d+(\.\d+)? -?\d+(\.\d+)?/g) ?? [])
      .map((pair) => pair.split(' ').map(Number))
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6)
      expect(x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6)
      expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6)
      expect(y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6)
    }
  })

  it('handles a degenerate route without emitting NaN', () => {
    const point = { x: 12, y: 12 }
    const route = routeElbow({
      start: { point, side: 'right' },
      end: { point: { ...point }, side: 'left' },
    })
    expect(elbowPath(route)).toBe('M 12 12')
  })

  it('never writes negative zero', () => {
    const route = routeElbow({
      start: { point: { x: -0.001, y: 0 }, side: 'right' },
      end: { point: { x: 200, y: 0 }, side: 'left' },
    })
    expect(elbowPath(route)).not.toContain('-0 ')
  })

  it('is stable: same route, same string', () => {
    const pins = pinElbowSegment(stacked, 1, { x: 260, y: 0 })!
    const first = elbowPath(routeElbow({ ...stacked, pins }))
    const second = elbowPath(routeElbow({ ...stacked, pins }))
    expect(second).toBe(first)
  })
})

describe('elbowRouteLength / elbowPointAt', () => {
  it('measures the manhattan length of the polyline', () => {
    const route = routeElbow(stacked)
    const byHand = route.points.slice(0, -1).reduce((total, point, index) => (
      total + Math.abs(route.points[index + 1].x - point.x)
        + Math.abs(route.points[index + 1].y - point.y)
    ), 0)
    expect(elbowRouteLength(route)).toBeCloseTo(byHand, 9)
  })

  it('anchors a label on the polyline, not on the chord', () => {
    const route = routeElbow(stacked)
    const middle = elbowPointAt(route, 0.5)
    const onLine = route.points.slice(0, -1).some((from, index) => {
      const to = route.points[index + 1]
      const flatY = Math.abs(from.y - to.y) < 1e-6
      return flatY
        ? Math.abs(middle.y - from.y) < 1e-6
          && middle.x >= Math.min(from.x, to.x) - 1e-6
          && middle.x <= Math.max(from.x, to.x) + 1e-6
        : Math.abs(middle.x - from.x) < 1e-6
          && middle.y >= Math.min(from.y, to.y) - 1e-6
          && middle.y <= Math.max(from.y, to.y) + 1e-6
    })
    expect(onLine).toBe(true)
  })

  it('clamps the ratio to the endpoints', () => {
    const route = routeElbow(stacked)
    expect(elbowPointAt(route, -5)).toEqual(route.points[0])
    expect(elbowPointAt(route, 5)).toEqual(route.points[route.points.length - 1])
  })
})
