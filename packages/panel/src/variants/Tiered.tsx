import { useMemo, useState, type CSSProperties } from "react";
import {
  MIXED,
  governedFieldIds,
  readFields,
  type FieldSpec,
  type FieldValue,
  type PresetSpec,
} from "@bbox-ui/schema";
import { FieldTraceRow, type Subject } from "../FieldTraceRow";
import { readFieldRow } from "../fieldModel";
import type { PanelVariant, PanelVariantProps } from "./contract";
import {
  classifyField,
  loadStoredTier,
  storeTier,
  TIER_META,
  TIER_ORDER,
  TIER_RANK,
  type Tier,
} from "../fieldTiers";

/**
 * demos/inspector/src/variants/Tiered.tsx
 *
 * Zach's own words: "one design pattern I think you can do is have
 * different views of the inspector panel. prusa does this, they have
 * like an easy, intermediate and expert view of the inspector panel."
 * (PrusaSlicer's Simple / Advanced / Expert modes over ONE settings
 * model.) This variant is that pattern applied to `FieldSpec[]`: three
 * cumulative modes — Simple ⊂ Advanced ⊂ Expert — filtering the SAME
 * rows. Resolution/Mixed/override/cascade logic is `resolveField`
 * (governed rows, below) or `FieldTraceRow` unmodified (every other
 * row) — this file only decides which rows are on screen and draws a
 * quieter, denser shell and, for governed rows, a denser ROW around
 * that same logic.
 *
 * AMENDMENT (mid-build, Zach): the toolbar reference — a size dropdown
 * printing "Medium 24" with a tick and a "Custom [ ] px" row — split
 * into two cases. Case A (one field, named stops on a scale) is a
 * single closed control; every field here that looks like that
 * (`diameter`, `textSize`, `role`...) already prints its name AND
 * resolved value in one segmented button ("Medium · 32px") — inherited
 * from `FieldTraceRow`/the field data, not rebuilt. Case B (one preset
 * drives MANY fields — Pill's `state` over `lineStyle`/`lineColor`/
 * `fillStyle`/`fillColor`) is the one every variant now has to answer,
 * because the dropdown shape doesn't transfer: no single field IS the
 * preset. See `GovernedFieldRow` and the tier rule below.
 */

/**
 * Tier rule, storage and filter all come from `../fieldTiers`.
 *
 * WHY not the local copy this file used to carry: the chosen panel
 * (FigmaDense) now offers the same Simple/Advanced/Expert switch, because
 * Zach's call on 2026-09-11 was that tiering "can be helpful regardless of
 * whatever you're doing". Two copies of the classifier would drift the first
 * time a field's tier was reconsidered, and this repo has just spent six
 * judge rounds on exactly that shape of bug.
}

/* ------------------------------------------------------------------ */
/* Governed rows — Case B from the amendment                           */
/* ------------------------------------------------------------------ */

function formatResolvedValue(field: FieldSpec, value: FieldValue | undefined): string {
  if (value === undefined) return "—";
  if (field.kind === "segments") {
    return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
  }
  if (field.kind === "toggle") return value === true ? "on" : "off";
  if (field.kind === "number") return field.unit ? `${value}${field.unit}` : String(value);
  return String(value);
}

type Mark = "driven" | "overridden" | "default" | "mixed";

const MARK_COLOR: Record<Mark, { fg: string; dot: string }> = {
  driven: { fg: "var(--bbox-panel-preset, #1d4ed8)", dot: "var(--bbox-panel-preset, #1d4ed8)" },
  overridden: { fg: "var(--bbox-panel-override, #6d28d9)", dot: "var(--bbox-panel-override, #6d28d9)" },
  default: { fg: "var(--bbox-panel-fg-faint, #888)", dot: "var(--bbox-panel-border, #ccc)" },
  mixed: { fg: "var(--bbox-panel-warn, #b45309)", dot: "var(--bbox-panel-warn, #b45309)" },
};

/**
 * One line for a field a preset GOVERNS: "‹dot› Line Color ... Wired ·
 * primary" — name and resolved value together, no expansion, per the
 * amendment's point 1. Three states in one small mark (point 2): driven
 * (preset supplies it, name shown), overridden (stored, clearable right
 * here), default (quietest — no preset governs it right now and nobody
 * set it). Clicking the row swaps it for the real `FieldTraceRow` — same
 * resolution, Mixed, clear-override and full cascade chain this file
 * doesn't reimplement — so the compact line is the RESTING state and the
 * full chain stays reachable but is never the default, per the
 * amendment's own instruction.
 */
