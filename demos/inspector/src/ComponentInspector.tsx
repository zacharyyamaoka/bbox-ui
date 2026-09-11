import type { CSSProperties } from "react";
import { MIXED, governedFieldIds, readFields, type FieldValue } from "@bbox-ui/schema";
import type { ComponentEntry } from "./schema/registerComponent";
import { FieldTraceRow, type Subject } from "./FieldTraceRow";

export interface ComponentInspectorProps {
  entry: ComponentEntry;
  subjects: Subject[];
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}

/**
 * The generic panel over ONE registered component (T1-SPEC.md §7.2/§7.3).
 * A component picker lives in `App.tsx` (Integration-owned wiring); this
 * file is Lane D's engine — it knows `entry.fields`/`entry.presets` are
 * generic `FieldSpec[]`/`PresetSpec[]` and nothing else about which
 * component it is looking at.
 *
 * Presets render FIRST and largest — "presets as the primary path, raw
 * overrides as visibly secondary" (the orchestrator brief's own words):
 * one segmented row per selector a preset family governs (almost always
 * just `state`), then the full field list below, each row a
 * `FieldTraceRow`.
 */
export function ComponentInspector({ entry, subjects, onChange, onClearOverride }: ComponentInspectorProps) {
  const governed = new Set(governedFieldIds(entry.presets));
  const selectors = Array.from(new Set(entry.presets.map((p) => p.selector)));

  return (
    <div data-slot="component-inspector" style={panelStyle}>
      <div data-slot="component-inspector-header" style={headerStyle}>
        {entry.name} — {subjects.length === 0 ? "no subject selected" : `${subjects.length} selected`}
      </div>

      {selectors.map((selector) => {
        const presetsForSelector = entry.presets.filter((p) => p.selector === selector);
        // WHY the real field rather than a fabricated one: a synthetic spec
        // with `defaultValue: ""` makes a subject that has never set the
        // selector resolve to "", so no preset button highlights while the
        // component is painting its default preset perfectly happily.
        const selectorField = entry.fields.find((f) => f.id === selector) ?? {
          id: selector,
          label: selector,
          kind: "segments" as const,
          defaultValue: "",
        };
        const reading = readFields([selectorField], subjects.map((s) => s.props))[0];
        const current = reading.value === MIXED ? undefined : String(reading.value);
        return (
          <div key={selector} data-slot="preset-picker" data-selector={selector} style={presetSectionStyle}>
            <div style={presetLabelStyle}>Preset ({selector})</div>
            <div style={presetRowStyle}>
              {presetsForSelector.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-slot="preset-button"
                  data-preset={preset.id}
                  data-selected={current === preset.id}
                  onClick={() => onChange(selector, preset.id)}
                  style={presetButtonStyle(current === preset.id)}
                >
                  {preset.label}
                </button>
              ))}
              {reading.value === MIXED && <span style={mixedNote}>mixed</span>}
            </div>
          </div>
        );
      })}

      <div data-slot="field-trace-list" style={fieldListStyle}>
        {entry.fields.map((field) => (
          <FieldTraceRow
              toSubject={entry.toSubject}
            key={field.id}
            field={field}
            subjects={subjects}
            presets={entry.presets}
            governed={governed}
            onChange={onChange}
            onClearOverride={onClearOverride}
          />
        ))}
      </div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 320,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "sans-serif",
  fontSize: 13,
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "#666" };
const presetSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  background: "#f5f3ff",
  border: "1px solid #ddd6fe",
  borderRadius: 6,
};
const presetLabelStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6d28d9", textTransform: "uppercase", letterSpacing: 0.4 };
const presetRowStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
const mixedNote: CSSProperties = { fontSize: 11, color: "#b45309" };

function presetButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: selected ? "1px solid #6d28d9" : "1px solid #c4b5fd",
    background: selected ? "#6d28d9" : "white",
    color: selected ? "white" : "#6d28d9",
    cursor: "pointer",
  };
}

const fieldListStyle: CSSProperties = { display: "flex", flexDirection: "column" };
