import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";

/**
 * Simple / Advanced / Expert over one field array, PrusaSlicer's model.
 *
 * WHY this is its own module and not a property of one panel design: Zach,
 * 2026-09-11, choosing the single-row layout — "the tiered design of just
 * hiding things, and also filter first, those are things I can support
 * regardless... those are just nice presets for doing filtering. I think that
 * can be helpful regardless of whatever you're doing, just because it's a lot
 * of controls as well."
 *
 * So tiering is a filter over the field array, orthogonal to how a row is
 * drawn. It was first written inside the Tiered panel; keeping a second copy
 * in the chosen panel is how the provenance model ended up with six
 * implementations and four answers.
 */
export type Tier = "simple" | "advanced" | "expert";

export const TIER_ORDER: Tier[] = ["simple", "advanced", "expert"];
export const TIER_RANK: Record<Tier, number> = { simple: 0, advanced: 1, expert: 2 };
export const TIER_META: Record<Tier, { label: string; hint: string }> = {
  simple: { label: "Simple", hint: "Only what changes constantly — the preset and this field's own plain name." },
  advanced: { label: "Advanced", hint: "Everything with a closed, meaningful set of values." },
  expert: { label: "Expert", hint: "Everything — preset-driven fields, raw paint tokens, opacities, diff-lens." },
};

/**
 * A field's tier is EXPLICITLY curated on the FieldSpec itself
 * (`field.tier`) — Zach, 2026-09-14: "if nothing is added then you can
 * assume its expert. Simple should only be like highly curated fields that
 * we individually choose to promote." Falls back to the ORIGINAL
 * shape-inferred classification below (rules 1-4) per FIELD when `tier` is
 * absent — a component that curates every one of its own fields (Port,
 * first) never touches the fallback at all, while a component that hasn't
 * been migrated yet (everything else, today) keeps its exact current panel
 * unchanged, field by field, with zero risk of a half-curated component
 * silently losing the fields nobody got around to annotating.
 *
 * Superseded design, kept as the fallback: a field's tier used to be
 * INFERRED from the FieldSpec/PresetSpec shape every component already
 * declares, so nothing had to be hand-listed per component. That meant a
 * field's prominence was an accident of its TYPE, not a deliberate product
 * call — Port's own two-slot work surfaced the gap: `textLayout` (exactly
 * the control Zach wants in Simple) fell into Advanced by shape alone, with
 * no way to promote it short of changing what KIND of field it was.
 *
 * 1. SIMPLE — the preset selector, a plain name, a bare label. What changes
 *    constantly.
 * 2. EXPERT — anything a preset governs. The preset IS the simple way to set
 *    it, so the raw field underneath is not a second, softer way to do the
 *    same thing.
 * 3. EXPERT — raw paint tokens (options whose label IS their value),
 *    continuous numbers, runtime-only flags, and the diff-lens pair.
 * 4. ADVANCED — everything left: an ungoverned field with a real closed,
 *    human-labelled set of values.
 *
 * Tiers are CUMULATIVE: Advanced shows Simple's rows too, Expert shows
 * everything, so "every field is reachable" is trivially true and any hidden
 * field is one tap away.
 */
export function classifyField(field: FieldSpec, presets: PresetSpec[], governed: Set<string>): Tier {
  if (field.tier) return field.tier;

  const isSelector = field.id === "state" || presets.some((p) => p.selector === field.id);
  const isEscapeHatch = /escape hatch/i.test(field.hint ?? "");
  // WHY "textarea" joins "text" here: a plain name is a classification about
  // how central the field is (unhinted free text a person types), not about
  // how many lines it wraps to — TextBox's own `children` field already hits
  // `isBareLabel` below regardless of kind, but a future unhinted textarea
  // field on some other component deserves the same "simple" tier a text
  // field gets, not the leftover "advanced" bucket.
  const isPlainName = (field.kind === "text" || field.kind === "textarea") && !field.hint;
  const isBareLabel = field.id === "children" && !isEscapeHatch;
  if (isSelector || isPlainName || isBareLabel) return "simple";

  if (governed.has(field.id)) return "expert";

  const isRawToken =
    field.kind === "segments" && (field.options?.length ?? 0) > 0 && field.options!.every((o) => o.value === o.label);
  const isContinuous = field.kind === "number";
  const isRuntimeOnly = /never persisted/i.test(field.hint ?? "");
  const isDiffLens = field.id === "lens" || field.id === "lensBefore";
  if (isRawToken || isContinuous || isRuntimeOnly || isDiffLens) return "expert";

  return "advanced";
}

/**
 * Whether a PRESET SELECTOR's own row (the pill/banner offering its preset
 * choices) should render at the given tier. The selector's own field is
 * looked up in `fields` and classified exactly like any other field row; a
 * selector with no `FieldSpec` of its own (should not happen — every
 * selector is a real field) falls back to always visible rather than
 * silently vanishing, so an unrecognised selector never disappears with no
 * way back short of Expert.
 *
 * WHY this is its own exported function and not inlined per panel variant:
 * `FigmaDense.tsx` and `Tiered.tsx` each grew their own copy of this exact
 * rule (Zach, 2026-09-14, demoting Port's `size` out of Simple: "No need
 * for size control here" surfaced that a selector's banner used to render
 * unconditionally in BOTH). The second copy (Tiered's) reimplemented the
 * "no field found" case differently — defaulting to `"advanced"` instead of
 * always-visible — which silently hid any selector missing from `fields` a
 * tier earlier than the first copy did. This module's own header comment
 * already names that failure shape ("keeping a second copy... is how the
 * provenance model ended up with six implementations and four answers");
 * one shared function is what actually closes it, rather than fixing the
 * duplicate's bug and leaving the duplication itself in place.
 */
export function selectorVisibleAtTier(
  selector: string,
  fields: FieldSpec[],
  presets: PresetSpec[],
  governed: Set<string>,
  tier: Tier,
): boolean {
  const field = fields.find((f) => f.id === selector);
  if (!field) return true;
  return TIER_RANK[classifyField(field, presets, governed)] <= TIER_RANK[tier];
}

/** A field matches a typed filter on its label, its id, or any option label —
 *  looking for "danger" should find Line Color, whose OPTIONS carry the word,
 *  not only fields whose own name does. */
export function matchesFilter(field: FieldSpec, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (field.label.toLowerCase().includes(q)) return true;
  if (field.id.toLowerCase().includes(q)) return true;
  return (field.options ?? []).some(
    (o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q),
  );
}

const TIER_STORAGE_KEY = "bbox-ui:inspector-tier";

export function loadStoredTier(): Tier {
  try {
    const raw = window.localStorage.getItem(TIER_STORAGE_KEY);
    if (raw === "simple" || raw === "advanced" || raw === "expert") return raw;
  } catch {
    // Private window / storage disabled — the tier switch still works, it
    // just forgets.
  }
  return "simple";
}

export function storeTier(tier: Tier): void {
  try {
    window.localStorage.setItem(TIER_STORAGE_KEY, tier);
  } catch {
    /* see loadStoredTier */
  }
}
