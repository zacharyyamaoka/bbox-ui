/**
 * src/components/framesOrder.test.ts — `moveItemKey`'s cases are ported
 * verbatim from
 * /home/bam/systemsketch/src/chrome/framesPanelModel.test.ts:47-51
 * (`moveFramesPanelItemKey`, renamed). `readOrder`, `ordered`, `intersects`
 * and `clip` get direct unit coverage here: the donor only exercised
 * `readOrder`/`ordered` indirectly through `getFramesPanelModel`, and `clip`
 * has no donor at all (see the provenance header in framesOrder.ts).
 */
import { describe, expect, it } from "vitest"

import { clip, intersects, moveItemKey, ordered, readOrder } from "./framesOrder"

describe("moveItemKey", () => {
  it("moves a key before or after the hovered item without duplicate persistence", () => {
    expect(moveItemKey(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"])
    expect(moveItemKey(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"])
    expect(moveItemKey(["a", "a"], "a", "a", "after")).toBeNull()
  })

  it("refuses a stale drag whose source or target key no longer exists", () => {
    expect(moveItemKey(["a", "b"], "z", "a", "after")).toBeNull()
    expect(moveItemKey(["a", "b"], "a", "z", "after")).toBeNull()
  })
})

describe("readOrder", () => {
  it("is ready with an empty order when nothing has been written yet", () => {
    expect(readOrder({}, "order")).toEqual({ kind: "ready", order: [] })
  })

  it("reads a versioned, duplicate-free order", () => {
    expect(readOrder({ order: { version: 1, order: ["b", "a"] } }, "order")).toEqual({
      kind: "ready",
      order: ["b", "a"],
    })
  })

  it("refuses a shape it does not recognise rather than reinterpreting it", () => {
    expect(readOrder({ order: { version: 9, order: ["a"] } }, "order")).toEqual({ kind: "protected" })
    expect(readOrder({ order: ["a", "b"] }, "order")).toEqual({ kind: "protected" })
    expect(readOrder({ order: { version: 1, order: ["a", "a"] } }, "order")).toEqual({ kind: "protected" })
    expect(readOrder({ order: { version: 1, order: [1] } }, "order")).toEqual({ kind: "protected" })
  })
})

describe("ordered", () => {
  it("sorts items by their key's position in the given order", () => {
    const items = [{ key: "a" }, { key: "b" }, { key: "c" }]
    expect(ordered(items, ["c", "a", "b"])).toEqual([{ key: "c" }, { key: "a" }, { key: "b" }])
  })

  it("appends an item with no entry in keys, keeping its relative order", () => {
    const items = [{ key: "a" }, { key: "unknown" }, { key: "b" }]
    expect(ordered(items, ["b", "a"]).map((item) => item.key)).toEqual(["b", "a", "unknown"])
  })
})

describe("intersects", () => {
  it("is true only when the two boxes overlap", () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 10, h: 10 })).toBe(false)
  })
})

describe("clip", () => {
  it("returns the overlapping rectangle of two boxes", () => {
    expect(clip({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({
      x: 5,
      y: 5,
      w: 5,
      h: 5,
    })
  })

  it("returns null when the boxes do not overlap, agreeing with intersects", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 10, y: 10, w: 10, h: 10 }
    expect(intersects(a, b)).toBe(false)
    expect(clip(a, b)).toBeNull()
  })

  it("returns null rather than a zero-area box for boxes that only touch at an edge", () => {
    expect(clip({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBeNull()
  })
})
