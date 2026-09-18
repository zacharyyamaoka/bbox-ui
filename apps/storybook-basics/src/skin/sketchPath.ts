// src/skin/sketchPath.ts — ported VERBATIM (byte-identical body) from
// packages/bbox-ui/src/sketchPath.ts (frozen v1, read-only donor),
// revision `c83c8b2` in this repo. Pure math — tldraw's seeded xorshift128
// rng and the rect/ellipse jitter derivation — with no CSS var or React
// import, so nothing here needed to change to reach this app. Only this
// header is new.

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

/**
 * Wobble scaled to the thing being drawn.
 *
 * WHY a function and not the one constant: `SKETCH_WOBBLE_PX` was tuned
 * against a 384 x 258 Block, and the same 2.4px on a 20px chip or a 14px
 * port dot is not "sketchy", it is destroyed — the displacement approaches
 * the radius and the shape stops being a capsule or a circle at all. A
 * hand's error is roughly constant in absolute terms, which is why tldraw
 * ties its own offset to the pen rather than the shape; but tldraw's shapes
 * do not span two orders of magnitude the way a Block and a Port dot do.
 *
 * `min(w, h) * 0.035`, clamped: 2.4px at Block size, ~0.7px on a chip,
 * ~0.5px on a port dot. The floor keeps the smallest things from going
 * perfectly crisp and reading as un-skinned.
 */
export function sketchWobbleFor(width: number, height: number): number {
  const scaled = Math.min(width, height) * 0.035;
  return Math.min(SKETCH_WOBBLE_PX, Math.max(0.4, scaled));
}

/** tldraw's own displacement: random unit direction, magnitude
 * `sqrt(|random()|) * amp` so points spread evenly over a disc rather than
 * bunching at the centre. Shared by every generator below — one definition
 * is what keeps a sketched rectangle, ellipse and trace looking like the
 * same hand. */
function jitterWith(random: () => number, amp: number) {
  return (p: Pt): Pt => {
    const dx = random();
    const dy = random();
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.sqrt(Math.abs(random())) * amp;
    return { x: p.x + (dx / len) * mag, y: p.y + (dy / len) * mag };
  };
}

/**
 * A smooth path through a run of points: quadratics whose control points
 * are the points themselves and whose ends are the midpoints between them.
 *
 * WHY not `L` between jittered points: a flattened curve re-emitted as line
 * segments reads as a polygon, which is exactly what a hand-drawn curve is
 * not. Rounding through the midpoints restores the curve while keeping
 * every jittered point's influence.
 */
