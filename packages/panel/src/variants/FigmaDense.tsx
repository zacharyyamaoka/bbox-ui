import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  MIXED,
  governedFieldIds,
  readFields,
  type FieldSpec,
  type FieldTrace,
  type FieldValue,
  type PresetSpec,
} from "@bbox-ui/schema";
import type { Subject } from "../FieldTraceRow";
import type { PanelVariant, PanelVariantProps } from "./contract";
import { readFieldRow } from "../fieldModel";
import { groupRows } from "../fieldGroups";
import {
  classifyField,
  loadStoredTier,
  matchesFilter,
  storeTier,
  TIER_META,
  TIER_ORDER,
  TIER_RANK,
  type Tier,
} from "../fieldTiers";

/**
 * FIGMA-DENSE — Zach's own words: "the gold standard here is something more
 * like what Figma has done, where it's a bit more compact… instead of having
 * buttons like you have now, it just has a drop down menu."
 *
 * Modelled on this repo's OWN Figma-exact panel
 * (`packages/inspector/src/inspector/variants/figmaExact/`) and
 * `ScrubNumber.tsx`, but that panel is a live-tldraw-Editor component built
 * on Base UI + `cn` — dependencies this demo does not carry, and the brief
 * asks for zero new ones. So this file ports the DENSITY MODEL by hand:
 *
 *   - single-row grid, quiet label LEFT / control RIGHT, not label-above-
 *     control-below — denser than figmaExact's own two-row-per-field
 *     grid, because the brief's own words ask for exactly that shape.
 *   - a number is a small inline box with its unit INSIDE it, and the LABEL
 *     is the drag-to-scrub handle (figmaExact's own `ScrubNumber` scrubs the
 *     whole field; here only the label needs to, since the box also holds a
 *     normal text caret for typing).
 *   - an enum with >3 options is a native `<select>`, never a wrapped button
 *     row — the one thing Zach named outright. 2-3 options stays segmented:
 *     a fair coin flip fits on one line and a dropdown for it is a click
 *     where a glance used to do.
 *   - two adjacent short numeric fields (Block's width/height, a future
 *     x/y) share one row, each with its own short label above it — the one
 *     place figmaExact's label-above shape earns its keep, because it is
 *     the only way two fields fit one line. `FieldSpec` carries no explicit
 *     pairing metadata, so this is a conservative structural heuristic
 *     (two consecutive `kind: "number"` fields), not an invented product
 *     rule — Pill has no such pair and none is forced.
 *
 * SEMANTICS are ported, not reinvented: `resolveField`/`readFields` are the
 * exact functions `FieldTraceRow.tsx`/`ComponentInspector.tsx` call, called
 * here the same way (stored vs. painted, Mixed on stored disagreement,
 * governed = inherited-looking, override = clearable). Only the presentation
 * of that same trace is different — a small dot instead of a full-width
 * badge row, a caret-triggered disclosure instead of an always-visible
 * chain.
 *
 * AMENDMENT (mid-build, Zach's own reference: a Small 18 / Medium 24 /
 * Large 36 / Extra large 44 dropdown with a tick and a trailing "Custom
 * [44] px" row). Two cases, two different answers — see `NamedDropdown`
 * and the `drivenPresetId` plumbing below:
 *
 *   CASE A — one field, named stops on a scale (`kind: "segments"` with
 *   >3 options, or a governed `"number"` field whose presets each pin a
 *   different value for it): `NamedDropdown` replaces the plain `<select>`/
 *   scrub box with a listbox — option label left, its raw value muted right
 *   (only when it differs from the label — PAINT_TOKENS's label===value, so
 *   Pill's colour fields show no redundant second copy of the same word),
 *   a tick on the active row, and — ONLY when the underlying type is a real
 *   number — a trailing "Custom [ ] unit" row. Pill has no governed number
 *   field, so that half of Case A is implemented and typechecked but not
 *   exercised by this component's own screenshot; disclosed rather than
 *   silently dropped, per the amendment's own point 4.
 *
 *   CASE B — one preset drives MANY fields (Pill's `state` over
 *   lineStyle/lineColor/fillStyle/fillColor): the dropdown shape doesn't
 *   transfer, because the preset isn't a value of any one field. Instead:
 *     1. `drivenPresetId` in `RowData` — true when EVERY selected subject's
 *        stored value for this field comes from the SAME preset, never an
 *        override — turns the resting VALUE text into "Wired · primary"
 *        (segmented buttons get the same words as a quiet suffix, since a
 *        button strip has no single value cell to rewrite). Overridden or
 *        default rows show only the value; expansion stays available
 *        behind the dot, never the resting state.
 *     2. Three states, one mark: the same provenance dot from before
 *        (override/preset/default/mixed) — already close to no space —
 *        now also carries the compound text next to it.
 *     3. `PresetPicker` reports modification: when the selector's active
 *        preset has an explicit stored override on any field it governs,
 *        the row reads "<Preset> +N" with a reset that clears every one of
 *        those overrides in one click — Figma's "modified instance" tell.
 */

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

