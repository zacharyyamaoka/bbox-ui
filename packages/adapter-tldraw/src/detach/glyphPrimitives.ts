/**
 * A Glyph's appearance expressed as ONE editable stock tldraw primitive.
 *
 * Geometry comes only from `glyphShapeFootprint` — the same authority the
 * live shape util resolves `size` from — never from re-measured DOM and
 * never from hand-typed offsets. There is deliberately no text/emoji/image
 * primitive standing in for `content`: docs/GLYPH-PLAN.md's contract calls
 * for "the same size as the actual glyph not including padding," a single
 * `x-box` outline, so a detached Glyph reads as an icon-shaped placeholder
 * rather than printing a Lucide name ("rocket") as words or embedding a
 * data-URL image no stock shape can hold.
 */
import { createShapeId } from "tldraw";
import type { TLShapeId, TLShapePartial } from "tldraw";

import { glyphShapeFootprint } from "../glyph-shape-util";
import type { BBoxGlyphShapeProps } from "../glyph-shape-util";

export interface GlyphPrimitives {
  shapes: TLShapePartial[];
  boxId: TLShapeId;
}

/**
 * Build the stock `x-box` for one glyph at `origin` (the shape's own x/y
 * in the target parent's coordinates — the OUTER box, padding included).
 * The box itself is the INNER size: `origin + padding`, `size × size`,
 * no padding baked in — a padded glyph detaches to a box smaller than its
 * own bounding square, exactly as the live component paints it.
 */
export function primitivesForGlyph(
  props: Pick<BBoxGlyphShapeProps, "sizePreset" | "size" | "padding">,
  origin: { x: number; y: number },
): GlyphPrimitives {
  const footprint = glyphShapeFootprint(props);
  const boxId = createShapeId();
  const box: TLShapePartial = {
    id: boxId,
    type: "geo",
    x: origin.x + footprint.padding,
    y: origin.y + footprint.padding,
    props: {
      geo: "x-box",
      w: Math.max(1, footprint.size),
      h: Math.max(1, footprint.size),
      color: "black",
      fill: "none",
      dash: "solid",
      size: "s",
    },
  };
  return { shapes: [box], boxId };
}
