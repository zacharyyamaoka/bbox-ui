"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import {
  findVariant,
  makeInstance,
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
    Object.fromEntries(Object.entries(INITIAL_BENCHES).map(([name, list]) => [name, new Set(list.map((i) => i.id))])),
  );
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({});

  const variant = findVariant(variantId);
  const isMixed = activeName === MIXED_BENCH;
  const instances = benches[activeName] ?? [];
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
  const panelName = isMixed ? (selectedTypes.length === 0 ? MIXED_BENCH : selectedTypes.join(" + ")) : activeName;

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
    const id = `${type.toLowerCase()}-${uid.current}`;
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const sameType = bench.filter((i) => i.type === type).length;
      return { ...prev, [activeName]: [...bench, makeInstance(type, sameType, uid.current)] };
    });
    setSelectedIdsByBench((prev) => ({ ...prev, [activeName]: new Set([...(prev[activeName] ?? []), id]) }));
    uid.current += 1;
  }
  function removeLastInstance() {
    const bench = benches[activeName] ?? [];
    if (bench.length <= 1) return;
    const doomed = bench[bench.length - 1];
    setBenches((prev) => ({ ...prev, [activeName]: prev[activeName].slice(0, -1) }));
    setSelectedIdsByBench((prev) => {
      const next = new Set(prev[activeName]);
      next.delete(doomed.id);
      if (next.size === 0 && bench.length >= 2) next.add(bench[bench.length - 2].id);
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
        instances={instances}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
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
        />
      </div>
    </SidebarProvider>
  );
}
