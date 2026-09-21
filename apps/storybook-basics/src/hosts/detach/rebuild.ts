/**
 * src/detach/rebuild.ts — the way back: put a scene node back from what its
 * group remembers.
 *
 * DONOR: packages/adapter-tldraw/src/detach/rebuild.ts (read in full,
 * 2026-09-18) — the anchor-based position/rotation recovery
 * (`anchorIdWithin`, the page-transform math) is ported near-verbatim: props
 * come from the record verbatim, never re-derived from the picture; position
 * comes from where the marked anchor primitive stands NOW, because a port
 * label hangs outside the shape's own geometry, so the group's bounds do not
 * start where the shape's origin did.
 *
 * DIFFERS FROM THE DONOR, because this app's architecture differs (see
 * `./detachModel.ts`'s header): the donor recreated ONE shape whose props
 * WERE the record. Here a scene node's data lives in `HostScene`, outside
 * the shape (`../hosts/tldrawHost.tsx`'s rule 1), and — this is the gap that
 * makes this file's second half necessary — the host's own "Scene → shapes"
 * reconciliation effect only MOVES shapes for scene nodes that already have
 * one; it never CREATES a `bbox-node` for a node added to the scene after
 * mount (it only creates shapes once, inside `handleMount`, guarded by
 * `getCurrentPageShapeIds().size === 0`). So `rebuildDetachedShapes` does
 * both halves itself, in the same order `handleMount` does them the first
 * time: mint the `bbox-node` shape directly AND push the node data back into
 * the scene via `onSceneChange` — see this function's own inline note on the
 * one-frame gap that ordering leaves.
 */
import type { Editor, TLShape, TLShapeId, TLShapePartial } from "tldraw";

import type { HostScene } from "../hosts/hostScene";
import { shapeIdForNode, type BboxNodeShape } from "../hosts/tldrawHost";
import { isDetachedAnchor, readDetachedNode } from "./detachModel";

export interface RebuildResult {
  createdIds: TLShapeId[];
}

/** Shapes in the selection that remember a scene node, nested ones included. */
export function selectedRebuildableIds(editor: Editor): TLShapeId[] {
  const found: TLShapeId[] = [];
  const visit = (ids: readonly TLShapeId[]) => {
    for (const id of ids) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      if (readDetachedNode(shape.meta)) {
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
  for (const id of editor.getSortedChildIdsForParent(groupId)) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    if (isDetachedAnchor(shape.meta)) return id;
    const nested = anchorIdWithin(editor, id);
    if (nested) return nested;
  }
  return null;
}

/** Rebuild every remembered scene node in the selection. `scene`/
 *  `onSceneChange` are the SAME pair a `TldrawHost` caller already threads
 *  through — this function needs both because, unlike the donor, a scene
 *  node's data does not travel inside the shape being recreated. */
export function rebuildDetachedShapes(
  editor: Editor,
  scene: HostScene,
  onSceneChange: ((next: HostScene) => void) | undefined,
): RebuildResult {
  const carrierIds = selectedRebuildableIds(editor);
  if (carrierIds.length === 0) return { createdIds: [] };

  if (editor.getCurrentToolId() !== "select") editor.setCurrentTool("select");
  editor.markHistoryStoppingPoint("rebuild from primitives");

  const createdIds: TLShapeId[] = [];
  const newNodes: HostScene["nodes"][number][] = [];

  editor.run(() => {
    for (const carrierId of carrierIds) {
      const carrier = editor.getShape(carrierId);
      const record = carrier ? readDetachedNode(carrier.meta) : null;
      if (!carrier || !record) continue;

      const anchorId = anchorIdWithin(editor, carrierId) ?? carrierId;
      const anchorTransform = editor.getShapePageTransform(anchorId);
      const anchorPagePoint = anchorTransform.applyToPoint({ x: 0, y: 0 });
      const local = editor.getPointInParentSpace(carrierId, anchorPagePoint);
      const rotation = anchorTransform.rotation() - editor.getShapeParentTransform(carrierId).rotation();

      // `shapeIdForNode` is DETERMINISTIC per scene-node id (`../hosts/
      // tldrawHost.tsx`) — reusing it, rather than minting a fresh id, is
      // what lets the host's own "Scene → shapes" sync effect find this
      // shape on the very next scene update, exactly as it would have if
      // the node had never left.
      const shapeId = shapeIdForNode(record.nodeId);
      const partial: TLShapePartial<TLShape> = {
        id: shapeId,
        type: "bbox-node",
        parentId: carrier.parentId,
        x: local.x,
        y: local.y,
        rotation,
        props: {
          w: record.data.w ?? 160,
          h: record.data.h ?? 100,
          nodeId: record.nodeId,
        },
      } as TLShapePartial<BboxNodeShape>;
      editor.createShape(partial);
      editor.deleteShape(carrierId);
      createdIds.push(shapeId);
      newNodes.push({
        id: record.nodeId,
        type: record.nodeType,
        parentId: record.parentId,
        position: { x: local.x, y: local.y },
        data: record.data,
      });
    }
    if (createdIds.length > 0) editor.setSelectedShapes(createdIds);
  });

  // Applied AFTER the tldraw-side mutation above (see this file's header
  // note on the resulting one-frame gap: `BboxNodeShapeComponent` renders
  // `null` for one paint until this scene update lands and the node lookup
  // succeeds — the same "no host || no node" guard that file already has
  // for its very first mount, not a new failure mode this introduces).
  if (newNodes.length > 0) {
    onSceneChange?.({ ...scene, nodes: [...scene.nodes, ...newNodes] });
  }

  return { createdIds };
}
