// src/components/inlineRename.tsx — ours, ported behavior. The commit
// contract (Enter/Escape/blur, the double-click mousedown guard, the
// empty-name refusal message) is ported from
// /home/bam/systemsketch/src/drafts/DraftsControl.tsx:36-116 (its local
// `InlineRename` helper) and cross-checked against the near-duplicate at
// /home/bam/systemsketch/src/drafts/DraftModeBar.tsx:394-423 — this file
// REPLACES both (docs/menus/MENU-KIT-DESIGN.md §3.1: "one component
// replacing the two duplicated editors"). `validate` generalizes the
// donor's hardcoded empty-name check into a swappable policy so the file
// rename / frames-row rename call sites (which want different messages,
// not different mechanics) don't need a third copy.
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "../lib/utils";

/**
 * How long a rename input's own `mousedown` is swallowed after it mounts.
 *
 * WHY (ported, DraftsControl.tsx:22-28): `InlineRename` focuses and
 * text-selects itself on mount, so a user's HABITUAL double-click's second
 * click lands ~90-200ms later on this now-different element — the
 * freshly-mounted `<input>`, not whatever trigger opened it. No native
 * `dblclick` can ever fire (the two clicks hit different elements), so this
 * is a plain click-inside-a-focused-input, which collapses the just-made
 * selection to a caret; the user then types expecting to replace the
 * selected text and instead inserts mid-word. Swallowing a `mousedown`
 * within this window keeps the selection intact for a rapid second click,
 * while a deliberate slow one still places a caret normally. Same window,
 * same root cause, and (per the donor's own comment) the same fix applied
 * at every sibling site — SystemSketch's house rule is to fix a bug
 * everywhere the pattern exists, not only the reported instance.
 */
const RENAME_MOUSEDOWN_GUARD_MS = 400;

function defaultValidate(next: string): string | null {
  // WHY this exact copy ("Give this draft a name.") as the shared default
  // rather than a generic "Name required": it is the donor's own message,
  // reused verbatim at both DraftsControl.tsx:73 and DraftModeBar.tsx:236 —
  // callers that need different wording (the frames row, the file title)
  // pass their own `validate`.
  return next.trim() ? null : "Give this draft a name.";
}

export interface InlineRenameProps {
  value: string;
  onCommit(next: string): void;
  onCancel(): void;
  /** Returns an error message or `null`; default rejects empty. Validation
   *  POLICY is host-swappable — the mechanics (Enter/Escape/blur) are not. */
  validate?: (next: string) => string | null;
  /** Controlled error, for an async commit that can fail after Enter has
   *  already closed the local error state — e.g. a rename that round-trips
   *  through a server. Takes precedence over the internal validation error
   *  while set. */
  error?: string | null;
  /** `"bar"` (chrome bar, draft-mode bar) is denser than `"row"` (frames
   *  panel row, list rows) — see barSize.tsx for the same two-rung idea
   *  applied elsewhere in this kit. */
  size?: "bar" | "row";
  className?: string;
  "aria-label"?: string;
}

const SIZE_CLASS: Record<NonNullable<InlineRenameProps["size"]>, string> = {
  bar: "h-7 rounded-md px-2 text-sm",
  row: "h-6 rounded px-1.5 text-sm",
};

/**
 * A text field that commits on Enter/blur and reverts on Escape.
 *
 * Renders: draft rename (bar + row), frames-panel rename, the branch chip
 * (docs/menus/screenshots/05-chrome-bar.png). Controlled `value`/callbacks
 * only — no F2 keybinding. WHY no keybinding lives here
 * (docs/menus/MENU-KIT-DESIGN.md, "Chrome bar" host-contract section): F2 is
 * a GLOBAL gesture the host wires onto whatever "begin renaming this thing"
 * callback opens the editing state that mounts this component — the same
 * way mouse-buttons-3/4 and BrowserBack/Forward are host gestures, never
 * something a leaf field owns.
 */
