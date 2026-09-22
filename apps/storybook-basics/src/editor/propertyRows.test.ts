/**
 * src/editor/propertyRows.test.ts — the per-element property rows.
 *
 * Like `lineDiff.test.ts`, the donor
 * (/home/bam/systemsketch/src/compare/propertyRows.ts:1-247) shipped no
 * test file of its own, so these cases are written against the ported
 * module's stated rules. The input is built by the real `compareBoards`
 * wherever the rule is about a real diff — hand-typing a `CompareChange`
 * would let this suite agree with itself about a shape the model never
 * produces.
 */

import { describe, expect, it } from "vitest"

import { compareBoards, type CompareChange, type RecordMap } from "./compareModel"
import {
  ELEMENT_STATUS_LABEL,
  STATE_LABEL,
  elementSummaries,
  orderChanges,
  propertyRowsOf,
  rowCurrent,
  rowPrevious,
  rowSupportsWordDiff,
} from "./propertyRows"

function port(id: string, name: string, type = "", defaultValue = "") {
  return { id, name, type, defaultValue }
}

function block(id: string, props: Record<string, unknown>): [string, RecordMap[string]] {
  return [
    id,
    {
      id,
      typeName: "shape",
      type: "block",
      props: { title: "", description: "", blockType: "", inputs: [], outputs: [], ...props },
    },
  ]
}

const BEFORE: RecordMap = Object.fromEntries([
  block("shape:predict", {
    title: "run_inference",
    blockType: "model",
    inputs: [port("in-frames", "frames", "Frame"), port("in-gone", "gone", "int")],
  }),
  block("shape:overlay", { title: "Debug Overlay", blockType: "widget" }),
])

const AFTER: RecordMap = Object.fromEntries([
  block("shape:predict", {
    title: "run_predict",
    blockType: "model",
    inputs: [port("in-frames", "frames", "Image"), port("in-threshold", "threshold", "float", "0.5")],
  }),
  block("shape:source", { title: "Frame Source", blockType: "input" }),
])

const { changes } = compareBoards(BEFORE, AFTER)
const find = (id: string) => {
  const change = changes.find((candidate) => candidate.id === id)
  if (!change) throw new Error(`no change ${id} in ${changes.map((c) => c.id).join(", ")}`)
  return change
}

describe("propertyRowsOf", () => {
  // The rule (propertyRows.ts:36-39): the union is discriminated on
  // purpose — "`added` has no `previous` key at all, so 'the value it used
  // to have' cannot be typed, let alone rendered."
  it("gives an added element one row with a current value and no previous key", () => {
    const [row] = propertyRowsOf(find("block:shape:source"))
    expect(row.state).toBe("added")
    expect(Object.prototype.hasOwnProperty.call(row, "previous")).toBe(false)
    expect(rowPrevious(row)).toBeNull()
    expect(rowCurrent(row)).toContain("Frame Source")
  })

  it("gives a removed element one row with a previous value and no current key", () => {
    const [row] = propertyRowsOf(find("block:shape:overlay"))
    expect(row.state).toBe("removed")
    expect(Object.prototype.hasOwnProperty.call(row, "current")).toBe(false)
    expect(rowCurrent(row)).toBeNull()
    expect(rowPrevious(row)).toContain("Debug Overlay")
  })

  // The rule (propertyRows.ts:108-112): "a retitled Block is `title`".
  it("names a Block field row by the field alone", () => {
    const rows = propertyRowsOf(find("block:shape:predict"))
    const title = rows.find((row) => row.property === "title")
    expect(title?.state).toBe("modified")
    expect(rowPrevious(title!)).toBe("run_inference")
    expect(rowCurrent(title!)).toBe("run_predict")
  })

  // The rule (propertyRows.ts:108-112): "a port whose type changed is
  // `image · type`" — port and field are different depths of one address,
  // so they compose.
  it("composes a port change's property as `port · field`", () => {
    const portChange = changes.find((change) => change.subject === "port" && change.kind === "modified")
    expect(portChange).toBeDefined()
    const rows = propertyRowsOf(portChange!)
    expect(rows.map((row) => row.property)).toEqual(["frames · type"])
    expect(rowPrevious(rows[0])).toBe("Frame")
    expect(rowCurrent(rows[0])).toBe("Image")
  })

  it("keys one row per changed field so two fields never collide", () => {
    const rows = propertyRowsOf(find("block:shape:predict"))
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
    for (const row of rows) expect(row.key.startsWith("block:shape:predict")).toBe(true)
  })

  // The rule (propertyRows.ts:176-178): a `modified` change with no field
  // pairs "falls back to its whole-object description on both sides rather
  // than rendering an empty pair — which would read as 'both sides are
  // blank'".
  it("falls back to a whole-object description when a modification names no fields", () => {
    const fieldless: CompareChange = { ...find("block:shape:predict"), fields: [] }
    const [row] = propertyRowsOf(fieldless)
    expect(row.state).toBe("modified")
    expect(rowPrevious(row)).toBe("run_inference · model")
    expect(rowCurrent(row)).toBe("run_predict · model")
  })

  // The rule (propertyRows.ts:113-117): sliced by the element's own length
  // rather than split on the first `.`, "so a Block legitimately named
  // `run.predict` still yields its port name and not the tail of its own
  // title".
  it("reads a port's own name out of a dotted Block name without splitting on the dot", () => {
    const dotted: CompareChange = {
      ...find("block:shape:predict"),
      subject: "port",
      element: "run.predict",
      name: "run.predict.threshold",
      fields: [{ path: "type", before: "int", after: "float" }],
    }
    expect(propertyRowsOf(dotted)[0].property).toBe("threshold · type")
  })
})

