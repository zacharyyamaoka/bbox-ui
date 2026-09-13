/**
 * @bbox-ui/schema — packages/schema/src/storybook.ts
 *
 * 2 pure functions, unit-testable, no Storybook import. `toArgTypes` and
 * `defaultArgs` turn a `FieldSpec[]` into the two halves of a Storybook CSF
 * `Meta`: `argTypes` (how Controls draws each row) and `args` (what a story
 * renders with when it does not override a field).
 */

import type { FieldKind, FieldSpec, FieldValue } from "./field";
import { governedFieldIds, type PresetSpec } from "./resolve";

const CONTROL: Record<FieldKind, "select" | "number" | "boolean" | "text"> = {
  segments: "select",
  number: "number",
  toggle: "boolean",
  text: "text",
  // WHY "textarea" maps to Storybook's own "text" control rather than a new
  // CONTROL value: Storybook ships no distinct multiline control type, and
  // this map is a value lookup (kind -> Storybook's control name), not an
  // identity — `field.kind` stays "textarea" everywhere else, only the
  // Controls addon sees "text". See docs/TEXTBOX-EDITING-SPEC.md §2.
  textarea: "text",
};

export interface StorybookArgType {
  name: string;
  description?: string;
  control: "select" | "number" | "boolean" | "text";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

/** One entry per field, keyed by `field.id` — matches a CSF `Meta.argTypes`. */
export function toArgTypes(fields: FieldSpec[]): Record<string, StorybookArgType> {
  const result: Record<string, StorybookArgType> = {};
  for (const field of fields) {
    result[field.id] = {
      name: field.label,
      description: field.hint,
      control: CONTROL[field.kind],
      options: field.options?.map((option) => option.value),
      min: field.min,
      max: field.max,
      step: field.step,
    };
  }
  return result;
}

/** One entry per field, keyed by `field.id` — matches a CSF `Meta.args`. */
export function defaultArgs(
  fields: FieldSpec[],
  presets: PresetSpec[] = [],
): Record<string, FieldValue> {
  // WHY governed fields are OMITTED rather than defaulted: a Storybook arg is
  // an explicit value on the subject, and `resolveField` reads any present
  // subject value as the INSTANCE OVERRIDE layer, which outranks the preset.
  // Materialising every field therefore pinned each governed field to its
  // default paint and made the preset layer unreachable: on the published
  // site, switching Pill's State control between empty, wired and received
  // left borderColor at oklch(0.98 0 0) and the background transparent every
  // time. Leaving a governed field absent is what lets the selector actually
  // select. Storybook still shows the control (it comes from `argTypes`, not
  // from `args`), so a reader can still reach past the preset deliberately —
  // which is the escape hatch, not the default path.
  const governed = new Set(governedFieldIds(presets));
  const result: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (governed.has(field.id)) continue;
    result[field.id] = field.defaultValue;
  }
  return result;
}

/**
 * Field ids -> the STRING `parameters.controls.{include,exclude}` must
 * actually contain to hit those fields' rows.
 *
 * WHY this exists: Storybook 10's own `filterArgTypes` (preview-api) reads
 * `let name = argType.name || key` and matches include/exclude against
 * that `name` — never against the argTypes object key. `toArgTypes` above
 * sets `name` to the human `field.label` ("Line Color") for display, so a
 * raw field id ("lineColor") in `exclude` silently matches nothing and the
 * governed control stays live. Every caller building `controls.exclude`
 * from ids (`governedFieldIds`, a single swept field) must route through
 * this bridge rather than pass ids straight through.
 */
export function controlNames(fields: FieldSpec[], ids: string[]): string[] {
  const labelById = new Map(fields.map((field) => [field.id, field.label]));
  return ids.map((id) => labelById.get(id) ?? id);
}

/**
 * The args a story renders with to MATERIALIZE one preset: the
 * component's plain defaults, with the selector field set to the
 * preset's own id, plus the preset's governed values spelled out
 * explicitly (so a story renders correctly even in a host that does not
 * itself call `resolveFields` — Storybook's Controls addon reads `args`
 * directly, it does not run the cascade). This is the function every
 * "one story per preset" gallery (§6) is built from.
 */
export function presetArgs(
  fields: FieldSpec[],
  // WHY the WHOLE list plus an id, rather than a preset plus a list: making
  // the third parameter merely required only forced callers to type
  // something, and the obvious thing to type is `[preset]`. That is the
  // unsafe call — with one component carrying two preset families on
  // different selectors (legal; only two selectors claiming the same FIELD
  // are forbidden) the other family's governed fields get materialised as
  // explicit defaults and its preset layer dies, which is the very bug this
  // function was fixed to stop. Taking the full array and selecting inside
  // makes a partial list unrepresentable rather than merely discouraged.
  presets: PresetSpec[],
  presetId: string,
): Record<string, FieldValue> {
  const preset = presets.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(
      `presetArgs: no preset with id "${presetId}" (have: ${presets.map((p) => p.id).join(", ") || "none"})`,
    );
  }
  // WHY the preset's own values are NOT spread in: doing so stored the
  // resolved paint as instance overrides, so every row of a Presets story
  // looked right while being produced entirely by the override layer. The
  // cascade was decorative — deleting every preset left the rendered output
  // byte-identical. Setting only the SELECTOR is the whole point: the
  // component resolves the paint itself, so the story proves the middle
  // layer works instead of bypassing it.
  return {
    ...defaultArgs(fields, presets),
    [preset.selector]: preset.id,
  };
}
