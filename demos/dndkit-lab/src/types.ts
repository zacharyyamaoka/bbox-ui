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
