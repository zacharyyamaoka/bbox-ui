/**
 * src/components/portEdge.layout.ts — the pure data/math half of PortEdge,
 * ported by value from `demos/dndkit-lab/src/{types,layout,grouping}.ts`
 * and (Stage 6's new piece) `groupSyntax.ts` on the unmerged
 * `claude/dndkit-lab` branch, commit 5898ecb (docs/PORT-EDGE-PLAN.md's D2:
 * copy the lab's LOGIC as props, never merge the branch).
 *
 * Generalized in exactly one place versus the donor: `computeSlots`/
 * `buildColorMap` read the lab's fixed module-level `CARD_IDS` constant;
 * here they take the caller's own id list, since `PortEdge` has no fixed
 * card roster of its own. Everything else — `mainAxisPositions`,
 * `distributionStyle`, the grouping/clustering algorithm, the group-syntax
 * parser — is unchanged math.
 *
 * DONOR LINE NUMBERS, so a re-sync is a diff and not a search. All four
 * files read at commit 5898ecb on 2026-09-17 (`git show 5898ecb:<path>`;
 * the branch is unmerged but the commit is in this repo, so these resolve
 * offline forever):
 *
 *   • `layout.ts:39-69`   `mainAxisPositions` — byte-identical arithmetic.
 *   • `layout.ts:71-74`   `clamp`.
 *   • `grouping.ts:111-127` `computeSlots` — the one generalization above.
 *     The donor's line 121 reads `CARD_IDS.filter((cid) => ...)`; here that
 *     is `order.filter(...)`. Its third parameter is also widened, from the
 *     donor's `clustered: boolean` to this file's three-state `mode`.
 *   • `grouping.ts:129+`  `PALETTE`, and `buildColorMap` below it.
 *   • `groupSyntax.ts`    (72 lines) the whole group-syntax parser.
 *
 * PRIOR ART, for the one function here that implements a published spec
 * rather than a local convention — see `mainAxisPositions`' own docblock.
 * Everything else in this file is ad hoc: `computeSlots` is a stable
 * group-by preserving first-appearance order, and no prior art is claimed
 * for it.
 */
import type { CSSProperties } from "react";

import type { Diagnostic } from "./highlighter";
import type { PortState } from "./port";
import type { BlockSide } from "./port.layout";

/* ------------------------------------------------------------------ */
/* PortEdgeItem — moved here (W1, 2026-09-18) from portEdge.tsx so the   */
/* anchor registry below can name it in `PortLayoutFn`'s own signature   */
/* without portEdge.layout.ts importing BACK from portEdge.tsx (that     */
/* file already imports FROM this one — the reverse would be circular). */
/* portEdge.tsx re-exports this under the same name, so every existing   */
/* `import { PortEdgeItem } from "./portEdge"` call site is unaffected.  */
/* ------------------------------------------------------------------ */

/** One draggable unit on an edge. `state` defaults to `"empty"` when a
 *  caller's story never bothers to set it. */
