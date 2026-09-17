/**
 * bbox-ui sketch geometry — the hand-drawn outline, as pure math.
 *
 * WHAT TLDRAW ACTUALLY DOES, since that is the question this file answers.
 * It is not CSS, and for a rectangle it is not variable-width either. Read
 * in tldraw 5.3.2 (`lib/shapes/shared/PathBuilder.mjs`,
 * `lib/shapes/geo/GeoShapeBody.mjs`, `@tldraw/utils`'s `rng`):
 *
 *   1. There are TWO different mechanisms, and only one applies to a box.
 *      A freehand DRAW stroke gets its variable width from
 *      `getStrokeOutlinePoints`, which emits a filled outline POLYGON whose
 *      radius varies with pressure and velocity — the width is a shape, not
 *      a `stroke-width`. A geo shape (rectangle, ellipse — what a Block is)
 *      never touches that code.
 *   2. A geo shape with `dash: "draw"` goes through `PathBuilder.toDrawD`,
 *      which takes the EXACT geometric path and offsets each command point
 *      by a small random vector: a random unit direction, magnitude
 *      `sqrt(|random()|) * offset`, where `offset` defaults to
 *      `strokeWidth / 3`. For a 2px stroke that is a sub-pixel nudge.
 *   3. It then draws the whole thing TWICE — `passes = 2`, each pass seeded
 *      `rng(randomSeed + pass)`. Two nearly-identical outlines laid over
 *      each other is what reads as a pen going round twice, and it is
 *      doing most of the work, not the wobble.
 *   4. The seed is the SHAPE ID (`randomSeed: shape.id`), through an
 *      xorshift128 seeded from the string. Deterministic on purpose: an
 *      unseeded random would re-wobble on every render and shimmer.
 *   5. The fill is a separate path built with `passes: 1, offset: 0` — the
 *      fill follows the true geometry exactly and only the outline wobbles.
 *      (Moot here: the sketch skin has no fill, by Zach's ruling.)
 *
 * So the honest answer to "can pure CSS do this" is no. CSS has no way to
 * displace points along a border, and `border-radius` cannot differ between
 * two coincident strokes. What CSS CAN do is decide WHETHER this path
 * paints (`--bbox-skin-outline`) and what colour it is — which is how the
 * skin stays one attribute even though this part needs real geometry.
 *
 * This module is the same structure, re-expressed for a Block: pure
 * functions, no React, no DOM, no tldraw import, same discipline as
 * `layout.ts`. Deviations from tldraw are marked DEVIATION and reasoned.
 */

/**
 * tldraw's `rng` (`@tldraw/utils/lib/number.mjs`), ported verbatim — an
 * xorshift128 seeded by mixing a string's char codes in, returning roughly
 * (-2, 2).
 *
 * WHY verbatim rather than `Math.random()` or a one-line hash: the entire
 * point is that the same Block wobbles the SAME way on every render. A
 * fresh random per render shimmers on any state change; a too-weak hash
 * makes neighbouring seeds ("block-1", "block-2") produce visibly similar
 * wobble, so a row of blocks looks stamped rather than drawn.
 */
