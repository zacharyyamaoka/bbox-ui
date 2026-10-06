/**
 * STEP IN vs EXPAND — the shared vocabulary, and the only maths either app does.
 *
 * Zach, Daily Note 2026-09-19:
 *
 *   "when you step inside something the rest becomes like empty canvas. a modal
 *    that pops ups making everything around go to kinda like opaque..."
 *
 * That sentence is the whole specification, and it draws a line that is easy to
 * blur in code:
 *
 *   STEP IN  changes WHERE YOU ARE.  The rest is EMPTIED. It is a navigation:
 *            it has an address, a breadcrumb, and a way back UP. It composes —
 *            you could step into a block inside a block.
 *   EXPAND   changes WHAT IS ON TOP. The rest is DIMMED, still there, still
 *            legible. It is a layer: it has a dismissal, not a way back up. It
 *            does not compose — a modal over a modal is a bug.
 *
 * ── WHY THIS IS NOT A TRUNK COMPONENT, AND MUST NOT BECOME ONE HERE ──────────
 *
 * CLAUDE.md's one rule gives a mechanical test for what may live in the kit:
 * "whether the answer can be computed from ONE component's own props, knowing
 * nothing about what else is on the canvas and nothing about what the pointer
 * is doing."
 *
 * Step-in fails that test as hard as anything could. Its entire subject is what
 * else is on the canvas — the siblings have to leave, the wires have to leave,
 * the grid has to leave, and in one reading the camera itself moves. It is
 * interaction geometry by the repo's own definition, so it is HOST-OWNED and
 * each host implements it. This file therefore lives outside `src/components/`
 * on purpose: it is not a registry candidate, it is the shared dictionary two
 * prototypes read so their answers stay comparable.
 *
 * What IS portable, and is all that lives here: the names, the numbers, and one
 * pure camera function (rect in, transform out — no DOM, no pointer).
 */

/* ------------------------------------------------------------------ */
/* The two modes                                                       */
/* ------------------------------------------------------------------ */

export type EnterMode = "board" | "step-in" | "expand";

/* ------------------------------------------------------------------ */
/* STEP IN — three readings of "the rest becomes empty canvas"          */
/* ------------------------------------------------------------------ */

/**
 * The variants differ on ONE axis, deliberately: **what happens to the space
 * you left**. Everything else (chrome dissolving, reading measure, the tone
 * plate, the breadcrumb, Escape) is held identical across all three, so the
 * comparison is about the thing being compared and nothing else.
 *
 *   dissolve  the world fades WHERE IT STANDS and the code cross-fades in,
 *             already centred. No travel at all — a film cut. The code is
 *             RE-MEASURED to the styling's own reading width.
 *   fly       the world does not move; the CAMERA does. The canvas pans and
 *             zooms until the block is centred, so the neighbours visibly
 *             sweep past on the way in and you retrace the move on the way
 *             out. The code is MAGNIFIED at its board measure, not re-measured
 *             — it stayed in the canvas, so it kept its column count.
 *   recede    the world neither fades nor moves — it drops BACK. The board
 *             scales down, blurs and desaturates toward the ground tone while
 *             the code rises to a plane in front of it. "Empty canvas" as
 *             depth rather than as erasure.
 *
 * The magnify-vs-re-measure split between `fly` and the other two is not an
 * implementation accident, it is the real trade-off of a camera reading: a
 * camera can only make the same 64 columns BIGGER, while lifting the code out
 * of the canvas is what lets it become 80 or 96 columns at the same glyph
 * size. For code specifically, more columns is usually worth more than bigger
 * glyphs — which is an argument against `fly` that `fly` should have to answer
 * on screen rather than in prose.
 */
export type StepInVariantId = "dissolve" | "fly" | "recede";

export interface StepInVariant {
  id: StepInVariantId;
  name: string;
  /** One line for the in-app switcher. */
  blurb: string;
  /** Does the code get re-laid-out at the reading measure, or magnified as-is? */
  measure: "re-measured" | "magnified";
}

export const STEP_IN_VARIANTS: StepInVariant[] = [
  {
    id: "dissolve",
    name: "dissolve",
    blurb: "the world fades where it stands; the code cross-fades in, already centred. No travel.",
    measure: "re-measured",
  },
  {
    id: "fly",
    name: "fly to it",
    blurb: "nothing is re-laid-out — the camera pans and zooms in. You retrace the move on the way out.",
    measure: "magnified",
  },
  {
    id: "recede",
    name: "recede",
    blurb: "the board drops back — scaled, blurred, desaturated — and the code rises in front of it.",
    measure: "re-measured",
  },
];

export const DEFAULT_STEP_IN_VARIANT: StepInVariantId = "dissolve";

/* ------------------------------------------------------------------ */
/* Tone — Zach's "small tone difference"                               */
/* ------------------------------------------------------------------ */

/**
 * Zach: "I guess its interesting then if the code editor background kinda
 * matches the canvas background... perhaps just a small tone difference, then
 * it could look quite good..."
 *
 * So the question is a NUMBER, and it should be visible and defensible rather
 * than eyeballed. `delta` is OKLCH lightness, subtracted from the stage
 * ground — the plate is a shallow WELL in the canvas, not a card floating on
 * it. Downward is the only direction with room on a white canvas (the lab's
 * `--background` is `oklch(1 0 0)`), and it is also what a light IDE theme
 * does: the editor surface sits a touch below the chrome around it.
 *
 * `flush` and `card` are the two ENDS, and they are included precisely because
 * they are wrong — `flush` has no surface at all so the code floats in space,
 * `card` is a visible document and stops being "kinda matching the canvas".
 * A slider whose extremes are both defensible is not measuring anything.
 */
