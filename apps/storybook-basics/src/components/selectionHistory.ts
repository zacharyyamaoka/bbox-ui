// src/components/selectionHistory.ts — the pure journal behind the mouse's
// back and forward buttons (parity item P-029).
//
// Zach, 2026-09-11: "bind the forward and back buttons on my mouse to be able
// to undo the tree navigation on the breadcrumb — if I click in, pressing back
// should take me to the previous layer."
//
// PRIOR ART, and what this keeps from it: `apps/docs/src/components/create/
// selection-history.ts` already does this for the docs playground, as a React
// hook over `useRef`s. It is not imported here — a hook with three `document`
// listeners in it is not something a tldraw host can reuse, and the docs app is
// a consumer of this trunk, not a source for it. What travels is its two
// MEASURED facts, both cited at the seam that uses them:
//   - only `mouseup` in the capture phase cancels Chrome's own side-button
//     navigation (measured in real Chrome, SystemSketch 2026-09-06) — so the
//     gesture must be swallowed there, in every state, even at the ends of the
//     journal, or the browser leaves the page;
//   - a new landing truncates the forward entries, exactly like a browser.
//
// WHY it lives in `components/` and is pure: same shape as `cameraGestures.ts`
// and `commandModel.ts` — a policy model a HOST installs, with no React, no
// engine and no listener of its own, so the rule can be tested in node in
// milliseconds and the host is left with only the wiring. It is deliberately
// not in `scene/`: a journal of what was selected is not a fact about what the
// scene CONTAINS, and `scene/` is "every pure function over the model".

/** What was selected, oldest first, and where in it we are standing. */
export interface SelectionJournal {
  entries: ReadonlyArray<readonly string[]>;
  /** Index into `entries`; `-1` when nothing has been recorded yet. */
  index: number;
}

export const EMPTY_SELECTION_JOURNAL: SelectionJournal = { entries: [], index: -1 };

/**
 * Order-independent identity for a selection.
 *
 * WHY sorted: tldraw hands back selected ids in the board's own z-order, which
 * changes when a shape is brought to front — so the same two shapes can arrive
 * in two orders with nothing about the SELECTION having changed. Comparing the
 * raw arrays would file that as a new landing and fill the journal with
 * duplicates of where the user already is.
 */
export function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

/**
 * Record a landing, unless it is the one we are already standing on.
 *
 * WHY an EMPTY selection is never recorded: clicking bare canvas deselects, and
 * that happens constantly — between every two real landings, usually. Recording
 * it would mean every Back press lands on "nothing selected" before it reached
 * the previous layer, which is the opposite of the ask. Nothing is the ABSENCE
 * of a landing, not a landing.
 */
export function recordSelection(journal: SelectionJournal, ids: readonly string[]): SelectionJournal {
  if (ids.length === 0) return journal;
  const current = journal.entries[journal.index];
  if (current && selectionKey(current) === selectionKey(ids)) return journal;
  // A new landing truncates any forward entries, like a browser.
  return { entries: [...journal.entries.slice(0, journal.index + 1), [...ids]], index: journal.index + 1 };
}

export interface SelectionStep {
  journal: SelectionJournal;
  /** The ids to select. Never empty — a step that would land on nothing is
   *  skipped over rather than applied. */
  selection: readonly string[];
}

/**
 * Walk one entry in `delta`'s direction, skipping entries nothing survives in.
 *
 * `isAlive` is the host's answer to "does this id still name a shape?" — passed
 * in rather than looked up, so this stays a node test. Deleted shapes are the
 * common case, not the exotic one (draw, select, delete, press Back), and an
 * entry whose every shape is gone is not somewhere the user can be returned to.
 * Walking PAST it is what makes the second Back press do what the first one was
 * asked to do; stopping there would strand the journal on a dead entry.
 *
 * Returns `null` when there is nothing left in that direction — the host still
 * swallows the gesture, it just has nowhere to go.
 */
export function stepSelection(
  journal: SelectionJournal,
  delta: -1 | 1,
  isAlive: (id: string) => boolean = () => true,
): SelectionStep | null {
  for (let next = journal.index + delta; next >= 0 && next < journal.entries.length; next += delta) {
    const selection = journal.entries[next].filter(isAlive);
    if (selection.length === 0) continue;
    // WHY the surviving half is written BACK into the entry rather than just
    // returned: the host applies `selection` and then records whatever the
    // editor reports as selected. If the entry still named the deleted ids, the
    // two would not match and the host's own write would be filed as a NEW
    // landing — every Back press appending an entry, forward navigation gone.
    const entries = journal.entries.map((entry, at) => (at === next ? selection : entry));
    return { journal: { entries, index: next }, selection };
  }
  return null;
}

/** Chrome's own numbering for the two side buttons (`MouseEvent.button`). */
export const MOUSE_BACK_BUTTON = 3;
export const MOUSE_FORWARD_BUTTON = 4;

/**
 * Which way a mouse event asks the journal to walk, or `null` for every other
 * button. Takes the `button` number alone so a host can call it from
 * `pointerdown`, `mouseup` or `auxclick` with the same rule.
 */
export function selectionHistoryStep(button: number): -1 | 1 | null {
  if (button === MOUSE_BACK_BUTTON) return -1;
  if (button === MOUSE_FORWARD_BUTTON) return 1;
  return null;
}

/**
 * The same question for a keyboard: some keyboards and remappers send the side
 * buttons as `BrowserBack`/`GoBack` keys rather than as mouse buttons. Ported
 * from the docs playground's copy, which already handles both spellings.
 */
export function selectionHistoryKeyStep(key: string): -1 | 1 | null {
  if (key === "BrowserBack" || key === "GoBack") return -1;
  if (key === "BrowserForward" || key === "GoForward") return 1;
  return null;
}
