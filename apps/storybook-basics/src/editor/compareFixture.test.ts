/**
 * The model, run against the real review fixture rather than hand-built input.
 *
 * Ported from /home/bam/systemsketch/src/compare/compareFixture.test.ts:1-96,
 * case for case. `compareModel.test.ts` pins the rules in isolation; this one
 * pins that the rules survive contact with an actual `.systemsketch` written
 * by the real editor through the real autosave path — the file Zach will
 * open. If the fixture and the panel ever disagree about what changed, this
 * fails first.
 *
 * The three boards in `__fixtures__/` are byte-identical copies of
 * /home/bam/systemsketch/sketches/review/diff-review-modal{,.v1,.v2}.systemsketch
 * (md5 32c86a38…, 962e7beaa…, ae528074…, verified on copy 2026-09-19). They
 * are copied rather than read from that path because a unit test that reached
 * outside this repo would be green or red depending on a sibling checkout —
 * and because the whole point of the case is that these exact bytes came out
 * of the real editor, which copying preserves and re-deriving would not.
 *
 * The donor's `?raw` import style travels unchanged: read the way the bundler
 * reads them, so this test cannot drift from what an app ships.
 */

import { describe, expect, it } from "vitest"

import currentSource from "./__fixtures__/diff-review-modal.systemsketch?raw"
import v1Source from "./__fixtures__/diff-review-modal.v1.systemsketch?raw"
import v2Source from "./__fixtures__/diff-review-modal.v2.systemsketch?raw"
import { compareBoards, type RecordMap } from "./compareModel"
import { discoverHistory, historyProblem, versionRecords } from "./compareSource"

function boardRecords(source: string): RecordMap {
  const document = JSON.parse(source) as { records: unknown[] }
  const records: Record<string, RecordMap[string]> = {}
  for (const entry of document.records) {
    const record = entry as RecordMap[string]
    records[record.id] = record
  }
  return records
}

const v1 = boardRecords(v1Source)
const v2 = boardRecords(v2Source)
const current = boardRecords(currentSource)

describe("the review fixture exercises every state", () => {
  const { changes, tally } = compareBoards(v1, current)
  const find = (id: string) => changes.find((change) => change.id === id)

  it("renames the Block, and the rename is a modification", () => {
    const change = find("block:shape:predict")
    expect(change?.kind).toBe("modified")
    expect(change?.fields).toEqual([{ path: "title", before: "run_inference", after: "run_predict" }])
  })

  it("reports the gained port as an insertion", () => {
    expect(find("port:shape:predict:in_threshold")?.kind).toBe("added")
  })

  it("reports the lost port as a deletion, anchored only on the before board", () => {
    const change = find("port:shape:predict:in_model")
    expect(change?.kind).toBe("removed")
    expect(change?.anchorAfter).toBeNull()
    expect(change?.anchorBefore).toBe("shape:predict")
  })

  it("reports the changed port type as a modification of that port", () => {
    const change = find("port:shape:overlay:out_image")
    expect(change?.kind).toBe("modified")
    expect(change?.fields).toEqual([{ path: "type", before: "RGB", after: "RGBA" }])
  })

  it("reports the rewired cable by the ports it moved between", () => {
    const change = find("cable:shape:cable_xm")
    expect(change?.kind).toBe("modified")
    expect(change?.fields).toEqual([
      { path: "endpoint.start", before: "load_frames.frames", after: "run_predict.boxes" },
    ])
  })

  it("produces all three states and nothing else", () => {
    expect({ ...tally.block }).toEqual({ added: 0, removed: 0, modified: 1 })
    expect(tally.port).toEqual({ added: 1, removed: 1, modified: 1 })
    expect(tally.cable).toEqual({ added: 0, removed: 0, modified: 1 })
    // The cue cards and their arrow are identical in both files, so an
    // unchanged thing produces no row — the contract's zero-change case.
    expect(tally.shape).toEqual({ added: 0, removed: 0, modified: 0 })
  })
})

describe("a nearer version shows fewer changes", () => {
  it("v2 differs from current only by the rename and the rewire", () => {
    const { changes } = compareBoards(v2, current)
    expect(changes.map((change) => change.id).sort()).toEqual(["block:shape:predict", "cable:shape:cable_xm"])
  })

  it("comparing a version with itself is a board with no changes", () => {
    expect(compareBoards(current, current).total).toBe(0)
  })
})

/**
 * Beyond the donor's cases: the `<name>.vN.systemsketch` convention run
 * against the three files it was invented for. The donor could not test this
 * — its reader was a hardcoded `fetch` — so this is the first place the
 * discovery half and the diffing half are proved to meet.
 */
describe("the .vN convention finds these very files", () => {
  const BOARD = "/sketches/review/diff-review-modal.systemsketch"
  const ON_DISK: Readonly<Record<string, string>> = {
    "/sketches/review/diff-review-modal.v1.systemsketch": v1Source,
    "/sketches/review/diff-review-modal.v2.systemsketch": v2Source,
  }
  const read = async (path: string) => ON_DISK[path] ?? null

  it("offers v1 and v2 beside the board, then the live board itself", async () => {
    const history = await discoverHistory(BOARD, read)
    expect(history.map((entry) => entry.id)).toEqual(["v1", "v2", "current"])
    expect(history.map((entry) => entry.note)).toEqual([
      "diff-review-modal.v1.systemsketch",
      "diff-review-modal.v2.systemsketch",
      "diff-review-modal.systemsketch",
    ])
    expect(historyProblem(history)).toBeNull()
  })

  it("titles each entry by the diff it measures, and names no author", async () => {
    const history = await discoverHistory(BOARD, read)
    const sourceOf = (id: string) => (id === "v1" ? v1Source : id === "v2" ? v2Source : currentSource)
    const records = versionRecords(history, {
      titleOf: (version) => {
        if (version.isCurrent) return "Current version"
        const { total } = compareBoards(boardRecords(sourceOf(version.id)), current)
        return `${total} ${total === 1 ? "change" : "changes"}`
      },
    })
    expect(records.map((record) => record.title)).toEqual(["5 changes", "2 changes", "Current version"])
    expect(records.every((record) => record.author === null)).toBe(true)
  })

  it("says there is nothing to compare against when the siblings are absent", async () => {
    const history = await discoverHistory(BOARD, async () => null)
    expect(history.map((entry) => entry.id)).toEqual(["current"])
    expect(historyProblem(history)).toMatch(/^No prior versions found beside this board\./)
  })
})