export interface PortEdgeItem {
  id: string;
  label: string;
  state?: PortState;
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's PortEdge row):
   * "nothing on the rail itself" — forwarded straight to the `LabeledPort`
   * the default render draws for this item; the PORT is the subject, the
   * rail is furniture. A host's own `renderItem` override is responsible
   * for forwarding this itself if it wants the mark.
   */
  diagnostics?: Diagnostic[];
  /** Forwarded straight to the `LabeledPort` the default render draws for
   *  this item — same "nothing on the rail itself, the PORT is the
   *  subject" rule `diagnostics` follows, one row up. See
   *  `PortDotPaintInput.availability`'s own doc
   *  (docs/INVALID-STATES-PLAN.md D5, ruling 5). */
  availability?: "available" | "unavailable";
  /**
   * The port's TYPE — drawn by the default `LabeledPort` as the muted
   * secondary run after the name (lane `ports`, 2026-09-19: "label small
   * inside the row, type secondary"), and the source of the by-type
   * variants' colour. Optional: a port with no type renders the name alone.
   */
  type?: string;
  /** An explicit CSS colour for the type, winning over the palette. */
  typeColor?: string;
  /**
   * How many cables meet this port — the fan-in/fan-out count the
   * `producers-count` lane computes from the scene and the port renders
   * as a count circle riding the dot (Zach, 2026-09-19: one attach point
   * in the centre, plus "the producer circle that has the number").
   * Forwarded to the default `LabeledPort`; a host `renderItem` forwards
   * it itself, same rule as `diagnostics`.
   */
  producers?: number;
  /** Host-set selection, forwarded to the default `LabeledPort`. */
  selected?: boolean;
  /**
   * P-056. The line this port contributes to the MULTI-LINE LANE, when that
   * is not the same string as `label`. Omit — the normal case, and every
   * story on this file — and the lane shows `label`, exactly as before.
   *
   * WHY the two can differ at all, which is not obvious from inside this
   * component: a host may paint a port's line in two places with two
   * different amounts of room. SystemSketch's block rail paints only the NAME
   * HALF of `gain_x: float`, and that is a measured ruling rather than a
   * shortcut — two annotated labels flowing inward from opposite walls of a
   * 160px card overlap by 73px of unreadable text
   * (`apps/systemsketch/src/shapes/block/BlockFace.tsx`'s `labelOf`). The
   * lane is an overlay beside the rail and has the room, so it is the one
   * surface that can show — and therefore edit — the whole declaration. With
   * one field for both, typing `gain_y: int` into the lane would splice a
   * colon into a name and produce `gain_y: int: float`.
   *
   * `formatPortLane`/`reconcilePortLane` (./portLane.ts) are the only readers,
   * and they write an edited line back into whichever of the two fields the
   * item actually declared — see `withPortLaneLine` there.
   */
  laneLine?: string;
}

/* ------------------------------------------------------------------ */
/* Spacing — demos/dndkit-lab/src/types.ts + layout.ts                 */
/* ------------------------------------------------------------------ */

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

export type AlignAnchor = "start" | "end";

export interface DistributeConfig {
  mode: "distribute";
  scheme: SpacingScheme;
}

export interface AlignConfig {
  mode: "aligned";
  anchor: AlignAnchor;
  /** px gap between cards. */
  gap: number;
  /** Extra px pushed in from the anchor edge, on top of the container's
   *  own padding — what makes one edge's ports start further along than
   *  another's. */
  edgePadding: number;
}

/** How a PortEdge lays its cards out along its main axis. `distribute` is
 *  the three space-* schemes (spreads across the whole container).
 *  `aligned` packs cards from one end with an explicit gap instead — the
 *  mode a real port edge needs, since "space-between" reflows every port's
 *  position the instant a sibling edge's count changes. */
export type Distribution = DistributeConfig | AlignConfig;

export const DEFAULT_ALIGN_GAP = 18;

/**
 * Lane E → Lane D (docs/FEEDBACK-2026-09-17c-PLAN.md, Lane E's own scoping
 * note): a `PortEdge` is one edge — it has no idea which of a Block's other
 * three edges carry ports, so it cannot decide its own default
 * `Distribution`. `BlockPort` is the one component that sees all four, so
 * this is the rule IT must apply; exported here (not duplicated as a
 * literal in blockPort.tsx) so both sides read the same source of truth:
 *
 *   • any populated edge is top or bottom → EVERY edge defaults to
 *     `{ mode: "distribute", scheme: "space-around" }` — `SPACING_SCHEMES`'
 *     own "Around" entry, Zach's "Distribute and Around" wording for it.
 *   • populated edges are left/right only → EVERY edge defaults to
 *     `{ mode: "aligned", anchor: "start" }` (the classic single-port-view
 *     packing: `DEFAULT_ALIGN_GAP`, no extra edge padding).
 *   • an explicit per-edge `distribution` from the caller always wins —
 *     this function only supplies what a caller omitted.
 *
 * `mainAxisPositions`'s own `space-around` branch already centres a lone
 * item with no `count === 1` special case beyond the one CSS itself
 * requires (see that function's own docblock) — verified, not
 * re-implemented, by `PortEdge.stories.tsx`'s `EdgeDistributionControls`.
 */
// Overloads so a caller passing a literal gets the NARROW arm back. Without
// them the return is the `Distribution` union, and `BlockPort` — which
// layers its own `gap`/`edgePadding` onto the aligned arm — cannot spread the
// result without TypeScript objecting that `gap` is absent from
// `DistributeConfig`. Narrowing here keeps the one-rule seam usable instead
// of pushing every caller back to a duplicated literal.
export function defaultDistributionForEdges(hasRowEdgePopulated: true): DistributeConfig;
export function defaultDistributionForEdges(hasRowEdgePopulated: false): AlignConfig;
export function defaultDistributionForEdges(hasRowEdgePopulated: boolean): Distribution;
export function defaultDistributionForEdges(hasRowEdgePopulated: boolean): Distribution {
  return hasRowEdgePopulated
    ? { mode: "distribute", scheme: "space-around" }
    : { mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 };
}

