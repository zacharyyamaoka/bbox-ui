// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/nudge.ts`).
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
 * Channel assignment ("nudging") for a bundle of elbow cables.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * `routeElbow` is pure and routes **one** cable at a time. That is the right
 * seam — but it means two cables between the same pair of blocks are computed
 * in total ignorance of each other, and both pick the same corridor. Measured
 * on a two-block scene with two parallel cables, the real router returns:
 *
 *   out_1 -> in_1 : (320,150) (460,150) (460,  0) (600,  0)
 *   out_2 -> in_2 : (320,185) (460,185) (460, 35) (600, 35)
 *
 * Both verticals sit at x = 460.0 — the midline between the boxes — and their
 * spans [0,150] and [35,185] overlap for 115 px. Two cables, one visible line.
 * This is not an edge case: the midline is deterministic, so *every* parallel
 * pair between the same two blocks collides, always.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES
 *
 * Given the already-routed cables, find interior segments that are collinear
 * and overlapping, then spread them across distinct parallel channels. The
 * order they are spread in is not arbitrary: it is chosen so that the spread
 * introduces **no new crossings**, and — in the common case — removes the ones
 * the shared channel was creating.
 *
 * The ordering rule falls out of the geometry. For a vertical segment V_i at
 * x = c_i spanning (lo_i, hi_i), with a horizontal arriving from the left and
 * another leaving to the right:
 *
 *   • if another cable's *arriving* horizontal sits at a y strictly inside
 *     V_i's span, that cable must be routed LEFT of i, else it cuts V_i;
 *   • if another cable's *leaving* horizontal sits at a y strictly inside
 *     V_i's span, that cable must be routed RIGHT of i.
 *
 * Those pairwise "must be left of" facts form a graph. A topological order of
 * it is a crossing-free channel assignment. A **cycle** in it is a crossing
 * that no channel assignment can remove — the connection order genuinely
 * inverts — and that, precisely, is where a crossover hop earns its keep.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE, AND HOW THIS COMPARES TO THE REFERENCE IMPLEMENTATIONS
 *
 * This is NOT a port of anything. The ordering rule above was derived from the
 * geometry directly; the implementations below were read afterwards to check it.
 * That matters legally as well as intellectually: libavoid and its TypeScript
 * port `obstacle-router` are **LGPL**, which is not an attribution licence — a
 * credit in a comment would not discharge it — so neither was read. Everything
 * cited here is MIT, Apache-2.0 or EPL-2.0.
 *
 * The lineage is the vertical-constraint graph of VLSI channel routing
 * (Hashimoto & Stevens' left-edge algorithm, 1971). Three modern relatives:
 *
 * - **ELK** (`OrthogonalRoutingGenerator.java`, EPL-2.0) builds a conflict DAG
 *   between parallel runs and assigns each a `routingSlot` by Kahn's algorithm
 *   with `slot = max(current, source.slot + 1)`. That is structurally what
 *   `orderBundle` does. ELK *weights* its conflicts (crossings cost 16x a
 *   conflict) and picks the cheaper of the two orderings; we use hard
 *   constraints and report the cycle instead, because a cycle is exactly the
 *   "no assignment can fix this" answer the caller wants.
 *
 * - **MSAGL-js** (`CombinatorialNudger.ts`, MIT, Microsoft Research) orders two
 *   paths sharing a track by walking BOTH of them forward — and then backward —
 *   until they diverge at a fork, and comparing the projection of the fork
 *   points. Ours is the **depth-1 specialisation** of that walk: we compare the
 *   immediately adjacent legs rather than following the paths to their fork.
 *   For cables between two blocks the paths diverge immediately, so depth 1 IS
 *   the fork and the two rules agree. Verified further out too: with an obstacle
 *   forcing 6-point routes and three separate shared channels, this pass still
 *   reaches zero overlap and zero crossings, and correctly *inverts* the order
 *   between the first and last channel (see `nudge.test.ts`).
 *
 *   Where they genuinely differ is two cables sharing *consecutive* segments —
 *   truly coincident sub-paths. Depth 1 has no information there and falls back
 *   to the tie-break. Note the canonical algorithm concedes the same case:
 *   Pupyrev et al. state that "pairs of coincident paths ... are ordered
 *   arbitrarily on the edge".
 *
 * - **Mermaid** (`orthogonalRouter`, MIT) groups segments into `Track`s and
 *   offsets them at fixed `TRACK_SPACING` increments, leaning each track left or
 *   right by where its destinations sit. Closest in spirit to this file. MSAGL
 *   instead feeds the ordering to a real 1-D constraint solver, which buys
 *   variable spacing in crowded channels — the obvious upgrade path here if
 *   fixed `spacing` ever proves too rigid.
 *
 * Nothing here imports tldraw, React or the app. Same contract as the rest of
 * this folder: pure in, pure out, provable.
 */

import type { ElbowPoint } from './geometry'
import type { ElbowRoute } from './elbowRouter'

export interface NudgeOptions {
  /** Ideal gap between two parallel channels, in page units. */
  spacing: number
  /**
   * Two segment coordinates closer than this are treated as the same channel.
   * Also the threshold below which an overlap counts as "coincident".
   */
  tolerance: number
}

export const DEFAULT_NUDGE_OPTIONS: NudgeOptions = {
  spacing: 14,
  tolerance: 1,
}

/** One cable's interior segment that shares a channel with at least one other. */
interface Candidate {
  cable: number
  /** Index into `route.points` of the segment's first point. */
  at: number
  /**
   * The axis the segment RUNS along — the router's convention, so this value
   * can be handed straight to `createPin`. A vertical segment is 'y', and its
   * channel coordinate is therefore an x.
   */
  axis: 'x' | 'y'
  /** The shared coordinate: x for a vertical segment, y for a horizontal one. */
  channel: number
  /** The segment's extent along its own axis. */
  lo: number
  hi: number
  /** Where the segment starts and ends along the *span* axis, in draw order. */
  fromSpan: number
  toSpan: number
  /** The neighbouring points' channel coordinates — the arriving/leaving legs. */
  prevChannel: number
  nextChannel: number
}

export interface NudgeReport {
  /** Routes with their shared segments moved apart. Same order as the input. */
  routes: ElbowRoute[]
  /** How many distinct channels were split, and how many cables each carried. */
  bundles: { channel: number; axis: 'x' | 'y'; cables: number[] }[]
  /**
   * Pairs whose crossing no ordering can remove — a cycle in the constraint
   * graph. These, and only these, are the crossings worth drawing a hop at.
   */
  forcedCrossings: [number, number][]
  /** Total length of coincident collinear overlap, before and after. */
  overlapBefore: number
  overlapAfter: number
  /** Local channel-cadence failures that remain after the pass. */
  spacingDefects: ChannelSpacingDefect[]
}

export interface ChannelSpacingDefect {
  axis: 'x' | 'y'
  channel: number
  cables: number[]
  gap: number
  expected: number
  kind: 'stacked' | 'uneven'
}

/* ------------------------------- measuring ------------------------------- */

function segments(route: ElbowRoute): { at: number; axis: 'x' | 'y' }[] {
  const out: { at: number; axis: 'x' | 'y' }[] = []
  for (let i = 0; i + 1 < route.points.length; i += 1) {
    const a = route.points[i]
    const b = route.points[i + 1]
    // Same convention as the router's `segmentAxisOf`: the axis the segment
    // RUNS along. A horizontal run is 'x'; a vertical run is 'y'. The channel
    // coordinate is therefore on the CROSS axis.
    if (Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)) out.push({ at: i, axis: 'x' })
    else out.push({ at: i, axis: 'y' })
  }
  return out
}

