// src/components/trace.layout.ts — ported by value from
// `packages/bbox-ui/src/trace.layout.ts` (`b5b2778`, "Implement the Trace
// edge primitive"), itself ported from SystemSketch's
// `connectionPresentation.ts`. Two hops, stated the way `port.tsx:3-16`
// already models it, so drift against either ancestor stays visible.
//
// What ported OVER verbatim: every function and constant below. The donor
// module is already pure — no React, no host engine, no DOM, no FieldSpec —
// so "copy-and-strip" strips nothing here; the file arrives whole, comments
// included.
//
// What's ADDED (docs/TRACE-PLAN.md P1, "the endpoint contract — frozen here
// so lanes never negotiate"): `Point`, `TraceDir`, `OPPOSITE_DIR`,
// `TraceTerminalSpec`, `TraceRouting`, `TraceMarkerEnd`, and the
// `polylinePath` serializer. Lanes B/C/D code against those names.
//
// What's LEFT BEHIND: nothing from this file. The cascade pieces that DID
// stay behind live in `trace.tsx`'s own header (`tone`, `PaintToken`,
// `Pill`/`TraceLabel`, `trace.fields.ts`).

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
 * v3 hex-encoded the id's UTF-8 bytes via `TextEncoder`, reasoning that a
 * bijective transform would GENUINELY never collide — true for well-formed
 * Unicode, but adversarial review found a THIRD real counter-example:
 * `TextEncoder` is only defined over well-formed text, and per the WHATWG
 * encoding spec it replaces any LONE (unpaired) UTF-16 surrogate with
 * U+FFFD before encoding to UTF-8 — a real, lossy step this function's own
 * doc comment had missed. `"\uD800"` (a lone high surrogate), `"\uDC00"`
 * (a lone low surrogate), and the literal replacement character all encode
 * to the identical UTF-8 bytes and therefore the identical id. A JS string
 * is technically a sequence of UTF-16 CODE UNITS, not well-formed Unicode
 * text — `"\uD800"` is a perfectly legal (if unusual) JS string, so
 * "well-formed Unicode" was silently narrower than "any input."
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

/**
 * DEVIATION from the donor's own label map, and the only one here
 * (docs/TRACE-PLAN.md D1): the variant is still NAMED `delayed` — renaming
 * it would fork the vocabulary from `packages/bbox-ui` for a caption's
 * worth of gain — but Zach's name for the look is "Dotted", so the
 * human-facing label reads Dotted while the prop value stays `delayed`.
 */
export const TRACE_VARIANT_LABELS: Record<TraceVariant, string> = {
  data: "Data",
  async: "Async",
  delayed: "Dotted",
};

/** Whether a trace paints an arrowhead at its `to` end. Inlined from the
 * donor's `trace.fields.ts` (`TRACE_MARKER_ENDS`) — the values travel, the
 * FieldSpec around them does not. */
export const TRACE_MARKER_ENDS = ["arrow", "none"] as const;
export type TraceMarkerEnd = (typeof TRACE_MARKER_ENDS)[number];

/* ------------------------- the endpoint contract -------------------------- */
/* Frozen by docs/TRACE-PLAN.md so Lanes A-D never negotiate it. ADDED here,   */
/* not ported — the donor package has no terminal concept at all.              */

export interface Point {
  x: number;
  y: number;
}

/**
 * Flow tangent at a terminal — the direction the arrow glyph points, i.e.
 * the direction data travels THROUGH that point. Same vocabulary as the
 * elbow router's `ElbowSide` ("top" = flow upward).
 *
 * WHY there are four of these and not eight: a port's (face, polarity) pair
 * maps onto a flow tangent exactly 2-to-1. An output emits along its face
 * normal (`tangent = face`); an input receives against it
 * (`tangent = opposite(face)`). So input-on-top-face and
 * output-on-bottom-face draw as the identical glyph — a circle with a
 * downward arrow. Zach's own correction: "really 4 options not 8 because
 * top input is the same as bottom output." `TraceTerminal` therefore takes
 * NO polarity prop at all; which end is which comes from the `from`/`to`
 * slot (the arrowhead rides the `to` end), never from the glyph.
 */
