// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/nudge.test.ts`).
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

import type { ElbowRect } from './geometry'
import { routeElbow } from './elbowRouter'
import { channelSpacingDefects, coincidentOverlap, countCrossings, nudgeRoutes, orderBundle } from './nudge'

const A: ElbowRect = { x: 0, y: 0, w: 320, h: 260 }
const B: ElbowRect = { x: 600, y: -80, w: 320, h: 200 }

const cable = (fromY: number, toY: number) =>
  routeElbow({
    start: { point: { x: A.x + A.w, y: fromY }, side: 'right', box: A },
    end: { point: { x: B.x, y: toY }, side: 'left', box: B },
  })

describe('the defect', () => {
  it('routes every parallel cable onto the identical midline channel', () => {
    const routes = [cable(150, 0), cable(185, 35)]
    // Both turn at x = (320 + 600) / 2 = 460.
    expect(routes[0].points[1].x).toBe(460)
    expect(routes[1].points[1].x).toBe(460)
    // Their verticals span [0,150] and [35,185]: 115 px drawn on top of itself.
    expect(coincidentOverlap(routes)).toBeCloseTo(115, 6)
  })
})

describe('nudgeRoutes', () => {
  it('drives coincident overlap to zero for a parallel bundle', () => {
    const report = nudgeRoutes([cable(150, 0), cable(185, 35)])
    expect(report.overlapBefore).toBeCloseTo(115, 6)
    expect(report.overlapAfter).toBe(0)
  })

  it('orders the bundle so the spread removes the crossings instead of adding them', () => {
    const before = [cable(150, 0), cable(185, 35)]
    const report = nudgeRoutes(before)
    // The upper source takes the left-hand channel — exactly the sketch.
    expect(report.routes[0].points[1].x).toBeLessThan(report.routes[1].points[1].x)
    expect(countCrossings(report.routes)).toBe(0)
    expect(report.forcedCrossings).toHaveLength(0)
  })

  it('reports a forced crossing when the connection order genuinely inverts', () => {
    // out_1 -> in_2 and out_2 -> in_1: no channel assignment can un-cross these.
    const report = nudgeRoutes([cable(150, 35), cable(185, 0)])
    expect(report.forcedCrossings).toHaveLength(1)
    expect(report.overlapAfter).toBe(0)
    // Exactly one crossing survives, and it is the one the hop belongs on.
    expect(countCrossings(report.routes)).toBe(1)
  })

  it('scales past two: a five-cable parallel bundle ends with zero overlap', () => {
    const routes = [0, 1, 2, 3, 4].map((i) => cable(40 + i * 34, -60 + i * 34))
    const report = nudgeRoutes(routes)
    expect(report.overlapBefore).toBeCloseTo(360, 6)
    expect(report.overlapAfter).toBe(0)
    expect(countCrossings(report.routes)).toBe(0)
    const xs = report.routes.map((r) => r.points[1].x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('is a pure function — the input routes are untouched', () => {
    const routes = [cable(150, 0), cable(185, 35)]
    const snapshot = JSON.stringify(routes)
    nudgeRoutes(routes)
    expect(JSON.stringify(routes)).toBe(snapshot)
  })

  it('leaves a lone cable exactly where the router put it', () => {
    const only = [cable(150, 0)]
    const report = nudgeRoutes(only)
    expect(report.routes[0].points).toEqual(only[0].points)
    expect(report.bundles).toHaveLength(0)
  })

  it('never moves the first or last segment, so ports stay welded', () => {
    const routes = [cable(150, 0), cable(185, 35)]
    const report = nudgeRoutes(routes)
    report.routes.forEach((r, i) => {
      expect(r.points[0]).toEqual(routes[i].points[0])
      expect(r.points[r.points.length - 1]).toEqual(routes[i].points[routes[i].points.length - 1])
    })
  })

  it('stays orthogonal after nudging', () => {
    const report = nudgeRoutes([cable(150, 0), cable(185, 35), cable(220, 70)])
    for (const route of report.routes) {
      for (let i = 0; i + 1 < route.points.length; i += 1) {
        const a = route.points[i]
        const b = route.points[i + 1]
        const axisAligned = Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6
        expect(axisAligned).toBe(true)
      }
    }
  })

  it('is stable: nudging an already-nudged bundle is a no-op', () => {
    const once = nudgeRoutes([cable(150, 0), cable(185, 35), cable(220, 70)])
    const twice = nudgeRoutes(once.routes)
    expect(twice.routes.map((r) => r.points)).toEqual(once.routes.map((r) => r.points))
  })
})

describe('fan-out from a single port', () => {
  // Three cables leaving ONE output port. They share their source leg by
  // definition — you cannot separate lines that start at the same point — so
  // the trunk is correct, not a defect. What must still happen is that the
  // channels separate, and that they order by where the paths diverge (the far
  // end) rather than by source, which carries no information here.
  const FanA: ElbowRect = { x: 0, y: 0, w: 300, h: 260 }
  const FanB: ElbowRect = { x: 620, y: -120, w: 300, h: 340 }
  const fan = [-60, 20, 100].map((toY) =>
    routeElbow({
      start: { point: { x: 300, y: 130 }, side: 'right', box: FanA },
      end: { point: { x: 620, y: toY }, side: 'left', box: FanB },
    }),
  )

  it('separates the channels and orders them by divergence, not by source', () => {
    const report = nudgeRoutes(fan)
    const xs = report.routes.map((r) => r.points[1].x)
    expect(xs).toEqual([446, 460, 474])
    expect(countCrossings(report.routes)).toBe(0)
  })

  it('leaves exactly the shared source leg overlapping, and nothing else', () => {
    const report = nudgeRoutes(fan)
    // Every route still starts at the same port, so the legs from x=300 to the
    // innermost channel coincide. No *vertical* overlap survives.
    const verticalOverlap = coincidentOverlap(
      report.routes.map((r) => ({ ...r, points: r.points.slice(1) })),
    )
    expect(verticalOverlap).toBe(0)
    expect(report.overlapAfter).toBeGreaterThan(0)
  })
})

describe('stability under node movement', () => {
  // The failure mode draw.io documents in its own libavoid adapter: competing
  // edges between the same pair "route non-deterministically and can oscillate
  // during the live preview". Dragging a node must not permute the channel.
  const order = (dy: number) => {
    const routes = [cable(150 + dy, 0), cable(185 + dy, 35), cable(220 + dy, 70)]
    const report = nudgeRoutes(routes)
    const xs = report.routes.map((r) => r.points[1].x)
    // Rank of each cable within the channel, independent of absolute position.
    return xs
      .map((x, i) => [x, i] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, i]) => i)
  }

  it('keeps the same channel order across a slow drag', () => {
    const baseline = order(0)
    for (let dy = -40; dy <= 40; dy += 4) {
      expect(order(dy), `channel order flipped at dy=${dy}`).toEqual(baseline)
    }
  })

  it('a one-pixel move never permutes the channel', () => {
    for (let dy = 0; dy < 12; dy += 1) {
      expect(order(dy)).toEqual(order(dy + 1))
    }
  })
})

describe('multi-segment routes (an obstacle between the pair)', () => {
  // A wall between the blocks forces 6-point routes: three interior segments,
  // so the same two cables share THREE separate channels. This is the case
  // where a depth-1 ordering rule could differ from MSAGL's unbounded fork
  // walk, so it is worth pinning down rather than assuming.
  const WallA: ElbowRect = { x: 0, y: 200, w: 240, h: 200 }
  const WallB: ElbowRect = { x: 760, y: 0, w: 240, h: 200 }
  const WALL: ElbowRect = { x: 400, y: 60, w: 120, h: 380 }
  const thread = (fromY: number, toY: number) =>
    routeElbow({
      start: { point: { x: 240, y: fromY }, side: 'right', box: WallA },
      end: { point: { x: 760, y: toY }, side: 'left', box: WallB },
      obstacles: [WALL],
    })
  const routes = () => [thread(260, 60), thread(300, 100), thread(340, 140)]

  it('separates every shared channel, not just the first', () => {
    const before = routes()
    expect(before.every((r) => r.points.length === 6)).toBe(true)
    const report = nudgeRoutes(before)
    // The single-edge planner now keeps the full 24px obstacle padding, so
    // these shared runs are shorter than the old raw-boundary routes.
    expect(report.overlapBefore).toBeCloseTo(1328, 6)
    expect(report.overlapAfter).toBe(0)
    expect(countCrossings(report.routes)).toBe(0)
    // Three distinct bundles: two vertical channels and the horizontal run.
    expect(report.bundles).toHaveLength(3)
  })

  it('orders each channel independently, reversing where the geometry demands', () => {
    const report = nudgeRoutes(routes())
    const order = (i: number) => report.bundles[i].cables
    // Leaving the sources the cables nest one way; after rounding the wall the
    // order inverts, because cable 0 must end up above the others at its port.
    expect(order(0)).toEqual([0, 1, 2])
    expect(order(2)).toEqual([2, 1, 0])
  })
})

describe('locked cables (the ones the user authored)', () => {
  const three = () => [cable(150, 0), cable(185, 35), cable(220, 70)]

  const channelGaps = (routes: ReturnType<typeof cable>[]) => {
    const channels = [...new Set(routes.map((route) => route.points[1].x))]
      .sort((a, b) => a - b)
    return channels.slice(1).map((channel, index) => channel - channels[index])
  }

  it('never moves a locked cable', () => {
    const before = three()
    const frozen = JSON.stringify(before[1].points)
    const report = nudgeRoutes(before, {}, [false, true, false])
    expect(JSON.stringify(report.routes[1].points)).toBe(frozen)
  })

  it('spreads the free cables around the locked one instead of onto it', () => {
    const report = nudgeRoutes(three(), {}, [false, true, false])
    const channels = report.routes.map((r) => r.points[1].x)
    const lockedChannel = channels[1]
    // No free cable may share the locked cable's channel...
    expect(channels[0]).not.toBeCloseTo(lockedChannel, 6)
    expect(channels[2]).not.toBeCloseTo(lockedChannel, 6)
    // ...and the ordering still holds around it.
    expect([...channels].sort((a, b) => a - b)).toEqual(channels)
    expect(countCrossings(report.routes)).toBe(0)
  })

  it('keeps an even 14-unit cadence when a locked rail falls between the half-step slots', () => {
    const routes = [cable(150, 0), cable(185, 35), cable(220, 70), cable(255, 105)]
    const locked = [false, false, true, false]
    const frozen = JSON.stringify(routes[2].points)
    const report = nudgeRoutes(routes, {}, locked)

    expect(JSON.stringify(report.routes[2].points)).toBe(frozen)
    expect(channelGaps(report.routes)).toEqual([14, 14, 14])
    expect(channelSpacingDefects(routes, routes, locked).length).toBeGreaterThan(0)
    expect(report.spacingDefects).toEqual([])
  })

  it('never stacks two free rails when coincident authored rails make their order impossible', () => {
    const routes = Array.from({ length: 7 }, (_, index) => cable(58 + index * 30, -48 + index * 30))
    const locked = [false, true, false, false, false, true, false]
    const frozen = locked.map((isLocked, index) => isLocked ? JSON.stringify(routes[index].points) : null)
    const report = nudgeRoutes(routes, {}, locked)

    locked.forEach((isLocked, index) => {
      if (isLocked) expect(JSON.stringify(report.routes[index].points)).toBe(frozen[index])
    })
    expect(channelGaps(report.routes)).toEqual([14, 14, 14, 14, 14])
  })

  it('anchors every obstacle channel to the authored route instead of leaving 7/21-unit gaps', () => {
    const left: ElbowRect = { x: 0, y: 210, w: 220, h: 210 }
    const right: ElbowRect = { x: 760, y: 0, w: 220, h: 210 }
    const wall: ElbowRect = { x: 390, y: 65, w: 130, h: 390 }
    const routes = Array.from({ length: 5 }, (_, index) => routeElbow({
      start: { point: { x: 220, y: 260 + index * 32 }, side: 'right', box: left },
      end: { point: { x: 760, y: 55 + index * 32 }, side: 'left', box: right },
      obstacles: [wall],
    }))
    const frozen = JSON.stringify(routes[2].points)
    const report = nudgeRoutes(routes, {}, [false, false, true, false, false])

    expect(JSON.stringify(report.routes[2].points)).toBe(frozen)
    // First vertical, shared horizontal, and final vertical all use the same
    // 14-unit cadence around the authored route where their spans overlap.
    expect(report.routes.map((route) => route.points[1].x)).toEqual([338, 352, 366, 380, 394])
    expect(report.routes.slice(0, 4).map((route) => route.points[2].y)).toEqual([13, 27, 41, 55])
    expect(report.routes.slice(0, 4).map((route) => route.points[3].y)).toEqual([13, 27, 41, 55])
  })

  it('is a no-op when every cable is locked', () => {
    const before = three()
    const snapshot = JSON.stringify(before.map((r) => r.points))
    const report = nudgeRoutes(before, {}, [true, true, true])
    expect(JSON.stringify(report.routes.map((r) => r.points))).toBe(snapshot)
  })
})


describe('bundle ordering when a leg runs the other way', () => {
  /**
   * The constraint `orderBundle` derives for one pair of segments sharing a
   * channel. Built by hand because the interesting cases are the ones the
   * left-to-right fixtures above cannot produce.
   */
  const segment = (over: Partial<Parameters<typeof orderBundle>[0][number]>) => ({
    cable: 0,
    at: 1,
    axis: 'y' as const,
    channel: 100,
    lo: 0,
    hi: 200,
    fromSpan: 0,
    toSpan: 200,
    prevChannel: 60,
    nextChannel: 60,
    ...over,
  })

  /**
   * WHY these two exist: the rule used to read "arriving from the LEFT" and
   * "leaving to the RIGHT", which is the whole truth only while every port sits
   * on a left or right wall and every cable flows left to right. A socket on a
   * top or bottom wall — or an input on a card's RIGHT wall, which the
   * communication lens produces routinely — reverses a leg, and the old form
   * then dropped the constraint SILENTLY rather than reversing it. Half a
   * constraint set is worse than none: it pins a crossing-free bundle into the
   * one order that crosses, and hides the genuine cycles.
   */
  it('constrains a segment whose ARRIVING leg comes from the far side', () => {
    // WHY the ids are 1 and 0 rather than 0 and 1: with an EMPTY constraint
    // matrix the sort falls through to a cable-id tie-break, and the first
    // version of this test happened to assert the answer that tie-break gives
    // — so it passed against the very bug it claims to catch. An adversarial
    // audit caught that. Choosing ids the tie-break would order the OTHER way
    // is what makes the assertion discriminate between the two rules.
    const { order } = orderBundle([
      segment({ cable: 1 }),
      // Arrives inside the first segment's span, from the right.
      segment({ cable: 0, fromSpan: 100, toSpan: 300, prevChannel: 180, nextChannel: 180 }),
    ])
    expect(order).toHaveLength(2)
    // The reversed leg must place the second segment on the far side of the
    // first. Dropping it leaves the tie-break to answer [1, 0] instead.
    expect(order).toEqual([0, 1])
  })

  it('constrains the mirror image the mirrored way', () => {
    const { order } = orderBundle([
      segment({ cable: 0 }),
      // Leaves inside the first segment's span, towards the left.
      segment({ cable: 1, fromSpan: 300, toSpan: 150, prevChannel: 20, nextChannel: 20 }),
    ])
    expect(order).toHaveLength(2)
    expect(order[0]).toBe(1)
  })

  it('still orders an ordinary left-to-right bundle', () => {
    // Both legs of cable 1 cross cable 0's span, arriving from the left and
    // leaving to the right — the case the original rule was written for. It is
    // a genuine cycle (each leg wants the opposite order), so what matters is
    // that it is REPORTED rather than silently resolved one way.
    const { order, forced } = orderBundle([
      segment({ cable: 0 }),
      segment({ cable: 1, fromSpan: 100, toSpan: 150, prevChannel: 60, nextChannel: 180 }),
    ])
    expect(order).toHaveLength(2)
    expect(forced.length).toBeGreaterThan(0)
  })
})