export interface Size {
  width: number;
  height: number;
}

// Must match the inline padding/border PortEdge's own track applies below.
export const CONTAINER_PADDING = 14;
export const CONTAINER_BORDER = 2;

/** The box a free-positioned card is actually laid out in: the padding box. */
export function innerBoxSize(size: Size): Size {
  return { width: size.width - 2 * CONTAINER_BORDER, height: size.height - 2 * CONTAINER_BORDER };
}

/**
 * Reproduces CSS flexbox `justify-content` main-axis positions, so
 * switching into free-position ("Custom") mode can snapshot exactly where
 * the browser had already placed each card — no DOM measurement needed.
 */
/**
 * Where each card's leading edge sits along the main axis. Ported from
 * `demos/dndkit-lab/src/layout.ts:39-69` @ 5898ecb, arithmetic unchanged.
 *
 * PRIOR ART — this is not invented, it is CSS Box Alignment Level 3's
 * content-distribution, reimplemented in numbers because a host that places
 * ports on a canvas needs the POSITIONS, not a flex container. Spec read
 * 2026-09-17 at https://www.w3.org/TR/css-align-3/; each branch below
 * matches its normative definition, quoted:
 *
 *   space-between — "The first alignment subject is placed flush with the
 *     start edge of the alignment container, the last alignment subject is
 *     placed flush with the end edge" → first position 0, gap free/(n-1).
 *   space-evenly  — "with a full-size space on either end … the spacing
 *     between any two adjacent alignment subjects, before the first … and
 *     after the last … is the same" → gap free/(n+1), first at gap.
 *   space-around  — "with a half-size space on either end … the spacing
 *     before the first and after the last alignment subject is half the
 *     size of the other spacing" → gap free/n, first at gap/2.
 *
 * The `count === 1` branch is the one place the spec does not decide the
 * answer for us (there is no "between" with one subject); it reproduces
 * what browsers actually do, which is the donor's own stated reason at
 * `layout.ts:49-52` — "Matches browser behaviour". Not re-measured here.
 */
