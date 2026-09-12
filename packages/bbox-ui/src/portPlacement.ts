/**
 * packages/bbox-ui/src/portPlacement.ts
 *
 * The zero-dependency placement model for a Block's Ports, per Zach's
 * 2026-09-12 ruling: a Block owns its Ports; a Block has n Arrangements
 * (states, minimum one "default"); each Arrangement has a mode (auto |
 * custom), a set of live edges, and optionally one grouping set. Each Port
 * stores, PER ARRANGEMENT, a `Placement` — both `order` and `t` are always
 * stored (never only one), because which one is authoritative flips with
 * mode: in auto, `order` is the truth and `t` is refreshed from the
 * closed-form even-spacing formula on every change (so flipping to custom
 * never jumps a card); in custom, `t` is the truth and `order = rank(t)` is
 * refreshed on every drop (so flipping back to auto reflows to the order
 * you left).
 *
 * This module ports the math verified in `demos/dndkit-lab/src/layout.ts`
 * (`mainAxisPositions`) and `demos/dndkit-lab/src/grouping.ts`
 * (`computeSlots`/`resolveAssignment`) into that per-Port, per-arrangement
 * placement record — it does not reinvent that behaviour.
 *
 * Zero-dependency discipline, matching `packages/schema`: no React, no DOM,
 * no host (tldraw / React Flow / dnd-kit) imports. The one import is a
 * type-only pull of `BlockSide` from `./port.layout`, erased at compile
 * time under `isolatedModules` — it carries no runtime dependency.
 */
import type { BlockSide } from "./port.layout";

export type PortEdgeId = BlockSide;

export type ArrangementMode = "auto" | "custom";

/**
 * The three CSS-flexbox-shaped spacing schemes `evenT` reproduces as plain
 * fractions — named after what they mean here (a value 0..1 along one
 * edge), not after the lab's `space-between` / `space-evenly` /
 * `space-around` CSS keywords, since there is no flex container or card
 * size at this layer, only points on a line.
 */
export type SpacingScheme = "between" | "evenly" | "around";

/**
 * One assignment set a Block can apply to its Ports for one Arrangement.
 * A port missing from `assignments` is its own singleton group — Zach's
 * "if no id, then is X id" rule, carried over from
 * `demos/dndkit-lab/src/grouping.ts`'s `resolveAssignment`.
 */
export interface GroupingSet {
  id: string;
  label: string;
  collapsed: boolean;
  assignments: Record<string, { group: string; groupOrder?: number }>;
}

export interface Arrangement {
  id: string;
  label: string;
  mode: ArrangementMode;
  spacing: SpacingScheme;
  /** The live edges for THIS arrangement. Order is not meaningful — see
   * `ALL_EDGES` for the canonical clockwise order everything else walks. */
  edges: PortEdgeId[];
  grouping?: GroupingSet;
}

/**
 * One Port's placement within ONE Arrangement. `order` and `t` are BOTH
 * always populated (see this file's header) — which one is live truth
 * depends on the owning Arrangement's `mode`, not on which fields happen
 * to be set.
 */
export interface Placement {
  edge: PortEdgeId;
  order: number;
  t: number;
  group?: string;
  groupOrder?: number;
}

/** One Arrangement's placements, keyed by port id. The page keeps one of
 * these per Arrangement per Block — this module never holds more than one
 * at a time, so it never needs to know a Block's or a Port's identity. */
export type Placements = Record<string, Placement>;

/** Canonical clockwise order, starting at top — the order `drawnEdge`
 * walks to find where a parked port should render, and the order
 * `toggleEdge` normalizes `edges` into. */
export const ALL_EDGES: PortEdgeId[] = ["top", "right", "bottom", "left"];

export const DEFAULT_ARRANGEMENT: Arrangement = {
  id: "default",
  label: "Default",
  mode: "auto",
  spacing: "evenly",
  edges: ALL_EDGES,
};

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampIndex(index: number, length: number): number {
  return Math.min(length, Math.max(0, index));
}