describe("rowSupportsWordDiff", () => {
  // The rule (propertyRows.ts:80-83): "a pure addition has no 'green
  // nothing' on the other side to diff against."
  it("is true only for a modified row", () => {
    expect(propertyRowsOf(find("block:shape:predict")).every(rowSupportsWordDiff)).toBe(true)
    expect(propertyRowsOf(find("block:shape:source")).some(rowSupportsWordDiff)).toBe(false)
    expect(propertyRowsOf(find("block:shape:overlay")).some(rowSupportsWordDiff)).toBe(false)
  })
})

describe("orderChanges", () => {
  // The rule (propertyRows.ts:98-103): "Insertions and deletions are the
  // coarse findings a reviewer wants first; a modification is the one they
  // have to read a value to understand, so it reads last."
  it("orders added, then removed, then modified", () => {
    const kinds = orderChanges(changes).map((change) => change.kind)
    const rank = { added: 0, removed: 1, modified: 2 } as const
    expect(kinds.map((kind) => rank[kind])).toEqual([...kinds.map((kind) => rank[kind])].sort((a, b) => a - b))
  })

  it("does not mutate its input", () => {
    const original = [...changes]
    orderChanges(changes)
    expect(changes).toEqual(original)
  })
})

describe("elementSummaries", () => {
  const summaries = elementSummaries(changes)
  const at = (id: string) => summaries.find((summary) => summary.id === id)

  it("places every change under exactly one element", () => {
    const counted = summaries.reduce((total, summary) => total + summary.changes.length, 0)
    expect(counted).toBe(changes.length)
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(summaries.length)
  })

  // The rule (propertyRows.ts:203-209): Added · Edited · Removed is
  // deliberately Figma's vocabulary, NOT the table's three states — "a
  // Block that only gained a port was not itself modified, but it WAS
  // edited".
  it("calls a Block whose own fields moved `edited`, not `modified`", () => {
    expect(at("block:shape:predict")?.status).toBe("edited")
    expect(ELEMENT_STATUS_LABEL[at("block:shape:predict")!.status]).toBe("Edited")
    expect(Object.values(STATE_LABEL)).not.toContain("Edited")
  })

  it("carries a whole-element insertion and deletion through as added and removed", () => {
    expect(at("block:shape:source")?.status).toBe("added")
    expect(at("block:shape:overlay")?.status).toBe("removed")
  })

  it("rolls a Block's port changes up under the Block, never beside it", () => {
    const predict = at("block:shape:predict")
    expect(predict?.changes.some((change) => change.subject === "port")).toBe(true)
    expect(summaries.some((summary) => summary.subject === "port")).toBe(false)
  })

  it("counts the rows the table will actually draw for that element", () => {
    for (const summary of summaries) {
      const drawn = summary.changes.reduce((total, change) => total + propertyRowsOf(change).length, 0)
      expect(summary.rowCount).toBe(drawn)
    }
  })

  // A Block that gained a port contributes no change of its own, and must
  // still be `edited` by its children rather than dropping out of the list.
  it("lists an element that only its children changed", () => {
    const childOnly = changes.filter((change) => change.id !== "block:shape:predict")
    const list = elementSummaries(childOnly)
    expect(list.find((summary) => summary.id === "block:shape:predict")?.status).toBe("edited")
  })

  it("is empty for two identical boards", () => {
    expect(elementSummaries(compareBoards(AFTER, AFTER).changes)).toEqual([])
  })
})
