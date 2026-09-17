// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowPins.ts`).
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
 * Pins — the persisted form of "the user dragged this bend".
 *
 * ## Why not Excalidraw's `fixedSegments`
 *
 * Excalidraw stores a dragged segment as a pair of **element-local absolute
 * points** (`FixedSegment = { start: LocalPoint; end: LocalPoint; index }`,
 * `packages/element/src/types.ts:349`). Element-local means "relative to the
 * arrow's own bounding box origin", and the arrow's origin is recomputed from
 * its points — so when one endpoint moves, a fixed segment stays where it was on
 * the canvas and the route re-solves around it. That is precisely the behaviour
 * Zach rejected:
 *
 * > "When I drag the box, the arrow elbow stays in the same place. This is not
 * > desirable. Dragging the box should drag everything inside frozen in place."
 *
 * So a pyblocks pin stores **one scalar in the frame spanned by the two
 * endpoints**, never an absolute coordinate:
 *
 * ```
 * value = mid + (t - 0.5) * span + offset
 *   where  span = end[cross] - start[cross]
 *          mid  = (start[cross] + end[cross]) / 2
 * ```
 *
 * - Translate **both** endpoints by `d` → `mid` moves by `d`, `span` is
 *   unchanged → the bend moves by exactly `d`. Frozen in place, which is the
 *   multi-select drag case.
 * - Translate **one** endpoint by `d` → the bend moves by `t * d`, i.e. it keeps
 *   its proportional place in the gap and the route stays sane.
 * - `span → 0` → the `(t - 0.5) * span` term vanishes on its own, so there is no
 *   blow-up and no discontinuity; `offset` (captured only when the span was
 *   already degenerate at pin time) carries the pin instead.
 */

import type { ElbowAxis, ElbowPoint } from './geometry'
import { clamp, crossAxis } from './geometry'

/** A user-pinned interior segment. Serialisable; this is what gets persisted. */
export interface ElbowPin {
  /** Index of the segment in the route, counted from the start endpoint. */
  index: number
  /** Axis the segment runs along. `'x'` = horizontal, so the pin governs its `y`. */
  axis: ElbowAxis
  /** Position in the endpoint frame. `0` = at the start endpoint, `1` = at the end. */
  t: number
  /** Residual pixels, non-zero only when the endpoint span was degenerate at pin time. */
  offset: number
}

/**
 * Below this the endpoint span cannot carry a meaningful fraction, so the pin
 * falls back to a pixel offset from the midpoint.
 */
export const PIN_SPAN_FLOOR = 8

/** `t` outside this would amplify endpoint motion absurdly. */
export const PIN_T_LIMIT = 6

export function pinCross(pin: ElbowPin): ElbowAxis {
  return crossAxis(pin.axis)
}

function coordinate(point: ElbowPoint, axis: ElbowAxis): number {
  return axis === 'x' ? point.x : point.y
}

/** Turn a pin back into the absolute coordinate its segment must sit at. */
export function resolvePin(pin: ElbowPin, start: ElbowPoint, end: ElbowPoint): number {
  const cross = pinCross(pin)
  const from = coordinate(start, cross)
  const to = coordinate(end, cross)
  const span = to - from
  const mid = (from + to) / 2
  return mid + (pin.t - 0.5) * span + pin.offset
}

/**
 * Capture a drag. `value` is the absolute coordinate the user dragged the
 * segment to, on the axis perpendicular to the segment.
 *
 * `resolvePin(createPin(...), start, end)` returns `value` exactly — that
 * round-trip is what makes a re-route of an untouched input byte-identical.
 */
export function createPin(
  index: number,
  axis: ElbowAxis,
  value: number,
  start: ElbowPoint,
  end: ElbowPoint,
): ElbowPin {
  const cross = crossAxis(axis)
  const from = coordinate(start, cross)
  const to = coordinate(end, cross)
  const span = to - from
  const mid = (from + to) / 2

  if (Math.abs(span) < PIN_SPAN_FLOOR) {
    return { index, axis, t: 0.5, offset: value - mid }
  }
  const raw = (value - from) / span
  const t = clamp(raw, -PIN_T_LIMIT, PIN_T_LIMIT)
  // When `raw` had to be clamped the fraction alone no longer reproduces the
  // drag, so the remainder is kept in pixels rather than silently lost.
  const offset = value - (mid + (t - 0.5) * span)
  return { index, axis, t, offset }
}

/** Pins are keyed by segment index; a later pin on the same segment wins. */
export function mergePin(pins: readonly ElbowPin[], pin: ElbowPin): ElbowPin[] {
  const kept = pins.filter((existing) => existing.index !== pin.index)
  kept.push(pin)
  kept.sort((first, second) => first.index - second.index)
  return kept
}

export function removePin(pins: readonly ElbowPin[], index: number): ElbowPin[] {
  return pins.filter((pin) => pin.index !== index)
}

export function pinsEqual(first: readonly ElbowPin[], second: readonly ElbowPin[]): boolean {
  if (first.length !== second.length) return false
  return first.every((pin, at) => (
    pin.index === second[at].index
    && pin.axis === second[at].axis
    && pin.t === second[at].t
    && pin.offset === second[at].offset
  ))
}
