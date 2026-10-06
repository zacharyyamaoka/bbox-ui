/**
 * packages/bbox-ui/src/trace.fields.ts
 *
 * `Trace`'s controllable props as data — mirrors `port.fields.ts` /
 * `pill.fields.ts`'s own pattern: a flat `FieldSpec[]`, real component prop
 * ids, no separate mapping table.
 *
 * DEVIATION from an earlier proposal draft
 * (`reports/trace-edge-primitive-proposal-2026-09-14.html`): that sketch
 * modelled `strokeColor` as governed by a `variant`-selected preset family
 * (mirroring Pill's `state` → `PILL_PRESETS`). Implementing it surfaced
 * that the preset had no real donor behind it — SystemSketch's own cable
 * colour comes from a connection's semantic role, a completely different
 * axis from its temporal kind (`data`/`async`/`delayed`), so a
 * variant-keyed colour preset would have been invented, not ported.
 * `variant` here governs dash MECHANICS only (`traceStrokeStyle`, in
 * `trace.tsx`); `strokeColor` is a plain, ungoverned field — same
 * footing as Pill's own `lineThickness`/`lineOpacity` — with `tone` as
 * the sole override escape hatch, exactly Pill's real mechanism minus the
 * preset layer neither has a motivated use for here.
 */
import type { FieldOption, FieldSpec } from "./schema";
import { LENS_FIELD, TONE_FIELD } from "./appearance.fields";
import { PAINT_TOKENS } from "./pill.fields";
import {
  LABEL_POSITION_DEFAULT,
  LABEL_POSITION_MAX,
  LABEL_POSITION_MIN,
  TRACE_VARIANT_LABELS,
  TRACE_VARIANTS,
} from "./trace.layout";

const VARIANT_OPTIONS: FieldOption[] = TRACE_VARIANTS.map((variant) => ({
  value: variant,
  label: TRACE_VARIANT_LABELS[variant],
}));

const STROKE_COLOR_OPTIONS: FieldOption[] = PAINT_TOKENS.map((token) => ({
  value: token,
  label: token,
}));

export const TRACE_MARKER_ENDS = ["arrow", "none"] as const;
export type TraceMarkerEnd = (typeof TRACE_MARKER_ENDS)[number];
const MARKER_END_OPTIONS: FieldOption[] = TRACE_MARKER_ENDS.map((value) => ({
  value,
  label: value === "arrow" ? "Arrow" : "None",
}));

export const VARIANT_FIELD: FieldSpec = {
  id: "variant",
  label: "Variant",
  kind: "segments",
  defaultValue: "data",
  options: VARIANT_OPTIONS,
  hint: "Dash mechanics only (traceStrokeStyle) — never colour. See this file's own deviation note.",
};

export const STROKE_COLOR_FIELD: FieldSpec = {
  id: "strokeColor",
  label: "Stroke Color",
  kind: "segments",
  defaultValue: "foreground",
  options: STROKE_COLOR_OPTIONS,
  hint: "Ungoverned — always freely editable, same footing as Pill's lineThickness/lineOpacity. `tone` overrides it when set.",
};

export const ANIMATED_FIELD: FieldSpec = {
  id: "animated",
  label: "Animated",
  kind: "toggle",
  defaultValue: false,
  hint: "Marching-ants, `variant:\"data\"` only. Opt-in — on-by-default proved too loud (2026-09-14 lesson).",
};

export const SPLIT_AT_LABEL_FIELD: FieldSpec = {
  id: "splitAtLabel",
  label: "Split At Label",
  kind: "toggle",
  defaultValue: false,
  hint: '`variant:"delayed"` only — dotted end-to-end (false, SystemSketch\'s own default) vs solid-before/dotted-after `labelPosition`.',
};

export const LABEL_POSITION_FIELD: FieldSpec = {
  id: "labelPosition",
  label: "Label Position",
  kind: "number",
  defaultValue: LABEL_POSITION_DEFAULT,
  min: LABEL_POSITION_MIN,
  max: LABEL_POSITION_MAX,
  step: 0.01,
  hint: "Clamped off the terminals (0.05..0.95, SystemSketch's own PILL_POSITION_MIN/MAX) — a label on top of a port reads as part of it.",
};

export const MARKER_END_FIELD: FieldSpec = {
  id: "markerEnd",
  label: "Marker End",
  kind: "segments",
  defaultValue: "arrow",
  options: MARKER_END_OPTIONS,
};

export const TRACE_FIELDS: FieldSpec[] = [
  VARIANT_FIELD,
  STROKE_COLOR_FIELD,
  TONE_FIELD,
  LENS_FIELD,
  ANIMATED_FIELD,
  SPLIT_AT_LABEL_FIELD,
  LABEL_POSITION_FIELD,
  MARKER_END_FIELD,
];
