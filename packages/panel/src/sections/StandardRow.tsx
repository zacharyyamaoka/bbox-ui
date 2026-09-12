import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MIXED, type FieldSpec, type FieldTrace, type FieldValue, type PresetSpec } from "@bbox-ui/schema";
import { readFieldRow } from "../fieldModel";
import { NumberInput } from "../NumberInput";
import type { BoundField, StandardControl } from "./contract";

/**
 * THE standard control list, and the two row shells that hold it.
 *
 * Six controls, one file. Everything the inspector can edit — a Block's
 * width, a Bar's `hidden`, an Arrangement's live edges, a Port's placement
 * `t` — comes through here, so "consistency across the entire application"
 * is a property of the code rather than a habit five designs have to keep.
 *
 * Every control root carries `data-standard-control`, which is what the
 * browser journey asserts on: any control that skipped this file is
 * therefore a build failure, not a review note.
 *
 * Ported by value from `variants/FigmaDense.tsx` (the density model Zach
 * chose on 2026-09-11 — narrow label column, unit inside the number box,
 * label scrubs, >3 options becomes a dropdown), minus that file's card
 * chrome and plus the `flags` control and the disabled/foreign-target
 * plumbing sections need.
 */

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type RowGeometry = "label-left" | "label-above";

export const LABEL_WIDTH = 92;

/* ------------------------------------------------------------------ */
/* One row                                                             */
/* ------------------------------------------------------------------ */