export function InlineRename({
  value,
  onCommit,
  onCancel,
  validate = defaultValidate,
  error: externalError,
  size = "row",
  className,
  "aria-label": ariaLabel,
}: InlineRenameProps) {
  const [draft, setDraft] = useState(value);
  const [internalError, setInternalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedAtRef = useRef(0);
  const helpId = useId();

  useEffect(() => {
    mountedAtRef.current = performance.now();
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const error = externalError ?? internalError;

  const commit = useCallback(() => {
    // WHY validation reads the TRIMMED draft but the commit carries the
    // AUTHORED one — two different questions that one `.trim()` used to
    // answer with the same value, wrongly:
    //
    //   "is this name acceptable?"  -> trimmed. A name of three spaces is
    //                                  empty in every sense a host cares
    //                                  about, and must be refused like "".
    //   "what did the user write?"  -> verbatim. Zach's truthful-rendering
    //                                  rule is explicit that stored text
    //                                  keeps every authored character: no
    //                                  silent normalization, trimming or
    //                                  substitution. A field that quietly
    //                                  edits what you typed is the exact
    //                                  failure that rule names.
    //
    // Collapsing the two also broke the unchanged-cancels guard below, by
    // comparing a trimmed draft against an untrimmed `value`. Open a rename
    // on "  Draft 1  ", press Enter having typed nothing, and the old code
    // computed next="Draft 1", found it !== value, and fired onCommit with
    // the whitespace destroyed — a write the user never asked for, on a
    // field they never edited. Reproduced by an independent judge, 2026-09-18.
    const message = validate(draft.trim());
    if (message) {
      setInternalError(message);
      // A frame late, same as the donor: `requestAnimationFrame` because a
      // `setState` from inside a blur/keydown handler hasn't re-rendered yet.
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    // WHY unchanged text cancels rather than commits (DraftsControl.tsx:76):
    // an Enter/blur on an untouched field isn't a rename, it's a dismiss —
    // calling `onCommit` for it would round-trip a no-op write through
    // whatever the host's commit does (a server call, a history entry).
    // Comparing like with like — both untrimmed — is what makes "untouched"
    // mean untouched.
    //
    // A host that genuinely wants names trimmed does it in its own
    // `onCommit`, where it is a visible decision rather than a silent one
    // this component made on its behalf.
    if (draft !== value) onCommit(draft);
    else onCancel();
  }, [draft, onCancel, onCommit, validate, value]);

  return (
    <div data-slot="inline-rename" data-size={size} data-error={error ? "true" : undefined} className="inline-flex flex-col gap-1">
      <input
        ref={inputRef}
        data-slot="inline-rename-input"
        aria-label={ariaLabel ?? "Rename"}
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        value={draft}
        className={cn(
          "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 w-full min-w-0 rounded-lg border outline-none focus-visible:ring-3 aria-invalid:ring-3",
          SIZE_CLASS[size],
          className,
        )}
        onChange={(event) => {
          setDraft(event.target.value);
          setInternalError(null);
        }}
        onMouseDown={(event) => {
          if (performance.now() - mountedAtRef.current < RENAME_MOUSEDOWN_GUARD_MS) {
            // Suppresses native caret placement while leaving focus (and the
            // selection `select()` above just made) intact — a rapid second
            // click leaves the text still fully selected, so typing replaces
            // it. A deliberate SLOW second click, outside the window, places
            // a caret normally.
            event.preventDefault();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            // WHY `stopPropagation` (ported, DraftsControl.tsx:98-101): a
            // popover/dialog's own dismissable-layer Escape handler listens
            // on the same bubble path — without this, Escape here closed
            // the WHOLE popup instead of just cancelling the rename.
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={commit}
      />
      <span id={helpId} className="text-muted-foreground data-[error=true]:text-destructive text-xs" data-error={error ? "true" : undefined}>
        {error ?? "Press Enter to rename, Escape to cancel"}
      </span>
    </div>
  );
}