export type TraceDir = "top" | "right" | "bottom" | "left";

export const TRACE_DIRS = ["top", "right", "bottom", "left"] as const;

export const OPPOSITE_DIR: Record<TraceDir, TraceDir> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

export interface TraceTerminalSpec {
  x: number;
  y: number;
  dir: TraceDir;
}

/** Declared in P1 so Lanes B/C widen nothing later; P2 implements
 * `straight`/`slanted`/`curved`, P3 `elbow`. */
export type TraceRouting = "straight" | "slanted" | "curved" | "elbow";

/**
 * What a cable draws as when nobody says.
 *
 * WHY: "by default elbow arrows should always be used. never straight
 * arrows" — Zach, 2026-09-19, looking at `Pasted image 20260919114952.png`
 * (Source → A → B → Sink drawn as diagonal chords). The other three
 * routings remain SELECTABLE — `straight` is still what a caller gets by
 * asking for it, and `TraceRouting.stories.tsx` still draws all four side
 * by side — but none of them is ever what a caller gets by saying nothing.
 *
 * It lives HERE, beside the union it names, and not in `trace.tsx`, because
 * three unrelated seams have to agree on it: the `Trace` component's own
 * prop default, `WireLayer`'s resolution (which must know the answer BEFORE
 * it decides whether to collect keep-outs), and the tldraw host's overlay.
 * A default spelled three times is how "never straight" becomes true in two
 * hosts and false in the third.
 */
export const DEFAULT_TRACE_ROUTING: TraceRouting = "elbow";

/**
 * The router's side for each end, from the frozen contract:
 *
 *   side(from) = from.dir                 // the wire LEAVES along the flow
 *   side(to)   = OPPOSITE_DIR[to.dir]     // it ARRIVES travelling to.dir,
 *                                         // so its free space is behind it
 *
 * Matching the elbow router's own doc ("an output port leaves 'right', an
 * input enters 'left'"): output-right => side `right`; input-left => flow
 * `right`, side `left`.
 */
export function traceSideOf(terminal: TraceTerminalSpec, end: "from" | "to"): TraceDir {
  return end === "from" ? terminal.dir : OPPOSITE_DIR[terminal.dir];
}

/** The unit screen-space vector a `TraceDir` points along. SVG's y grows
 * DOWNWARD, so "top" is -y. */
export const DIR_VECTOR: Record<TraceDir, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Clockwise degrees to rotate a +x-pointing glyph so it points `dir`.
 * (SVG `rotate()` is clockwise-positive precisely because y grows down.) */
export const DIR_ROTATION: Record<TraceDir, number> = {
  right: 0,
  bottom: 90,
  left: 180,
  top: 270,
};

/* ------------------------------- geometry -------------------------------- */

export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

/**
 * Points -> an SVG `d`. SERIALIZATION, not derivation: `Trace` still never
 * invents a point (`trace.tsx`'s promise, and `ARCHITECTURE.md`'s) — a
 * caller that already HAS the vertices uses this instead of hand-rolling
 * string concatenation at every call site. P2's curved routing does not use
 * it; that path is cubic.
 */
