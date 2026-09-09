/**
 * The way back: put a Port or Block back from what its group remembers.
 *
 * A detach you cannot undo is a one-way door, so the record in `meta` is
 * read back into a real `bbox-port` / `bbox-block`:
 *
 *   props    come from the record, verbatim — semantics never re-derived
 *            from the picture
 *   position comes from where the marked anchor primitive is NOW, so a
 *            group the user moved rebuilds where they left it
 *
 * WHY position-from-anchor rather than group bounds: a port label hangs
 * outside the shape's own geometry, so the group's bounds do not start
 * where the shape's origin did — bounds-derived x/y (or w/h) would drift
 * the rebuilt shape on every round trip.
 *
 * Ungrouping is still the rest of the way out: Ctrl+Shift+G discards the
 * group and its `meta` with it, which is the honest meaning of taking the
 * thing apart by hand.
 */
import { createShapeId } from "tldraw";
import type { Editor, TLShapeId } from "tldraw";

import { rekeyReceivedPorts } from "../block-shape-util";
import {
  isDetachedAnchor,
  readRebuildableRecord,
} from "./detachModel";

export interface RebuildResult {
  createdIds: TLShapeId[];
}

/**
 * Shapes in the selection that remember a Port or Block, nested ones
 * included (selecting a stock group around two detached Blocks rebuilds
 * both).
 */
export function selectedRebuildableIds(editor: Editor): TLShapeId[] {
  const found: TLShapeId[] = [];
  const visit = (ids: readonly TLShapeId[]) => {
    for (const id of ids) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      if (readRebuildableRecord(shape.meta)) {
        // A remembered group's children are its own primitives; nothing
        // deeper speaks for a second shape.
        found.push(id);
        continue;
      }
      visit(editor.getSortedChildIdsForParent(id));
    }
  };
  visit(editor.getSelectedShapeIds());
  return [...new Set(found)];
}

function anchorIdWithin(editor: Editor, groupId: TLShapeId): TLShapeId | null {
  // Depth-first: a Block's card sits directly in the group, but a Port that
  // lowered to a single ring inside someone else's grouping could nest.
  for (const id of editor.getSortedChildIdsForParent(groupId)) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    if (isDetachedAnchor(shape.meta)) return id;
    const nested = anchorIdWithin(editor, id);
    if (nested) return nested;
  }
  return null;
}

/** Rebuild every remembered shape in the selection. */
export function rebuildDetachedShapes(editor: Editor): RebuildResult {
  const carrierIds = selectedRebuildableIds(editor);
  if (carrierIds.length === 0) return { createdIds: [] };

  if (editor.getCurrentToolId() !== "select") editor.setCurrentTool("select");
  editor.markHistoryStoppingPoint("rebuild from primitives");

  const createdIds: TLShapeId[] = [];
  editor.run(() => {
    for (const carrierId of carrierIds) {
      const carrier = editor.getShape(carrierId);
      const record = carrier ? readRebuildableRecord(carrier.meta) : null;
      if (!carrier || !record) continue;

      // A single-primitive fallback carries the record itself and is its
      // own anchor.
      const anchorId = anchorIdWithin(editor, carrierId) ?? carrierId;
      const anchorTransform = editor.getShapePageTransform(anchorId);
      const anchorPagePoint = anchorTransform.applyToPoint({ x: 0, y: 0 });
      const local = editor.getPointInParentSpace(carrierId, anchorPagePoint);
      // The anchor primitive carried the original's rotation through the
      // detach (see lowerToGroup), and any rotation the user gave the
      // detached group composes into its page transform — so the anchor's
      // page rotation, re-expressed in the parent's frame, is the rotation
      // the rebuilt shape stands at.
      const rotation =
        anchorTransform.rotation() -
        editor.getShapeParentTransform(carrierId).rotation();

      const shapeId = createShapeId();
      editor.createShape({
        id: shapeId,
        type: record.kind === "port" ? "bbox-port" : "bbox-block",
        parentId: carrier.parentId,
        x: local.x,
        y: local.y,
        rotation,
        props: record.props,
      });
      // Hand the runtime `received` flags from the carrier to the minted id
      // (in memory only) so a port that is receiving right now stays lit.
      rekeyReceivedPorts(editor, carrierId, shapeId);
      editor.deleteShape(carrierId);
      createdIds.push(shapeId);
    }
    if (createdIds.length > 0) editor.setSelectedShapes(createdIds);
  });

  return { createdIds };
}