function smoothThrough(points: Pt[], close: boolean): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return `M${n(points[0].x)} ${n(points[0].y)}` +
      points.slice(1).map((p) => `L${n(p.x)} ${n(p.y)}`).join("");
  }
  const parts = [`M${n(points[0].x)} ${n(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    parts.push(`Q${n(p.x)} ${n(p.y)} ${n((p.x + q.x) / 2)} ${n((p.y + q.y) / 2)}`);
  }
  const last = points[points.length - 1];
  parts.push(`${close ? "Q" : "L"}${n(last.x)} ${n(last.y)}` + (close ? ` ${n(points[0].x)} ${n(points[0].y)}Z` : ""));
  return parts.join("");
}

export interface SketchEllipseOptions {
  /** Bounding box width of the ellipse. */
  width: number;
  /** Bounding box height. */
  height: number;
  seed: string;
  passes?: number;
  wobble?: number;
  /** Points sampled around the circumference before jittering. */
  steps?: number;
}

/**
 * A hand-drawn ellipse, in a `width` x `height` box at the origin — what a
 * Port dot and any other round thing needs.
 *
 * WHY a separate generator rather than `sketchRectPath` with a huge radius:
 * a rounded rect clamps its radius to half the short side and then draws
 * four arcs joined by straight runs of zero length, which is an ellipse
 * only in the limit and wobbles unevenly (the four seams get two jittered
 * points each, the rest none). Sampling the circumference gives the hand an
 * even chance everywhere.
 */
export function sketchEllipsePath({
  width,
  height,
  seed,
  passes = 2,
  wobble,
  steps,
}: SketchEllipseOptions): string {
  const rx = width / 2;
  const ry = height / 2;
  const amp = wobble ?? sketchWobbleFor(width, height);
  // Enough samples that the jitter reads as a wobble rather than as a
  // polygon, scaled to size so a 14px dot is not carrying 24 points.
  const count = steps ?? Math.max(8, Math.round(Math.min(18, (rx + ry) / 3)));
  const parts: string[] = [];
  for (let pass = 0; pass < passes; pass++) {
    const random = sketchRng(`${seed}:e${pass}`);
    const jitter = jitterWith(random, amp);
    const pts: Pt[] = [];
    // Start each pass at a different angle so the two laps do not both
    // begin and end at the same seam — a real second lap overshoots.
    const phase = random() * Math.PI;
    for (let i = 0; i < count; i++) {
      const t = phase + (i / count) * Math.PI * 2;
      pts.push(jitter({ x: rx + Math.cos(t) * rx, y: ry + Math.sin(t) * ry }));
    }
    parts.push(smoothThrough(pts, true));
  }
  return parts.join(" ");
}

/* -------------------------------------------------------------- */
/* Arbitrary path data — what a Trace needs                        */
/* -------------------------------------------------------------- */

/** Commands this module can flatten. Anything else and `sketchPathData`
 * hands the path back untouched rather than guessing — see there. */
const FLATTENABLE = new Set(["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "Q", "q", "Z", "z"]);

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

function quadAt(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/** Flatten a `d` string into runs of points. `null` means "this path uses a
 * command we do not flatten" — the caller must then leave it alone. */
function flattenPathData(d: string, spacing: number): Pt[][] | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;

  const runs: Pt[][] = [];
  let run: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let cmd = "";
  let i = 0;
  const num = () => Number(tokens[i++]);

  const sampleCount = (a: Pt, b: Pt) =>
    Math.max(2, Math.min(64, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing)));

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (!FLATTENABLE.has(cmd)) return null;
    }
    if (cmd === "" ) return null;
    const rel = cmd === cmd.toLowerCase() && cmd !== "Z" && cmd !== "z";
    const ox = rel ? cur.x : 0;
    const oy = rel ? cur.y : 0;

    switch (cmd.toUpperCase()) {
      case "M": {
        if (run.length > 1) runs.push(run);
        cur = { x: num() + ox, y: num() + oy };
        start = cur;
        run = [cur];
        // A repeated coordinate pair after M is an implicit L.
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        cur = { x: num() + ox, y: num() + oy };
        run.push(cur);
        break;
      }
      case "H": {
        cur = { x: num() + ox, y: cur.y };
        run.push(cur);
        break;
      }
      case "V": {
        cur = { x: cur.x, y: num() + oy };
        run.push(cur);
        break;
      }
      case "C": {
        const c1 = { x: num() + ox, y: num() + oy };
        const c2 = { x: num() + ox, y: num() + oy };
        const end = { x: num() + ox, y: num() + oy };
        const steps = sampleCount(cur, end);
        for (let s = 1; s <= steps; s++) run.push(cubicAt(cur, c1, c2, end, s / steps));
        cur = end;
        break;
      }
      case "Q": {
        const c = { x: num() + ox, y: num() + oy };
        const end = { x: num() + ox, y: num() + oy };
        const steps = sampleCount(cur, end);
        for (let s = 1; s <= steps; s++) run.push(quadAt(cur, c, end, s / steps));
        cur = end;
        break;
      }
      case "Z": {
        run.push(start);
        cur = start;
        break;
      }
      default:
        return null;
    }
    if (i > tokens.length + 8) return null;
  }
  if (run.length > 1) runs.push(run);
  return runs.length ? runs : null;
}

export interface SketchPathDataOptions {
  seed: string;
  passes?: number;
  wobble?: number;
  /** Target spacing, in px, between sampled points on a curve. */
  spacing?: number;
}

/**
 * Roughen an arbitrary SVG path — the generic `to_sketch`, and what a Trace
 * needs, since its `d` is computed by the HOST (React Flow's
 * `getBezierPath`, tldraw's arrow info) and the core never sees the
 * geometry that produced it.
 *
 * Flatten to points, jitter, re-smooth, repeat per pass. Structurally the
 * same move as tldraw's `toDrawD`, with one difference forced by the input:
 * tldraw jitters its own COMMAND points because it still has them, while
 * all we have is a string, so the curve is sampled first. That is also why
 * this reads better than jittering the two endpoints and two control points
 * of a bezier would — a long cable needs somewhere to wander in the middle.
 *
 * Returns the ORIGINAL path unchanged if it uses a command outside
 * `FLATTENABLE` (arcs, most notably). WHY not throw, and why not
 * approximate: a Trace that renders crisp when it should be sketchy is a
 * cosmetic miss; one that throws takes the canvas down, and one that
 * guesses at an arc silently moves an edge off its endpoints.
 */
export function sketchPathData(
  d: string,
  { seed, passes = 2, wobble = 1.8, spacing = 16 }: SketchPathDataOptions,
): string {
  const runs = flattenPathData(d, spacing);
  if (!runs) return d;
  const parts: string[] = [];
  for (let pass = 0; pass < passes; pass++) {
    const random = sketchRng(`${seed}:p${pass}`);
    const jitter = jitterWith(random, wobble);
    for (const run of runs) {
      // Endpoints stay put. A Trace is attached to two ports; wandering
      // ends would detach it from the dots it is drawn between, which is
      // a correctness bug wearing a style's clothes.
      const moved = run.map((pt, idx) => (idx === 0 || idx === run.length - 1 ? pt : jitter(pt)));
      parts.push(smoothThrough(moved, false));
    }
  }
  return parts.join(" ");
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
