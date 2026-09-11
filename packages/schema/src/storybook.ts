/**
 * @bbox-ui/schema — packages/schema/src/storybook.ts
 *
 * 2 pure functions, unit-testable, no Storybook import. `toArgTypes` and
 * `defaultArgs` turn a `FieldSpec[]` into the two halves of a Storybook CSF
 * `Meta`: `argTypes` (how Controls draws each row) and `args` (what a story
 * renders with when it does not override a field).
 */

import type { FieldKind, FieldSpec, FieldValue } from "./field";
import type { PresetSpec } from "./resolve";

const CONTROL: Record<FieldKind, "select" | "number" | "boolean" | "text"> = {
  segments: "select",
  number: "number",
  toggle: "boolean",
  text: "text",
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
export function defaultArgs(fields: FieldSpec[]): Record<string, FieldValue> {
  const result: Record<string, FieldValue> = {};
  for (const field of fields) {
    result[field.id] = field.defaultValue;
  }
  return result;
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
  preset: PresetSpec,
): Record<string, FieldValue> {
  return {
    ...defaultArgs(fields),
    [preset.selector]: preset.id,
    ...(preset.values as Record<string, FieldValue>),
  };
}
