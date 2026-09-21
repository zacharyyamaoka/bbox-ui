/**
 * src/hosts/detach/definitions/block.ts — the `"block"` scene-node kind.
 *
 * WHAT THIS FILE NO LONGER DOES, which is the point of RULING 5. It used to
 * be 157 lines that reached into the Block's rendered DOM and hand-
 * enumerated every part it happened to know about: query the card, query
 * the header, then loop `node.data.ports` side by side calling a port
 * emitter per id. Zach: "by making it work on the basic components a
 * primitive so then it comes for free for the higher level things." So the
 * enumeration is gone. This kind now says only WHICH scene nodes it claims;
 * the lowering is `../lowerSceneNode.ts` walking whatever the component
 * actually painted and dispatching each part to the primitive that owns it
 * (`../primitives/`).
 *
 * Three things that were bugs-by-omission in the enumerated version are
 * fixed by deletion, not by new code here:
 *   - a Block's FOOTER was never lowered (no query for it existed);
 *   - the header's function port (`../../../components/blockPort.tsx`'s
 *     `BlockFunctionPort`) was invisible to the loop, because it is not in
 *     `node.data.ports`;
 *   - `BlockMembers` was explicitly out of scope — a member Block simply
 *     vanished on detach. A member is a nested `[data-slot="block"]`, so it
 *     now lowers through the SAME card primitive its standalone form uses.
 */
import type { DetachableKind, SceneReader } from "../detachableKind";
import { DETACH_FORMAT_VERSION } from "../detachModel";
import { lowerSceneNodeShape } from "../lowerSceneNode";
import type { TLShape } from "tldraw";

function isBboxNodeShape(shape: TLShape): boolean {
  return shape.type === "bbox-node";
}

function nodeFor(shape: TLShape, reader: SceneReader) {
  const nodeId = (shape.props as { nodeId?: string }).nodeId;
  if (typeof nodeId !== "string") return undefined;
  return reader.scene.nodes.find((candidate) => candidate.id === nodeId);
}

export const blockDetachableKind: DetachableKind = {
  kind: "block",
  nodePhase: "leaf",
  matches(shape, reader) {
    if (!isBboxNodeShape(shape)) return false;
    const node = nodeFor(shape, reader);
    // `SceneNodeView`'s own default (`../../nodeViews.tsx`'s switch): an
    // absent/unrecognised type renders as a Block, so this kind matches the
    // same way.
    return node !== undefined && (node.type === "block" || node.type === undefined);
  },
  lowerNode(editor, shape, reader) {
    const node = nodeFor(shape, reader);
    if (!node) return null;
    return lowerSceneNodeShape(editor, shape, {
      nodeId: node.id,
      record: {
        kind: "scene-node",
        version: DETACH_FORMAT_VERSION,
        nodeType: node.type ?? "block",
        nodeId: node.id,
        parentId: node.parentId,
        data: node.data,
      },
    });
  },
};
