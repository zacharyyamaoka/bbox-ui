/**
 * src/components/portSpacing.layout.ts — the pure constraint maths behind a
 * `PortEdge`'s Custom spacing mode: where each slot may sit along its wall
 * once the author drags it, and where it starts when the mode is entered.
 *
 * Zach, 2026-09-22: "Prototype toggle between auto and custom spacing on the
 * expanded port edge ... in custom: You just need to respect the ordering of
 * ports — and there is a minimum spacing requirement as well". His sketch
 * draws the Custom wall with two ports close together near the bottom and a
 * red bracket between them labelled "Min space requirement".
 *
 * So Custom is NOT free positioning any more (it was: `freeOffsets` accepted
 * any number >= 0, in any order — portEdge.tsx's `StandalonePortEdge` before
 * this file). Three rules hold for every value this module returns:
 *
 *   1. ORDER — slot `i` never sits past slot `i + 1`. The order is the
 *      `order` array (the edge's `items`), never the numbers themselves.
 *   2. MINIMUM GAP — adjacent PORT centres stay at least `minGap` apart. For
 *      a grouped slot (several ports in one box) that is measured from its
 *      LAST port to the next slot's FIRST port.
 *   3. SPAN — a slot's box stays inside the track's content box
 *      (`[0, span - size]`): below a block's header, above its bottom inset.
 *
 * Units are the SAME as `PortEdgeProps.freeOffsets`: each slot's LEADING
 * edge, in px from the start of the track's content box. No DOM here.
 *
 * Ours, ad hoc — no prior art is claimed. The envelope (`L`/`R` below) is the
 * ordinary earliest/latest-start bound of a chain of minimum separations; it
 * is derived here, not ported.
 */
import { PORT_EDGE_SLOT_MIN_PX } from "./blockPort.layout";
import { clamp, type Distribution } from "./portEdge.layout";

/**
 * The minimum centre-to-centre distance between two adjacent ports in Custom.
 *
 * = `PORT_EDGE_SLOT_MIN_PX` (24, blockPort.layout.ts:83), the fixed main-axis
 * footprint of one port slot — itself the mirror of `portEdge.tsx`'s
 * `EMPTY_SLOT_MIN_PX` (portEdge.tsx:638), pinned equal by `ClassicDag`. At
 * exactly this pitch two slot boxes TOUCH and never overlap, so the dot (12px
 * at `md`), its 40px hit halo's centre and the one-line label all stay inside
 * their own slot. It is the tightest pitch at which the rail's existing
 * geometry still holds — the auto `aligned` rail's pitch (`railPitchPx()`,
 * 24 + 18 = 42) is that footprint plus a comfort gap Custom deliberately
 * lets the author give up.
 */
export const MIN_PORT_GAP_PX = PORT_EDGE_SLOT_MIN_PX;

/** Sub-pixel slack for "is this pair held at the minimum gap". */
const TIGHT_EPSILON_PX = 0.5;

/**
 * What happens when a dragged port meets a neighbour — a taste call, shipped
 * as a switch:
 *   - `"stop"`: the dragged port clamps against its neighbour; nothing else
 *     moves.
 *   - `"push"`: neighbours are shoved along ahead of it, order and gaps
 *     intact, until they reach the end of the span.
 */
export type CustomNeighbourMode = "stop" | "push";

export interface PortSpacingOptions {
  /** Slot ids in track order — the ONLY source of order. */
  order: string[];
  /** Minimum centre-to-centre gap between adjacent ports. */
  minGap: number;
  /** Length of the track's content box along its main axis, px. */
  span: number;
  /** Main-axis size of one single-port slot box. */
  slotSize: number;
  /** A slot's own main-axis size when it is not `slotSize` (a grouped slot).
   *  Missing ids use `slotSize`. */
  sizes?: Record<string, number>;
  mode: CustomNeighbourMode;
  /** The slot being dragged, if any. Without it the call is a plain
   *  validation: `mode` does not matter. */
  active?: string;
}

export interface PortSpacingResult {
  /** Leading-edge offset for every id in `order`, and no other id. */
  offsets: Record<string, number>;
  /**
   * The degenerate case: the span cannot hold every slot at the minimum gap.
   *
   * RULE (decided here, pinned in portSpacing.layout.test.ts): ORDER and the
   * MINIMUM GAP win, the span loses. Slots pack from the span's start at
   * exactly the minimum pitch and run past its far end. Rejected
   * alternative: squeezing them into the span, which is exactly the overlap
   * the minimum gap exists to forbid — a dot hanging past the wall is
   * visible and fixable (grow the block), two dots on one pixel are neither.
   * In this state every slot is pinned, so a drag moves nothing.
   */
  overflow: boolean;
  /** Adjacent pairs held at exactly the minimum gap, in track order — what
   *  the drag-time "min space" marker draws between. */
  tightPairs: [string, string][];
}

