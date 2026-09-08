/**
 * bbox-ui layout — the portable geometry of the kit.
 *
 * This module is deliberately free of React (and of any canvas engine).
 * WHY: layout geometry is portable and lives here; interaction geometry
 * (hit-testing, snapping, z-order, drag) is host-owned and never travels.
 * Both host adapters (React Flow, tldraw) and any future renderer consume
 * these numbers instead of re-measuring the wireframe. See ARCHITECTURE.md.
 *
 * Every constant below is measured from the authoritative wireframe,
 * `bbox-ui-v2.systemsketch` — not invented.
 */

/* ------------------------------------------------------------------ */
/* Text size rungs                                                     */
/* ------------------------------------------------------------------ */

/**
 * The three text rungs, named on the board as
 * `Medium (h3)` / `Large (h2)` / `Extra Large (h1)`.
 */
export const TEXT_SIZES = {
  md: 24,
  lg: 36,
  xl: 44,
} as const;

export type TextSize = keyof typeof TEXT_SIZES;

export const TEXT_SIZE_NAMES: Record<TextSize, string> = {
  md: "Medium (h3)",
  lg: "Large (h2)",
  xl: "Extra Large (h1)",
};

/** Small metadata text (description, type, chip) — the board's `s` rung. */
export const META_FONT_PX = 18;

/**
 * Glyph (icon) size is derived from the title size, never set independently.
 * WHY: board rule, written by Zach — "The Icon and Title always go next to
 * each other. The icon should resize with the title text size." 0.9 × 44 ≈ 40
 * reproduces the face he already approved; the rungs become 44→40, 36→32, 24→22.
 */
export const ICON_RATIO = 0.9;

export function glyphPx(size: TextSize): number {
  return Math.round(TEXT_SIZES[size] * ICON_RATIO);
}

/* ------------------------------------------------------------------ */
/* Port                                                                */
/* ------------------------------------------------------------------ */

/** Three port diameters, measured off the board's `Port Diameter` row. */
export const PORT_DIAMETERS = {
  sm: 14,
  md: 25,
  lg: 36,
} as const;

export type PortSize = keyof typeof PORT_DIAMETERS;

/**
 * Port fill states.
 *
 * WHY: `received` ("Data Recived" on the board — Zach's spelling, kept in the
 * label map below) is a RUNTIME prop, never persisted document state. It says
 * "data flowed through this port just now", which only a live host can know;
 * a document format that stores it would be lying after reload. Host adapters
 * must source it from runtime state (React state, a tldraw atom), never from
 * shape/document props.
 */
export type PortState = "empty" | "default" | "wired" | "received";

/** Board labels, verbatim (including the board's spelling of Recived). */
export const PORT_STATE_LABELS: Record<PortState, string> = {
  empty: "Empty",
  default: "Default Value",
  wired: "Wired",
  received: "Data Recived",
};

export const PORT_STATES = Object.keys(PORT_STATE_LABELS) as PortState[];

/** States a document format may persist — everything except `received`. */
export const PERSISTABLE_PORT_STATES = ["empty", "default", "wired"] as const;

/**
 * The wired state paints an inner accent dot inside the hollow ring.
 * Measured 12–13px inside the 25px specimen → half the diameter.
 */
export const WIRED_INNER_RATIO = 0.5;

export function wiredInnerPx(size: PortSize): number {
  return Math.round(PORT_DIAMETERS[size] * WIRED_INNER_RATIO);
}

/**
 * Where the text slot sits relative to the dot. Board labels:
 * `Top`, `Bot`, `Right`, `Left`, `Right (Offset)`, `Left Offset`.
 * The offset variants sit the label further out, for a dot that hangs
 * outside the block edge.
 */
export type PortTextLayout =
  | "top"
  | "bot"
  | "right"
  | "left"
  | "right-offset"
  | "left-offset";

export const PORT_TEXT_LAYOUTS: PortTextLayout[] = [
  "top",
  "bot",
  "right",
  "left",
  "right-offset",
  "left-offset",
];

export function isOffsetLayout(layout: PortTextLayout): boolean {
  return layout === "right-offset" || layout === "left-offset";
}

/**
 * Flex direction for a container whose DOM order is [dot, label].
 */
