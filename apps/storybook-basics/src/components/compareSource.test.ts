/**
 * src/components/compareSource.test.ts — the `<name>.vN.systemsketch`
 * convention.
 *
 * The donor (/home/bam/systemsketch/src/compare/compareSource.ts:1-111)
 * shipped no test of its own — it could not easily, because its reader was
 * a hardcoded `fetch` (:51-60). Injecting the reader is what makes this
 * testable at all, so the suite exists here and not there.
 */

import { describe, expect, it, vi } from "vitest"

import {
  HISTORY_PROBE_DEPTH,
  currentVersion,
  discoverHistory,
  fileNameOf,
  historyProblem,
  stemOf,
  versionCandidates,
  versionRecords,
} from "../editor/compareSource"
import { DEFAULT_NEW_DOCUMENT_SUFFIX } from "../files/workspaceModel"

const BOARD = "/home/bam/boards/pipeline.systemsketch"

/** A reader that answers only for the paths it was given. */
function readerFor(...present: string[]) {
  return vi.fn(async (path: string) => (present.includes(path) ? `{"records":[]}` : null))
}

describe("stemOf", () => {
  it("splits a .systemsketch board off its extension", () => {
    expect(stemOf(BOARD)).toEqual({ stem: "/home/bam/boards/pipeline", extension: ".systemsketch" })
  })

  // Donor :46 matches both extensions: a `.tldr` opened in the app is
  // still a board, and its siblings are `.tldr` too.
  it("splits a .tldr board the same way", () => {
    expect(stemOf("/b/sketch.tldr")).toEqual({ stem: "/b/sketch", extension: ".tldr" })
  })

  // Donor :47: an unrecognised path keeps its whole self as the stem, so a
  // probe still produces a well-formed candidate rather than throwing.
  it("keeps an unrecognised path whole and assumes the type this build writes", () => {
    expect(stemOf("/b/notes")).toEqual({ stem: "/b/notes", extension: DEFAULT_NEW_DOCUMENT_SUFFIX })
  })

  // The regression the suffix-driven regex exists to prevent: a hardcoded
  // `(.systemsketch|.tldr)` leaves a `.bbox` board unmatched, the fallback then
  // treats the WHOLE path as the stem, and every probe asks for
  // `pipeline.bbox.v1.systemsketch` — a path that cannot exist. Compare would
  // have reported "no prior versions" for every new board, and been believed.
  it("splits a .bbox board off its extension, so its .vN siblings are probed", () => {
    expect(stemOf("/home/bam/boards/pipeline.bbox")).toEqual({
      stem: "/home/bam/boards/pipeline",
      extension: ".bbox",
    })
    expect(versionCandidates("/home/bam/boards/pipeline.bbox")[0].path).toBe("/home/bam/boards/pipeline.v1.bbox")
    expect(fileNameOf("/home/bam/boards/pipeline.bbox")).toBe("pipeline.bbox")
  })

  // A dotted stem is the trap the regex is greedy for: `.v1` has to hang
  // off `board.v2`, not off `board`.
  it("takes the LAST extension, so a dotted name keeps its dots", () => {
    expect(stemOf("/b/pipeline.v2.systemsketch").stem).toBe("/b/pipeline.v2")
  })
})

describe("fileNameOf", () => {
  it("is the last path segment", () => {
    expect(fileNameOf(BOARD)).toBe("pipeline.systemsketch")
  })

  it("is the whole string when there is no separator", () => {
    expect(fileNameOf("pipeline.systemsketch")).toBe("pipeline.systemsketch")
  })
})

describe("versionCandidates", () => {
  it("probes `.v1` … `.vN` beside the board, in order", () => {
    const candidates = versionCandidates(BOARD)
    expect(candidates).toHaveLength(HISTORY_PROBE_DEPTH)
    expect(candidates[0].path).toBe("/home/bam/boards/pipeline.v1.systemsketch")
    expect(candidates.at(-1)?.path).toBe(`/home/bam/boards/pipeline.v${HISTORY_PROBE_DEPTH}.systemsketch`)
    expect(candidates.map((candidate) => candidate.id)).toEqual(
      candidates.map((_, index) => `v${index + 1}`),
    )
  })

  it("keeps the board's own extension on every candidate", () => {
    expect(versionCandidates("/b/sketch.tldr")[0].path).toBe("/b/sketch.v1.tldr")
  })

  // An unsaved board has nowhere to look, and saying so is the whole
  // answer — not an error, not a guess at a directory.
  it("has nothing to probe for an unsaved board", () => {
    expect(versionCandidates(null)).toEqual([])
  })

  it("honours a shorter probe depth", () => {
    expect(versionCandidates(BOARD, 2).map((candidate) => candidate.id)).toEqual(["v1", "v2"])
  })
})

