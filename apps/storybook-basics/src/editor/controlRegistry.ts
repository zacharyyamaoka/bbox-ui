// src/editor/controlRegistry.ts — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/contextualControlRegistry.ts:8-134,411-491` — the
//     vocabulary types (`ContextualControlKind` → generic `K`,
//     `ContextualControlDefinition` → `ControlDefinition`,
//     `ContextualControl`/`ContextualCustomSize` → `BoundControl`/
//     `CustomSizeBinding`, `ContextualControlRecipe`/`Composition` →
//     `ControlRecipe`/`ControlComposition`), `bindContextualControl` →
//     `bindControl`, `composeContextualControls` → `composeControls`,
//     `contextualControlIds` → `controlIds`, `selectedContextualOption` →
//     `selectedControlOption`, `isAutomaticContextualSelection` →
//     `isAutomaticSelection`, `contextualTriggerLabel` → `controlTriggerLabel`.
//   • `src/contextualMenus/ContextualControls.tsx:236-248` — `stackedModes`,
//     the chain-walk this file exports as `stackModes` (design's "the lab's
//     general fold": the donor kept it local to the renderer; the kit
//     promotes it to the model because a host renderer needs it too and it
//     touches no DOM).
//
// WHAT CHANGED in the port, exhaustively — so a future re-sync is a diff
// against this list, not a guess:
//
//   1. THE REGISTRY BECOMES A FACTORY (design decision #1). The donor
//      imports `FIGJAM_COLOR_NAMES`/`FIGJAM_PALETTE_COLUMNS` (a palette,
//      app taste) and `CODE_LANGUAGES`/`CODE_LANGUAGE_LABELS` (a domain
//      vocabulary) directly into `CONTEXTUAL_CONTROL_REGISTRY`'s module
//      constant. A kit that imports no canvas engine also imports no FigJam
//      palette and no app's code-language list, so the whole
//      `Record<Kind, Definition>` moves from a module constant to
//      `createControlRegistry`'s single argument. The generic `K extends
//      string` is what lets an app close its own kind union
//      (`createControlRegistry<AppearanceControlKind>({...})`) while the
//      kit's own type stays open — `CONTEXTUAL_CONTROL_REGISTRY`'s
//      module-const form is exactly what made injection impossible.
//   2. `meta?: StrokeMetaField` → `hostTag?: string`. The donor's field is a
//      closed enum naming which of SystemSketch's OWN metadata slots
//      (`'pattern' | 'color' | 'width'`) a control writes back to — pure app
//      wiring, not kit vocabulary. `hostTag` is the same shape (an opaque
//      string a binder may branch on) with the enum erased; the kit never
//      reads it.
//   3. `isCustomColor(value)` (donor :456, hardcoded to `color`/
//      `strokeColor` kinds) → `ControlDefinition.isCustomValue`/
//      `customValueLabel`, so any control — not just the two colour kinds —
//      can declare its own escape hatch, and the kit doesn't have to know
//      "color" is a special kind at all.
//   4. `customColorOpacity?: boolean` → `customColorOpacity?: number`. The
//      donor's binding only ever asked "does this target's custom colour
//      carry alpha" as a yes/no; the design's props sketch widens it to the
//      opacity value itself, since a boolean would just get paired with a
//      second field to carry the number anyway.
//   5. `rungPx?(value): number | null` (a thunk, re-invoked per render) →
//      `rungPxByValue?: Readonly<Record<string, number | null>>` (a plain
//      value the binder computes once). Same for `ContextualCustomSize`'s
//      three methods → `CustomSizeBinding`'s plain fields
//      (`sharedPx: number | 'mixed' | null`, `onPresetRungs: boolean`) —
//      design's "plain VALUES, not thunks — no signals" (`controlRegistry.ts`
//      sketch comment). `applyPx` stays a function: it is a command, not a
//      reading.
//   6. `selectedContextualOption` returned `ContextualControlOption |
//      undefined`; `selectedControlOption` returns `ControlOption | null` —
//      an explicit "no selection" value rather than an implicit one, matching
//      the design's own type sketch.
//   7. `composeControls` gains an `opts.onDangling` callback (design
//      decision #7): the *drop* stays — recipe-declared items that never had
//      a candidate STILL disappear from the recipe's own not-applicable
//      slots silently, on purpose, so an optional group with nothing bound
//      just leaves no empty gap. What's new is a way to hear about the
//      OTHER silent drop — a bound candidate whose `kind` was never named by
//      ANY recipe group at all, which is exactly the shape of the
//      `lineShape` regression (see the WHY on `danglingControls` below). A
//      dev build can wire `onDangling` to `console.warn`; production leaves
//      it unset and the drop stays as quiet as the donor's always was.
//
// Everything else — the vocabulary law, the trailing-`kind` re-pin in
// `bindControl`, the empty-group elision, the `isAutomaticSelection`
// `undefined === undefined` guard, `stackModes`'s chain walk — is
// unchanged behaviour, ported with its WHY intact below.

