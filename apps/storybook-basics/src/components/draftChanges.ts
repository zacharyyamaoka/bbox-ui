// src/components/draftChanges.ts — the two questions that decide the draft
// bar's right-hand side: is there anything to promote, and has Main moved
// underneath this draft. Pure; engine-free; no storage.
//
// PORTED from the read-only donor /home/bam/systemsketch (the archived app),
// `src/drafts/DraftProvider.tsx` — `hasUnpromotedEdits` (:262, documented at
// :125-134), `readMainDrift` (:296-305, documented at :283-294), the
// advisory conflict badge (:307-322) and `merge`'s own refusal rules
// (:514-525). The earlier survivor prototype at
// /home/bam/systemsketch-track-draft-icepanel-quiet/src/drafts/
// DraftProvider.tsx:145-157 is the same logic before Compare existed, and
// carries the "Shape-level, not byte-level: re-serializing an unchanged Main
// is not a conflict" comment (:155) that `mainDrift` below is built around.
//
// WHY a separate module from draftModel.ts: `draftModel.ts` is bookkeeping —
// which drafts exist, what happens on merge. This is the POLICY that turns
// two measured facts into the look of the Merge control, and it is the part
// a host is most likely to get subtly wrong (see both rejected alternatives
// below). Keeping it here means `apps/systemsketch` measures and this
// decides, which is the "light bit of configuration" split Zach asked for on
// 2026-09-19.
//
// NOT ported, deliberately: the donor prototype's own `draftChanges.ts`
// (icepanel-quiet, `describeChanges`, 232 lines — a bespoke record-by-record
// board diff). The committed successor DELETED it: `draftModel.ts:4-13` in
// /home/bam/systemsketch says the model "deliberately never diffs a snapshot
// itself — every 'how much changed' question (the bar's badge, the conflict
// check, Compare, Rebase) goes through the one shared engine in
// compareModel.ts instead … A bespoke diff living here would give each of
// those four consumers its own idea of 'changed'." That engine is already in
// this trunk (`editor/compareModel.ts`), and it was measured disagreeing
// with a second opinion in the real app — DraftProvider.tsx:239-253 records
// the button reading "1 Change" while the dialog read "0 Added · 2 Removed ·
// 1 Modified". Re-porting the superseded diff would rebuild exactly that
// disagreement. This module therefore takes the COUNT as a number and never
// computes one.
import { snapshotDigest } from "./draftModel";

/**
 * Is there anything in this draft to promote at all?
 *
 * `base` is the draft's own immutable fork-point source; `head` is its
 * current stored source. Both are the serialized strings the host stores,
 * never parsed boards — comparison is by `snapshotDigest`, i.e. byte-level.
 *
 * WHY byte-level here, when `mainDrift` below is deliberately shape-level
 * (ported, DraftProvider.tsx:125-133's own WHY): the display diff
 * structurally cannot see a shape that only MOVED — `x`/`y`/`rotation`/
 * `parentId` live outside `props`, which is all the compare engine reads. A
 * draft whose only edit is a move therefore reports zero changes and is
 * still perfectly mergeable. Gate Merge on this, never on the change count.
 */
export function hasUnpromotedEdits(base: string | null, head: string | null): boolean {
  if (base === null || head === null) return false;
  return snapshotDigest(base) !== snapshotDigest(head);
}

/**
 * How far Main has moved since a draft forked, as the host measured it.
 *
 * - a number — the shape-level change count between the draft's fork point
 *   and Main as it is on disk right now. `0` means Main has not moved.
 * - `null` — the question could not be answered (no fork point on record,
 *   Main unreadable, nothing mounted yet).
 *
 * WHY shape-level rather than a digest, when `hasUnpromotedEdits` above is a
 * digest (ported verbatim, icepanel-quiet DraftProvider.tsx:155): "Shape-
 * level, not byte-level: re-serializing an unchanged Main is not a
 * conflict." A save that only rewrites key order or a version stamp would
 * fail a digest check and accuse the user of a conflict that does not exist.
 *
 * WHY `null` is a value rather than a thrown error or a `0` (ported,
 * DraftProvider.tsx:290-294): "Callers must treat that as 'unknown', never
 * as 'clear'". `resolveMergeGate` below is what makes that mechanical rather
 * than a comment each caller has to remember.
 */
export type MainDrift = number | null;

export type MergeLook = "normal" | "disabled" | "blocked";

export interface MergeGate {
  /** Is the primary Merge action live? */
  readonly canMerge: boolean;
  /** The resolved LOOK for `DraftBar`'s `mergeState`. */
  readonly mergeState: MergeLook;
  /** `DraftBar`'s `conflict` banner text, or null for no banner. */
  readonly conflict: string | null;
}

const DRIFTED_BANNER = "Main changed since this draft — review before merging";

/**
 * Turn the two measured facts into the three props `DraftBar` renders from.
 *
 * WHY a conflict produces `blocked` rather than `disabled` — a LOOK, not a
 * lock (ported from the committed successor; the earlier prototype's
 * icepanel-quiet DraftModeBar.tsx:322 really did `disabled={hasConflict}`
 * and that is the behaviour being deliberately dropped): the conflict badge
 * is advisory and is pulled on demand, so by the time the button is clicked
 * it may already be stale in either direction. The real precondition is
 * re-checked fresh at the instant of the click (DraftProvider.tsx:494-506,
 * ":520 `if (drift === null) return … 'unreadable'`"), and a drifted draft's
 * whole point is that the chevron must still open Rebase. Greying the
 * control out would hide the one action that resolves the state it is
 * complaining about.
 *
 * WHY unknown drift does not block: it is not evidence of a conflict, and
 * the fresh check at click time is what refuses on it. Showing a warning
 * banner for "we could not read Main" would cry wolf on every mount.
 */
export function resolveMergeGate(input: {
  readonly hasUnpromotedEdits: boolean;
  readonly mainDrift: MainDrift;
  readonly driftedBanner?: string;
}): MergeGate {
  const drifted = input.mainDrift !== null && input.mainDrift > 0;
  if (!input.hasUnpromotedEdits) {
    // Nothing to promote — the banner still shows, because a drifted draft
    // with no edits of its own is still something the user should know about
    // before they start editing on top of it.
    return {
      canMerge: false,
      mergeState: "disabled",
      conflict: drifted ? (input.driftedBanner ?? DRIFTED_BANNER) : null,
    };
  }
  return {
    canMerge: true,
    mergeState: drifted ? "blocked" : "normal",
    conflict: drifted ? (input.driftedBanner ?? DRIFTED_BANNER) : null,
  };
}
