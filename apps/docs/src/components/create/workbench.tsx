"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  DEFAULT_ARRANGEMENT,
  addArrangement,
  lockedPlacement,
  movePort,
  refresh,
  setMode,
  toggleEdge,
  type Arrangement,
  type ArrangementMode,
  type Placement,
  type Placements,
  type PortEdgeId,
} from "@bbox-ui/core";
import {
  activeArrangement,
  addMemberTo,
  blockPorts,
  findVariant,
  inheritedFor,
  instanceTree,
  isSlotFill,
  makeInstanceWithSlots,
  portPlacementsOf,
  memberSpecFor,
  reparent,
  typeGlyph,
  wouldCycle,
  makeInstance,
  moveMember,
  parentMap,
  removeMember,
  subtreeIds,
  topLevel,
  randomValue,
  sharedFields,
  EXCLUDED_SHOWN,
  INITIAL_BENCHES,
  INITIAL_UID,
  MIXED_BENCH,
  PANEL_VARIANTS,
  REGISTRY,
  type ComponentEntry,
  type Instance,
} from "@bbox-ui/panel";
import { SidebarProvider } from "@/registry/new-york-v4/ui/sidebar";
import { BenchSidebar } from "./bench-sidebar";
import { InspectorColumn } from "./inspector-column";
import { Viewport } from "./viewport";
import { defaultPosition, type CanvasPosition, type Render, type View } from "./contract";
import { NAVIGATOR } from "./navigator";
import { useSelectionHistory } from "./selection-history";
import { INSPECTOR_LAYOUT } from "./inspector-layout";

const VARIANT_KEY = "bbox-ui.create.panelVariant";

const RENDER_KEY = "bbox-ui.create.render";
const VIEW_KEY = "bbox-ui.create.view";
// The single-strip key from before the two-axis split; read once to migrate.
const LEGACY_TAB_KEY = "bbox-ui.create.viewportTab";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The create page's state, and nothing else. Every helper it calls is the
 * same one demos/inspector calls, from @bbox-ui/panel — the two shells share
 * one engine so the site can never show a panel the demo does not.
 *
 * WHY this component owns instances, selection AND canvas positions (see
 * contract.ts): the four viewport tabs are views over one bench. Move a node
 * on React Flow, switch to tldraw, same node, same place.
 */
