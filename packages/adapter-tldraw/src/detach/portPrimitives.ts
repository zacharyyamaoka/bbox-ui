/**
 * A Port's appearance expressed as editable stock tldraw primitives.
 *
 * Geometry comes only from the core layout modules (`portLabelBox`,
 * `wiredInnerPx`, `TEXT_SIZES`) — the same authority the live `PortDot` /
 * `PortLabel` render from — never from re-measured DOM and never from
 * hand-typed offsets.
 *
 * This is the bottom of the detach hierarchy: the Block builder invokes
 * this function per port instead of drawing its own circles, which is what
 * makes "higher-order primitives don't rewrite their own detach" true at
 * the picture level.
 */
import type { TLShapeId, TLShapePartial } from "tldraw";

import {
  TEXT_SIZES,
  portLabelBox,
  wiredInnerPx,
  type PortSize,
  type PortState,
  type PortTextLayout,
} from "@bbox-ui/core";

import { geoAt, measureText, textAt } from "./stockPartials";

/** The slice of `BBoxPortShapeProps` the picture depends on. */
export interface PortPrimitiveInput {
  /** The dot's box — the standalone shape's `w`/`h`, or a Block port's diameter. */
  w: number;
  h: number;
  /**
   * WHY `received` is excluded — a deliberate rejection, not an oversight:
   * `received` is runtime-only by Zach's ruling (see `PortState` in the
   * core layout module), and a detached group is persisted document state.
   * Detaching a currently-lit port must paint its PERSISTED state, never
   * bake a green dot into every saved board that would be a lie after
   * reload. The runtime flag instead survives the round trip in memory —
   * `rekeyReceivedPorts` follows the id changes through detach and rebuild.
   * Do not re-litigate this into "detach should show the green dot".
   */
  state: Exclude<PortState, "received">;
  size: PortSize;
  label: string;
  textLayout: PortTextLayout;
}

export interface PortPrimitives {
  /** Ring first — it is the anchor that stands where the shape's origin stood. */
  shapes: TLShapePartial[];
  ringId: TLShapeId;
}

/**
 * Build the stock shapes for one port at `origin` (the dot box's top-left
 * in the target parent's coordinates).
 *
 * The ring is the stable outer primitive; `wired` adds the accent core
 * (`bg-primary`, the board's orange) at the fixed `wiredInnerPx` diameter —
 * fixed by the size rung, not proportional to a stretched dot, exactly as
 * `PortDot` paints it. `default` is the muted wash on a muted ring.
 */
export function primitivesForPort(
  input: PortPrimitiveInput,
  origin: { x: number; y: number },
): PortPrimitives {
  const ring = geoAt(
    origin,
    { x: 0, y: 0, w: input.w, h: input.h },
    input.state === "default"
      ? { geo: "ellipse", color: "grey", fill: "solid" }
      : { geo: "ellipse", color: "black", fill: "none" },
  );
  const shapes: TLShapePartial[] = [ring];

  if (input.state === "wired") {
    const inner = wiredInnerPx(input.size);
    shapes.push(
      geoAt(
        origin,
        {
          x: input.w / 2 - inner / 2,
          y: input.h / 2 - inner / 2,
          w: inner,
          h: inner,
        },
        { geo: "ellipse", color: "orange", fill: "fill" },
      ),
    );
  }

  if (input.label !== "") {
    // PortLabel's default rung is md (24px) in both adapters.
    const fontPx = TEXT_SIZES.md;
    const box = portLabelBox({
      dotW: input.w,
      dotH: input.h,
      label: input.label,
      layout: input.textLayout,
      fontPx,
      measure: measureText,
    });
    // The text anchors on the edge nearest the dot, so the +slack the text
    // primitive reserves grows away from the gap rather than into it.
    const align =
      input.textLayout === "left" || input.textLayout === "left-offset"
        ? "end"
        : input.textLayout === "top" || input.textLayout === "bot"
          ? "middle"
          : "start";
    shapes.push(
      textAt({
        text: input.label,
        px: fontPx,
        box,
        origin,
        color: "black",
        align,
      }),
    );
  }

  return { shapes, ringId: ring.id as TLShapeId };
}