function FigmaDensePanel({
  componentName,
  fields,
  presets,
  subjects,
  toSubject,
  onChange,
  onClearOverride,
}: PanelVariantProps) {
  const governed = new Set(governedFieldIds(presets));
  const selectors = Array.from(new Set(presets.map((p) => p.selector)));

  // WHY tiering and filtering live HERE, on the chosen row design, rather
  // than in a panel of their own: Zach, 2026-09-11 — "the tiered design of
  // just hiding things, and also filter first, those are things I can support
  // regardless... just because it's a lot of controls as well." They are
  // filters over the field array, orthogonal to how a row is drawn, so they
  // compose with the single-row layout instead of competing with it.
  const [tier, setTier] = useState<Tier>(loadStoredTier);
  const [filter, setFilter] = useState("");
  useEffect(() => storeTier(tier), [tier]);

  const searching = filter.trim() !== "";
  const matched = fields.filter((f) => matchesFilter(f, filter));
  const tierOf = (f: FieldSpec) => classifyField(f, presets, governed);
  // A typed query outranks the tier. Searching for a field and being told
  // nothing matched, because the match was two tiers up, is the one outcome a
  // filter must never produce.
  const visible = searching ? matched : matched.filter((f) => TIER_RANK[tierOf(f)] <= TIER_RANK[tier]);
  const hidden = matched.filter((f) => !visible.includes(f));

  // Hiding a field the user has actually SET is worse than the verbosity the
  // tier exists to cut, so the panel says how many and offers one tap out.
  const hiddenButSet = hidden.filter((f) => subjects.some((s) => s.props[f.id] !== undefined));

  // WHY rows come from a declared group and never from adjacency: Zach asked
  // "how are you specifying that?" about Gap beside Gutter, and the honest
  // answer was that nothing did — any two consecutive numbers paired. That is
  // luck, not a rule; see FieldSpec.group and groupRows.
  const rows = groupRows(visible);

  return (
    <div data-slot="figma-dense-panel" style={panelStyle}>
      <div data-slot="figma-dense-header" style={headerStyle}>
        <span style={headerNameStyle}>{componentName}</span>
        <span style={headerCountStyle}>
          {subjects.length === 0 ? "no subject" : subjects.length === 1 ? "1 selected" : `${subjects.length} selected`}
        </span>
      </div>

      <div data-slot="figma-dense-controls" style={controlBarStyle}>
        <div role="group" aria-label="Detail level" style={tierGroupStyle}>
          {TIER_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              data-slot="tier-button"
              data-tier={t}
              data-active={t === tier && !searching}
              onClick={() => setTier(t)}
              title={TIER_META[t].hint}
              style={tierButtonStyle(t === tier, searching)}
            >
              {TIER_META[t].label}
            </button>
          ))}
        </div>
        <input
          data-slot="field-filter"
          type="search"
          value={filter}
          placeholder="Filter…"
          aria-label="Filter fields"
          onChange={(e) => setFilter(e.target.value)}
          style={filterInputStyle}
        />
      </div>

      {searching && (
        <div data-slot="filter-note" style={noteStyle}>
          {visible.length === 0
            ? `Nothing matches “${filter.trim()}”.`
            : `${visible.length} of ${fields.length} fields match “${filter.trim()}” — all tiers searched.`}
        </div>
      )}

      {!searching && hiddenButSet.length > 0 && (
        <button
          type="button"
          data-slot="hidden-but-set"
          onClick={() => setTier("expert")}
          style={hiddenButSetStyle}
        >
          {hiddenButSet.length} hidden field{hiddenButSet.length === 1 ? " is" : "s are"} set —
          show Expert
        </button>
      )}

      {selectors.map((selector) => (
        <PresetPicker
          key={selector}
          selector={selector}
          presets={presets.filter((p) => p.selector === selector)}
          fields={fields}
          subjects={subjects}
          onChange={onChange}
          onClearOverride={onClearOverride}
        />
      ))}

      <div data-slot="figma-dense-field-list" style={fieldListStyle}>
        {rows.map((row) =>
          Array.isArray(row) ? (
            <PairedRow
              key={`${row[0].id}+${row[1].id}`}
              fields={row}
              subjects={subjects}
              presets={presets}
              governed={governed}
              toSubject={toSubject}
              onChange={onChange}
              onClearOverride={onClearOverride}
            />
          ) : (
            <FieldRow
              key={row.id}
              field={row}
              subjects={subjects}
              presets={presets}
              governed={governed}
              toSubject={toSubject}
              onChange={onChange}
              onClearOverride={onClearOverride}
            />
          ),
        )}
      </div>
    </div>
  );
}