/**
 * The lab's `mainAxisPositions` (see `demos/dndkit-lab/src/layout.ts`)
 * expressed as fractions 0..1 along an edge, with no card size (a port is
 * a point, not a box) — so `free` is always the whole edge and the three
 * schemes reduce to these closed forms. `count === 1` is a deliberate
 * override to 0.5 for every scheme (not just the two non-`between` ones,
 * as the lab special-cases it): a single port centered on its edge is
 * always the right call, and `i / (n - 1)` is undefined at n = 1 anyway.
 */
export function evenT(count: number, spacing: SpacingScheme): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0.5];
  switch (spacing) {
    case "between":
      return Array.from({ length: count }, (_, i) => i / (count - 1));
    case "evenly":
      return Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
    case "around":
      return Array.from({ length: count }, (_, i) => (i + 0.5) / count);
  }
}

/**
 * The placement a newly created port gets: parked on the arrangement's
 * first live edge (in canonical clockwise order, not array-insertion
 * order — `edges` carries no ordering guarantee of its own), appended
 * after whatever is already stored on that edge. `t` starts at 0; auto
 * mode refreshes it to the real even-spacing value on the very next
 * `refresh()`, and custom mode leaves new ports stacked at the start
 * until dragged, which is the same "arrives at 0, gets moved" behaviour
 * every other custom-mode port has.
 */
export function defaultPlacement(
  portId: string,
  arrangement: Arrangement,
  existing: Placements,
): Placement {
  const edge = ALL_EDGES.find((e) => arrangement.edges.includes(e)) ?? arrangement.edges[0] ?? "top";
  const order = Object.values(existing).filter((p) => p.edge === edge).length;
  return { edge, order, t: 0 };
}

/**
 * Where a placement actually DRAWS: its stored edge if that edge is live
 * in this arrangement, else the nearest live edge walking clockwise
 * (top → right → bottom → left → top …) from the stored edge — never the
 * stored placement itself, which is untouched (an edge toggled back on
 * must find every port it lost exactly where it left them). If no edge
 * is live at all (a degenerate arrangement), the stored edge is returned
 * as the only thing left to draw.
 */
export function drawnEdge(placement: Placement, arrangement: Arrangement): PortEdgeId {
  if (arrangement.edges.includes(placement.edge)) return placement.edge;
  const startIndex = ALL_EDGES.indexOf(placement.edge);
  for (let step = 1; step <= ALL_EDGES.length; step++) {
    const candidate = ALL_EDGES[(startIndex + step) % ALL_EDGES.length];
    if (arrangement.edges.includes(candidate)) return candidate;
  }
  return placement.edge;
}

/**
 * Port ids drawn on `edge` (after parking), in the order they render:
 * auto mode trusts `order` as-is; custom mode trusts `t`, falling back to
 * `order` only to break an exact tie (two ports can share a `t` mid-drag
 * before the next `refresh()` fans them back out).
 */
export function laneOrder(placements: Placements, arrangement: Arrangement, edge: PortEdgeId): string[] {
  const ids = Object.keys(placements).filter((id) => drawnEdge(placements[id], arrangement) === edge);
  if (arrangement.mode === "auto") {
    return ids.sort((a, b) => placements[a].order - placements[b].order);
  }
  return ids.sort((a, b) => {
    const byT = placements[a].t - placements[b].t;
    return byT !== 0 ? byT : placements[a].order - placements[b].order;
  });
}

/**
 * Re-derives whichever field is NOT the current mode's truth, per lane
 * (a lane is every drawn edge, including one a degenerate arrangement
 * parks everyone onto). Pure and idempotent: running it twice in a row on
 * its own output changes nothing, because each mode's derived field is a
 * stable function of the field it trusts.
 *
 * A locked id (the function port, at most one per Block — see
 * `lockedPlacement`) is skipped entirely: it neither gets reassigned nor
 * consumes a rank slot other ports are counted against, matching "never
 * draggable" — its corner placement is not part of the lane's spacing
 * math at all.
 */