function sizeOf(id: string, options: PortSpacingOptions): number {
  return options.sizes?.[id] ?? options.slotSize;
}

/** Minimum distance from slot `i`'s leading edge to slot `i + 1`'s. */
function steps(options: PortSpacingOptions): number[] {
  const { order, minGap, slotSize } = options;
  return order.slice(0, -1).map((id) => sizeOf(id, options) - slotSize + minGap);
}

/**
 * Earliest (`lo`) and latest (`hi`) leading edge each slot can take with
 * every other slot packed as tightly as the rules allow. When the span is too
 * short `hi < lo`, and `clamp` (portEdge.layout.ts) then returns `lo` — which
 * is how the overflow rule above falls out without a special case.
 */
function envelope(options: PortSpacingOptions): { lo: number[]; hi: number[] } {
  const { order, span } = options;
  const n = order.length;
  const step = steps(options);
  const lo = new Array<number>(n).fill(0);
  const hi = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) lo[i] = lo[i - 1] + step[i - 1];
  if (n > 0) hi[n - 1] = span - sizeOf(order[n - 1], options);
  for (let i = n - 2; i >= 0; i--) hi[i] = hi[i + 1] - step[i];
  return { lo, hi };
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clamp every slot into its envelope, then one forward pass lifting each slot
 * to at least one step past its predecessor. Given `positions[i] <= hi[i]`
 * for all i, the lift can never push a slot past its own `hi` (its
 * predecessor is at most `hi[i-1] = hi[i] - step`), so the result satisfies
 * all three rules. Idempotent on an already-valid layout.
 */
function normalize(positions: number[], lo: number[], hi: number[], step: number[]): number[] {
  const out = positions.map((p, i) => clamp(p, lo[i], hi[i]));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + step[i - 1]);
  return out;
}

/**
 * The constraint function. `requested` holds where each slot WANTS to be —
 * typically the current layout with the dragged slot's value replaced by the
 * pointer's. A missing or non-finite id is treated as 0.
 */
export function constrainPortPositions(requested: Record<string, number>, options: PortSpacingOptions): PortSpacingResult {
  const { order, span, active, mode } = options;
  const n = order.length;
  const step = steps(options);
  const { lo, hi } = envelope(options);
  const wanted = order.map((id) => (finite(requested[id]) ? requested[id] : 0));
  const a = active === undefined ? -1 : order.indexOf(active);

  let positions: number[];
  if (a < 0) {
    positions = normalize(wanted, lo, hi, step);
  } else if (mode === "stop") {
    // Neighbours hold still (normalised first, so a stale baseline cannot
    // leave the dragged slot a window that breaks a rule); the dragged slot
    // clamps inside the gap they leave it. Its own request is kept OUT of
    // that normalisation — as `-Infinity` it settles at the earliest slot its
    // predecessor allows, which on a valid baseline moves nobody — or the
    // pointer's value would shove the neighbours it is meant to stop at.
    const baseline = wanted.slice();
    baseline[a] = Number.NEGATIVE_INFINITY;
    const others = normalize(baseline, lo, hi, step);
    const floor = a > 0 ? Math.max(lo[a], others[a - 1] + step[a - 1]) : lo[a];
    const ceiling = a < n - 1 ? Math.min(hi[a], others[a + 1] - step[a]) : hi[a];
    others[a] = clamp(wanted[a], floor, ceiling);
    positions = normalize(others, lo, hi, step);
  } else {
    // Push: the dragged slot may go anywhere its envelope allows; whatever it
    // runs into moves ahead of it, both directions.
    const pushed = wanted.map((p, i) => clamp(p, lo[i], hi[i]));
    for (let i = a + 1; i < n; i++) pushed[i] = Math.max(pushed[i], pushed[i - 1] + step[i - 1]);
    for (let i = a - 1; i >= 0; i--) pushed[i] = Math.min(pushed[i], pushed[i + 1] - step[i]);
    positions = normalize(pushed, lo, hi, step);
  }

  const offsets: Record<string, number> = {};
  order.forEach((id, i) => {
    offsets[id] = positions[i];
  });
  const tightPairs: [string, string][] = [];
  for (let i = 0; i < n - 1; i++) {
    if (positions[i + 1] - positions[i] - step[i] < TIGHT_EPSILON_PX) tightPairs.push([order[i], order[i + 1]]);
  }
  const overflow = n > 0 && lo[n - 1] > span - sizeOf(order[n - 1], options) + TIGHT_EPSILON_PX;
  return { offsets, overflow, tightPairs };
}

