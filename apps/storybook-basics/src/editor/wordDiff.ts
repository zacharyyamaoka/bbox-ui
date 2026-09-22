/**
 * src/editor/wordDiff.ts — the "Word-level diff highlighting · like
 * Figma" toggle in the Compare dialog (docs/menus/screenshots/08).
 *
 * Byte-for-byte port of
 * /home/bam/systemsketch/src/diff/wordDiff.ts:1-197 — already zero imports,
 * no React, no DOM, no colour. Nothing changed.
 */

/**
 * The intra-value diff, which is the whole point of round 2.
 *
 * Round 1 could say a field *changed*. It could not say what about it changed,
 * because the only thing a primitive carried was one `state` enum — so the
 * loudest mark available was a strike through the whole old value. A reader of
 * `git diff` never accepts that: on a delete+insert pair GitHub tokenizes both
 * sides and highlights the tokens that actually differ, layered on top of the
 * line-level red and green. `run_inference` → `run_predict` should put ink on
 * `inference` and `predict`, not on `run_`.
 *
 * This module is that tokenizer and that alignment, and nothing else. It has no
 * React, no DOM and no colour in it: it answers which runs of two strings are
 * shared and which are not, and the paint layer decides what that looks like.
 */

export type DiffTokenKind = "same" | "removed" | "added"

export interface DiffToken {
  readonly text: string
  readonly kind: DiffTokenKind
}

export interface WordDiff {
  /** The before value, every token marked `same` or `removed`. */
  readonly before: readonly DiffToken[]
  /** The after value, every token marked `same` or `added`. */
  readonly after: readonly DiffToken[]
  /** False when the two values are identical — the caller should draw nothing. */
  readonly changed: boolean
}

/**
 * Beyond this many tokens the alignment stops being worth its quadratic cost
 * *and* stops being worth reading: a Block description that differs in eighty
 * places is a rewrite, and a rewrite is honestly drawn as one whole-value
 * replacement rather than as confetti.
 */
export const WORD_DIFF_TOKEN_LIMIT = 160

/**
 * Split a field value the way a person reads an identifier.
 *
 * Runs of letters and digits are one token; runs of anything else — `_`, `.`,
 * `[`, a space — are another, and they are *kept*, because dropping them would
 * make `a.b` and `ab` align. Inside an alphanumeric run a camelCase boundary
 * splits again, so `runInference` → `runPredict` marks `Inference`, not the
 * whole word. A digit stays welded to the letters before it, which is what
 * keeps `v2` one token instead of two.
 */
export function tokenizeFieldValue(value: string): string[] {
  if (value === "") return []
  const runs = value.match(/[A-Za-z0-9]+|[^A-Za-z0-9]+/g) ?? []
  const tokens: string[] = []
  for (const run of runs) {
    if (!/^[A-Za-z0-9]/.test(run)) {
      tokens.push(run)
      continue
    }
    // A lower-to-upper step is a word boundary; a digit is not, so `v2`
    // survives whole and `parseHTTPBody` splits at the humps a reader sees.
    for (const part of run.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      if (part !== "") tokens.push(part)
    }
  }
  return tokens
}

/** Adjacent tokens of one kind become one span, so the DOM stays small. */
function coalesce(tokens: readonly DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = []
  for (const token of tokens) {
    const last = merged[merged.length - 1]
    if (last && last.kind === token.kind) {
      merged[merged.length - 1] = { text: last.text + token.text, kind: last.kind }
    } else {
      merged.push(token)
    }
  }
  return merged
}

/** Longest common subsequence over tokens — the same alignment `diff` uses. */
function commonSubsequence(before: readonly string[], after: readonly string[]): boolean[][] {
  const rows = before.length
  const columns = after.length
  // `lengths[i][j]` is the LCS of the two suffixes starting at i and j.
  const lengths: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0))
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        before[i] === after[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const keptBefore = new Array<boolean>(rows).fill(false)
  const keptAfter = new Array<boolean>(columns).fill(false)
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (before[i] === after[j]) {
      keptBefore[i] = true
      keptAfter[j] = true
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return [keptBefore, keptAfter]
}

/**
 * Align two values and mark every run as shared, gone, or new.
 *
 * The two sides are returned separately rather than as one unified stream,
 * because the display draws them as two chips side by side — the old value
 * washed red with its lost runs filled, the new value washed green with its
 * gained runs filled. A unified stream would force the display to re-split it.
 */
export function wordDiff(before: string, after: string): WordDiff {
  if (before === after) {
    return {
      before: before === "" ? [] : [{ text: before, kind: "same" }],
      after: after === "" ? [] : [{ text: after, kind: "same" }],
      changed: false,
    }
  }
  const beforeTokens = tokenizeFieldValue(before)
  const afterTokens = tokenizeFieldValue(after)
  // A rewrite is drawn as a rewrite. Aligning eighty scattered tokens
  // produces a mark per token, which reads as damage rather than as a change.
  if (beforeTokens.length > WORD_DIFF_TOKEN_LIMIT || afterTokens.length > WORD_DIFF_TOKEN_LIMIT) {
    return {
      before: before === "" ? [] : [{ text: before, kind: "removed" }],
      after: after === "" ? [] : [{ text: after, kind: "added" }],
      changed: true,
    }
  }
  const [keptBefore, keptAfter] = commonSubsequence(beforeTokens, afterTokens)
  return {
    before: coalesce(
      beforeTokens.map((text, index) => ({
        text,
        kind: keptBefore[index] ? "same" : "removed",
      })),
    ),
    after: coalesce(
      afterTokens.map((text, index) => ({
        text,
        kind: keptAfter[index] ? "same" : "added",
      })),
    ),
    changed: true,
  }
}

/** Stands in for the shared runs a compact former value leaves out. */
export const WORD_DIFF_ELISION = "…"

/**
 * The former value with its shared runs elided.
 *
 * A row is one line wide and a pair needs roughly twice the room a single value
 * does, so on a real board the title, the description and the port name all
 * overflowed — measured, three per capture. The fix is not a smaller font: it is
 * that half of what the pair was drawing is redundant. Every run the two values
 * SHARE is already legible in the current value an inch to the right, so the
 * former value only has to carry what it lost.
 *
 * `run_inference → run_predict` becomes `…inference → run_predict`: shorter than
 * the full pair, and the ink lands exactly on the run that changed rather than
 * on six characters that did not. The complete former value stays in the row's
 * tooltip, so nothing is unrecoverable.
 *
 * A shared run is only worth eliding when the ellipsis is actually shorter than
 * it, and a purely additive change returns nothing at all — there is no former
 * value worth a chip when nothing was taken away.
 */
export function compactFormerValue(tokens: readonly DiffToken[]): DiffToken[] {
  if (!tokens.some((token) => token.kind === "removed")) return []
  const compact: DiffToken[] = []
  for (const token of tokens) {
    if (token.kind !== "same") {
      compact.push(token)
      continue
    }
    if (token.text.length <= WORD_DIFF_ELISION.length) {
      compact.push(token)
      continue
    }
    const last = compact[compact.length - 1]
    // Never two ellipses in a row: `…a…` and `……` say the same thing and one
    // of them looks like a rendering fault.
    if (last?.kind === "same" && last.text === WORD_DIFF_ELISION) continue
    compact.push({ text: WORD_DIFF_ELISION, kind: "same" })
  }
  return compact
}