export function mainAxisPositions(count: number, mainSize: number, cardMain: number, scheme: SpacingScheme): number[] {
  if (count === 0) return [];
  const free = Math.max(mainSize - count * cardMain, 0);

  if (count === 1) {
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

/**
 * The main-axis CSS for a track given its Distribution. `distribute` reuses
 * the browser's own space-* keywords. `aligned` packs from one end with a
 * real `gap`, plus — when `edgePadding` is set — extra padding on that same
 * anchor side.
 */
export function distributionStyle(axis: "row" | "column", distribution: Distribution): CSSProperties {
  if (distribution.mode === "distribute") {
    return { justifyContent: distribution.scheme };
  }
  const style: CSSProperties = {
    justifyContent: distribution.anchor === "start" ? "flex-start" : "flex-end",
    gap: distribution.gap,
  };
  if (distribution.edgePadding > 0) {
    const prop =
      axis === "row"
        ? distribution.anchor === "start"
          ? "paddingLeft"
          : "paddingRight"
        : distribution.anchor === "start"
          ? "paddingTop"
          : "paddingBottom";
    (style as Record<string, number>)[prop] = CONTAINER_PADDING + distribution.edgePadding;
  }
  return style;
}

/**
 * Zach's rule for the "Offset" preset: the trailing edge's push-in clears
 * every leading slot AND the gap after it — `count * (slotMainPx + gap)`.
 *
 * FIXED 2026-09-17 (docs/PROPOSALS-2026-09-17.md P9a — the recorded IOU).
 * The original shipped as `count * gap`, which ignored the slots
 * themselves and under-shot by `count * slotMainPx` (72px for 3 empty
 * 24px slots at the default gap) — enough that the trailing lane's first
 * port lands INSIDE the leading lane's last slot instead of clear below
 * it, i.e. the two lanes visually interleave. `slotMainPx` has no default
 * here (unlike `blockPort.layout.ts`'s `offsetEdgePaddingPx`, which this
 * now matches formula-for-formula): this module is PortEdge's own generic
 * math and doesn't own a slot-size constant — `EMPTY_SLOT_MIN_PX` lives in
 * `portEdge.tsx`, `PORT_EDGE_SLOT_MIN_PX` in `blockPort.layout.ts` — so a
 * caller states its own slot size rather than this file guessing one.
 * Still an approximation in the one way the original docblock named and
 * this fix doesn't touch: a uniform `slotMainPx` assumes every leading
 * slot is the same size, which is only true with `showCard` off (a
 * variable-width card lane needs a caller-side sum over real slot rects,
 * not a closed form).
 *
 * `apps/storybook-basics/src/components/OffsetPaddingFor.stories.tsx`'s
 * `OverlaidOffsetLanes` story is the regression: it renders two PortEdge
 * tracks sharing one coordinate frame with this formula as the trailing
 * track's `edgePadding`, and asserts — via real `getBoundingClientRect`
 * boxes — that no trailing slot's main-axis span overlaps a leading one's.
 * Restoring the old `count * gap` turns that story red (mutation-tested;
 * see the story file's own header for the transcript).
 */
export function offsetPaddingFor(count: number, slotMainPx: number, gap: number): number {
  return Math.max(0, count) * (slotMainPx + gap);
}

/* ------------------------------------------------------------------ */
/* Anchor registry (W1, 2026-09-18) — a PortLayoutFn maps the items on   */
/* one rail to the points they sit at; a host asks for one by name       */
/* instead of switching on a closed union of arrangement kinds. Named    */
/* `Anchor`, not `PortAnchor` (docs/WORK-ORDER-2026-09-18.md, W1's own    */
/* "Naming" section): scoped to ports here, but the same idea             */
/* `blockMembers`' free/stack modes and `traceBadge`'s `{t,o}` drag        */
/* already reimplement — a name that doesn't paint itself into a ports-   */
/* only corner is what keeps a later unification cheap.                  */
/*                                                                        */
/* WHY `x`/`y` are plain numbers, not yet centred on a card (2026-09-18): */
/* a `PortLayoutFn` only ever learns `rail.mainSize`/`cardMain` along ONE */
/* axis — it has no idea how tall/wide the perpendicular axis is, so it   */
/* cannot itself compute where "centred" falls there. `axisAnchor` below  */
/* reports the plain leading-edge position (`mainAxisPositions`'s own     */
/* convention) on the rail's axis and `0` on the other; `portEdge.tsx`,   */
/* the one caller that actually knows the box's full size, is what turns  */
/* that into a real on-screen point (see its own `railAnchor` doc) — the  */
/* split that keeps a `PortLayoutFn` a pure function of a 1-D rail rather  */
/* than requiring every registrant to re-derive a 2-D box it was never    */
/* given enough information to reason about.                             */
/* ------------------------------------------------------------------ */

/** A point a layout places one member at. `side`/`angle` are not read by
 *  `PortEdge` itself — they exist for a LATER consumer of this same
 *  registry (a Block's members, a trace badge's `{t, o}` drag) that needs
 *  more than a bare point; a `PortLayoutFn` may set either, and a caller
 *  that doesn't care is free to ignore them. */
export interface Anchor {
  x: number;
  y: number;
  side?: BlockSide;
  angle?: number;
}

/** What a `PortLayoutFn` is told about the rail it's placing members on:
 *  its length along its own axis (`mainSize`), the fixed footprint every
 *  member occupies (`cardMain` — PortEdge's slots are square, so this is
 *  both dimensions of one member), which screen axis that length runs
 *  along, and the pixel gap the caller wants between members (only
 *  consulted by a layout that packs from an anchor rather than
 *  distributing across the full `mainSize`). */
export interface PortLayoutRail {
  mainSize: number;
  cardMain: number;
  axis: "row" | "column";
  gap: number;
}

/** `items` in, `Anchor[]` out, one per item, same order and length as
 *  `items`. `args` is deliberately untyped: a registrant defines its own
 *  shape (the built-ins below read an `AlignConfig` or nothing) and a
 *  caller that doesn't know a given layout's `args` shape simply omits
 *  it — this file cannot enumerate every layout that will ever register
 *  here, so it does not try to type their configs. */
export type PortLayoutFn = (items: readonly PortEdgeItem[], rail: PortLayoutRail, args?: unknown) => Anchor[];

const portLayoutRegistry = new Map<string, PortLayoutFn>();

/** Registers (or replaces) a named layout. A story or host component calls
 *  this once, at module scope, before any `<PortEdge>` asks for it by
 *  name — the same "register before use" contract a router or a command
 *  palette uses, chosen over a closed union so a NEW layout (an ellipse,
 *  an arc — see `PortEdge.AnchorLayouts.stories.tsx`) never has to touch
 *  this file to exist. */
export function registerPortLayout(name: string, fn: PortLayoutFn): void {
  portLayoutRegistry.set(name, fn);
}

/** Looks a layout up by name; `undefined` if nothing registered it. */
export function portLayout(name: string): PortLayoutFn | undefined {
  return portLayoutRegistry.get(name);
}

/** The plain leading-edge-on-this-axis, zero-on-the-other anchor every
 *  built-in linear layout below returns — see this section's own WHY for
 *  why the cross coordinate can't be anything more specific than `0` from
 *  inside a `PortLayoutFn`. */
function axisAnchor(rail: PortLayoutRail, mainPos: number): Anchor {
  return rail.axis === "row" ? { x: mainPos, y: 0 } : { x: 0, y: mainPos };
}

/** Wraps `mainAxisPositions` for one fixed `SpacingScheme` — registered
 *  three times below (once per scheme) so a caller asks for
 *  `portLayout("space-around")` etc. by the same name `SPACING_SCHEMES`
 *  already uses, rather than one layout plus a second scheme parameter a
 *  caller would have to remember to pass. */
function distributeLayout(scheme: SpacingScheme): PortLayoutFn {
  return (items, rail) => mainAxisPositions(items.length, rail.mainSize, rail.cardMain, scheme).map((pos) => axisAnchor(rail, pos));
}

for (const { value } of SPACING_SCHEMES) {
  registerPortLayout(value, distributeLayout(value));
}

/**
 * The `aligned` config as a layout: packs from `anchor` with `gap`
 * (`rail.gap`) between members, `edgePadding` pushing the WHOLE run in
 * from that same edge — arithmetic equivalent to what
 * `distributionStyle`'s `justifyContent: flex-start|flex-end` + CSS `gap`
 * + the extra `padding*` it adds already produced, restated as pixel
 * positions instead of CSS a browser resolves for us (this component no
 * longer lays these cards out as flex children — see portEdge.tsx's own
 * `PortEdgeBody`/`AnchorSlotCard` doc for why owning the pixels here is
 * what let `neutralizeScale`/comment B1 be deleted). `args` is expected
 * to be the `AlignConfig` half of the edge's own `Distribution`; a caller
 * that omits it gets the same defaults `distributionStyle` already
 * assumed (`anchor: "start"`, `DEFAULT_ALIGN_GAP`, no edge padding).
 */
registerPortLayout("aligned", (items, rail, args) => {
  const cfg = (args as AlignConfig | undefined) ?? { mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 };
  const gap = cfg.gap;
  const pitch = rail.cardMain + gap;
  const n = items.length;
  return Array.from({ length: n }, (_, i) => {
    const mainPos =
      cfg.anchor === "start"
        ? cfg.edgePadding + i * pitch
        : rail.mainSize - cfg.edgePadding - rail.cardMain - (n - 1 - i) * pitch;
    return axisAnchor(rail, mainPos);
  });
});

/* ------------------------------------------------------------------ */
/* Grouping — demos/dndkit-lab/src/grouping.ts, generalized off the     */
/* caller's own id list instead of a fixed CARD_IDS constant.           */
/* ------------------------------------------------------------------ */

export interface GroupAssignment {
  groupId: string;
  order: number;
}

export interface GroupingSetDef {
  id: string;
  label: string;
  description: string;
  /** Deliberately partial — an id missing here is not an error. Every id
   *  still resolves to SOME group: `resolveAssignment` falls back to the
   *  id's own value (a singleton group of one). */
  assignments: Record<string, GroupAssignment>;
}

export interface Slot {
  slotId: string;
  members: { id: string; order: number }[];
}

export function resolveAssignment(id: string, set: GroupingSetDef): GroupAssignment {
  return set.assignments[id] ?? { groupId: id, order: 0 };
}

/**
 * Walks the flat id order and clusters same-group ids into one slot each,
 * positioned wherever that group's first member currently sits — the
 * mechanism that makes "move together" and drag-as-one-unit the same thing:
 * whichever slot a drag relocates carries every member with it, in BOTH
 * `"grouped"` and `"collapsed"` mode (`"off"` never clusters). What differs
 * between the two is drawn by the caller, not by this function: `"grouped"`
 * still renders every member's own port (portEdge.tsx's `SlotBody` lays
 * them out along the edge's own axis, at the SAME pitch the rest of the
 * edge uses — B5/B7), `"collapsed"` renders the whole slot as one ×N chip
 * (unchanged — B8). Keeping the CLUSTERING itself unified here is what
 * keeps "grouped members drag as a unit" true for free: it's one
 * `useSortable` id either way, so dnd-kit's own live-reorder preview never
 * has to be taught about a multi-id unit.
 */
export function computeSlots(order: string[], set: GroupingSetDef, mode: "off" | "grouped" | "collapsed"): Slot[] {
  if (mode === "off") {
    return order.map((id) => ({ slotId: id, members: [{ id, order: 0 }] }));
  }
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const id of order) {
    const { groupId } = resolveAssignment(id, set);
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    const members = order
      .filter((cid) => resolveAssignment(cid, set).groupId === groupId)
      .map((cid) => ({ id: cid, order: resolveAssignment(cid, set).order }))
      .sort((a, b) => a.order - b.order);
    slots.push({ slotId: groupId, members });
  }
  return slots;
}

/* ------------------------------------------------------------------ */
/* The overflow decision — RULING 7's "comes from the port edge         */
/* implementation" half.                                               */
/* ------------------------------------------------------------------ */

/** What a `maxVisible` cut leaves behind. Pure data: no DOM, no chrome,
 *  no wording — the caller (`editor/portOverflowChip.tsx` today) decides
 *  how, or whether, to say it. */
export interface SlotOverflow {
  /** The slots that stay on the track. */
  visible: Slot[];
  /** The slots cut from the track entirely — not grouped, not collapsed,
   *  gone. */
  hidden: Slot[];
  /** How many PORTS those cut slots held. See the WHY below for why this
   *  is not `hidden.length`. */
  hiddenPortCount: number;
}

/**
 * Split an edge's slots at `maxVisible` (undefined — the normal case —
 * cuts nothing).
 *
 * WHY: Zach, ruling 7 on the "+X more" chip — "ideally this just comes
 * from the port edge implementation... but YOu do need to provide the
 * chrome to do this... should be in bbox-editor". This function is the
 * first half of that split, and it is pure precisely so the second half
 * (the chrome, in `editor/`) can be swapped without the COUNT ever being
 * recomputed by whoever draws it. A chip that counts for itself is a
 * second source of truth for the same fact.
 *
 * WHY `hiddenPortCount` sums MEMBERS rather than counting cut slots:
 * grouping merges N ports into one slot box, so a cut landing past a real
 * group hides N ports in one slot. `hidden.length` would report "+1 more"
 * for a family of four — a false count, which
 * `feedback_truthful_property_rendering` rules out just as firmly for a
 * number as for a label.
 */
export function splitByMaxVisible(slots: Slot[], maxVisible: number | undefined): SlotOverflow {
  if (maxVisible == null) return { visible: slots, hidden: [], hiddenPortCount: 0 };
  const cut = Math.max(0, maxVisible);
  const visible = slots.slice(0, cut);
  const hidden = slots.slice(cut);
  return { visible, hidden, hiddenPortCount: hidden.reduce((n, s) => n + s.members.length, 0) };
}

/**
 * The pixel gap BETWEEN adjacent top-level slot boxes a `Distribution`
 * actually produces on the edge's main axis — the same number flexbox
 * computes via CSS `gap` (`aligned`) or `justify-content` (`distribute`),
 * derived analytically (mirrors `mainAxisPositions`'s own per-scheme math)
 * rather than measured from the DOM.
 *
 * WHY a grouped (not collapsed) slot needs this at all (B5/B7): its members
 * render side by side INSIDE one slot, at their own internal `gap` — for
 * the whole edge's port-to-port pitch to stay uniform, that internal gap
 * must equal exactly this inter-slot gap, and every slot's own main-axis
 * box (`slotMainPx`) must be the same fixed size a single-port slot uses.
 * Given both of those, the "gap between box edges" flexbox guarantees is
 * uniform is the SAME gap on both sides of a group, so port-to-port
 * distance works out uniform everywhere: between two ungrouped ports,
 * between an ungrouped port and a group's near edge, and inside the group.
 */
export function interSlotGapPx(distribution: Distribution, containerMainPx: number, slotCount: number, slotMainPx: number): number {
  if (distribution.mode === "aligned") return distribution.gap;
  if (slotCount <= 1) return 0;
  const free = Math.max(containerMainPx - slotCount * slotMainPx, 0);
  switch (distribution.scheme) {
    case "space-between":
      return free / (slotCount - 1);
    case "space-evenly":
      return free / (slotCount + 1);
    case "space-around":
      return free / slotCount;
  }
}

export const PALETTE = [
  "#f59e0b", // amber
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#fb7185", // rose
  "#84cc16", // lime
  "#38bdf8", // sky
  "#fb923c", // orange
  "#e879f9", // fuchsia
];

/** One colour per real (>1 member) group, in first-appearance order —
 *  stable and legible, not hashed. */
export function buildColorMap(order: string[], set: GroupingSetDef): Map<string, string> {
  const sizes = new Map<string, number>();
  for (const id of order) {
    const { groupId } = resolveAssignment(id, set);
    sizes.set(groupId, (sizes.get(groupId) ?? 0) + 1);
  }
  const groupOrder: string[] = [];
  for (const id of order) {
    const { groupId } = resolveAssignment(id, set);
    if ((sizes.get(groupId) ?? 0) > 1 && !groupOrder.includes(groupId)) groupOrder.push(groupId);
  }
  const map = new Map<string, string>();
  groupOrder.forEach((groupId, i) => map.set(groupId, PALETTE[i % PALETTE.length]));
  return map;
}

/* ------------------------------------------------------------------ */
/* Group syntax — claude/dndkit-lab's groupSyntax.ts (5898ecb), net-new */
/* on that branch, ported unchanged (already generic over `knownIds`).  */
/* ------------------------------------------------------------------ */

/**
 * Zach, 2026-09-12: groups are something the EDGE assigns, not a value a
 * port carries. One textarea, one line per group, each a bracketed (or
 * bare) comma-separated list of ids: `[args,kwargs]`, `(args, kwargs)`,
 * and `args, kwargs` all parse identically. A line resolving to fewer than
 * 2 known members is dropped silently (a group of one is just an
 * ungrouped port) rather than treated as an error.
 */
const BRACKET_PAIRS: [string, string][] = [
  ["(", ")"],
  ["{", "}"],
  ["[", "]"],
];

function unwrap(line: string): string {
  for (const [open, close] of BRACKET_PAIRS) {
    if (line.startsWith(open) && line.endsWith(close)) return line.slice(1, -1);
  }
  return line;
}

export interface ParsedGroups {
  assignments: Record<string, GroupAssignment>;
  /** Ids named in the text that aren't a port on this edge — surfaced so a
   *  typo is visible, but never blocking. */
  unknownIds: string[];
}

export function parseGroupSyntax(text: string, knownIds: string[]): ParsedGroups {
  const known = new Set(knownIds);
  const assignments: Record<string, GroupAssignment> = {};
  const unknownIds: string[] = [];
  const lines = text
    .split("\n")
    .map((line) => unwrap(line.trim()).trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    const members = line
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (members.length < 2) return;
    const groupId = `g${lineIndex}`;
    members.forEach((id, order) => {
      if (!known.has(id)) {
        unknownIds.push(id);
        return;
      }
      assignments[id] = { groupId, order };
    });
  });

  return { assignments, unknownIds };
}

