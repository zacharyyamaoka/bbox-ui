/**
 * The `bbox-glyph` kind: how a standalone Glyph reduces itself.
 *
 * A Glyph lowers to exactly one stock shape (the inner `x-box`), so it
 * always takes `lowerToGroup`'s single-primitive fallback path — tldraw
 * refuses to group one shape, so that lone box carries the full record
 * itself and doubles as its own anchor. Nothing here duplicates that
 * mechanics; only the picture (`primitivesForGlyph`) and the record shape
 * are Glyph-specific, matching `portDetachableKind`'s own shape.
 */
import type { TLShape } from "tldraw";

import type { DetachableKind } from "./detachableKind";
import { DETACH_FORMAT_VERSION } from "./detachModel";
import { lowerToGroup } from "./lowerShared";
import { primitivesForGlyph } from "./glyphPrimitives";
import type { BBoxGlyphShape } from "../glyph-shape-util";

function isBBoxGlyphShape(shape: TLShape): shape is BBoxGlyphShape {
  return shape.type === "bbox-glyph";
}

export const glyphDetachableKind: DetachableKind = {
  kind: "bbox-glyph",
  nodePhase: "leaf",
  matches: isBBoxGlyphShape,
  lowerNode(editor, shape) {
    if (!isBBoxGlyphShape(shape)) return null;
    const built = primitivesForGlyph(shape.props, { x: shape.x, y: shape.y });
    return lowerToGroup(editor, {
      shape,
      shapes: built.shapes,
      anchorKind: "glyph-box",
      record: {
        kind: "glyph",
        version: DETACH_FORMAT_VERSION,
        props: shape.props,
      },
    });
  },
};
