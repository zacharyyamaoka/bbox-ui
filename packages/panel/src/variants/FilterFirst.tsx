import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MIXED,
  governedFieldIds,
  readFields,
  type FieldSpec,
  type FieldValue,
} from "@bbox-ui/schema";
import { FieldTraceRow } from "../FieldTraceRow";
import { readFieldRow } from "../fieldModel";
import type { PanelVariant, PanelVariantProps } from "./contract";

/**
 * demos/inspector/src/variants/FilterFirst.tsx
 *
 * The other four variants in this set all answer "how do we fit twenty
 * fields into a smaller box" — tighter rows, denser grids, collapsed
 * groups that are still all there at a glance. This one answers a
 * different question: why is the panel showing all twenty at once in the
 * first place, for a component the user is looking at for one reason?
 *
 * FILTER FIRST opens SHORT — presets, a filter box, and only the fields
 * that are either already the preset-selecting field or already carry a
 * stored override — and grows on demand, either by typing (which searches
 * the FULL field list regardless of what's currently shown) or by
 * clicking the honest "N more" count. The bet: a panel that opens at a
 * handful of rows and can reach forty beats one that is always twenty,
 * because most inspection sessions only ever touch two or three fields.
 *
 * AMENDMENT (Zach, mid-build — see the 2026-09-11 note): a resting row
 * cannot be `FieldTraceRow`'s full header-plus-control block, because that
 * renders the whole editable widget even for a field nobody is touching —
 * on Pill, whose four paint fields are ALL preset-governed, that turns
 * "resting" back into the always-twenty panel this variant exists to
 * avoid. So the field list below is built from a SECOND, purpose-built
 * `FieldSummaryRow` — one compact line, driven/overridden/default read at
 * a glance — and only swaps in the real `FieldTraceRow` (full control,
 * clear-override, chain disclosure) when that one row is clicked open.
 * The resolution LOGIC (`resolveField`, Mixed, stored-vs-painted) is
 * still the schema package's, never reimplemented; only the collapsed
 * PRESENTATION is new, and the edit affordance still IS `FieldTraceRow`
 * verbatim, so nothing about clear-override or the chain trace drifts
 * from the panel every other variant is compared against.
 */

function fieldMatchesQuery(field: FieldSpec, query: string): boolean {
  if (query === "") return true;
  return field.label.toLowerCase().includes(query) || field.id.toLowerCase().includes(query);
}

function hasStoredOverride(field: FieldSpec, subjects: PanelVariantProps["subjects"]): boolean {
  return subjects.some((s) => s.props[field.id] !== undefined);
}

/** Segments already carry a human label per option (Port's own diameter
 * field reads "Medium · 12px") — reusing it here is Case A's "name and
 * resolved value on one line" for free, with no separate dropdown widget
 * to build. Toggle reads on/off like the real control; text falls back to
 * an em dash rather than an empty cell so a row is never blank. */
function formatResolvedValue(field: FieldSpec, value: FieldValue): string {
  if (field.kind === "toggle") return value === true ? "on" : "off";
  if (field.kind === "segments") {
    const option = field.options?.find((o) => o.value === String(value));
    if (option) return option.label;
  }
  const text = String(value);
  return text === "" ? "—" : text;
}

type RowState = "mixed" | "driven" | "overridden" | "default";

// Same palette FieldTraceRow's own winner badge already uses — override
// purple, preset blue — so a reader doesn't have to learn a second colour
// language between the compact row and the row it expands into. Default
// gets the quietest mark of the three, per the amendment's own ask.
function dotColor(state: RowState): string {
  switch (state) {
    case "mixed":
      return "var(--bbox-panel-warn, #b45309)";
    case "overridden":
      return "var(--bbox-panel-override, #6d28d9)";
    case "driven":
      return "var(--bbox-panel-preset, #1d4ed8)";
    default:
      return "var(--bbox-panel-border, #d1d5db)";
  }
}
function valueColor(state: RowState): string {
  switch (state) {
    case "mixed":
      return "var(--bbox-panel-warn, #b45309)";
    case "overridden":
      return "var(--bbox-panel-fg, #111)";
    case "driven":
      return "var(--bbox-panel-preset, #1d4ed8)";
    default:
      return "var(--bbox-panel-fg-faint, #999)";
  }
}

