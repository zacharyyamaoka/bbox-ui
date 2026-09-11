import type { FieldOption, FieldSpec } from "@bbox-ui/schema";
import {
  APPEARANCE_STATES,
  APPEARANCE_STATE_LABELS,
  LENSES,
  LENS_LABELS,
  TONES,
  TONE_LABELS,
} from "./appearance";

const STATE_OPTIONS: FieldOption[] = APPEARANCE_STATES.map((state) => ({
  value: state,
  label: APPEARANCE_STATE_LABELS[state],
}));

const TONE_OPTIONS: FieldOption[] = TONES.map((tone) => ({
  value: tone,
  label: TONE_LABELS[tone],
}));

const LENS_OPTIONS: FieldOption[] = LENSES.map((lens) => ({
  value: lens,
  label: LENS_LABELS[lens],
}));

export const STATE_FIELD: FieldSpec = {
  id: "state",
  label: "State",
  kind: "segments",
  defaultValue: "empty",
  options: STATE_OPTIONS,
  hint: "`received` is runtime-only — never persisted (PERSISTABLE_APPEARANCE_STATES).",
};

export const TONE_FIELD: FieldSpec = {
  id: "tone",
  label: "Tone",
  kind: "segments",
  defaultValue: "neutral",
  options: TONE_OPTIONS,
  hint: "Escape hatch for a component not colouring by state. Writes an override, not a preset — see appearance.ts's toneOverride.",
};

export const LENS_FIELD: FieldSpec = {
  id: "lens",
  label: "Lens",
  kind: "segments",
  defaultValue: "normal",
  options: LENS_OPTIONS,
};

/**
 * NOT in APPEARANCE_FIELDS, deliberately.
 *
 * `lensBefore` is a real prop — Pill and Port both accept it — but neither
 * renders it, and Block forwards it to a chip that drops it. Declaring it
 * put a live control into 27 story panels that moved nothing at all, which
 * is precisely the "a control that does nothing reads as broken" complaint
 * this library exists to answer. A field array is a promise that changing a
 * row changes the component; a field with no visual consequence breaks that
 * promise wholesale.
 *
 * It stays exported so the declaration is ready the day a lens actually
 * paints a before-value, and so removing it is one line to undo.
 */
export const LENS_BEFORE_FIELD: FieldSpec = {
  id: "lensBefore",
  label: "Lens: Before Value",
  kind: "text",
  defaultValue: "",
  hint: "The pre-change value a diff lens compares against. Empty when `lens === \"normal\"`.",
};

/**
 * The shared bundle. Spread into a component's own field array —
 * `[...APPEARANCE_FIELDS, ...OWN_FIELDS]` — never nested under an
 * `appearance` object. See docs/T1-SPEC.md §2 for which components
 * include it and which deliberately don't.
 */
export const APPEARANCE_FIELDS: FieldSpec[] = [
  STATE_FIELD,
  TONE_FIELD,
  LENS_FIELD,
];
