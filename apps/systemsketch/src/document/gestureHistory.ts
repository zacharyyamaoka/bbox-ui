// src/document/gestureHistory.ts — P-014: one editing gesture is one undo step.
//
// THE MECHANISM, because the fix looks like it is missing something and is
// not. tldraw's `HistoryManager` pushes an undo entry only when a MARK is
// made: `_mark` flushes the accumulated `pendingDiff` onto the undo stack and
// then records the stopping point, and `getNumUndos()` counts the pending
// diff as at most one (`@tldraw/editor`, HistoryManager.ts:66-80). So every
// store write since the last mark is already ONE undo step — nothing needs
// squashing, and `editor.squashToMark` is not the tool here.
//
// Which means the whole bug is WHERE the mark goes, and there are exactly two
// ways to get it wrong. Both shipped in this app and both were measured in
// real Chromium on 2026-09-21 (`src/undoGranularity.smoke.test.tsx`):
//
//   mark per keystroke  — `markHistoryStoppingPoint` inside the per-character
//                         `onChange`. Renaming a block to "detect" took SIX
//                         Ctrl+Z to undo, and the first five left the board
//                         reading "detec", "dete", … — the item's own
//                         wording, "one Ctrl+Z leaves the board half-changed".
//   no mark at all      — a discrete write with no stopping point in front of
//                         it merges into whatever store transaction came
//                         before. Picking a glyph on a freshly placed block
//                         and pressing Ctrl+Z DELETED THE BLOCK.
//
// This module is the first case's fix: a latch that lets a run of writes
// share one mark. The second case needs no machinery — a discrete write marks
// unconditionally, right where it happens.
//
// WHY a latch rather than a `beginEdit` hook on every text control, which is
// what `CodeEditor` already publishes and what `shapes/code/CodeFace.tsx` and
// `shapes/port/PortFace.tsx` use (and why those two were the green controls
// in the measurement): the two surfaces fixed with this — `EditableText` and
// `PortEdge`'s rail labels — publish no begin hook, and both live in the
// TRUNK. Adding one is a trunk change to components another lane is inside;
// this is the host-side equivalent, and `FieldGesture.ensureBegun`
// (`@trunk/components/codeEditorGesture.ts:113-119`) is the same three lines.
import type { Editor } from "tldraw";

/**
 * A gesture's claim on the undo stack.
 *
 * `begin` is idempotent WITHIN a gesture and only within one: the first call
 * for a given `gesture` key marks, every later call with the same key does
 * nothing, and a call with a DIFFERENT key starts a new entry. So the key is
 * the gesture's identity, and choosing it is the whole design decision at
 * each call site — see the two shapes in use:
 *
 *   a session that MOUNTS and UNMOUNTS (the block title, the description):
 *     the latch lives in the control, which React remounts per session, so
 *     the key is a constant and the remount IS the boundary.
 *   a run with no session object (a rail label): the latch lives in the face
 *     and the key names what is being typed into
 *     (`railGestureKey`), so moving to another port — or doing anything that
 *     is not typing — ends the entry.
 */
export interface GestureMark {
  /** Mark the undo stack once for this gesture. `name` is tldraw's debug
   *  label for the mark and defaults to the key. */
  begin(editor: Editor, gesture: string, name?: string): void;
  /** Forget the open gesture, so the next `begin` marks even if it repeats
   *  the same key. Called by a discrete edit that interrupts a typing run. */
  end(): void;
}

export function createGestureMark(): GestureMark {
  let open: string | null = null;
  return {
    begin(editor, gesture, name) {
      if (open === gesture) return;
      open = gesture;
      editor.markHistoryStoppingPoint(name ?? gesture);
    },
    end() {
      open = null;
    },
  };
}
