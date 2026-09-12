/**
 * packages/bbox-ui/src/bar.presets.ts
 *
 * The line of a Bar is painted by the same state ladder a Pill's ring is:
 * `state` selects a preset governing `lineStyle` and `lineColor`. Rather
 * than a second paint table, the presets are Pill's own, narrowed to the
 * two line fields — one ladder, two components, no drift.
 */
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";

import { PILL_PAINT_FIELDS } from "./pill.fields";
import { PILL_PRESETS } from "./pill.presets";

const LINE_GOVERNS = ["lineStyle", "lineColor"];

export const BAR_PRESETS: PresetSpec[] = PILL_PRESETS.map((preset) => ({
  ...preset,
  governs: LINE_GOVERNS,
  values: Object.fromEntries(LINE_GOVERNS.map((id) => [id, preset.values[id]])),
}));

/** Pill's four line rows — style, colour, thickness, opacity — reused verbatim. */
export const BAR_LINE_FIELDS: FieldSpec[] = PILL_PAINT_FIELDS.filter((f) => f.id.startsWith("line"));

export const BAR_LINE_FIELD_BY_ID = Object.fromEntries(BAR_LINE_FIELDS.map((f) => [f.id, f])) as Record<
  "lineStyle" | "lineColor" | "lineThickness" | "lineOpacity",
  FieldSpec
>;