/**
 * Total length over which two routes are drawn on top of each other. This is
 * the number the shared-midline defect shows up in, and the number nudging is
 * supposed to drive to zero.
 */
export function coincidentOverlap(
  routes: readonly ElbowRoute[],
  tolerance = DEFAULT_NUDGE_OPTIONS.tolerance,
): number {
  let total = 0
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      for (const si of segments(routes[i])) {
        for (const sj of segments(routes[j])) {
          if (si.axis !== sj.axis) continue
          const ai = routes[i].points[si.at]
          const bi = routes[i].points[si.at + 1]
          const aj = routes[j].points[sj.at]
          const bj = routes[j].points[sj.at + 1]
          const chan = si.axis === 'x' ? 'y' : 'x'
          const span = si.axis === 'x' ? 'x' : 'y'
          if (Math.abs(ai[chan] - aj[chan]) > tolerance) continue
          const lo = Math.max(Math.min(ai[span], bi[span]), Math.min(aj[span], bj[span]))
          const hi = Math.min(Math.max(ai[span], bi[span]), Math.max(aj[span], bj[span]))
          if (hi - lo > tolerance) total += hi - lo
        }
      }
    }
  }
  return total
}

/** Count of points where two routes cross transversally (not at a shared endpoint). */
export function countCrossings(routes: readonly ElbowRoute[]): number {
  let n = 0
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      for (const si of segments(routes[i])) {
        for (const sj of segments(routes[j])) {
          if (si.axis === sj.axis) continue
          const vert = si.axis === 'y' ? routes[i] : routes[j]
          const vi = si.axis === 'y' ? si.at : sj.at
          const horz = si.axis === 'y' ? routes[j] : routes[i]
          const hi_ = si.axis === 'y' ? sj.at : si.at
          const vx = vert.points[vi].x
          const vlo = Math.min(vert.points[vi].y, vert.points[vi + 1].y)
          const vhi = Math.max(vert.points[vi].y, vert.points[vi + 1].y)
          const hy = horz.points[hi_].y
          const hlo = Math.min(horz.points[hi_].x, horz.points[hi_ + 1].x)
          const hhi = Math.max(horz.points[hi_].x, horz.points[hi_ + 1].x)
          // Strict interior on both, so a shared corner is not a crossing.
          if (vx > hlo && vx < hhi && hy > vlo && hy < vhi) n += 1
        }
      }
    }
  }
  return n
}

