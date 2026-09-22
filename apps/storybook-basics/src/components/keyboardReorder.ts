// src/components/keyboardReorder.ts — the IDE "move line" hotkey, applied
// to the thing a single-line editor is editing rather than to a line of
// text: while a port's label (`portEdge.tsx`) or a stacked member's title
// (`blockMembers.tsx`) is being edited, one chord moves THAT item one slot
// along its container. Pure key matching plus the focus hand-back; the
// reorder itself stays each container's own drag operation, so a keyboard
// move and a pointer drag produce the same list (see the two call sites).
//
// Zach, 2026-09-21: "Support for IDE hotkeys to reorder in single line edit
// mode on port edge and on member stack ... ctrl up or down (for a column)
// or (ctrl left right) for a row" and "If you are editing their title and
// you do the ide hot keys then it should change its order in that stack."
//
// Ours, ad hoc — no algorithm to cite; the chord vocabulary is the one VS
// Code and CodeMirror already ship (`moveLineUp`/`moveLineDown` on
// Alt+↑/↓, `@codemirror/commands`' `defaultKeymap`).
import { EditorView } from "@codemirror/view";

/**
 * Which modifier drives the move. `"ctrl"` is Zach's literal spec; `"alt"`
 * is the VS Code / CodeMirror move-line convention, which leaves Ctrl+arrows
 * as word-jump everywhere. A taste call, so both ship and the stories carry
 * a live switch between them.
 */
export type ReorderChord = "ctrl" | "alt";

export type ReorderAxis = "row" | "column";

type ChordEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/**
 * -1 (toward the start), +1 (toward the end), or `null` when the key is not
 * this axis's reorder chord and must fall through to the editor untouched.
 *
 * WHY only the axis-matched pair: Ctrl+←/→ is word-jump in every text
 * editor, so taking it only where it IS the reorder axis (a row) keeps it
 * working everywhere else — on a column, Ctrl+←/→ still moves the caret by
 * a word, and on a row Ctrl+↑/↓ still reaches the editor.
 *
 * Exact modifiers, no extras: Shift is selection-extend and Meta is the Mac
 * line/document jump, so a chord carrying either is somebody else's key.
 */
export function reorderDeltaForKey(event: ChordEvent, axis: ReorderAxis, chord: ReorderChord): -1 | 1 | null {
  if (event.shiftKey || event.metaKey) return null;
  const chordHeld = chord === "ctrl" ? event.ctrlKey && !event.altKey : event.altKey && !event.ctrlKey;
  if (!chordHeld) return null;
  const [back, forward] = axis === "column" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (event.key === back) return -1;
  if (event.key === forward) return 1;
  return null;
}

/** The discoverability hint an open editor shows, e.g. `Ctrl ↑↓ reorder`. */
export function reorderHintText(axis: ReorderAxis, chord: ReorderChord): string {
  return `${chord === "ctrl" ? "Ctrl" : "Alt"} ${axis === "column" ? "↑↓" : "←→"} reorder`;
}

/**
 * Whether `target` is a SINGLE-line text editor the chord may act from — a
 * `CodeEditor` in one-line mode or an `EditableText` single-line `<input>`.
 * A multi-line editor owns Alt/Ctrl+↑/↓ itself (CodeMirror's move-line), so
 * it is never a reorder source.
 */
export function isSingleLineTextEditor(target: Element): boolean {
  if (target instanceof HTMLInputElement) return target.closest('[data-slot="editable-text-input"]') === target;
  return target.closest('[data-slot="code-editor"]')?.getAttribute("data-multiline") === "false";
}

/**
 * Snapshot the focused editor's caret now, and return a function that puts
 * focus and caret back after the container re-renders in its new order.
 *
 * WHY this exists — a GUARD, and honest about it: React reorders keyed
 * siblings by moving DOM nodes (`insertBefore`), and the DOM spec's removal
 * steps drop focus from a moved node. MEASURED 2026-09-22 in Chromium
 * (vitest-playwright, both "Keyboard reorder" stories): focus and caret
 * survived every move WITHOUT this — a mutation replacing it with a no-op
 * stayed green. It is kept because an engine that does follow the removal
 * steps would silently strand the caret on `<body>` with the editor still
 * mounted, and the restore no-ops whenever focus survived. For a CodeMirror
 * view the selection is re-dispatched from the snapshot, not the DOM.
 */
export function captureEditingFocus(target: EventTarget | null): () => void {
  if (!(target instanceof HTMLElement)) return () => {};
  const view = EditorView.findFromDOM(target);
  if (view) {
    const selection = view.state.selection;
    return () => {
      if (!view.dom.isConnected) return;
      if (!view.hasFocus) view.focus();
      if (!view.state.selection.eq(selection)) view.dispatch({ selection });
    };
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, selectionDirection } = target;
    return () => {
      if (!target.isConnected || target.ownerDocument.activeElement === target) return;
      target.focus({ preventScroll: true });
      if (selectionStart !== null && selectionEnd !== null) target.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    };
  }
  return () => {
    if (target.isConnected && target.ownerDocument.activeElement !== target) target.focus({ preventScroll: true });
  };
}
