// src/skin/sketchOutline.tsx — ported VERBATIM (byte-identical body) from
// packages/bbox-ui/src/sketchOutline.tsx (frozen v1, read-only donor),
// revision `c83c8b2` in this repo. Its `--bbox-skin-outline`/
// `--bbox-skin-ink` reads and `./sketchPath` import are unchanged — this
// app's src/skin/skin.ts keeps the same token names and
// `./sketchPath` sits beside this file too. Only this header is new.

import { useMemo, type CSSProperties } from "react";

import {
  SKETCH_WOBBLE_PX,
  sketchEllipsePath,
  sketchPathData,
  sketchRectPath,
  sketchWobbleFor,
} from "./sketchPath";

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
  /**
   * `rect` for anything with corners, `ellipse` for a Port dot.
   *
   * WHY a Port dot is not just a rect with a huge radius: a rounded rect
   * clamps its radius to half the short side and then joins four arcs with
   * zero-length straight runs, so only the four seams ever get a jittered
   * point and the circle wobbles in four places and nowhere else.
   */
  shape?: "rect" | "ellipse";
  /**
   * What the line is painted with. Defaults to the skin's own ink.
   *
   * WHY this is a prop and not always `--bbox-skin-ink`: on a Pill or a Bar
   * the outline's COLOUR is owned by the `state` preset family
   * (`lineColor`, through `resolveField`), not by the skin. Two selectors
   * claiming one governed field is exactly what `assertDisjointPresets`
   * forbids, so the skin supplies the SHAPE and the caller passes down
   * whatever colour its own cascade resolved. That split is what lets a
   * wired Pill be sketchy and still be wired-coloured.
   */
  stroke?: string;
  /** Peak displacement. Defaults to `sketchWobbleFor(width, height)`. */
  wobble?: number;
  /**
   * Draw at `width` x `height` as a DESIGN size and let the SVG stretch to
   * whatever the element actually is, instead of positioning it at exact
   * pixels.
   *
   * WHY this mode has to exist: a Pill, a Badge and a Bar are sized by
   * their own content, and the only ways to learn their real pixels are a
   * ResizeObserver or `getBoundingClientRect` — self-measurement, which the
   * core does not do (it is what keeps this package props-in/DOM-out and
   * server-renderable). So the path is generated at a nominal size and
   * `preserveAspectRatio="none"` stretches it.
   *
   * The cost is honest and small: the wobble is scaled anisotropically, so
   * a chip much wider than the nominal has slightly flatter horizontal
   * wander than vertical. At the sub-pixel amplitudes these sizes use
   * (`sketchWobbleFor` puts a 20px chip at 0.7px) that is not visible.
   * `vector-effect="non-scaling-stroke"` keeps the PEN from stretching,
   * which would have been visible.
   */
  stretch?: boolean;
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
  shape = "rect",
  stroke = "var(--bbox-skin-ink, var(--color-foreground))",
  wobble,
  stretch = false,
  seed,
}: SketchOutlineProps) {
  // The pen's own half-width plus its peak wobble, so the drawn line never
  // crosses the border box and can never be the thing that makes a Block
  // look bigger than the box the host hit-tests.
  const pad = borderWidth;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const amp = wobble ?? sketchWobbleFor(innerW, innerH);
  const d = useMemo(
    () =>
      shape === "ellipse"
        ? sketchEllipsePath({ width: innerW, height: innerH, seed, wobble: amp })
        : sketchRectPath({
            width: innerW,
            height: innerH,
            // A radius over half the short side is not a rounder corner,
            // it is a capsule — which is what a Pill wants, and
            // sketchRectPath already clamps for it.
            radius: Math.min(radius, Math.min(innerW, innerH) / 2),
            strokeWidth: borderWidth,
            seed,
            wobble: amp,
            // Fewer bow points on a small thing: three of them across a
            // 40px chip edge is not a hand, it is a tremor.
            edgePoints: Math.min(innerW, innerH) < 60 ? 1 : undefined,
          }),
    [shape, innerW, innerH, radius, borderWidth, seed, amp],
  );

  // An absolutely-positioned child is placed against the PADDING box, so
  // -borderWidth walks back out to the border box's own origin. The caller
  // pairs this with `overflow-clip-margin` where it clips; see block.tsx.
  const style: CSSProperties = stretch
    ? {
        inset: -borderWidth,
        width: `calc(100% + ${borderWidth * 2}px)`,
        height: `calc(100% + ${borderWidth * 2}px)`,
        display: "var(--bbox-skin-outline, none)",
        overflow: "visible",
      }
    : shape === "ellipse"
      ? {
          // An ellipse is drawn around a CENTRE, not along a border, so it
          // centres on its parent instead of hanging off the border box's
          // origin. A Port dot's rings sit outside its element entirely
          // (they are box-shadow spread), so aligning by the top-left
          // corner put the drawn ring off-centre by the difference between
          // the surface ring and the state ring.
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "var(--bbox-skin-outline, none)",
          overflow: "visible",
        }
      : {
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
      {...(stretch ? {} : { width, height })}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      className="pointer-events-none absolute"
      style={style}
    >
      <path
        d={d}
        transform={`translate(${pad} ${pad})`}
        fill="none"
        stroke={stroke}
        strokeWidth={borderWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Without this a stretched outline's pen stretches too — a chip
        // twice the nominal width would be drawn with a visibly fatter
        // horizontal line than vertical.
        vectorEffect={stretch ? "non-scaling-stroke" : undefined}
      />
    </svg>
  );
}

/**
 * A single drawn RULE along one edge — what a Bar's separator needs, and
 * anything else whose line is a segment rather than a closed shape.
 *
 * WHY not `SketchOutline` with a degenerate height: a closed outline draws
 * four sides, and three of them would be lines the Bar never had. This is
 * the same generator (`sketchRectPath`'s jitter, through `sketchPathData`)
 * applied to a two-point path, stretched across whatever width the bar
 * turns out to be for the same reason a Pill's is stretched.
 */
export interface SketchLineProps {
  /** Which edge the rule sits on — matches `Bar`'s own `edge`. */
  edge: "top" | "bottom";
  /** The line's width in px, as resolved by the caller's own cascade. */
  thickness: number;
  /** Paint, from the caller's cascade — never the skin's, for the reason
   * `SketchOutline.stroke` documents. */
  stroke?: string;
  seed: string;
}

/** Nominal span the rule is drawn across before stretching. */
const SKETCH_LINE_NOMINAL_W = 240;

export function SketchLine({
  edge,
  thickness,
  stroke = "var(--bbox-skin-ink, var(--color-foreground))",
  seed,
}: SketchLineProps) {
  const h = 8;
  const y = h / 2;
  const d = useMemo(
    () =>
      sketchPathData(`M0 ${y} L${SKETCH_LINE_NOMINAL_W} ${y}`, {
        seed: `${seed}:${edge}`,
        // A rule is a long thin thing, so it wants less wander than a
        // Block's edge — but 0.9px across a 368px header read as a ruler
        // line in the capture, which is the opposite failure. 1.7px is
        // where it starts looking drawn without looking like a wave.
        wobble: 1.7,
        spacing: 34,
      }),
    [seed, edge, y],
  );
  return (
    <svg
      data-slot="sketch-line"
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${SKETCH_LINE_NOMINAL_W} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-0 w-full"
      style={{
        [edge]: -h / 2,
        height: h,
        display: "var(--bbox-skin-outline, none)",
        overflow: "visible",
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={thickness}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