export function StandardRow({ bound, geometry = "label-left" }: { bound: BoundField; geometry?: RowGeometry }) {
  const [expanded, setExpanded] = useState(false);
  const { field } = bound;
  const data = readFieldRow(field, bound.subjects, bound.presets, bound.toSubject);
  const governed = bound.governed.has(field.id);
  const clearable = (governed || data.trace?.candidates[1]?.value !== undefined) && data.hasOwnOverride;

  const label = (
    <RowLabel
      bound={bound}
      data={data}
      governed={governed}
      expanded={expanded}
      setExpanded={setExpanded}
      compact={geometry === "label-above"}
    />
  );
  const control = (
    <div style={controlCellStyle}>
      <ControlFor
        field={field}
        value={data.collapsedValue}
        isMixed={data.isMixed}
        secondary={governed}
        disabled={bound.disabled}
        presets={bound.presets}
        drivenPresetId={data.drivenPresetId ?? undefined}
        onChange={(value) => bound.onChange(field.id, value)}
      />
      {clearable && !bound.disabled && (
        <button
          type="button"
          data-slot="field-clear-override"
          onClick={() => bound.onClearOverride(field.id)}
          title="Clear this instance's override"
          style={clearButtonStyle}
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <div
      data-slot="standard-row"
      data-field={field.id}
      data-target={bound.targetId}
      data-governed={governed}
      data-geometry={geometry}
      style={geometry === "label-above" ? rowAboveStyle : rowWrapStyle}
    >
      {geometry === "label-above" ? (
        <>
          {label}
          {control}
        </>
      ) : (
        <div style={rowGridStyle}>
          {label}
          {control}
        </div>
      )}
      {bound.note && (
        <div data-slot="field-note" style={noteStyle(geometry)}>
          {bound.note}
        </div>
      )}
      {data.paintedElsewhere !== null && (
        <div data-slot="field-painted-elsewhere" style={noteStyle(geometry)}>
          painting {String(data.paintedElsewhere)}
        </div>
      )}
      {expanded && data.trace && <TraceChain trace={data.trace} presets={bound.presets} geometry={geometry} />}
    </div>
  );
}

/** Two fields that declare the same `group`, side by side. */
export function StandardPair({ fields, geometry = "label-left" }: { fields: [BoundField, BoundField]; geometry?: RowGeometry }) {
  return (
    <div data-slot="standard-pair" style={pairWrapStyle}>
      {fields.map((bound) => (
        <div key={bound.field.id} style={pairCellStyle}>
          {/* A pair ALWAYS stacks its label: two label-left rows on one line
              would spend 184 of ~300px on captions. This is the one place
              FigmaDense already made the same choice, and the reason S4's
              label-above geometry is not a restyle — it is that choice
              applied to every row. */}
          <StandardRow bound={bound} geometry="label-above" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Label + provenance                                                  */
/* ------------------------------------------------------------------ */

interface RowData {
  trace: FieldTrace | null;
  isMixed: boolean;
  collapsedValue: FieldValue | undefined;
  inheritedFrom: string | null;
}

function RowLabel({
  bound,
  data,
  governed,
  expanded,
  setExpanded,
  compact,
}: {
  bound: BoundField;
  data: RowData;
  governed: boolean;
  expanded: boolean;
  setExpanded: (fn: (v: boolean) => boolean) => void;
  compact: boolean;
}) {
  const { field } = bound;
  const scrub = useLabelScrub(bound, data);
  const dotTitle = data.isMixed
    ? "Mixed across selection"
    : data.trace
      ? `${
          data.trace.winner === "preset"
            ? `preset: ${data.trace.winningPresetId ?? ""}`
            : data.trace.winner === "inherited"
              ? `inherited · ${data.inheritedFrom ?? ""}`
              : data.trace.winner
        } — click to see the cascade`
      : undefined;
  const scrubbable = field.kind === "number" && !bound.disabled;
  return (
    <div style={compact ? labelCellCompactStyle : labelCellStyle}>
      <button
        type="button"
        data-slot="field-provenance-dot"
        data-winner={data.isMixed ? "mixed" : (data.trace?.winner ?? "none")}
        disabled={!data.trace}
        onClick={() => setExpanded((v) => !v)}
        title={dotTitle}
        style={dotButtonStyle(data.isMixed, data.trace?.winner, expanded)}
      />
      <span
        data-slot="field-label"
        style={labelTextStyle(governed, scrubbable, compact)}
        onPointerDown={scrubbable ? scrub.onPointerDown : undefined}
        onPointerMove={scrubbable ? scrub.onPointerMove : undefined}
        onPointerUp={scrubbable ? scrub.onPointerUp : undefined}
        title={field.hint}
      >
        {field.label}
      </span>
    </div>
  );
}

const SCRUB_PX_PER_STEP = 4;
const SCRUB_THRESHOLD_PX = 3;

function useLabelScrub(bound: BoundField, data: RowData) {
  const start = useRef<{ x: number; value: number } | null>(null);
  const moved = useRef(false);
  const { field } = bound;
  return {
    onPointerDown(event: React.PointerEvent) {
      if (field.kind !== "number") return;
      const current = typeof data.collapsedValue === "number" ? data.collapsedValue : Number(field.defaultValue);
      start.current = { x: event.clientX, value: current };
      moved.current = false;
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: React.PointerEvent) {
      if (!start.current) return;
      const dx = event.clientX - start.current.x;
      if (!moved.current && Math.abs(dx) < SCRUB_THRESHOLD_PX) return;
      moved.current = true;
      const step = field.step ?? 1;
      let next = start.current.value + Math.round(dx / SCRUB_PX_PER_STEP) * step;
      if (field.min !== undefined) next = Math.max(field.min, next);
      if (field.max !== undefined) next = Math.min(field.max, next);
      bound.onChange(field.id, Math.round(next * 1000) / 1000);
    },
    onPointerUp(event: React.PointerEvent) {
      start.current = null;
      (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    },
  };
}

function TraceChain({ trace, presets, geometry }: { trace: FieldTrace; presets: PresetSpec[]; geometry: RowGeometry }) {
  return (
    <div data-slot="field-trace-chain" style={chainStyle(geometry)}>
      {trace.candidates.map((candidate) => (
        <div key={candidate.layer} data-slot="field-trace-candidate" style={candidateRowStyle(candidate.layer === trace.winner)}>
          <span style={candidateDotStyle(candidate.layer === trace.winner)} />
          <span style={candidateLayerStyle}>
            {candidate.layer === "preset" && trace.winningPresetId
              ? (presets.find((p) => p.id === trace.winningPresetId)?.label ?? "preset")
              : candidate.layer}
          </span>
          <span style={candidateValueStyle}>{candidate.value === undefined ? "—" : String(candidate.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* THE SIX CONTROLS                                                    */
/* ------------------------------------------------------------------ */

/**
 * When an enum is a segmented strip rather than a dropdown.
 *
 * Three conditions, each from a real failure:
 *  - 2 TO 3 OPTIONS. Four wrap. ONE is a dead control — a radio group with
 *    a single choice paints as a pressed button you cannot unpress, which
 *    is what a Block with one Arrangement showed on the first build.
 *  - EVERY LABEL SHORT. "+ New grouping set" is a verb wearing a value's
 *    clothes; as a segment it reads as a second state to pick, as a
 *    dropdown row it reads as the action it is. 10 characters is the line.
 *  - TOTAL WIDTH within the control column, measured in characters because
 *    that is what overflows it: a count says "Small · 8px / Medium · 12px /
 *    Large · 18px" is three options and therefore fine, and at 37
 *    characters it clipped its third option off the panel edge.
 */
const SEGMENT_CHAR_BUDGET = 26;
const SEGMENT_PADDING_CHARS = 2;
const SEGMENT_LABEL_MAX = 10;

function isSegmented(options: { label: string }[]): boolean {
  if (options.length < 2 || options.length > 3) return false;
  if (options.some((o) => o.label.length > SEGMENT_LABEL_MAX)) return false;
  return options.reduce((n, o) => n + o.label.length + SEGMENT_PADDING_CHARS, 0) <= SEGMENT_CHAR_BUDGET;
}

export function ControlFor({
  field,
  value,
  isMixed,
  secondary,
  disabled,
  presets,
  drivenPresetId,
  onChange,
}: {
  field: FieldSpec;
  value: FieldValue | undefined;
  isMixed: boolean;
  secondary?: boolean;
  disabled?: boolean;
  presets: PresetSpec[];
  drivenPresetId?: string;
  onChange: (value: FieldValue) => void;
}) {
  if (field.kind === "flags") {
    // CONTROL 6 · flags — a SET over the field's options, stored as one
    // comma-joined string so `FieldValue` stays scalar and Randomize, the
    // Code view and every resolver keep working unchanged.
    //
    // WHY this became a standard control rather than staying the
    // Arrangement section's four hand-rolled T/R/B/L buttons: Zach,
    // 2026-09-12 — "all controls should kinda be from a standard control
    // list". The honest reading of that is not "never add a control", it
    // is "add it once, here, and let everything reuse it".
    const selected = new Set(String(value ?? "").split(",").filter(Boolean));
    return (
      <div data-standard-control="flags" data-slot="flags-control" role="group" aria-label={field.label} style={flagsWrapStyle}>
        {(field.options ?? []).map((option) => {
          const on = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              data-flag={option.value}
              aria-pressed={on}
              disabled={disabled}
              title={option.label}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(option.value);
                else next.add(option.value);
                onChange((field.options ?? []).filter((o) => next.has(o.value)).map((o) => o.value).join(","));
              }}
              style={flagButtonStyle(on, disabled)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.kind === "segments") {
    const options = field.options ?? [];
    if (isSegmented(options)) {
      // CONTROL 1 · segmented — two or three short options, one glance.
      return (
        <div data-standard-control="segmented" style={segmentedGroupStyle(disabled)}>
          {options.map((option) => {
            const active = !isMixed && value !== undefined && String(value) === option.value;
            return (
              <button
                key={option.value}
                type="button"
                data-segment={option.value}
                data-selected={active}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                style={segmentButtonStyle(active, secondary)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }
    // CONTROL 2 · dropdown — named stops, a tick on the active one.
    return (
      <Dropdown
        triggerText={isMixed ? "Mixed" : drivenText(optionLabelFor(field, value), drivenPresetId, presets)}
        isMixed={isMixed}
        secondary={secondary}
        disabled={disabled}
        rows={options.map((option) => ({
          key: option.value,
          label: option.label,
          sublabel: option.value !== option.label ? option.value : undefined,
          active: !isMixed && value !== undefined && String(value) === option.value,
        }))}
        onSelect={(key) => onChange(key)}
      />
    );
  }

  if (field.kind === "toggle") {
    // CONTROL 4 · toggle.
    return (
      <label data-standard-control="toggle" style={toggleLabelStyle(secondary, disabled)}>
        <input
          type="checkbox"
          checked={!isMixed && value === true}
          disabled={disabled}
          ref={(el) => {
            if (el) el.indeterminate = isMixed;
          }}
          onChange={(e) => onChange(e.target.checked)}
        />
        {drivenText(isMixed ? "mixed" : value === true ? "on" : "off", isMixed ? undefined : drivenPresetId, presets)}
      </label>
    );
  }

  if (field.kind === "number") {
    const governingPresets = presets.filter((p) => p.governs.includes(field.id) && p.values[field.id] !== undefined);
    if (governingPresets.length > 1) {
      // CONTROL 2 again — a governed number is named stops plus Custom.
      return (
        <Dropdown
          triggerText={isMixed ? "Mixed" : drivenText(`${value ?? field.defaultValue}${field.unit ?? ""}`, drivenPresetId, presets)}
          isMixed={isMixed}
          secondary={secondary}
          disabled={disabled}
          rows={governingPresets.map((preset) => ({
            key: preset.id,
            label: preset.label,
            sublabel: `${preset.values[field.id]}${field.unit ?? ""}`,
            active: !isMixed && drivenPresetId === preset.id,
          }))}
          onSelect={(presetId) => {
            const preset = governingPresets.find((p) => p.id === presetId);
            if (preset && preset.values[field.id] !== undefined) onChange(preset.values[field.id] as FieldValue);
          }}
          custom={{
            value: typeof value === "number" ? value : undefined,
            unit: field.unit,
            active: !isMixed && !drivenPresetId && value !== undefined,
            onChange: (n) => onChange(n),
          }}
        />
      );
    }
    // CONTROL 3 · number — the unit lives INSIDE the box, Figma's own shape.
    return (
      <div data-standard-control="number" style={numberBoxStyle(secondary, disabled)}>
        <NumberInput
          value={value === undefined ? undefined : Number(value)}
          defaultValue={Number(field.defaultValue)}
          placeholder={isMixed ? "Mixed" : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          onCommit={onChange}
          style={{ ...numberInputStyle, ...(disabled ? { pointerEvents: "none", opacity: 0.55 } : {}) }}
        />
        {field.unit && <span style={numberUnitStyle}>{field.unit}</span>}
      </div>
    );
  }

  // CONTROL 5 · text.
  return (
    <input
      data-standard-control="text"
      type="text"
      value={value === undefined ? "" : String(value)}
      placeholder={isMixed ? "Mixed" : undefined}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={textInputStyle(secondary, disabled)}
    />
  );
}

function optionLabelFor(field: FieldSpec, value: FieldValue | undefined): string {
  if (value === undefined) return "";
  return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
}

function drivenText(displayValue: string, drivenPresetId: string | undefined, presets: PresetSpec[]): string {
  if (!drivenPresetId) return displayValue;
  return `${presets.find((p) => p.id === drivenPresetId)?.label ?? drivenPresetId} · ${displayValue}`;
}

interface DropdownRow {
  key: string;
  label: string;
  sublabel?: string;
  active: boolean;
}

function Dropdown({
  triggerText,
  isMixed,
  secondary,
  disabled,
  rows,
  onSelect,
  custom,
}: {
  triggerText: string;
  isMixed: boolean;
  secondary?: boolean;
  disabled?: boolean;
  rows: DropdownRow[];
  onSelect: (key: string) => void;
  custom?: { value: number | undefined; unit: string | undefined; active: boolean; onChange: (value: number) => void };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return (
    <div ref={rootRef} data-standard-control="dropdown" data-slot="dropdown" style={dropdownRootStyle}>
      <button
        type="button"
        data-slot="dropdown-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={dropdownTriggerStyle(secondary, disabled)}
      >
        <span style={dropdownTriggerTextStyle}>{isMixed ? "Mixed" : triggerText}</span>
        <span aria-hidden="true" style={dropdownChevronStyle}>
          ▾
        </span>
      </button>
      {open && (
        <div data-slot="dropdown-menu" style={dropdownMenuStyle}>
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              data-slot="dropdown-row"
              data-value={row.key}
              data-selected={row.active}
              onClick={() => {
                onSelect(row.key);
                setOpen(false);
              }}
              style={dropdownRowStyle(row.active)}
            >
              <span style={dropdownRowTickStyle}>{row.active ? "✓" : ""}</span>
              <span style={dropdownRowLabelStyle}>{row.label}</span>
              {row.sublabel && <span style={dropdownRowSublabelStyle}>{row.sublabel}</span>}
            </button>
          ))}
          {custom && (
            <div data-slot="dropdown-custom" style={dropdownCustomRowStyle(custom.active)}>
              <span style={dropdownRowTickStyle}>{custom.active ? "✓" : ""}</span>
              <span style={dropdownCustomLabelStyle}>Custom</span>
              <input
                type="number"
                data-slot="dropdown-custom-input"
                defaultValue={custom.value ?? ""}
                onBlur={(e) => {
                  if (e.target.value === "") return;
                  custom.onChange(Number(e.target.value));
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const target = e.target as HTMLInputElement;
                  if (target.value === "") return;
                  custom.onChange(Number(target.value));
                  setOpen(false);
                }}
                style={dropdownCustomInputStyle}
              />
              {custom.unit && <span style={dropdownRowSublabelStyle}>{custom.unit}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Which of the six a field will draw, without rendering it — the journey
 *  and the tests both need to predict it. */
export function controlKindFor(field: FieldSpec, presets: PresetSpec[]): StandardControl {
  if (field.kind === "flags") return "flags";
  if (field.kind === "toggle") return "toggle";
  if (field.kind === "text") return "text";
  if (field.kind === "segments") return isSegmented(field.options ?? []) ? "segmented" : "dropdown";
  return presets.filter((p) => p.governs.includes(field.id) && p.values[field.id] !== undefined).length > 1
    ? "dropdown"
    : "number";
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const rowWrapStyle: CSSProperties = { padding: "1px 0" };
const rowAboveStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, padding: "2px 0" };
const rowGridStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 22 };
const labelCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, width: LABEL_WIDTH, flexShrink: 0 };
const labelCellCompactStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4 };
const controlCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };
const pairWrapStyle: CSSProperties = { display: "flex", gap: 10, padding: "1px 0" };
const pairCellStyle: CSSProperties = { flex: 1, minWidth: 0 };

function noteStyle(geometry: RowGeometry): CSSProperties {
  return {
    fontSize: 10,
    color: "var(--bbox-panel-fg-faint, #999)",
    paddingLeft: geometry === "label-left" ? LABEL_WIDTH + 6 : 0,
    paddingTop: 1,
    lineHeight: 1.3,
  };
}

function labelTextStyle(governed: boolean, scrubbable: boolean, compact: boolean): CSSProperties {
  return {
    fontSize: compact ? 10 : 11,
    color: governed ? "var(--bbox-panel-fg-muted, #6a6a75)" : "var(--bbox-panel-fg, #444)",
    cursor: scrubbable ? "ew-resize" : "default",
    userSelect: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function dotButtonStyle(mixed: boolean, winner: FieldTrace["winner"] | undefined, expanded: boolean): CSSProperties {
  const color = mixed
    ? "var(--bbox-panel-warn, #b45309)"
    : winner === "override"
      ? "var(--bbox-panel-override, #6d28d9)"
      : winner === "inherited"
        ? "var(--bbox-panel-inherited, #2563eb)"
        : winner === "preset"
          ? "var(--bbox-panel-fg-muted, #6a6a75)"
          : "var(--bbox-panel-border, #d6d6de)";
  return {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: 999,
    border: "none",
    padding: 0,
    background: color,
    outline: expanded ? "2px solid var(--bbox-panel-border, #d6d6de)" : "none",
    cursor: "pointer",
  };
}

function segmentedGroupStyle(disabled?: boolean): CSSProperties {
  return {
    display: "flex",
    flex: 1,
    minWidth: 0,
    border: "1px solid var(--bbox-panel-border, #d6d6de)",
    borderRadius: 5,
    overflow: "hidden",
    opacity: disabled ? 0.55 : 1,
  };
}
function segmentButtonStyle(active: boolean, secondary?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    height: 20,
    fontSize: 10.5,
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: active ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: active ? "var(--bbox-panel-surface, #fff)" : secondary ? "var(--bbox-panel-fg-faint, #9a9aa5)" : "var(--bbox-panel-fg-muted, #5c5c66)",
  };
}
const flagsWrapStyle: CSSProperties = { display: "flex", gap: 3, flex: 1, minWidth: 0 };
function flagButtonStyle(on: boolean, disabled?: boolean): CSSProperties {
  return {
    minWidth: 24,
    height: 20,
    padding: "0 4px",
    fontSize: 10,
    borderRadius: 4,
    border: `1px solid ${on ? "var(--bbox-panel-fg, #222)" : "var(--bbox-panel-border, #d6d6de)"}`,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    background: on ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: on ? "var(--bbox-panel-surface, #fff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
  };
}
function toggleLabelStyle(secondary?: boolean, disabled?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    color: secondary ? "var(--bbox-panel-fg-faint, #9a9aa5)" : "var(--bbox-panel-fg-muted, #5c5c66)",
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
function numberBoxStyle(secondary?: boolean, disabled?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flex: "0 0 auto",
    minWidth: 0,
    height: 22,
    padding: "0 4px",
    border: "1px solid var(--bbox-panel-border, #d6d6de)",
    borderRadius: 5,
    background: "var(--bbox-panel-surface, #fff)",
    opacity: (secondary ? 0.9 : 1) * (disabled ? 0.6 : 1),
  };
}
const numberInputStyle: CSSProperties = {
  width: 56,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--bbox-panel-fg, #222)",
  fontSize: 11,
  padding: 0,
};
const numberUnitStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #9a9aa5)" };
function textInputStyle(secondary?: boolean, disabled?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    height: 22,
    padding: "0 6px",
    fontSize: 11,
    border: "1px solid var(--bbox-panel-border, #d6d6de)",
    borderRadius: 5,
    background: "var(--bbox-panel-surface, #fff)",
    color: secondary ? "var(--bbox-panel-fg-muted, #6a6a75)" : "var(--bbox-panel-fg, #222)",
    opacity: disabled ? 0.55 : 1,
  };
}
const dropdownRootStyle: CSSProperties = { position: "relative", flex: 1, minWidth: 0 };
function dropdownTriggerStyle(secondary?: boolean, disabled?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    width: "100%",
    height: 22,
    padding: "0 6px",
    fontSize: 11,
    textAlign: "left",
    border: "1px solid var(--bbox-panel-border, #d6d6de)",
    borderRadius: 5,
    background: "var(--bbox-panel-surface, #fff)",
    color: secondary ? "var(--bbox-panel-fg-muted, #6a6a75)" : "var(--bbox-panel-fg, #222)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
const dropdownTriggerTextStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dropdownChevronStyle: CSSProperties = { fontSize: 9, color: "var(--bbox-panel-fg-faint, #9a9aa5)" };
const dropdownMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "100%",
  zIndex: 30,
  marginTop: 2,
  padding: 3,
  background: "var(--bbox-panel-surface, #fff)",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 6,
  boxShadow: "0 8px 24px rgba(0,0,0,.16)",
  maxHeight: 260,
  overflowY: "auto",
};
function dropdownRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "3px 5px",
    fontSize: 11,
    border: "none",
    borderRadius: 4,
    textAlign: "left",
    cursor: "pointer",
    background: active ? "var(--bbox-panel-border-soft, #ececf1)" : "transparent",
    color: "var(--bbox-panel-fg, #222)",
  };
}
const dropdownRowTickStyle: CSSProperties = { width: 10, flexShrink: 0, fontSize: 9, color: "var(--bbox-panel-fg-muted, #5c5c66)" };
const dropdownRowLabelStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dropdownRowSublabelStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #9a9aa5)" };
function dropdownCustomRowStyle(active: boolean): CSSProperties {
  return { ...dropdownRowStyle(active), cursor: "default" };
}
const dropdownCustomLabelStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg, #222)" };
const dropdownCustomInputStyle: CSSProperties = {
  width: 52,
  height: 18,
  fontSize: 10.5,
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 4,
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
  padding: "0 4px",
};
const clearButtonStyle: CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "var(--bbox-panel-fg-faint, #9a9aa5)",
  cursor: "pointer",
  fontSize: 11,
  lineHeight: 1,
  padding: 0,
};
function chainStyle(geometry: RowGeometry): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    marginLeft: geometry === "label-left" ? LABEL_WIDTH + 6 : 0,
    padding: "3px 0 4px",
    fontSize: 10,
  };
}
function candidateRowStyle(winner: boolean): CSSProperties {
  return { display: "flex", alignItems: "center", gap: 5, opacity: winner ? 1 : 0.55 };
}
function candidateDotStyle(winner: boolean): CSSProperties {
  return { width: 5, height: 5, borderRadius: 999, background: winner ? "var(--bbox-panel-fg, #222)" : "var(--bbox-panel-border, #d6d6de)" };
}
const candidateLayerStyle: CSSProperties = { width: 96, flexShrink: 0, color: "var(--bbox-panel-fg-muted, #5c5c66)" };
const candidateValueStyle: CSSProperties = { fontFamily: "monospace", color: "var(--bbox-panel-fg, #222)" };

export { MIXED };
