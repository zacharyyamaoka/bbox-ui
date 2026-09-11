/**
 * @bbox-ui/schema — packages/schema/src/resolve.ts
 *
 * The cascade: resolved = instance override ?? semantic preset ??
 * component default. Zero dependencies, same discipline as ./field.ts —
 * no React, no host engine, no Storybook.
 *
 * WHY this exists as code and not a markdown rule (Zach, 2026-09-10:
 * "I feel instead of documenting it though you could almost just like
 * trace it no?"): a resolver that returns a bare value can only ever be
 * asked "what is it now?". One that returns a FieldTrace can also answer
 * "why?" — which layer won, what the other layers held, which preset (if
 * any) supplied it. A component's own render function calls this SAME
 * resolver to compute what it paints (see each component's .tsx), so the
 * trace a panel shows is never a second, informal description of the
 * pixels — it is the computation that produced them.
 */

import type { FieldSpec, FieldValue } from "./field";

export type Layer = "override" | "preset" | "default";

export interface LayerCandidate<TValue = FieldValue> {
  layer: Layer;
  /**
   * What this layer holds for this field on this subject, or `undefined`
   * when the layer has nothing to say: no explicit value on the subject
   * (override), or no preset governs this field / the governing preset's
   * selector doesn't currently match (preset). `default` always has a
   * value — every FieldSpec declares one.
   */
  value: TValue | undefined;
  /** Set only on the `"preset"` candidate, and only when it has a value. */
  presetId?: string;
}

export interface FieldTrace<TValue = FieldValue> {
  field: FieldSpec<TValue>;
  /** The winning value — identical to what `readFields` would return for
   * a single subject. This is what a component actually paints. */
  resolved: TValue;
  winner: Layer;
  /** Set only when `winner === "preset"`. */
  winningPresetId?: string;
  /**
   * Always exactly 3 entries, in cascade order: override, preset, default
   * — the devtools-styles-pane model: the winning declaration plus the
   * losing ones, all visible.
   */
  candidates: [LayerCandidate<TValue>, LayerCandidate<TValue>, LayerCandidate<TValue>];
}

export interface PresetSpec<TValue = FieldValue> {
  /** Must equal one legal value of `selector`'s field (e.g. a PortState
   * member). Also the story name / control option this preset shows up
   * as — see §6. */
  id: string;
  label: string;
  /** The field id whose value selects this preset: active on a subject
   * when `subject[selector] === id`. Almost always `"state"`. */
  selector: string;
  /**
   * Closed set of field ids this preset writes. Real, exported, tested
   * data — never a comment. A field in this list without a matching key
   * in `values` is an authoring bug this module does not itself catch;
   * each component's own `*.fields.test.ts` asserts `governs` and
   * `Object.keys(values)` agree (see §9's Definition of Done).
   */
  governs: string[];
  /** This preset's value for each field named in `governs`. */
  values: Partial<Record<string, TValue>>;
}

/** Plain prop bag — a component's own `props`, a tldraw shape's `props`,
 * anything keyed like React props. Never an Editor, never a shape record.
 * Same shape `readFields` already accepts. */
type Subject = Record<string, unknown>;

/**
 * Resolve one field on one subject through all three layers.
 *
 * Presets are matched by SELECTOR, not by preset identity: two presets
 * that share a `selector` (e.g. every `state` preset) are treated as
 * mutually-exclusive alternatives on purpose — only the one whose `id`
 * equals the subject's current selector value is ever active, so siblings
 * sharing a governed set is the intended shape of a semantic ladder, not
 * a conflict. `assertDisjointPresets` (below) is what actually forbids
 * the real conflict: two DIFFERENT selectors both claiming one field.
 */
export function resolveField<TSubject extends Subject>(
  field: FieldSpec,
  subject: TSubject,
  presets: PresetSpec[],
): FieldTrace {
  const rawOverride = subject[field.id];
  const overrideCandidate: LayerCandidate = {
    layer: "override",
    value: rawOverride === undefined ? undefined : (rawOverride as FieldValue),
  };

  let presetCandidate: LayerCandidate = { layer: "preset", value: undefined };
  const governingPresets = presets.filter((p) => p.governs.includes(field.id));
  for (const preset of governingPresets) {
    if (subject[preset.selector] === preset.id) {
      presetCandidate = {
        layer: "preset",
        value: preset.values[field.id],
        presetId: preset.id,
      };
      break; // assertDisjointPresets guarantees at most one can ever match
    }
  }

  const defaultCandidate: LayerCandidate = { layer: "default", value: field.defaultValue };

  const candidates: FieldTrace["candidates"] = [
    overrideCandidate,
    presetCandidate,
    defaultCandidate,
  ];
  const winning = candidates.find((c) => c.value !== undefined) ?? defaultCandidate;

  return {
    field,
    resolved: winning.value as FieldValue,
    winner: winning.layer,
    winningPresetId: winning.presetId,
    candidates,
  };
}

/** `resolveField` over every field in `fields`, in the order given —
 * the cascade's analogue of `readFields`, but for one subject with full
 * provenance rather than N subjects collapsed to MIXED. Use `readFields`
 * (field.ts) when you only need N-subject agreement; use this when you
 * need to show or act on WHY a value is what it is. */
export function resolveFields<TSubject extends Subject>(
  fields: FieldSpec[],
  subject: TSubject,
  presets: PresetSpec[],
): FieldTrace[] {
  return fields.map((field) => resolveField(field, subject, presets));
}

/**
 * Structural guard for "keep each governed set closed." Throws the
 * instant two presets selected on DIFFERENT fields both claim the same
 * governed property — the real, load-bearing conflict the cascade cannot
 * resolve (which family wins?). Presets that share a `selector` (siblings
 * in one semantic ladder, e.g. every `state` member) are explicitly
 * EXEMPT — they are mutually exclusive by construction, and sharing a
 * governed set is the entire point of a preset family.
 *
 * Call once per component's presets array, from that component's own
 * `*.fields.test.ts` (§9). Never called at runtime/render time.
 */
export function assertDisjointPresets(presets: PresetSpec[]): void {
  const ownerBySelector = new Map<string, string>(); // fieldId -> selector
  for (const preset of presets) {
    for (const fieldId of preset.governs) {
      const existing = ownerBySelector.get(fieldId);
      if (existing !== undefined && existing !== preset.selector) {
        throw new Error(
          `"${fieldId}" is governed by presets selected on two different fields ` +
            `("${existing}" and "${preset.selector}"). A field may be governed by ` +
            `presets from only ONE selector — siblings on the SAME selector (e.g. ` +
            `every "state" preset) may legitimately share a governed set, since ` +
            `only one is ever active. See T1-SPEC.md §1.`,
        );
      }
      ownerBySelector.set(fieldId, preset.selector);
    }
  }
}

/** Every field id governed by at least one preset in `presets` — the set
 * a Storybook gallery story sweeping all presets (§6) must exclude from
 * its Controls, and the set a product-inspector row (§7) renders as
 * "governed" (inherited-looking) rather than freely editable. */
export function governedFieldIds(presets: PresetSpec[]): string[] {
  return Array.from(new Set(presets.flatMap((p) => p.governs)));
}