export function Workbench() {
  const [activeName, setActiveName] = useState(REGISTRY[0].name);
  const [variantId, setVariantId] = useState(() => PANEL_VARIANTS[0].id);

  const [render, setRender] = useState<Render>("dom");
  const [view, setView] = useState<View>("preview");
  const uid = useRef(INITIAL_UID);

  // Persisted choices are read after mount: this is a Next page and the
  // server has no localStorage, so reading it in the initialiser would make
  // the first client render disagree with the HTML it hydrates.
  //
  // WHY `restored` is STATE and not a ref: the write effect runs in the same
  // commit as the read effect, before the read's setState has rendered. A
  // ref flipped synchronously let that write store the DEFAULT tab over the
  // one just read, and strict mode's second pass then read the default back.
  // State set alongside setTab renders in the same batch, so the first write
  // that is allowed already sees the restored value.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const v = readStored(VARIANT_KEY);
    if (v) setVariantId(findVariant(v).id);

    const r = readStored(RENDER_KEY);
    if (r === "dom" || r === "reactflow" || r === "tldraw") setRender(r);
    const vw = readStored(VIEW_KEY);
    if (vw === "preview" || vw === "code") setView(vw);
    // A choice stored under the old single strip maps onto the two axes so a
    // returning tab lands where it was, then the old key is retired.
    const legacy = readStored(LEGACY_TAB_KEY);
    if (legacy && !r && !vw) {
      if (legacy === "code") { setRender("dom"); setView("code"); }
      else if (legacy === "reactflow" || legacy === "tldraw" || legacy === "dom") { setRender(legacy); setView("preview"); }
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(VARIANT_KEY, variantId);

      window.localStorage.setItem(RENDER_KEY, render);
      window.localStorage.setItem(VIEW_KEY, view);
      window.localStorage.removeItem(LEGACY_TAB_KEY);
    } catch {
      /* private window: the choice still works, it just forgets */
    }
  }, [restored, variantId, render, view]);

  const [benches, setBenches] = useState<Record<string, Instance[]>>(() =>
    Object.fromEntries(
      Object.entries(INITIAL_BENCHES).map(([name, list]) => [name, list.map((i) => ({ ...i, props: { ...i.props } }))]),
    ),
  );
  const [selectedIdsByBench, setSelectedIdsByBench] = useState<Record<string, Set<string>>>(() =>
    // Roots only: a Block bench opens with the Block selected, not the Block
    // plus its seven slot fills (which would put "Block + Flex — nothing in
    // common" in the inspector before anyone has clicked anything).
    Object.fromEntries(Object.entries(INITIAL_BENCHES).map(([name, list]) => [name, new Set(topLevel(list).map((i) => i.id))])),
  );
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({});

  const variant = findVariant(variantId);
  const navigator = NAVIGATOR;
  const layout = INSPECTOR_LAYOUT;
  const isMixed = activeName === MIXED_BENCH;
  const instances = benches[activeName] ?? [];
  const rootCount = useMemo(() => topLevel(instances).length, [instances]);
  // Roots for the renders; tree order for the sidebar, so a member lists
  // right under its parent. Both derive from the one stored fact, the
  // parent's `members` list — nothing here stores a parent pointer.
  const roots = useMemo(() => topLevel(instances), [instances]);
  const tree = useMemo(() => instanceTree(instances, REGISTRY), [instances]);
  const treeOrder = useMemo(() => {
    const byId = new Map(instances.map((i) => [i.id, i]));
    return roots.flatMap((r) => subtreeIds(instances, r.id)).map((id) => byId.get(id)!).filter(Boolean);
  }, [instances, roots]);
  const selectedIds = selectedIdsByBench[activeName] ?? new Set<string>();
  // Each selected subject carries what it inherits (a header's size reaching
  // the Glyph inside it), so the panel can say "inherited from Header".
  const selected = instances
    .filter((i) => selectedIds.has(i.id))
    .map((i) => ({ ...i, inherited: inheritedFor(instances, REGISTRY, i.id) }));
  // One stable array per selection, not one per render: the canvases key
  // their node lists on it, and a fresh array every render made React Flow
  // rebuild every node on every keystroke in the inspector.
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const entryFor = (name: string): ComponentEntry => REGISTRY.find((e) => e.name === name)!;
  const selectedTypes = Array.from(new Set(selected.map((i) => i.type)));
  const selectedEntries = selectedTypes.map(entryFor);
  const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const shared = selectedEntries.length > 1 ? sharedFields(selectedEntries) : null;
  const panelFields: FieldSpec[] = single ? single.fields : (shared?.fields ?? []);
  const panelPresets = single ? single.presets : [];
  const panelToSubject = single ? single.toSubject : undefined;
  // WHY the header names the selected TYPE and not the bench: a focused
  // bench used to hold one type only, so the two were the same word. A
  // Stack bench now holds Ports and Pills as members, and the inspector
  // showing a Port's fields under the heading "Stack" is the exact
  // confusion the click-into-a-child rule must never produce.
  const panelName =
    selectedTypes.length === 1 ? selectedTypes[0]! : selectedTypes.length > 1 ? selectedTypes.join(" + ") : isMixed ? MIXED_BENCH : activeName;

  // Every instance has a canvas position, placed the first time it is seen so
  // a fresh bench reads as a column rather than a pile at the origin.
  const placedPositions = useMemo(() => {
    const out: Record<string, CanvasPosition> = {};
    instances.forEach((inst, index) => {
      out[inst.id] = positions[inst.id] ?? defaultPosition(index);
    });
    return out;
  }, [instances, positions]);

  function setSelection(ids: string[]) {
    setSelectedIdsByBench((prev) => ({ ...prev, [activeName]: new Set(ids) }));
  }
  function toggleSelected(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(Array.from(next));
  }
  function addInstance(type: string) {
    // A slotted component arrives with its slot fills (a Block brings seven
    // Flexes); the bench count below only counts roots, so those stay
    // invisible to the stepper.
    const bench = benches[activeName] ?? [];
    const sameType = topLevel(bench).filter((i) => i.type === type).length;
    const made = makeInstanceWithSlots(type, sameType, uid.current);
    uid.current += made.length;
    setBenches((prev) => ({ ...prev, [activeName]: [...(prev[activeName] ?? []), ...made] }));
    setSelectedIdsByBench((prev) => ({ ...prev, [activeName]: new Set([...(prev[activeName] ?? []), made[0]!.id]) }));
  }
  function removeLastInstance() {
    // "Last" means the last ROOT; its members go with it. Counting members
    // as instances here would let − take a Port out of a Stack while the
    // sidebar says "2 instances".
    const bench = benches[activeName] ?? [];
    const rootList = topLevel(bench);
    if (rootList.length <= 1) return;
    const doomed = rootList[rootList.length - 1]!;
    const gone = new Set(subtreeIds(bench, doomed.id));
    setBenches((prev) => ({ ...prev, [activeName]: removeMember(prev[activeName], doomed.id) }));
    setSelectedIdsByBench((prev) => {
      const next = new Set(Array.from(prev[activeName]).filter((id) => !gone.has(id)));
      if (next.size === 0) next.add(rootList[rootList.length - 2]!.id);
      return { ...prev, [activeName]: next };
    });
  }
  function randomizeInstances() {
    const roll = () => Math.random();
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) => {
        const targeted = selectedIds.size === 0 || selectedIds.has(instance.id);
        if (!targeted) return instance;
        const props: Record<string, unknown> = {};
        for (const field of entryFor(instance.type).fields) {
          const value = randomValue(field, roll);
          if (value !== undefined) props[field.id] = value;
        }
        return { ...instance, props };
      }),
    }));
  }
  // Subject history for the mouse's back/forward buttons: every selection
  // the page lands on is an entry, so "click into a child, press back" returns
  // to the parent, and forward re-enters. See useSelectionHistory.
  const history = useSelectionHistory(selectedIdList, setSelection);
  void history;

  /**
   * Members. Add appends a fresh instance of `type` to the parent's list and
   * selects it — the inspector jumps to the new child, which is the whole
   * point of adding it. Remove takes the subtree with it. Move is the pure
   * reorder from @bbox-ui/panel. None of these touch positions: a member
   * has no canvas position of its own, it sits inside its parent.
   */
  function addMember(parentId: string, type: string) {
    const [child, ...fills] = makeInstanceWithSlots(type, 0, uid.current);
    uid.current += 1 + fills.length;
    setBenches((prev) => ({ ...prev, [activeName]: [...addMemberTo(prev[activeName] ?? [], parentId, child!), ...fills] }));
    // WHY the selection stays put: Zach, 2026-09-11 — "when you add a new
    // thing, please stay at the same level, don't click into it". Add three
    // Ports is three clicks; the new row is right there to click into.
  }
  function removeMemberById(id: string) {
    const bench = benches[activeName] ?? [];
    // A slot fill is structural: it goes when its parent goes, never alone.
    if (isSlotFill(bench.find((i) => i.id === id))) return;
    const parent = parentMap(bench).get(id);
    const gone = new Set(subtreeIds(bench, id));
    setBenches((prev) => ({ ...prev, [activeName]: removeMember(prev[activeName] ?? [], id) }));
    // A selection pointing at what was just removed lands on the parent, so
    // the inspector never goes blank mid-edit.
    const remaining = Array.from(selectedIds).filter((s) => !gone.has(s));
    setSelection(remaining.length > 0 ? remaining : parent ? [parent] : []);
  }
  function moveMemberInParent(parentId: string, from: number, to: number) {
    setBenches((prev) => ({ ...prev, [activeName]: moveMember(prev[activeName] ?? [], parentId, from, to) }));
  }
  /**
   * Re-parent by drag, from a navigator whose stock part offers it. The
   * target must declare members and accept the type; the top level accepts
   * anything. `reparent` refuses a cycle on its own. A refused drop is the
   * navigator's to show — this just declines.
   */
  function canDropInstance(id: string, parentId: string | null): boolean {
    const bench = benches[activeName] ?? [];
    const moving = bench.find((i) => i.id === id);
    if (!moving || isSlotFill(moving)) return false;
    if (parentId === null) return true;
    if (parentId === id || wouldCycle(bench, parentId, id)) return false;
    const parent = bench.find((i) => i.id === parentId);
    const spec = parent && memberSpecFor(entryFor(parent.type), parent);
    if (!spec) return false;
    const siblings = (parent.members ?? []).filter((m) => m !== id).length;
    if (spec.max !== undefined && siblings >= spec.max) return false;
    return spec.accepts.length === 0 || spec.accepts.includes(moving.type);
  }
  function moveInstance(id: string, parentId: string | null, index: number) {
    if (!canDropInstance(id, parentId)) return;
    setBenches((prev) => ({ ...prev, [activeName]: reparent(prev[activeName] ?? [], id, parentId, index) }));
  }

  function selectInstance(id: string, additive = false) {
    if (!additive) {
      setSelection([id]);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(Array.from(next));
  }

  /** One prop on one instance, from a region row's quick controls. */
  function setInstanceProp(id: string, fieldId: string, value: FieldValue) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: (prev[activeName] ?? []).map((i) => (i.id === id ? { ...i, props: { ...i.props, [fieldId]: value } } : i)),
    }));
  }

  /*
   * Arrangement / Placement ops (Zach, 2026-09-12) — a Block's own states
   * and its Ports' per-state placement. Every write here goes through
   * `packages/bbox-ui/src/portPlacement.ts`'s model functions rather than
   * hand-rolling the order/t math a second time; see `arrangement-section.tsx`
   * for the two inspector surfaces these back.
   */

  function setArrangement(blockId: string, id: string) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: (prev[activeName] ?? []).map((i) => (i.id === blockId ? { ...i, arrangement: id } : i)),
    }));
  }

  /** "+ new state": clones the ACTIVE arrangement (mode, spacing, edges,
   *  grouping) under a fresh id, and clones every Port's resolved
   *  placement under that id too — `addArrangement` alone only clones the
   *  Arrangement struct, not the per-Port placements that live beside it
   *  on each Port instance, so both have to be copied here for "copies
   *  the active one" to actually hold for what a person sees. */
  function addArrangementTo(blockId: string) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const block = bench.find((i) => i.id === blockId);
      if (!block) return prev;
      const arrangements = block.arrangements ?? [DEFAULT_ARRANGEMENT];
      const from = activeArrangement(block);
      const id = `arrangement-${Date.now().toString(36)}-${arrangements.length}`;
      const nextArrangements = addArrangement(arrangements, from.id, id, `Arrangement ${arrangements.length + 1}`);
      const ports = blockPorts(bench, blockId);
      const sourcePlacements = portPlacementsOf(block, ports, from.id);
      const portIds = new Set(ports.map((p) => p.id));
      return {
        ...prev,
        [activeName]: bench.map((i) => {
          if (i.id === blockId) return { ...i, arrangements: nextArrangements, arrangement: id };
          if (portIds.has(i.id)) return { ...i, placements: { ...(i.placements ?? {}), [id]: sourcePlacements[i.id]! } };
          return i;
        }),
      };
    });
  }

  /** Auto ↔ custom (`setMode`'s own two-step refresh — see
   *  `portPlacement.ts`'s own doc: nothing jumps either direction). */
  function setArrangementMode(blockId: string, mode: ArrangementMode) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const block = bench.find((i) => i.id === blockId);
      if (!block) return prev;
      const arrangement = activeArrangement(block);
      const ports = blockPorts(bench, blockId);
      const placements = portPlacementsOf(block, ports, arrangement.id);
      const lockedIds = new Set(ports.filter((p) => p.locked).map((p) => p.id));
      const { placements: nextPlacements, arrangement: nextArrangement } = setMode(placements, arrangement, mode, lockedIds);
      const nextArrangements = (block.arrangements ?? [DEFAULT_ARRANGEMENT]).map((a) => (a.id === arrangement.id ? nextArrangement : a));
      return {
        ...prev,
        [activeName]: bench.map((i) => {
          if (i.id === blockId) return { ...i, arrangements: nextArrangements };
          if (nextPlacements[i.id] && !lockedIds.has(i.id)) return { ...i, placements: { ...(i.placements ?? {}), [arrangement.id]: nextPlacements[i.id]! } };
          return i;
        }),
      };
    });
  }

  /** `toggleEdge` refuses to drop the last live edge (returns the same
   *  Arrangement) — that refusal is what makes this a no-op cleanly. */
  function toggleArrangementEdge(blockId: string, edge: PortEdgeId, on: boolean) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const block = bench.find((i) => i.id === blockId);
      if (!block) return prev;
      const arrangement = activeArrangement(block);
      const nextArrangement = toggleEdge(arrangement, edge, on);
      if (nextArrangement === arrangement) return prev;
      const ports = blockPorts(bench, blockId);
      const lockedIds = new Set(ports.filter((p) => p.locked).map((p) => p.id));
      const placements = portPlacementsOf(block, ports, arrangement.id);
      const refreshed = refresh(placements, nextArrangement, lockedIds);
      const nextArrangements = (block.arrangements ?? [DEFAULT_ARRANGEMENT]).map((a) => (a.id === arrangement.id ? nextArrangement : a));
      return {
        ...prev,
        [activeName]: bench.map((i) => {
          if (i.id === blockId) return { ...i, arrangements: nextArrangements };
          if (refreshed[i.id] && !lockedIds.has(i.id)) return { ...i, placements: { ...(i.placements ?? {}), [arrangement.id]: refreshed[i.id]! } };
          return i;
        }),
      };
    });
  }

  /** The picker only ever offers "none" plus the arrangement's OWN
   *  grouping set (the model stores at most one per Arrangement) — so
   *  choosing its own id is a no-op, choosing "none" clears it, and any
   *  other id (the picker's "+ New grouping set") creates a fresh,
   *  expanded-by-default set with that id. */
  function setArrangementGrouping(blockId: string, setId: string | null) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const block = bench.find((i) => i.id === blockId);
      if (!block) return prev;
      const arrangement = activeArrangement(block);
      const grouping =
        setId === null
          ? undefined
          : arrangement.grouping?.id === setId
            ? arrangement.grouping
            : { id: setId, label: setId, collapsed: true, assignments: {} };
      const nextArrangement: Arrangement = { ...arrangement, grouping };
      const nextArrangements = (block.arrangements ?? [DEFAULT_ARRANGEMENT]).map((a) => (a.id === arrangement.id ? nextArrangement : a));
      return { ...prev, [activeName]: bench.map((i) => (i.id === blockId ? { ...i, arrangements: nextArrangements } : i)) };
    });
  }

  /** Drag lands here (the next agent wires the gesture) — `movePort`'s own
   *  refresh keeps the rest of both lanes (the one a port left, the one it
   *  landed on) even/ranked around it. */
  function movePortTo(blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const block = bench.find((i) => i.id === blockId);
      if (!block) return prev;
      const arrangement = activeArrangement(block);
      const ports = blockPorts(bench, blockId);
      const lockedIds = new Set(ports.filter((p) => p.locked).map((p) => p.id));
      const placements = portPlacementsOf(block, ports, arrangement.id);
      const next = movePort(placements, arrangement, portId, edge, target, lockedIds);
      return {
        ...prev,
        [activeName]: bench.map((i) => (next[i.id] ? { ...i, placements: { ...(i.placements ?? {}), [arrangement.id]: next[i.id]! } } : i)),
      };
    });
  }

  /**
   * The Port inspector's Placement section: writes the patch into
   * `placements[activeArrangementId]` (or, for `locked`, the Port's own
   * top-level flag — capacity ONE per Block, a second attempt is refused
   * silently), then `refresh()`es the whole arrangement so the rest of
   * whichever lane(s) are touched stay even/ranked. `locked` is not a
   * `Placement` field, so it never reaches `refresh`'s input — the
   * locked port's OWN entry is written as `lockedPlacement()` directly.
   */
  function setPortPlacement(portId: string, patch: Partial<Placement> & { locked?: boolean }) {
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const port = bench.find((i) => i.id === portId);
      const blockId = parentMap(bench).get(portId);
      const block = blockId ? bench.find((i) => i.id === blockId) : undefined;
      if (!port || !block) return prev;
      const arrangement = activeArrangement(block);
      const ports = blockPorts(bench, block.id);

      let nextLocked = port.locked === true;
      const otherLocked = ports.some((p) => p.id !== portId && p.locked);
      if (patch.locked !== undefined) {
        // Capacity one per Block: a second lock attempt is refused — the
        // toggle simply does not take, matching the section's own hint.
        nextLocked = patch.locked && otherLocked ? nextLocked : patch.locked;
      }

      const { locked: _locked, ...placementPatch } = patch;
      const placements = portPlacementsOf(block, ports, arrangement.id);
      const current = placements[portId] ?? { edge: arrangement.edges[0] ?? "top", order: 0, t: 0 };
      const merged: Placements = { ...placements, [portId]: { ...current, ...placementPatch } };
      const lockedIds = new Set(ports.filter((p) => (p.id === portId ? nextLocked : p.locked)).map((p) => p.id));
      const refreshed = refresh(merged, arrangement, lockedIds);

      // Mirror `group` into the Block's active Arrangement's OWN
      // GroupingSet.assignments — the one thing `groupSlots`/`renderLane`
      // actually read (see portPlacement.ts's own `groupSlots` doc and
      // test). A Port's `Placement.group` field alone is inert; without
      // this the section's "Group" input silently did nothing to the
      // render — a real gap found while building demos/capture-port-edges.mjs.
      // Only tags a port INTO the Block's active set: it never creates one
      // (that stays "+ new grouping set" in ArrangementSection), so setting
      // Group before a grouping set exists is still a no-op, matching the
      // section's own two-surface split.
      let groupingChanged = false;
      let nextArrangements = block.arrangements ?? [DEFAULT_ARRANGEMENT];
      if ("group" in placementPatch && arrangement.grouping) {
        const nextAssignments = { ...arrangement.grouping.assignments };
        if (!placementPatch.group) delete nextAssignments[portId];
        else nextAssignments[portId] = { group: placementPatch.group, groupOrder: placementPatch.groupOrder ?? nextAssignments[portId]?.groupOrder ?? 0 };
        const nextArrangement: Arrangement = { ...arrangement, grouping: { ...arrangement.grouping, assignments: nextAssignments } };
        nextArrangements = nextArrangements.map((a) => (a.id === arrangement.id ? nextArrangement : a));
        groupingChanged = true;
      }

      return {
        ...prev,
        [activeName]: bench.map((i) => {
          if (i.id === blockId && groupingChanged) return { ...i, arrangements: nextArrangements };
          if (i.id === portId) {
            return {
              ...i,
              locked: nextLocked,
              placements: { ...(i.placements ?? {}), [arrangement.id]: nextLocked ? lockedPlacement() : (refreshed[portId] ?? merged[portId]!) },
            };
          }
          if (refreshed[i.id] && !lockedIds.has(i.id)) return { ...i, placements: { ...(i.placements ?? {}), [arrangement.id]: refreshed[i.id]! } };
          return i;
        }),
      };
    });
  }

  function applyToSelected(fieldId: string, value: FieldValue) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((i) =>
        selectedIds.has(i.id) ? { ...i, props: { ...i.props, [fieldId]: value } } : i,
      ),
    }));
  }
  function clearOverride(fieldId: string) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((i) => {
        if (!selectedIds.has(i.id)) return i;
        const props = { ...i.props };
        delete props[fieldId];
        return { ...i, props };
      }),
    }));
  }

  return (
    // WHY the explicit height: the body is a min-h-screen column with a
    // sticky header. "Fill the rest" has to be stated as a number here or a
    // short bench leaves the sidebar and inspector ending mid-screen — the
    // exact thing Zach asked not to happen.
    <SidebarProvider
      data-slot="create-workbench"
      // color-scheme tells the browser which UA chrome to paint native
      // selects and inputs with. The site never sets it, so in dark mode a
      // native <select> kept its light popup and light default background
      // under light text: a white box with nothing readable in it.
      className="min-h-0 w-full [color-scheme:light] dark:[color-scheme:dark]"
      style={{ height: "calc(100svh - var(--header-height) - 1rem)", "--sidebar-width": "17rem" } as React.CSSProperties}
    >
      <BenchSidebar
        entries={REGISTRY}
        activeName={activeName}
        onActiveNameChange={setActiveName}
        isMixed={isMixed}
        instances={treeOrder}
        tree={tree}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onSelectionChange={setSelection}
        onMoveInstance={moveInstance}
        canDropInstance={canDropInstance}
        glyph={typeGlyph}
        navigator={navigator}
        rootCount={rootCount}
        onAdd={addInstance}
        onRemoveLast={removeLastInstance}
        onRandomize={randomizeInstances}
        variants={PANEL_VARIANTS}
        variantId={variantId}
        onVariantChange={setVariantId}
        entryFor={entryFor}
      />
      <div data-slot="create-main" className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Viewport
            entries={REGISTRY}
            instances={instances}
            roots={roots}
            onSelectInstance={selectInstance}
            selectedIds={selectedIdList}
            positions={placedPositions}
            onSelectionChange={setSelection}
            onPositionsChange={setPositions}
            render={render}
            view={view}
            onRenderChange={setRender}
            onViewChange={setView}
            onMovePort={movePortTo}
          />
        </div>
        <InspectorColumn
          variant={variant}
          componentName={panelName}
          fields={panelFields}
          presets={panelPresets}
          subjects={selected}
          toSubject={panelToSubject}
          onChange={applyToSelected}
          onClearOverride={clearOverride}
          shared={shared}
          selectedTypes={selectedTypes}
          selectedCount={selected.length}
          excludedShown={EXCLUDED_SHOWN}
          layout={layout}
          entries={REGISTRY}
          instances={instances}
          subject={selected.length === 1 ? selected[0]! : null}
          onAddMember={addMember}
          onRemoveMember={removeMemberById}
          onMoveMember={moveMemberInParent}
          onSetProp={setInstanceProp}
          onSelectInstance={(id) => selectInstance(id)}
          arrangementActions={{
            onSetArrangement: setArrangement,
            onAddArrangement: addArrangementTo,
            onSetArrangementMode: setArrangementMode,
            onToggleArrangementEdge: toggleArrangementEdge,
            onSetArrangementGrouping: setArrangementGrouping,
            onMovePort: movePortTo,
            onSetPortPlacement: setPortPlacement,
          }}
        />
      </div>
    </SidebarProvider>
  );
}
