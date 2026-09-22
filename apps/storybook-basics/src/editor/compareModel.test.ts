/**
 * src/editor/compareModel.test.ts — ported verbatim from
 * /home/bam/systemsketch/src/compare/compareModel.test.ts:1-247. These
 * fixtures build plain `RecordLike` objects and a `port()` helper of
 * `{id, name, type, visible, defaultValue}` — already exactly the structural
 * shape `PortLike` needs, so nothing here changed for the `BlockPort` inlining
 * described in compareModel.ts's header.
 */
import { describe, expect, it } from "vitest"

import { canWordDiff, compareBoards, type RecordMap } from "./compareModel"

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

function port(id: string, name: string, type = "", defaultValue = "") {
  return { id, name, type, visible: true, defaultValue }
}

function board(entries: Array<[string, RecordMap[string]]>): RecordMap {
  return Object.fromEntries(entries)
}

describe("three states, not two", () => {
  it("reports a persisted object with a changed field as modified", () => {
    const before = board([block("shape:b", { title: "run_inference" })])
    const after = board([block("shape:b", { title: "run_predict" })])

    const { changes } = compareBoards(before, after)

    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe("modified")
    expect(changes[0].fields).toEqual([{ path: "title", before: "run_inference", after: "run_predict" }])
  })

  it("reports an object only on the after side as added, with no fields", () => {
    const before = board([])
    const after = board([block("shape:b", { title: "run_predict" })])

    const { changes } = compareBoards(before, after)

    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe("added")
    expect(changes[0].fields).toEqual([])
    expect(changes[0].anchorBefore).toBeNull()
    expect(changes[0].anchorAfter).toBe("shape:b")
  })

  it("reports an object only on the before side as removed, anchored on the before board", () => {
    const before = board([block("shape:b", { title: "run_predict" })])
    const after = board([])

    const { changes } = compareBoards(before, after)

    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe("removed")
    expect(changes[0].fields).toEqual([])
    // The display must not invent a position for a thing that is not there.
    expect(changes[0].anchorAfter).toBeNull()
    expect(changes[0].anchorBefore).toBe("shape:b")
  })
})

describe("a gained port is an insertion, not a modification of its Block", () => {
  const before = board([block("shape:b", { title: "run_predict", inputs: [port("in-frames", "frames")] })])
  const after = board([
    block("shape:b", {
      title: "run_predict",
      inputs: [port("in-frames", "frames"), port("in-threshold", "threshold", "float")],
    }),
  ])

  it("emits an added row for the port", () => {
    const { changes } = compareBoards(before, after)
    const portChange = changes.find((change) => change.subject === "port")
    expect(portChange?.kind).toBe("added")
    expect(portChange?.name).toBe("run_predict.threshold")
  })

  it("emits NO row for the Block, whose own fields did not change", () => {
    const { changes } = compareBoards(before, after)
    expect(changes.filter((change) => change.subject === "block")).toEqual([])
  })

  it("nests the port row under the Block it belongs to", () => {
    const { changes } = compareBoards(before, after)
    const portChange = changes.find((change) => change.subject === "port")
    expect(portChange?.parentId).toBe("block:shape:b")
  })

  it("is symmetric: a lost port is a removal, not a Block modification", () => {
    const { changes } = compareBoards(after, before)
    expect(changes.filter((change) => change.subject === "block")).toEqual([])
    const portChange = changes.find((change) => change.subject === "port")
    expect(portChange?.kind).toBe("removed")
  })

  it("still reports the Block separately when its OWN field also changed", () => {
    const retitled = board([
      block("shape:b", {
        title: "run_inference",
        inputs: [port("in-frames", "frames"), port("in-threshold", "threshold", "float")],
      }),
    ])
    const { changes } = compareBoards(before, retitled)
    expect(changes.map((change) => [change.subject, change.kind])).toEqual([
      ["block", "modified"],
      ["port", "added"],
    ])
  })
})

describe("word-level ink is defined only where both values exist", () => {
  it("permits it on modified", () => {
    expect(canWordDiff({ kind: "modified", fields: [{ path: "title", before: "a", after: "b" }] })).toBe(true)
  })

  it("refuses it on added — there is no previous value to align against", () => {
    expect(canWordDiff({ kind: "added", fields: [] })).toBe(false)
  })

  it("refuses it on removed — there is no current value to align against", () => {
    expect(canWordDiff({ kind: "removed", fields: [] })).toBe(false)
  })
})

