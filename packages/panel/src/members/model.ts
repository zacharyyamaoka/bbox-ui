import type { Instance } from "../bench";
import type { ComponentEntry } from "../registerComponent";
import type { MemberSummary, MembersSpec } from "./contract";

/**
 * The member tree, derived from ONE stored fact: each parent's ordered
 * `members` id list. Nothing stores a `parentId`; it is computed here.
 *
 * WHY the list on the parent and not a pointer on the child: order is the
 * thing a member list is FOR (tldraw's child index, React Flow's array
 * order, a Stack's paint order), and an ordered list stores order for free
 * while a parent pointer needs a second sort key beside it. It is also what
 * SystemSketch's Members section already settled on 2026-09-09 — order =
 * the child index on the parent, re-taken from the landing.
 */

/** child id → parent id, for every instance that sits inside another. */
export function parentMap(instances: Instance[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const inst of instances) for (const id of inst.members ?? []) out.set(id, inst.id);
  return out;
}

/** The instances no other instance holds — what a render draws at the top. */
export function topLevel(instances: Instance[]): Instance[] {
  const held = parentMap(instances);
  return instances.filter((i) => !held.has(i.id));
}

/** `id` and everything under it, depth first, in member order. */
export function subtreeIds(instances: Instance[], id: string): string[] {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const out: string[] = [];
  const walk = (cur: string) => {
    out.push(cur);
    for (const child of byId.get(cur)?.members ?? []) walk(child);
  };
  walk(id);
  return out;
}

/** Root → … → parent of `id`, for a breadcrumb. Empty for a top-level instance. */
export function ancestry(instances: Instance[], id: string): string[] {
  const parents = parentMap(instances);
  const out: string[] = [];
  let cur = parents.get(id);
  while (cur) {
    out.unshift(cur);
    cur = parents.get(cur);
  }
  return out;
}

/** How deep `id` sits; 0 for a top-level instance. */
export function depthOf(instances: Instance[], id: string): number {
  return ancestry(instances, id).length;
}

/**
 * What a control gets to show for one member. The title is the child's own
 * `children` text when it has one — a Port's label, a Pill's text — else
 * `Type n`, numbered among siblings of the same type so two untitled Ports
 * still read apart.
 */
export function summarize(instances: Instance[], id: string): MemberSummary | undefined {
  const inst = instances.find((i) => i.id === id);
  if (!inst) return undefined;
  const raw = inst.props.children;
  const own = typeof raw === "string" && raw.trim() !== "" ? raw : null;
  const parents = parentMap(instances);
  const parentId = parents.get(id);
  const siblings = parentId
    ? (instances.find((i) => i.id === parentId)?.members ?? [])
    : topLevel(instances).map((i) => i.id);
  const sameType = siblings.filter((sid) => instances.find((i) => i.id === sid)?.type === inst.type);
  const n = sameType.indexOf(id) + 1;
  const state = inst.props.state;
  return {
    id,
    type: inst.type,
    title: own ?? `${inst.type} ${n > 0 ? n : ""}`.trim(),
    untitled: own === null,
    badge: typeof state === "string" && state !== "" ? state : null,
    memberIds: [...(inst.members ?? [])],
  };
}

/** The types a parent may still add, honouring `accepts` and `max`. */
export function addableTypes(spec: MembersSpec, entries: ComponentEntry[], currentCount: number): string[] {
  if (spec.max !== undefined && currentCount >= spec.max) return [];
  const names = entries.map((e) => e.name);
  return spec.accepts.length === 0 ? names : spec.accepts.filter((t) => names.includes(t));
}

/** Pure list move: the item at `from` ends up at index `to`. */
export function moveIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

/**
 * The bench operations, as pure functions over the instance array so the
 * page's reducer and the tests share one implementation.
 */
export function addMemberTo(instances: Instance[], parentId: string, child: Instance): Instance[] {
  return [
    ...instances.map((i) => (i.id === parentId ? { ...i, members: [...(i.members ?? []), child.id] } : i)),
    child,
  ];
}

/** Removes `id` and its whole subtree, and unlinks it from its parent. */
export function removeMember(instances: Instance[], id: string): Instance[] {
  const doomed = new Set(subtreeIds(instances, id));
  return instances
    .filter((i) => !doomed.has(i.id))
    .map((i) => (i.members?.includes(id) ? { ...i, members: i.members.filter((m) => m !== id) } : i));
}

export function moveMember(instances: Instance[], parentId: string, from: number, to: number): Instance[] {
  return instances.map((i) => (i.id === parentId && i.members ? { ...i, members: moveIndex(i.members, from, to) } : i));
}

/** Would placing `childId` under `parentId` make a cycle? */
export function wouldCycle(instances: Instance[], parentId: string, childId: string): boolean {
  return subtreeIds(instances, childId).includes(parentId);
}
