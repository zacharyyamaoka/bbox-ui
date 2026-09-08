/**
 * The `bbox-block` kind: how a Block reduces itself.
 *
 * The Block does not rewrite the Port's detach — `primitivesForBlock`
 * invokes `primitivesForPort` per port, and each port's shapes become a
 * nested stock group inside the Block group, so unpeeling the outer group
 * one level lands on the card and the port rows as sensible units.
 */
import type { TLShape } from "tldraw";

import type { DetachableKind } from "./detachableKind";
import { DETACH_FORMAT_VERSION } from "./detachModel";
import { lowerToGroup } from "./lowerShared";
import { primitivesForBlock } from "./blockPrimitives";
import type { BBoxBlockShape } from "../block-shape-util";

function isBBoxBlockShape(shape: TLShape): shape is BBoxBlockShape {
  return shape.type === "bbox-block";
}

export const blockDetachableKind: DetachableKind = {
  kind: "bbox-block",
  nodePhase: "leaf",
  matches: isBBoxBlockShape,
  lowerNode(editor, shape) {
    if (!isBBoxBlockShape(shape)) return null;
    const built = primitivesForBlock(shape.props, { x: shape.x, y: shape.y });
    return lowerToGroup(editor, {
      shape,
      shapes: built.shapes,
      anchorKind: "block-card",
      nestedRows: built.portRows,
      record: {
        kind: "block",
        version: DETACH_FORMAT_VERSION,
        props: shape.props,
      },
    });
  },
};
