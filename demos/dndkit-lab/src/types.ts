export type SpacingScheme = "space-between" | "space-evenly" | "space-around";

export const SPACING_SCHEMES: { value: SpacingScheme; label: string; hint: string }[] = [
  {
    value: "space-between",
    label: "Edge to edge",
    hint: "space-between — first/last card flush against the container, gaps only between cards",
  },
  {
    value: "space-evenly",
    label: "Including edge",
    hint: "space-evenly — equal gap before the first card, between cards, and after the last",
  },
  {
    value: "space-around",
    label: "Around",
    hint: "space-around — equal margin on both sides of each card, so edge gaps end up half the between-card gap",
  },
];

/**
 * How a container lays its cards out along its main axis. `distribute` is the
 * three space-* schemes above (spreads across the whole container). `aligned`
 * packs cards from one end with an explicit gap instead — the mode a real
 * port edge needs, since "space-between" reflows every port's position the
 * instant a sibling edge's count changes, which a Block's port list must not
 * do.
 */
export type AlignAnchor = "start" | "end";

export interface DistributeConfig {
  mode: "distribute";
  scheme: SpacingScheme;
}

export interface AlignConfig {
  mode: "aligned";
  anchor: AlignAnchor;
  /** px gap between cards. */
  gap: number;
  /**
   * Extra px pushed in from the anchor edge, on top of the container's own
   * padding. This is what makes one edge's ports start further along than
   * another's — the "Offset" layout in `PROJECT - Black Box UI.md`'s
   * Inline/Offset picture, where the right edge's ports sit lower than the
   * left edge's because the right container carries this padding and the
   * left one doesn't.
   */
  edgePadding: number;
}

export type Distribution = DistributeConfig | AlignConfig;

export const DEFAULT_ALIGN_GAP = 18;

/** Which side of a Block a port edge sits on. */
export type EdgeSide = "top" | "right" | "bottom" | "left";

export type Orientation = "portrait" | "landscape";

// The card's polarity — which way it faces, always pointing away from the
// board's center. Derived from whichever container currently holds the card,
// never stored on the card itself, so it updates the instant the card
// crosses to a different edge.
export type Direction = "N" | "E" | "S" | "W";

export interface Size {
  width: number;
  height: number;
}
