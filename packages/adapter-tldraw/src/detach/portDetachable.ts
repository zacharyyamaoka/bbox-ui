/**
 * The `bbox-port` kind: how a standalone Port reduces itself.
 *
 * "First get it right for a port. the border, a line, etc." — the dot and
 * its label become stock shapes, grouped (the name and port are grouped
 * together), and the group's `meta` carries the complete props so the Port
 * can be rebuilt.
 */
import type { TLShape } from "tldraw";

import type { DetachableKind } from "./detachableKind";
import { DETACH_FORMAT_VERSION } from "./detachModel";
import { lowerToGroup } from "./lowerShared";
import { primitivesForPort } from "./portPrimitives";
import type { BBoxPortShape } from "../port-shape-util";

function isBBoxPortShape(shape: TLShape): shape is BBoxPortShape {
  return shape.type === "bbox-port";
}

export const portDetachableKind: DetachableKind = {
  kind: "bbox-port",
  nodePhase: "leaf",
  matches: isBBoxPortShape,
  lowerNode(editor, shape) {
    if (!isBBoxPortShape(shape)) return null;
    const built = primitivesForPort(shape.props, { x: shape.x, y: shape.y });
    return lowerToGroup(editor, {
      shape,
      shapes: built.shapes,
      anchorKind: "port-dot",
      record: {
        kind: "port",
        version: DETACH_FORMAT_VERSION,
        props: shape.props,
      },
    });
  },
};
