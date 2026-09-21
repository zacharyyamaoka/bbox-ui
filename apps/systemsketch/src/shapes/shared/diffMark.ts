// src/shapes/shared/diffMark.ts — P-035. The mark a Block, a port or a cable
// wears to say what a comparison did to it, as a real tldraw `StyleProp`.
//
// ============================================================================
// WHY THIS IS *NOT* THE BACKLOG'S SIX-VALUE `state`
// ============================================================================
//
// P-035 asks for the donor's one enum: "normal · added · removed · changed ·
// error · warning" on every visual primitive. This repo has already ruled
// against exactly that shape, and the ruling is not a style preference — it
// makes a state the comparison view exists to show INEXPRESSIBLE.
//
// `docs/INVALID-STATES-PLAN.md` §6 ("One vocabulary, two producers — but two
// props") records it: the archived SystemSketch ran diff marks and lint marks
// through one prop (`BLOCK_STATES = ['normal','added','removed','changed',
// 'error','warning']`, `blocks/blockModel.ts:214`, with
// `diagnosticSeverityState()` folding severity in), and this kit deliberately
// split them. The decisive ground, quoted: "(1) a single enum makes
// *changed-AND-broken* inexpressible, and that joint state is exactly what a
// comparison view exists to show — a change that introduced the error."
// `docs/COMPARISON-NEXT-STEPS.md` restates it from the other side: "added/
// removed/modified has no rank, so the diagnostics prop's one merge rule —
// max(severity) — cannot apply to it. Same paint, two doors."
//
// There is a second, independent reason the two halves cannot share one
// authorable prop, and it is this repo's own `received` argument
// (ARCHITECTURE.md, "Why `received` is runtime-only"):
//
//   * A DIFF mark is AUTHORED. "This block is part of the change I am
//     proposing" is a decision about the document, and a board that forgot it
//     on reload would be the thing that lies. Same test ruling 9 applied to
//     `showDescription` and P-036 applied to `glyph`. It persists.
//   * `error`/`warning` are DERIVED. `lintScene` computes them from the board
//     itself (`chrome/problems.ts`, `document/sceneFromStore.ts`). Letting a
//     user hand-paint "error" onto a block that lints clean would persist a
//     judgement the document contradicts — a lie after reload, which is
//     precisely what `received` is barred from the schema for. And the arming
//     half of a StyleProp is meaningless for them: "the next block I draw is
//     an error" is not a thing anyone means. Errors are FOUND, not chosen.
//
// So: the diff half is a StyleProp (this file). The severity half stays
// derived, unauthored, and unpersisted — it already has its own door in
// `chrome/problems.ts`, and §6's closing rule keeps the two on disjoint
// channels so a block can be changed AND broken at once.
//
// ============================================================================
// WHY A StyleProp, WHEN `routing` AND `tunnel` DELIBERATELY ARE NOT
// ============================================================================
//
// `chrome/ContextualPopupMenu/selectionActions.ts:151` (setWireRouting) and
// `:176` (setWireTunnel) both refuse a StyleProp, on one argument: "a style
// writes to the OTHER kinds in a mixed selection, and tunnelling is a fact
// about a cable that no block or code cell has an answer for."
//
// That argument INVERTS here, and the inversion is the whole case. Zach's own
// words on this item are "all the visual primitives should support kinda these
// states" — a diff mark is the rare fact that EVERY kind has the same answer
// for, so writing across a mixed selection is the feature, not the leak.
// Marking a proposed subgraph means selecting the new block, its floating
// ports and the cable that came with them and pressing "Added" ONCE. tldraw's
// three StyleProp behaviours are all wanted, not merely tolerated:
//
//   1. set for every selected shape at once   — `setStyleForSelectedShapes`
//      (Editor.mjs:6790) writes to each selected shape that HAS the prop and
//      silently skips the ones that do not, so a mixed bag of blocks, ports,
//      cables and geo boxes marks the three kinds that can be marked.
//   2. arms the next shape you draw           — `createShapes`
//      (Editor.mjs:6336-6338) folds `getStyleForNextShape` into the initial
//      props of every new shape. Annotating a proposal means drawing several
//      new blocks and wanting all of them born "added"; without arming that
//      is a select-and-set after every single one.
//   3. persists on the record                 — it is in `props`, validated
//      and migrated like every other field.
//
// All three, so it is a StyleProp.
//
// ============================================================================
// THE VOCABULARY IS NOT MINTED HERE
// ============================================================================
//
// `DIFF_OPERATIONS` (`@trunk/scene/sceneDiff.ts:102`) is the trunk's own three
// states and already this app's language: `document/applySceneDiff.ts`
// dispatches on those exact strings (`:355`, `:360`, `:524`). Re-spelling them
// would be the FOURTH copy of `added/removed/modified` in this tree and would
// let the authored mark drift from the computed operation, which is the one
// thing that must never happen — "mark this as added" and "the differ says
// this was added" have to be the same word or the two can never be compared.
// Read off the enum, never re-listed: the same rule `STYLE_ROWS`' own test
// enforces for tldraw's enums (`arrangeActions.test.ts:58-70`).
//
// The user-facing word for `modified` is "Changed" — Zach's own spelling in
// the backlog row, and the trunk's `Lens` spelling
// (`packages/bbox-ui/src/appearance.ts:124`). It rides in `DIFF_MARK_LABELS`,
// the same way `SIZE_LABELS` gives tldraw's cryptic `m` a readable face,
// rather than as a fourth value in the enum.
import { StyleProp } from "tldraw";

