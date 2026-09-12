import { useState, type CSSProperties } from "react";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import type { Subject } from "./fieldModel";
import { NumberInput } from "./NumberInput";
import { readRow, RowLabel, TraceChain, type RowData } from "./variants/FigmaDense";

/**
 * packages/panel/src/HostFactsSection.tsx
 *
 * FROZEN API between the glyph-finish lanes (docs/GLYPH-PLAN.md's
 * "Renderer · tldraw / React Flow / DOM" inspector section) — lane A
 * (this file) implements it, lane B (the create page's three viewports)
 * mounts one instance per render surface underneath the component's own
 * Properties panel. Never rename `HostFactsSectionProps`' fields; the
 * create page depends on this shape exactly as declared.
 *
 * WHY a second, separate section rather than folding `HOST_FIELDS` into
 * the ordinary field list: these rows answer "what does the CANVAS own?",
 * not "what does the component own?" — x/y/rotation are written by a
 * drag or a rotate handle, never by this component's own state, and
 * `w`/`h` are never written by anyone, anywhere (always derived). Mixing
 * them into `ComponentInspector`/`FigmaDense`'s own field list would make
 * every component's panel lie about which layer a row actually edits.
 *
 * WHY the label cell is `FigmaDense`'s own `RowLabel`/`readRow`/
 * `TraceChain` (exported from there), not a second copy: those three
 * pieces are what give a row drag-to-scrub and a provenance dot with a
 * click-to-expand cascade — an earlier version of this file hand-rolled
 * the row and had neither, which also put it outside the two structural
 * gates (`oneModel.test.ts`, `fieldKindCoverage.test.ts`) that exist so a
 * SECOND resolution model can't quietly grow a defect the first one
 * already fixed. `presets` is always `[]` here — a host fact is never
 * preset-governed — so every row's only two candidate layers are
 * "override" (whatever the host currently reports) and "default", and
 * `RowLabel`'s new `disabled` param (added by this lane) stops a drag on
 * a read-only or non-editable row's label from writing a value the same
 * way `field.readOnly`/`editable` already stop the control from doing.
 *
 * WHY the control cell is one plain `NumberInput` for BOTH the Mixed and
 * the single-value case, not a hand-rolled second component switched in
 * for Mixed: an earlier version of this file rendered `<MixedNumberBox>`
 * when `isMixed` and `<NumberInput>` otherwise — two different component
 * TYPES on the same row — so the instant the selection agreed (the first
 * keystroke that made every instance's value equal), React unmounted one
 * and mounted the other mid-keystroke, dropping focus and the rest of
 * what was typed (glyph-finish audit round 2: typing "42" into a Mixed x
 * landed "4"). One component now handles both: `NumberInput`'s own
 * `commitDefaultOnBlur={false}` (passed below) is what makes it safe for
 * a host fact either way — HOST_FIELDS' `defaultValue: 0` for x/y/rotation
 * is a placeholder, not a position, so an emptied-and-blurred box must
 * never commit it. Mixed, there is no value to revert to either, so it
 * just goes back to empty; single-selection, it reverts to the value that
 * was actually there. Neither case ever auto-commits a value the person
 * did not type.
 */
export interface HostFactsSectionProps {
  /** "tldraw" | "React Flow" | "DOM" — which render surface this section
   *  describes, for the section header. */
  renderLabel: string;
  /** `HOST_FIELDS` — x, y, rotation, w, h — but declared as the general
   *  `FieldSpec[]` shape everything else in this package already is. */
  fields: FieldSpec[];
  /** One per selected instance. Same shape every other panel reads. */
  subjects: Subject[];
  onChange(fieldId: string, value: FieldValue): void;
  /** `false` on the DOM render: there is no canvas to drag or rotate on,
   *  so every row renders disabled regardless of `field.readOnly`. */
  editable: boolean;
  /** Per field, who writes it — shown as this row's own hint, e.g.
   *  `{ x: "tldraw writes this when you drag" }`. */
  writers?: Partial<Record<string, string>>;
}

