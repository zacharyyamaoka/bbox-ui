import { useState, type CSSProperties } from "react";
import {
  resolveField,
  type FieldSpec,
  type FieldValue,
  type PresetSpec,
} from "@bbox-ui/schema";

export interface Subject {
  id: string;
  props: Record<string, unknown>;
}

export interface FieldTraceRowProps {
  /** See ComponentEntry.toSubject — identity when a component needs none. */
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  field: FieldSpec;
  subjects: Subject[];
  presets: PresetSpec[];
  /** Precomputed `governedFieldIds(presets)` — the set a governed row
   * renders as secondary/inherited-looking rather than freely editable. */
  governed: Set<string>;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}

/**
 * One field's trace, collapsed by default, expandable — T1-SPEC.md §7.2.
 * Collapsed: label, resolved value, a badge naming the winning layer.
 * Expanded: all three candidates in cascade order, winner marked, exactly
 * the devtools styles-pane model this whole cascade is built on.
 *
 * `MIXED` across a multi-selection is unchanged T0 behaviour (a blanked
 * control, "Mixed" badge); the trace disclosure only opens for exactly
 * ONE selected subject — "which layer won" is not an aggregable fact
 * across N disagreeing subjects (T1-SPEC.md §7.2's own explicit scope
 * line).
 */
