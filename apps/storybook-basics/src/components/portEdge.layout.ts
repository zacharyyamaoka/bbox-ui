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

/** Zach's rule for the "Offset" preset: the trailing edge's push-in is the
 * leading edge's port count times its gap — an approximation (ignores card
 * size, assumes both edges share one gap) meant as a starting point. */
export function offsetPaddingFor(count: number, gap: number): number {
  return count * gap;
}

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
