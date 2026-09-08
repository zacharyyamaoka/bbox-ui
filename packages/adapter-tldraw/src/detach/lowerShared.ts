/**
 * The mechanics both kinds share when they lower: create the primitives,
 * nest the subgroups, group the result, stamp the record, delete the
 * original. What differs per kind — which primitives, which record — stays
 * in the kind files.
 */
import { createShapeId } from "tldraw";
import type { Editor, TLShape, TLShapeId, TLShapePartial } from "tldraw";

import type { LoweredNode } from "./detachableKind";
import {
  DETACH_FORMAT_VERSION,
  detachMeta,
  type DetachedAnchorRecord,
  type DetachedRecord,
} from "./detachModel";

export interface LowerToGroupInput {
  shape: TLShape;
  /** Primitives in paint order; the first is the anchor. */
  shapes: TLShapePartial[];
  anchorKind: DetachedAnchorRecord["kind"];
  /** Shape-id sets to nest as their own stock group (a Block's port rows). */
  nestedRows?: readonly { shapeIds: readonly TLShapeId[] }[];
  /** The record the replacement group remembers the original by. */
  record: DetachedRecord;
}

/**
 * Replace `shape` with its grouped primitives. The primitives are created
 * in the original's parent at the original's local coordinates, so the page
 * pose is unchanged. (Rotation is not carried over: the bbox tools never
 * rotate a shape, and a rotated group of stock primitives could not be
 * unpeeled back into axis-aligned parts.)
 */
export function lowerToGroup(
  editor: Editor,
  input: LowerToGroupInput,
): LoweredNode {
  const { shape } = input;
  const shapes = [...input.shapes];
  // The anchor is marked so a rebuild can find the original's origin inside
  // the group without storing an id — ids are re-minted by copy, paste and
  // duplicate, and `meta` is not.
  shapes[0] = {
    ...shapes[0],
    meta: {
      ...shapes[0].meta,
      ...detachMeta({ kind: input.anchorKind, version: DETACH_FORMAT_VERSION }),
    },
  };
  const shapeIds = shapes.map((partial) => partial.id as TLShapeId);

  editor.createShapes(
    shapes.map((partial) => ({ ...partial, parentId: shape.parentId })),
  );
  editor.deleteShape(shape.id);

  // A subgroup per row: the parts move as one editable unit, and unpeeling
  // the outer group one level lands on sensible units (Zach's "unpeel the
  // groups from the top down until you get to the exact grouping you
  // want"). tldraw deliberately refuses one-child groups, so a row with a
  // single visible part stays that single shape.
  const nestedIds = new Set<TLShapeId>();
  const rowGroupIds: TLShapeId[] = [];
  for (const row of input.nestedRows ?? []) {
    if (row.shapeIds.length <= 1) continue;
    const rowGroupId = createShapeId();
    editor.groupShapes([...row.shapeIds], { groupId: rowGroupId, select: false });
    if (!editor.getShape(rowGroupId)) continue;
    rowGroupIds.push(rowGroupId);
    for (const id of row.shapeIds) nestedIds.add(id);
  }

  const topLevelIds = [
    ...shapeIds.filter((id) => !nestedIds.has(id)),
    ...rowGroupIds,
  ];

  if (topLevelIds.length > 1) {
    const groupId = createShapeId();
    editor.groupShapes(topLevelIds, { groupId, select: false });
    if (editor.getShape(groupId)) {
      editor.updateShape({ id: groupId, type: "group", meta: detachMeta(input.record) });
      return { selectionId: groupId, rootIds: [groupId] };
    }
  }

  // tldraw refuses to group one shape (a bare unlabeled Port lowers to just
  // its ring), so the single primitive carries the full record itself and
  // doubles as its own anchor.
  const soleId = topLevelIds[0];
  const sole = editor.getShape(soleId);
  if (sole) {
    editor.updateShape({ id: soleId, type: sole.type, meta: detachMeta(input.record) });
  }
  return { selectionId: soleId ?? null, rootIds: soleId ? [soleId] : [] };
}