function GovernedFieldRow({
  field,
  subjects,
  presets,
  governed,
  toSubject,
  onChange,
  onClearOverride,
  expanded,
  onToggleExpand,
}: {
  field: FieldSpec;
  subjects: Subject[];
  presets: PresetSpec[];
  governed: Set<string>;
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (expanded) {
    return (
      <div data-slot="tiered-governed-expanded" data-field={field.id}>
        <button
          type="button"
          data-slot="tiered-governed-collapse"
          onClick={onToggleExpand}
          style={collapseLinkStyle}
        >
          ▾ {field.label} — collapse
        </button>
        <FieldTraceRow
          field={field}
          subjects={subjects}
          presets={presets}
          governed={governed}
          onChange={onChange}
          onClearOverride={onClearOverride}
          toSubject={toSubject}
        />
      </div>
    );
  }

  // WHY: shared field-resolution model (../fieldModel.ts) — prevents this row
  // from re-deriving Mixed/override/painted-elsewhere off a single reference
  // subject and drifting from the other panels' answer to the same question.
  const { isMixed, hasOwnOverride, trace, paintedElsewhere } = readFieldRow(field, subjects, presets, toSubject);

  let mark: Mark;
  let valueText: string;
  if (isMixed) {
    mark = "mixed";
    valueText = "Mixed";
  } else if (!trace || trace.winner === "default") {
    mark = "default";
    valueText = formatResolvedValue(field, trace?.resolved ?? field.defaultValue);
  } else if (trace.winner === "override") {
    mark = "overridden";
    valueText = formatResolvedValue(field, trace.resolved);
  } else {
    mark = "driven";
    const presetLabel = presets.find((p) => p.id === trace.winningPresetId)?.label ?? trace.winningPresetId;
    valueText = `${presetLabel} · ${formatResolvedValue(field, trace.resolved)}`;
  }
  const colors = MARK_COLOR[mark];

  return (
    <div data-slot="tiered-governed-row" data-field={field.id} data-mark={mark} style={governedRowWrapStyle}>
      <button type="button" data-slot="tiered-governed-summary" onClick={onToggleExpand} style={governedSummaryStyle}>
        <span style={{ ...dotStyle, background: colors.dot }} />
        <span style={governedLabelStyle}>{field.label}</span>
        <span style={{ flex: 1 }} />
        {paintedElsewhere !== null && (
          <span style={paintedElsewhereMiniStyle}>painting {String(paintedElsewhere)}</span>
        )}
        <span style={{ ...governedValueTextStyle, color: colors.fg }}>{valueText}</span>
        <span style={caretStyle}>▸</span>
      </button>
      {hasOwnOverride && (
        <button
          type="button"
          data-slot="tiered-governed-quick-clear"
          title="Clear this instance's override — fall back to the preset"
          onClick={(e) => {
            e.stopPropagation();
            onClearOverride(field.id);
          }}
          style={quickClearStyle}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function TieredPanel({
  componentName,
  fields,
  presets,
  subjects,
  toSubject,
  onChange,
  onClearOverride,
}: PanelVariantProps) {
  const [tier, setTier] = useState<Tier>(loadStoredTier);
  const [expandedGoverned, setExpandedGoverned] = useState<Set<string>>(() => new Set());

  function selectTier(next: Tier): void {
    setTier(next);
    storeTier(next);
  }
  function toggleExpandGoverned(fieldId: string): void {
    setExpandedGoverned((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  const governed = useMemo(() => new Set(governedFieldIds(presets)), [presets]);
  const selectors = useMemo(() => Array.from(new Set(presets.map((p) => p.selector))), [presets]);
  const tierById = useMemo(() => {
    const map = new Map<string, Tier>();
    for (const field of fields) map.set(field.id, classifyField(field, presets, governed));
    return map;
  }, [fields, presets, governed]);

  const visibleFields = fields.filter((f) => TIER_RANK[tierById.get(f.id) ?? "advanced"] <= TIER_RANK[tier]);
  const hiddenFields = fields.filter((f) => TIER_RANK[tierById.get(f.id) ?? "advanced"] > TIER_RANK[tier]);

  // WHY a note rather than silently promoting an overridden field into
  // view: Simple mode hiding a value the user SET (not just its default)
  // is worse than the verbosity Simple exists to cut — the panel must
  // say so. Auto-promoting instead was the other legal option (per the
  // brief) but was rejected here: a component with several expert-tier
  // overrides already set (e.g. every Pill paint field wired by a preset
  // author) would silently balloon Simple back toward the tall panel
  // this variant exists to fix. A count + one-tap jump keeps Simple's
  // size a promise the tier itself controls, while still making the
  // hidden value impossible to miss. Note: a GOVERNED field's override
  // is ALSO reported closer to home — see the preset row's own
  // "modified" mark below, which is the amendment's point 3 and fires
  // even in Simple, where this note's target tier is never visited.
  const hiddenOverridden = hiddenFields.filter((f) => subjects.some((s) => s.props[f.id] !== undefined));
  let jumpTo: Tier | null = null;
  for (const f of hiddenOverridden) {
    const t = tierById.get(f.id)!;
    if (jumpTo === null || TIER_RANK[t] < TIER_RANK[jumpTo]) jumpTo = t;
  }

  return (
    <div data-slot="tiered-inspector-panel" style={panelStyle}>
      <div data-slot="tiered-header" style={headerRowStyle}>
        <span style={headerTitleStyle}>{componentName}</span>
        <span style={headerCountStyle}>
          {subjects.length === 0 ? "no subject selected" : `${subjects.length} selected`}
        </span>
      </div>

      <div data-slot="tier-switcher" role="tablist" aria-label="Inspector detail level" style={switcherStyle}>
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tier === t}
            data-slot="tier-tab"
            data-tier={t}
            title={TIER_META[t].hint}
            onClick={() => selectTier(t)}
            style={tierButtonStyle(tier === t)}
          >
            {TIER_META[t].label}
          </button>
        ))}
      </div>

      {hiddenOverridden.length > 0 && jumpTo && (
        <button
          type="button"
          data-slot="tiered-hidden-override-note"
          onClick={() => selectTier(jumpTo!)}
          style={hiddenNoteStyle}
        >
          {hiddenOverridden.length} overridden field{hiddenOverridden.length === 1 ? "" : "s"} hidden in{" "}
          {TIER_META[tier].label} — show {TIER_META[jumpTo].label}
        </button>
      )}

      {/* Presets first (contract #1) — quiet single-line pills per
          selector, always shown regardless of tier: the preset IS the
          Simple path, so gating it behind a mode would be backwards.
          AMENDMENT point 3: the active pill also reports "· modified"
          with a reset the instant any field it governs is overridden —
          in Simple mode this is the ONLY place that fact is visible,
          since every governed field is Expert-tier and off screen. */}
      {selectors.map((selector) => {
        const presetsForSelector = presets.filter((p) => p.selector === selector);
        const selectorField = fields.find((f) => f.id === selector) ?? {
          id: selector,
          label: selector,
          kind: "segments" as const,
          defaultValue: "",
        };
        const reading = readFields([selectorField], subjects.map((s) => s.props))[0];
        const current = reading.value === MIXED ? undefined : String(reading.value);
        return (
          <div key={selector} data-slot="tiered-preset-picker" data-selector={selector} style={presetRowStyle}>
            <span style={presetLabelStyle}>{selector}</span>
            <div style={presetPillsStyle}>
              {presetsForSelector.map((preset) => {
                const selected = current === preset.id;
                const overriddenGoverned = selected
                  ? preset.governs.filter((id) => subjects.some((s) => s.props[id] !== undefined))
                  : [];
                const modified = selected && overriddenGoverned.length > 0;
                return (
                  <span key={preset.id} style={presetPillGroupStyle}>
                    <button
                      type="button"
                      data-slot="preset-button"
                      data-preset={preset.id}
                      data-selected={selected}
                      data-modified={modified}
                      onClick={() => onChange(selector, preset.id)}
                      style={presetPillButtonStyle(selected, modified)}
                    >
                      {preset.label}
                      {modified ? ` · modified` : ""}
                    </button>
                    {modified && (
                      <button
                        type="button"
                        data-slot="preset-reset"
                        title={`Clear ${overriddenGoverned.length} override(s) — restore ${preset.label} exactly`}
                        onClick={() => overriddenGoverned.forEach((id) => onClearOverride(id))}
                        style={presetResetStyle}
                      >
                        ↺
                      </button>
                    )}
                  </span>
                );
              })}
              {reading.value === MIXED && <span style={mixedNoteStyle}>mixed</span>}
            </div>
          </div>
        );
      })}

      <div data-slot="tiered-field-list" style={fieldListStyle}>
        {visibleFields.map((field) =>
          governed.has(field.id) ? (
            <GovernedFieldRow
              key={field.id}
              field={field}
              subjects={subjects}
              presets={presets}
              governed={governed}
              toSubject={toSubject}
              onChange={onChange}
              onClearOverride={onClearOverride}
              expanded={expandedGoverned.has(field.id)}
              onToggleExpand={() => toggleExpandGoverned(field.id)}
            />
          ) : (
            <FieldTraceRow
              key={field.id}
              field={field}
              subjects={subjects}
              presets={presets}
              governed={governed}
              onChange={onChange}
              onClearOverride={onClearOverride}
              toSubject={toSubject}
            />
          ),
        )}
      </div>
    </div>
  );
}

export const TIERED: PanelVariant = {
  id: "tiered",
  label: "Tiered",
  blurb: "PrusaSlicer-style Simple / Advanced / Expert modes over the same field array — hide the long tail, not the logic.",
  Panel: TieredPanel,
};

/* ------------------------------------------------------------------ */
/* Styles — quiet and dense on purpose: this variant's whole pitch is  */
/* "too tall, too loud", so no boxed/tinted sections, small type.      */
/* ------------------------------------------------------------------ */

const panelStyle: CSSProperties = {
  width: 300,
  padding: 12,
  border: "1px solid var(--bbox-panel-border-soft, #e2e2e2)",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "sans-serif",
  fontSize: 13,
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
};

const headerRowStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between" };
const headerTitleStyle: CSSProperties = { fontWeight: 600, color: "var(--bbox-panel-fg, #333)", fontSize: 13 };
const headerCountStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-faint, #999)" };

const switcherStyle: CSSProperties = {
  display: "flex",
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 6,
  overflow: "hidden",
};

function tierButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "5px 0",
    fontSize: 11,
    fontWeight: 600,
    border: "none",
    borderRight: "1px solid var(--bbox-panel-border, #ddd)",
    background: active ? "var(--bbox-panel-fg, #333)" : "var(--bbox-panel-surface, white)",
    color: active ? "var(--bbox-panel-surface, white)" : "var(--bbox-panel-fg-muted, #666)",
    cursor: "pointer",
  };
}

const hiddenNoteStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-warn, #92400e)",
  background: "var(--bbox-panel-warn-bg, #fffbeb)",
  border: "1px solid var(--bbox-panel-warn-ring, #fde68a)",
  borderRadius: 4,
  padding: "4px 8px",
  textAlign: "left",
  cursor: "pointer",
};

const presetRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const presetLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--bbox-panel-fg-faint, #999)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  width: 40,
  flexShrink: 0,
};
const presetPillsStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
const presetPillGroupStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2 };
const mixedNoteStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-warn, #b45309)" };