/* ------------------------------- assigning ------------------------------- */

function candidates(
  routes: readonly ElbowRoute[],
  tolerance: number,
): Map<string, Candidate[]> {
  const buckets = new Map<string, Candidate[]>()
  routes.forEach((route, cable) => {
    for (const seg of segments(route)) {
      // First and last segments touch a fixed port and must not move.
      if (seg.at === 0 || seg.at + 2 >= route.points.length) continue
      const a = route.points[seg.at]
      const b = route.points[seg.at + 1]
      const chan = seg.axis === 'x' ? 'y' : 'x'
      const span = seg.axis === 'x' ? 'x' : 'y'
      const key = `${seg.axis}:${Math.round(a[chan] / Math.max(tolerance, 1e-6))}`
      const list = buckets.get(key) ?? []
      list.push({
        cable,
        at: seg.at,
        axis: seg.axis,
        channel: a[chan],
        lo: Math.min(a[span], b[span]),
        hi: Math.max(a[span], b[span]),
        fromSpan: a[span],
        toSpan: b[span],
        prevChannel: route.points[seg.at - 1][chan],
        nextChannel: route.points[seg.at + 2][chan],
      })
      buckets.set(key, list)
    }
  })
  return buckets
}

function spansOverlap(a: Candidate, b: Candidate, tolerance: number): boolean {
  return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > tolerance
}

function overlapComponents(bundle: readonly Candidate[], tolerance: number): Candidate[][] {
  const unseen = new Set(bundle.map((_, index) => index))
  const components: Candidate[][] = []
  while (unseen.size > 0) {
    const first = unseen.values().next().value as number
    unseen.delete(first)
    const queue = [first]
    const component: Candidate[] = []
    while (queue.length > 0) {
      const index = queue.shift()!
      component.push(bundle[index])
      for (const other of [...unseen]) {
        if (!spansOverlap(bundle[index], bundle[other], tolerance)) continue
        unseen.delete(other)
        queue.push(other)
      }
    }
    components.push(component)
  }
  return components
}

/**
 * Audit the local visual contract aggregate overlap cannot see: channels that
 * are stacked or leave a 7/21-style gap around an authored rail instead of the
 * requested cadence. Only segments that shared an overlapping input channel
 * are compared, and coincident authored/authored rails are exempt because the
 * command is forbidden from moving either one.
 */
