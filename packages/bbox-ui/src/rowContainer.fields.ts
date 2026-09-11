/**
 * packages/bbox-ui/src/rowContainer.fields.ts
 *
 * `RowContainer`'s controllable props as data — every `id` below is a
 * REAL `RowContainerProps` key (see `./rowContainer`); `readFields`/
 * `toArgTypes` look subjects up by that key directly. Every enum and
 * default mirrors `./rowContainer` — this file adds no new vocabulary.
 *
 * No `<NAME>_PRESETS` entries: RowContainer paints nothing of its own
 * (T1-SPEC.md §4.4), so the array below is exported empty — same
 * pattern every component follows, so a consumer (`governedFieldIds`,
 * the generic story generator, the generic inspector) can always
 * `.map()` over it without a null check.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import {
  READING_DIRECTIONS,
  ROW_ALIGN_VALUES,
  ROW_JUSTIFY_VALUES,
  type ReadingDirection,
  type RowAlign,
  type RowJustify,
} from "./rowContainer";

const READING_DIRECTION_LABELS: Record<ReadingDirection, string> = {
  ltr: "LTR",
  rtl: "RTL",
};

const JUSTIFY_LABELS: Record<RowJustify, string> = {
  start: "Start",
  center: "Center",
  end: "End",
  between: "Between",
};

const ALIGN_LABELS: Record<RowAlign, string> = {
  top: "Top",
  middle: "Middle",
  bottom: "Bottom",
};

const READING_DIRECTION_OPTIONS: FieldOption[] = READING_DIRECTIONS.map((direction) => ({
  value: direction,
  label: READING_DIRECTION_LABELS[direction],
}));

const JUSTIFY_OPTIONS: FieldOption[] = ROW_JUSTIFY_VALUES.map((justify) => ({
  value: justify,
  label: JUSTIFY_LABELS[justify],
}));

const ALIGN_OPTIONS: FieldOption[] = ROW_ALIGN_VALUES.map((align) => ({
  value: align,
  label: ALIGN_LABELS[align],
}));

/**
 * `RowContainer`'s five controllable props, in the order a panel should
 * draw them. Every `defaultValue` equals that prop's real default in
 * `rowContainer.tsx` — `test/rowContainer.fields.test.ts` pins this so
 * the two files cannot drift.
 *
 * `children` is deliberately absent: it is structural (an ordered
 * `ReactNode[]`), not a `FieldValue` — composed by hand in stories/hosts,
 * exactly `Port`'s own multi-instance galleries already do (T1-SPEC.md
 * §4.4).
 */
export const ROW_CONTAINER_FIELDS: FieldSpec[] = [
  {
    id: "readingDirection",
    label: "Reading Direction",
    kind: "segments",
    defaultValue: "ltr",
    options: READING_DIRECTION_OPTIONS,
    hint: "Flips CSS flex-direction only — never reorders the DOM.",
  },
  {
    id: "justify",
    label: "Justify",
    kind: "segments",
    defaultValue: "start",
    options: JUSTIFY_OPTIONS,
  },
  {
    id: "align",
    label: "Align",
    kind: "segments",
    defaultValue: "middle",
    options: ALIGN_OPTIONS,
  },
  {
    id: "height",
    label: "Height",
    kind: "number",
    defaultValue: 0,
    min: 0,
    max: 200,
    unit: "px",
    hint: "0 hugs contents (no explicit height is set).",
  },
  {
    id: "gap",
    label: "Gap",
    kind: "number",
    defaultValue: 8,
    min: 0,
    max: 24,
    unit: "px",
  },
];

/**
 * RowContainer paints nothing of its own — no `APPEARANCE_FIELDS`, no
 * preset family (T1-SPEC.md §4.4: "the one primitive in this family for
 * which the bundle is inapplicable, not merely unused").
 */
export const ROW_CONTAINER_PRESETS: PresetSpec[] = [];