/**
 * Whether a stored Custom layout is still valid AS-IS: exactly one finite
 * offset per slot in `order` (no missing id, no stale one), and every rule
 * already holding — validation would not move anything.
 */
export function customOffsetsValid(stored: Record<string, number>, options: PortSpacingOptions): boolean {
  const keys = Object.keys(stored);
  if (keys.length !== options.order.length) return false;
  if (!options.order.every((id) => finite(stored[id]))) return false;
  const { offsets } = constrainPortPositions(stored, { ...options, active: undefined });
  return options.order.every((id) => Math.abs(offsets[id] - stored[id]) < TIGHT_EPSILON_PX);
}

/**
 * Rule 5 — the edge changed underneath a Custom layout (a port added, removed
 * or reordered). Re-validated rather than reset:
 *   - the heights the author chose survive: the surviving ports' offsets,
 *     sorted, are handed back out in the NEW order, so a reorder makes two
 *     ports trade places instead of one being shoved down the wall;
 *   - a new port starts at its Auto position;
 *   - then the ordinary validation settles order, gap and span.
 */
export function revalidateCustomOffsets(
  stored: Record<string, number>,
  auto: Record<string, number>,
  options: PortSpacingOptions,
): Record<string, number> {
  const present = options.order.filter((id) => finite(stored[id]));
  const heights = present.map((id) => stored[id]).sort((x, y) => x - y);
  const requested: Record<string, number> = {};
  present.forEach((id, i) => {
    requested[id] = heights[i];
  });
  for (const id of options.order) if (!(id in requested)) requested[id] = auto[id] ?? 0;
  return constrainPortPositions(requested, { ...options, active: undefined }).offsets;
}

/**
 * The Custom layout to show.
 *
 * `entering` (rule 4 — Auto -> Custom just happened): a stored layout that is
 * still valid for the current order and count is RESTORED; anything else
 * starts from the Auto positions, so nothing jumps. WHY restore-if-valid
 * rather than always re-seeding: a Custom -> Auto -> Custom round trip is a
 * peek at the Auto layout, and throwing away the heights the author dragged
 * for that would punish looking. WHY not restore a PARTLY valid layout (say,
 * one port added while in Auto): the author never saw it in Custom, so
 * "restore" would invent heights for a layout nobody chose.
 *
 * Not entering (already in Custom): a valid stored layout is used as-is, an
 * invalid one is re-validated (rule 5, `revalidateCustomOffsets`).
 */
export function resolveCustomOffsets(
  stored: Record<string, number>,
  auto: Record<string, number>,
  options: PortSpacingOptions,
  entering: boolean,
): Record<string, number> {
  const validation = { ...options, active: undefined };
  if (customOffsetsValid(stored, validation)) return constrainPortPositions(stored, validation).offsets;
  if (entering) return constrainPortPositions(auto, validation).offsets;
  return revalidateCustomOffsets(stored, auto, validation);
}

/**
 * Where Auto mode's flexbox puts each slot's leading edge, for slots of
 * possibly different sizes — the snapshot Auto -> Custom starts from.
 *
 * `distribute` is `mainAxisPositions` (portEdge.layout.ts, CSS Box Alignment
 * Level 3's content distribution) generalised from one uniform card size to
 * a per-slot size; with uniform sizes the numbers are identical, which
 * portSpacing.layout.test.ts pins. `aligned` packs from its anchor with the
 * explicit gap, after `edgePadding` — exactly what `distributionStyle`
 * emits (the padding on the anchor side moves the content start).
 */
export function autoSlotOffsets(order: string[], sizes: Record<string, number>, span: number, distribution: Distribution): Record<string, number> {
  const n = order.length;
  const size = order.map((id) => sizes[id] ?? 0);
  const total = size.reduce((sum, s) => sum + s, 0);
  let first = 0;
  let gap = 0;
  if (distribution.mode === "aligned") {
    gap = distribution.gap;
    const packed = total + gap * Math.max(n - 1, 0);
    first = distribution.anchor === "start" ? distribution.edgePadding : span - distribution.edgePadding - packed;
  } else if (n > 0) {
    const free = Math.max(span - total, 0);
    if (n === 1) {
      first = distribution.scheme === "space-between" ? 0 : free / 2;
    } else if (distribution.scheme === "space-between") {
      gap = free / (n - 1);
    } else if (distribution.scheme === "space-evenly") {
      gap = free / (n + 1);
      first = gap;
    } else {
      gap = free / n;
      first = gap / 2;
    }
  }
  const offsets: Record<string, number> = {};
  let cursor = first;
  order.forEach((id, i) => {
    offsets[id] = cursor;
    cursor += size[i] + gap;
  });
  return offsets;
}
