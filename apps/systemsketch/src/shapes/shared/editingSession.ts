// src/shapes/shared/editingSession.ts — leaving tldraw's editing session.
//
// ONE line of knowledge, and it is not obvious, which is why it has a file of
// its own rather than being retyped at each face. Lifted verbatim (reasoning
// included) from the note `shapes/port/PortFace.tsx` carries at its own
// private copy; that copy is OWED a move here the next time the file is free
// of a peer lane's in-flight edit.
import type { Editor } from "tldraw";

/**
 * Leave the rename/edit session a face opened.
 *
 * WHY `complete()` and not `setEditingShape(null)` alone (which is all
 * tldraw's own frame label does, FrameLabelInput.mjs:26-32): clearing the id
 * leaves the select tool parked in its `editing_shape` child state, and that
 * state's own pointer handler reads `getEditingShape()` back and throws
 * "Expected an editing shape!" when it is null
 * (SelectTool/childStates/EditingShape.mjs:100-103) — one press on any shape
 * afterwards. `complete()` is the stock exit the text shapes use
 * (`useEditablePlainText.mjs:46`): it transitions the tool to `idle`, whose
 * `onExit` clears the editing id anyway.
 */
export function stopEditing(editor: Editor): void {
  editor.setEditingShape(null);
  editor.complete();
}
