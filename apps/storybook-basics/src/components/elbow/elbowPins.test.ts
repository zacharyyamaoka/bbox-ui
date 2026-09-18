// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowPins.test.ts`).
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

import {
  PIN_SPAN_FLOOR,
  PIN_T_LIMIT,
  createPin,
  mergePin,
  pinCross,
  pinsEqual,
  removePin,
  resolvePin,
} from './elbowPins'

const START = { x: 100, y: 0 }
const END = { x: 500, y: 240 }

describe('pin axes', () => {
  it('a horizontal segment is governed by its y', () => {
    expect(pinCross({ index: 1, axis: 'x', t: 0.5, offset: 0 })).toBe('y')
  })

  it('a vertical segment is governed by its x', () => {
    expect(pinCross({ index: 1, axis: 'y', t: 0.5, offset: 0 })).toBe('x')
  })

  it('resolves a vertical segment against the endpoints x span', () => {
    const pin = createPin(1, 'y', 300, START, END)
    expect(pin.t).toBeCloseTo(0.5, 9)
    expect(resolvePin(pin, START, END)).toBeCloseTo(300, 9)
  })

  it('resolves a horizontal segment against the endpoints y span', () => {
    const pin = createPin(2, 'x', 120, START, END)
    expect(pin.t).toBeCloseTo(0.5, 9)
    expect(resolvePin(pin, START, END)).toBeCloseTo(120, 9)
  })
})

describe('pin frame', () => {
  it('keeps its share of a growing gap', () => {
    const pin = createPin(1, 'y', 200, START, END)   // a quarter of the way across
    expect(pin.t).toBeCloseTo(0.25, 9)
    // double the gap: the rail stays a quarter of the way across
    const wider = { x: 900, y: END.y }
    expect(resolvePin(pin, START, wider)).toBeCloseTo(300, 9)
  })

  it('is exactly rigid under a shared translation, for every t', () => {
    for (const value of [-100, 0, 150, 300, 480, 1200]) {
      const pin = createPin(1, 'y', value, START, END)
      const shifted = resolvePin(pin, { ...START, x: START.x - 37 }, { ...END, x: END.x - 37 })
      expect(shifted).toBeCloseTo(value - 37, 9)
    }
  })

  it('switches to a pixel offset only below the span floor', () => {
    // Above the floor the fraction alone carries the pin, so nothing is left
    // over in pixels — as long as the drag stays inside the t limit.
    const justAbove = { x: START.x + PIN_SPAN_FLOOR + 0.01, y: END.y }
    const carried = createPin(1, 'y', START.x + PIN_SPAN_FLOOR * 2, START, justAbove)
    expect(carried.offset).toBeCloseTo(0, 6)
    expect(resolvePin(carried, START, justAbove)).toBeCloseTo(START.x + PIN_SPAN_FLOOR * 2, 9)

    const justBelow = { x: START.x + PIN_SPAN_FLOOR - 0.01, y: END.y }
    const degenerate = createPin(1, 'y', 400, START, justBelow)
    expect(degenerate.t).toBe(0.5)
    expect(degenerate.offset).not.toBe(0)
    expect(resolvePin(degenerate, START, justBelow)).toBeCloseTo(400, 9)
  })

  it('clamps t but still round-trips through the offset', () => {
    const near = { x: START.x + 10, y: END.y }
    const pin = createPin(1, 'y', 100_000, START, near)
    expect(Math.abs(pin.t)).toBeLessThanOrEqual(PIN_T_LIMIT)
    expect(resolvePin(pin, START, near)).toBeCloseTo(100_000, 3)
  })
})

describe('pin lists', () => {
  const first = createPin(1, 'y', 200, START, END)
  const second = createPin(3, 'x', 90, START, END)

  it('merges by segment index and keeps the list sorted', () => {
    const merged = mergePin(mergePin([], second), first)
    expect(merged.map((pin) => pin.index)).toEqual([1, 3])
  })

  it('a later pin on the same segment replaces the earlier one', () => {
    const replaced = mergePin([first], createPin(1, 'y', 460, START, END))
    expect(replaced).toHaveLength(1)
    expect(resolvePin(replaced[0], START, END)).toBeCloseTo(460, 9)
  })

  it('removes by index', () => {
    expect(removePin([first, second], 1)).toEqual([second])
    expect(removePin([first, second], 9)).toEqual([first, second])
  })

  it('does not mutate the list it was given', () => {
    const original = [first]
    mergePin(original, second)
    removePin(original, 1)
    expect(original).toEqual([first])
  })

  it('compares lists by value', () => {
    expect(pinsEqual([first, second], [first, second])).toBe(true)
    expect(pinsEqual([first], [first, second])).toBe(false)
    expect(pinsEqual([first], [{ ...first, t: first.t + 0.1 }])).toBe(false)
  })
})
