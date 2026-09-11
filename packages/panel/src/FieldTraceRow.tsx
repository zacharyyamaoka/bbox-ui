import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import { readFieldRow } from "./fieldModel";

// `Subject` lives in fieldModel.ts — the model owns the shape it resolves —
// and is re-exported here because every panel already imports it from this
// file. Moving it also broke the import cycle the two files would otherwise
// have formed.
export type { Subject } from "./fieldModel";
import type { Subject } from "./fieldModel";

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
  // WHY every one of these comes from `readFieldRow` and not from local
  // arithmetic: six panels used to answer this question four different ways,
  // and a fix applied to this file left three of the others holding the
  // identical defect. The model is shared so that cannot happen again — see
  // fieldModel.ts, which carries the reasoning for each decision.
  const { trace, isMixed, hasOwnOverride, collapsedValue, paintedElsewhere, traces } = readFieldRow(
    field,
    subjects,
    presets,
    toSubject,
  );

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
        {paintedElsewhere !== null && (
          <span data-slot="field-trace-painted-elsewhere" style={paintedElsewhereStyle}>
            painting {String(paintedElsewhere)}
          </span>
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
        {/* WHY not `isGoverned && …`: gating the way out on "a preset governs
            this field" meant 60 of the library's 64 field rows could enter the
            override layer and never leave it. One click on a control already
            showing its own default writes that value into the store
            permanently, which is the stored-vector-is-the-semantic-choice
            ruling inverted. Anything stored can be cleared. */}
        {hasOwnOverride && (
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

/**
 * Past this many options a segmented control wraps; use a menu instead.
 *
 * Two, not three, and it was measured rather than guessed: Port's Diameter
 * has exactly three options and still wrapped onto two rows, because its
 * labels carry their pixel values ("Medium · 12px"). Only a genuine pair —
 * Input/Output, on/off — reliably fits one line, and for a pair a menu would
 * cost a click to save nothing.
 */
const SEGMENT_MENU_THRESHOLD = 2;

/**
 * Split an option label of the form "Medium · 24px" into its name and its
 * value, so the menu can show the name on the left and the value in a muted
 * right column.
 *
 * WHY parse the label rather than add a field to FieldSpec: the two halves
 * are already both in there, written by whoever authored the field array, and
 * a second declaration is a second thing to keep in sync. A label with no
 * separator simply has no right column, which is the correct rendering for an
 * option that is only a name.
 */
function splitOptionLabel(label: string): { name: string; detail: string | null } {
  const at = label.indexOf(" · ");
  if (at === -1) return { name: label, detail: null };
  return { name: label.slice(0, at), detail: label.slice(at + 3) };
}

/**
 * The control Zach drew: named options down the left, their resolved values
 * in a muted right column, a tick on the active one, and — where the field is
 * scalar-backed — a "Custom [ ] unit" row at the foot of the same menu.
 *
 * It is one row of height whatever the option count, and it shows the
 * semantic name and the concrete value at the same time, which is the thing
 * a wrapped row of buttons cannot do. Deliberately hand-built: this demo has
 * no headless-UI dependency and adding one for a menu is not worth it, so
 * Escape, outside-click and focus return are handled here.
 */
function OptionMenu({
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const active = field.options?.find((option) => String(value) === option.value);
  // A scalar-backed field can take a value outside its named stops. Only then
  // does a Custom row make sense; offering one on a pure enum would be a lie.
  const scalar = field.unit !== undefined || field.min !== undefined || field.max !== undefined;
  const triggerLabel = placeholder ?? active?.label ?? (value === undefined ? "—" : String(value));

  return (
    <div ref={rootRef} style={optionMenuRootStyle}>
      <button
        ref={triggerRef}
        type="button"
        data-slot="option-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={optionMenuTriggerStyle(secondary)}
      >
        <span style={optionMenuTriggerLabelStyle}>{triggerLabel}</span>
        <span aria-hidden style={optionMenuCaretStyle}>▾</span>
      </button>
      {open && (
        <div data-slot="option-menu" role="listbox" style={optionMenuStyle}>
          {field.options?.map((option) => {
            const isActive = String(value) === option.value;
            const { name, detail } = splitOptionLabel(option.label);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                data-selected={isActive}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                style={optionMenuItemStyle(isActive)}
              >
                <span style={optionMenuTickStyle}>{isActive ? "✓" : ""}</span>
                <span style={optionMenuNameStyle}>{name}</span>
                <span style={optionMenuDetailStyle}>{detail ?? ""}</span>
              </button>
            );
          })}
          {scalar && (
            <div data-slot="option-menu-custom" style={optionMenuCustomStyle}>
              <span style={optionMenuNameStyle}>Custom</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                defaultValue={active ? undefined : (value as number | undefined)}
                onChange={(e) => {
                  if (e.target.value === "") return;
                  onChange(Number(e.target.value));
                }}
                style={optionMenuCustomInputStyle}
              />
              {field.unit && <span style={optionMenuDetailStyle}>{field.unit}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
    // WHY a menu past four options, and buttons at or below it: a segmented
    // control with six options wraps onto three rows, and rows are what make
    // this panel too tall — Zach's words, "you don't end up getting these
    // multiple rows of things". Two or three options genuinely fit on one
    // line and a menu would cost a click for nothing, so the split is by
    // count rather than by taste.
    if ((field.options?.length ?? 0) > SEGMENT_MENU_THRESHOLD) {
      return (
        <OptionMenu
          field={field}
          value={value}
          placeholder={placeholder}
          secondary={secondary}
          onChange={onChange}
        />
      );
    }
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
  borderBottom: "1px solid var(--bbox-panel-border-soft, #eee)",
};
const headerRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const controlRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, paddingLeft: 18 };

function disclosureStyle(enabled: boolean): CSSProperties {
  return {
    width: 16,
    border: "none",
    background: "transparent",
    cursor: enabled ? "pointer" : "default",
    color: enabled ? "var(--bbox-panel-fg-muted, #666)" : "var(--bbox-panel-border, #ccc)",
    fontSize: 11,
    padding: 0,
  };
}

function labelStyle(governed: boolean): CSSProperties {
  return { fontWeight: 500, color: governed ? "var(--bbox-panel-fg-faint, #888)" : "var(--bbox-panel-fg, #111)", fontSize: 13 };
}

// A quiet note, not a badge: the row's own layers are the story, and this
// says only that something outside them is painting right now.
const optionMenuRootStyle: CSSProperties = { position: "relative", flex: 1, minWidth: 0 };

function optionMenuTriggerStyle(secondary?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    width: "100%",
    padding: "4px 8px",
    fontSize: 12,
    lineHeight: 1.2,
    borderRadius: 6,
    border: "1px solid var(--bbox-panel-border, #d4d4d8)",
    background: secondary ? "var(--bbox-panel-surface-2, #fafafa)" : "var(--bbox-panel-surface, #fff)",
    color: "var(--bbox-panel-fg, #18181b)",
    cursor: "pointer",
    textAlign: "left",
  };
}

const optionMenuTriggerLabelStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const optionMenuCaretStyle: CSSProperties = { fontSize: 9, opacity: 0.55 };

const optionMenuStyle: CSSProperties = {
  position: "absolute",
  zIndex: 30,
  top: "calc(100% + 4px)",
  left: 0,
  minWidth: "100%",
  padding: 4,
  borderRadius: 8,
  border: "1px solid var(--bbox-panel-border, #d4d4d8)",
  background: "var(--bbox-panel-surface, #fff)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
};

function optionMenuItemStyle(active: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "14px 1fr auto",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "5px 8px",
    fontSize: 12,
    borderRadius: 5,
    border: "none",
    background: active ? "var(--bbox-panel-surface-2, #f4f4f5)" : "transparent",
    color: "var(--bbox-panel-fg, #18181b)",
    cursor: "pointer",
    textAlign: "left",
  };
}

const optionMenuTickStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg, #18181b)" };
const optionMenuNameStyle: CSSProperties = { whiteSpace: "nowrap" };
const optionMenuDetailStyle: CSSProperties = { fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" };

const optionMenuCustomStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
  paddingTop: 6,
  paddingLeft: 8,
  paddingRight: 8,
  paddingBottom: 2,
  borderTop: "1px solid var(--bbox-panel-border-soft, #ececef)",
};

const optionMenuCustomInputStyle: CSSProperties = {
  width: 62,
  padding: "3px 6px",
  fontSize: 12,
  borderRadius: 5,
  border: "1px solid var(--bbox-panel-border, #d4d4d8)",
  textAlign: "right",
};

const paintedElsewhereStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.65,
  fontStyle: "italic",
  whiteSpace: "nowrap",
};

const mixedBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "var(--bbox-panel-warn-bg, #fef3c7)",
  borderRadius: 4,
  padding: "1px 6px",
};

function winnerBadgeStyle(winner: "override" | "preset" | "default"): CSSProperties {
  const palette: Record<typeof winner, { bg: string; fg: string }> = {
    override: { bg: "var(--bbox-panel-override-bg, #ede9fe)", fg: "var(--bbox-panel-override, #6d28d9)" },
    preset: { bg: "var(--bbox-panel-preset-bg, #dbeafe)", fg: "var(--bbox-panel-preset, #1d4ed8)" },
    default: { bg: "var(--bbox-panel-surface-2, #f3f4f6)", fg: "var(--bbox-panel-fg-muted, #6b7280)" },
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
  color: "var(--bbox-panel-danger, #b91c1c)",
  background: "none",
  border: "1px solid var(--bbox-panel-danger-ring, #fca5a5)",
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
  background: "var(--bbox-panel-surface-2, #fafafa)",
  borderRadius: 4,
  border: "1px solid var(--bbox-panel-border-soft, #eee)",
};

function candidateStyle(winner: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: winner ? 600 : 400,
    color: winner ? "var(--bbox-panel-fg, #111)" : "var(--bbox-panel-fg-faint, #888)",
  };
}
function candidateDotStyle(winner: boolean): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: winner ? "var(--bbox-panel-fg, #111)" : "transparent",
    border: winner ? "none" : "1px solid var(--bbox-panel-border, #ccc)",
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
    border: selected ? `1px solid ${secondary ? "var(--bbox-panel-fg-faint, #999)" : "var(--bbox-panel-fg, #111)"}` : "1px solid var(--bbox-panel-border, #ccc)",
    background: selected ? (secondary ? "var(--bbox-panel-border-soft, #eee)" : "var(--bbox-panel-fg, #111)") : "var(--bbox-panel-surface, white)",
    color: selected ? (secondary ? "var(--bbox-panel-fg, #333)" : "var(--bbox-panel-surface, white)") : "var(--bbox-panel-fg, #111)",
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
    color: secondary ? "var(--bbox-panel-fg-faint, #888)" : "var(--bbox-panel-fg, #111)",
  };
}

function numberInputStyle(secondary?: boolean): CSSProperties {
  return {
    width: 64,
    padding: "3px 6px",
    border: `1px solid ${secondary ? "var(--bbox-panel-border, #ddd)" : "var(--bbox-panel-border, #ccc)"}`,
    borderRadius: 4,
    fontSize: 12,
    color: secondary ? "var(--bbox-panel-fg-faint, #888)" : "var(--bbox-panel-fg, #111)",
  };
}

function textInputStyle(secondary?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 80,
    padding: "3px 6px",
    border: `1px solid ${secondary ? "var(--bbox-panel-border, #ddd)" : "var(--bbox-panel-border, #ccc)"}`,
    borderRadius: 4,
    fontSize: 12,
    color: secondary ? "var(--bbox-panel-fg-faint, #888)" : "var(--bbox-panel-fg, #111)",
  };
}