function presetPillButtonStyle(selected: boolean, modified?: boolean): CSSProperties {
  return {
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 600,
    border: modified ? "1px solid var(--bbox-panel-warn-soft, #d97706)" : selected ? "1px solid var(--bbox-panel-fg, #333)" : "1px solid var(--bbox-panel-border, #ccc)",
    background: modified ? "var(--bbox-panel-warn-bg, #fffbeb)" : selected ? "var(--bbox-panel-fg, #333)" : "var(--bbox-panel-surface, white)",
    color: modified ? "var(--bbox-panel-warn, #92400e)" : selected ? "var(--bbox-panel-surface, white)" : "var(--bbox-panel-fg-muted, #555)",
    cursor: "pointer",
  };
}

const presetResetStyle: CSSProperties = {
  padding: "2px 5px",
  borderRadius: 5,
  fontSize: 11,
  border: "1px solid var(--bbox-panel-warn-soft, #d97706)",
  background: "var(--bbox-panel-surface, white)",
  color: "var(--bbox-panel-warn, #92400e)",
  cursor: "pointer",
  lineHeight: 1,
};

const fieldListStyle: CSSProperties = { display: "flex", flexDirection: "column" };

/* Governed rows (Case B) */

const governedRowWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  borderBottom: "1px solid var(--bbox-panel-border-soft, #eee)",
};

const governedSummaryStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
};

const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 };
const governedLabelStyle: CSSProperties = { fontWeight: 500, color: "var(--bbox-panel-fg, #111)", fontSize: 13 };
const governedValueTextStyle: CSSProperties = { fontSize: 12, fontFamily: "monospace", whiteSpace: "nowrap" };
const paintedElsewhereMiniStyle: CSSProperties = { fontSize: 10, opacity: 0.65, fontStyle: "italic", whiteSpace: "nowrap" };
const caretStyle: CSSProperties = { color: "var(--bbox-panel-fg-faint, #999)", fontSize: 11, width: 10, flexShrink: 0 };

const quickClearStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-danger, #b91c1c)",
  background: "none",
  border: "1px solid var(--bbox-panel-danger-ring, #fca5a5)",
  borderRadius: 4,
  padding: "1px 6px",
  cursor: "pointer",
  flexShrink: 0,
};

const collapseLinkStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--bbox-panel-fg-muted, #666)",
  background: "none",
  border: "none",
  padding: "4px 0",
  cursor: "pointer",
  textAlign: "left",
};