describe("appearance is not content", () => {
  it("ignores a Block that only moved", () => {
    const before = board([block("shape:b", { title: "same", x: 0 })])
    const after = board([block("shape:b", { title: "same", x: 400 })])

    expect(compareBoards(before, after).total).toBe(0)
  })

  it("renders an unchanged board as zero changes", () => {
    const same = board([block("shape:b", { title: "run_predict", inputs: [port("in-frames", "frames")] })])
    expect(compareBoards(same, same).total).toBe(0)
  })
})

describe("a rewired cable is an endpoint fact, not a coordinate one", () => {
  const cable = (id: string, props: Record<string, unknown> = {}) =>
    [
      id,
      {
        id,
        typeName: "shape",
        type: "connection",
        props: { temporal: "data", delayValue: "", routing: "elbow", ...props },
      },
    ] as [string, RecordMap[string]]

  const binding = (id: string, fromId: string, toId: string, portId: string, terminal: string) =>
    [id, { id, typeName: "binding", type: "connection", fromId, toId, props: { portId, terminal } }] as [
      string,
      RecordMap[string],
    ]

  it("does not call a dragged cable rewired", () => {
    const before = board([
      block("shape:a", { title: "load", outputs: [port("out-f", "frames")] }),
      block("shape:d", { title: "log", inputs: [port("in-d", "data")] }),
      cable("shape:c", { start: { x: 0, y: 0 } }),
      binding("binding:1", "shape:c", "shape:a", "out-f", "start"),
      binding("binding:2", "shape:c", "shape:d", "in-d", "end"),
    ])
    const after = board([
      block("shape:a", { title: "load", outputs: [port("out-f", "frames")] }),
      block("shape:d", { title: "log", inputs: [port("in-d", "data")] }),
      // Same wiring, different handle coordinates — a drag, not a rewire.
      cable("shape:c", { start: { x: 900, y: 900 } }),
      binding("binding:1", "shape:c", "shape:a", "out-f", "start"),
      binding("binding:2", "shape:c", "shape:d", "in-d", "end"),
    ])

    expect(compareBoards(before, after).tally.cable.modified).toBe(0)
  })

  it("reports the endpoint that moved, in port names", () => {
    const before = board([
      block("shape:a", { title: "load", outputs: [port("out-f", "frames")] }),
      block("shape:b", { title: "predict", outputs: [port("out-b", "boxes")] }),
      block("shape:d", { title: "log", inputs: [port("in-d", "data")] }),
      cable("shape:c"),
      binding("binding:1", "shape:c", "shape:a", "out-f", "start"),
      binding("binding:2", "shape:c", "shape:d", "in-d", "end"),
    ])
    const after = board([
      block("shape:a", { title: "load", outputs: [port("out-f", "frames")] }),
      block("shape:b", { title: "predict", outputs: [port("out-b", "boxes")] }),
      block("shape:d", { title: "log", inputs: [port("in-d", "data")] }),
      cable("shape:c"),
      binding("binding:1", "shape:c", "shape:b", "out-b", "start"),
      binding("binding:2", "shape:c", "shape:d", "in-d", "end"),
    ])

    const change = compareBoards(before, after).changes.find((c) => c.subject === "cable")
    expect(change?.kind).toBe("modified")
    expect(change?.fields).toEqual([{ path: "endpoint.start", before: "load.frames", after: "predict.boxes" }])
  })

  /**
   * The grouping invariant, checked on ALL THREE port operations at once.
   *
   * This exists because it broke: `element` defaults to the change's own name
   * when a call site forgets to pass it, and exactly one of the three port
   * pushes did forget — so a MODIFIED port grouped under `draw_overlay.image`
   * as if the port were itself an element, while an added and a removed port
   * grouped correctly. A per-operation test would have been green on two of
   * three; the fix is a test that cannot pass unless every operation obeys.
   */
  it("groups every port under its host Block, whatever the operation", () => {
    const before = board([
      block("shape:a", {
        title: "draw_overlay",
        inputs: [port("in-keep", "image", "RGB"), port("in-gone", "model")],
      }),
    ])
    const after = board([
      block("shape:a", {
        title: "draw_overlay",
        inputs: [port("in-keep", "image", "RGBA"), port("in-new", "threshold")],
      }),
    ])

    const ports = compareBoards(before, after).changes.filter((c) => c.subject === "port")
    expect(ports.map((c) => c.kind).sort()).toEqual(["added", "modified", "removed"])
    for (const change of ports) {
      // A port's element is its host Block — never the port, and never the
      // dotted path that names the port.
      expect(change.element).toBe("draw_overlay")
      expect(change.elementId).toBe("block:shape:a")
      expect(change.element).not.toBe(change.name)
    }
  })
})