export function groupingSetFromText(text: string, knownIds: string[]): { set: GroupingSetDef; unknownIds: string[] } {
  const { assignments, unknownIds } = parseGroupSyntax(text, knownIds);
  return {
    set: { id: "text", label: "Text groups", description: "Typed on the edge itself.", assignments },
    unknownIds,
  };
}

/* ------------------------------------------------------------------ */
/* portConstraintOf — the ELK rung a PortEdge's own props already imply  */
/* (W1, docs/WORK-ORDER-2026-09-18.md, "Also in this lane").             */
/* ------------------------------------------------------------------ */

/**
 * Maps `PortEdge`'s existing `mode`/`freeOffsets` pair onto the one
 * distinction ELK's layout actually needs — is this rail's ORDER pinned,
 * or is each member's absolute POSITION pinned. `mode: "custom"` is the
 * only time this component fixes a real x/y (`freeOffsets`); every
 * `"auto"` scheme (whichever `Distribution` is in play) only ever fixes
 * the sequence a registered `PortLayoutFn` then lays out, never a
 * literal position — so the mapping doesn't need to look at
 * `distribution` at all, only at `mode`.
 *
 * WHY no `FREE` / `FIXED_SIDE` / `FIXED_RATIO` (do not add them):
 * bbox-ui has no representation for "ELK may put this anywhere", "pinned
 * to a side but free along it", or "pinned to a fraction of the rail" —
 * this component only ever expresses "order is fixed" or "position is
 * fixed". Reporting a rung this component cannot actually honour would
 * be a lying adapter; a coarser, TRUE rung is worth more than a precise,
 * false one.
 */
