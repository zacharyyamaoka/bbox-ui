/**
 * packages/bbox-ui/src/trace.layout.ts
 *
 * `Trace`'s portable geometry — no React, no host engine, no DOM. A trace's
 * `path` and `length` are host-computed (React Flow's `getBezierPath`,
 * tldraw's own arrow info); everything here operates on the RESULT of that
 * math, never derives it.
 *
 * Ported from SystemSketch's `connectionPresentation.ts`, minus what
 * doesn't belong in a general primitive: the live `cablePresentation` atom
 * (a board-wide viewing preference, no equivalent concept in bbox-ui), its
 * localStorage read/write, and the `z⁻¹`/`mut` pill-glyph vocabulary
 * (SystemSketch's own dataflow semantics — see `trace.tsx`'s `TraceLabel`,
 * which takes arbitrary content instead).
 */

/**
 * A host's own trace/edge id (React Flow's edge `id`, a tldraw shape's
 * `id`) turned into a legal, GENUINELY COLLISION-FREE SVG element id.
 *
 * DEVIATION found by adversarial review, TWICE (2026-09-15) — first
 * against a strip-based version, then again against this function's own
 * first fix:
 *
 * v1 simply stripped every character outside `[a-zA-Z0-9_-]`, which is
 * LOSSY — `"edge.a"` and `"edgea"` both stripped down to the identical
 * `"edgea"`.
 *
 * v2 replaced that with a 32-bit FNV-1a hash, reasoning that hashing the
 * FULL id (rather than dropping characters) would "essentially never"
 * collide. That reasoning was wrong, and adversarial review found a real
 * counter-example in seconds: `"edge-e1e5ffef518ed9d7"` and
 * `"edge-e900fd5e0596d262"` both hash to the identical
 * `bbox-trace-head-1hghfsz`. A FIXED-SIZE hash is lossy by the pigeonhole
 * principle — 32 bits is only ~4.3 billion buckets, and the birthday bound
 * puts a 50% collision chance at ~77,000 random ids, not some safely
 * large number. "Essentially never" was an unverified guess, not a proof.
 *
 * v3 (this version) hex-encoded the id's UTF-8 bytes via `TextEncoder`,
 * reasoning that a bijective transform would GENUINELY never collide —
 * true for well-formed Unicode, but adversarial review found a THIRD
 * real counter-example: `TextEncoder` is only defined over well-formed
 * text, and per the WHATWG encoding spec it replaces any LONE (unpaired)
 * UTF-16 surrogate with U+FFFD before encoding to UTF-8 — a real, lossy
 * step this function's own doc comment had missed. `"\uD800"` (a lone
 * high surrogate), `"\uDC00"` (a lone low surrogate), and the literal
 * `"�"` character all encode to the identical UTF-8 bytes and
 * therefore the identical id. A JS string is technically a sequence of
 * UTF-16 CODE UNITS, not well-formed Unicode text — `"\uD800"` is a
 * perfectly legal (if unusual) JS string, so "well-formed Unicode" was
 * silently narrower than "any input."
 *
 * The actual fix: stop going through UTF-8 (or any text encoding) at
 * all. Encode each UTF-16 CODE UNIT directly — exactly what
 * `id.length`/`id.charCodeAt(i)` already read a JS string AS. This is a
 * bijection over the true, complete domain (every possible JS string,
 * lone surrogates included), not over "well-formed text," because it
 * never interprets the code units as anything — it just writes each one
 * down in hex.
 */
