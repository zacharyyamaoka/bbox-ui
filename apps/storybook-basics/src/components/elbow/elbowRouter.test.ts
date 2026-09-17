// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowRouter.test.ts`).
//
// Zero code edits below this banner — a byte-for-byte copy. It is the independent oracle
// for 1,028 lines of routing math that no play function could re-derive as
// well (docs/TRACE-PLAN.md D4).
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

import type { ElbowPoint, ElbowRect } from './geometry'
import { boundsOfRect, boundsOverlap, pointInsideBounds } from './geometry'
import type { ElbowEndpoint, ElbowRoute, ElbowRouteInput } from './elbowRouter'
import { routeElbow, pinElbowSegment } from './elbowRouter'
import { createPin, resolvePin } from './elbowPins'
import {
	resolveElbowSoftClearanceOptions,
	softClearanceCost,
	type ElbowSoftRoute,
} from './softClearance'

// --- fixtures ---------------------------------------------------------------

const SOURCE: ElbowRect = { x: 0, y: 0, w: 160, h: 80 }
const TARGET: ElbowRect = { x: 320, y: 0, w: 160, h: 80 }

function outPort(box: ElbowRect, at = 0.5): ElbowEndpoint {
  return { point: { x: box.x + box.w, y: box.y + box.h * at }, side: 'right', box }
}

function inPort(box: ElbowRect, at = 0.5): ElbowEndpoint {
  return { point: { x: box.x, y: box.y + box.h * at }, side: 'left', box }
}

function translate(box: ElbowRect, dx: number, dy: number): ElbowRect {
  return { ...box, x: box.x + dx, y: box.y + dy }
}

function sameLevel(): ElbowRouteInput {
  return { start: outPort(SOURCE), end: inPort(TARGET) }
}

// --- assertions -------------------------------------------------------------

function expectOrthogonal(route: ElbowRoute, epsilon = 1e-9): void {
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const from = route.points[index]
    const to = route.points[index + 1]
    const movedX = Math.abs(to.x - from.x) > epsilon
    const movedY = Math.abs(to.y - from.y) > epsilon
    expect(
      movedX !== movedY || (!movedX && !movedY),
      `segment ${index} (${from.x},${from.y})->(${to.x},${to.y}) is not axis-aligned`,
    ).toBe(true)
  }
  for (const segment of route.segments) {
    if (segment.axis === 'x') expect(segment.start.y).toBeCloseTo(segment.end.y, 9)
    else expect(segment.start.x).toBeCloseTo(segment.end.x, 9)
  }
}

function expectEndpoints(route: ElbowRoute, input: ElbowRouteInput): void {
  expect(route.points[0]).toEqual(input.start.point)
  expect(route.points[route.points.length - 1]).toEqual(input.end.point)
}

function crosses(route: ElbowRoute, rect: ElbowRect): boolean {
  const bounds = boundsOfRect(rect)
  // Sample densely along every segment; an orthogonal polyline that clears a box
  // clears it at every sample.
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const from = route.points[index]
    const to = route.points[index + 1]
    const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)))
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps
      const sample: ElbowPoint = {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      }
      if (pointInsideBounds(sample, bounds, 1e-6)) return true
    }
  }
  return false
}

// --- the shapes a dataflow board actually makes ------------------------------

