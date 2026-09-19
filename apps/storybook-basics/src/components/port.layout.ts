/**
 * src/components/port.layout.ts — Port's portable geometry, ported by value
 * from packages/bbox-ui/src/port.layout.ts (docs/PORT-EDGE-PLAN.md's Phase 1).
 *
 * Kept: every constant/type/function that is pure GEOMETRY — the dot's
 * sizing, the unified slot-placement model (`SlotOrigin`/`SlotAlign`/
 * `SlotPlacement`/`slotPlacementStyle`), the `PortTextLayout` compatibility
 * table, and the direction/edge helpers Port and LabeledPort both read.
 *
 * Dropped, deliberately (docs/PORT-EDGE-PLAN.md's "Left behind" list): the
 * wall-anchor geometry (`portAnchor`, `portDotPlacement`,
 * `PORT_DOT_CENTER_TRANSFORM`, `portLabelOut`, `portLabelPlacement`,
 * `BLOCK_BORDER_PX`) — this app has no `anchored` mode, every specimen here
 * is a standalone flex pairing, exactly what a Storybook story already is.
 * Also dropped: the row-pitch constants (`PORT_ROW_PITCH_PX` and friends,
 * for a wall-mounted lane's row alignment — Phase 4, out of scope here) and
 * the `size` cascade rung (`PortSizeRung` + friends — D4: `diameter`/
 * `textSize` are direct props in this reset lane, no header hands a size
 * down). Nothing here imports `./layout` (`SIMPLE_BLOCK`) — dropping the
 * wall-anchor math is what makes that import unnecessary.
 *
 * DONOR LINES for the pieces that did travel (donor read 2026-09-17, 670
 * lines, same repo — so every number below is checkable with one `sed`):
 *   • `port.layout.ts:31`     `PORT_DIAMETERS` (8/12/18).
 *   • `port.layout.ts:40-41`  `PORT_SURFACE_RING_PX` / `PORT_STATE_RING_PX`.
 *   • `port.layout.ts:508`    `SlotOrigin`.
 *   • `port.layout.ts:549`    `SlotAlign`.
 *   • `port.layout.ts:590+`   `slotPlacementStyle`, the placement model.
 *
 * NO PRIOR ART IS CLAIMED for anything in this file. The slot-placement
 * model is a local convention over CSS absolute positioning, and the dot
 * diameters were measured against the real SystemSketch app rather than
 * derived — there is no algorithm here and no paper to point at. The one
 * genuinely published spec this app leans on is CSS content-distribution,
 * and that lives in `portEdge.layout.ts`'s `mainAxisPositions`, not here.
 */
import type { CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/* Port dot — geometry re-measured against the real SystemSketch app   */
/* (see the donor file's own header for provenance).                   */
/* ------------------------------------------------------------------ */

/**
 * `xs` (6px) added 2026-09-19 (lane `ports`): the stock React Flow handle's
 * own box (`@xyflow/react/dist/style.css:250-251`, `width: 6px; height:
 * 6px`) and the box every default-variant dot renders at — Zach: "the
 * ports look way too big right now". `sm`/`md`/`lg` are unchanged and
 * still reachable by an explicit `diameter` prop.
 */
export const PORT_DIAMETERS = { xs: 6, sm: 8, md: 12, lg: 18 } as const;
export type PortSize = keyof typeof PORT_DIAMETERS | number; // number = "Exact"

export const PORT_DIAMETER_LABELS: Record<keyof typeof PORT_DIAMETERS, string> = {
  xs: "Extra Small",
  sm: "Small",
  md: "Medium",
  lg: "Large",
};

/**
 * Since 2026-09-19 (lane `ports`) these two are the RESERVED ring allowance,
 * not the painted rings. What actually paints is the variant's own
 * `dot.gap`/`dot.ring` (`src/skin/portVariants.ts` — v1 paints 1 + 1.5), and
 * every variant's overhang is ≤ this allowance (`PortVariants.stories.tsx`
 * asserts it). WHY the allowance stays at the old 2 + 3 rather than
 * following v1: every label, lane and header inset clears the dot by
 * `PORT_RING_OVERHANG_PX + PORT_LABEL_GAP`, and a dozen consumers read that
 * sum as a closed form (`blockPort.layout.ts`, `portEdge.tsx`'s lane,
 * `detach/definitions/port.ts`, the app's `PortFace` spacer). Keeping the
 * allowance fixed means a variant's RING never re-flows a label — text
 * moves only by half the change in the dot's box (≤ 3px across the five) —
 * and every consumer keeps agreeing by construction, with no variant
 * plumbing in pure layout code. The cost is that a thin-ringed variant's
 * label sits a couple of px further from its ring than a thick-ringed one's.
 */
export const PORT_SURFACE_RING_PX = 2;
export const PORT_STATE_RING_PX = 3;
// WHY: the rings are box-shadow, painted OUTSIDE the dot's layout box — any
// spacing measured from the box edge must add this or the ring eats it.
export const PORT_RING_OVERHANG_PX = PORT_SURFACE_RING_PX + PORT_STATE_RING_PX;
export const PORT_HIT_PX = 40;

/**
 * The six legacy named label placements, widened back from four in the
 * donor's own 2026-09-12 change — "Right Offset"/"Left Offset" lift the
 * label clear of a trace wire (see `TEXT_LAYOUT_AS_PLACEMENT` below).
 */
export type PortTextLayout = "top" | "bot" | "right" | "left" | "rightOffset" | "leftOffset";

export const PORT_TEXT_LAYOUTS: PortTextLayout[] = [
  "top",
  "bot",
  "right",
  "left",
  "rightOffset",
  "leftOffset",
];

export const PORT_TEXT_LAYOUT_LABELS: Record<PortTextLayout, string> = {
  top: "Top",
  bot: "Bot",
  right: "Right",
  left: "Left",
  rightOffset: "Right Offset",
  leftOffset: "Left Offset",
};

export const PORT_LABEL_GAP = 8;

/**
 * The flex row's direction for a resolved ORIGIN — so the Expert
 * `labelOrigin` control (or a host's own `edge`/`textLayout` choice) always
 * matches which side the row actually lays the label on.
 */
export function originFlexDirection(
  origin: SlotOrigin,
): "row" | "row-reverse" | "column" | "column-reverse" {
  switch (origin) {
    case "top":
      return "column-reverse"; // label above the dot
    case "bottom":
      return "column";
    case "right":
      return "row";
    case "left":
      return "row-reverse";
  }
}

/** True for the two legacy label positions that lift the label clear of a
 *  trace wire — derived from `TEXT_LAYOUT_AS_PLACEMENT`, not a second
 *  hand-written list. */
export function isOffsetTextLayout(layout: PortTextLayout): boolean {
  return TEXT_LAYOUT_AS_PLACEMENT[layout].align === "end";
}

export type PortDirection = "input" | "output";
export const PORT_DIRECTIONS: PortDirection[] = ["input", "output"];
export const PORT_DIRECTION_LABELS: Record<PortDirection, string> = {
  input: "Input",
  output: "Output",
};

export type BlockSide = "left" | "right" | "top" | "bottom";
export const BLOCK_SIDES: BlockSide[] = ["left", "right", "top", "bottom"];
export const BLOCK_SIDE_LABELS: Record<BlockSide, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
  bottom: "Bottom",
};

