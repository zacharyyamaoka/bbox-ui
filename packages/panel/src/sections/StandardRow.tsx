import { useState, type CSSProperties } from "react";
import type { FieldSpec } from "@bbox-ui/schema";
import {
  DenseControl,
  LABEL_WIDTH,
  ResetOverrideButton,
  RowLabel,
  TraceChain,
  readRow,
} from "../variants/FigmaDense";
import type { BoundField, StandardControl } from "./contract";

/**
 * One property row, for every section design.
 *
 * WHY this file is a shell over `variants/FigmaDense` and not a port of it
 * — round 1 got this wrong and the rebase is what exposed it. Round 1
 * copied FigmaDense's row "by value" into a 835-line standalone renderer.
 * Between then and now Zach changed how a row states its provenance on
 * `main`: the coloured DOT became a plain-word OVERRIDE / MIXED tag beside
 * the label, and the row's "×" became lucide's ↺ reset
 * (`FigmaDense.tsx`'s `RowLabel`, 2026-09-11, plus `0405eaf`). The copy
 * kept the dot and the ×. A copy does not receive its donor's corrections;
 * that is the entire failure mode, and this repo has paid for it before —
 * "six files, four answers" on the resolution model, `tierButtonStyle` in
 * three places with two of them fixed.
 *
 * So the row is not ported. `RowLabel`, `DenseControl`, `TraceChain` and
 * `readRow` are imported from the file Zach's own header calls "the chosen
 * design", and this module only adds what a SECTION needs on top of them:
 *
 *   - a foreign write target (`BoundField.targetId` — a Bar's `hidden`
 *     rendered inside the Block's Header section writes the Bar),
 *   - `disabled` for a row the model owns (a host fact with no handles),
 *   - `note`, the one quiet line that says who writes it,
 *   - `data-standard-control`, the attribute the browser journey uses to
 *     prove no control was hand-drawn beside the engine.
 */

export type RowGeometry = "label-left" | "label-above";

export { LABEL_WIDTH };

/**
 * Which of `STANDARD_CONTROLS` a field resolves to. Mirrors `DenseControl`'s
 * own branching exactly — the segmented/dropdown split is a WIDTH decision
 * (a strip wider than the control column wraps), so it is measured in
 * characters there and has to be measured the same way here.
 */
export function controlKindFor(field: FieldSpec): StandardControl {
  if (field.kind === "segments") {
    const options = field.options ?? [];
    const stripWidth = options.reduce((n, o) => n + o.label.length + 2, 0);
    return options.length <= 3 && stripWidth <= 26 ? "segmented" : "dropdown";
  }
  if (field.kind === "toggle") return "toggle";
  if (field.kind === "number") return "number";
  return "text";
}

export function StandardRow({ bound, geometry = "label-left" }: { bound: BoundField; geometry?: RowGeometry }) {
  const [expanded, setExpanded] = useState(false);
  const { field } = bound;
  const data = readRow(field, bound.subjects, bound.presets, bound.toSubject);
  const governed = bound.governed.has(field.id);
  const showProvenance = bound.provenance !== "none";
  // WHY this row ANDs `showProvenance` on top of the shared `canReset` and
  // the others do not: a host fact (`provenance: "none"`) has exactly one
  // layer, so "reset to what it was" is not a question the canvas's X can be
  // asked. Every other condition is the model's, not this file's.
  const clearable = showProvenance && data.canReset;

  const label = (
    <RowLabel
      field={field}
      data={data}
      governed={governed}
      expanded={expanded}
      setExpanded={setExpanded}
      onChange={bound.onChange}
      compact={geometry === "label-above"}
      disabled={bound.disabled}
      showProvenance={showProvenance}
    />
  );

  const control = (
    <div style={controlCellStyle}>
      <div data-standard-control={controlKindFor(field)} style={controlSlotStyle}>
        <DenseControl
          field={field}
          value={data.collapsedValue}
          isMixed={data.isMixed}
          secondary={governed}
          presets={bound.presets}
          drivenPresetId={data.drivenPresetId}
          disabled={bound.disabled}
          onChange={(value) => bound.onChange(field.id, value)}
        />
      </div>
      {clearable && !bound.disabled && (
        <ResetOverrideButton data={data} fieldLabel={field.label} onReset={() => bound.onClearOverride(field.id)} />
      )}
    </div>
  );

  return (
    <div
      data-slot="standard-row"
      data-field={field.id}
      data-target={bound.targetId}
      data-governed={governed}
      data-disabled={bound.disabled || undefined}
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
      {expanded && showProvenance && data.trace && <TraceChain trace={data.trace} presets={bound.presets} />}
    </div>
  );
}

/**
 * Two fields that declare the same `group`, side by side — Zach's pick 4:
 * "we can support stacked labels. we do this already though via the group
 * in the schema, which allows you to put multiple on the same row." Nothing
 * new is built for it here; `groupRows` (main, `fieldGroups.ts`) does the
 * pairing before this ever runs, and this is only where a pair lands.
 */
export function StandardPair({ fields }: { fields: [BoundField, BoundField] }) {
  return (
    <div data-slot="standard-pair" style={pairWrapStyle}>
      {fields.map((bound) => (
        <div key={bound.field.id} style={pairCellStyle}>
          {/* A pair ALWAYS stacks its label: two label-left rows on one line
              would spend 304 of ~400px on captions. */}
          <StandardRow bound={bound} geometry="label-above" />
        </div>
      ))}
    </div>
  );
}

const rowWrapStyle: CSSProperties = { padding: "1px 0" };
const rowAboveStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, padding: "1px 0", minWidth: 0 };
const rowGridStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 22 };
const controlCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };
const controlSlotStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };
const pairWrapStyle: CSSProperties = { display: "flex", gap: 10, padding: "1px 0" };
const pairCellStyle: CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 };
function noteStyle(geometry: RowGeometry): CSSProperties {
  return {
    fontSize: 9,
    color: "var(--bbox-panel-fg-faint, #999)",
    // Under the CONTROL column, not the label — the note says who writes
    // the value, so it belongs under the value. `overflowWrap` rather than
    // an ellipsis: "tldraw writes this wh…" is not a sentence.
    paddingLeft: geometry === "label-above" ? 0 : LABEL_WIDTH + 6,
    minWidth: 0,
    overflowWrap: "anywhere",
    lineHeight: 1.35,
  };
}