export function channelSpacingDefects(
  before: readonly ElbowRoute[],
  after: readonly ElbowRoute[],
  locked: readonly boolean[] = [],
  options: Partial<NudgeOptions> = {},
): ChannelSpacingDefect[] {
  const opts = { ...DEFAULT_NUDGE_OPTIONS, ...options }
  const defects: ChannelSpacingDefect[] = []
  for (const bundle of candidates(before, opts.tolerance).values()) {
    for (const component of overlapComponents(bundle, opts.tolerance)) {
      if (component.length < 2) continue
      const members = component.map((candidate) => {
        const point = after[candidate.cable]?.points[candidate.at]
        const channel = candidate.axis === 'x' ? point?.y : point?.x
        return { candidate, channel, locked: Boolean(locked[candidate.cable]) }
      }).filter((member): member is typeof member & { channel: number } =>
        member.channel !== undefined)
      members.sort((a, b) => a.channel - b.channel || a.candidate.cable - b.candidate.cable)

      const groups: typeof members[] = []
      for (const member of members) {
        const group = groups.at(-1)
        if (group && Math.abs(group[0].channel - member.channel) <= opts.tolerance) group.push(member)
        else groups.push([member])
      }

      for (const group of groups) {
        const overlapping = group.some((a, index) => group.slice(index + 1).some((b) =>
          spansOverlap(a.candidate, b.candidate, opts.tolerance)
          && !(a.locked && b.locked)))
        if (!overlapping) continue
        defects.push({
          axis: component[0].axis,
          channel: component[0].channel,
          cables: group.map((member) => member.candidate.cable),
          gap: 0,
          expected: opts.spacing,
          kind: 'stacked',
        })
      }

      for (let index = 0; index + 1 < groups.length; index += 1) {
        const left = groups[index]
        const right = groups[index + 1]
        if (left.every((member) => member.locked) && right.every((member) => member.locked)) continue
        const overlapping = left.some((a) => right.some((b) =>
          spansOverlap(a.candidate, b.candidate, opts.tolerance)))
        if (!overlapping) continue
        const gap = right[0].channel - left[0].channel
        if (Math.abs(gap - opts.spacing) <= opts.tolerance) continue
        defects.push({
          axis: component[0].axis,
          channel: component[0].channel,
          cables: [...left, ...right].map((member) => member.candidate.cable),
          gap,
          expected: opts.spacing,
          kind: 'uneven',
        })
      }
    }
  }
  return defects
}

/**
 * Order a bundle so that spreading it introduces no crossings. Returns the
 * cable order plus the pairs whose crossing is unavoidable.
 */