export function portConstraintOf(props: { mode?: "auto" | "custom" }): "FIXED_ORDER" | "FIXED_POS" {
  return props.mode === "custom" ? "FIXED_POS" : "FIXED_ORDER";
}

/* ------------------------------------------------------------------ */
/* Variable-width slot packing (W1) — a real, not-collapsed GROUP is     */
/* WIDER than a single slot (`GroupSlotBody`'s own flex row: k member    */
/* boxes plus (k-1) of its own internal gap). The registry above cannot  */
/* express that: a `PortLayoutFn` only ever learns ONE uniform           */
/* `cardMain`, because `PortEdgeItem` carries no member count for it to  */
/* read one from. `portEdge.tsx` is the one caller that DOES know each   */
/* slot's real span, so it calls this — not the registry — whenever a    */
/* real group is present.                                                */
/* ------------------------------------------------------------------ */

/** A slot's real main-axis footprint: `cardMain` for an ordinary
 *  (singleton or collapsed) slot, or a real group's own row/column of
 *  `memberCount` boxes at `cardMain` plus `(memberCount - 1)` of the
 *  SAME `gap` `GroupSlotBody` lays its members out at. */
export function slotMainSpan(memberCount: number, cardMain: number, gap: number): number {
  return memberCount <= 1 ? cardMain : memberCount * cardMain + (memberCount - 1) * gap;
}