interface FieldSummaryRowProps {
  field: FieldSpec;
  subjects: PanelVariantProps["subjects"];
  presets: PanelVariantProps["presets"];
  governed: Set<string>;
  toSubject?: PanelVariantProps["toSubject"];
  editing: boolean;
  onToggleEdit: () => void;
  onChange: PanelVariantProps["onChange"];
  onClearOverride: PanelVariantProps["onClearOverride"];
}

/**
 * ONE compact line at rest: a three-state dot, the label, and a value cell
 * that reads `<preset name> · <resolved value>` when a preset supplies it
 * — the amendment's point 1 and 2, generalised past Pill's dropdown case
 * to the many-fields-one-preset case the current panel answers with a
 * full expanded chain per field. Click (or Enter from the filter box)
 * swaps this line for the real `FieldTraceRow` in place, which is where
 * editing, clear-override and the full cascade chain still live —
 * unchanged, just no longer the resting state.
 */
function FieldSummaryRow({
  field,
  subjects,
  presets,
  governed,
  toSubject,
  editing,
  onToggleEdit,
  onChange,
  onClearOverride,
}: FieldSummaryRowProps) {
  // WHY: shared field-resolution model (../fieldModel.ts) — this row used
  // to resolve "which layer won" and "is anything painting elsewhere"
  // against subjects[0] as a stand-in for the whole selection, which could
  // show a driven/overridden state and a resolved value that no other
  // selected subject actually carries. The shared model only reports a
  // trace/painted-elsewhere note when the whole selection agrees.
  const { isMixed, trace, paintedElsewhere, hasOwnOverride } = readFieldRow(field, subjects, presets, toSubject);

  const state: RowState = isMixed
    ? "mixed"
    : hasOwnOverride
      ? "overridden"
      : trace?.winner === "preset"
        ? "driven"
        : "default";

  const presetLabel =
    trace?.winner === "preset" ? presets.find((p) => p.id === trace.winningPresetId)?.label ?? trace.winningPresetId : undefined;

  const resolvedForDisplay = trace ? trace.resolved : (field.defaultValue as FieldValue);
  const valueText = isMixed
    ? "Mixed"
    : state === "driven"
      ? `${presetLabel} · ${formatResolvedValue(field, resolvedForDisplay)}`
      : formatResolvedValue(field, resolvedForDisplay);

  if (editing) {
    return (
      <div data-slot="filter-first-row" data-field={field.id} data-row-state={state} style={editingWrapStyle}>
        <button
          type="button"
          data-slot="filter-first-collapse-row"
          onClick={onToggleEdit}
          style={collapseRowButtonStyle}
          aria-label={`Collapse ${field.label}`}
          title="Back to the compact row"
        >
          {"▾"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldTraceRow
            toSubject={toSubject}
            field={field}
            subjects={subjects}
            presets={presets}
            governed={governed}
            onChange={onChange}
            onClearOverride={onClearOverride}
          />
        </div>
      </div>
    );
  }

  return (
    <div data-slot="filter-first-row" data-field={field.id} data-row-state={state} style={summaryRowWrapStyle}>
      <button type="button" data-slot="filter-first-expand-row" onClick={onToggleEdit} style={summaryRowStyle}>
        <span data-slot="filter-first-row-dot" style={dotStyle(state)} aria-hidden="true" />
        <span style={summaryLabelStyle}>{field.label}</span>
        <span style={{ flex: 1 }} />
        <span data-slot="filter-first-row-value" style={summaryValueStyle(state)}>
          {valueText}
        </span>
      </button>
      {paintedElsewhere !== null && (
        <span data-slot="filter-first-row-painted" style={paintedNoteStyle}>
          painting {String(paintedElsewhere)}
        </span>
      )}
    </div>
  );
}

function FilterFirstPanel({
  componentName,
  fields,
  presets,
  subjects,
  toSubject,
  onChange,
  onClearOverride,
}: PanelVariantProps): ReactNode {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const governed = useMemo(() => new Set(governedFieldIds(presets)), [presets]);
  const selectors = useMemo(() => Array.from(new Set(presets.map((p) => p.selector))), [presets]);

  // THE DEFAULT-VISIBLE-SET RULE — a stated rule, not a per-component list,
  // because this file renders all eight registered components off the same
  // FieldSpec[]/PresetSpec[] shape and cannot know any of their field ids.
  //
  //   default set = { the preset selector field(s) } ∪ { any field that
  //                   currently carries a stored override on ANY selected
  //                   subject }
  //
  // DELIBERATELY EXCLUDES driven-only fields (governed, no override) —
  // decided, not defaulted, under the amendment. A field a preset is
  // driving is not the same as one left at its own default, but putting
  // every governed field back into the resting view defeats this variant:
  // on Pill that is 4 rows re-added purely to restate what the preset
  // picker above already says. The amendment's point 3 is what makes this
  // safe — the preset row itself now reports "<preset> +N" the moment any
  // of its governed fields gets overridden, so "is anything off-preset?"
  // is answered at the top of the panel without opening a single row.
  // Showing every driven field by default would be the panel repeating
  // that answer twenty times over; the modification badge is the one
  // place it belongs.
  const selectorIds = useMemo(() => new Set(selectors), [selectors]);
  const defaultFieldIds = useMemo(
    () =>
      new Set(
        fields
          .filter((field) => selectorIds.has(field.id) || hasStoredOverride(field, subjects))
          .map((field) => field.id),
      ),
    [fields, subjects, selectorIds],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const isFiltering = trimmedQuery !== "";
  // A query searches the WHOLE field list, not just what's currently
  // shown — "typing col leaves the colour fields and nothing else" only
  // holds if the search reaches past the collapsed set. Expansion state
  // only matters when the box is empty.
  const candidateFields = isFiltering || expanded ? fields : fields.filter((f) => defaultFieldIds.has(f.id));
  const visibleFields = candidateFields.filter((f) => fieldMatchesQuery(f, trimmedQuery));
  const visibleIds = new Set(visibleFields.map((f) => f.id));
  const hiddenFields = fields.filter((f) => !visibleIds.has(f.id));
  // HONESTY REQUIREMENT #1: a field the filter conceals but that holds a
  // stored override gets counted on its own, separately from the plain
  // "more" count — otherwise typing a filter is a way to quietly lose
  // sight of a value someone set. Computed, not estimated (requirement #2):
  // both counts below are exact `.length`s over the real field list, not a
  // ratio or a rounded page size.
  const hiddenOverrideFields = hiddenFields.filter((f) => hasStoredOverride(f, subjects));

  useEffect(() => {
    if (!editingFieldId) return;
    const row = rowRefs.current.get(editingFieldId);
    const control = row?.querySelector<HTMLElement>("input, button:not([data-slot])");
    control?.focus();
  }, [editingFieldId]);

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const first = visibleFields[0];
      if (first) setEditingFieldId(first.id);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div data-slot="filter-first-panel" style={panelStyle}>
      <div data-slot="filter-first-header" style={headerStyle}>
        {componentName} — {subjects.length === 0 ? "no subject selected" : `${subjects.length} selected`}
      </div>

      {/* Contract #1: presets first. Same selector->preset mapping the
          current panel uses; a component with no presets (Port) renders
          nothing here, same as today. */}
      {selectors.length > 0 && (
        <div data-slot="filter-first-presets" style={presetsSectionStyle}>
          {selectors.map((selector) => {
            const presetsForSelector = presets.filter((p) => p.selector === selector);
            const selectorField: FieldSpec =
              fields.find((f) => f.id === selector) ??
              ({ id: selector, label: selector, kind: "segments", defaultValue: "" } as FieldSpec);
            const reading = readFields([selectorField], subjects.map((s) => s.props))[0];
            const current = reading.value === MIXED ? undefined : String(reading.value);
            const activePreset = presetsForSelector.find((p) => p.id === current);
            // AMENDMENT point 3: the preset row reports its own
            // modification — Figma's "modified instance" move. Any field
            // the active preset governs that also carries a stored
            // override means the semantic choice is only PARTLY in force;
            // a single reset clears every one of them back to the preset.
            const modifiedFieldIds = activePreset
              ? activePreset.governs.filter((fieldId) => subjects.some((s) => s.props[fieldId] !== undefined))
              : [];
            return (
              <div key={selector} data-slot="preset-picker" data-selector={selector} style={presetRowStyle}>
                <span style={presetLabelStyle}>{selector}</span>
                <div style={presetButtonsRowStyle}>
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
                  {reading.value === MIXED && <span style={mixedNoteStyle}>mixed</span>}
                  {modifiedFieldIds.length > 0 && (
                    <span data-slot="preset-modified" style={modifiedNoteStyle}>
                      +{modifiedFieldIds.length}
                      <button
                        type="button"
                        data-slot="preset-modified-reset"
                        onClick={() => modifiedFieldIds.forEach((fieldId) => onClearOverride(fieldId))}
                        style={modifiedResetStyle}
                        title={`Reset ${modifiedFieldIds.length} override(s) back to ${activePreset?.label ?? selector}`}
                      >
                        reset
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div data-slot="filter-first-filter-row" style={filterRowStyle}>
        <input
          type="text"
          data-slot="filter-first-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFilterKeyDown}
          placeholder="Filter fields…"
          aria-label="Filter fields by label or id"
          style={filterInputStyle}
        />
        <span data-slot="filter-first-scope" style={scopeStyle}>
          {visibleFields.length} of {fields.length}
        </span>
      </div>

      <div data-slot="field-trace-list" style={fieldListStyle}>
        {visibleFields.map((field) => (
          <div
            key={field.id}
            ref={(el) => {
              if (el) rowRefs.current.set(field.id, el);
              else rowRefs.current.delete(field.id);
            }}
          >
            <FieldSummaryRow
              field={field}
              subjects={subjects}
              presets={presets}
              governed={governed}
              toSubject={toSubject}
              editing={editingFieldId === field.id}
              onToggleEdit={() => setEditingFieldId((id) => (id === field.id ? null : field.id))}
              onChange={onChange}
              onClearOverride={onClearOverride}
            />
          </div>
        ))}
      </div>

      {/* Contract #7: every field reachable. Hiding is allowed, losing is
          not — this count is the only thing standing between "compact"
          and "silently missing a field", so it is never approximate and
          it never disappears while anything is hidden. */}
      {hiddenFields.length > 0 && (
        <div data-slot="filter-first-hidden" style={hiddenRowStyle}>
          {!isFiltering ? (
            <button
              type="button"
              data-slot="filter-first-expand"
              onClick={() => setExpanded(true)}
              style={expandButtonStyle}
            >
              {hiddenFields.length} more
            </button>
          ) : (
            <span data-slot="filter-first-filtered-count" style={filteredNoteStyle}>
              {hiddenFields.length} hidden by filter
            </span>
          )}
          {hiddenOverrideFields.length > 0 && (
            <span data-slot="filter-first-hidden-overrides" style={hiddenOverrideStyle}>
              {hiddenOverrideFields.length} of those hold a stored override — clear the filter to see{" "}
              {hiddenOverrideFields.length === 1 ? "it" : "them"}
            </span>
          )}
        </div>
      )}

      {!isFiltering && expanded && hiddenFields.length === 0 && (
        <button
          type="button"
          data-slot="filter-first-collapse"
          onClick={() => setExpanded(false)}
          style={collapseButtonStyle}
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

export const FILTER_FIRST: PanelVariant = {
  id: "filter-first",
  label: "Filter First",
  blurb:
    "Opens with only the preset selector and fields you've already touched — 4 rows " +
    "for Port's 19-field set, 1 row for Pill's fully-preset-governed paint fields — " +
    "then grows by typing a live label/id filter or clicking the honest \"N more\" " +
    "count. Every resting row is one line: a driven/overridden/default dot plus " +
    "\"preset · value\", and the preset row itself flags \"+N\" the moment anything " +
    "it governs gets overridden. Bet: short-and-reachable beats always-twenty.",
  Panel: FilterFirstPanel,
};

/* ------------------------------------------------------------------ */
/* Styles — plain inline objects, no build-time CSS dependency here    */
/* ------------------------------------------------------------------ */

const panelStyle: CSSProperties = {
  width: 320,
  padding: 16,
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "sans-serif",
  fontSize: 13,
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "var(--bbox-panel-fg-muted, #666)" };

const presetsSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  background: "var(--bbox-panel-override-bg, #f5f3ff)",
  border: "1px solid var(--bbox-panel-override-ring, #ddd6fe)",
  borderRadius: 6,
};
const presetRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const presetLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--bbox-panel-override, #6d28d9)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const presetButtonsRowStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
const mixedNoteStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-warn, #b45309)" };
const modifiedNoteStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "var(--bbox-panel-warn-bg, #fef3c7)",
  borderRadius: 4,
  padding: "1px 6px",
};
const modifiedResetStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 400,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "none",
  border: "none",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
};

function presetButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: selected ? "1px solid var(--bbox-panel-override, #6d28d9)" : "1px solid var(--bbox-panel-override-ring, #c4b5fd)",
    background: selected ? "var(--bbox-panel-override, #6d28d9)" : "white",
    color: selected ? "white" : "var(--bbox-panel-override, #6d28d9)",
    cursor: "pointer",
  };
}

const filterRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const filterInputStyle: CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  border: "1px solid var(--bbox-panel-border, #ccc)",
  borderRadius: 6,
  fontSize: 13,
};
const scopeStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-faint, #999)", whiteSpace: "nowrap" };

const fieldListStyle: CSSProperties = { display: "flex", flexDirection: "column" };

/* -- field summary row (resting) -- */
const summaryRowWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderBottom: "1px solid var(--bbox-panel-surface-2, #f0f0f0)",
};
const summaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 2px",
  border: "none",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};
function dotStyle(state: RowState): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: dotColor(state),
    flexShrink: 0,
  };
}
const summaryLabelStyle: CSSProperties = { fontSize: 13, color: "var(--bbox-panel-fg, #111)", flexShrink: 0 };
function summaryValueStyle(state: RowState): CSSProperties {
  return {
    fontSize: 12,
    color: valueColor(state),
    fontWeight: state === "overridden" ? 600 : 400,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 180,
  };
}
const paintedNoteStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.65,
  fontStyle: "italic",
  paddingLeft: 14,
  paddingBottom: 4,
};

/* -- field editing row (a field clicked open) -- */
const editingWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 4,
  borderBottom: "1px solid var(--bbox-panel-surface-2, #f0f0f0)",
  background: "var(--bbox-panel-surface-2, #fafafa)",
};
const collapseRowButtonStyle: CSSProperties = {
  width: 16,
  marginTop: 10,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--bbox-panel-fg-muted, #666)",
  fontSize: 11,
  padding: 0,
  flexShrink: 0,
};

const hiddenRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, paddingTop: 4 };
const expandButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid var(--bbox-panel-border, #ccc)",
  background: "var(--bbox-panel-surface-2, #fafafa)",
  color: "var(--bbox-panel-fg, #333)",
  cursor: "pointer",
};
const collapseButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  padding: "4px 10px",
  borderRadius: 6,
  fontSize: 12,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--bbox-panel-fg-faint, #888)",
  cursor: "pointer",
};
const filteredNoteStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-faint, #888)" };
const hiddenOverrideStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "var(--bbox-panel-warn-bg, #fef3c7)",
  borderRadius: 4,
  padding: "2px 6px",
  alignSelf: "flex-start",
};
