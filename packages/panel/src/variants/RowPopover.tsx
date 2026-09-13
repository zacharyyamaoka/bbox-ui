import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MIXED,
  governedFieldIds,
  readFields,
  type FieldSpec,
  type FieldTrace,
  type FieldValue,
  type Layer,
  type PresetSpec,
} from "@bbox-ui/schema";
import { readFieldRow, type FieldRowModel } from "../fieldModel";
import type { PanelVariant, PanelVariantProps } from "./contract";

/**
 * demos/inspector/src/variants/RowPopover.tsx
 *
 * Zach's complaint: a six-option segmented control (`state`) wraps onto
 * three rows, and that repeats down the panel — "you don't end up
 * getting, like, these multiple rows of things." This variant is the
 * strongest possible answer: EVERY field is exactly one row, at a fixed
 * height, regardless of its kind or option count. N fields is N rows,
 * full stop — Port's 20 fields make 20 rows, never more. All the space a
 * six-option segmented control or a cascade chain needs moves into a
 * popover anchored to the row, opened on click.
 *
 * LOGIC is lifted verbatim from FieldTraceRow.tsx / ComponentInspector.tsx
 * (stored-vs-painted resolution, Mixed, the trace chain, clear-override,
 * presets-first) — only the presentation changes. See FieldTraceRow's own
 * comments for why storedTrace and paintedTrace are two different
 * resolutions and why Mixed is decided on stored values.
 *
 * AMENDMENT (Zach, mid-build): name and value together, one line, no
 * expansion at rest. A row's collapsed text is no longer just "the
 * value" — it is `<preset> · <value>` when a preset supplies it, so the
 * three states (driven / overridden / default) read off the row without
 * opening anything (`fieldWinner` below is the single source for that
 * three-way split, row list and popover header both call it so they can
 * never disagree). The preset picker itself now reports when its own
 * governed fields have been individually overridden — "Wired · modified"
 * — with one reset that clears exactly those fields, the same "modified
 * instance" idea Figma uses for a component instance with local
 * overrides. See `PRESET_MODIFIED` styles and the `activePreset`/
 * `modifiedFieldIds` block in the presets-first loop.
 *
 * CASE A vs CASE B (the amendment's own split): a single segments field
 * with named, scale-like options (diameter, textSize) gets the dropdown
 * treatment inline in its own popover — `PopoverControl`'s segments
 * branch is now a vertical tick-list with the option's own embedded
 * magnitude right-aligned and muted, not a wrapped button grid. A
 * "Custom [ ] px" escape row is deliberately NOT built: no FieldSpec in
 * this schema combines a named scale with a free-numeric override today
 * (`diameter`'s own hint says so — see port.fields.ts) — adding one here
 * would invent a value outside the field's real type. Case B (one preset
 * governing several DIFFERENT fields, e.g. Pill's `state` governing
 * `lineStyle`/`lineColor`/`fillStyle`/`fillColor`) has no single field to
 * hang a dropdown off; that is what the row's `<preset> · <value>` text
 * plus the preset row's "modified" report are for instead.
 */

const POPOVER_WIDTH = 300;
const ROW_HEIGHT = 30;

/** The three-state split the amendment asks every row to carry, computed
 * once so the row list and the popover header can never disagree about
 * which state a field is in. `winner: null` only when there are zero
 * subjects (nothing to resolve against) — a distinct case from Mixed. */
type FieldWinner = {
  isMixed: boolean;
  winner: Layer | null;
  presetId?: string;
  resolved: FieldValue | undefined;
};

