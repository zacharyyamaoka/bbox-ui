// src/scene/history.ts — the HISTORY CONTRACT (cards 21-26 of
// reports/media/node-editor-prior-art-visuals-2026-09-18.html), and only
// the contract. Zach moved on this one mid-review: he first called it a
// host concern ("I feel I got this for free with tldraw... it certainly
// feels like a host thing") and then accepted the card's framing — "so yes
// our KIT does need to consider the history a bit." So this file ships
// three pure shapes and one predicate; the HOST keeps owning the undo
// stack, its depth, its coalescing, and its persistence. There is no
// `undo()` here, no command pattern, no inverse-operation registry, and no
// module-level mutable state — see `HOST_CONTRACT`'s last clause, and the
// grep in history.test.ts that holds this file to it.
//
// THE CONTRACT, three clauses, read from JointJS's element tools
// (MPL-2.0, read and cited only — no code copied, same line this repo
// already held for JointJS prior art elsewhere):
//
//   1. ONE GESTURE = ONE BATCH. `joint-core/src/cellTools/Control.mjs:151`
//      opens a batch on pointer-down (`this.paper.model.startBatch("cell-
//      tool-drag", { ui: true, tool: this.cid })`); every mutation the drag
//      makes joins it; `Control.mjs:168` stops the same batch on
//      pointer-up. One drag, one undo step.
//   2. EVERY WRITE IS STAMPED WITH ITS AUTHOR. The `tool: this.cid` field
//      on that same `startBatch` call is the stamp — `dia.Paper.mjs:3170-
//      3187`'s `_batchTrigger`/broadcast trio hands the whole batch options
//      object (`tool` included) to every subscriber, and `dia.CellView.
//      mjs:1153` is one such subscriber: every view listens to every
//      batch.
//   3. THE SELF-SKIP. `dia.ToolsView.mjs:55`: `if (opt.tool !== tool.cid)
//      tool.update(...)`. A tool ignores a `change` batch whose `tool`
//      field names itself — otherwise a handle would re-render mid-drag
//      from the very write it just made, fighting its own pointer.
//
// WE RE-DERIVED CLAUSE 3 INDEPENDENTLY, from a different direction, before
// this file existed: `apps/storybook-basics/src/components/
// codeEditorGuards.ts:5-19`'s `externalSync` annotation marks `CodeEditor`'s
// own imperative doc swaps so its change listener "never echoes them back
// as typing" — the same shape (a writer's own write must not be mistaken
// for external input) solved for CodeMirror transactions instead of a
// batch id. A bug found twice, from two unrelated angles, is the strongest
// argument the contract behind it is real rather than a JointJS-specific
// convenience.
//
// A CORRECTION TO THE BRIEF THAT DISPATCHED THIS LANE: it named
// `traceEditor.tsx`'s drag handling as "our own prior art" for the
// self-skip and asked for its line range. Read in full (2026-09-18,
// `apps/storybook-basics/src/components/traceEditor.tsx`, all ~508
// lines) — it does not contain one. Its `latestRef` (lines ~303-306) solves
// a DIFFERENT problem, a stale-closure read inside a `window`-level pointer
// listener attached once per gesture, not an author echo; nothing there
// stamps a write's origin or compares it against a subscriber's identity.
// The actual second derivation is `codeEditorGuards.ts`, cited above — this
// file corrects the pointer rather than repeating an uninspected claim, per
// this repo's own "verify before asserting" rule.
//
// COMPOSING WITH WHAT THIS REPO ALREADY OWNS A PRESS THROUGH:
// `src/scene/interactions/dragPolicy.ts` is who decides a gesture has STARTED (a
// `GrabRole` walk, a click-vs-drag threshold, pointer capture — all host
// work per `CLAUDE.md`'s governing rule). This file does not compete with
// that: "on pointer-down" in `HOST_CONTRACT` below means "at the moment
// `dragPolicy`'s host-side gesture recognition decides a grab gesture has
// begun," not literally the raw DOM `pointerdown` event — a press that
// `dragPolicy` resolves to `owns-pointer` or that never crosses the
// click-vs-drag threshold never opens a batch at all, because no grab
// gesture started. `dragPolicy` decides WHETHER and WHEN a gesture exists;
// this file decides what a gesture's writes look like once one does.
//
// SCOPE FENCE — cards 21, 22 and 24 (the overlay-boolean derivation,
// model-vs-view geometry, and calc-expression tool placement) are TOOL
// GEOMETRY, not history, and are not built here. They are left as
// constraints for whichever future lane places interactive tool affordances
// on canvas: a tool's overlay position is a VIEW concern the same way a
// `HistoryWrite`'s payload is host-shaped and opaque to this file — neither
// belongs in a scene-kit module that owns no rendering. Card 23's lesson (a
// convenience gesture that bypasses containment/connection judging) is a
// validation-lane concern, not a history one, and is not addressed here.
//
// Card 26 (one paper-wide `tools:event` channel that clears every handle on
// a mode change) is the contract's natural sibling and is recorded below as
// a documented `HOST_CONTRACT` obligation, not as an event-emitter
// implementation — this file has no DOM, no engine, and mints no event
// bus.
//
// docs/peps/0003-collapse-mutates-the-document.md governs how this composes
// with collapse/dissolve: a collapse MUTATES the document (0003's ruling),
// so from this file's point of view a collapse gesture is exactly one
// `HistoryBatch` whose writes are the endpoint rewrites `collapseToRegion`
// makes, stamped with one author — not "undo by flipping a boolean," which
// 0003 explicitly gave up ("Collapse is no longer undone by flipping a
// boolean. It is undone by `dissolveRegion`"). Nothing here reopens that
// tradeoff; a host still calls `dissolveRegion` to invert a collapse, and
// still wraps that call in its own single batch like any other gesture.