export function portFlexDirection(
  layout: PortTextLayout,
): "row" | "row-reverse" | "column" | "column-reverse" {
  switch (layout) {
    case "top":
      return "column-reverse"; // label above the dot
    case "bot":
      return "column";
    case "right":
    case "right-offset":
      return "row";
    case "left":
    case "left-offset":
      return "row-reverse";
  }
}

/** Gap between dot and label; offset layouts push the label further out. */
export const PORT_LABEL_GAP = 8;
export const PORT_LABEL_OFFSET_GAP = 24;

export function portLabelGap(layout: PortTextLayout): number {
  return isOffsetLayout(layout) ? PORT_LABEL_OFFSET_GAP : PORT_LABEL_GAP;
}

/* ------------------------------------------------------------------ */
/* Block — Simple View                                                 */
/* ------------------------------------------------------------------ */

/** Simple View container, measured: 384 × 258, solid stroke, no fill. */
export const SIMPLE_BLOCK = {
  width: 384,
  height: 258,
} as const;

/** Tag chip (e.g. `Draft 1`): oval, measured 102 × 39. */
export const CHIP = {
  minWidth: 102,
  height: 39,
} as const;

/**
 * Stroke width of the Block container border (`border-2` on `Block`) and of
 * the port dot's ring (`border-2` in `portDotClass`). CSS absolute
 * positioning resolves against a *padding* box, so both strokes shift a
 * host's coordinate origin; the placement functions below compensate so no
 * adapter has to know.
 */
export const BLOCK_BORDER_PX = 2;
export const PORT_RING_PX = 2;

/* ------------------------------------------------------------------ */
/* Header + chip — the chip reserves a region, it is not just aligned  */
/* ------------------------------------------------------------------ */

/** Horizontal padding inside the Block container (`px-4` on `Block`). */
export const BLOCK_PADDING_X = 16;

/**
 * Chip inset from the container's right edge, measured: container right
 * 4915, chip oval right 4887 → 28.
 */
export const CHIP_INSET_RIGHT = 28;

/**
 * Clear gap between the title's right edge and the chip's left edge,
 * measured: chip left 4785, title right 4775 → 10.
 */
export const CHIP_TITLE_GAP = 10;

/**
 * Width available to the header's content (glyph + title).
 *
 * Without a chip: the normal padded width — container border and `px-4`
 * padding off both sides.
 *
 * With a chip: `containerWidth − CHIP_INSET_RIGHT − CHIP.minWidth −
 * CHIP_TITLE_GAP`. WHY: on the board the chip is not merely right-aligned —
 * it RESERVES its region, and the title's room ends before it. The earlier
 * out-of-flow chip kept a centred title from shifting when a tag appeared,
 * but traded a shift for a collision (the chip painted over the title's
 * last letters), and a collision is worse. A title that no longer fits
 * truncates with a visible ellipsis, never a silent clip.
 */
export function headerContentWidth(
  containerWidth: number = SIMPLE_BLOCK.width,
  hasChip: boolean = false,
): number {
  if (hasChip) {
    return containerWidth - CHIP_INSET_RIGHT - CHIP.minWidth - CHIP_TITLE_GAP;
  }
  return containerWidth - 2 * (BLOCK_BORDER_PX + BLOCK_PADDING_X);
}

/**
 * CSS `right` for the chip, absolutely positioned inside the header. The
 * header spans the Block's *padding* box (already `BLOCK_BORDER_PX +
 * BLOCK_PADDING_X` inside the container edge), so the container-edge inset
 * is re-expressed in that frame here, once.
 */
export const CHIP_RIGHT_IN_HEADER_PX =
  CHIP_INSET_RIGHT - BLOCK_BORDER_PX - BLOCK_PADDING_X;

/**
 * CSS `padding-right` the header takes on while it hosts a chip: the chip's
 * span plus both clearances, in the header's own frame. This is what makes
 * the chip a *reservation* — the flexed title can never extend into it, so
 * the title's box and the chip's box cannot intersect, whatever the title
 * says. For any container width, the header content's right limit under
 * this padding lands exactly `headerContentWidth(width, true)` from the
 * container's left edge.
 */
export const HEADER_CHIP_RESERVED_PX =
  CHIP_RIGHT_IN_HEADER_PX + CHIP.minWidth + CHIP_TITLE_GAP;

/* ------------------------------------------------------------------ */
/* Port anchors on a block boundary (for hosts)                        */
/* ------------------------------------------------------------------ */