export interface ToneStop {
  id: string;
  name: string;
  /** OKLCH lightness subtracted from the stage ground. */
  delta: number;
  note: string;
}

export const TONE_STOPS: ToneStop[] = [
  { id: "flush", name: "flush · Δ0", delta: 0, note: "no surface at all — the code sits directly on the canvas ground" },
  { id: "whisper", name: "whisper · Δ0.014", delta: 0.014, note: "Zach's 'small tone difference' — an edge you find rather than see" },
  { id: "paper", name: "paper · Δ0.030", delta: 0.03, note: "a surface you notice without reading it as a card" },
  { id: "card", name: "card · Δ0.055", delta: 0.055, note: "deliberately too far — this is a document ON the canvas, not IN it" },
];

export const DEFAULT_TONE = "whisper";

export const toneStop = (id: string): ToneStop => TONE_STOPS.find((t) => t.id === id) ?? TONE_STOPS[1];

/**
 * The plate colour for a tone stop, as an `oklch()` string.
 *
 * `groundL` is the stage ground's own OKLCH lightness — 1 for the lab's white
 * canvas. Clamped at 0 so a pathological delta cannot produce an invalid
 * colour, which `oklch()` would silently drop, leaving the plate transparent
 * and the finding un-seeable.
 */
export const plateColor = (groundL: number, delta: number): string =>
  `oklch(${Math.max(0, groundL - delta).toFixed(4)} 0 0)`;

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/**
 * Held identical across the three variants so the comparison is about the
 * IDEA and not about one of them simply being faster. 420ms is long enough to
 * read as a place-change rather than a toggle, and short enough that a second
 * press does not feel blocked.
 */
export const MOTION = {
  /** The whole transition, in ms. */
  durationMs: 420,
  /** The world leaving is quicker than the code arriving, in every variant. */
  worldMs: 300,
  /** How far ahead of the move the chrome finishes dissolving. */
  chromeMs: 260,
  /** Decelerating; nothing here should overshoot — code is not a toy. */
  ease: "cubic-bezier(0.22, 0.61, 0.36, 1)",
} as const;

/* ------------------------------------------------------------------ */
/* The camera — the only maths, and the only thing worth unit-testing   */
/* ------------------------------------------------------------------ */

export interface CameraFit {
  scale: number;
  tx: number;
  ty: number;
  /** Which branch produced `ty`, so a test and a report can name it. */
  anchor: "centre" | "top";
}

export interface CameraFitArgs {
  /** The target's box in CANVAS-LOCAL coordinates (untransformed). */
  target: { x: number; y: number; width: number; height: number };
  /** The untransformed canvas origin, in viewport coordinates. */
  canvasOrigin: { x: number; y: number };
  /** The visible region the target must land inside, in viewport coordinates. */
  viewport: { x: number; y: number; width: number; height: number };
  /** How wide the target should end up, in px. */
  measurePx: number;
  /** Breathing room at the top when the target is too tall to centre. */
  padTopPx?: number;
  minScale?: number;
  maxScale?: number;
}

/**
 * Where to put the camera so `target` lands centred at `measurePx` wide.
 *
 * Pure: rects in, a transform out. Written to pair with
 * `transform-origin: 0 0` and `transform: translate(tx px, ty px) scale(s)` —
 * with that origin a canvas-local point `p` lands at
 * `canvasOrigin + p * scale + t`, which is the whole derivation.
 *
 * WHY the top-anchor branch exists: a code block is usually TALLER than the
 * viewport once magnified, and centring something taller than its container
 * pushes its top off-screen — so stepping into a long cell would drop you into
 * the MIDDLE of the code with the first line above the fold. Anchoring the top
 * whenever the scaled height does not fit is what makes "stepped into" mean
 * "reading from the beginning". Ours, ad hoc: this is two lines of similar
 * triangles, not a port of anyone's viewport library.
 */
export function cameraFit(args: CameraFitArgs): CameraFit {
  const { target, canvasOrigin, viewport, measurePx } = args;
  const minScale = args.minScale ?? 0.4;
  const maxScale = args.maxScale ?? 2.5;
  const padTop = args.padTopPx ?? 32;

  const wanted = target.width > 0 ? measurePx / target.width : 1;
  const scale = Math.min(maxScale, Math.max(minScale, wanted));

  const tx = viewport.x + viewport.width / 2 - canvasOrigin.x - (target.x + target.width / 2) * scale;

  const scaledHeight = target.height * scale;
  // `padTop` is what you apply once you have GIVEN UP on fitting — it is not
  // part of the fit test. Requiring it here made a block exactly as tall as the
  // viewport fail to "fit" and get top-anchored, throwing away 32px off the
  // bottom of something that would have sat perfectly. Caught by the identity
  // case in tokens.test.ts.
  const fits = scaledHeight <= viewport.height;
  const ty = fits
    ? viewport.y + viewport.height / 2 - canvasOrigin.y - (target.y + target.height / 2) * scale
    : viewport.y + padTop - canvasOrigin.y - target.y * scale;

  return { scale, tx, ty, anchor: fits ? "centre" : "top" };
}
