/**
 * src/editor/wordDiff.test.ts — ported from
 * /home/bam/systemsketch/src/diff/wordDiff.test.ts:1-93 verbatim (the
 * "tokenizing a field value" and "the intra-value diff" describe blocks —
 * everything in that donor file that exercises `wordDiff.ts` itself). The
 * donor file also covers `./fieldDiff` (path resolution, pose-change
 * classification) in the same suite; that donor is out of Lane E's scope and
 * is not this file's concern, so those describe blocks do not travel.
 */
import { describe, expect, it } from "vitest"

import { WORD_DIFF_TOKEN_LIMIT, tokenizeFieldValue, wordDiff, type DiffToken } from "./wordDiff"

/** The marked runs of one side, as the string a reader would see inked. */
function inked(tokens: readonly DiffToken[]): string {
  return tokens
    .filter((token) => token.kind !== "same")
    .map((token) => token.text)
    .join("|")
}

function plain(tokens: readonly DiffToken[]): string {
  return tokens.map((token) => token.text).join("")
}

describe("tokenizing a field value", () => {
  it("keeps separators, so `a.b` cannot align with `ab`", () => {
    expect(tokenizeFieldValue("a.b")).toEqual(["a", ".", "b"])
    expect(tokenizeFieldValue("run_inference")).toEqual(["run", "_", "inference"])
  })

  it("splits at the humps a reader sees, and nowhere else", () => {
    expect(tokenizeFieldValue("runInference")).toEqual(["run", "Inference"])
    expect(tokenizeFieldValue("parseHTTPBody")).toEqual(["parse", "HTTP", "Body"])
    // A digit is not a word boundary, or `v2` would arrive as two marks.
    expect(tokenizeFieldValue("poseV2")).toEqual(["pose", "V2"])
    expect(tokenizeFieldValue("")).toEqual([])
  })
})

describe("the intra-value diff", () => {
  it("inks only the run that changed — the whole point of round 2", () => {
    const words = wordDiff("run_inference", "run_predict")
    expect(words.changed).toBe(true)
    // `run_` survives on both sides and must not be marked. Filling the whole
    // former value red is a claim about six characters that did not change.
    expect(inked(words.before)).toBe("inference")
    expect(inked(words.after)).toBe("predict")
    expect(plain(words.before)).toBe("run_inference")
    expect(plain(words.after)).toBe("run_predict")
  })

  it("marks a pure suffix as a pure addition", () => {
    const words = wordDiff("run_inference", "run_inference_v2")
    expect(inked(words.before)).toBe("")
    expect(inked(words.after)).toBe("_v2")
  })

  it("says nothing at all when the two values are the same", () => {
    const words = wordDiff("callee", "callee")
    expect(words.changed).toBe(false)
    expect(inked(words.before)).toBe("")
  })

  it("handles an empty side, which is what an added or removed field is", () => {
    expect(inked(wordDiff("", "Estimator").after)).toBe("Estimator")
    expect(inked(wordDiff("Estimator", "").before)).toBe("Estimator")
  })

  it("draws a rewrite as a rewrite rather than as confetti", () => {
    // Beyond the limit the alignment stops being worth reading: eighty
    // scattered marks look like damage, not like a change.
    const long = Array.from({ length: WORD_DIFF_TOKEN_LIMIT + 20 }, (_, i) => `w${i}`).join(" ")
    const words = wordDiff(long, `${long} tail`)
    expect(words.before).toHaveLength(1)
    expect(words.before[0].kind).toBe("removed")
    expect(words.after[0].kind).toBe("added")
  })

  it("coalesces neighbours, and keeps a genuinely shared run shared", () => {
    // Both words differ, but the space between them does not — so the reader
    // gets `alpha`/`beta` inked around an unmarked gap, which is exactly what
    // GitHub draws. Three spans, not five, and not one.
    const words = wordDiff("alpha beta", "gamma delta")
    expect(words.before.map((token) => token.kind)).toEqual(["removed", "same", "removed"])
    expect(inked(words.before)).toBe("alpha|beta")
    // A run of same-kind neighbours really does merge.
    const merged = wordDiff("a_b_c", "x")
    expect(merged.before).toHaveLength(1)
  })
})