describe('routeElbow — layouts', () => {
  it('runs straight when the ports already line up', () => {
    const input = sameLevel()
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.fallback).toBe(false)
    expect(route.segments).toHaveLength(1)
    expect(route.points).toHaveLength(2)
  })

  it('bends three times for a stacked target', () => {
    const input: ElbowRouteInput = {
      start: outPort(SOURCE),
      end: inPort(translate(TARGET, 0, 180)),
    }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.fallback).toBe(false)
    expect(route.segments).toHaveLength(3)
    expect(route.segments.map((segment) => segment.axis)).toEqual(['x', 'y', 'x'])
    // the vertical rail lives in the gap, not inside either block
    const rail = route.segments[1].start.x
    expect(rail).toBeGreaterThan(SOURCE.x + SOURCE.w)
    expect(rail).toBeLessThan(TARGET.x + 180)
  })

  it('loops around when the target sits behind the source', () => {
    const behind = { x: -420, y: 40, w: 160, h: 80 }
    const input: ElbowRouteInput = { start: outPort(SOURCE), end: inPort(behind) }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.fallback).toBe(false)
    // it must leave rightwards and enter leftwards, so at least four bends
    expect(route.segments.length).toBeGreaterThanOrEqual(5)
    expect(route.segments[0].end.x).toBeGreaterThan(input.start.point.x)
    const last = route.segments[route.segments.length - 1]
    expect(last.start.x).toBeLessThan(input.end.point.x)
    expect(crosses(route, SOURCE)).toBe(false)
    expect(crosses(route, behind)).toBe(false)
  })

  it('loops outside when an output returns to its own Block input', () => {
    const input: ElbowRouteInput = { start: outPort(SOURCE), end: inPort(SOURCE) }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.fallback).toBe(false)
    expect(route.segments[0].end.x).toBeGreaterThan(input.start.point.x)
    expect(crosses(route, SOURCE)).toBe(false)
    expect(Math.max(...route.points.map((point) => point.y))).toBeGreaterThan(SOURCE.y + SOURCE.h)
  })

  it('never crosses either bound block, across a sweep of target positions', () => {
    let checked = 0
    for (let dx = -600; dx <= 600; dx += 60) {
      for (let dy = -400; dy <= 400; dy += 80) {
        const target = translate(TARGET, dx, dy)
        const input: ElbowRouteInput = { start: outPort(SOURCE), end: inPort(target) }
        const route = routeElbow(input)
        // Orthogonality and endpoint welding hold everywhere, overlaps included.
        expectOrthogonal(route)
        expectEndpoints(route, input)
        // Clearance can only be asserted where it is geometrically possible: if
        // one block's port sits inside the other block, no route reaches it
        // without entering.
        if (boundsOverlap(boundsOfRect(SOURCE), boundsOfRect(target))) continue
        checked += 1
        expect(crosses(route, SOURCE), `source crossed at ${dx},${dy}`).toBe(false)
        expect(crosses(route, target), `target crossed at ${dx},${dy}`).toBe(false)
      }
    }
    expect(checked).toBeGreaterThan(150)
  })

  it('honours top and bottom ports', () => {
    const input: ElbowRouteInput = {
      start: { point: { x: 80, y: 0 }, side: 'top', box: SOURCE },
      end: { point: { x: 400, y: 80 }, side: 'bottom', box: TARGET },
    }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.segments[0].axis).toBe('y')
    expect(route.segments[0].end.y).toBeLessThan(input.start.point.y)
    const last = route.segments[route.segments.length - 1]
    expect(last.axis).toBe('y')
    expect(last.start.y).toBeGreaterThan(input.end.point.y)
  })
})

describe('routeElbow — obstacles', () => {
  const blocker: ElbowRect = { x: 210, y: -60, w: 60, h: 200 }

  it('steers around a box standing in the corridor', () => {
    const input: ElbowRouteInput = { ...sameLevel(), obstacles: [blocker] }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.fallback).toBe(false)
    expect(crosses(route, blocker)).toBe(false)
    expect(route.segments.length).toBeGreaterThan(1)
  })

  it('goes straight through the same corridor once the obstacle is gone', () => {
    const withBlocker = routeElbow({ ...sameLevel(), obstacles: [blocker] })
    const without = routeElbow(sameLevel())
    expect(without.segments).toHaveLength(1)
    expect(withBlocker.segments.length).toBeGreaterThan(without.segments.length)
  })

  it('clears several obstacles at once', () => {
    const obstacles: ElbowRect[] = [
      { x: 200, y: -200, w: 40, h: 220 },
      { x: 200, y: 60, w: 40, h: 220 },
    ]
    const input: ElbowRouteInput = { ...sameLevel(), obstacles }
    const route = routeElbow(input)
    expectOrthogonal(route)
    for (const obstacle of obstacles) expect(crosses(route, obstacle)).toBe(false)
  })
})