export function safeElementId(prefix: string, id: string): string {
  let hex = "";
  for (let i = 0; i < id.length; i += 1) {
    hex += id.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return `${prefix}-${hex}`;
}

export const TRACE_VARIANTS = ["data", "async", "delayed"] as const;
export type TraceVariant = (typeof TRACE_VARIANTS)[number];
export const TRACE_VARIANT_LABELS: Record<TraceVariant, string> = {
  data: "Data",
  async: "Async",
  delayed: "Delayed",
};

/* ------------------------------- geometry -------------------------------- */

export function polylineLength(points: readonly { x: number; y: number }[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

/** The point a fraction `t` of the arc length along the polyline. */
export function pointAtFraction(
  points: readonly { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const total = polylineLength(points);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= segment || index === points.length - 1) {
      const u = segment === 0 ? 0 : Math.min(1, target / segment);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    target -= segment;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * The arc-length fraction of the polyline point nearest `p` — where a
 * dragged label lands. Host-owned drag math (`labelPosition` is the
 * number a host WRITES back after a drag), kept here because it is pure.
 */
export function fractionNearest(points: readonly { x: number; y: number }[], p: { x: number; y: number }): number {
  if (points.length < 2) return 0.5;
  const total = polylineLength(points);
  if (total === 0) return 0.5;
  let best = { distance: Number.POSITIVE_INFINITY, length: 0 };
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    const u = segment === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segment * segment)));
    const qx = a.x + dx * u;
    const qy = a.y + dy * u;
    const distance = Math.hypot(p.x - qx, p.y - qy);
    if (distance < best.distance) best = { distance, length: walked + segment * u };
    walked += segment;
  }
  return best.length / total;
}

/* ------------------------------ label position ---------------------------- */

/** Kept off the terminals — a label sitting exactly on a port reads as
 * part of it, not a fact about the trace. Same bounds as SystemSketch's
 * own `PILL_POSITION_MIN`/`MAX` (`connectionModel.ts`). */
export const LABEL_POSITION_MIN = 0.05;
export const LABEL_POSITION_MAX = 0.95;
export const LABEL_POSITION_DEFAULT = 0.5;

export function clampLabelPosition(t: number): number {
  return Math.min(LABEL_POSITION_MAX, Math.max(LABEL_POSITION_MIN, t));
}

/* ------------------------------ dash arrays ------------------------------ */

/**
 * `async`: equal rests between small packet marks. SVG alternates paint
 * and gaps, so this reads as a 56-unit carrier, 4-unit micro-gap, 10-unit
 * packet, then another 4-unit micro-gap before the cadence repeats. Butt
 * caps keep the tiny gaps legible instead of visually closing them with
 * round end caps. Numbers unchanged from SystemSketch's own
 * `ASYNC_PACKET_DASHARRAY` — this is the board's visual grammar, not a
 * library's, and porting it is a rename of ownership, not a rewrite.
 */
export const ASYNC_CARRIER_PX = 56;
export const ASYNC_PACKET_GAP_PX = 4;
export const ASYNC_PACKET_PX = 10;
export const ASYNC_PACKET_DASHARRAY = `${ASYNC_CARRIER_PX} ${ASYNC_PACKET_GAP_PX} ${ASYNC_PACKET_PX} ${ASYNC_PACKET_GAP_PX}`;
export const ASYNC_CADENCE_PX = ASYNC_CARRIER_PX + ASYNC_PACKET_GAP_PX * 2 + ASYNC_PACKET_PX;

/**
 * Below one full cadence there is not enough path to reach both
 * micro-gaps, so phase just that short run to centre one complete
 * gap–packet–gap mark. The cadence itself never changes.
 */
export function asyncDashOffsetForLength(lengthPx: number): number {
  if (!Number.isFinite(lengthPx) || lengthPx >= ASYNC_CADENCE_PX) return 0;
  const packetMark = ASYNC_PACKET_GAP_PX * 2 + ASYNC_PACKET_PX;
  const markStart = Math.max(0, (Math.max(0, lengthPx) - packetMark) / 2);
  return ASYNC_CARRIER_PX - markStart;
}

/**
 * `data`, opt-in `animated`: React Flow's own homepage marching-ants line
 * (`stroke-dasharray: 5px`). Opt-in, never a default — the 2026-09-14
 * lesson `connectionPresentation.ts` already recorded: on-by-default
 * proved too loud.
 */
export const DATA_MARCH_DASH_PX = 5;
export const DATA_MARCH_DASHARRAY = `${DATA_MARCH_DASH_PX}`;
/**
 * The keyframe's own from→to span. CSS can't reference this constant
 * directly — `theme.css`'s `.bbox-trace-march` keyframes hardcode the
 * same `10`/`0` literally — so this exists as the pinned value a test
 * checks the CSS file's text against, catching drift if `DATA_MARCH_DASH_PX`
 * ever changes without the keyframes changing to match.
 */
export const DATA_MARCH_DASHOFFSET_PX = DATA_MARCH_DASH_PX * 2;

/** The dot: a zero-length dash with a round cap paints a disc of the
 * stroke width. */
export const DELAY_DOT_PX = 0.1;
export const DELAY_DOT_GAP_PX = 6;

/** `pathLength` the split paths are normalised to, so dashes are set in
 * path units rather than pixels — the split stays correct at any zoom. */
export const PATH_LENGTH_UNITS = 1000;

export interface SplitDashArrays {
  /** Solid up to the label, then a gap that outlasts the path. */
  before: string;
  /** A gap up to the label, then dotted to the end, then a gap that outlasts the path. */
  after: string;
}

/**
 * Hard ceiling on how many dot/gap pairs `splitDashArrays` ever builds.
 *
 * DEVIATION found by adversarial review (2026-09-15): the first version
 * of this function filled the dotted run with an open-ended
 * `while (covered < PATH_LENGTH_UNITS) { ...; covered += dot + dotGap }`
 * loop. For an ordinary `lengthPx` (tens to thousands of real pixels)
 * that terminates in well under 200 iterations — but nothing validated
 * `lengthPx`, and a pathologically large value (`Infinity`,
 * `Number.MAX_VALUE`, or anything astronomically large) drives `unit`
 * toward 0, so `dot`/`dotGap` underflow toward 0 and `covered` stops
 * advancing at all — a genuine infinite loop that crashed with
 * `RangeError: Invalid array length` once the array hit JS's engine
 * limit, found live by running exactly that input. A closed-form dot
 * COUNT, computed once and capped, replaces the loop outright: no input,
 * however degenerate, can make this function run unbounded work again.
 * The cap itself is generous for anything real — a normal `delayed`
 * trace's dotted run is under 200 dots even at large pixel lengths.
 */
const MAX_DELAY_DOTS = 2000;

/**
 * Two dash arrays that, drawn on the same path with `pathLength=1000`,
 * paint solid before the split point and dots after it. Each pattern ends
 * with a gap of a full path so SVG's repeating never spills one style
 * into the other's run.
 */
export function splitDashArrays(lengthPx: number, t: number): SplitDashArrays {
  const fraction = clampLabelPosition(t);
  const unit = Number.isFinite(lengthPx) && lengthPx > 0 ? PATH_LENGTH_UNITS / lengthPx : 1;
  const dot = DELAY_DOT_PX * unit;
  const dotGap = DELAY_DOT_GAP_PX * unit;
  const splitAt = fraction * PATH_LENGTH_UNITS;

  const before: number[] = [splitAt, PATH_LENGTH_UNITS];

  const pairSpan = dot + dotGap;
  const remaining = PATH_LENGTH_UNITS - splitAt;
  const dotCount = pairSpan > 0 && Number.isFinite(pairSpan)
    ? Math.min(MAX_DELAY_DOTS, Math.ceil(remaining / pairSpan))
    : 0;

  const after: number[] = [0, splitAt];
  for (let i = 0; i < dotCount; i += 1) after.push(dot, dotGap);
  after.push(0, PATH_LENGTH_UNITS);

  const round = (value: number) => Number(value.toFixed(3));
  return {
    before: before.map(round).join(" "),
    after: after.map(round).join(" "),
  };
}