import type { ControlValue } from "./controlValue";

export type ControlLayout = "swatches" | "row" | "chips" | "list" | "library";
export type ControlTrigger = "value" | "icon" | "text" | "toggle" | "action";

export interface ControlOption {
  value: string;
  label: string;
}

/**
 * One vocabulary for every contextual control (ported verbatim,
 * contextualControlRegistry.ts:256-259 — "the single best idea in the
 * donor", MENU-KIT-DESIGN.md §1). Surfaces bind values and commands; they do
 * not re-declare labels, options, previews, or layouts. A host builds one
 * `Record<K, ControlDefinition<K>>` naming its whole vocabulary once and
 * hands it to `createControlRegistry` — every surface that needs "the Line
 * thickness control" or "the Line shape control" gets the SAME options, the
 * same label, the same layout, because there is exactly one place that
 * spelling exists.
 */
export interface ControlDefinition<K extends string = string> {
  kind: K;
  label: string;
  options: readonly ControlOption[];
  layout: ControlLayout;
  trigger: ControlTrigger;
  /** Family key into a `GlyphFamilies` record (see `controlGlyphs.tsx`).
      Absent means the value has no drawn preview — its label or row carries
      it (a Font size row, a language list). */
  glyph?: string;
  columns?: number;
  custom?: boolean;
  /** Opaque host tag a binder may branch on; the kit never reads it. Replaces
      the donor's `meta?: StrokeMetaField`, which named SystemSketch's own
      metadata slots directly — see change (2) above. */
  hostTag?: string;
  /** Replaces the hardcoded `isCustomColor` escape hatch (donor :456) — see
      change (3) above. */
  isCustomValue?: (value: string) => boolean;
  customValueLabel?: (value: string) => string;
}

/**
 * A size list's continuous channel, bound by the surface that owns the
 * target.
 *
 * WHY (ported, contextualControlRegistry.ts:73-83): the renderer must never
 * reach for the live selection itself — every control's value flows in
 * through its binding, and the custom-px cell is no exception. Before this
 * contract, a size control read the live canvas selection directly; that
 * happened to be right for one surface and quietly wrong for any surface
 * bound to an explicit target (a title menu showed a dead Custom cell wired
 * to the wrong selection). A size control without this binding is
 * presets-only: no Custom row, no px trigger.
 *
 * Plain values, not thunks — no signals (design's `controlRegistry.ts`
 * sketch). The donor's `sharedPx()`/`onPresetRungs()` were re-invoked per
 * render; the binder now computes both once per binding.
 */
export interface CustomSizeBinding {
  /** One shared effective px across the target, 'mixed', or null (none apply). */
  sharedPx: number | "mixed" | null;
  /** True when every participant sits exactly on its preset rung. */
  onPresetRungs: boolean;
  /** Apply an exact pixel size to the whole target. */
  applyPx(px: number): void;
  minPx: number;
  maxPx: number;
}