/**
 * The identity a batch (and every write inside it) is stamped with — a
 * tool, a handle, an editor component, or a host's own top-level gesture
 * recognizer. Branded so a bare `string` cannot be handed to `openBatch`
 * by accident; construct one with `authorId`.
 */
export type AuthorId = string & { readonly __brand: "AuthorId" };

/** The only way to mint an `AuthorId` — a thin cast with a name, not a
 * `class`, because this is a value with a marker, not behaviour. */
export function authorId(raw: string): AuthorId {
  return raw as AuthorId;
}

/**
 * One mutation inside a batch, stamped with its batch's author by
 * `record` — never by the caller directly, so a write's `author` can never
 * disagree with the batch that carries it (acceptance #8's "all N writes
 * carry the SAME author" is true by construction, not by convention).
 *
 * `description` is deliberately `unknown`: this kit does not define a
 * mutation language (`CLAUDE.md`'s "props in, DOM out" extends to this
 * file — it has no opinion on what a host's mutations look like). A host
 * puts whatever it wants there: a scene patch, a command name, a diff.
 */
export interface HistoryWrite {
  readonly author: AuthorId;
  readonly description: unknown;
}

/**
 * One gesture's worth of writes. Open with `openBatch`, grow with
 * `record`, and close with `closeBatch` — each returns a NEW value; there
 * is nothing to mutate in place and nothing held between calls.
 */
export interface HistoryBatch {
  readonly id: string;
  readonly author: AuthorId;
  readonly label: string;
  readonly writes: readonly HistoryWrite[];
  readonly closed: boolean;
}