// WHY: sourced from readFieldRow's `traces`/`isMixed` (../fieldModel.ts)
// instead of a second resolveField pass — same per-subject material the
// shared model already computed, just re-prioritized into the three
// states this row/popover pair renders.
function fieldWinner(field: FieldSpec, row: FieldRowModel): FieldWinner {
  const { isMixed, traces, collapsedValue } = row;
  if (traces.length === 0) {
    return { isMixed: false, winner: "default", resolved: field.defaultValue };
  }
  if (isMixed) return { isMixed: true, winner: null, resolved: undefined };
  // Any subject holding its OWN value marks the field overridden even if,
  // by coincidence, a sibling subject reaches the same number through the
  // preset — writing here would still stomp that subject's own value.
  if (traces.some((t) => t.winner === "override")) {
    return { isMixed: false, winner: "override", resolved: collapsedValue };
  }
  const presetTrace = traces.find((t) => t.winner === "preset");
  if (presetTrace) {
    return { isMixed: false, winner: "preset", presetId: presetTrace.winningPresetId, resolved: collapsedValue };
  }
  return { isMixed: false, winner: "default", resolved: collapsedValue };
}

function presetLabelFor(presetId: string | undefined, presets: PresetSpec[]): string {
  if (!presetId) return "";
  return presets.find((p) => p.id === presetId)?.label ?? presetId;
}