describe('routeElbow — soft cable clearance', () => {
	it('prefers a clear equivalent rail, while zero weights reproduce the legacy route', () => {
		const input: ElbowRouteInput = {
			start: outPort(SOURCE),
			end: inPort(translate(TARGET, 0, 160)),
		}
		const reference: ElbowSoftRoute = {
			// This horizontal run intersects the unweighted mid-gap vertical rail.
			points: [{ x: 160, y: 140 }, { x: 260, y: 140 }, { x: 260, y: 260 }, { x: 480, y: 260 }],
		}
		const baseline = routeElbow(input)
		const weighted = resolveElbowSoftClearanceOptions({
			clearance: 32,
			nearMissWeight: 160,
			crossingWeight: 640,
		})
		const soft = routeElbow({
			...input,
			softClearance: { routes: [reference], options: weighted },
		})
		const disabled = routeElbow({
			...input,
			softClearance: {
				routes: [reference],
				options: { clearance: 0, nearMissWeight: 0, crossingWeight: 0 },
			},
		})

		expect(softClearanceCost(baseline.points, [reference], weighted)).toBeGreaterThan(0)
		expect(softClearanceCost(soft.points, [reference], weighted)).toBeLessThan(
			softClearanceCost(baseline.points, [reference], weighted),
		)
		expect(disabled.points).toEqual(baseline.points)
		expectOrthogonal(soft)
		expectEndpoints(soft, input)
	})

	it('never charges a shared terminal as a cable crossing', () => {
		const options = resolveElbowSoftClearanceOptions({ clearance: 32, nearMissWeight: 160, crossingWeight: 640 })
		const first = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]
		const second: ElbowSoftRoute = { points: [{ x: 100, y: 80 }, { x: 180, y: 80 }] }
		expect(softClearanceCost(first, [second], options)).toBe(0)
	})
})

describe('routeElbow — degenerate input', () => {
  it('returns a two-point stub for coincident endpoints', () => {
    const point = { x: 40, y: 40 }
    const route = routeElbow({
      start: { point, side: 'right' },
      end: { point: { ...point }, side: 'left' },
    })
    expect(route.points).toHaveLength(2)
    expect(route.segments).toHaveLength(0)
    expect(route.fallback).toBe(false)
  })

  it('survives non-finite endpoints without throwing', () => {
    const route = routeElbow({
      start: { point: { x: Number.NaN, y: 0 }, side: 'right' },
      end: { point: { x: 100, y: 0 }, side: 'left' },
    })
    expect(route.points).toHaveLength(2)
    expect(route.segments).toHaveLength(0)
  })

  it('routes between two unbound points', () => {
    const input: ElbowRouteInput = {
      start: { point: { x: 0, y: 0 }, side: 'right' },
      end: { point: { x: 200, y: 120 }, side: 'left' },
    }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.segments.length).toBeGreaterThanOrEqual(3)
  })

  it('emits no zero-length segments', () => {
    for (let dy = -12; dy <= 12; dy += 1) {
      const input: ElbowRouteInput = {
        start: outPort(SOURCE),
        end: inPort(translate(TARGET, 0, dy)),
      }
      const route = routeElbow(input)
      for (const segment of route.segments) expect(segment.length).toBeGreaterThan(1e-6)
      expectOrthogonal(route)
    }
  })

  it('handles endpoints closer together than the padding', () => {
    const tight = { x: 168, y: 0, w: 160, h: 80 }
    const input: ElbowRouteInput = { start: outPort(SOURCE), end: inPort(tight) }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
  })

  it('handles overlapping boxes', () => {
    const overlapping = { x: 80, y: 20, w: 160, h: 80 }
    const input: ElbowRouteInput = { start: outPort(SOURCE), end: inPort(overlapping) }
    const route = routeElbow(input)
    expectOrthogonal(route)
    expectEndpoints(route, input)
  })
})

describe('routeElbow — stability', () => {
  it('is deterministic: identical input, identical route', () => {
    const input: ElbowRouteInput = {
      start: outPort(SOURCE),
      end: inPort(translate(TARGET, 40, 210)),
      obstacles: [{ x: 220, y: 60, w: 50, h: 90 }],
    }
    const first = routeElbow(input)
    const second = routeElbow(input)
    expect(second.points).toEqual(first.points)
    expect(second.segments).toEqual(first.segments)
  })

  it('does not mutate its input', () => {
    const input: ElbowRouteInput = {
      start: outPort(SOURCE),
      end: inPort(translate(TARGET, 0, 200)),
    }
    const snapshot = structuredClone(input)
    routeElbow(input)
    expect(input).toEqual(snapshot)
  })

  it('returns points that are copies, not shared references', () => {
    const input = sameLevel()
    const route = routeElbow(input)
    route.points[0].x = 9999
    expect(input.start.point.x).toBe(SOURCE.x + SOURCE.w)
  })
})