export function refresh(placements: Placements, arrangement: Arrangement, locked?: Set<string>): Placements {
  const isLocked = locked ?? new Set<string>();
  const next: Placements = { ...placements };
  const edges = new Set<PortEdgeId>();
  for (const id of Object.keys(placements)) edges.add(drawnEdge(placements[id], arrangement));

  for (const edge of edges) {
    const ids = laneOrder(placements, arrangement, edge).filter((id) => !isLocked.has(id));
    if (arrangement.mode === "auto") {
      const ts = evenT(ids.length, arrangement.spacing);
      ids.forEach((id, i) => {
        next[id] = { ...next[id], order: i, t: ts[i] };
      });
    } else {
      ids.forEach((id, i) => {
        next[id] = { ...next[id], order: i };
      });
    }
  }
  return next;
}

/**
 * Moves one port to `edge` at the given index (auto) or `t` (custom,
 * clamped 0..1), then `refresh()`es so the rest of the lane — on both the
 * edge the port left and the edge it landed on — re-evens or re-ranks
 * around it. A locked port is returned completely unchanged, placements
 * object included (never even shallow-copied), matching "never
 * draggable".
 */
export function movePort(
  placements: Placements,
  arrangement: Arrangement,
  portId: string,
  edge: PortEdgeId,
  target: { index: number } | { t: number },
  locked?: Set<string>,
): Placements {
  if (locked?.has(portId)) return placements;
  const current = placements[portId];
  if (!current) return placements;

  if (arrangement.mode === "auto") {
    // WHY: laneOrder has no locked-awareness (it just draws the lane), so
    // without this filter a locked sibling sharing `edge` gets folded into
    // `sequence` below and has its own stored `order` overwritten — refresh()
    // then can't undo it, since refresh deliberately skips locked ids when
    // re-ranking (see refresh's own doc). Locked ports never occupy a rank
    // slot; excluding them here keeps that true for the port being moved too.
    const others = laneOrder(placements, arrangement, edge).filter(
      (id) => id !== portId && !locked?.has(id),
    );
    const index = "index" in target ? clampIndex(target.index, others.length) : others.length;
    const sequence = [...others.slice(0, index), portId, ...others.slice(index)];
    const next: Placements = { ...placements };
    sequence.forEach((id, i) => {
      next[id] = id === portId ? { ...current, edge, order: i } : { ...next[id], order: i };
    });
    return refresh(next, arrangement, locked);
  }

  const t = "t" in target ? clampUnit(target.t) : current.t;
  const next: Placements = { ...placements, [portId]: { ...current, edge, t } };
  return refresh(next, arrangement, locked);
}

/**
 * Switches an Arrangement's mode. Entering custom keeps whatever `t` is
 * already stored (auto's own `refresh()` kept it current on every prior
 * change, so nothing moves). Leaving custom re-derives `order` from
 * `rank(t)` first — by running `refresh()` under a `"custom"` copy of the
 * arrangement regardless of what `order` currently holds, so a stale
 * `order` can never leak through — then `refresh()`es again under
 * `"auto"` so `order` becomes the lane's new truth and `t` reflows to the
 * even-spacing closed form. Nothing jumps either direction.
 *
 * `locked` is threaded into BOTH `refresh()` passes, same as every other
 * mutator in this module (`movePort`) — a locked port shares a lane's edge
 * without being counted in that lane's rank/spacing math (see `refresh`'s
 * own doc). Omitting it here was the bug: the function port would get
 * ranked alongside real ports on its edge, corrupting their order and t
 * the moment an arrangement flipped custom -> auto.
 */