import { DIFF_OPERATIONS, type DiffOperation } from "@trunk/scene/sceneDiff";

/** The unmarked state. Not a `DiffOperation` — `diffScene` never emits it,
 *  because "this did not change" produces no row at all. It exists only
 *  because a PROP must always have a value, and it is the value that means
 *  "this shape is not part of any comparison". */
export const DIFF_MARK_NONE = "normal";

/** `normal` plus the trunk's three operations, in the trunk's order. */
export const DIFF_MARKS = [DIFF_MARK_NONE, ...DIFF_OPERATIONS] as const;

export type DiffMark = (typeof DIFF_MARKS)[number];

/**
 * The style itself.
 *
 * `ss:` prefix per tldraw's own instruction ("we recommend you prefix this
 * with your app/library name", StyleProp.define's doc) and matching the
 * `ss-*` shape-type namespace this app already owns. `defaultValue: "normal"`
 * is what makes an UNARMED board keep painting exactly as it did: a new shape
 * takes the default, and `getSharedStyles` reports the default for a tool with
 * nothing set.
 */
export const DiffMarkStyle = StyleProp.defineEnum("ss:diff", {
  defaultValue: DIFF_MARK_NONE,
  values: DIFF_MARKS,
});

/** What the pill calls each value. `modified` reads "Changed" — see the
 *  header's last paragraph for why the enum keeps the trunk's word and only
 *  the FACE carries Zach's. */
export const DIFF_MARK_LABELS: Record<DiffMark, string> = {
  normal: "Unmarked",
  added: "Added",
  removed: "Removed",
  modified: "Changed",
};

/**
 * The ink each mark paints in.
 *
 * NOT a new palette: these are the three colours the panel kit's own
 * `LensGlyph` already assigns to the same three words
 * (`packages/panel/src/variants/IconStrip.tsx:748-770` — added → success,
 * removed → danger, changed → accent), which are in turn the shared
 * `--bbox-*` severity tokens `docs/INVALID-STATES-PLAN.md` §6 requires both
 * lanes to use ("where both lanes need severity ink they use the same three
 * `--bbox-*` tokens").
 *
 * WHY `added` falls back to `--bbox-received` rather than carrying a literal:
 * the trunk's `globals.css` ports `--bbox-danger`/`--bbox-warning`/
 * `--bbox-accent` but NOT `--bbox-success` — measured, and already written
 * down at `hosts/ValidityPreview.stories.tsx:52` ("no --bbox-success token
 * exists (grepped)"). `packages/bbox-ui/src/theme.css:29` says of the missing
 * token: "same numbers as --bbox-received today, kept as a separate token".
 * So the fallback chain names the token that carries the identical value and
 * IS defined here (`globals.css:155`), and the day the trunk ports
 * `--bbox-success` this picks it up with no edit. A hard-coded hex would have
 * to be found and changed instead.
 */
export const DIFF_MARK_INK: Record<DiffMark, string | null> = {
  normal: null,
  added: "var(--bbox-success, var(--bbox-received))",
  removed: "var(--bbox-danger)",
  modified: "var(--bbox-accent)",
};

/**
 * The one character the mark draws.
 *
 * The donor's own notation, `IconStrip.tsx:749-760`, verbatim — and it is a
 * REAL MINUS SIGN (U+2212) for `removed`, not a hyphen, so it optically
 * matches the `+` beside it at the same weight.
 */
export const DIFF_MARK_SIGN: Record<DiffMark, string> = {
  normal: "",
  added: "+",
  removed: "−",
  modified: "~",
};

export interface DiffMarkPaint {
  readonly mark: Exclude<DiffMark, typeof DIFF_MARK_NONE>;
  readonly ink: string;
  readonly sign: string;
  readonly label: string;
}

/**
 * What to paint, or `null` for an unmarked shape.
 *
 * ONE function so the three faces cannot disagree, and so `normal` short-
 * circuits in exactly one place: an unmarked board must render byte-identical
 * to how it rendered before this prop existed, which means no wrapper, no
 * extra element and no `undefined` ink reaching a `style`.
 */
export function diffMarkPaint(mark: DiffMark): DiffMarkPaint | null {
  const ink = DIFF_MARK_INK[mark];
  if (mark === DIFF_MARK_NONE || !ink) return null;
  return { mark, ink, sign: DIFF_MARK_SIGN[mark], label: DIFF_MARK_LABELS[mark] };
}

export type { DiffOperation };