// WHY --bbox-panel-border-soft and not the old `--fd-line`: `--fd-line` was
// never defined anywhere in the codebase, so it silently always fell back to
// its literal — a hardcoded light-gray hairline under the dark header even
// in dark theme. The fallback literal already matched border-soft's own
// light-theme value exactly, so this was a stray/typo'd token name, not a
// deliberate one-off colour.
const controlBarStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--bbox-panel-border-soft, #e7e7ec)" };
const tierGroupStyle: CSSProperties = { display: "flex", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 6, overflow: "hidden" };
const filterInputStyle: CSSProperties = { flex: 1, minWidth: 0, fontSize: 11, padding: "3px 7px", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 6, background: "var(--bbox-panel-surface, #fff)", color: "var(--bbox-panel-fg, #222)" };
const noteStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-muted, #6a6a75)", padding: "5px 10px" };
const hiddenButSetStyle: CSSProperties = { display: "block", width: "100%", textAlign: "left", fontSize: 11, color: "var(--bbox-panel-warn, #8a5a12)", background: "var(--bbox-panel-warn-bg, #fdf6ec)", border: "none", borderBottom: "1px solid var(--bbox-panel-warn-ring, #f0e2cc)", padding: "5px 10px", cursor: "pointer" };
function tierButtonStyle(active: boolean, dimmed: boolean): CSSProperties {
  return {
    fontSize: 11,
    padding: "3px 9px",
    border: "none",
    borderRight: "1px solid var(--bbox-panel-border-soft, #e4e4ea)",
    // WHY emphasis and not fg/surface: fg is ink and flips near-white in dark
    // mode, so a chip filled with it became a bright pill in an all-dark bar.
    // Tiered.tsx and FieldTraceRow.tsx were fixed for the same class an hour
    // before this private copy was — the third copy of one style function.
    background: active && !dimmed ? "var(--bbox-panel-emphasis, #16161a)" : "transparent",
    color: active && !dimmed ? "var(--bbox-panel-emphasis-fg, #ffffff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
    opacity: dimmed ? 0.45 : 1,
    cursor: "pointer",
  };
}

export const FIGMA_DENSE: PanelVariant = {
  id: "figma-dense",
  label: "Figma Dense",
  blurb:
    "The chosen design. One row per field: label left, control right, provenance dot in the gutter. Simple/Advanced/Expert and a filter sit on top of the same rows — they hide fields, never logic.",
  Panel: FigmaDensePanel,
};

/* ------------------------------------------------------------------ */
/* Preset picker — "presets first", compact                            */
/* ------------------------------------------------------------------ */

