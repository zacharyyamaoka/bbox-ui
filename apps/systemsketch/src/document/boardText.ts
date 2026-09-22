// src/document/boardText.ts — the HOST half of board Find and Replace
// (parity item P-024, "Ctrl+F opens board Find and Replace").
//
// `@trunk/components/boardSearch` owns the matching, the ordering-preservation,
// the snippet and the range arithmetic, and it is engine-free by rule. Its own
// header names exactly what it left for a host, and this file is that list,
// answered for tldraw:
//
//   "which shapes exist"      → `editor.getPages()` + a depth-first walk of
//                               `getSortedChildIdsForParent`
//   "what order they read in" → that walk IS the order. See the WHY below.
//   "whether one is hidden or
//    locked"                  → `editor.isShapeHidden` / `shape.isLocked`
//                               become a `replaceBlocker`, not an omission.
//   "how to write a new value
//    back"                    → `applyBoardTextUpdates`, one editor batch.
//
// The projection is deliberately NOT `sceneFromStore.ts`'s. That one is lossy
// on purpose and drops everything that is not a node or a wire — a frame's
// name, a stock text shape, the reading order — and Find has to see the whole
// board, including the parts the scene kit has no opinion about.
import type { Editor, TLPageId, TLShape, TLShapeId } from "tldraw";

import type {
  SearchableText,
  TextSearchMatch,
  TextSourceUpdate,
} from "@trunk/editor/boardSearch";

import {
  BLOCK_SHAPE_TYPE,
  CODE_SHAPE_TYPE,
  PORT_SHAPE_TYPE,
  REGION_SHAPE_TYPE,
} from "../shapes/types";

/** What a match carries back so the host can reveal it or write into it. */
export interface BoardTextMeta {
  shapeId: string;
  pageId: string;
  /** The single shape prop this text IS. A write-back sets exactly this one. */
  prop: string;
}

/** One searchable string on one shape, before a page or an id is attached. */
export interface BoardTextField {
  /** What this text is, for the result row. */
  field: string;
  /** The shape prop that stores it. */
  prop: string;
  text: string;
  /** Set when the text can be read but must not be written. */
  replaceBlocker?: string;
}

/** The donor's own words for the refusal, so the reason in the UI is the
 *  reason in the code. */
export const RICH_TEXT_BLOCKER = "Rich text — Replace is not supported here yet";
export const LOCKED_BLOCKER = "This shape is locked";

/**
 * Every searchable string one shape carries — pure, so it is a node test.
 *
 * `stockText` is what the shape's own `ShapeUtil.getText()` answered, passed
 * in rather than looked up, because a `ShapeUtil` is an engine object and this
 * function is the half that has to stay testable without one.
 *
 * WHY the app's four shapes are enumerated by hand instead of going through
 * `getText()` for everything: `getText()` is a DISPLAY string — tldraw's own
 * geo util returns the label, its arrow util returns the arrow's text — and
 * there is no inverse. Replace needs to know WHICH PROP the string came out
 * of, so it can put one back. For our own shapes that prop is known and plain
 * (`name`, `declaration`, `code`), which is precisely why those are the ones
 * this app can offer Replace on at all; for a stock shape whose text lives in
 * a ProseMirror document it is not, and the honest answer is a blocker, not a
 * silent omission from the results.
 */
export function boardTextFieldsOf(
  shape: { type: string; props: Record<string, unknown> },
  stockText?: string,
): BoardTextField[] {
  const text = (key: string): string => String(shape.props[key] ?? "");
  switch (shape.type) {
    case BLOCK_SHAPE_TYPE:
      return field("Block name", "name", text("name"));
    case REGION_SHAPE_TYPE:
      return field("Region name", "name", text("name"));
    case PORT_SHAPE_TYPE:
      // The whole declaration line, verbatim — the same string
      // `sceneFromStore.ts` carries whole "so a write-back cannot re-space it".
      return field("Port", "declaration", text("declaration"));
    case CODE_SHAPE_TYPE:
      return field("Code", "code", text("code"));
    case "frame":
      // Stock, but its name is a plain `string` prop (TLFrameShapeProps), so
      // it round-trips through Replace like ours do.
      return field("Frame name", "name", text("name"));
    default:
      return stockText
        ? [{ field: "Text", prop: "", text: stockText, replaceBlocker: RICH_TEXT_BLOCKER }]
        : [];
  }
}

