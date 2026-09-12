import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
// WHY everything below comes from a package: the same bench and the same
// panel render on the bbox-ui.com create page. One implementation, two
// consumers — this file is now only the Vite shell around it.
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

/** WHY localStorage and not a URL flag: a prototype gated behind a query
 * string Zach has to remember and type is one he will not switch to, and it
 * forgets his choice on every reload. Rated Bad on 2026-09-09 for exactly
 * that (`?portLanes=1`). The switcher lives in the app and the app remembers. */
const VARIANT_STORAGE_KEY = "bbox-ui.inspector.panelVariant";

function readStoredVariant(): string | null {
  try {
    return window.localStorage.getItem(VARIANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Live panel height, so "more compact" is a number in the app rather than a
 * claim in a report. Measures the rendered subtree, re-measuring on every
 * resize — variants change height when a disclosure opens, and a number taken
 * once at mount would quietly describe the wrong state. */
function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const node = ref.current;
    if (node) setHeight(Math.round(node.getBoundingClientRect().height));
  }, []);

  useLayoutEffect(measure);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, height };
}

export default function App() {
  const [activeName, setActiveName] = useState(REGISTRY[0].name);
  const [variantId, setVariantId] = useState<string>(() => findVariant(readStoredVariant()).id);
  const uid = useRef(INITIAL_UID);

  const [benches, setBenches] = useState<Record<string, Instance[]>>(() =>
    Object.fromEntries(
      Object.entries(INITIAL_BENCHES).map(([name, list]) => [
        name,
        list.map((i) => ({ ...i, props: { ...i.props } })),
      ]),
    ),
  );
  const [selectedIdsByBench, setSelectedIdsByBench] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      Object.entries(INITIAL_BENCHES).map(([name, list]) => [name, new Set(list.map((i) => i.id))]),
    ),
  );

  const variant = findVariant(variantId);
  const { ref: panelRef, height: panelHeight } = useMeasuredHeight<HTMLDivElement>();

  useEffect(() => {
    try {
      window.localStorage.setItem(VARIANT_STORAGE_KEY, variantId);
    } catch {
      /* private browsing; the switcher still works, it just forgets. */
    }
  }, [variantId]);

  const isMixed = activeName === MIXED_BENCH;
  const instances = benches[activeName] ?? [];
  const selectedIds = selectedIdsByBench[activeName] ?? new Set<string>();
  const selected = instances.filter((i) => selectedIds.has(i.id));

  const entryFor = (name: string) => REGISTRY.find((e) => e.name === name)!;
  const selectedTypes = Array.from(new Set(selected.map((i) => i.type)));
  const selectedEntries = selectedTypes.map(entryFor);

  // One type selected — even inside the mixed bench — behaves exactly like the
  // focused view: full fields, its own presets, its own resolution subject.
  // Only a genuine multi-type selection narrows to the shared set.
  const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const shared = selectedEntries.length > 1 ? sharedFields(selectedEntries) : null;
  const panelFields: FieldSpec[] = single ? single.fields : (shared?.fields ?? []);
  const panelPresets = single ? single.presets : [];
  const panelToSubject = single ? single.toSubject : undefined;
  const panelName = isMixed
    ? selectedTypes.length === 0
      ? MIXED_BENCH
      : selectedTypes.join(" + ")
    : activeName;

  function toggleSelected(id: string) {
    setSelectedIdsByBench((prev) => {
      const next = new Set(prev[activeName]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [activeName]: next };
    });
  }

  function addInstance(type: string) {
    const id = `${type.toLowerCase()}-${uid.current}`;
    setBenches((prev) => {
      const bench = prev[activeName] ?? [];
      const sameType = bench.filter((i) => i.type === type).length;
      return { ...prev, [activeName]: [...bench, makeInstance(type, sameType, uid.current)] };
    });
    // A newly added instance arrives SELECTED. Adding one is how you ask for a
    // multi-selection; making you then tick it would be a second step for the
    // thing you just asked for.
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
      // Never leave the panel with nothing selected because a row vanished.
      if (next.size === 0 && bench.length >= 2) next.add(bench[bench.length - 2].id);
      return { ...prev, [activeName]: next };
    });
  }

  /**
   * Zach, 2026-09-11: "I really like this where you add new instances, it kind
   * of gives it a random configuration, that's really fun just to explore
   * different things. I think there could also be a button that just says do
   * something random or randomize everything."
   *
   * It randomises the SELECTED instances, or all of them when nothing is
   * selected, and each instance rolls independently — a shared roll would
   * make every instance identical, which is the opposite of exploring.
   */
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
      [activeName]: prev[activeName].map((instance) =>
        selectedIds.has(instance.id)
          ? { ...instance, props: { ...instance.props, [fieldId]: value } }
          : instance,
      ),
    }));
  }

  function clearOverride(fieldId: string) {
    setBenches((prev) => ({
      ...prev,
      [activeName]: prev[activeName].map((instance) => {
        if (!selectedIds.has(instance.id)) return instance;
        const nextProps = { ...instance.props };
        delete nextProps[fieldId];
        return { ...instance, props: nextProps };
      }),
    }));
  }

  // WHY the checkbox is conditional: with one instance there is nothing to
  // choose between, so a tickbox is a control whose only reachable state is
  // the one it is already in. It appears the moment a second instance does.
  const showCheckboxes = instances.length > 1;

  return (
    <div data-slot="product-inspector-demo" style={rootStyle}>
      <div style={pickerRowStyle}>
        <label style={pickerLabelStyle}>
          Component
          <select
            data-slot="component-picker"
            value={activeName}
            onChange={(e) => setActiveName(e.target.value)}
            style={selectStyle}
          >
            {REGISTRY.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
              </option>
            ))}
            <option value={MIXED_BENCH}>{MIXED_BENCH} —</option>
          </select>
        </label>

        <label style={pickerLabelStyle}>
          Panel design
          <select
            data-slot="variant-picker"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            style={selectStyle}
          >
            {PANEL_VARIANTS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <div data-slot="variant-height" style={heightBadgeStyle}>
          {panelHeight === null ? "measuring…" : `${panelHeight}px tall`}
        </div>
      </div>

      <p data-slot="variant-blurb" style={blurbStyle}>
        {variant.blurb}
      </p>

      <div style={mainRowStyle}>
        <div style={previewColumnStyle}>
          <div style={previewHeaderStyle}>
            {isMixed ? "Bench" : "Instances"}
          </div>

          {instances.map((instance) => (
            <label
              key={instance.id}
              data-slot="subject-row"
              data-subject-id={instance.id}
              data-subject-type={instance.type}
              style={subjectRowStyle}
            >
              {showCheckboxes && (
                <input
                  type="checkbox"
                  data-slot="subject-checkbox"
                  checked={selectedIds.has(instance.id)}
                  onChange={() => toggleSelected(instance.id)}
                />
              )}
              {isMixed && <span style={typeTagStyle}>{instance.type}</span>}
              <div style={previewBoxStyle}>{entryFor(instance.type).render(instance.props)}</div>
            </label>
          ))}

          {isMixed ? (
            <div data-slot="bench-adder" style={adderRowStyle}>
              {REGISTRY.map((e) => (
                <button
                  key={e.name}
                  type="button"
                  data-slot="add-type"
                  data-type={e.name}
                  onClick={() => addInstance(e.name)}
                  style={adderChipStyle}
                  title={`Add a ${e.name} to the bench`}
                >
                  + {e.name}
                </button>
              ))}
              {instances.length > 1 && (
                <button type="button" data-slot="instance-minus" onClick={removeLastInstance} style={stepperButtonStyle} title="Remove the last one">
                  −
                </button>
              )}
              <button
                type="button"
                data-slot="randomize"
                onClick={randomizeInstances}
                style={randomizeStyle}
                title="Give every selected instance a random legal value for every field"
              >
                🎲 Randomize
              </button>
            </div>
          ) : (
            <div data-slot="instance-stepper" style={stepperRowStyle}>
              <button
                type="button"
                data-slot="instance-minus"
                onClick={removeLastInstance}
                disabled={instances.length <= 1}
                style={stepperButtonStyle}
              >
                −
              </button>
              <span data-slot="instance-count" style={stepperCountStyle}>
                {instances.length} {instances.length === 1 ? "instance" : "instances"}
              </span>
              <button
                type="button"
                data-slot="instance-plus"
                onClick={() => addInstance(activeName)}
                style={stepperButtonStyle}
              >
                +
              </button>
              <button
                type="button"
                data-slot="randomize"
                onClick={randomizeInstances}
                style={randomizeStyle}
                title="Give every selected instance a random legal value for every field"
              >
                🎲 Randomize
              </button>
            </div>
          )}
        </div>

        <div style={panelColumnStyle}>
          {shared && (
            <div data-slot="shared-field-note" style={sharedNoteStyle}>
              <strong>{selectedTypes.join(" + ")}</strong> —{" "}
              {shared.fields.length === 0 ? (
                <>nothing can be edited across all {selected.length}: these types have no field in common.</>
              ) : (
                <>
                  {shared.fields.length} field{shared.fields.length === 1 ? "" : "s"} can be edited
                  across all {selected.length}.
                </>
              )}
              {shared.excluded.length > 0 && (
                <span style={{ color: "#8a6a3a" }}>
                  {" "}
                  Not shared: {shared.excluded.slice(0, EXCLUDED_SHOWN).join(", ")}
                  {shared.excluded.length > EXCLUDED_SHOWN
                    ? `, and ${shared.excluded.length - EXCLUDED_SHOWN} more.`
                    : "."}
                </span>
              )}
            </div>
          )}
          <div ref={panelRef} data-slot="panel-variant-host" data-variant={variant.id}>
            {selected.length > 0 && panelFields.length === 0 ? (
              // WHY its own card rather than the panel rendering an empty list:
              // a bordered box with a header and nothing under it reads as a
              // bug. The bench's answer to "what can I change across these?"
              // is sometimes "nothing", and it has to say so out loud.
              <div data-slot="no-shared-fields" style={emptyPanelStyle}>
                <strong>{selectedTypes.join(" + ")}</strong>
                <p style={{ margin: "6px 0 0" }}>
                  No field is common to all {selected.length} selected instances, so there is
                  nothing a single control could write. Deselect a type to get a panel back.
                </p>
              </div>
            ) : (
            <variant.Panel
              componentName={panelName}
              fields={panelFields}
              presets={panelPresets}
              subjects={selected}
              toSubject={panelToSubject}
              onChange={applyToSelected}
              onClearOverride={clearOverride}
            />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16, padding: 32 };
const pickerRowStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
const pickerLabelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "#666" };
const selectStyle: CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 };
const heightBadgeStyle: CSSProperties = { marginLeft: "auto", alignSelf: "flex-end", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#666", border: "1px solid #ddd", borderRadius: 999, padding: "4px 10px" };
const blurbStyle: CSSProperties = { margin: 0, maxWidth: 760, fontSize: 13, lineHeight: 1.5, color: "#555" };
const mainRowStyle: CSSProperties = { display: "flex", gap: 32, alignItems: "flex-start" };
const panelColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const emptyPanelStyle: CSSProperties = { width: 420, border: "1px solid #e0e0e6", borderRadius: 10, background: "#fff", padding: "18px 20px", fontSize: 13, color: "#555", lineHeight: 1.55 };
const sharedNoteStyle: CSSProperties = { maxWidth: 460, fontSize: 12, lineHeight: 1.5, color: "#555", background: "#fbf7f0", border: "1px solid #efe2cf", borderRadius: 8, padding: "8px 12px" };
const stepperRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 4 };
const adderRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8, maxWidth: 260 };
const adderChipStyle: CSSProperties = { border: "1px dashed #c8c8d0", background: "transparent", color: "#555", borderRadius: 999, padding: "3px 9px", fontSize: 11, cursor: "pointer" };
const stepperButtonStyle: CSSProperties = { width: 24, height: 24, lineHeight: "20px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: 15, padding: 0 };
const randomizeStyle: CSSProperties = { border: "1px solid #d8d8e0", background: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, color: "#555", cursor: "pointer", whiteSpace: "nowrap" };
const stepperCountStyle: CSSProperties = { fontSize: 12, color: "#666", minWidth: 74, textAlign: "center" };
const typeTagStyle: CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#999", minWidth: 62 };
const previewColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12, minWidth: 260 };
const previewHeaderStyle: CSSProperties = { fontWeight: 600, color: "#666", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 };
const subjectRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const previewBoxStyle: CSSProperties = { display: "flex", alignItems: "center" };