function PresetPicker({
  selector,
  presets,
  fields,
  subjects,
  onChange,
  onClearOverride,
}: {
  selector: string;
  presets: PresetSpec[];
  fields: FieldSpec[];
  subjects: Subject[];
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}) {
  // Same fallback ComponentInspector.tsx uses: a synthetic field so a
  // subject that never set the selector still reads as "" rather than
  // matching nothing.
  const selectorField: FieldSpec = fields.find((f) => f.id === selector) ?? {
    id: selector,
    label: selector,
    kind: "segments",
    defaultValue: "",
  };
  const reading = readFields([selectorField], subjects.map((s) => s.props))[0];
  const current = reading.value === MIXED ? undefined : String(reading.value);
  const isMixed = reading.value === MIXED;

  // Amendment point 3: does the ACTIVE preset still hold, or has the user
  // stored an override on one of the fields it governs? "modified" is
  // judged the same way `hasOwnOverride` is everywhere else in this file —
  // an explicit stored key on any selected subject — not whether that
  // override happens to coincide with the preset's own value.
  const activePreset = presets.find((p) => p.id === current);
  const modifiedFieldIds = activePreset
    ? activePreset.governs.filter((fieldId) => subjects.some((s) => s.props[fieldId] !== undefined))
    : [];

  return (
    <div data-slot="preset-picker" data-selector={selector} style={presetRowStyle}>
      <span style={presetLabelStyle}>{selector}</span>
      {presets.length <= 3 ? (
        <div style={segmentedGroupStyle}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-slot="preset-button"
              data-preset={preset.id}
              data-selected={current === preset.id}
              onClick={() => onChange(selector, preset.id)}
              style={segmentButtonStyle(current === preset.id, false)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : (
        <NamedDropdown
          triggerText={isMixed ? "Mixed" : (activePreset?.label ?? current ?? "")}
          isMixed={isMixed}
          rows={presets.map((preset) => ({
            key: preset.id,
            label: preset.label,
            sublabel: preset.id !== preset.label ? preset.id : undefined,
            active: !isMixed && current === preset.id,
          }))}
          onSelect={(presetId) => onChange(selector, presetId)}
        />
      )}
      {isMixed && <span style={mixedNoteStyle}>mixed</span>}
      {!isMixed && modifiedFieldIds.length > 0 && (
        <>
          <span data-slot="preset-modified" style={modifiedNoteStyle} title={`Overridden: ${modifiedFieldIds.join(", ")}`}>
            +{modifiedFieldIds.length}
          </span>
          <button
            type="button"
            data-slot="preset-reset"
            onClick={() => modifiedFieldIds.forEach((fieldId) => onClearOverride(fieldId))}
            style={clearButtonStyle}
            title={`Clear ${modifiedFieldIds.length} override(s) — fall back to ${activePreset?.label}`}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One row — label left, control right, dot = provenance + disclosure  */
/* ------------------------------------------------------------------ */

interface RowData {
  trace: FieldTrace | null;
  paintedElsewhere: FieldValue | null;
  isMixed: boolean;
  hasOwnOverride: boolean;
  collapsedValue: FieldValue | undefined;
  /** Amendment Case B point 1: set only when EVERY selected subject's
   *  stored value for this field is currently supplied by the SAME
   *  preset — never an override, even one that happens to match. `null`
   *  with 0 subjects selected, `undefined` otherwise (mixed presets, no
   *  presets governing this field, or any subject overriding it). */
  drivenPresetId: string | undefined;
}

/**
 * WHY this is four lines over `readFieldRow` and not the twelve it used to
 * be: this file carried its own copy of the resolution model, gated on
 * `subjects.length === 1`. With two subjects selected the "painting …" note
 * went silent while the control kept showing a value nothing painted — the
 * identical defect that had already been fixed in the canonical row. Six
 * files, four answers. The model is shared now; see fieldModel.ts.
 */
function readRow(
  field: FieldSpec,
  subjects: Subject[],
  presets: PresetSpec[],
  toSubject: ((props: Record<string, unknown>) => Record<string, unknown>) | undefined,
): RowData {
  const row = readFieldRow(field, subjects, presets, toSubject);
  return {
    trace: row.trace,
    paintedElsewhere: row.paintedElsewhere,
    isMixed: row.isMixed,
    hasOwnOverride: row.hasOwnOverride,
    collapsedValue: row.collapsedValue,
    // This panel's render path reads `undefined` for "no single preset drives
    // every selected subject"; the model says `null`. One conversion here,
    // rather than a second definition of the rule.
    drivenPresetId: row.drivenPresetId ?? undefined,
  };
}

/** The option whose `value` matches, or a bare stringified fallback for a
 *  value outside the declared set (shouldn't happen, but a display helper
 *  that throws on bad data is worse than one that degrades). */
function optionLabelFor(field: FieldSpec, value: FieldValue | undefined): string {
  if (value === undefined) return "";
  const match = field.options?.find((o) => o.value === String(value));
  return match?.label ?? String(value);
}

/** Case B point 1: "Wired · primary" when a preset is driving the value,
 *  just "primary" otherwise (overridden or default — the dot already says
 *  which). Multi-select non-mixed agreement counts as driven too, per
 *  `drivenPresetId`'s own contract above. */
function drivenText(displayValue: string, drivenPresetId: string | undefined, presets: PresetSpec[]): string {
  if (!drivenPresetId) return displayValue;
  const label = presets.find((p) => p.id === drivenPresetId)?.label ?? drivenPresetId;
  return `${label} · ${displayValue}`;
}

function FieldRow({
  field,
  subjects,
  presets,
  governed,
  toSubject,
  onChange,
  onClearOverride,
}: {
  field: FieldSpec;
  subjects: Subject[];
  presets: PresetSpec[];
  governed: Set<string>;
  toSubject: ((props: Record<string, unknown>) => Record<string, unknown>) | undefined;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isGoverned = governed.has(field.id);
  const data = readRow(field, subjects, presets, toSubject);

  return (
    <div data-slot="figma-dense-row" data-field={field.id} data-governed={isGoverned} style={rowWrapStyle}>
      <div style={rowGridStyle}>
        <RowLabel field={field} data={data} governed={isGoverned} expanded={expanded} setExpanded={setExpanded} onChange={onChange} />
        <div style={controlCellStyle}>
          <DenseControl
            field={field}
            value={data.collapsedValue}
            isMixed={data.isMixed}
            secondary={isGoverned}
            presets={presets}
            drivenPresetId={data.drivenPresetId}
            onChange={(value) => onChange(field.id, value)}
          />
          {isGoverned && data.hasOwnOverride && (
            <button
              type="button"
              data-slot="field-clear-override"
              onClick={() => onClearOverride(field.id)}
              style={clearButtonStyle}
              title="Clear this instance's override — fall back to the preset"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {data.paintedElsewhere !== null && (
        <div data-slot="field-painted-elsewhere" style={paintedElsewhereStyle}>
          painting {String(data.paintedElsewhere)}
        </div>
      )}
      {expanded && data.trace && <TraceChain trace={data.trace} presets={presets} />}
    </div>
  );
}

/** Two short numeric fields sharing one row — Block's width/height. */
function PairedRow({
  fields,
  subjects,
  presets,
  governed,
  toSubject,
  onChange,
  onClearOverride,
}: {
  fields: [FieldSpec, FieldSpec];
  subjects: Subject[];
  presets: PresetSpec[];
  governed: Set<string>;
  toSubject: ((props: Record<string, unknown>) => Record<string, unknown>) | undefined;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}) {
  return (
    <div data-slot="figma-dense-paired-row" style={pairedRowWrapStyle}>
      {fields.map((field) => (
        <PairedFieldCell
          key={field.id}
          field={field}
          subjects={subjects}
          presets={presets}
          governed={governed.has(field.id)}
          toSubject={toSubject}
          onChange={onChange}
          onClearOverride={onClearOverride}
        />
      ))}
    </div>
  );
}

/** One half of a `PairedRow` — its own component (not an inline closure in
 *  `.map()`) purely so its `useState` obeys the rules of hooks: a hook may
 *  only live at the top level of a component/hook, never inside a callback
 *  passed to `Array.map`, even one whose length happens to be fixed. */
function PairedFieldCell({
  field,
  subjects,
  presets,
  governed,
  toSubject,
  onChange,
  onClearOverride,
}: {
  field: FieldSpec;
  subjects: Subject[];
  presets: PresetSpec[];
  governed: boolean;
  toSubject: ((props: Record<string, unknown>) => Record<string, unknown>) | undefined;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = readRow(field, subjects, presets, toSubject);

  return (
    <div data-slot="figma-dense-paired-cell" data-field={field.id} style={pairedCellStyle}>
      <RowLabel field={field} data={data} governed={governed} expanded={expanded} setExpanded={setExpanded} onChange={onChange} compact />
      <div style={controlCellStyle}>
        <DenseControl
          field={field}
          value={data.collapsedValue}
          isMixed={data.isMixed}
          secondary={governed}
          presets={presets}
          drivenPresetId={data.drivenPresetId}
          onChange={(value) => onChange(field.id, value)}
        />
        {governed && data.hasOwnOverride && (
          <button
            type="button"
            data-slot="field-clear-override"
            onClick={() => onClearOverride(field.id)}
            style={clearButtonStyle}
            title="Clear this instance's override — fall back to the preset"
          >
            ×
          </button>
        )}
      </div>
      {expanded && data.trace && <TraceChain trace={data.trace} presets={presets} />}
    </div>
  );
}

/**
 * The label cell: a small provenance dot (click = expand the cascade for a
 * single subject, contract point 5) then the field name. For a NUMBER field
 * the label itself is the scrub handle (contract-adjacent, figmaExact's own
 * "the whole field is the scrub surface" taste, cheapened to just the label
 * so the box underneath keeps a normal text caret).
 */
function RowLabel({
  field,
  data,
  governed,
  expanded,
  setExpanded,
  onChange,
  compact,
}: {
  field: FieldSpec;
  data: RowData;
  governed: boolean;
  expanded: boolean;
  setExpanded: (fn: (v: boolean) => boolean) => void;
  onChange: (fieldId: string, value: FieldValue) => void;
  compact?: boolean;
}) {
  const scrub = useLabelScrub(field, data, onChange);
  const dotTitle = data.isMixed
    ? "Mixed across selection"
    : data.trace
      ? `${data.trace.winner === "preset" ? `preset: ${data.trace.winningPresetId ?? ""}` : data.trace.winner} — click to see the cascade`
      : undefined;

  return (
    <div style={compact ? labelCellCompactStyle : labelCellStyle}>
      <button
        type="button"
        data-slot="field-provenance-dot"
        disabled={!data.trace}
        onClick={() => setExpanded((v) => !v)}
        title={dotTitle}
        style={dotButtonStyle(data.isMixed, data.trace?.winner, expanded)}
      />
      <span
        data-slot="field-label"
        style={labelTextStyle(governed, field.kind === "number")}
        onPointerDown={field.kind === "number" ? scrub.onPointerDown : undefined}
        onPointerMove={field.kind === "number" ? scrub.onPointerMove : undefined}
        onPointerUp={field.kind === "number" ? scrub.onPointerUp : undefined}
        title={field.hint}
      >
        {field.label}
      </span>
    </div>
  );
}

/** Pointer-drag-to-scrub on a label, plain and dependency-free: past a 3px
 *  threshold, horizontal drag steps the number by `field.step` per
 *  `SCRUB_PX_PER_STEP` pixels — the same shape as figmaExact's ported
 *  `ScrubNumber`, cut down to what a label needs (no expression parser, no
 *  keyboard handling — the `<input>` underneath already has both). */
const SCRUB_PX_PER_STEP = 4;
const SCRUB_THRESHOLD_PX = 3;

function useLabelScrub(
  field: FieldSpec,
  data: RowData,
  onChange: (fieldId: string, value: FieldValue) => void,
) {
  const drag = useRef<{ startX: number; startValue: number; moved: boolean } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    const current = typeof data.collapsedValue === "number" ? data.collapsedValue : (field.defaultValue as number);
    drag.current = { startX: e.clientX, startValue: current, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.moved) {
      if (Math.abs(dx) <= SCRUB_THRESHOLD_PX) return;
      drag.current.moved = true;
    }
    const step = field.step ?? 1;
    let next = drag.current.startValue + Math.round(dx / SCRUB_PX_PER_STEP) * step;
    if (field.min !== undefined) next = Math.max(field.min, next);
    if (field.max !== undefined) next = Math.min(field.max, next);
    onChange(field.id, Number(next.toFixed(6)));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLSpanElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    drag.current = null;
  }
  return { onPointerDown, onPointerMove, onPointerUp };
}

/** Collapsed-by-default cascade — contract point 5, still reachable, just
 *  behind the dot instead of an always-visible badge row. */
function TraceChain({ trace, presets }: { trace: FieldTrace; presets: PresetSpec[] }) {
  return (
    <div data-slot="field-trace-chain" style={chainStyle}>
      {trace.candidates.map((candidate) => (
        <div
          key={candidate.layer}
          data-slot="field-trace-candidate"
          data-layer={candidate.layer}
          data-winner={candidate.layer === trace.winner}
          style={candidateRowStyle(candidate.layer === trace.winner)}
        >
          <span style={candidateDotStyle(candidate.layer === trace.winner)} />
          <span style={candidateLayerStyle}>
            {candidate.layer}
            {candidate.presetId ? ` · ${presets.find((p) => p.id === candidate.presetId)?.label ?? candidate.presetId}` : ""}
          </span>
          <span style={candidateValueStyle}>{candidate.value === undefined ? "—" : String(candidate.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls — segments(<=3)=buttons, segments(>3)=select, number, toggle,
   text                                                                 */
/* ------------------------------------------------------------------ */

function DenseControl({
  field,
  value,
  isMixed,
  secondary,
  presets,
  drivenPresetId,
  onChange,
}: {
  field: FieldSpec;
  value: FieldValue | undefined;
  isMixed: boolean;
  secondary?: boolean;
  presets: PresetSpec[];
  drivenPresetId: string | undefined;
  onChange: (value: FieldValue) => void;
}) {
  if (field.kind === "segments") {
    const options = field.options ?? [];
    // The one thing named outright: a wrapped row of buttons for a
    // multi-option enum is what he's replacing. A short strip stays
    // segmented — that is a single line either way — everything wider
    // becomes a dropdown so the row never wraps.
    //
    // WHY the budget is measured in CHARACTERS and not in options: a count
    // says "Small · 8px / Medium · 12px / Large · 18px" is three options and
    // therefore fine, and it is not — at 37 characters it overflowed the
    // control column and clipped its third option off the panel edge, in the
    // design Zach had just chosen. What overflows a fixed column is total
    // label width, so that is what the rule reads. Direction (Input/Output,
    // 11 chars) and Line Thickness (thin/med/thick, 13) still segment.
    const stripWidth = options.reduce((n, o) => n + o.label.length + SEGMENT_PADDING_CHARS, 0);
    if (options.length <= 3 && stripWidth <= SEGMENT_CHAR_BUDGET) {
      return (
        <div style={segmentedControlGroupStyle}>
          <div style={segmentedGroupStyle}>
            {options.map((option) => {
              const active = !isMixed && value !== undefined && String(value) === option.value;
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
          {/* Case B point 1, adapted for a button strip: a button already
           *  shows the resolved VALUE by which one is pressed, so there is
           *  no value cell to rewrite as "Wired · primary" — the preset
           *  name rides as a quiet suffix instead, same words, same idea. */}
          {!isMixed && drivenPresetId && (
            <span style={drivenSuffixStyle}>· {presets.find((p) => p.id === drivenPresetId)?.label ?? drivenPresetId}</span>
          )}
        </div>
      );
    }
    // CASE A: named stops, a tick on the active one, the raw value muted
    // beside the label when it says something the label doesn't.
    return (
      <NamedDropdown
        triggerText={drivenText(isMixed ? "Mixed" : optionLabelFor(field, value), isMixed ? undefined : drivenPresetId, presets)}
        isMixed={isMixed}
        secondary={secondary}
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
    return (
      <label style={toggleLabelStyle(secondary)}>
        <input
          type="checkbox"
          checked={!isMixed && value === true}
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
    // CASE A's other half: a governed number whose presets each pin a
    // different value for it is exactly his Small 18/Medium 24/… dropdown —
    // named stops that resolve to a number, plus a Custom row for the raw
    // value. Pill has no such field (see this file's header amendment
    // note), so this branch is implemented and typechecked but unexercised
    // by the one screenshot this variant is measured on.
    const governingPresets = presets.filter((p) => p.governs.includes(field.id) && p.values[field.id] !== undefined);
    const isNumericScale = governingPresets.length > 1;
    if (isNumericScale) {
      return (
        <NamedDropdown
          triggerText={drivenText(
            isMixed ? "Mixed" : `${value ?? field.defaultValue}${field.unit ?? ""}`,
            isMixed ? undefined : drivenPresetId,
            presets,
          )}
          isMixed={isMixed}
          secondary={secondary}
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
    return (
      <div style={numberBoxStyle(secondary)}>
        <input
          type="number"
          value={value === undefined ? "" : Number(value)}
          placeholder={isMixed ? "Mixed" : undefined}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? field.defaultValue : Number(e.target.value))}
          style={numberInputStyle}
        />
        {field.unit && <span style={numberUnitStyle}>{field.unit}</span>}
      </div>
    );
  }

  // "text"
  return (
    <input
      type="text"
      value={value === undefined ? "" : String(value)}
      placeholder={isMixed ? "Mixed" : undefined}
      onChange={(e) => onChange(e.target.value)}
      style={textInputStyle(secondary)}
    />
  );
}

/* ------------------------------------------------------------------ */
/**
 * How much label a segmented strip may carry before it becomes a dropdown.
 * Derived from the control column: ~190px at ~6.2px per character at 11px,
 * minus the borders each segment costs. Measured against the real panel, not
 * guessed — `dense_check.mjs` asserts no row overflows its column.
 */
const SEGMENT_CHAR_BUDGET = 26;
const SEGMENT_PADDING_CHARS = 2;

/* NamedDropdown — Case A: named stops + muted resolved value + tick +  */
/* an optional Custom row, all in one line of resting height            */
/* ------------------------------------------------------------------ */

interface DropdownRow {
  key: string;
  label: string;
  /** The raw value beside the friendly name — only rendered when it says
   *  something the label doesn't (PAINT_TOKENS's label===value, so Pill's
   *  colour rows show nothing here; a state's `"Out of Focus"` shows its
   *  technical `outOfFocus` beside it). */
  sublabel?: string;
  active: boolean;
}

function NamedDropdown({
  triggerText,
  isMixed,
  secondary,
  rows,
  onSelect,
  custom,
}: {
  triggerText: string;
  isMixed: boolean;
  secondary?: boolean;
  rows: DropdownRow[];
  onSelect: (key: string) => void;
  /** His reference's own footer: "Custom [44] px" — only present when the
   *  field this dropdown controls is genuinely numeric. */
  custom?: {
    value: number | undefined;
    unit: string | undefined;
    active: boolean;
    onChange: (value: number) => void;
  };
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
    <div ref={rootRef} data-slot="named-dropdown" style={dropdownRootStyle}>
      <button type="button" data-slot="named-dropdown-trigger" onClick={() => setOpen((v) => !v)} style={dropdownTriggerStyle(secondary)}>
        <span style={dropdownTriggerTextStyle}>{isMixed ? "Mixed" : triggerText}</span>
        <span aria-hidden="true" style={dropdownChevronStyle}>
          ▾
        </span>
      </button>
      {open && (
        <div data-slot="named-dropdown-menu" style={dropdownMenuStyle}>
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              data-slot="named-dropdown-row"
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
            <div data-slot="named-dropdown-custom" style={dropdownCustomRowStyle(custom.active)}>
              <span style={dropdownRowTickStyle}>{custom.active ? "✓" : ""}</span>
              <span style={dropdownCustomLabelStyle}>Custom</span>
              <input
                type="number"
                data-slot="named-dropdown-custom-input"
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

/* ------------------------------------------------------------------ */
/* Styles — plain inline objects, no build-time CSS dependency here    */
/* ------------------------------------------------------------------ */

const panelStyle: CSSProperties = {
  width: 280,
  padding: "10px 12px",
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  fontFamily: "sans-serif",
  fontSize: 11,
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
};
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "2px 2px 8px",
  borderBottom: "1px solid var(--bbox-panel-border-soft, #eee)",
  marginBottom: 6,
};
const headerNameStyle: CSSProperties = { fontWeight: 600, fontSize: 12, color: "var(--bbox-panel-fg, #111)" };
// WHY fg-muted, not fg-faint: fg-faint is defined site-wide as the muted
// foreground blended to 65% alpha over the panel background — fine for a
// decorative unit label sitting right beside its own value, but this span is
// the only place the subject count lives, and on the site's light theme that
// blend measures ~2.5:1 against white, under the 3:1 floor. fg-muted is the
// same colour without the alpha cut, comfortably clearing it in both themes.
const headerCountStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-muted, #5c5c66)" };

const presetRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 2px" };
const presetLabelStyle: CSSProperties = { width: 92, flexShrink: 0, fontSize: 10, color: "var(--bbox-panel-override, #6d28d9)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 };
const mixedNoteStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-warn, #b45309)" };

const fieldListStyle: CSSProperties = { display: "flex", flexDirection: "column" };

const rowWrapStyle: CSSProperties = { padding: "1px 2px" };
// LABEL_WIDTH is the whole compaction argument: a fixed narrow label column
// with the control taking the rest is what turns N wrapped rows into N
// tight ones — the exact halving-of-height the brief points at.
const LABEL_WIDTH = 96;
const rowGridStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 22 };
const labelCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, width: LABEL_WIDTH, flexShrink: 0 };
const labelCellCompactStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4 };
const controlCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };

const pairedRowWrapStyle: CSSProperties = { display: "flex", gap: 10, padding: "1px 2px" };
const pairedCellStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 };

function labelTextStyle(governed: boolean, scrubbable: boolean): CSSProperties {
  return {
    fontSize: 11,
    color: governed ? "var(--bbox-panel-fg-faint, #999)" : "var(--bbox-panel-fg, #444)",
    fontWeight: 400,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: scrubbable ? "ew-resize" : "default",
    userSelect: "none",
  };
}

function dotButtonStyle(mixed: boolean, winner: FieldTrace["winner"] | undefined, expanded: boolean): CSSProperties {
  const palette: Record<"override" | "preset" | "default" | "mixed", string> = {
    override: "var(--bbox-panel-override-soft, #8b5cf6)",
    preset: "var(--bbox-panel-preset-soft, #3b82f6)",
    default: "var(--bbox-panel-border, #d1d5db)",
    mixed: "var(--bbox-panel-warn-soft, #f59e0b)",
  };
  const color = mixed ? palette.mixed : winner ? palette[winner] : "var(--bbox-panel-border-soft, #e5e7eb)";
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    border: "none",
    padding: 0,
    cursor: winner || mixed ? "pointer" : "default",
    background: color,
    outline: expanded ? `2px solid ${color}55` : "none",
    outlineOffset: 1,
  };
}

const paintedElsewhereStyle: CSSProperties = {
  fontSize: 9,
  opacity: 0.65,
  fontStyle: "italic",
  paddingLeft: LABEL_WIDTH + 6,
  whiteSpace: "nowrap",
};

const clearButtonStyle: CSSProperties = {
  fontSize: 10,
  lineHeight: 1,
  color: "var(--bbox-panel-danger, #b91c1c)",
  background: "none",
  border: "1px solid var(--bbox-panel-danger-ring, #fca5a5)",
  borderRadius: 4,
  width: 16,
  height: 16,
  flexShrink: 0,
  cursor: "pointer",
  padding: 0,
};

const chainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginLeft: LABEL_WIDTH + 6,
  marginTop: 2,
  marginBottom: 2,
  padding: "3px 6px",
  background: "var(--bbox-panel-surface-2, #fafafa)",
  borderRadius: 4,
  border: "1px solid var(--bbox-panel-border-soft, #eee)",
};

function candidateRowStyle(winner: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10,
    fontWeight: winner ? 600 : 400,
    color: winner ? "var(--bbox-panel-fg, #111)" : "var(--bbox-panel-fg-faint, #999)",
  };
}
function candidateDotStyle(winner: boolean): CSSProperties {
  return {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: winner ? "var(--bbox-panel-fg, #111)" : "transparent",
    border: winner ? "none" : "1px solid var(--bbox-panel-border, #ccc)",
    flexShrink: 0,
  };
}
const candidateLayerStyle: CSSProperties = { width: 110, flexShrink: 0 };
const candidateValueStyle: CSSProperties = { fontFamily: "monospace" };

const segmentedGroupStyle: CSSProperties = { display: "flex", gap: 2 };

function segmentButtonStyle(selected: boolean, secondary?: boolean): CSSProperties {
  return {
    padding: "2px 7px",
    borderRadius: 4,
    fontSize: 10,
    lineHeight: "16px",
    border: selected ? `1px solid ${secondary ? "var(--bbox-panel-fg-faint, #aaa)" : "var(--bbox-panel-fg, #111)"}` : "1px solid var(--bbox-panel-border, #ddd)",
    background: selected ? (secondary ? "var(--bbox-panel-border-soft, #eee)" : "var(--bbox-panel-fg, #111)") : "var(--bbox-panel-surface, white)",
    color: selected ? (secondary ? "var(--bbox-panel-fg, #333)" : "var(--bbox-panel-surface, white)") : "var(--bbox-panel-fg, #444)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const segmentedControlGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 };
// Amendment Case B point 1's button-strip adaptation: the preset name as a
// quiet trailing word, same colour/weight as everything else this file
// marks "inherited" — never a second badge.
const drivenSuffixStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--bbox-panel-fg-faint, #999)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Amendment point 3: "<Preset> +N" beside the picker, quiet until it means
// something (a stored override under an active preset), then a one-click
// reset — Figma's own "modified instance" tell, at dot-sized cost.
const modifiedNoteStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "var(--bbox-panel-warn-bg, #fef3c7)",
  borderRadius: 4,
  padding: "1px 5px",
  whiteSpace: "nowrap",
};

/* --------------------------- NamedDropdown (Case A) --------------------------- */

const dropdownRootStyle: CSSProperties = { position: "relative", flex: 1, minWidth: 0 };

function dropdownTriggerStyle(secondary?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    width: "100%",
    height: 22,
    padding: "0 6px",
    borderRadius: 4,
    border: `1px solid ${secondary ? "var(--bbox-panel-border-soft, #e5e5e5)" : "var(--bbox-panel-border, #ddd)"}`,
    background: "var(--bbox-panel-surface, white)",
    fontSize: 11,
    color: secondary ? "var(--bbox-panel-fg-faint, #999)" : "var(--bbox-panel-fg, #222)",
    cursor: "pointer",
    textAlign: "left",
  };
}
const dropdownTriggerTextStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dropdownChevronStyle: CSSProperties = { fontSize: 9, opacity: 0.5, flexShrink: 0 };

// Absolutely positioned, not portalled — no dependency on a portal target,
// and this panel never sits inside an `overflow:hidden` ancestor that would
// clip it. Good enough for a demo comparing five variants side by side.
const dropdownMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 2px)",
  left: 0,
  right: 0,
  zIndex: 20,
  display: "flex",
  flexDirection: "column",
  background: "var(--bbox-panel-surface, white)",
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  padding: 3,
  maxHeight: 220,
  overflowY: "auto",
};

function dropdownRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 6px",
    borderRadius: 4,
    border: "none",
    background: active ? "var(--bbox-panel-override-bg, #f5f3ff)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  };
}
const dropdownRowTickStyle: CSSProperties = { width: 12, flexShrink: 0, fontSize: 10, color: "var(--bbox-panel-override, #6d28d9)" };
const dropdownRowLabelStyle: CSSProperties = { flex: 1, minWidth: 0, fontSize: 11, color: "var(--bbox-panel-fg, #222)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const dropdownRowSublabelStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #999)", fontFamily: "monospace", flexShrink: 0 };

function dropdownCustomRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 6px",
    marginTop: 2,
    borderTop: "1px solid var(--bbox-panel-border-soft, #eee)",
    background: active ? "var(--bbox-panel-override-bg, #f5f3ff)" : "transparent",
    borderRadius: 4,
  };
}
const dropdownCustomLabelStyle: CSSProperties = { flex: 1, fontSize: 11, color: "var(--bbox-panel-fg-muted, #666)" };
const dropdownCustomInputStyle: CSSProperties = {
  width: 48,
  height: 18,
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 3,
  fontSize: 11,
  padding: "0 4px",
};

function toggleLabelStyle(secondary?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: secondary ? "var(--bbox-panel-fg-faint, #999)" : "var(--bbox-panel-fg, #333)",
  };
}

function numberBoxStyle(secondary?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    height: 22,
    borderRadius: 4,
    border: `1px solid ${secondary ? "var(--bbox-panel-border-soft, #e5e5e5)" : "var(--bbox-panel-border, #ddd)"}`,
    background: "var(--bbox-panel-surface, white)",
    padding: "0 2px 0 6px",
  };
}
const numberInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  fontSize: 11,
  padding: "0 2px",
  background: "transparent",
};
const numberUnitStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #999)", flexShrink: 0, paddingRight: 4 };

function textInputStyle(secondary?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    height: 22,
    padding: "0 6px",
    border: `1px solid ${secondary ? "var(--bbox-panel-border-soft, #e5e5e5)" : "var(--bbox-panel-border, #ddd)"}`,
    borderRadius: 4,
    fontSize: 11,
    color: secondary ? "var(--bbox-panel-fg-faint, #999)" : "var(--bbox-panel-fg, #222)",
  };
}
