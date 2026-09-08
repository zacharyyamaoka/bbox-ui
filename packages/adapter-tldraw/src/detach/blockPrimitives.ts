/**
 * A Block's appearance expressed as editable stock tldraw primitives.
 *
 * Geometry comes only from the core layout modules — `layoutSimpleBlock`
 * for the header/description/type boxes and `portAnchor` for the dots, the
 * same authorities the live renderer uses — never from re-measured DOM and
 * never from hand-typed offsets.
 *
 * The ports are NOT drawn here. Each port's picture comes from
 * `primitivesForPort`, the same reduction the standalone `bbox-port` kind
 * uses — the hierarchical rule made concrete: the composite composes the
 * lower primitive's detach instead of rewriting it.
 */
import type { TLShapeId, TLShapePartial } from "tldraw";

import {
  META_FONT_PX,
  PORT_DIAMETERS,
  TEXT_SIZES,
  glyphPx,
  layoutSimpleBlock,
  portAnchor,
} from "@bbox-ui/core";

import type { BBoxBlockShapeProps } from "../block-shape-util";
import { geoAt, measureText, textAt } from "./stockPartials";
import { primitivesForPort } from "./portPrimitives";

export interface BlockPortRow {
  portId: string;
  /** Ring, accent core and label for this one port. */
  shapeIds: TLShapeId[];
}

export interface BlockPrimitives {
  /** Card first — it is the anchor that stands where the Block stood. */
  shapes: TLShapePartial[];
  cardId: TLShapeId;
  /** Membership used by detach to nest one stock group per port. */
  portRows: BlockPortRow[];
}

export function primitivesForBlock(
  props: BBoxBlockShapeProps,
  origin: { x: number; y: number },
): BlockPrimitives {
  const layout = layoutSimpleBlock({
    width: props.w,
    height: props.h,
    title: props.title,
    titleSize: props.titleSize,
    icon: props.icon,
    tag: props.tag,
    description: props.description,
    blockType: props.blockType,
    orientation: props.orientation,
    measure: measureText,
  });

  const card = geoAt(
    origin,
    { x: 0, y: 0, w: props.w, h: props.h },
    // border-2 border-foreground bg-card: black ink, near-white surface.
    { geo: "rectangle", color: "black", fill: "semi" },
  );
  const shapes: TLShapePartial[] = [card];

  if (layout.glyph) {
    shapes.push(
      textAt({
        text: props.icon,
        px: glyphPx(props.titleSize),
        box: layout.glyph,
        origin,
        color: "black",
        align: "middle",
      }),
    );
  }
  if (layout.title) {
    shapes.push(
      textAt({
        text: props.title,
        px: TEXT_SIZES[props.titleSize],
        box: layout.title,
        origin,
        color: "black",
        align: "middle",
      }),
    );
  }
  if (layout.chip && layout.chipText) {
    // rounded-full on a wide short box is tldraw's capsule primitive.
    shapes.push(geoAt(origin, layout.chip, { geo: "oval", color: "black", fill: "none" }));
    shapes.push(
      textAt({
        text: props.tag,
        px: META_FONT_PX,
        box: layout.chipText,
        origin,
        color: "black",
        align: "middle",
      }),
    );
  }
  if (layout.description) {
    shapes.push(
      textAt({
        text: props.description,
        px: META_FONT_PX,
        box: layout.description,
        origin,
        color: "grey",
        align: "middle",
      }),
    );
  }
  if (layout.blockType) {
    shapes.push(
      textAt({
        text: props.blockType,
        px: META_FONT_PX,
        box: layout.blockType,
        origin,
        color: "grey",
        align: "middle",
      }),
    );
  }

  const portRows: BlockPortRow[] = [];
  for (const port of props.ports) {
    const diameter = PORT_DIAMETERS[port.size];
    // The dot centers ON the container boundary — half in, half out — at
    // the same anchor the live renderer and any cable would use.
    const anchor = portAnchor(port.side, port.t, props.w, props.h);
    const built = primitivesForPort(
      {
        w: diameter,
        h: diameter,
        state: port.state,
        size: port.size,
        label: port.label,
        textLayout: port.textLayout,
      },
      {
        x: origin.x + anchor.x - diameter / 2,
        y: origin.y + anchor.y - diameter / 2,
      },
    );
    shapes.push(...built.shapes);
    portRows.push({
      portId: port.id,
      shapeIds: built.shapes.map((partial) => partial.id as TLShapeId),
    });
  }

  return { shapes, cardId: card.id as TLShapeId, portRows };
}