export function polylinePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** The point a fraction `t` of the arc length along the polyline. */
export function pointAtFraction(points: readonly Point[], t: number): Point {
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
export function fractionNearest(points: readonly Point[], p: Point): number {
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

/* --------------------------- path addressing (D4) -------------------------- */
/*
 * One 1-D coordinate scheme for anything that rides a trace's polyline —
 * `TraceBadge`'s pill (widened, not replaced) and the new `TraceMark`
 * (./traceMark.tsx). Ruling 4, verbatim: "Interesting idea for marks on
 * cable getting 1d coordinate... we already support this for the
 * placement of the pill... if there is a pill already we don't likely
 * want to render it directly on the pill." Two mature libraries converged
 * on the same shape independently — maxGraph's label geometry
 * (`x ∈ [-1..1]` + orthogonal offset) and JointJS's `distance` (px,
 * percent, or negative-from-the-end) + perpendicular `offset` — which is
 * the argument FOR unifying rather than inventing a third vocabulary.
 *
 * `PathAddress` is deliberately two cases, not three: a plain fraction
 * (the currency `TraceBadge` already speaks) and `{px}` (JointJS's own
 * arc-length-pixels case). There is no percent-string case — a fraction
 * already IS a percent (`0.2` === `20%`), so adding `"20%"` would just be
 * a second spelling of the same number.
 */
export type PathAddress = number | { px: number };

/**
 * `PathAddress` -> a resolved arc-length fraction, clamped to `[0, 1]` —
 * NOT `clampLabelPosition`'s 0.05..0.95 band. That band exists so a
 * *label* never sits ON a terminal and reads as part of it
 * (`LABEL_POSITION_MIN`/`MAX`'s own doc, above); a `TraceMark` pinned to
 * the BROKEN end of a dangling edge (`{px: -24}`) needs exactly the
 * opposite — the whole `[0, 1]` range, end included. Callers that DO want
 * the label band (`TraceBadge`) apply `clampLabelPosition` themselves,
 * after this function, the same order `TraceBadge` already resolved `t`
 * before clamping it.
 *
 * Two provenances, and they are NOT the same claim:
 *
 * - `{px: n}` with `n < 0` measuring from the path's END is
 *   BEHAVIOUR-DERIVED from JointJS's own `Path.pointAtLength` negative
 *   branch (dist `joint.js:7802-7808` — the validation-stack oracle
 *   session ran it live: `distance:-20` landed ~28px from the target end).
 *   MPL-2.0; reimplemented from the observed behaviour, no JointJS source
 *   copied.
 * - Negative FRACTIONS resolving the same way (`f < 0` -> `t = 1 + f`) are
 *   OURS, built deliberately for symmetry — NOT a port. The same oracle
 *   session ran JointJS's own PERCENT form (`distance: '-20%'`) and found
 *   it does the opposite: it clamps negative percentages to the SOURCE
 *   end instead of counting from the target end (`joint.js:8047-8068`).
 *   So "negative counts from the end" is true for JointJS's px case and
 *   false for its own percent case — we chose the symmetric interpretation
 *   deliberately rather than inheriting either one by "analogy". `-0`
 *   behaves as `0` (`-0 < 0` is `false` in JS) — pass the literal `1` for
 *   the exact end.
 */
export function resolvePathAddress(points: readonly Point[], address: PathAddress): number {
  if (typeof address === "number") {
    const t = address < 0 ? 1 + address : address;
    return Math.min(1, Math.max(0, t));
  }
  const total = polylineLength(points);
  if (!(total > 0) || !Number.isFinite(address.px)) return 0;
  const t = address.px < 0 ? 1 + address.px / total : address.px / total;
  return Math.min(1, Math.max(0, t));
}

/**
 * The unit tangent (flow direction) of the polyline at arc-length fraction
 * `t` — what `TraceMark` rotates its perpendicular `offsetPx` against so a
 * mark rides beside the line rather than floating at a fixed screen angle.
 * Falls back to the first non-degenerate segment (then to a bare
 * rightward unit vector) when the chosen segment has zero length — a
 * repeated point in `points` must never divide by zero.
 */
export function tangentAtFraction(points: readonly Point[], t: number): Point {
  if (points.length < 2) return { x: 1, y: 0 };
  const total = polylineLength(points);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    if (target <= segment || index === points.length - 1) {
      if (segment > 0) return { x: dx / segment, y: dy / segment };
      break;
    }
    target -= segment;
  }
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    if (segment > 0) return { x: dx / segment, y: dy / segment };
  }
  return { x: 1, y: 0 };
}

export interface PathPlacement {
  t: number;
  widthPx: number;
  /** Never moved — the pill's own slot, when one is already parked here. */
  pinned?: boolean;
}

