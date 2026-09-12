import { DEFAULT_ARRANGEMENT, defaultPlacement, lockedPlacement, type Arrangement, type Placements } from "@bbox-ui/core";
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
  // A slot fill is named after its slot, always — "Header · left" — so the
  // navigator and the path read the anatomy, not "Flex 3".
  const own = inst.slot ? inst.slot.label : typeof raw === "string" && raw.trim() !== "" ? raw : null;
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

/**
 * Removes `id` and its whole subtree, unlinks it from its parent, and
 * prunes every removed id out of any remaining instance's Arrangements'
 * `grouping.assignments`.
 *
 * WHY: a Block's Arrangements are data living ON the instance (not
 * derived), so a removed Port's id would otherwise survive forever as an
 * orphaned `assignments` entry — nothing else scans for it. `groupSlots`
 * (portPlacement.ts) happens to stay correct without this, because it only
 * ever looks up an id already in the lane's live set, but that is a
 * property of ONE reader, not a guarantee for whatever reads
 * `assignments` next.
 */
export function removeMember(instances: Instance[], id: string): Instance[] {
  const doomed = new Set(subtreeIds(instances, id));
  return instances
    .filter((i) => !doomed.has(i.id))
    .map((i) => (i.members?.includes(id) ? { ...i, members: i.members.filter((m) => m !== id) } : i))
    .map((i) => {
      if (!i.arrangements) return i;
      let changed = false;
      const nextArrangements = i.arrangements.map((a) => {
        const assignments = a.grouping?.assignments;
        if (!assignments) return a;
        const hasDoomed = Object.keys(assignments).some((pid) => doomed.has(pid));
        if (!hasDoomed) return a;
        changed = true;
        const nextAssignments = Object.fromEntries(Object.entries(assignments).filter(([pid]) => !doomed.has(pid)));
        return { ...a, grouping: { ...a.grouping!, assignments: nextAssignments } };
      });
      return changed ? { ...i, arrangements: nextArrangements } : i;
    });
}

export function moveMember(instances: Instance[], parentId: string, from: number, to: number): Instance[] {
  return instances.map((i) => (i.id === parentId && i.members ? { ...i, members: moveIndex(i.members, from, to) } : i));
}

/** Would placing `childId` under `parentId` make a cycle? */
export function wouldCycle(instances: Instance[], parentId: string, childId: string): boolean {
  return subtreeIds(instances, childId).includes(parentId);
}

/**
 * Re-parent: `id` leaves whatever holds it (or the top level) and lands in
 * `parentId`'s list at `index`, or becomes a root when `parentId` is null.
 * The instance itself is untouched — only two lists change. Refuses a
 * cycle, and refuses silently nothing else: whether the parent ACCEPTS the
 * type is the caller's check (it needs the registry), done before calling.
 */
export function reparent(instances: Instance[], id: string, parentId: string | null, index: number): Instance[] {
  if (parentId === id || (parentId !== null && wouldCycle(instances, parentId, id))) return instances;
  const without = instances.map((i) => (i.members?.includes(id) ? { ...i, members: i.members.filter((m) => m !== id) } : i));
  if (parentId === null) return without;
  return without.map((i) => {
    if (i.id !== parentId) return i;
    const list = [...(i.members ?? [])];
    list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
    return { ...i, members: list };
  });
}

/** The tree as nested nodes, for a navigator that wants children inline. */
export interface InstanceNode {
  id: string;
  type: string;
  title: string;
  untitled: boolean;
  badge: string | null;
  /**
   * Can hold members — a Stack, a Flex — even while empty. A tree part
   * needs this to tell "a folder with nothing in it" from "a file": an
   * empty Stack must still be a drop target and fold like a folder. A
   * Block is NOT a container here: its children are fixed slot fills, and
   * nothing is dropped into a Block directly.
   */
  container: boolean;
  children: InstanceNode[];
}

export function instanceTree(instances: Instance[], entries: ComponentEntry[] = []): InstanceNode[] {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const node = (id: string): InstanceNode | null => {
    const inst = byId.get(id);
    const s = summarize(instances, id);
    if (!inst || !s) return null;
    const entry = entries.find((e) => e.name === inst.type);
    return {
      id,
      type: inst.type,
      title: s.title,
      untitled: s.untitled,
      badge: s.badge,
      container: entry ? entry.members !== undefined : (inst.members?.length ?? 0) > 0,
      children: (inst.members ?? []).map(node).filter((n): n is InstanceNode => n !== null),
    };
  };
  return topLevel(instances)
    .map((r) => node(r.id))
    .filter((n): n is InstanceNode => n !== null);
}

/**
 * The members spec that applies to THIS instance: its component's, narrowed
 * by its slot when the slot says so (a Block's body holds rows only).
 */
export function memberSpecFor(entry: ComponentEntry, inst: Instance): MembersSpec | undefined {
  const base = entry.members;
  if (!base) return undefined;
  if (inst.slot?.accepts) return { ...base, accepts: inst.slot.accepts, label: base.label };
  return base;
}