export type BlockSide = "left" | "right" | "top" | "bottom";

export type PortDirection = "input" | "output";

/**
 * Point on the boundary of a `width × height` rectangle where a port dot
 * centers. `t` runs 0→1 along the side (top→bottom for left/right,
 * left→right for top/bottom). Hosts translate this into their own space:
 * tldraw positions absolutely from shape props, React Flow feeds it to a
 * Handle's `top`/`left` percentage.
 */
export function portAnchor(
  side: BlockSide,
  t: number,
  width: number = SIMPLE_BLOCK.width,
  height: number = SIMPLE_BLOCK.height,
): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: 0, y: t * height };
    case "right":
      return { x: width, y: t * height };
    case "top":
      return { x: t * width, y: 0 };
    case "bottom":
      return { x: t * width, y: height };
  }
}

/* ------------------------------------------------------------------ */
/* Port placement — dot on the boundary, label off the dot            */
/* ------------------------------------------------------------------ */

/*
 * WHY this section exists — the governing rule: any quantity or mapping
 * that appears in both adapters is a bug. If both hosts had to answer the
 * same question ("where does the dot sit on the border?", "which way and
 * how far does the label flow from the dot?"), the core should have
 * answered it once. Each adapter grew a private copy of the
 * layout→left/right/top/bottom/transform switch, the copies drifted, and
 * port labels sat clear of the container border in React Flow while
 * crowding and crossing it in tldraw. Everything below is that answer,
 * given once.
 */

/**
 * Which container side a port lands on when only its direction is known:
 * inputs enter on the left, outputs leave on the right.
 */
export function portSideForDirection(direction: PortDirection): BlockSide {
  return direction === "input" ? "left" : "right";
}

/**
 * Which way the label flows from the dot by default: inward, into the
 * block's interior, away from whatever the port connects to outside.
 */
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

/** Pair with `portDotPlacement` to centre the dot's box on the anchor. */
export const PORT_DOT_CENTER_TRANSFORM = "translate(-50%, -50%)";

/**
 * CSS `left`/`top` (px) that centre a port dot ON the container boundary —
 * half in, half out. For an absolutely positioned element inside `Block`,
 * whose containing box is the Block's *padding* box (inset `BLOCK_BORDER_PX`
 * from the outer boundary `portAnchor` speaks in — compensated here, once).
 * Combine with `PORT_DOT_CENTER_TRANSFORM`.
 */
export function portDotPlacement(
  side: BlockSide,
  t: number,
  width: number = SIMPLE_BLOCK.width,
  height: number = SIMPLE_BLOCK.height,
): { left: number; top: number } {
  const anchor = portAnchor(side, t, width, height);
  return { left: anchor.x - BLOCK_BORDER_PX, top: anchor.y - BLOCK_BORDER_PX };
}

/**
 * CSS offsets for a label absolutely positioned inside the dot's box.
 * Plain data — spreads into any host's style object.
 */
export interface PortLabelPlacement {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  transform: string;
}

/**
 * Where the label sits relative to the dot: its near edge lands
 * `portLabelGap(layout)` px clear of the dot's outer edge — the same
 * geometry the core `Port`'s flex row produces, so a host-positioned label
 * and a flex-flowed one agree to the pixel.
 *
 * `boxInsetPx` is how far the positioning context is inset from the dot's
 * border box: React Flow's `Handle` IS the bordered dot, so its padding box
 * sits `PORT_RING_PX` inside; tldraw's unbordered wrapper passes 0. The
 * cross-axis `50%` needs no compensation — a symmetric ring keeps the
 * padding-box centre on the dot centre.
 */
export function portLabelPlacement(
  layout: PortTextLayout,
  diameterPx: number,
  boxInsetPx: number = 0,
): PortLabelPlacement {
  const out = `${diameterPx + portLabelGap(layout) - boxInsetPx}px`;
  switch (layout) {
    case "right":
    case "right-offset":
      return { left: out, top: "50%", transform: "translateY(-50%)" };
    case "left":
    case "left-offset":
      return { right: out, top: "50%", transform: "translateY(-50%)" };
    case "top":
      return { bottom: out, left: "50%", transform: "translateX(-50%)" };
    case "bot":
      return { top: out, left: "50%", transform: "translateX(-50%)" };
  }
}