export function setMode(
  placements: Placements,
  arrangement: Arrangement,
  mode: ArrangementMode,
  locked?: Set<string>,
): { placements: Placements; arrangement: Arrangement } {
  if (mode === "custom") {
    return { placements, arrangement: { ...arrangement, mode: "custom" } };
  }
  const rankedByT = refresh(placements, { ...arrangement, mode: "custom" }, locked);
  const auto: Arrangement = { ...arrangement, mode: "auto" };
  return { placements: refresh(rankedByT, auto, locked), arrangement: auto };
}

/** Never removes the last live edge — returns the arrangement unchanged
 * instead, so a Block can never end up with nowhere to draw its ports.
 * Ports on that edge simply stay stored there and keep drawing parked
 * elsewhere via `drawnEdge` until another edge is turned on. */
export function toggleEdge(arrangement: Arrangement, edge: PortEdgeId, on: boolean): Arrangement {
  const has = arrangement.edges.includes(edge);
  if (on === has) return arrangement;
  if (!on && arrangement.edges.length <= 1) return arrangement;
  const nextSet = new Set(on ? [...arrangement.edges, edge] : arrangement.edges.filter((e) => e !== edge));
  return { ...arrangement, edges: ALL_EDGES.filter((e) => nextSet.has(e)) };
}

/** Appends a new Arrangement cloned from an existing one (or
 * `DEFAULT_ARRANGEMENT` if `copyOf` doesn't resolve) under a new id/label
 * — never mutates the source, including its nested `grouping` set. */
export function addArrangement(
  arrangements: Arrangement[],
  copyOf: string,
  id: string,
  label: string,
): Arrangement[] {
  const source = arrangements.find((a) => a.id === copyOf) ?? DEFAULT_ARRANGEMENT;
  const next: Arrangement = {
    ...source,
    id,
    label,
    edges: [...source.edges],
    grouping: source.grouping
      ? { ...source.grouping, assignments: { ...source.grouping.assignments } }
      : undefined,
  };
  return [...arrangements, next];
}

/** A structural copy of one Arrangement's Placements — every `Placement`
 * object is its own copy too, so mutating the clone can never leak back
 * into the source (a new Arrangement starts from a clone of the one it
 * was copied from, per `addArrangement`'s caller). */
export function clonePlacements(placements: Placements): Placements {
  const next: Placements = {};
  for (const id of Object.keys(placements)) {
    next[id] = { ...placements[id] };
  }
  return next;
}

/**
 * The lab's `computeSlots` (see `demos/dndkit-lab/src/grouping.ts`) for
 * one lane: with no grouping set, or an expanded one, every drawn port is
 * its own slot. A collapsed set clusters every port that resolves to the
 * same group (default: singleton = the port's own id) into one slot at
 * the first member's position — `portIds` lists every member (so a
 * caller can render the rest as a stacked/faded pile), sorted by the
 * set's own `groupOrder`.
 */
export function groupSlots(
  placements: Placements,
  arrangement: Arrangement,
  edge: PortEdgeId,
): { group: string; portIds: string[]; t: number }[] {
  const ids = laneOrder(placements, arrangement, edge);
  const grouping = arrangement.grouping;
  if (!grouping || !grouping.collapsed) {
    return ids.map((id) => ({ group: id, portIds: [id], t: placements[id].t }));
  }

  const resolve = (id: string) => grouping.assignments[id]?.group ?? id;
  const seen = new Set<string>();
  const slots: { group: string; portIds: string[]; t: number }[] = [];
  for (const id of ids) {
    const group = resolve(id);
    if (seen.has(group)) continue;
    seen.add(group);
    const members = ids
      .filter((memberId) => resolve(memberId) === group)
      .sort((a, b) => (grouping.assignments[a]?.groupOrder ?? 0) - (grouping.assignments[b]?.groupOrder ?? 0));
    slots.push({ group, portIds: members, t: placements[id].t });
  }
  return slots;
}

/** The function port's fixed placement: header-left corner, order 0,
 * `t` 0. Never computed from a lane — it is the one placement in the
 * whole model that is never subject to `refresh()`. */
export function lockedPlacement(): Placement {
  return { edge: "top", order: 0, t: 0 };
}
