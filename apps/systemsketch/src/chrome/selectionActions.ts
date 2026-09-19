// src/chrome/selectionActions.ts — what the floating pill can DO to whatever
// is selected, as plain functions over the editor.
//
// EVERYTHING IS A BLOCK (plan §2, Zach's 2026-09-18 ASK). That rule is the
// reason this file is short and has no `kind` switch worth speaking of: the
// pill never creates a node kind, never converts one into another, and never
// grows a "turn this into a loop" row. A Block's three views are the SAME
// shape wearing three faces, so changing one is a props write on the shape
// that is already there — `editor.updateShape`, not a replace.
//
// NEVER MIX DATA AND CONTROL LINES: nothing here makes an edge at all. The
// one edge kind is `ss-wire`, and it is born from a press-drag on a port dot
// (`shapes/wire/wireGesture.ts`), never from a menu.
import type { Editor, TLShape, TLShapeId } from "tldraw";

import type { BlockShape, BlockShapeProps } from "../shapes/block";
import type { CodeLanguage, CodeShape } from "../shapes/code";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE } from "../shapes/types";

/** `ss-block`'s `view`, read off the schema rather than re-spelled here —
 *  `src/shapes/block/index.ts` publishes the props type but not this union,
 *  and a hand-written copy is a second place for the enum to be wrong. */
export type BlockView = BlockShapeProps["view"];

/** The Block's three faces, in the order they grow. Labels are the person's
 *  words, not the schema's — `port` reads as "Ports" in a menu. */
export const BLOCK_VIEWS: readonly { id: BlockView; label: string; hint: string }[] = [
  { id: "simple", label: "Simple", hint: "Name only" },
  { id: "port", label: "Ports", hint: "Name plus its port rails" },
  { id: "expanded", label: "Expanded", hint: "A frame its members live inside" },
];

/** `ss-code`'s four-value `language` enum (plan §3), spelled for a menu. */
export const CODE_LANGUAGES: readonly { id: CodeLanguage; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "plaintext", label: "Plain text" },
];

/** Everything the pill needs to decide which rows to render, read once. */
export interface SelectionSubject {
  ids: TLShapeId[];
  /** The one selected shape, when exactly one is selected — otherwise null.
   *  A per-kind control over a mixed selection would have to pick a winner,
   *  and the honest answer is that there isn't one. */
  only: TLShape | null;
  /** The selected Block's current view, when the selection IS one Block. */
  blockView: BlockView | null;
  /** The selected Code cell's language, same rule. */
  codeLanguage: CodeLanguage | null;
}

export function selectionSubjectOf(editor: Editor): SelectionSubject {
  const ids = editor.getSelectedShapeIds();
  const shapes = editor.getSelectedShapes();
  const only = shapes.length === 1 ? shapes[0] : null;
  return {
    ids,
    only,
    blockView: only && only.type === BLOCK_SHAPE_TYPE ? (only as BlockShape).props.view : null,
    codeLanguage: only && only.type === CODE_SHAPE_TYPE ? (only as CodeShape).props.language : null,
  };
}

/** Switch the selected Block's face. Same shape, different view. */
export function setBlockView(editor: Editor, id: TLShapeId, view: BlockView): void {
  editor.updateShape<BlockShape>({ id, type: BLOCK_SHAPE_TYPE, props: { view } });
}

/** Switch the selected Code cell's language. */
export function setCodeLanguage(editor: Editor, id: TLShapeId, language: CodeLanguage): void {
  editor.updateShape<CodeShape>({ id, type: CODE_SHAPE_TYPE, props: { language } });
}

/** Offset of a duplicate from its original, in page units. Small enough to
 *  read as "a copy of that", big enough that the copy is grabbable. */
const DUPLICATE_OFFSET = { x: 24, y: 24 };

export function duplicateSelection(editor: Editor): void {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return;
  // tldraw's own duplicate: it re-mints ids, copies children, and selects the
  // copies. Rewriting that here would be a second, worse implementation of
  // something the engine already owns.
  editor.duplicateShapes(ids, DUPLICATE_OFFSET);
}

export function deleteSelection(editor: Editor): void {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return;
  editor.deleteShapes(ids);
}
