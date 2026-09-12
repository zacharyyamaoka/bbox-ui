/**
 * A Port's appearance expressed as editable stock tldraw primitives.
 *
 * Geometry comes only from the core layout modules (`portLabelBox`,
 * `TEXT_SIZES`) — the same authority the live `PortDot` / `PortLabel`
 * render from — never from re-measured DOM and never from hand-typed
 * offsets.
 *
 * This is the bottom of the detach hierarchy: the Block builder invokes
 * this function per port instead of drawing its own circles, which is what
 * makes "higher-order primitives don't rewrite their own detach" true at
 * the picture level.
 */
import type { TLShapeId, TLShapePartial } from "tldraw";
import type { TLDefaultColorStyle } from "tldraw";

import {
  TEXT_SIZES,
  collapseWhitespace,
  portLabelBox,
  type PortTextLayout,
} from "@bbox-ui/core";

import { geoAt, measureText, textAt } from "./stockPartials";

/**
 * The three states a `BBoxShapePort` may persist (block-shape-util.tsx's
 * own field, unchanged in shape by this rename). INTEGRATION (docs/
 * T1-SPEC.md §2): the old `PortState`'s `"default"` is `appearance.ts`'s
 * `AppearanceState["valueSet"]` — same meaning ("a resting value is set"),
 * new name. The rebuilt Port's two OTHER new rungs, `outOfFocus` and
 * `hidden`, are not added to the persisted tldraw shape here: that is a
 * genuine new capability (a new stock-colour mapping, a widened `T.literal`
 * validator, a schema migration for existing boards) no T1 lane touched or
 * scoped for this adapter — left for whoever picks up detach next, not
 * silently smuggled in as an import-path fix.
 */
export type DetachablePortState = "empty" | "valueSet" | "wired";

/** The slice of `BBoxPortShapeProps` the picture depends on. */
export interface PortPrimitiveInput {
  /** The dot's box — the standalone shape's `w`/`h`, or a Block port's diameter. */
  w: number;
  h: number;
  /**
   * WHY `received` is excluded — a deliberate rejection, not an oversight:
   * `received` is runtime-only by Zach's ruling (see `AppearanceState` in
   * `appearance.ts`), and a detached group is persisted document state.
   * Detaching a currently-lit port must paint its PERSISTED state, never
   * bake a green dot into every saved board that would be a lie after
   * reload. The runtime flag instead survives the round trip in memory —
   * `rekeyReceivedPorts` follows the id changes through detach and rebuild.
   * Do not re-litigate this into "detach should show the green dot".
   */
  state: DetachablePortState;
  label: string;
  textLayout: PortTextLayout;
}

export interface PortPrimitives {
  /** Ring first — it is the anchor that stands where the shape's origin stood. */
  shapes: TLShapePartial[];
  ringId: TLShapeId;
}

/**
 * INTEGRATION (docs/T1-SPEC.md §2, appearance.ts's `STATE_TOKENS`): the
 * live dot now paints `wired` as a single fully-filled disc (ring token
 * === fill token, `portDotStyle`) rather than a hollow ring plus a
 * separate small accent core. Detach has no continuous colour to fall
 * back on — only tldraw's fixed stock palette — so this table is the
 * closest stock approximation per state, following `stockPartials.ts`'s
 * own documented CSS→stock legend (`border-foreground`→black,
 * `border-muted-foreground`→grey, `bg-primary`→orange).
 */
const STATE_STOCK_RING: Record<
  DetachablePortState,
  { color: TLDefaultColorStyle; fill: "none" | "solid" | "fill" }
> = {
  empty: { color: "black", fill: "none" },
  valueSet: { color: "grey", fill: "solid" },
  wired: { color: "orange", fill: "fill" },
};

/**
 * Build the stock shapes for one port at `origin` (the dot box's top-left
 * in the target parent's coordinates).
 */
export function primitivesForPort(
  input: PortPrimitiveInput,
  origin: { x: number; y: number },
): PortPrimitives {
  const paint = STATE_STOCK_RING[input.state];
  const ring = geoAt(
    origin,
    { x: 0, y: 0, w: input.w, h: input.h },
    { geo: "ellipse", ...paint },
  );
  const shapes: TLShapePartial[] = [ring];

  // The live PortLabel collapses white space (whitespace-nowrap), so the
  // primitive carries the collapsed text — a raw "\n" would become a second
  // stock paragraph the live span never painted. Same shared function as
  // the Block builder; the raw label survives in `meta.bboxUi.props`.
  const label = collapseWhitespace(input.label);
  if (label !== "") {
    // PortLabel's default rung is md (24px) in both adapters.
    const fontPx = TEXT_SIZES.md;
    const box = portLabelBox({
      dotW: input.w,
      dotH: input.h,
      label,
      layout: input.textLayout,
      fontPx,
      measure: measureText,
    });
    // The text anchors on the edge nearest the dot, so the +slack the text
    // primitive reserves grows away from the gap rather than into it.
    const align =
      input.textLayout === "left"
        ? "end"
        : input.textLayout === "top" || input.textLayout === "bot"
          ? "middle"
          : "start";
    shapes.push(
      textAt({
        text: label,
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