/**
 * Generalizes `mainAxisPositions`' own per-scheme leading-offset
 * convention (space-between: flush at 0; space-evenly/around: a leading
 * gap) and `aligned`'s pack-from-an-edge convention to variable spans,
 * walking slot-by-slot rather than dividing one uniform free space.
 * `gap` is the FIXED per-port pitch this file's `interSlotGapPx` already
 * derives (using the real PORT count, not the slot count) — using that
 * same fixed gap between every pair of REAL (possibly wider) slot boxes
 * is the self-consistency argument `interSlotGapPx`'s own doc proves:
 * it is the value that keeps a grouped edge's port-to-port pitch equal
 * to its own ungrouped pitch (A5's actual requirement), not merely
 * internally uniform.
 *
 * Not claimed byte-identical for a single (`spans.length <= 1`) real
 * group under a `distribute` scheme — `mainAxisPositions`' own
 * `count === 1` branch centres in the free space rather than applying a
 * leading offset, and no shipped story exercises that combination (a
 * lone real group IS a single slot, but `GroupedSpacing`, the story that
 * exercises real groups at all, always has ungrouped siblings beside
 * it) — flagged rather than silently assumed correct.
 */
export function packVariableSlotSpans(spans: number[], distribution: Distribution, gap: number, mainSize: number): number[] {
  const n = spans.length;
  const positions = new Array<number>(n);
  if (distribution.mode === "aligned" && distribution.anchor === "end") {
    let cursor = mainSize - distribution.edgePadding;
    for (let i = n - 1; i >= 0; i -= 1) {
      cursor -= spans[i];
      positions[i] = cursor;
      cursor -= gap;
    }
    return positions;
  }
  const leadingOffset =
    distribution.mode === "aligned"
      ? distribution.edgePadding
      : distribution.scheme === "space-between"
        ? 0
        : distribution.scheme === "space-evenly"
          ? gap
          : gap / 2; // space-around
  let cursor = leadingOffset;
  for (let i = 0; i < n; i += 1) {
    positions[i] = cursor;
    cursor += spans[i] + gap;
  }
  return positions;
}
