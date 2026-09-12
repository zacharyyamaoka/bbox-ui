import type { SpacingScheme } from "./types";

export interface Point {
  x: number;
  y: number;
}

// Must match `.container { padding: ... }` in index.css. Free-position mode
// positions cards with plain `left`/`top`, whose containing block is the
// padding edge (CSS abspos children are NOT inset by their parent's own
// padding) — so this offset has to be added back by hand to land cards where
// the flex layout would have, in the same content box the spacing math below
// assumes.
export const CONTAINER_PADDING = 14;

// Must match `.container { border-width: ... }` in index.css.
// WHY this exists at all: `* { box-sizing: border-box }` makes CONTAINER_SIZE
// the BORDER box, while the containing block of an abspos child is the
// PADDING box — so free-position math has to shed the border on every side or
// every card sits exactly one border-width off its edge line (measured: 2px)
// while Auto mode, which flexbox centres for us, sits exactly on it.
export const CONTAINER_BORDER = 2;

/** The box a free-positioned card is actually laid out in: the padding box. */
export function innerBoxSize(size: { width: number; height: number }) {
  return {
    width: size.width - 2 * CONTAINER_BORDER,
    height: size.height - 2 * CONTAINER_BORDER,
  };
}

/**
 * Reproduces CSS flexbox `justify-content` main-axis positions, so switching
 * into free-position ("Custom") mode can snapshot exactly where the browser
 * had already placed each card — no DOM measurement needed.
 */
export function mainAxisPositions(
  count: number,
  mainSize: number,
  cardMain: number,
  scheme: SpacingScheme,
): number[] {
  if (count === 0) return [];
  const free = Math.max(mainSize - count * cardMain, 0);

  if (count === 1) {
    // Matches browser behaviour: space-between has nothing to distribute
    // between, so the lone item sits at the start; the other two schemes
    // still center it with equal space on both sides.
    return scheme === "space-between" ? [0] : [free / 2];
  }

  switch (scheme) {
    case "space-between": {
      const gap = free / (count - 1);
      return Array.from({ length: count }, (_, i) => i * (cardMain + gap));
    }
    case "space-evenly": {
      const gap = free / (count + 1);
      return Array.from({ length: count }, (_, i) => gap + i * (cardMain + gap));
    }
    case "space-around": {
      const gap = free / count;
      return Array.from({ length: count }, (_, i) => gap / 2 + i * (cardMain + gap));
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