function RowPopoverPanel({
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
  const asSubject = toSubject ?? ((props: Record<string, unknown>) => props);

  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const previouslyOpenRef = useRef<string | null>(null);

  // Focus return: only fires on an actual CLOSE (open -> null), never on
  // switching straight from one row's popover to another's — the browser
  // already focuses the newly-clicked trigger in that case.
  useEffect(() => {
    if (openFieldId === null && previouslyOpenRef.current) {
      triggerRefs.current[previouslyOpenRef.current]?.focus();
    }
    previouslyOpenRef.current = openFieldId;
  }, [openFieldId]);

  // Escape and outside-click both close. A single document-level listener
  // pair, live only while a popover is actually open.
  useEffect(() => {
    if (openFieldId === null) return;
    const fieldId = openFieldId;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpenFieldId(null);
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      const insidePopover = popoverRef.current?.contains(target);
      const insideRow = rowRefs.current[fieldId]?.contains(target);
      if (!insidePopover && !insideRow) setOpenFieldId(null);
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [openFieldId]);

  // Position: computed from the trigger row's own rect (never a fixed
  // offset), applied as `position: fixed` so the panel's own
  // `overflow-y: auto` can never clip it — an `absolute` popover parented
  // inside a scrolling list would be cut at the panel edge the moment a
  // row near the bottom opened one. Flips above the row when there is not
  // enough room below, clamped so it never runs off the left/right edge.
  useLayoutEffect(() => {
    if (openFieldId === null) {
      setPopoverStyle(null);
      return;
    }
    const anchor = triggerRefs.current[openFieldId];
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    const estimatedHeight = popoverRef.current?.getBoundingClientRect().height ?? 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight + 12;
    setPopoverStyle({
      position: "fixed",
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
      left,
      width: POPOVER_WIDTH,
    });
    // Re-measure once mounted, in case the first pass under/over-guessed
    // this field's real popover height (segments vs. a bare toggle differ
    // a lot).
  }, [openFieldId]);

  const openField = openFieldId ? fields.find((f) => f.id === openFieldId) ?? null : null;

  return (
    <div data-slot="row-popover-panel" style={panelStyle}>
      <div data-slot="row-popover-header" style={headerStyle}>
        {componentName} — {subjects.length === 0 ? "no subject selected" : `${subjects.length} selected`}
      </div>

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
        // AMENDMENT point 3: the preset row itself reports modification —
        // "Wired · modified" — the instant any field THIS preset governs
        // carries its own stored override, with one reset that clears
        // exactly that set. Only meaningful when a single preset is
        // unambiguously active (not Mixed, not "nothing selected yet").
        const activePreset = current ? presetsForSelector.find((p) => p.id === current) : undefined;
        const modifiedFieldIds = activePreset
          ? activePreset.governs.filter((fieldId) => subjects.some((s) => s.props[fieldId] !== undefined))
          : [];
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
              {reading.value === MIXED && <span style={mixedNoteStyle}>mixed</span>}
            </div>
            {activePreset && modifiedFieldIds.length > 0 && (
              <div data-slot="preset-modified" style={presetModifiedRowStyle}>
                <span style={presetModifiedTagStyle}>
                  {activePreset.label} · modified{modifiedFieldIds.length > 1 ? ` (${modifiedFieldIds.length})` : ""}
                </span>
                <button
                  type="button"
                  data-slot="preset-modified-reset"
                  onClick={() => modifiedFieldIds.forEach((fieldId) => onClearOverride(fieldId))}
                  style={presetModifiedResetStyle}
                  title={`Clear every override this preset governs: ${modifiedFieldIds.join(", ")}`}
                >
                  ↺ reset to {activePreset.label}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div data-slot="row-list" style={rowListStyle}>
        {fields.map((field) => {
          const isGoverned = governed.has(field.id);
          // WHY: shared field-resolution model (../fieldModel.ts) — the
          // "painting X" note used to be gated on exactly one subject
          // selected and went silent the moment a second one joined the
          // selection, while the control kept showing a value nothing
          // painted.
          const row = readFieldRow(field, subjects, presets, toSubject);
          const paintedElsewhere = row.paintedElsewhere;
          // Three states, one shared computation (`fieldWinner`) so the row
          // and the popover header can never disagree: "override" reads
          // bold/dark with a filled purple dot (this instance's own
          // value); "preset" reads blue, `<preset> · <value>`, with a
          // filled blue dot — name and value together, on one line, per
          // the amendment; "default" reads muted grey with a hollow dot.
          const state = fieldWinner(field, row);
          const rowText =
            state.winner === "preset" && isGoverned
              ? `${presetLabelFor(state.presetId, presets)} · ${formatValue(field, state.resolved)}`
              : formatValue(field, state.resolved);

          return (
            <div
              key={field.id}
              ref={(el) => {
                rowRefs.current[field.id] = el;
              }}
              data-slot="row-popover-row"
              data-field={field.id}
              data-governed={isGoverned}
              style={rowStyle}
            >
              <span style={rowLabelStyle(isGoverned)} title={field.label}>
                {field.label}
              </span>
              <button
                type="button"
                ref={(el) => {
                  triggerRefs.current[field.id] = el;
                }}
                data-slot="row-value-trigger"
                aria-haspopup="dialog"
                aria-expanded={openFieldId === field.id}
                onClick={() => setOpenFieldId((id) => (id === field.id ? null : field.id))}
                style={rowValueButtonStyle(openFieldId === field.id)}
              >
                {state.isMixed ? (
                  <span data-slot="row-value-mixed" style={mixedTextStyle}>
                    Mixed
                  </span>
                ) : (
                  <>
                    <span aria-hidden style={valueDotStyle(state.winner)} />
                    <span data-slot="row-value-text" style={valueTextStyle(state.winner)} title={rowText}>
                      {rowText}
                    </span>
                  </>
                )}
                {paintedElsewhere !== null && (
                  <span
                    data-slot="row-painted-elsewhere"
                    aria-hidden
                    title={`Painting ${formatValue(field, paintedElsewhere as FieldValue)} — not explained by the stored layers`}
                    style={paintedDotStyle}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {openField && (
        <div
          ref={popoverRef}
          data-slot="row-popover"
          data-field={openField.id}
          role="dialog"
          aria-label={`Edit ${openField.label}`}
          style={{ ...popoverBaseStyle, ...(popoverStyle ?? { visibility: "hidden" as const }) }}
        >
          <FieldPopoverBody
            field={openField}
            subjects={subjects}
            presets={presets}
            governed={governed}
            asSubject={asSubject}
            onChange={onChange}
            onClearOverride={onClearOverride}
            onDone={() => setOpenFieldId(null)}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Popover body — the real control, plus the cascade chain             */
/* ------------------------------------------------------------------ */

interface Subject {
  id: string;
  props: Record<string, unknown>;
}

function FieldPopoverBody({
  field,
  subjects,
  presets,
  governed,
  asSubject,
  onChange,
  onClearOverride,
  onDone,
}: {
  field: FieldSpec;
  subjects: Subject[];
  presets: PanelVariantProps["presets"];
  governed: Set<string>;
  asSubject: (props: Record<string, unknown>) => Record<string, unknown>;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
  onDone: () => void;
}) {
  const isGoverned = governed.has(field.id);
  // WHY: shared field-resolution model (../fieldModel.ts) — the chain and
  // painted-elsewhere note used to require exactly one subject selected;
  // now both track the same subjects/presets/toSubject the collapsed row
  // resolved, so a multi-selection that agrees still gets a real answer.
  const row = readFieldRow(field, subjects, presets, asSubject);
  const trace: FieldTrace | null = row.trace;
  const paintedElsewhere = row.paintedElsewhere;
  // Same three-state computation the collapsed row used, so the popover
  // header can never tell a different story than the row it opened from.
  const state = fieldWinner(field, row);
  const isMixed = state.isMixed;
  const hasOwnOverride = state.winner === "override";
  const value: FieldValue | undefined = state.resolved;
  const headerTag = isGoverned
    ? state.winner === "preset" && state.presetId
      ? `driven by ${presetLabelFor(state.presetId, presets)}`
      : state.winner === "override"
        ? "overridden — would otherwise inherit from the preset"
        : "governed by preset"
    : null;

  return (
    <>
      <div style={popoverHeaderStyle}>
        <span style={popoverTitleStyle}>{field.label}</span>
        {headerTag && <span style={popoverGovernedTagStyle(state.winner)}>{headerTag}</span>}
        <div style={{ flex: 1 }} />
        <button type="button" data-slot="popover-done" onClick={onDone} style={popoverDoneStyle} aria-label="Close">
          Done
        </button>
      </div>

      {field.hint && <div style={popoverHintStyle}>{field.hint}</div>}

      <div style={popoverControlStyle}>
        <PopoverControl
          field={field}
          value={value}
          placeholder={isMixed ? "Mixed" : undefined}
          onChange={(v) => onChange(field.id, v)}
        />
      </div>

      {hasOwnOverride && (
        <button
          type="button"
          data-slot="popover-clear-override"
          onClick={() => onClearOverride(field.id)}
          style={popoverClearStyle}
        >
          ✕ clear override{subjects.length > 1 ? " (all selected)" : ""}
        </button>
      )}

      {paintedElsewhere !== null && (
        <div data-slot="popover-painted-elsewhere" style={popoverPaintedNoteStyle}>
          The component is painting <strong>{formatValue(field, paintedElsewhere as FieldValue)}</strong> —
          the stored layers below don't explain that on their own.
        </div>
      )}

      {trace ? (
        <div data-slot="popover-chain" style={chainStyle}>
          {trace.candidates.map((candidate) => (
            <div
              key={candidate.layer}
              data-slot="popover-chain-candidate"
              data-layer={candidate.layer}
              data-winner={candidate.layer === trace.winner}
              style={candidateStyle(candidate.layer === trace.winner)}
            >
              <span style={candidateDotStyle(candidate.layer === trace.winner)} />
              <span style={candidateLayerStyle}>
                {layerLabel(candidate.layer)}
                {candidate.presetId
                  ? ` · ${presets.find((p) => p.id === candidate.presetId)?.label ?? candidate.presetId}`
                  : ""}
              </span>
              <span style={candidateValueStyle}>
                {candidate.value === undefined ? "—" : formatValue(field, candidate.value as FieldValue)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={popoverHintStyle}>
          {subjects.length === 0 ? "No subject selected." : "Selected subjects don't agree on this field yet."}
        </div>
      )}
    </>
  );
}

function layerLabel(layer: Layer): string {
  return layer;
}

/* ------------------------------------------------------------------ */
/* One control per FieldKind, given the room a popover affords         */
/* ------------------------------------------------------------------ */

function PopoverControl({
  field,
  value,
  placeholder,
  onChange,
}: {
  field: FieldSpec;
  value: FieldValue | undefined;
  placeholder?: string;
  onChange: (value: FieldValue) => void;
}) {
  if (field.kind === "segments") {
    // AMENDMENT CASE A: Zach's own toolbar reference — named options in a
    // vertical menu, a tick on the active one, the option's own embedded
    // magnitude ("Small · 8px" -> "8px") right-aligned and muted. Every
    // segments field gets this shape now, not just the scale-like ones —
    // it is strictly more scannable than a wrapped button grid and was
    // the whole fix for the six-option `state` row wrapping three deep.
    // No "Custom [ ] px" row: this schema has no FieldSpec that pairs a
    // named scale with a free-numeric escape (`diameter`'s own hint says
    // this combination is deferred, docs/T1-SPEC.md §10) — inventing one
    // here would write a value the real component prop can't accept.
    return (
      <div role="listbox" aria-label={field.label} style={menuStyle}>
        {field.options?.map((option) => {
          const active = value !== undefined && String(value) === option.value;
          const [name, magnitude] = splitOptionLabel(option.label);
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              data-selected={active}
              onClick={() => onChange(option.value)}
              style={menuRowStyle(active)}
            >
              <span aria-hidden style={menuTickStyle}>
                {active ? "✓" : ""}
              </span>
              <span style={menuNameStyle}>{name}</span>
              {magnitude && <span style={menuMagnitudeStyle}>{magnitude}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.kind === "toggle") {
    return (
      <label style={toggleLabelStyle}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {value === true ? "On" : "Off"}
      </label>
    );
  }
  if (field.kind === "number") {
    const hasRange = field.min !== undefined && field.max !== undefined;
    return (
      <div style={numberControlStyle}>
        {hasRange && (
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={value === undefined ? field.min : Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            style={sliderStyle}
          />
        )}
        <input
          type="number"
          value={value === undefined ? "" : Number(value)}
          placeholder={placeholder}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? field.defaultValue : Number(e.target.value))}
          style={numberInputStyle()}
        />
        {field.unit && <span style={unitStyle}>{field.unit}</span>}
      </div>
    );
  }
  // WHY a real branch rather than letting "textarea" fall to the "text"
  // input below: see FigmaDense.tsx's identical comment — a single-line
  // `<input>` silently strips a committed multi-line value's newline the
  // next time this popover touches the field.
  if (field.kind === "textarea") {
    return (
      <textarea
        rows={1}
        value={value === undefined ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...textInputStyle, resize: "none", fontFamily: "inherit", ...({ fieldSizing: "content" } as CSSProperties) }}
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
      style={textInputStyle}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Value formatting for the one-line row and the chain                 */
/* ------------------------------------------------------------------ */

function formatValue(field: FieldSpec, value: FieldValue | undefined): string {
  if (value === undefined) return "—";
  if (field.kind === "segments") {
    const option = field.options?.find((o) => o.value === String(value));
    return option ? option.label : String(value);
  }
  if (field.kind === "toggle") return value === true ? "On" : "Off";
  if (field.kind === "number") return field.unit ? `${value}${field.unit}` : String(value);
  return value === "" ? "(empty)" : String(value);
}

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
  position: "relative",
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "var(--bbox-panel-fg-muted, #666)" };

const presetSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  background: "var(--bbox-panel-override-bg, #f5f3ff)",
  border: "1px solid var(--bbox-panel-override-ring, #ddd6fe)",
  borderRadius: 6,
};
const presetLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--bbox-panel-override, #6d28d9)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const presetRowStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
const mixedNoteStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-warn, #b45309)" };

// AMENDMENT point 3 — the preset row's own "modified" report: a tinted
// tag plus one reset, not a per-field diff list. Amber matches the same
// Mixed vocabulary already used elsewhere ("something doesn't simply
// equal the preset anymore") — kept distinct from the blue "driven"
// colour and the purple "stored" one used everywhere else in this file.
const presetModifiedRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginTop: 2 };
const presetModifiedTagStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--bbox-panel-warn, #b45309)",
  background: "var(--bbox-panel-warn-bg, #fef3c7)",
  borderRadius: 4,
  padding: "2px 7px",
};
const presetModifiedResetStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-override, #6d28d9)",
  background: "none",
  border: "1px solid var(--bbox-panel-override-ring, #c4b5fd)",
  borderRadius: 4,
  padding: "2px 7px",
  cursor: "pointer",
};

function presetButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: selected ? "1px solid var(--bbox-panel-override, #6d28d9)" : "1px solid var(--bbox-panel-override-ring, #c4b5fd)",
    background: selected ? "var(--bbox-panel-override, #6d28d9)" : "var(--bbox-panel-surface, white)",
    color: selected ? "var(--bbox-panel-surface, white)" : "var(--bbox-panel-override, #6d28d9)",
    cursor: "pointer",
  };
}

const rowListStyle: CSSProperties = { display: "flex", flexDirection: "column" };

// Fixed height, no wrap, no exceptions — this row is the whole point of
// the variant. A field with six segment options and a field with one text
// box cost the same vertical inch.
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: ROW_HEIGHT,
  borderBottom: "1px solid var(--bbox-panel-border-soft, #eee)",
};

function rowLabelStyle(governed: boolean): CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 500,
    color: governed ? "var(--bbox-panel-fg-faint, #888)" : "var(--bbox-panel-fg, #111)",
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function rowValueButtonStyle(open: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 5,
    maxWidth: 168,
    flex: "0 0 auto",
    border: `1px solid ${open ? "var(--bbox-panel-override, #6d28d9)" : "transparent"}`,
    background: open ? "var(--bbox-panel-override-bg, #f5f3ff)" : "transparent",
    borderRadius: 5,
    padding: "3px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// The three-state mark: filled purple = this instance's own stored value,
// filled blue = a preset is driving it, hollow grey = neither — the
// component default. One dot, no badge row, per the amendment's "costs
// almost no space" instruction.
function valueDotStyle(winner: Layer | null): CSSProperties {
  const fill = winner === "override" ? "var(--bbox-panel-override, #6d28d9)" : winner === "preset" ? "var(--bbox-panel-preset, #1d4ed8)" : "transparent";
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
    background: fill,
    border: winner === "override" || winner === "preset" ? "none" : "1px solid var(--bbox-panel-fg-faint, #bbb)",
  };
}

function valueTextStyle(winner: Layer | null): CSSProperties {
  const color = winner === "override" ? "var(--bbox-panel-fg, #111)" : winner === "preset" ? "var(--bbox-panel-preset, #1d4ed8)" : "var(--bbox-panel-fg-muted, #777)";
  return {
    fontSize: 12.5,
    fontWeight: winner === "override" ? 600 : 400,
    color,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  };
}

const mixedTextStyle: CSSProperties = {
  fontSize: 12.5,
  fontStyle: "italic",
  color: "var(--bbox-panel-warn, #b45309)",
};

// A quiet dot, not a sentence — the row has no room for prose. The real
// explanation lives in the popover's own note (popoverPaintedNoteStyle);
// this is the "say so" the collapsed row can afford, with the exact
// painted value in its native `title` tooltip.
const paintedDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--bbox-panel-warn-soft, #f59e0b)",
  flexShrink: 0,
};

const popoverBaseStyle: CSSProperties = {
  zIndex: 1000,
  background: "var(--bbox-panel-surface, white)",
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "sans-serif",
};

const popoverHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const popoverTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--bbox-panel-fg, #111)" };
function popoverGovernedTagStyle(winner: Layer | null): CSSProperties {
  const palette = winner === "override" ? { fg: "var(--bbox-panel-warn, #b45309)", bg: "var(--bbox-panel-warn-bg, #fef3c7)" } : { fg: "var(--bbox-panel-preset, #1d4ed8)", bg: "var(--bbox-panel-preset-bg, #dbeafe)" };
  return {
    fontSize: 10,
    color: palette.fg,
    background: palette.bg,
    borderRadius: 4,
    padding: "1px 6px",
  };
}
const popoverDoneStyle: CSSProperties = {
  fontSize: 11,
  border: "1px solid var(--bbox-panel-border, #ccc)",
  background: "var(--bbox-panel-surface, white)",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
};
const popoverHintStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-faint, #888)", lineHeight: 1.4 };
const popoverControlStyle: CSSProperties = { padding: "2px 0" };

const popoverClearStyle: CSSProperties = {
  alignSelf: "flex-start",
  fontSize: 11,
  color: "var(--bbox-panel-danger, #b91c1c)",
  background: "none",
  border: "1px solid var(--bbox-panel-danger-ring, #fca5a5)",
  borderRadius: 4,
  padding: "2px 7px",
  cursor: "pointer",
};

const popoverPaintedNoteStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--bbox-panel-warn, #92400e)",
  background: "var(--bbox-panel-warn-bg, #fffbeb)",
  border: "1px solid var(--bbox-panel-warn-ring, #fde68a)",
  borderRadius: 4,
  padding: "5px 7px",
  lineHeight: 1.4,
};

const chainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "6px 8px",
  background: "var(--bbox-panel-surface-2, #fafafa)",
  borderRadius: 4,
  border: "1px solid var(--bbox-panel-border-soft, #eee)",
};

function candidateStyle(winner: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
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
const candidateLayerStyle: CSSProperties = { width: 110, flexShrink: 0 };
const candidateValueStyle: CSSProperties = { fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" };

// A named option's label is authored as "Name · magnitude" wherever a real
// scalar sits behind it (diameter's "Small · 8px", textSize's "Small ·
// 18px" — see port.fields.ts). Split it so the menu can put the magnitude
// in its own muted, right-aligned column; a plain enum label (no " · ")
// just renders as the name with nothing in that column.
function splitOptionLabel(label: string): [string, string | null] {
  const separator = " · ";
  const at = label.indexOf(separator);
  if (at === -1) return [label, null];
  return [label.slice(0, at), label.slice(at + separator.length)];
}

const menuStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--bbox-panel-border-soft, #eee)",
  borderRadius: 6,
  overflow: "hidden",
};

function menuRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 10px",
    border: "none",
    borderBottom: "1px solid var(--bbox-panel-surface-2, #f2f2f2)",
    background: active ? "var(--bbox-panel-override-bg, #f5f3ff)" : "var(--bbox-panel-surface, white)",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  };
}

const menuTickStyle: CSSProperties = { width: 14, fontSize: 12, color: "var(--bbox-panel-override, #6d28d9)", flexShrink: 0 };
const menuNameStyle: CSSProperties = { flex: 1, fontSize: 12.5, color: "var(--bbox-panel-fg, #111)" };
const menuMagnitudeStyle: CSSProperties = { fontSize: 11.5, color: "var(--bbox-panel-fg-faint, #888)", fontFamily: "monospace", flexShrink: 0 };

const toggleLabelStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--bbox-panel-fg, #111)" };

const numberControlStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const sliderStyle: CSSProperties = { flex: 1, minWidth: 100 };
const unitStyle: CSSProperties = { fontSize: 11, color: "var(--bbox-panel-fg-faint, #888)" };

function numberInputStyle(): CSSProperties {
  return { width: 64, padding: "4px 6px", border: "1px solid var(--bbox-panel-border, #ccc)", borderRadius: 4, fontSize: 12.5, color: "var(--bbox-panel-fg, #111)" };
}

const textInputStyle: CSSProperties = {
  width: "100%",
  padding: "5px 7px",
  border: "1px solid var(--bbox-panel-border, #ccc)",
  borderRadius: 4,
  fontSize: 12.5,
  color: "var(--bbox-panel-fg, #111)",
};

/* ------------------------------------------------------------------ */

export const ROW_POPOVER: PanelVariant = {
  id: "row-popover",
  label: "Row + Popover",
  blurb:
    "One fixed-height row per field, always — a six-option segmented control and a bare toggle cost the same inch. " +
    "A governed row reads name and value together, 'Wired · primary', no expansion needed; the preset row itself " +
    "says 'modified' the moment an override drifts from it. Click a value to open its real control — a named " +
    "menu with a tick, the cascade chain, clear-override — in a popover anchored to the row; the list itself never " +
    "grows. Buys height, spends a click: reading is free, changing a value costs one extra click versus inline.",
  Panel: RowPopoverPanel,
};
