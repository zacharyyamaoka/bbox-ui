"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  addMemberTo,
  findVariant,
  instanceTree,
  isSlotFill,
  makeInstanceWithSlots,
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
import { NAVIGATOR_VARIANTS, findNavigator } from "./navigator";
import { INSPECTOR_LAYOUTS, findInspectorLayout } from "./inspector-layout";

const VARIANT_KEY = "bbox-ui.create.panelVariant";
const NAVIGATOR_KEY = "bbox-ui.create.navigator";
const LAYOUT_KEY = "bbox-ui.create.inspectorLayout";
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
  const [navigatorId, setNavigatorId] = useState(() => NAVIGATOR_VARIANTS[0]!.id);
  const [layoutId, setLayoutId] = useState(() => INSPECTOR_LAYOUTS[0]!.id);
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
    const nav = readStored(NAVIGATOR_KEY);
    if (nav) setNavigatorId(findNavigator(nav).id);
    const lay = readStored(LAYOUT_KEY);
    if (lay) setLayoutId(findInspectorLayout(lay).id);
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
      window.localStorage.setItem(NAVIGATOR_KEY, navigatorId);
      window.localStorage.setItem(LAYOUT_KEY, layoutId);
      window.localStorage.setItem(RENDER_KEY, render);
      window.localStorage.setItem(VIEW_KEY, view);
      window.localStorage.removeItem(LEGACY_TAB_KEY);
    } catch {
      /* private window: the choice still works, it just forgets */
    }
  }, [restored, variantId, navigatorId, layoutId, render, view]);

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
  const navigator = findNavigator(navigatorId);
  const layout = findInspectorLayout(layoutId);
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
  const selected = instances.filter((i) => selectedIds.has(i.id));
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
    setSelection([child!.id]);
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
        navigators={NAVIGATOR_VARIANTS}
        navigatorId={navigatorId}
        onNavigatorChange={setNavigatorId}
        rootCount={rootCount}
        layouts={INSPECTOR_LAYOUTS}
        layoutId={layoutId}
        onLayoutChange={setLayoutId}
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
          onSelectInstance={(id) => selectInstance(id)}
        />
      </div>
    </SidebarProvider>
  );
}