// --- the named bug: bends must travel with their endpoints -------------------

describe('routeElbow — pinned bends follow their endpoints', () => {
  function stacked(dx = 0, dy = 0): ElbowRouteInput {
    return {
      start: outPort(translate(SOURCE, dx, dy)),
      end: inPort(translate(TARGET, dx, dy + 200)),
    }
  }

  it('pins the middle rail exactly where the pointer left it', () => {
    const input = stacked()
    const pins = pinElbowSegment(input, 1, { x: 300, y: 0 })
    expect(pins).not.toBeNull()
    const route = routeElbow({ ...input, pins: pins! })
    expectOrthogonal(route)
    expect(route.droppedPins).toHaveLength(0)
    expect(route.segments[1].start.x).toBeCloseTo(300, 9)
    expect(route.segments[1].end.x).toBeCloseTo(300, 9)
  })

  it('refuses to pin an endpoint segment', () => {
    const input = stacked()
    expect(pinElbowSegment(input, 0, { x: 300, y: 0 })).toBeNull()
    const lastIndex = routeElbow(input).segments.length - 1
    expect(pinElbowSegment(input, lastIndex, { x: 300, y: 0 })).toBeNull()
  })

  it('carries the bend with a whole-selection drag, frozen in place', () => {
    const input = stacked()
    const pins = pinElbowSegment(input, 1, { x: 300, y: 0 })!
    const before = routeElbow({ ...input, pins })

    const moved = { ...stacked(90, -35), pins }
    const after = routeElbow(moved)

    expectOrthogonal(after)
    expect(after.droppedPins).toHaveLength(0)
    // Both endpoints moved by the same delta, so the bend moved by exactly that
    // delta too — this is the bug Zach named: "dragging the box should drag
    // everything inside frozen in place".
    expect(after.segments[1].start.x - before.segments[1].start.x).toBeCloseTo(90, 9)
    expect(after.segments[1].start.y - before.segments[1].start.y).toBeCloseTo(-35, 9)
    // and the whole polyline is a rigid translation of the old one
    expect(after.points).toHaveLength(before.points.length)
    after.points.forEach((point, index) => {
      expect(point.x - before.points[index].x).toBeCloseTo(90, 9)
      expect(point.y - before.points[index].y).toBeCloseTo(-35, 9)
    })
  })

  it('moves the bend proportionally when only one endpoint moves', () => {
    const input = stacked()
    // pin the rail exactly halfway across the horizontal gap
    const start = input.start.point
    const end = input.end.point
    const halfway = (start.x + end.x) / 2
    const pins = pinElbowSegment(input, 1, { x: halfway, y: 0 })!
    expect(pins[0].t).toBeCloseTo(0.5, 9)

    const before = routeElbow({ ...input, pins })
    const stretched: ElbowRouteInput = {
      start: input.start,
      end: inPort(translate(TARGET, 120, 200)),
      pins,
    }
    const after = routeElbow(stretched)

    expectOrthogonal(after)
    expect(after.droppedPins).toHaveLength(0)
    // t = 0.5, end moved +120 → the rail keeps its place in the middle and
    // therefore moves by half of that.
    expect(after.segments[1].start.x - before.segments[1].start.x).toBeCloseTo(60, 9)
  })

  it('keeps the route orthogonal and endpoint-welded after a pin', () => {
    const input = stacked()
    for (const railX of [200, 240, 300, 360, 460]) {
      const pins = pinElbowSegment(input, 1, { x: railX, y: 0 })!
      const route = routeElbow({ ...input, pins })
      expectOrthogonal(route)
      expectEndpoints(route, input)
      expect(route.segments[1].start.x).toBeCloseTo(railX, 9)
    }
  })

  it('re-routing an unchanged pinned input returns an identical route', () => {
    const input = stacked()
    const pins = pinElbowSegment(input, 1, { x: 275, y: 0 })!
    const first = routeElbow({ ...input, pins })
    const second = routeElbow({ ...input, pins })
    expect(second.points).toEqual(first.points)
    expect(second.segments).toEqual(first.segments)
    expect(second.pins).toEqual(first.pins)
  })

  it('drops a pin whose segment no longer exists rather than corrupting the route', () => {
    const input = stacked()
    const pins = pinElbowSegment(input, 4, { x: 300, y: 0 })
      ?? [createPin(4, 'y', 300, input.start.point, input.end.point)]
    const route = routeElbow({ ...sameLevel(), pins })
    expectOrthogonal(route)
    expect(route.pins).toHaveLength(0)
    expect(route.droppedPins).toHaveLength(1)
  })

  it('drops a pin whose segment changed axis', () => {
    const input = stacked()
    const wrongAxis = [createPin(1, 'x', 300, input.start.point, input.end.point)]
    const route = routeElbow({ ...input, pins: wrongAxis })
    expectOrthogonal(route)
    expect(route.pins).toHaveLength(0)
    expect(route.droppedPins).toHaveLength(1)
  })

  it('supports more than one pinned bend at a time', () => {
    const input: ElbowRouteInput = {
      start: outPort(SOURCE),
      end: inPort({ x: -420, y: 220, w: 160, h: 80 }),
    }
    const base = routeElbow(input)
    const pinnable = base.segments.filter((segment) => segment.pinnable)
    expect(pinnable.length).toBeGreaterThanOrEqual(2)

    let pins = pinElbowSegment(input, pinnable[0].index, {
      x: pinnable[0].midpoint.x + 24,
      y: pinnable[0].midpoint.y + 24,
    })!
    pins = pinElbowSegment({ ...input, pins }, pinnable[1].index, {
      x: pinnable[1].midpoint.x - 18,
      y: pinnable[1].midpoint.y - 18,
    })!
    expect(pins).toHaveLength(2)

    const route = routeElbow({ ...input, pins })
    expectOrthogonal(route)
    expectEndpoints(route, input)
    expect(route.droppedPins).toHaveLength(0)
  })

  it('a second drag of the same segment replaces the first pin', () => {
    const input = stacked()
    const once = pinElbowSegment(input, 1, { x: 260, y: 0 })!
    const twice = pinElbowSegment({ ...input, pins: once }, 1, { x: 330, y: 0 })!
    expect(twice).toHaveLength(1)
    expect(routeElbow({ ...input, pins: twice }).segments[1].start.x).toBeCloseTo(330, 9)
  })
})