const SIDE_FOR_DIRECTION: Record<PortDirection, BlockSide> = {
  input: "left",
  output: "right",
};

export function portSideForDirection(direction: PortDirection): BlockSide {
  return SIDE_FOR_DIRECTION[direction];
}

/** Which way the label flows from the dot by default: inward, into the
 * block's interior, away from whatever the port connects to outside. */
export function inwardTextLayout(side: BlockSide): PortTextLayout {
  switch (side) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bot";
    case "bottom":
      return "top";
  }
}

/**
 * Port's own text-size rung. `sm`..`xl` are the same four px values as
 * EditableText's ladder (`editableText.layout.ts`'s `EDITABLE_TEXT_SIZES`).
 * `xs` (12px) was added 2026-09-19 (lane `ports`) as the DEFAULT rung —
 * Zach: "I want the port text to be 'small' by default" — and is Port's
 * own: it has no EditableText twin, because a port label at rest is a
 * plain span and while editing a `CodeEditor` fed `fontSizePx` directly
 * (`labeledPort.tsx`'s `DefaultPortLabel`), neither of which goes through
 * `EDITABLE_TEXT_SIZES`. 12 rather than 13: the Tailwind `text-xs` rung
 * every other 11–12px caption in this app already sits at.
 */
export const PORT_TEXT_SIZES = { xs: 12, sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type PortTextSize = keyof typeof PORT_TEXT_SIZES;
export const PORT_TEXT_SIZE_LABELS: Record<PortTextSize, string> = {
  xs: "Extra Small",
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};

/**
 * `PortDot`'s second independently-positioned slot: generic content hugging
 * a corner of the dot, closer in than the label slot's own "Offset"
 * positions.
 */
export type SecondarySlotLayout = "leftOffset" | "rightOffset" | "topOffset" | "botOffset";

export const SECONDARY_SLOT_LAYOUTS: SecondarySlotLayout[] = [
  "leftOffset",
  "rightOffset",
  "topOffset",
  "botOffset",
];

export const SECONDARY_SLOT_LAYOUT_LABELS: Record<SecondarySlotLayout, string> = {
  leftOffset: "Left Offset",
  rightOffset: "Right Offset",
  topOffset: "Top Offset",
  botOffset: "Bot Offset",
};

/** How tightly the secondary slot hugs the dot's own box — deliberately
 * smaller than `PORT_LABEL_GAP` (a badge/cue hugging a corner, not content
 * sitting flush beside the dot). */
export const PORT_SECONDARY_SLOT_GAP_PX = 6;

/** The secondary slot's AUTO default position — the corner opposite
 * wherever the label is actually flowing. Only consulted when a caller
 * omits `secondarySlotLayout` outright; an explicit value always wins. */
export function defaultSecondarySlotLayout(labelLayout: PortTextLayout): SecondarySlotLayout {
  switch (labelLayout) {
    case "left":
    case "leftOffset":
      return "rightOffset";
    case "right":
    case "rightOffset":
      return "leftOffset";
    case "top":
      return "botOffset";
    case "bot":
      return "topOffset";
  }
}

/* ------------------------------------------------------------------ */
/* THE UNIFIED SLOT PLACEMENT MODEL                                    */
/* ------------------------------------------------------------------ */

/** Which side of the dot a slot anchors to — the ORIGIN. Shared by both
 * slots; the named `PortTextLayout`/`SecondarySlotLayout` members are
 * PRESETS over (origin, offsetX, offsetY), not a parallel vocabulary. */
export type SlotOrigin = "top" | "bottom" | "left" | "right";

export const SLOT_ORIGINS: SlotOrigin[] = ["top", "bottom", "left", "right"];

export const SLOT_ORIGIN_LABELS: Record<SlotOrigin, string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

/**
 * WHICH PART OF THE SLOT is the reference point, on the axis the origin
 * leaves free — "end" is what makes "clear of the trace wire" a static
 * offset instead of one derived from the label's own (unknowable) height:
 * `translate(…, -100%)` puts the chosen edge ON the reference line whatever
 * the slot's content measures.
 */
export type SlotAlign = "start" | "center" | "end";

export const SLOT_ALIGNS: SlotAlign[] = ["start", "center", "end"];

const ALIGN_SHIFT: Record<SlotAlign, string> = {
  start: "0%",
  center: "-50%",
  end: "-100%",
};

export interface SlotPlacement {
  origin: SlotOrigin;
  align: SlotAlign;
  offsetX: number;
  offsetY: number;
}

/** A port dot's box, named so it cannot be mistaken for anything else. */
export interface PortDotBox {
  w: number;
  h: number;
}

/**
 * CSS offsets for a slot absolutely positioned against the dot's box. Plain
 * data — spreads into any host's `style` object.
 */
export interface PortLabelPlacement extends CSSProperties {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  transform: string;
}

/**
 * THE ONE ANCHOR RULE: the slot's content anchors by the edge FACING its
 * origin, centred on the other axis, sitting `gap` clear of the dot's
 * PAINTED ring; `offsetX`/`offsetY` then translate it from there in SCREEN
 * space (so `+x` always means "rightward on screen", on every origin).
 */
export function slotPlacementStyle(
  placement: SlotPlacement,
  dot: PortDotBox,
  gapPx: number,
  boxInsetPx: number = 0,
): PortLabelPlacement {
  const { origin, align, offsetX, offsetY } = placement;
  const shift = ALIGN_SHIFT[align];
  const outX = `${dot.w + PORT_RING_OVERHANG_PX + gapPx - boxInsetPx}px`;
  const outY = `${dot.h + PORT_RING_OVERHANG_PX + gapPx - boxInsetPx}px`;
  switch (origin) {
    case "right":
      return { left: outX, top: "50%", transform: `translate(${offsetX}px, calc(${shift} + ${offsetY}px))` };
    case "left":
      return { right: outX, top: "50%", transform: `translate(${offsetX}px, calc(${shift} + ${offsetY}px))` };
    case "top":
      return { bottom: outY, left: "50%", transform: `translate(calc(${shift} + ${offsetX}px), ${offsetY}px)` };
    case "bottom":
      return { top: outY, left: "50%", transform: `translate(calc(${shift} + ${offsetX}px), ${offsetY}px)` };
  }
}

/**
 * The six-member `PortTextLayout` as (origin, align, offsetY) — the two
 * "Offset" members are a STATIC placement: anchor the slot's bottom edge
 * (`align: "end"`) on the dot's centre line, then push it up one gap.
 * Height-independent by construction — no lift computed from the label's
 * own (unknowable) height. `portLabelLift()` no longer exists; this table
 * is its replacement (see docs/PORT-EDGE-PLAN.md's own note on this).
 */
export const TEXT_LAYOUT_AS_PLACEMENT: Record<
  PortTextLayout,
  { origin: SlotOrigin; align: SlotAlign; offsetY: number }
> = {
  top: { origin: "top", align: "center", offsetY: 0 },
  bot: { origin: "bottom", align: "center", offsetY: 0 },
  right: { origin: "right", align: "center", offsetY: 0 },
  left: { origin: "left", align: "center", offsetY: 0 },
  rightOffset: { origin: "right", align: "end", offsetY: -PORT_LABEL_GAP },
  leftOffset: { origin: "left", align: "end", offsetY: -PORT_LABEL_GAP },
};

/** The same compatibility read for the secondary slot's own four-member
 *  enum — every member is a corner hug, so none is "lifted". */
export const SECONDARY_LAYOUT_AS_ORIGIN: Record<SecondarySlotLayout, SlotOrigin> = {
  leftOffset: "left",
  rightOffset: "right",
  topOffset: "top",
  botOffset: "bottom",
};
