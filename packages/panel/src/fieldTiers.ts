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
 * A field's tier is INFERRED from the FieldSpec/PresetSpec shape every
 * component already declares. Nothing is hand-listed per component, so an
 * eighth component tiers itself the day it ships.
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
  const isSelector = field.id === "state" || presets.some((p) => p.selector === field.id);
  const isEscapeHatch = /escape hatch/i.test(field.hint ?? "");
  const isPlainName = field.kind === "text" && !field.hint;
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