export function sketchRng(seed = ""): () => number {
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  function next(): number {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w ^= ((w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return (w / 0x100000000) * 2;
  }
  for (let k = 0; k < seed.length + 64; k++) {
    x ^= seed.charCodeAt(k) | 0;
    next();
  }
  return next;
}

export interface SketchRectOptions {
  width: number;
  height: number;
  /** Corner radius before jitter. */
  radius: number;
  /** Stroke width the path will be painted with — sets the default wobble. */
  strokeWidth: number;
  /** Stable per-Block string. Same seed in, same path out, forever. */
  seed: string;
  /** How many times the pen goes round. tldraw's default for an outline. */
  passes?: number;
  /** Peak point displacement. Defaults to `SKETCH_WOBBLE_PX`; tldraw's own
   * default is `strokeWidth / 3`, and that constant records why we differ. */
  wobble?: number;
  /**
   * Extra jittered points along each straight edge.
   *
   * DEVIATION from tldraw, deliberate. `PathBuilder` gives a rectangle four
   * corner commands and nothing in between, so the only thing that can move
   * is a corner and every edge stays a perfectly straight ruler line. That
   * is fine at the size tldraw's geo shapes usually are; a Block is 384px
   * wide, where a dead-straight 384px edge between two corners that moved
   * 0.7px reads as a printed box with slightly soft corners — not as drawn.
   * Two intermediate points per edge give the line somewhere to bow.
   */
  edgePoints?: number;
}

/**
 * Peak point displacement, in px.
 *
 * DEVIATION from tldraw, and the one worth knowing about. tldraw ties this
 * to the pen: `offset = strokeWidth / 3`, which for our 2px stroke is
 * 0.67px. Shipped at that ratio it rendered a dead-straight rectangle with
 * slightly soft corners — the two passes landed within a pixel of each
 * other and never separated, so the thing doing most of the work in
 * tldraw's look (the double-drawn line) was invisible.
 *
 * The ratio is not wrong; it is calibrated for tldraw's own proportions —
 * a thicker default stroke on shapes a fraction of a Block's 384px. Held
 * against a long edge and a thin line it has nothing to bite on. 2.4px was
 * picked by rendering a sweep (0.67 / 1.2 / 1.8 / 2.4 / 3.0, against 0-4
 * edge points and 1-3 passes) and looking: below ~1.8 the passes still
 * fuse, above ~3 the box stops reading as a box.
 */
export const SKETCH_WOBBLE_PX = 2.4;

/** Intermediate jittered points per straight edge — see `edgePoints`. */
export const SKETCH_EDGE_POINTS = 3;

interface Pt {
  x: number;
  y: number;
}

const n = (v: number) => Math.round(v * 100) / 100;

/**
 * An SVG path `d` for a rounded rectangle that looks drawn by hand.
 *
 * The box is `width` x `height` in its own coordinate space; the caller is
 * responsible for insetting it far enough that the stroke and the wobble
 * both stay inside whatever is clipping (see `block.tsx`).
 *
 * Each pass is a separate closed subpath, so one `<path>` element carries
 * the whole double-drawn look and there is nothing to keep in sync.
 */
export function sketchRectPath({
  width,
  height,
  radius,
  strokeWidth,
  seed,
  passes = 2,
  wobble = SKETCH_WOBBLE_PX,
  edgePoints = SKETCH_EDGE_POINTS,
}: SketchRectOptions): string {
  // Clamp exactly like a rounded rect must: a radius over half the short
  // side is not a rounder corner, it is a self-intersecting path.
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const amp = wobble;

  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  const parts: string[] = [];

  for (let pass = 0; pass < passes; pass++) {
    // `seed + pass`, as tldraw does: the second lap is a different draw of
    // the same box rather than a copy of the first.
    const random = sketchRng(`${seed}:${pass}`);
    // tldraw's own displacement: a random direction, and a magnitude whose
    // sqrt spreads points evenly over a disc instead of clustering them at
    // the centre.
    const jitter = (p: Pt): Pt => {
      const dx = random();
      const dy = random();
      const len = Math.hypot(dx, dy) || 1;
      const mag = Math.sqrt(Math.abs(random())) * amp;
      return { x: p.x + (dx / len) * mag, y: p.y + (dy / len) * mag };
    };

    const segs: string[] = [];
    let first: Pt | null = null;

    for (let i = 0; i < 4; i++) {
      const from = corners[i];
      const to = corners[(i + 1) % 4];
      const ux = Math.sign(to.x - from.x);
      const uy = Math.sign(to.y - from.y);

      const start = jitter({ x: from.x + ux * r, y: from.y + uy * r });
      const end = jitter({ x: to.x - ux * r, y: to.y - uy * r });

      if (first === null) {
        first = start;
        segs.push(`M${n(start.x)} ${n(start.y)}`);
      } else {
        // Round the corner with the (jittered) vertex as the control point.
        // Same shape as tldraw's tangent-based corner, one order cheaper:
        // for an axis-aligned rectangle the two tangents are perpendicular
        // unit vectors, so a quadratic through the corner and a cubic with
        // tangent-scaled handles describe the same arc to within a fraction
        // of the stroke width.
        const corner = jitter(from);
        segs.push(`Q${n(corner.x)} ${n(corner.y)} ${n(start.x)} ${n(start.y)}`);
      }

      for (let s = 1; s <= edgePoints; s++) {
        const t = s / (edgePoints + 1);
        segs.push(
          (({ x, y }) => `L${n(x)} ${n(y)}`)(
            jitter({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }),
          ),
        );
      }
      segs.push(`L${n(end.x)} ${n(end.y)}`);
    }

    // Close through the last corner back to where the pen started.
    const closing = jitter(corners[0]);
    if (first) segs.push(`Q${n(closing.x)} ${n(closing.y)} ${n(first.x)} ${n(first.y)}`);
    parts.push(segs.join(""));
  }

  return parts.join(" ");
}