export function orderBundle(bundle: readonly Candidate[]): {
  order: number[]
  forced: [number, number][]
} {
  const n = bundle.length
  // before[i][j] === true  =>  j must be placed on the lower-coordinate side of i.
  const mustPrecede: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false))
  const forced: [number, number][] = []

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue
      const a = bundle[i]
      const b = bundle[j]
      // Each of b's two adjacent legs runs, in channel space, from b's own
      // channel out to a neighbour's. If that leg crosses a's span, then it
      // sweeps the channel interval between them, and it cuts a unless b ends
      // up on the same side of a as the leg's far end already is.
      //
      // WHY the far end and not a fixed direction: this used to read "arriving
      // from the left" and "leaving to the right", which is the whole truth
      // only while every port lives on a left or right wall and every cable
      // flows left to right. A port on a top or bottom wall — or an input on a
      // card's RIGHT wall, which the communication lens produces routinely —
      // reverses one or both legs, and the old form then dropped the constraint
      // silently instead of reversing it. Half a constraint set is worse than
      // none: it pins a crossing-free bundle into the one order that crosses,
      // and it hides the genuine cycles from `forced`. Keying on the sign of
      // (neighbour - a.channel) makes the rule reflection-equivariant, so a
      // scene and its mirror image tidy to mirror-image boards.
      const legs: number[] = []
      if (b.fromSpan > a.lo && b.fromSpan < a.hi) legs.push(b.prevChannel)
      if (b.toSpan > a.lo && b.toSpan < a.hi) legs.push(b.nextChannel)
      for (const neighbourChannel of legs) {
        if (neighbourChannel < a.channel) mustPrecede[i][j] = true
        else if (neighbourChannel > a.channel) mustPrecede[j][i] = true
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (mustPrecede[i][j] && mustPrecede[j][i]) {
        forced.push([bundle[i].cable, bundle[j].cable])
      }
    }
  }

  // Kahn's algorithm. The tie-break is deliberately NOT geometric.
  //
  // draw.io shipped libavoid nudging in 2026 and documents the failure mode in
  // its own adapter: competing edges between the same pair of shapes "route
  // non-deterministically and can oscillate during the live preview". That is
  // what happens when the free part of the order is decided by coordinates —
  // drag a node a few pixels, the comparison flips, and every cable in the
  // channel jumps. So constraints (which are geometry, and are the *correct*
  // part) decide everything they can, and whatever is left over falls back to
  // the cable's own stable identity. Two cables that no constraint separates
  // keep their relative order for as long as they both exist.
  const remaining = new Set<number>(bundle.map((_, i) => i))
  const order: number[] = []
  while (remaining.size > 0) {
    const ready = [...remaining].filter((i) =>
      [...remaining].every((j) => j === i || !mustPrecede[i][j] || mustPrecede[j][i]),
    )
    const pick = (ready.length > 0 ? ready : [...remaining]).sort(
      (p, q) => bundle[p].cable - bundle[q].cable,
    )[0]
    order.push(pick)
    remaining.delete(pick)
  }
  return { order, forced }
}

/** Distinct authored channel coordinates, with tolerance-level jitter folded together. */
function lockedChannels(
  bundle: readonly Candidate[],
  locked: readonly boolean[],
  tolerance: number,
): number[] {
  const sorted = bundle
    .filter((candidate) => locked[candidate.cable])
    .map((candidate) => candidate.channel)
    .sort((a, b) => a - b)
  const unique: number[] = []
  for (const channel of sorted) {
    if (unique.every((existing) => Math.abs(existing - channel) > tolerance)) unique.push(channel)
  }
  return unique
}

/**
 * Pick one channel for every free member of a bundle.
 *
 * Without a lock, the original centred rank assignment remains unchanged. A
 * single authored rail instead becomes the cadence anchor: free rails occupy
 * consecutive ±spacing slots around it. This avoids the half-step defect in
 * even bundles (7 px on one side and 21 px on the other at 14 px spacing) and
 * the duplicate free slot produced by two coincident locks.
 *
 * Multiple distinct authored channels may not lie on the same spacing grid.
 * They remain fixed; the fallback chooses the closest collision-free slots
 * generated around both the bundle centre and every authored coordinate.
 */