function makeBatchId(): string {
  // Never a module-level counter — that would be exactly the mutable
  // global this file's own contract forbids. `crypto.randomUUID` is
  // available in every environment this kit ships to (browsers and
  // Node >=19, which is what `pnpm test-stories`'s Vitest/Node runs on);
  // the fallback below exists only so a caller can still pass an explicit
  // `id` in an environment that somehow lacks it, per `openBatch`'s
  // signature.
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `batch-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Open a new batch. A host calls this once per gesture — see
 * `HOST_CONTRACT`'s first obligation — never once per mutation.
 *
 * `id` is optional and exists only for a caller (a test, a host with its
 * own id scheme) that wants a deterministic value instead of
 * `crypto.randomUUID()`.
 */
export function openBatch(author: AuthorId, label: string, id?: string): HistoryBatch {
  return { id: id ?? makeBatchId(), author, label, writes: [], closed: false };
}

/**
 * Append one write to a batch, stamped with the batch's own author. Pure:
 * returns a new `HistoryBatch`, leaves `batch` untouched. Recording into an
 * already-closed batch is a caller bug — this function does not silently
 * reopen it, it simply appends onto whatever was there (a host that closes
 * and then keeps recording has broken clause (a) of `HOST_CONTRACT` itself,
 * not something this module can rescue).
 */
export function record(batch: HistoryBatch, description: unknown): HistoryBatch {
  const write: HistoryWrite = { author: batch.author, description };
  return { ...batch, writes: [...batch.writes, write] };
}

/**
 * Close a batch. Returns `null` for a batch with zero writes — this is the
 * "abandoned gesture" case: a press that opened a batch and then never
 * moved (or was cancelled before any mutation landed) closes to NOTHING,
 * rather than leaving an empty entry a host would otherwise have to filter
 * out of its own undo stack. A batch with at least one write closes
 * normally, `closed: true`, its writes unchanged.
 */
export function closeBatch(batch: HistoryBatch): HistoryBatch | null {
  if (batch.writes.length === 0) return null;
  return { ...batch, closed: true };
}

/**
 * THE SELF-SKIP. `false` exactly when `subscriber` is the batch's own
 * author — the one line this file is built around, and the single
 * most-tested thing in it. A host delivers a closed batch to every
 * subscriber and calls this first; a subscriber this returns `false` for
 * must not be notified, full stop, because it is the writer that produced
 * the batch and re-notifying it re-triggers the exact fight clause 3 above
 * exists to prevent (a handle re-rendering from its own drag write,
 * mid-drag, against its own pointer).
 */
export function shouldNotify(batch: HistoryBatch, subscriber: AuthorId): boolean {
  return subscriber !== batch.author;
}

/** One obligation a host takes on by using this contract — readable at
 * runtime (a host can render this, or assert against it in its own tests)
 * and in a story, rather than living only in a comment nobody re-reads. */
export interface HostObligation {
  readonly id: string;
  readonly text: string;
}

/**
 * The whole contract, frozen, in prose. This file has an opinion about
 * exactly these five things (the sixth, `one-clear-channel`, documents
 * card 26 as this contract's sibling per the dispatching brief) and no
 * opinion about anything past them — most pointedly, obligation
 * `host-owns-stack`: this file exports no undo stack, no redo stack, no
 * depth limit, and no persistence, on purpose.
 */
export const HOST_CONTRACT: readonly HostObligation[] = Object.freeze([
  Object.freeze({
    id: "one-batch-per-gesture",
    text:
      "Open exactly one HistoryBatch per gesture, at the moment the host's own gesture recognition (dragPolicy.ts) decides a grab gesture has begun — never once per mutation inside that gesture.",
  }),
  Object.freeze({
    id: "stamp-every-write",
    text:
      "Every write recorded into that gesture's batch carries the SAME author — use record(), which stamps it, rather than constructing a HistoryWrite by hand.",
  }),
  Object.freeze({
    id: "close-on-cancel",
    text:
      "Close the batch when the gesture ends, including on cancel/escape/pointercancel — not only on a clean pointerup. An abandoned gesture closes to an empty batch (closeBatch returns null) rather than leaking an open one a host must remember to reap.",
  }),
  Object.freeze({
    id: "self-skip-delivery",
    text:
      "Deliver a closed batch to subscribers through shouldNotify(batch, subscriberAuthor) — a subscriber it returns false for is the batch's own author and must not be notified, so a writer never receives its own echo.",
  }),
  Object.freeze({
    id: "host-owns-stack",
    text:
      "The undo STACK — its depth, its coalescing of adjacent batches, and its persistence across reloads or sessions — remains entirely the host's. This kit stores nothing, exports no stack, and has no opinion.",
  }),
  Object.freeze({
    id: "one-clear-channel",
    text:
      "Expose one channel that clears every affordance layer at once (card 26's tools:event), so a mode change (e.g. leaving edit mode, pressing Escape at the paper level) cannot strand a handle that a per-tool close would otherwise miss.",
  }),
]);
