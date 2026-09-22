/**
 * src/editor/lineDiff.test.ts — the Code tab's line diff.
 *
 * The donor (/home/bam/systemsketch/src/compare/lineDiff.ts:1-163) shipped
 * NO test file of its own — `ls /home/bam/systemsketch/src/compare/` has
 * only `compareModel.test.ts` and `compareFixture.test.ts` — so these cases
 * are written here against the ported module's own stated rules rather than
 * carried across. Each `it` names the rule in the donor's prose that it
 * pins, so a future reader can check the test against the source of the
 * claim and not just against the implementation.
 */

import { describe, expect, it } from "vitest"

import { CONTEXT_LINES, ELISION, collapseContext, lineDiff, stableJson, type DiffLine } from "./lineDiff"

function render(lines: readonly DiffLine[]): string[] {
  return lines.map((line) => `${line.kind[0]} ${line.text}`)
}

describe("stableJson", () => {
  // The rule (lineDiff.ts:45-51): "without them a store that happened to
  // write `type` before `name` on one save produces a diff full of moved
  // lines that mean nothing."
  it("sorts object keys so a re-ordered save is not a diff", () => {
    const written = stableJson({ type: "block", name: "predict" })
    const other = stableJson({ name: "predict", type: "block" })
    expect(written).toBe(other)
    expect(written.indexOf('"name"')).toBeLessThan(written.indexOf('"type"'))
  })

  it("sorts nested objects too, not just the top level", () => {
    expect(stableJson({ props: { z: 1, a: 2 } })).toBe(stableJson({ props: { a: 2, z: 1 } }))
  })

  // Arrays are values, not key bags — reordering one IS a change.
  it("leaves array order alone", () => {
    expect(stableJson(["b", "a"])).not.toBe(stableJson(["a", "b"]))
  })

  it("renders absence as the empty string, never the text 'null'", () => {
    expect(stableJson(null)).toBe("")
    expect(stableJson(undefined)).toBe("")
  })
})

describe("lineDiff", () => {
  it("marks every unchanged line as context, numbered on both sides", () => {
    const lines = lineDiff("a\nb", "a\nb")
    expect(lines.every((line) => line.kind === "context")).toBe(true)
    expect(lines.map((line) => [line.beforeNumber, line.afterNumber])).toEqual([
      [1, 1],
      [2, 2],
    ])
  })

  // The rule (lineDiff.ts:98-101): "Removed lines are emitted before the
  // added lines they were replaced by, the way `git diff` orders a
  // replacement, so the pair reads top-to-bottom."
  it("emits the removed line before the added one that replaced it", () => {
    expect(render(lineDiff("a\nold\nc", "a\nnew\nc"))).toEqual(["c a", "r old", "a new", "c c"])
  })

  it("numbers an added line only on the after side, and a removed line only on the before", () => {
    const lines = lineDiff("gone", "fresh")
    const removed = lines.find((line) => line.kind === "removed")
    const added = lines.find((line) => line.kind === "added")
    expect([removed?.beforeNumber, removed?.afterNumber]).toEqual([1, null])
    expect([added?.beforeNumber, added?.afterNumber]).toEqual([null, 1])
  })

  it("reads a pure insertion as added lines around kept context", () => {
    expect(render(lineDiff("a\nc", "a\nb\nc"))).toEqual(["c a", "a b", "c c"])
  })

  it("reads a pure deletion as removed lines around kept context", () => {
    expect(render(lineDiff("a\nb\nc", "a\nc"))).toEqual(["c a", "r b", "c c"])
  })

  // The LCS is what makes a moved line read as one removal plus one
  // addition rather than shifting every line after it.
  it("keeps the longest common subsequence rather than aligning line-for-line", () => {
    const lines = lineDiff("a\nb\nc\nd", "a\nx\nc\nd")
    expect(lines.filter((line) => line.kind === "context")).toHaveLength(3)
    expect(lines.filter((line) => line.kind !== "context").map((line) => line.text)).toEqual(["b", "x"])
  })

  // An empty side is zero lines, not one empty line — otherwise a record
  // that did not exist reads as a record with a blank first line.
  it("treats an empty side as no lines at all", () => {
    expect(lineDiff("", "only")).toEqual([{ kind: "added", text: "only", beforeNumber: null, afterNumber: 1 }])
    expect(lineDiff("only", "")).toEqual([{ kind: "removed", text: "only", beforeNumber: 1, afterNumber: null }])
    expect(lineDiff("", "")).toEqual([])
  })
})

describe("collapseContext", () => {
  /*
   * Twenty lines with one changed in the middle, so the change is far
   * enough from BOTH ends to leave an elided run on each side. The window
   * is counted in DIFF lines, not source lines, and a replacement occupies
   * two of them (the removed line and the added one) — so `l10` changing
   * puts the pair at diff indices 9 and 10, and a context of 3 keeps
   * indices 6…13, which is `l7` through `l13`.
   */
  const long = (marker: string) =>
    Array.from({ length: 20 }, (_, index) => (index === 9 ? marker : `l${index + 1}`)).join("\n")

  it("keeps three lines of context either side of a change by default", () => {
    expect(CONTEXT_LINES).toBe(3)
    const collapsed = collapseContext(lineDiff(long("was"), long("now")))
    const texts = collapsed.map((line) => line.text)
    expect(texts).toContain("l7")
    expect(texts).toContain("l13")
    expect(texts).not.toContain("l6")
    expect(texts).not.toContain("l14")
    // Both sides of the replacement survive, in git's order.
    expect(texts.slice(texts.indexOf("l9"), texts.indexOf("l11") + 1)).toEqual(["l9", "was", "now", "l11"])
  })

  it("replaces each elided run with exactly one marker line", () => {
    const collapsed = collapseContext(lineDiff(long("was"), long("now")))
    expect(collapsed.filter((line) => line.text === ELISION)).toHaveLength(2)
    // A marker is not a real line on either side, so it carries no number
    // a reader could try to navigate to.
    for (const marker of collapsed.filter((line) => line.text === ELISION)) {
      expect([marker.beforeNumber, marker.afterNumber]).toEqual([null, null])
      expect(marker.kind).toBe("context")
    }
  })

  it("honours a wider context window", () => {
    const texts = collapseContext(lineDiff(long("was"), long("now")), 5).map((line) => line.text)
    expect(texts).toContain("l5")
    expect(texts).toContain("l15")
    expect(texts).not.toContain("l4")
  })

  // Nothing changed → nothing worth showing. An all-context diff collapsing
  // to a single "⋯" would be a page that says only "something is elided".
  it("collapses an unchanged diff to nothing at all", () => {
    expect(collapseContext(lineDiff(long("same"), long("same")))).toEqual([])
  })

  it("leaves a diff shorter than the window untouched", () => {
    const lines = lineDiff("a\nold", "a\nnew")
    expect(collapseContext(lines)).toEqual(lines)
  })
})