describe('pin frame maths', () => {
  const start = { x: 100, y: 0 }
  const end = { x: 500, y: 200 }

  it('round-trips a drag exactly', () => {
    for (const value of [-400, 0, 137.25, 300, 900]) {
      const pin = createPin(1, 'y', value, start, end)
      expect(resolvePin(pin, start, end)).toBeCloseTo(value, 9)
    }
  })

  it('translates rigidly when both endpoints translate', () => {
    const pin = createPin(1, 'y', 300, start, end)
    const moved = resolvePin(pin, { x: start.x + 70, y: start.y }, { x: end.x + 70, y: end.y })
    expect(moved).toBeCloseTo(370, 9)
  })

  it('falls back to a pixel offset when the endpoint span is degenerate', () => {
    const flat = { x: 100, y: 0 }
    const alsoFlat = { x: 100.5, y: 200 }
    const pin = createPin(1, 'y', 260, flat, alsoFlat)
    expect(pin.t).toBe(0.5)
    expect(resolvePin(pin, flat, alsoFlat)).toBeCloseTo(260, 9)
    // and it still translates rigidly
    expect(
      resolvePin(pin, { x: 110, y: 0 }, { x: 110.5, y: 200 }),
    ).toBeCloseTo(270, 9)
  })

  it('never amplifies endpoint motion without bound', () => {
    const nearlyFlat = { x: 100, y: 0 }
    const justPastFloor = { x: 110, y: 200 }
    const pin = createPin(1, 'y', 5000, nearlyFlat, justPastFloor)
    expect(Math.abs(pin.t)).toBeLessThanOrEqual(6)
    expect(resolvePin(pin, nearlyFlat, justPastFloor)).toBeCloseTo(5000, 6)
  })
})