export interface ControlBinding {
  /** Stable id for DOM hooks and surface-specific tests. */
  id: string;
  value: ControlValue<string> | null;
  onSelect(value?: string, opts?: { continuous?: boolean }): void;
  automaticOption?: ControlOption;
  customColorOpacity?: number;
  customSize?: CustomSizeBinding;
  /** The pixels one named size option actually renders at for this control's
      target, keyed by option value, or absent when the target has no single
      answer. Replaces the donor's `rungPx(value)` thunk — see change (5)
      above. */
  rungPxByValue?: Readonly<Record<string, number | null>>;
  modeControl?: BoundControl;
  modePlacement?: "above" | "beside";
}

export type BoundControl<K extends string = string> = ControlDefinition<K> &
  ControlBinding & { kind: K };

export interface ControlRecipe<K extends string = string> {
  id: string;
  groups: readonly { id: string; items: readonly K[] }[];
}

export interface ControlComposition<K extends string = string> {
  id: string;
  groups: readonly { id: string; controls: readonly BoundControl<K>[] }[];
}

export const MIXED_LABEL = "Mixed";
export const CUSTOM_LABEL = "Custom";

/**
 * Build one registry's `bindControl`/`composeControls`/`controlIds`/
 * `danglingControls` quartet over a fixed, host-supplied vocabulary
 * (change (1) above — this whole function is the donor's module constant
 * turned inside out).
 */
export function createControlRegistry<K extends string>(
  definitions: Readonly<Record<K, ControlDefinition<K>>>,
): {
  bindControl(kind: K, binding: ControlBinding): BoundControl<K>;
  composeControls(
    recipe: ControlRecipe<K>,
    candidates: readonly BoundControl<K>[],
    opts?: { onDangling?: (kinds: K[]) => void },
  ): ControlComposition<K>;
  controlIds(composition: ControlComposition<K>): string[];
  danglingControls(recipe: ControlRecipe<K>, candidates: readonly BoundControl<K>[]): K[];
} {
  /**
   * Merge a binding over its registry entry.
   *
   * WHY `kind` is spread LAST (ported, contextualControlRegistry.ts:411-421):
   * a binding can never overwrite its own identity, even if a caller's
   * binding object happens to carry a stray `kind` field — the vocabulary
   * entry it's bound against always wins.
   */
  function bindControl(kind: K, binding: ControlBinding): BoundControl<K> {
    return { ...definitions[kind], ...binding, kind };
  }

  /**
   * Candidates whose `kind` no recipe group names at all.
   *
   * WHY this is surfaced rather than silently tolerated (design decision
   * #7): `composeControls` below drops any bound control absent from its
   * recipe with no error — load-bearing for optional slots (a draw shape's
   * bare `lineStyle` chips instead of `strokeColor`; see the donor's own
   * `SHAPE_CONTEXTUAL_RECIPE` comment) but exactly the mechanism that lost
   * `lineShape` for every connector selection twice (Codex judge round 1,
   * 2026-09-08 — `contextualControlRegistry.ts:356-374`'s `V1_COMPACT_RECIPE`
   * WHY tells the second telling of the same story). A recipe that forgets
   * to name a kind and a candidate that is bound for that kind look
   * identical from inside `composeControls` — both simply produce nothing —
   * so the only way to catch the mistake is to ask separately, which is what
   * this function is for.
   */
  function danglingControls(
    recipe: ControlRecipe<K>,
    candidates: readonly BoundControl<K>[],
  ): K[] {
    const declared = new Set<K>(recipe.groups.flatMap((group) => group.items));
    const dangling: K[] = [];
    for (const candidate of candidates) {
      if (!declared.has(candidate.kind) && !dangling.includes(candidate.kind)) {
        dangling.push(candidate.kind);
      }
    }
    return dangling;
  }

  /** Resolve visibility, grouping, and order from data rather than surface JSX. */
  function composeControls(
    recipe: ControlRecipe<K>,
    candidates: readonly BoundControl<K>[],
    opts?: { onDangling?: (kinds: K[]) => void },
  ): ControlComposition<K> {
    if (opts?.onDangling) {
      const dangling = danglingControls(recipe, candidates);
      if (dangling.length > 0) opts.onDangling(dangling);
    }
    const byKind = new Map(candidates.map((control) => [control.kind, control]));
    return {
      id: recipe.id,
      groups: recipe.groups.flatMap((group) => {
        const controls = group.items.flatMap((kind) => {
          const control = byKind.get(kind);
          return control ? [control] : [];
        });
        return controls.length > 0 ? [{ id: group.id, controls }] : [];
      }),
    };
  }

  function controlIds(composition: ControlComposition<K>): string[] {
    return composition.groups.flatMap((group) => group.controls.map((control) => control.id));
  }

  return { bindControl, composeControls, controlIds, danglingControls };
}