/** A slot fill is structural: never removed, reordered or dragged. */
export function isSlotFill(inst: Instance | undefined): boolean {
  return !!inst?.slot;
}

/**
 * The values `id` inherits, by field: for every field of its component
 * marked `cascades`, the nearest ancestor whose component has a field of
 * the same id contributes what THAT ancestor resolves to — its own stored
 * value, else what it inherits in turn, else its default. So a header set
 * to xl reaches a Port three levels down, a row set to sm overrides it for
 * its own members, and a bar with nothing set still relays its default.
 *
 * Only the shape of the tree lives here; the schema's `resolveField` is
 * what decides that an inherited value loses to an own value and beats a
 * preset (D1, 2026-09-11).
 */
export interface InheritedValueLike {
  value: string | number | boolean;
  from: string;
  fromLabel?: string;
}

export function inheritedFor(instances: Instance[], entries: ComponentEntry[], id: string): Record<string, InheritedValueLike> {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const entryOf = (inst: Instance) => entries.find((e) => e.name === inst.type);
  const self = byId.get(id);
  const selfEntry = self && entryOf(self);
  if (!self || !selfEntry) return {};
  const wanted = selfEntry.fields.filter((f) => f.cascades).map((f) => f.id);
  if (wanted.length === 0) return {};
  const out: Record<string, InheritedValueLike> = {};
  for (const fieldId of wanted) {
    for (const ancestorId of [...ancestry(instances, id)].reverse()) {
      const ancestor = byId.get(ancestorId);
      const entry = ancestor && entryOf(ancestor);
      const field = entry?.fields.find((f) => f.id === fieldId && f.cascades);
      if (!ancestor || !entry || !field) continue;
      const own = ancestor.props[fieldId];
      const title = summarize(instances, ancestorId)?.title ?? ancestor.type;
      if (own !== undefined) {
        out[fieldId] = { value: own as InheritedValueLike["value"], from: ancestorId, fromLabel: title };
        break;
      }
      // The ancestor only relays: name the ORIGIN, not the relay — "inherited
      // from Header" is the answer a person wants, not "from Left".
      const up = inheritedFor(instances, entries, ancestorId)[fieldId];
      out[fieldId] = up ?? { value: field.defaultValue as InheritedValueLike["value"], from: ancestorId, fromLabel: title };
      break;
    }
  }
  return out;
}

/**
 * A Block's own Port members, in member order — never its slot fills (a
 * Block's `members` list holds both: slot fills always come first,
 * `addMember` appends Ports after them, see `bench.tsx`'s own
 * `makeInstanceWithSlots`/`addMemberTo`). Filtering by `type === "Port"`
 * rather than "not a slot fill" is deliberate: it stays correct even if a
 * future member type joins `MEMBER_SPECS.Block.accepts`.
 */
export function blockPorts(instances: Instance[], blockId: string): Instance[] {
  const block = instances.find((i) => i.id === blockId);
  if (!block) return [];
  const byId = new Map(instances.map((i) => [i.id, i]));
  return (block.members ?? [])
    .map((id) => byId.get(id))
    .filter((i): i is Instance => !!i && i.type === "Port");
}

/** The Block's active Arrangement — falling back to the shared
 *  `DEFAULT_ARRANGEMENT` when `arrangement` doesn't resolve (a Block with
 *  no `arrangements` yet, or a stale/typo'd active id). Never mutates. */
export function activeArrangement(block: Instance): Arrangement {
  const arrangements = block.arrangements ?? [DEFAULT_ARRANGEMENT];
  return arrangements.find((a) => a.id === block.arrangement) ?? arrangements[0] ?? DEFAULT_ARRANGEMENT;
}

/**
 * One Arrangement's `Placements` over a Block's REAL Port instances: a
 * port with nothing stored yet for `arrangementId` gets `defaultPlacement`
 * (parked on the arrangement's first live edge, appended after whatever
 * this call has already assigned there — see that function's own doc), a
 * `locked` port always gets `lockedPlacement()` regardless of anything
 * stored (the function port's corner placement is never subject to an
 * arrangement, `portPlacement.ts`'s own header). Pure: never writes back
 * to any Port's own `placements`, so calling it from a render is safe.
 */
export function portPlacementsOf(block: Instance, ports: Instance[], arrangementId: string): Placements {
  const arrangement = (block.arrangements ?? [DEFAULT_ARRANGEMENT]).find((a) => a.id === arrangementId) ?? DEFAULT_ARRANGEMENT;
  const out: Placements = {};
  for (const port of ports) {
    if (port.locked) {
      out[port.id] = lockedPlacement();
      continue;
    }
    out[port.id] = port.placements?.[arrangementId] ?? defaultPlacement(port.id, arrangement, out);
  }
  return out;
}

/** The props a render should draw: inherited values under the instance's own. */
export function effectiveProps(instances: Instance[], entries: ComponentEntry[], inst: Instance): Record<string, unknown> {
  const bag = inheritedFor(instances, entries, inst.id);
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bag)) merged[k] = v.value;
  for (const [k, v] of Object.entries(inst.props)) if (v !== undefined) merged[k] = v;
  return merged;
}

