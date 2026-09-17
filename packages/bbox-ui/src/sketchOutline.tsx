import { useMemo, type CSSProperties } from "react";

import { SKETCH_WOBBLE_PX, sketchRectPath } from "./sketchPath";

/**
 * The hand-drawn outline layer, shared by `Block` and `Region`.
 *
 * WHY this exists at all, when every other part of a skin is pure CSS:
 * because a drawn line is GEOMETRY, and CSS cannot express it. There is no
 * property that displaces points along a border, and `border-radius`
 * cannot differ between two coincident strokes — which is precisely the
 * thing doing the work in tldraw's version (see `sketchPath.ts` for what
 * tldraw actually does and how it was read). So the token layer decides
 * WHETHER this paints and in what colour; the path itself has to be real.
 *
 * It still costs the host nothing and neither adapter knows it exists:
 * `display` reads `--bbox-skin-outline`, which only the sketch skin sets to
 * `block`. Every other skin renders this element and never paints it.
 *
 * WHY rendered-always-and-hidden rather than "render it only for sketch":
 * the component cannot know the active skin without reading computed style
 * off itself, and self-measurement is the one thing the core does not do
 * (CLAUDE.md's rule — it is what keeps the package props-in/DOM-out and
 * server-renderable). An always-rendered element that CSS switches off is
 * the honest version of that constraint; the path math is a few dozen
 * points and is memoised on the only three inputs that change it.
 */
export interface SketchOutlineProps {
  /** Border-box width of the element being outlined. */
  width: number;
  /** Border-box height. */
  height: number;
  /**
   * The element's own border width. The outline is drawn ON that line, not
   * inside it, so a skin can turn the CSS border transparent and have the
   * drawn one land in exactly the same place — which is what keeps the
   * sketch skin from moving anything.
   */
  borderWidth: number;
  /** Corner radius before jitter. */
  radius?: number;
  /** Stable per-instance string — same seed, same wobble, every render. */
  seed: string;
}

export const SKETCH_OUTLINE_RADIUS = 12;

/**
 * How far outside the border box the drawn line may stray, and therefore
 * how much `overflow-clip-margin` its container has to grant it: the peak
 * wobble plus half the pen. Without the slack, an outward bulge is sliced
 * flat against the border box and the hand-drawn line acquires a suspiciously
 * straight segment exactly where it was meant to be loosest.
 */
export const SKETCH_OUTLINE_BLEED_PX = Math.ceil(SKETCH_WOBBLE_PX + 2);

export function SketchOutline({
  width,
  height,
  borderWidth,
  radius = SKETCH_OUTLINE_RADIUS,
  seed,
}: SketchOutlineProps) {
  // The pen's own half-width plus its peak wobble, so the drawn line never
  // crosses the border box and can never be the thing that makes a Block
  // look bigger than the box the host hit-tests.
  const pad = borderWidth;
  const d = useMemo(
    () =>
      sketchRectPath({
        width: Math.max(0, width - pad * 2),
        height: Math.max(0, height - pad * 2),
        radius,
        strokeWidth: borderWidth,
        seed,
      }),
    [width, height, pad, radius, borderWidth, seed],
  );

  const style: CSSProperties = {
    // An absolutely-positioned child is placed against the PADDING box, so
    // -borderWidth walks back out to the border box's own origin. The
    // caller pairs this with `overflow-clip-margin: border-box` where it
    // clips; see block.tsx.
    left: -borderWidth,
    top: -borderWidth,
    display: "var(--bbox-skin-outline, none)",
    overflow: "visible",
  };

  return (
    <svg
      data-slot="sketch-outline"
      aria-hidden="true"
      focusable="false"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute"
      style={style}
    >
      <path
        d={d}
        transform={`translate(${pad} ${pad})`}
        fill="none"
        stroke="var(--bbox-skin-ink, var(--color-foreground))"
        strokeWidth={borderWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
