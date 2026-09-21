/**
 * src/hosts/detach/lowerShared.ts — the mechanics every kind shares when it
 * lowers: create the primitives, nest per-port subgroups, group the result,
 * stamp the record, delete the original `bbox-node` shape.
 *
 * DONOR: packages/adapter-tldraw/src/hosts/detach/lowerShared.ts (read in full,
 * 2026-09-18) — `lowerToGroup`'s structure, the rotation-carrying math, the
 * "tldraw refuses one-child groups" fallback, and the per-row nested-group
 * device are ported near-verbatim.
 *
 * OMITTED from the donor: `rekeyReceivedPorts` (the donor's runtime-only
 * "lit right now" flag, tied to its own `BBoxPortShape`/`BBoxBlockShape`
 * types). This app's `PortState` union also has a `received` member
 * (`../components/port.tsx`), but nothing in the current host/scene wiring
 * (`../hosts/nodeViews.tsx`, `../scene/sceneWires.ts`) computes or threads a
 * live "receiving right now" flag the way the donor's adapter did — so there
 * is nothing to carry across a detach/rebuild round trip here. If that flag
 * lands later, this is the seam to extend, mirroring the donor's own device.
 */
import { createShapeId } from "tldraw";
import type { Editor, TLShape, TLShapeId, TLShapePartial } from "tldraw";

import { DETACH_FORMAT_VERSION, detachMeta, type DetachedAnchorRecord, type DetachedRecord } from "./detachModel";
import type { LoweredNode } from "./detachableKind";

export interface LowerToGroupInput {
  shape: TLShape;
  /** Primitives in paint order; the first is the anchor. */
  shapes: TLShapePartial[];
  anchorKind: DetachedAnchorRecord["kind"];
  /** Shape-id sets to nest as their own stock group (a Block's port rows). */
  nestedRows?: readonly { shapeIds: readonly TLShapeId[] }[];
  record: DetachedRecord;
}

/**
 * Replace `shape` with its grouped primitives. Created in the original's
 * parent at the original's local coordinates, so the page pose is
 * unchanged. A rotated original rotates every primitive with it — donor's
 * own math (`lowerShared.ts:49-62`): the kind builders lay parts out
 * unrotated in the parent frame (origin = shape.x/y); tldraw's shape
 * transform is translate(x, y) then rotate, so a part at local offset
 * (dx, dy) lands at origin + R·(dx, dy) with the shape's own rotation
 * applied to itself.
 */
export function lowerToGroup(editor: Editor, input: LowerToGroupInput): LoweredNode {
  const { shape } = input;
  let shapes = [...input.shapes];

  if (shape.rotation !== 0) {
    const cos = Math.cos(shape.rotation);
    const sin = Math.sin(shape.rotation);
    shapes = shapes.map((partial) => {
      const dx = (partial.x ?? 0) - shape.x;
      const dy = (partial.y ?? 0) - shape.y;
      return {
        ...partial,
        x: shape.x + dx * cos - dy * sin,
        y: shape.y + dx * sin + dy * cos,
        rotation: shape.rotation,
      };
    });
  }
  // The anchor is marked so a rebuild can find the original's origin inside
  // the group without storing an id — ids are re-minted by copy, paste and
  // duplicate, and `meta` is not.
  shapes[0] = {
    ...shapes[0],
    meta: { ...shapes[0].meta, ...detachMeta({ kind: input.anchorKind, version: DETACH_FORMAT_VERSION }) },
  };
  const shapeIds = shapes.map((partial) => partial.id as TLShapeId);

  editor.createShapes(shapes.map((partial) => ({ ...partial, parentId: shape.parentId })));

  const replaceOriginal = (carrierId: TLShapeId) => {
    editor.deleteShape(shape.id);
    void carrierId;
  };

  // A subgroup per row: the parts move as one editable unit — Zach's
  // "unpeel the groups from the top down until you get to the exact
  // grouping you want." tldraw refuses a one-child group, so a row with a
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

  const topLevelIds = [...shapeIds.filter((id) => !nestedIds.has(id)), ...rowGroupIds];

  if (topLevelIds.length > 1) {
    const groupId = createShapeId();
    editor.groupShapes(topLevelIds, { groupId, select: false });
    if (editor.getShape(groupId)) {
      editor.updateShape({ id: groupId, type: "group", meta: detachMeta(input.record) });
      replaceOriginal(groupId);
      return { selectionId: groupId, rootIds: [groupId] };
    }
  }

  // tldraw refuses to group one shape — the single primitive carries the
  // full record itself and doubles as its own anchor.
  const soleId = topLevelIds[0];
  const sole = editor.getShape(soleId);
  if (sole) {
    editor.updateShape({ id: soleId, type: sole.type, meta: detachMeta(input.record) });
    replaceOriginal(soleId);
  } else {
    editor.deleteShape(shape.id);
  }
  return { selectionId: soleId ?? null, rootIds: soleId ? [soleId] : [] };
}