/** The exact note the frozen API's own doc comment names for a
 *  non-editable render surface. Not templated per `renderLabel`: every
 *  render surface this section has ever been asked to describe that sets
 *  `editable: false` is the DOM one, and this is its fixed copy. */
const NO_HANDLES_NOTE = "No handles here — the DOM render has no canvas.";

export function HostFactsSection({
  renderLabel,
  fields,
  subjects,
  onChange,
  editable,
  writers,
}: HostFactsSectionProps) {
  return (
    <div data-slot="host-facts-section" data-editable={editable} style={sectionStyle}>
      <div data-slot="host-facts-header" style={headerStyle}>
        Renderer · {renderLabel}
      </div>
      <p data-slot="host-facts-hint" style={hintStyle}>
        What the render surface owns. Properties above are the component's; these are the canvas's.
      </p>
      {!editable && (
        <p data-slot="host-facts-no-handles" style={noHandlesStyle}>
          {NO_HANDLES_NOTE}
        </p>
      )}
      <div style={rowListStyle}>
        {fields.map((field) => (
          <HostFactRow
            key={field.id}
            field={field}
            subjects={subjects}
            editable={editable}
            writer={writers?.[field.id]}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function HostFactRow({
  field,
  subjects,
  editable,
  writer,
  onChange,
}: {
  field: FieldSpec;
  subjects: Subject[];
  editable: boolean;
  writer: string | undefined;
  onChange: (fieldId: string, value: FieldValue) => void;
}) {
  // HOST_FIELDS is x/y/rotation/w/h, every one `kind: "number"` — a loud
  // failure here beats a silent one: without this, a future host fact of
  // any other kind would paint as a number spinner and, on an emptied
  // box, commit `Number(field.defaultValue)` — a boolean or string field
  // stored as a coerced number — because nothing below branches on kind.
  if (field.kind !== "number") {
    throw new Error(
      `HostFactsSection: field "${field.id}" has kind "${field.kind}" — every HOST_FIELDS entry must be "number"; ` +
        "a non-number host fact needs its own control branch here before it can render.",
    );
  }

  const [expanded, setExpanded] = useState(false);
  // WHY `!editable` is checked ahead of `field.readOnly`, not merged into
  // one flag some other way: they are different facts with the same
  // rendering — `readOnly` says a FIELD is never edited anywhere
  // (`w`/`h`), `!editable` says THIS RENDER SURFACE has no handles at all
  // (the DOM row). Either one alone must disable the control.
  const disabled = !editable || field.readOnly === true;
  const data: RowData = readRow(field, subjects, [], undefined);
  const { isMixed, collapsedValue, trace } = data;
  const numericValue = typeof collapsedValue === "number" ? collapsedValue : undefined;
  // The visible reason for this row, distinct from `field.hint`'s tooltip
  // on the label: a writer ("tldraw writes this when you drag") when the
  // host supplied one, else the field's own hint (w/h's "Derived from the
  // component; read-only here.") — the fallback the original version of
  // this file computed but never actually rendered, so Width/Height sat
  // greyed out with no on-screen reason on the lane's own headline case
  // (a Glyph selection, where `writers.w`/`writers.h` are never set).
  const hint = writer ?? field.hint;
  const subjectsKey = subjects.map((s) => s.id).join(",");

  return (
    <div data-slot="host-fact-row" data-field={field.id} data-disabled={disabled} style={rowWrapStyle}>
      <div style={rowGridStyle}>
        <RowLabel
          field={field}
          data={data}
          governed={false}
          expanded={expanded}
          setExpanded={setExpanded}
          onChange={onChange}
          disabled={disabled}
        />
        <div style={controlCellStyle}>
          {disabled ? (
            <div style={numberBoxStyle}>
              <input
                type="text"
                disabled
                readOnly
                data-slot="host-fact-input"
                value={isMixed ? "Mixed" : String(numericValue ?? field.defaultValue)}
                style={disabledInputStyle}
              />
              {field.unit && <span style={unitStyle}>{field.unit}</span>}
            </div>
          ) : (
            <div style={numberBoxStyle}>
              <NumberInput
                key={subjectsKey}
                data-slot="host-fact-input"
                value={numericValue}
                defaultValue={Number(field.defaultValue)}
                commitDefaultOnBlur={false}
                placeholder={isMixed ? "Mixed" : undefined}
                min={field.min}
                max={field.max}
                step={field.step}
                onCommit={(value) => onChange(field.id, value)}
                style={numberInputStyle}
              />
              {field.unit && <span style={unitStyle}>{field.unit}</span>}
            </div>
          )}
        </div>
      </div>
      {hint && (
        <div data-slot="host-fact-writer" style={writerRowStyle}>
          {hint}
        </div>
      )}
      {expanded && trace && <TraceChain trace={trace} presets={[]} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles — plain inline objects, same token names every other row in  */
/* this package already uses, no new dependency                       */
/* ------------------------------------------------------------------ */

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--bbox-panel-border-soft, #e7e7ec)",
};
const headerStyle: CSSProperties = { fontWeight: 600, fontSize: 11, color: "var(--bbox-panel-fg, #111)" };
const hintStyle: CSSProperties = { margin: 0, fontSize: 10, color: "var(--bbox-panel-fg-muted, #6a6a75)", lineHeight: 1.4 };
const noHandlesStyle: CSSProperties = {
  margin: 0,
  // WHY: the column is 22rem and this sentence is longer than that at 10px;
  // without a wrap rule its right border ran past the inspector gutter.
  minWidth: 0,
  overflowWrap: "anywhere",
  fontSize: 10,
  color: "var(--bbox-panel-warn, #8a5a12)",
  background: "var(--bbox-panel-warn-bg, #fdf6ec)",
  border: "1px solid var(--bbox-panel-warn-ring, #f0e2cc)",
  borderRadius: 4,
  padding: "3px 8px",
};
const rowListStyle: CSSProperties = { display: "flex", flexDirection: "column" };
// Same LABEL_WIDTH FigmaDense's own row uses — `RowLabel` sizes its label
// cell to that constant internally, so the writer line below aligns under
// the control column exactly the way FigmaDense's own "painting …" note
// does under ITS control column.
const LABEL_WIDTH = 96;
const rowWrapStyle: CSSProperties = { padding: "2px 0" };
const rowGridStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 22 };
const controlCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };
const numberBoxStyle: CSSProperties = { display: "flex", alignItems: "center", flex: 1, minWidth: 0, height: 22, borderRadius: 4, border: "1px solid var(--bbox-panel-border, #ddd)", background: "var(--bbox-panel-surface, white)", padding: "0 2px 0 6px" };
const numberInputStyle: CSSProperties = { flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 11, padding: "0 2px", background: "transparent" };
const disabledInputStyle: CSSProperties = { flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 11, padding: "0 2px", background: "transparent", color: "var(--bbox-panel-fg-faint, #999)", cursor: "not-allowed" };
const unitStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #999)", flexShrink: 0, paddingRight: 4 };
// WHY no `whiteSpace: nowrap` / `textOverflow: ellipsis` here, unlike the
// label above it: this line exists solely to say who writes the row, and
// a fixed-width clamp made it unreadable at any panel width — "tldraw
// writes this wh…" — for every writer string long enough to matter.
// Wrapping to a second line costs a little height; clipping the sentence
// that is the row's whole point costs the sentence.
const writerRowStyle: CSSProperties = {
  fontSize: 9,
  color: "var(--bbox-panel-fg-faint, #999)",
  paddingLeft: LABEL_WIDTH + 6,
  lineHeight: 1.3,
};