function field(label: string, prop: string, text: string): BoardTextField[] {
  return text ? [{ field: label, prop, text }] : [];
}

/**
 * Every string on the board, page by page, in reading order.
 *
 * WHY a depth-first walk of `getSortedChildIdsForParent` rather than sorting
 * shapes by their fractional index: `boardSearch.ts`'s own header records the
 * bug — an index orders SIBLINGS ONLY, so comparing two raw indices out of a
 * flat page set compares numbers that were never on the same scale, and a
 * frame's children sort above the frame they sit inside. Descending the tree
 * never leaves the scale it is comparing on, so the bug cannot occur; that is
 * the same fix the donor reached by building an ancestor path per shape, and
 * it is why the trunk module keeps the host's order verbatim.
 */
export function boardTextSources(editor: Editor): SearchableText<BoardTextMeta>[] {
  const sources: SearchableText<BoardTextMeta>[] = [];

  for (const page of editor.getPages()) {
    const visit = (parent: TLPageId | TLShapeId) => {
      for (const childId of editor.getSortedChildIdsForParent(parent)) {
        const shape = editor.getShape(childId);
        if (!shape) continue;
        for (const found of boardTextFieldsOf(shape as unknown as { type: string; props: Record<string, unknown> }, stockTextOf(editor, shape))) {
          sources.push({
            sourceId: shape.id,
            group: page.name,
            field: found.field,
            text: found.text,
            replaceBlocker: found.replaceBlocker ?? (shape.isLocked ? LOCKED_BLOCKER : undefined),
            meta: { shapeId: shape.id, pageId: page.id, prop: found.prop },
          });
        }
        visit(childId);
      }
    };
    visit(page.id);
  }

  return sources;
}

/** A stock shape's own display text, or `undefined` when it has none. */
function stockTextOf(editor: Editor, shape: TLShape): string | undefined {
  try {
    return editor.getShapeUtil(shape).getText?.(shape) || undefined;
  } catch {
    // A util that throws on a shape it does not recognise must not take the
    // whole search down with it — the rest of the board is still searchable.
    return undefined;
  }
}

/**
 * Write every update back, in ONE editor batch.
 *
 * WHY one batch: `@trunk/scene/history.ts`'s first clause — one gesture, one
 * undo step. "Replace all" is one gesture, so a Ctrl+Z after it must put the
 * whole board back, not the last shape it happened to touch.
 */
export function applyBoardTextUpdates(
  editor: Editor,
  updates: readonly TextSourceUpdate<BoardTextMeta>[],
): void {
  const writable = updates.filter((update) => update.meta?.prop);
  if (writable.length === 0) return;
  // WHY the stopping point and not just the batch: `editor.run` groups these
  // writes into one transaction, but tldraw COALESCES consecutive transactions
  // into one undo entry until something marks a boundary. Without the mark, a
  // Ctrl+Z after Replace All rolls back whatever the user did immediately
  // before it as well — measured in `src/boardFind.smoke.test.tsx`, where one
  // undo deleted the fixture blocks outright instead of restoring their names.
  editor.markHistoryStoppingPoint("board find: replace");
  editor.run(() => {
    for (const update of writable) {
      const shape = editor.getShape(update.meta!.shapeId as TLShapeId);
      if (!shape || shape.isLocked) continue;
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { [update.meta!.prop]: update.text },
      });
    }
  });
}

/**
 * Put the match on screen: its page, then its shape, selected and framed.
 *
 * WHY `zoomToSelection` and not a camera write of our own: the camera is the
 * host's, and tldraw's own method already honours the user's zoom limits and
 * the reduce-motion preference. The archive did the same thing by hand and
 * had to keep two copies of those rules.
 */
export function revealBoardTextMatch(editor: Editor, match: TextSearchMatch<BoardTextMeta>): void {
  const meta = match.meta;
  if (!meta) return;
  if (editor.getCurrentPageId() !== meta.pageId) editor.setCurrentPage(meta.pageId as TLPageId);
  const shape = editor.getShape(meta.shapeId as TLShapeId);
  if (!shape) return;
  editor.select(shape.id);
  editor.zoomToSelection();
}
