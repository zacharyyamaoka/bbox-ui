// src/document/selectionHistory.ts — the HOST half of parity item P-029,
// "mouse back/forward buttons walk the selection history".
//
// Zach, 2026-09-11: "bind the forward and back buttons on my mouse to be able
// to undo the tree navigation on the breadcrumb — if I click in, pressing back
// should take me to the previous layer."
//
// The journal's rules are `@trunk/components/selectionHistory` and are pure.
// This file is only the three things a pure model cannot do: watch the live
// selection, take the browser's side buttons away from the browser, and put a
// remembered selection back on the board.
//
// WHY an `install(editor)` returning a stop rather than a React hook: it is
// this app's own seam for anything that touches the editor imperatively —
// `App.tsx`'s `handleMount` already composes `kit.install(editor)`,
// `installArrowPresets(editor)` and `installCameraGestures(editor)` exactly
// this way — and it keeps a window listener out of the render path.
import { react, type Editor, type TLShapeId } from "tldraw";

import {
  EMPTY_SELECTION_JOURNAL,
  recordSelection,
  selectionHistoryKeyStep,
  selectionHistoryStep,
  stepSelection,
  type SelectionJournal,
} from "@trunk/editor/selectionHistory";

/** Where the side button must NOT be hijacked: a field that may implement its
 *  own back/forward. Ported from the docs playground's copy of this gesture
 *  (apps/docs/src/components/create/selection-history.ts), which guards the
 *  same way. */
const TYPING = "input, textarea, select, [contenteditable]";

function overATextField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) != null;
}

export function installSelectionHistory(editor: Editor): () => void {
  let journal: SelectionJournal = EMPTY_SELECTION_JOURNAL;

  /**
   * Every landing the board makes, from wherever it came — a canvas click, a
   * marquee, the inspector, a menu action. Reading the EDITOR's own selection
   * rather than listening to the gestures is what makes that "wherever"
   * true without this file knowing about any of them.
   *
   * WHY there is no `replaying` flag here, unlike the docs playground's copy:
   * walking the journal moves `journal.index` BEFORE it writes the selection,
   * and `recordSelection` ignores a selection equal to the entry it is standing
   * on — so the write this file makes itself is already a no-op by the time it
   * arrives back. A flag would have to survive the gap between the write and
   * the reaction, and a selection that does not actually change (stepping to an
   * entry that is already selected) never fires one, leaving the flag set and
   * the NEXT real landing swallowed.
   */
  const stopWatching = react("ss selection history", () => {
    journal = recordSelection(journal, editor.getSelectedShapeIds().map(String));
  });

  const walk = (delta: -1 | 1) => {
    const step = stepSelection(journal, delta, (id) => editor.getShape(id as TLShapeId) != null);
    if (!step) return;
    journal = step.journal;
    // A remembered shape may live on a page the user has since left, and
    // `setSelectedShapes` only speaks about the current page. Going there
    // first is what makes Back mean "where I was", not "nothing happened".
    const page = editor.getAncestorPageId(step.selection[0] as TLShapeId);
    if (page && page !== editor.getCurrentPageId()) editor.setCurrentPage(page);
    editor.setSelectedShapes(step.selection.map((id) => id as TLShapeId));
  };

  /**
   * WHY the gesture is swallowed on `mouseup`, in the capture phase, and
   * UNCONDITIONALLY once it is one of the two side buttons — including when the
   * journal has nowhere to go: measured in real Chrome (SystemSketch,
   * 2026-09-06, recorded in the docs playground's copy) only `mouseup` cancels
   * the browser's own side-button navigation; `pointerdown`, `mousedown` and
   * `auxclick` all fire with the default already committed. So a press at
   * either end of the journal that is not swallowed takes Chrome off the page
   * and the unsaved board with it.
   */
  const swallow = (event: MouseEvent) => {
    if (selectionHistoryStep(event.button) !== null) event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent) => {
    const delta = selectionHistoryStep(event.button);
    if (delta === null || overATextField(event.target)) return;
    walk(delta);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = selectionHistoryKeyStep(event.key);
    if (delta === null) return;
    event.preventDefault();
    walk(delta);
  };

  window.addEventListener("mouseup", swallow, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    stopWatching();
    window.removeEventListener("mouseup", swallow, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
