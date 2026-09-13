// Data model + pure helpers for Stage 4 (grouping). Kept dependency-free of
// React and dnd-kit so the clustering logic can be reasoned about (and
// eventually tested) on its own.

export interface CardDef {
  id: string;
  label: string;
}

export interface GroupAssignment {
  groupId: string;
  order: number;
}

export interface GroupingSetDef {
  id: string;
  label: string;
  description: string;
  // Deliberately partial — a card missing here is not an error. Every card
  // must still resolve to SOME group, so resolveAssignment() falls back to
  // the card's own id (a singleton group of one), per Zach's own rule:
  // "if no id, then is X id."
  assignments: Record<string, GroupAssignment>;
}

export interface Slot {
  slotId: string;
  members: { id: string; order: number }[];
}

export const CARDS: CardDef[] = [
  { id: "args", label: "*args" },
  { id: "kwargs", label: "**kwargs" },
  { id: "in", label: "in" },
  { id: "out", label: "out" },
  { id: "feedback", label: "feedback" },
  { id: "result", label: "result" },
  { id: "cfg", label: "cfg" },
  { id: "err", label: "err" },
];

export const CARD_IDS = CARDS.map((c) => c.id);
export const CARDS_BY_ID: Record<string, CardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

export const GROUPING_SETS: GroupingSetDef[] = [
  {
    id: "none",
    label: "None",
    description: "Every card is its own group of one — the default, nothing clusters.",
    assignments: {},
  },
  {
    id: "pairs",
    label: "Associated pairs",
    description:
      "*args/**kwargs and feedback/result are the kind of ports that should always move as a pair; the rest are on their own.",
    assignments: {
      args: { groupId: "variadic", order: 1 },
      kwargs: { groupId: "variadic", order: 2 },
      feedback: { groupId: "action", order: 1 },
      result: { groupId: "action", order: 2 },
    },
  },
  {
    id: "source",
    label: "By source",
    description:
      "Grouped by the upstream block each port conceptually comes from — collapse this set and every source block gets exactly one representative port.",
    assignments: {
      args: { groupId: "Core", order: 1 },
      kwargs: { groupId: "Core", order: 2 },
      cfg: { groupId: "Core", order: 3 },
      in: { groupId: "IO", order: 1 },
      out: { groupId: "IO", order: 2 },
      feedback: { groupId: "Ctrl", order: 1 },
      result: { groupId: "Ctrl", order: 2 },
      err: { groupId: "Ctrl", order: 3 },
    },
  },
  {
    id: "three-way",
    label: "Three-way split",
    description:
      "An arbitrary assignment into 3 buckets — for when you just want a fixed number of representative locations, regardless of what the ports actually are.",
    assignments: {
      args: { groupId: "A", order: 1 },
      out: { groupId: "A", order: 2 },
      kwargs: { groupId: "B", order: 1 },
      feedback: { groupId: "B", order: 2 },
      err: { groupId: "B", order: 3 },
      in: { groupId: "C", order: 1 },
      result: { groupId: "C", order: 2 },
      cfg: { groupId: "C", order: 3 },
    },
  },
];

export function resolveAssignment(cardId: string, set: GroupingSetDef): GroupAssignment {
  return set.assignments[cardId] ?? { groupId: cardId, order: 0 };
}

/**
 * Walks the flat card order and clusters same-group cards into one slot each,
 * positioned wherever that group's first member currently sits. This is what
 * makes "side by side" and "move together" the same mechanism: whichever
 * slot a drag relocates carries every member with it, and re-deriving
 * cardOrder from the reordered slots is what keeps a group contiguous.
 */
export function computeSlots(cardOrder: string[], set: GroupingSetDef, clustered: boolean): Slot[] {
  if (!clustered) {
    return cardOrder.map((id) => ({ slotId: id, members: [{ id, order: 0 }] }));
  }
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const id of cardOrder) {
    const { groupId } = resolveAssignment(id, set);
    if (seen.has(groupId)) continue;
    seen.add(groupId);
    const members = CARD_IDS.filter((cid) => resolveAssignment(cid, set).groupId === groupId)
      .map((cid) => ({ id: cid, order: resolveAssignment(cid, set).order }))
      .sort((a, b) => a.order - b.order);
    slots.push({ slotId: groupId, members });
  }
  return slots;
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

/** One color per real (>1 member) group, in first-appearance order — stable and legible, not hashed. */
export function buildColorMap(set: GroupingSetDef): Map<string, string> {
  const sizes = new Map<string, number>();
  for (const id of CARD_IDS) {
    const { groupId } = resolveAssignment(id, set);
    sizes.set(groupId, (sizes.get(groupId) ?? 0) + 1);
  }
  const order: string[] = [];
  for (const id of CARD_IDS) {
    const { groupId } = resolveAssignment(id, set);
    if ((sizes.get(groupId) ?? 0) > 1 && !order.includes(groupId)) order.push(groupId);
  }
  const map = new Map<string, string>();
  order.forEach((groupId, i) => map.set(groupId, PALETTE[i % PALETTE.length]));
  return map;
}