function assignBundleChannels(
  bundle: readonly Candidate[],
  order: readonly number[],
  locked: readonly boolean[],
  spacing: number,
  tolerance: number,
): Map<number, number> {
  const targets = new Map<number, number>()
  const freeOrder = order.filter((index) => !locked[bundle[index].cable])
  if (freeOrder.length === 0) return targets

  const centre = bundle.reduce((sum, candidate) => sum + candidate.channel, 0) / bundle.length
  const anchors = lockedChannels(bundle, locked, tolerance)
  if (anchors.length === 0) {
    const first = -((bundle.length - 1) / 2) * spacing
    for (let rank = 0; rank < order.length; rank += 1) {
      targets.set(order[rank], centre + first + rank * spacing)
    }
    return targets
  }

  if (anchors.length === 1) {
    const anchor = anchors[0]
    const lockedRanks = order
      .map((index, rank) => locked[bundle[index].cable] ? rank : -1)
      .filter((rank) => rank >= 0)
    const firstLocked = Math.min(...lockedRanks)
    const lastLocked = Math.max(...lockedRanks)
    const requiredLeft = order.slice(0, firstLocked)
      .filter((index) => !locked[bundle[index].cable]).length
    const requiredRight = order.slice(lastLocked + 1)
      .filter((index) => !locked[bundle[index].cable]).length
    const preferredLeft = Math.ceil(freeOrder.length / 2)
    const leftCount = Math.max(
      requiredLeft,
      Math.min(freeOrder.length - requiredRight, preferredLeft),
    )
    const slots = [
      ...Array.from({ length: leftCount }, (_, index) =>
        anchor - (leftCount - index) * spacing),
      ...Array.from({ length: freeOrder.length - leftCount }, (_, index) =>
        anchor + (index + 1) * spacing),
    ]
    freeOrder.forEach((index, rank) => targets.set(index, slots[rank]))
    return targets
  }

  const searchRadius = freeOrder.length + anchors.length + 6
  const rawSlots = [centre, ...anchors].flatMap((base) =>
    Array.from({ length: searchRadius * 2 + 1 }, (_, index) =>
      base + (index - searchRadius) * spacing))
  const candidates = rawSlots
    .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b)
    .filter((value, index, values) =>
      values.findIndex((other) => Math.abs(other - value) <= tolerance) === index)
  const chosen: number[] = []
  for (const value of candidates) {
    if (anchors.some((anchor) => Math.abs(anchor - value) < spacing - tolerance)) continue
    if (chosen.some((channel) => Math.abs(channel - value) < spacing - tolerance)) continue
    chosen.push(value)
    if (chosen.length === freeOrder.length) break
  }
  chosen.sort((a, b) => a - b)
  freeOrder.forEach((index, rank) => targets.set(index, chosen[rank]))
  return targets
}

/**
 * Spread every shared channel apart. Pure: the input routes are not mutated.
 */
/**
 * @param locked Cables the user has authored. A locked cable is never moved,
 *   but it still takes part in ordering and still occupies its channel, so the
 *   free cables are spread *around* it instead of through it. This is
 *   libavoid's `hasFixedRoute()` rule: excluded from rerouting, retained as a
 *   constraint. Skipping-and-ignoring would let a nudged cable cross a pinned
 *   one, which is exactly the failure a partly-pinned board would show.
 */
export function nudgeRoutes(
  routes: readonly ElbowRoute[],
  options: Partial<NudgeOptions> = {},
  locked: readonly boolean[] = [],
): NudgeReport {
  const opts = { ...DEFAULT_NUDGE_OPTIONS, ...options }
  const overlapBefore = coincidentOverlap(routes, opts.tolerance)
  const next: ElbowRoute[] = routes.map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) }))
  const bundles: NudgeReport['bundles'] = []
  const forcedCrossings: [number, number][] = []

  for (const bundle of candidates(routes, opts.tolerance).values()) {
    if (bundle.length < 2) continue
    // A constraint-only bundle is context for selected movable routes, not an
    // operation of its own. Skipping it keeps selection-scoped calls local and
    // prevents unrelated authored crossings from leaking into the outcome.
    if (bundle.every((candidate) => locked[candidate.cable])) continue
    // Only a bundle whose members actually overlap needs splitting.
    const overlapping = bundle.some((a) =>
      bundle.some((b) => a !== b && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > opts.tolerance),
    )
    if (!overlapping) continue

    const { order, forced } = orderBundle(bundle)
    forcedCrossings.push(...forced)
    bundles.push({
      channel: bundle[0].channel,
      axis: bundle[0].axis,
      cables: order.map((i) => bundle[i].cable),
    })

    const targets = assignBundleChannels(bundle, order, locked, opts.spacing, opts.tolerance)
    order.forEach((idx) => {
      const c = bundle[idx]
      if (locked[c.cable]) return
      const target = targets.get(idx)
      if (target === undefined) return
      const key = c.axis === 'x' ? 'y' : 'x'
      const pts = next[c.cable].points
      // Move the segment and both of its neighbouring legs' shared coordinate.
      ;(pts[c.at] as ElbowPoint)[key] = target
      ;(pts[c.at + 1] as ElbowPoint)[key] = target
    })
  }

  return {
    routes: next,
    bundles,
    forcedCrossings,
    overlapBefore,
    overlapAfter: coincidentOverlap(next, opts.tolerance),
    spacingDefects: channelSpacingDefects(routes, next, locked, opts),
  }
}
