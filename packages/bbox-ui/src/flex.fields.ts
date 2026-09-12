/**
 * packages/bbox-ui/src/flex.fields.ts
 *
 * `Flex`'s controllable props as data — every `id` is a real `FlexProps`
 * key, every default mirrors `./flex.tsx`; `test/flex.fields.test.ts`
 * pins the two together. `FLEX_PRESETS` is empty: Flex paints nothing, so
 * there is no semantic ladder for a preset to govern.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import { FLEX_ALIGN_VALUES, FLEX_DIRECTIONS, FLEX_JUSTIFY_VALUES, FLEX_SIZES, type FlexAlign, type FlexDirection, type FlexJustify, type FlexSize } from "./flex";

const DIRECTION_LABELS: Record<FlexDirection, string> = { row: "Row", column: "Column" };
const JUSTIFY_LABELS: Record<FlexJustify, string> = {
  start: "Start",
  center: "Center",
  end: "End",
  between: "Between",
  around: "Around",
  evenly: "Evenly",
};
const ALIGN_LABELS: Record<FlexAlign, string> = { start: "Start", center: "Center", end: "End", stretch: "Stretch" };

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>): FieldOption[] =>
  values.map((value) => ({ value, label: labels[value] }));

const SIZE_LABELS: Record<FlexSize, string> = { sm: "Small", md: "Medium", lg: "Large", xl: "Extra Large" };

export const FLEX_FIELDS: FieldSpec[] = [
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "md",
    options: opts(FLEX_SIZES, SIZE_LABELS),
    cascades: true,
    hint: "Relayed to the members; the Flex itself paints nothing at any size.",
  },
  { id: "direction", label: "Direction", kind: "segments", defaultValue: "row", options: opts(FLEX_DIRECTIONS, DIRECTION_LABELS) },
  {
    id: "justify",
    label: "Justify",
    kind: "segments",
    defaultValue: "start",
    options: opts(FLEX_JUSTIFY_VALUES, JUSTIFY_LABELS),
    hint: "Along the direction. Between/Around/Evenly are CSS's three spacing schemes — the dnd-kit lab's edge-to-edge, around, and including-edge.",
  },
  { id: "align", label: "Align", kind: "segments", defaultValue: "center", options: opts(FLEX_ALIGN_VALUES, ALIGN_LABELS), hint: "Across the direction." },
  { id: "gap", label: "Gap", kind: "number", defaultValue: 8, min: 0, max: 48, unit: "px", group: "spacing" },
  { id: "padding", label: "Padding", kind: "number", defaultValue: 0, min: 0, max: 48, unit: "px", group: "spacing" },
  { id: "wrap", label: "Wrap", kind: "toggle", defaultValue: false },
];

export const FLEX_PRESETS: PresetSpec[] = [];