/**
 * OURS, AD HOC — not a port. The justification is the gap itself: the
 * validation-stack oracle session ran JointJS's own `ToolsView`
 * positioning live and found ZERO collision avoidance — two
 * `distance:'50%'` tools landed at the IDENTICAL pixel
 * (`getBoundingClientRect` equal to the last digit; z-order was DOM
 * append order, `joint.js:37752-37820`). Nothing to port; this is
 * written fresh.
 *
 * Pinned placements never move. Every unpinned placement is nudged, in
 * the order given, to the nearest arc-length position that clears every
 * placement resolved so far (pinned ones plus earlier unpinned ones) by
 * at least `gapPx` of clear path, measured edge-to-edge in pixels along
 * `lengthPx`. Ties between "push right" and "push left" favour whichever
 * is closer to the placement's own requested `t`; a genuine tie favours
 * the right (higher-`t`) side, arbitrarily but deterministically.
 *
 * Returns one resolved fraction per input placement, in input order,
 * each clamped to `[0, 1]`.
 */
export function separateAlongPath(lengthPx: number, placements: readonly PathPlacement[], gapPx = 8): number[] {
  const length = Number.isFinite(lengthPx) && lengthPx > 0 ? lengthPx : 0;
  const half = (p: PathPlacement) => Math.max(0, p.widthPx) / 2;
  const toPx = (p: PathPlacement) => Math.min(1, Math.max(0, p.t)) * length;

  interface Interval {
    lo: number;
    hi: number;
  }
  const settled: Interval[] = [];
  const resultPx: number[] = new Array(placements.length).fill(0);

  // Pinned placements are fixed obstacles, resolved first regardless of
  // their position in the input array — an unpinned placement earlier in
  // the array must still yield to a pinned one that appears later.
  placements.forEach((p, index) => {
    if (!p.pinned) return;
    const pos = toPx(p);
    resultPx[index] = pos;
    settled.push({ lo: pos - half(p), hi: pos + half(p) });
  });

  placements.forEach((p, index) => {
    if (p.pinned) return;
    let pos = toPx(p);
    const h = half(p);
    // Bounded re-check: moving to clear one interval can land inside
    // another. `settled.length + 1` passes is always enough to walk clear
    // of every existing interval once, because each pass resolves at
    // least the interval(s) it was pushed to avoid.
    for (let pass = 0; pass <= settled.length; pass += 1) {
      const overlapping = settled.filter((iv) => pos - h - gapPx < iv.hi && pos + h + gapPx > iv.lo);
      if (overlapping.length === 0) break;
      const rightEdge = Math.max(...overlapping.map((iv) => iv.hi)) + gapPx + h;
      const leftEdge = Math.min(...overlapping.map((iv) => iv.lo)) - gapPx - h;
      const right = Math.min(length, rightEdge);
      const left = Math.max(0, leftEdge);
      const distRight = Math.abs(right - pos);
      const distLeft = Math.abs(left - pos);
      pos = distLeft < distRight ? left : right;
    }
    pos = Math.min(length, Math.max(0, pos));
    resultPx[index] = pos;
    settled.push({ lo: pos - h, hi: pos + h });
  });

  return resultPx.map((pos) => (length > 0 ? Math.min(1, Math.max(0, pos / length)) : 0));
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
 * gap-packet-gap mark. The cadence itself never changes.
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
 * The keyframe's own from->to span. CSS can't reference this constant
 * directly — `globals.css`'s `@keyframes bbox-trace-march` hardcodes the
 * same `10`/`0` literally — so this exists as the pinned value a test
 * checks the CSS against, catching drift if `DATA_MARCH_DASH_PX` ever
 * changes without the keyframes changing to match. `Trace.stories.tsx`'s
 * `Styles` play function is that test.
 */
export const DATA_MARCH_DASHOFFSET_PX = DATA_MARCH_DASH_PX * 2;
/** The class `globals.css` hangs the keyframes on. `traceStrokeStyle`
 * returns only this NAME — never the keyframes themselves — so every Trace
 * on a page marches at one speed off one definition. */
export const DATA_MARCH_CLASS = "bbox-trace-march";

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
