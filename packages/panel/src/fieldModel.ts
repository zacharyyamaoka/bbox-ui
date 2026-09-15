import {
  resolveField,
  type FieldSpec,
  type FieldTrace,
  type FieldValue,
  type InheritedValue,
  type Layer,
  type PresetSpec,
} from "@bbox-ui/schema";
/** One thing on the bench. `props` is the RAW store — never a transformed
 *  subject; the distinction is load-bearing everywhere below. */
export interface Subject {
  id: string;
  props: Record<string, unknown>;
  /** Per-field values relayed down from the nearest ancestor whose
   * component declares a same-id `cascades` field — the page's computed
   * inherited bag for THIS subject. `resolveField` only consults an entry
   * here when the field itself is marked `cascades` (field.ts). */
  inherited?: Record<string, InheritedValue>;
}

/**
 * ONE answer to "what does this field read, and where did it come from?"
 *
 * WHY this file exists at all: six panels asked that question and gave four
 * different answers. Three of them carried a `subjects.length === 1` gate that
 * had already been fixed once in the canonical row — so a multi-selection went
 * silent about a value nothing stored, in three panels, an hour after the fix
 * landed in the fourth. Two more differed again: one resolved against a
 * "representative" subject, one suppressed the note entirely when Mixed.
 *
 * A shared helper is not a tidiness preference here. It is the only structure
 * in which the same defect cannot be fixed in one place and left standing in
 * five. Every panel MUST call `readFieldRow` and MUST NOT call `resolveField`
 * directly; `fieldModel.test.ts` enforces that by reading the files.
 */
export interface FieldRowModel {
  /**
   * The cascade chain to SHOW, or null when the selection does not agree on
   * one. Agreement means same winning layer AND same resolved value, so two
   * subjects that land on the same value by different routes still have no
   * single chain to draw.
   */
  trace: FieldTrace | null;
  /** Stored values disagree across the selection. */
  isMixed: boolean;
  /** At least one selected subject holds its own value for this field. */
  hasOwnOverride: boolean;
  /**
   * Clearing this row's override would put a DIFFERENT value back — there is
   * an override to clear, and a layer under it that holds a value. This is
   * the one rule for whether a row offers its ↺ reset.
   *
   * WHY it lives here rather than at each button: it was written three times
   * (`FigmaDense`'s `FieldRow`, its `PairedFieldCell`, `sections/StandardRow`)
   * as `governed || trace.candidates[1]?.value !== undefined`, and
   * `candidates[1]` is the INHERITED layer, not "the next layer down". So a
   * row whose only fallback was its own default — which `resolve.ts` says is
   * every field, "`default` always has a value — every FieldSpec declares
   * one" — never grew the button. Zach, 2026-09-12, of an overridden Justify
   * with no ↺ beside it: "when you edit a value away from default you get a
   * little reset icon that appears to put it back. is that still
   * implemented?" It was implemented for preset-governed and inherited rows
   * only; the screenshot's Diameter had it because a Port preset governs
   * Diameter, not because it is a number field.
   */
  canReset: boolean;
  /**
   * The layer a clear would land on, so the button can say where it is going
   * ("Reset to the preset's value"). Null when the selection disagrees about
   * that — the same agreement gate `trace` itself uses — in which case the
   * button still shows (`canReset`) and says so generically.
   */
  resetsTo: Layer | null;
  /** The value the control shows; undefined for Mixed or an empty selection. */
  collapsedValue: FieldValue | undefined;
  /**
   * Something outside the stored layers paints a different value — Pill folds
   * `tone` into the override layer, for one. Null when the store explains the
   * pixels.
   */
  paintedElsewhere: FieldValue | null;
  /** The preset that won, when one did. */
  drivenPresetId: string | null;
  /** The ancestor's label, when the winning trace is `"inherited"` AND the
   * selection agrees on it (same gate as `trace` itself — see `agreeing`
   * below). Null otherwise, including for Mixed or an empty selection. */
  inheritedFrom: string | null;
  /** Per-subject STORED traces, for a panel that needs the raw material. */
  traces: FieldTrace[];
}

/**
 * What the ↺ reset says it will do, named by the layer it lands on.
 *
 * WHY it is not one fixed sentence any more: the sentence it replaces was
 * "Clear this instance's override — fall back to the preset", printed on
 * every row that had the button, including rows with no preset anywhere in
 * their cascade. Now that the button appears on ordinary rows too (see
 * `canReset`), a tooltip naming a layer the field does not have would be the
 * panel's one outright false sentence.
 */