/** Ported verbatim (contextualControlRegistry.ts:448-460), generalized to
    `isCustomValue`/`customValueLabel` per change (3) above. */
export function selectedControlOption(control: BoundControl): ControlOption | null {
  if (control.value?.type !== "shared") return null;
  const value = control.value.value;
  const found = control.options.find((candidate) => candidate.value === value);
  if (found) return found;
  if (control.automaticOption?.value === value) return control.automaticOption;
  if (control.isCustomValue?.(value)) {
    return { value, label: control.customValueLabel?.(value) ?? CUSTOM_LABEL };
  }
  return null;
}

/**
 * True only when this control DECLARES an Automatic option and the shared
 * value is exactly it.
 *
 * WHY (ported verbatim, contextualControlRegistry.ts:462-472): this
 * predicate exists because the intuitive inline comparison
 * `control.automaticOption?.value === current?.value` is `undefined ===
 * undefined` — true — for every control with no Automatic concept the
 * moment its value is mixed or unoffered. That one expression put an "A"
 * badge on the trigger of any disagreeing selection that had no Automatic
 * concept at all. Renderers must ask this predicate, never compare the two
 * optionals themselves.
 */
export function isAutomaticSelection(control: BoundControl): boolean {
  return (
    control.automaticOption !== undefined &&
    control.value?.type === "shared" &&
    control.value.value === control.automaticOption.value
  );
}

/**
 * The sections stacked above a control's own options, outermost last.
 *
 * WHY a chain rather than one `modeControl` (ported verbatim,
 * ContextualControls.tsx:232-239 — "the lab's general fold" the design
 * promotes out of the renderer): a shape's Stroke popover can carry three
 * sections — thickness, line style, palette — and they are all the same
 * relationship, each one placed `above` the next. Walking the chain here
 * means a new edge section is one link in the model and no new renderer.
 */
export function stackModes(control: BoundControl): BoundControl[] {
  const stack: BoundControl[] = [];
  let mode = control.modePlacement === "above" ? control.modeControl : undefined;
  while (mode) {
    stack.unshift(mode);
    mode = mode.modePlacement === "above" ? mode.modeControl : undefined;
  }
  return stack;
}

/** Ported verbatim (contextualControlRegistry.ts:479-490). */
export function controlTriggerLabel(control: BoundControl): string {
  const valueName = (candidate: BoundControl): string => {
    const selected = selectedControlOption(candidate);
    if (selected) return selected.label.toLowerCase();
    if (candidate.value?.type === "shared") return candidate.value.value;
    return MIXED_LABEL.toLowerCase();
  };
  const stacked =
    control.trigger === "icon" && control.modePlacement === "above" ? control.modeControl : undefined;
  const value = stacked ? `${valueName(stacked)} ${valueName(control)}` : valueName(control);
  return `${control.label}, ${value}`;
}
