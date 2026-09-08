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

/* ------------------------------------------------------------------ */
/* Port anchors on a block boundary (for hosts)                        */
/* ------------------------------------------------------------------ */

export type BlockSide = "left" | "right" | "top" | "bottom";

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