const RESET_TITLE: Record<Layer, string> = {
  // Unreachable: a fallback is by construction a layer UNDER the override.
  override: "Reset this value",
  inherited: "Reset to the value inherited from the parent",
  preset: "Reset to the preset's value",
  default: "Reset to the default",
};

/** Null means the selection disagrees about where a clear lands, so the
 *  button cannot name one layer without naming it wrongly for some subject. */
export function resetTitleFor(resetsTo: Layer | null): string {
  return resetsTo ? RESET_TITLE[resetsTo] : "Reset to the underlying value";
}

/** Every selected subject resolving the same way makes that shared answer each
 *  one's answer. Disagreement has no single answer, and saying so is the point. */
function agreeing<T>(list: T[], key: (item: T) => unknown): T | null {
  if (list.length === 0) return null;
  const first = key(list[0]!);
  return list.every((item) => key(item) === first) ? list[0]! : null;
}

export function readFieldRow(
  field: FieldSpec,
  subjects: Subject[],
  presets: PresetSpec[],
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>,
): FieldRowModel {
  const asSubject = toSubject ?? ((props: Record<string, unknown>) => props);

  // TWO resolutions, because two different questions are being asked.
  //   traces        — resolve the RAW props. This is what the store holds, and
  //                   the store is what a control edits and a clear deletes.
  //   paintedTraces — resolve the subject the COMPONENT resolves. This is what
  //                   is actually on screen.
  // Answering both with one of them is what three judge rounds kept finding:
  // the panel highlighted a tone's colour, the chain printed the tone's
  // colour, and the value the user had stored appeared nowhere — so clearing
  // deleted it with nothing visibly changing.
  const traces = subjects.map((s) => resolveField(field, s.props, presets, s.inherited));
  const paintedTraces = subjects.map((s) => resolveField(field, asSubject(s.props), presets, s.inherited));

  // NOT gated on a single subject. Gating it there is the exact defect this
  // module exists to make unrepeatable: with two pills selected and a tone
  // set, the badge, the chain and the "painting …" note all went silent while
  // the control kept highlighting a value neither pill painted.
  const trace = agreeing(traces, (t) => `${t.winner}:${String(t.resolved)}`);
  const paintedAgreed = agreeing(paintedTraces, (t) => String(t.resolved));
  const storedAgreed = agreeing(traces, (t) => String(t.resolved));
  const paintedElsewhere =
    storedAgreed && paintedAgreed && paintedAgreed.resolved !== storedAgreed.resolved
      ? paintedAgreed.resolved
      : null;

  // Mixed is about what THIS row edits, so it compares the STORED resolutions.
  // Two subjects with different stored overrides read Mixed even when a tone
  // currently paints them alike, because writing here overwrites both.
  const storedResolved = traces.map((t) => t.resolved);
  const isMixed = storedResolved.length > 1 && storedResolved.some((v) => v !== storedResolved[0]);

  // Any selected subject holding its own value can be cleared. Restricting
  // this to a single selection left a multi-selection override permanently
  // unclearable; restricting it to governed fields left 60 of 64 rows with no
  // way out of the override layer at all.
  const hasOwnOverride = subjects.some((s) => s.props[field.id] !== undefined);

  // Where a clear would land, per subject: the first candidate UNDER the
  // override that holds a value. Read off the SAME candidate list the trace
  // chain draws, so the button and the disclosure can never disagree about
  // what clearing does. Computed per subject, not from the agreed `trace`,
  // because a MIXED selection has no agreed trace and its overrides are
  // exactly the ones most worth being able to clear.
  const fallbacks = traces.map((t) => t.candidates.slice(1).find((c) => c.value !== undefined)?.layer ?? null);
  const canReset = hasOwnOverride && fallbacks.some((layer) => layer !== null);
  const resetsTo = canReset ? agreeing(fallbacks, (layer) => layer) : null;

  const collapsedValue: FieldValue | undefined =
    isMixed || storedResolved.length === 0 ? undefined : (storedResolved[0] as FieldValue);

  return {
    trace,
    isMixed,
    hasOwnOverride,
    canReset,
    resetsTo,
    collapsedValue,
    paintedElsewhere,
    drivenPresetId: trace && trace.winner === "preset" ? (trace.winningPresetId ?? null) : null,
    inheritedFrom: trace && trace.winner === "inherited" ? (trace.inheritedFrom ?? null) : null,
    traces,
  };
}