describe("discoverHistory", () => {
  it("offers the versions that exist and skips the ones that do not", async () => {
    const read = readerFor("/home/bam/boards/pipeline.v1.systemsketch", "/home/bam/boards/pipeline.v3.systemsketch")
    const history = await discoverHistory(BOARD, read)
    expect(history.map((entry) => entry.id)).toEqual(["v1", "v3", "current"])
    expect(read).toHaveBeenCalledTimes(HISTORY_PROBE_DEPTH)
  })

  // Donor :65-67, verbatim: "Absence is a finding, not an error: a board
  // with no `.vN` siblings gets a history of one entry — itself — and the
  // panel says there is nothing to compare against rather than inventing a
  // second endpoint."
  it("gives a board with no siblings a history of exactly itself", async () => {
    const history = await discoverHistory(BOARD, readerFor())
    expect(history).toHaveLength(1)
    expect(history[0]).toEqual({
      id: "current",
      label: "Current version",
      note: "pipeline.systemsketch",
      path: BOARD,
      isCurrent: true,
    })
  })

  it("still yields the live board when nothing has ever been saved", async () => {
    const read = readerFor()
    const history = await discoverHistory(null, read)
    expect(history).toEqual([{ id: "current", label: "Current version", note: "unsaved board", path: null, isCurrent: true }])
    expect(read).not.toHaveBeenCalled()
  })

  it("notes each prior version by its filename, not its full path", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(history[0].note).toBe("pipeline.v1.systemsketch")
  })

  // Donor :75 keeps the probe sequential on purpose ("ordered probe, at
  // most six") — the entries come back in version order without a re-sort.
  it("probes in version order", async () => {
    const seen: string[] = []
    await discoverHistory(BOARD, async (path) => {
      seen.push(path)
      return null
    })
    expect(seen).toEqual(versionCandidates(BOARD).map((candidate) => candidate.path))
  })

  it("marks exactly one entry as the live board", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(history.filter((entry) => entry.isCurrent)).toHaveLength(1)
    expect(history.at(-1)?.isCurrent).toBe(true)
  })
})

describe("currentVersion", () => {
  it("is always the live board, never a file that has to load", () => {
    expect(currentVersion(BOARD).isCurrent).toBe(true)
    expect(currentVersion(null).note).toBe("unsaved board")
  })
})

describe("historyProblem", () => {
  it("is the screenshot's sentence when only the live board is there", async () => {
    const history = await discoverHistory(BOARD, readerFor())
    expect(historyProblem(history)).toBe(
      `No prior versions found beside this board. Save a \`<name>.v1${DEFAULT_NEW_DOCUMENT_SUFFIX}\` next to it to compare against.`,
    )
  })

  it("is null once there is something to compare against", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(historyProblem(history)).toBeNull()
  })
})

describe("versionRecords", () => {
  it("marks the live board `current` and every prior version plain", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    const records = versionRecords(history)
    expect(records.map((record) => record.tone)).toEqual(["none", "current"])
    expect(records.map((record) => record.badge)).toEqual(["v1", "•"])
    expect(records.filter((record) => record.isCurrent)).toHaveLength(1)
  })

  // WHY this is asserted rather than left implicit: the rail's own footer
  // tells a reader "SystemSketch records no author", and that sentence is
  // only true while nothing upstream quietly starts inventing one.
  it("records no author, because the file format carries none", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(versionRecords(history).every((record) => record.author === null)).toBe(true)
  })

  it("has no timestamp unless the host measures one", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(versionRecords(history).every((record) => record.timestamp === null)).toBe(true)
    const stamped = versionRecords(history, { timestampOf: () => 1_700_000_000_000 })
    expect(stamped.every((record) => record.timestamp === 1_700_000_000_000)).toBe(true)
  })

  // "Titles are measured by diffing the files" — the rail's footer again.
  // A host that has measured a diff titles the row by it; one that has not
  // falls back to the version's own label.
  it("titles a row by the measured diff when the host supplies one", async () => {
    const history = await discoverHistory(BOARD, readerFor("/home/bam/boards/pipeline.v1.systemsketch"))
    expect(versionRecords(history).map((record) => record.title)).toEqual(["Version 1", "Current version"])
    const titled = versionRecords(history, { titleOf: (version) => (version.isCurrent ? "just now" : "3 changes") })
    expect(titled.map((record) => record.title)).toEqual(["3 changes", "just now"])
  })
})