export function FieldTraceRow({
  field,
  subjects,
  presets,
  governed,
  onChange,
  onClearOverride,
  toSubject,
}: FieldTraceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isGoverned = governed.has(field.id);
  // WHY every subject goes through `resolveField` rather than `readFields`:
  // `readFields` is the raw reading, `subject[id] ?? defaultValue`, and it
  // never consults the preset layer. Using it here made the control disagree
  // with the pixels beside it — on a wired Pill the border painted `primary`
  // while the segmented control highlighted `foreground`, so clicking the
  // segment that was ALREADY highlighted silently repainted the component and
  // created an override, with nothing on screen explaining it. Twelve rows
  // across five of Pill's six states were wrong this way.
  //
  // MIXED is decided on the RESOLVED values for the same reason: two pills
  // that visibly disagree must read as Mixed, and two that resolve alike must
  // not, even when one of them gets there through an override.
  // Resolve against the subject the COMPONENT resolves against, not the raw
  // stored props — see ComponentEntry.toSubject.
  const asSubject = toSubject ?? ((props: Record<string, unknown>) => props);
  const resolved = subjects.map((s) => resolveField(field, asSubject(s.props), presets).resolved);
  const isMixed = resolved.length > 1 && resolved.some((v) => v !== resolved[0]);
  const single = subjects.length === 1 ? subjects[0] : null;
  const trace = single ? resolveField(field, asSubject(single.props), presets) : null;
  const hasOwnOverride = single ? asSubject(single.props)[field.id] !== undefined : false;
  const collapsedValue: FieldValue | undefined =
    isMixed || resolved.length === 0 ? undefined : (resolved[0] as FieldValue);

  return (
    <div data-slot="field-trace-row" data-field={field.id} data-governed={isGoverned} style={rowStyle}>
      <div style={headerRowStyle}>
        <button
          type="button"
          data-slot="field-trace-disclosure"
          onClick={() => setExpanded((v) => !v)}
          disabled={!trace}
          style={disclosureStyle(!!trace)}
          aria-label={expanded ? "Collapse trace" : "Expand trace"}
        >
          {trace ? (expanded ? "▾" : "▸") : "·"}
        </button>
        <span style={labelStyle(isGoverned)}>{field.label}</span>
        <div style={{ flex: 1 }} />
        {isMixed ? (
          <span data-slot="field-trace-mixed" style={mixedBadgeStyle}>
            Mixed
          </span>
        ) : (
          trace && (
            <button
              type="button"
              data-slot="field-trace-winner-badge"
              onClick={() => trace && setExpanded((v) => !v)}
              style={winnerBadgeStyle(trace.winner)}
              title="Click to see the full chain"
            >
              {trace.winner === "preset"
                ? `preset: ${presets.find((p) => p.id === trace.winningPresetId)?.label ?? trace.winningPresetId}`
                : trace.winner}
            </button>
          )
        )}
      </div>

      <div style={controlRowStyle}>
        <FieldControl
          field={field}
          value={collapsedValue}
          placeholder={isMixed ? "Mixed" : undefined}
          secondary={isGoverned}
          onChange={(value) => onChange(field.id, value)}
        />
        {isGoverned && hasOwnOverride && (
          <button
            type="button"
            data-slot="field-trace-clear-override"
            onClick={() => onClearOverride(field.id)}
            style={clearOverrideStyle}
            title="Clear this instance's override — fall back to the preset"
          >
            ✕ override
          </button>
        )}
      </div>

      {expanded && trace && (
        <div data-slot="field-trace-chain" style={chainStyle}>
          {trace.candidates.map((candidate) => (
            <div
              key={candidate.layer}
              data-slot="field-trace-candidate"
              data-layer={candidate.layer}
              data-winner={candidate.layer === trace.winner}
              style={candidateStyle(candidate.layer === trace.winner)}
            >
              <span style={candidateDotStyle(candidate.layer === trace.winner)} />
              <span style={candidateLayerStyle}>
                {candidate.layer}
                {candidate.presetId ? ` · ${presets.find((p) => p.id === candidate.presetId)?.label ?? candidate.presetId}` : ""}
              </span>
              <span style={candidateValueStyle}>
                {candidate.value === undefined ? "—" : String(candidate.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One control per FieldKind — segments/number/toggle/text             */
/* ------------------------------------------------------------------ */

function FieldControl({
  field,
  value,
  placeholder,
  secondary,
  onChange,
}: {
  field: FieldSpec;
  value: FieldValue | undefined;
  placeholder?: string;
  secondary?: boolean;
  onChange: (value: FieldValue) => void;
}) {
  if (field.kind === "segments") {
    return (
      <div style={segmentsStyle}>
        {field.options?.map((option) => {
          const active = value !== undefined && String(value) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-selected={active}
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
  if (field.kind === "toggle") {
    return (
      <label style={toggleLabelStyle(secondary)}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        {value === true ? "on" : "off"}
      </label>
    );
  }
  if (field.kind === "number") {
    return (
      <input
        type="number"
        value={value === undefined ? "" : Number(value)}
        placeholder={placeholder}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => onChange(e.target.value === "" ? field.defaultValue : Number(e.target.value))}
        style={numberInputStyle(secondary)}
      />
    );
  }
  // "text"
  return (
    <input
      type="text"
      value={value === undefined ? "" : String(value)}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={textInputStyle(secondary)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Styles — plain inline objects, no build-time CSS dependency here    */
/* ------------------------------------------------------------------ */

const rowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "6px 0",
  borderBottom: "1px solid #eee",
};
const headerRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const controlRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, paddingLeft: 18 };

function disclosureStyle(enabled: boolean): CSSProperties {
  return {
    width: 16,
    border: "none",
    background: "transparent",
    cursor: enabled ? "pointer" : "default",
    color: enabled ? "#666" : "#ccc",
    fontSize: 11,
    padding: 0,
  };
}

function labelStyle(governed: boolean): CSSProperties {
  return { fontWeight: 500, color: governed ? "#888" : "#111", fontSize: 13 };
}

const mixedBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: "#b45309",
  background: "#fef3c7",
  borderRadius: 4,
  padding: "1px 6px",
};

function winnerBadgeStyle(winner: "override" | "preset" | "default"): CSSProperties {
  const palette: Record<typeof winner, { bg: string; fg: string }> = {
    override: { bg: "#ede9fe", fg: "#6d28d9" },
    preset: { bg: "#dbeafe", fg: "#1d4ed8" },
    default: { bg: "#f3f4f6", fg: "#6b7280" },
  };
  const { bg, fg } = palette[winner];
  return {
    fontSize: 11,
    color: fg,
    background: bg,
    border: "none",
    borderRadius: 4,
    padding: "1px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const clearOverrideStyle: CSSProperties = {
  fontSize: 11,
  color: "#b91c1c",
  background: "none",
  border: "1px solid #fca5a5",
  borderRadius: 4,
  padding: "1px 6px",
  cursor: "pointer",
};

const chainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginLeft: 18,
  padding: "4px 8px",
  background: "#fafafa",
  borderRadius: 4,
  border: "1px solid #eee",
};

function candidateStyle(winner: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: winner ? 600 : 400,
    color: winner ? "#111" : "#888",
  };
}
function candidateDotStyle(winner: boolean): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: winner ? "#111" : "transparent",
    border: winner ? "none" : "1px solid #ccc",
    flexShrink: 0,
  };
}
const candidateLayerStyle: CSSProperties = { width: 140, flexShrink: 0 };
const candidateValueStyle: CSSProperties = { fontFamily: "monospace" };

const segmentsStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap" };

function segmentButtonStyle(selected: boolean, secondary?: boolean): CSSProperties {
  return {
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 12,
    border: selected ? `1px solid ${secondary ? "#999" : "#111"}` : "1px solid #ccc",
    background: selected ? (secondary ? "#eee" : "#111") : "white",
    color: selected ? (secondary ? "#333" : "white") : "#111",
    cursor: "pointer",
    opacity: secondary && !selected ? 0.7 : 1,
  };
}

function toggleLabelStyle(secondary?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: secondary ? "#888" : "#111",
  };
}

function numberInputStyle(secondary?: boolean): CSSProperties {
  return {
    width: 64,
    padding: "3px 6px",
    border: `1px solid ${secondary ? "#ddd" : "#ccc"}`,
    borderRadius: 4,
    fontSize: 12,
    color: secondary ? "#888" : "#111",
  };
}

function textInputStyle(secondary?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 80,
    padding: "3px 6px",
    border: `1px solid ${secondary ? "#ddd" : "#ccc"}`,
    borderRadius: 4,
    fontSize: 12,
    color: secondary ? "#888" : "#111",
  };
}
