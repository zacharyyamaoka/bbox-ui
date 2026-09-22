// src/editor/controlValue.ts — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/sharedValues.ts:19-46` — `sharedValueAcross`
//     (renamed from nothing, kept) and `combineSharedStyles` (renamed here
//     to `combineControlValues` to match this file's own type name).
//
// WHAT CHANGED in the port: the donor's `SharedStyle<T>` is `import type {
// SharedStyle } from 'tldraw'` — the one load-bearing borrowed type this
// whole architecture otherwise has none of. The core imports no canvas
// engine, so that type is redefined here as `ControlValue<T>`, structurally
// identical (`{ type: 'shared'; value: T } | { type: 'mixed' }`), and every
// donor function is renamed to match (`sharedEdgeValue`-style call sites
// don't travel — only the two generic folds do). Nothing else changed: same
// three-state model (design decision #3 — mixed-state folding is the
// essence of multi-selection property editing, so the "shared | mixed"
// shape stays exactly as SystemSketch designed it), same default equality,
// same abstention rule.

/**
 * The result of asking "does this property agree across every subject bound
 * to a control?" — three states, never two: a control can KNOW one value, know
 * they DISAGREE, or have asked nobody at all (see `sharedValueAcross`'s
 * `undefined` return, which is not a member of this type on purpose).
 */
export type ControlValue<T> = { type: "shared"; value: T } | { type: "mixed" };

/**
 * THE one reduce for "do these agree?".
 *
 * WHY (ported verbatim, sharedValues.ts:6-17): every contextual surface
 * needs "is this property the same across every relevant subject, or
 * mixed" — and each surface used to hand-roll its own fold (`combineShared`
 * in appearanceModel, `sharedEdgeValue` in strokeMeta, a first+every in the
 * appearance pill's arrow reading, an epsilon-compare in customFontSize).
 * Divergent copies of the same fold are how one menu says mixed while its
 * neighbour claims a value. Surfaces fold raw readings with
 * `sharedValueAcross` and already-folded readings with
 * `combineControlValues`; neither is reimplemented at a call site.
 *
 * `undefined` readings mean "this subject has nothing to say" and are
 * skipped rather than counted as disagreement; a set with no opinions folds
 * to `undefined`, never to a fabricated value.
 */
export function sharedValueAcross<T>(
  values: Iterable<T | undefined>,
  equals: (a: T, b: T) => boolean = Object.is,
): ControlValue<T> | undefined {
  let found: T | undefined;
  let has = false;
  for (const value of values) {
    if (value === undefined) continue;
    if (!has) {
      found = value;
      has = true;
    } else if (!equals(found as T, value)) {
      return { type: "mixed" };
    }
  }
  return has ? { type: "shared", value: found as T } : undefined;
}

/** Fold readings that are already shared/mixed verdicts into one verdict. */
export function combineControlValues<T>(
  readings: readonly (ControlValue<T> | undefined)[],
  equals?: (a: T, b: T) => boolean,
): ControlValue<T> | undefined {
  const present = readings.filter((reading): reading is ControlValue<T> => reading !== undefined);
  if (present.some((reading) => reading.type === "mixed")) return { type: "mixed" };
  return sharedValueAcross(
    present.map((reading) => (reading as { type: "shared"; value: T }).value),
    equals,
  );
}
