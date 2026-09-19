/**
 * src/components/toolPreferences.ts — the generalized preference algebra
 * behind the toolbar's last-used-per-family memory (docs/menus/screenshots/04,
 * the chevron cells that recall which shape/arrow/tool a family last drew).
 *
 * Ported and GENERALIZED from
 * /home/bam/systemsketch/src/toolbar/toolbarModel.ts:
 *   - `parsePreferences` generalizes the donor's `parseToolbarPreferences`
 *     (:85-105) — its per-field `includes(SHAPE_TOOLS, value.lastShapeTool)
 *     ? ... : DEFAULT...` ladder, hardcoded once per tool family, becomes one
 *     field-independent fallback driven by a `PreferenceRegistry` so the kit
 *     is not tied to SystemSketch's own tool vocabulary (rectangle/ellipse/
 *     block/branch/bbox-block/…).
 *   - `mergePreferences` generalizes the donor's `updateToolbarPreferences`
 *     identity check (:187-205) — same early-return-on-no-change shape, over
 *     an arbitrary preference object instead of the five named
 *     `ToolbarPreferences` fields.
 *   - The arrow-preset functions (`nextArrowPreset`, `arrowPresetPressCount`,
 *     `arrowPresetsInPressOrder`, `arrowPresetForActivation`) ride along
 *     unchanged (:107-151) as the worked EXAMPLE of a derived hint built on
 *     top of the generic algebra — pressCount is computed from the cycle so
 *     the on-screen hint cannot drift from the key that produces it.
 *   - The DOCK ROWS for that cycle (`arrowPresetSection` and its parts —
 *     labels, press-count hints, the heading, the `arrow-<preset>` row id)
 *     are ported from the donor's toolbar view
 *     (/home/bam/systemsketch/src/toolbar/SystemSketchToolbar.tsx:72-93,330)
 *     and id pair (toolbarModel.ts:153-155, toolbarIntegration.ts:66-72),
 *     2026-09-19, when Zach asked for the A cycle in the rebuilt app. They
 *     live HERE rather than in toolDock.tsx because toolDock is a registry
 *     item that ships alone (registry.json lists no toolPreferences.ts
 *     beside it) and shadcn copies source verbatim: a value import from
 *     toolDock into this file would install cleanly and then fail to
 *     compile. This file imports only toolDock's TYPES, which erase.
 *
 * Ported the MODEL only, per Zach's host-contract law (`CLAUDE.md`, "The core
 * imports no canvas engine"): the donor's `hydrate`/`persist`
 * (`window.localStorage`, :157-180) and `useToolbarPreferences`
 * (`useSyncExternalStore`, :212-214) are host-owned persistence and do not
 * travel. A host that wants storage writes its own adapter around
 * `parsePreferences`/`mergePreferences` and applies "Preferences are helpful
 * feedback, never a reason to block drawing" there.
 *
 * Deliberately NOT ported: `ShapeFamilyTool`/`SystemFamilyTool`/
 * `BboxFamilyTool`/`isBboxFamilyTool` and `ARROW_PRESET_ROUTING` /
 * `connectionRoutingForArrowPreset` (donor :5-83, :107-126). Those name
 * SystemSketch's own tool inventory and its `ConnectionRoutingKind` (a
 * canvas-adapter type) — exactly the kind of host vocabulary the generalized
 * registry exists to keep OUT of the kit. A host that has "rectangle" and
 * "bbox-block" tools builds its own `PreferenceRegistry<HostToolbarPrefs>`
 * with `parsePreferences`.
 */

import type { ReactNode } from "react"

import type { ToolItem, ToolSection } from "./toolDock"

// ---------------------------------------------------------------------------
// Generic preference algebra
// ---------------------------------------------------------------------------

/** One field's legal values and its own fallback — never the whole record's. */
export interface PreferenceField<T extends string> {
  readonly values: readonly T[]
  readonly default: T
}

export type PreferenceRegistry<P> = {
  readonly [K in keyof P]: PreferenceField<Extract<P[K], string>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T)
}

/**
 * Field-independent fallback: an unknown, corrupt, or missing field resets to
 * ITS OWN registered default without invalidating its siblings. Donor
 * `parseToolbarPreferences` (:85-105) wrote this ladder once per field by
 * hand; here the registry supplies the ladder generically, over however many
 * fields a host's own preference shape has.
 */
export function parsePreferences<P extends object>(registry: PreferenceRegistry<P>, value: unknown): P {
  const source = isRecord(value) ? value : {}
  const result = {} as P
  for (const key of Object.keys(registry) as (keyof P)[]) {
    const field = registry[key]
    const candidate = source[key as string]
    result[key] = (isOneOf(field.values, candidate) ? candidate : field.default) as P[typeof key]
  }
  return result
}

/**
 * Identity-preserving merge: applying an update that changes nothing returns
 * the SAME object reference, not an equal-but-new one. Donor
 * `updateToolbarPreferences` (:187-205) needed this so a `useSyncExternalStore`
 * subscriber does not re-render on a no-op update; the identity contract is
 * the part worth keeping generic even with storage stripped out, since any
 * host wiring this into its own store subscription needs the same guarantee.
 */
export function mergePreferences<P extends object>(current: P, update: Partial<P>): P {
  const next = { ...current, ...update }
  const keys = Object.keys(next) as (keyof P)[]
  const unchanged = keys.every((key) => next[key] === current[key])
  return unchanged ? current : next
}

// ---------------------------------------------------------------------------
// Arrow preset — a worked example of a derived hint on top of the algebra
// ---------------------------------------------------------------------------

export type ArrowPreset = "straight" | "curve" | "elbow"

/** The cycle A walks, in rotation order (donor toolbarModel.ts:55). Where a
    fresh app STARTS on it is `DEFAULT_TOOLBAR_PREFERENCES` below, not this
    order — see `arrowPresetPressCount`. */
export const ARROW_PRESETS: readonly ArrowPreset[] = ["straight", "curve", "elbow"]

export interface ToolbarPreferences {
  lastArrowPreset: ArrowPreset
}

/**
 * Elbow is the datum, for arrows and for data edges alike.
 *
 * "That is the most common one we use" — so a fresh install draws an elbow
 * before anyone has touched a control, and `lastArrowPreset` is the single
 * value both the arrow tool and the edge layer read to know what that means.
 */
export const DEFAULT_TOOLBAR_PREFERENCES: ToolbarPreferences = {
  lastArrowPreset: "elbow",
}

export const TOOLBAR_PREFERENCES_REGISTRY: PreferenceRegistry<ToolbarPreferences> = {
  lastArrowPreset: { values: ARROW_PRESETS, default: DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset },
}

export function parseToolbarPreferences(value: unknown): ToolbarPreferences {
  return parsePreferences(TOOLBAR_PREFERENCES_REGISTRY, value)
}

export function nextArrowPreset(preset: ArrowPreset): ArrowPreset {
  return ARROW_PRESETS[(ARROW_PRESETS.indexOf(preset) + 1) % ARROW_PRESETS.length]
}

/**
 * How many presses of A, from a freshly started app, land on this preset.
 *
 * The toolbar prints this beside each arrow, and it has to be derived rather
 * than typed: the cycle is a rotation, so moving the starting preset silently
 * renumbers every rung. Deriving it means the hint cannot drift from the key.
 */
export function arrowPresetPressCount(preset: ArrowPreset): number {
  const start = ARROW_PRESETS.indexOf(DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset)
  const target = ARROW_PRESETS.indexOf(preset)
  return ((target - start + ARROW_PRESETS.length) % ARROW_PRESETS.length) + 1
}

/** Every arrow preset in the order A walks them from a fresh start. */
export function arrowPresetsInPressOrder(): ArrowPreset[] {
  return [...ARROW_PRESETS].sort((a, b) => arrowPresetPressCount(a) - arrowPresetPressCount(b))
}

export function arrowPresetForActivation(currentToolId: string, lastArrowPreset: ArrowPreset): ArrowPreset {
  return currentToolId === "arrow" ? nextArrowPreset(lastArrowPreset) : lastArrowPreset
}

// ---------------------------------------------------------------------------
// Arrow preset — the dock rows that make the cycle visible
// ---------------------------------------------------------------------------

/** Donor SystemSketchToolbar.tsx:72-76. */
export const ARROW_PRESET_LABELS: Readonly<Record<ArrowPreset, string>> = {
  straight: "Straight arrow",
  curve: "Curved arrow",
  elbow: "Elbow arrow",
}

/**
 * The popout heading above the arrow rows (donor SystemSketchToolbar.tsx:330).
 * It is the only place the interaction is written down for someone who has
 * never pressed A twice, so it says so in the menu they will open anyway.
 */
export const ARROW_CYCLE_HEADING = "Arrows · repeat A to cycle"

/** A dock row id for one preset — donor `shapeToolForArrowPreset`
    (toolbarModel.ts:153-155). Not a tool id: the host arms its ONE arrow
    tool with the preset this names. */
export type ArrowPresetToolId = `arrow-${ArrowPreset}`

export function arrowPresetToolId(preset: ArrowPreset): ArrowPresetToolId {
  return `arrow-${preset}`
}

/** The inverse, strict: anything that is not exactly `arrow-<preset>` —
    including the bare `arrow` tool id — is not a preset row. Donor
    `isArrowShapeTool` + `arrowPresetFromShapeTool`
    (toolbarIntegration.ts:66-72), folded into one total function. */
export function arrowPresetFromToolId(toolId: string): ArrowPreset | undefined {
  if (!toolId.startsWith("arrow-")) return undefined
  const candidate = toolId.slice("arrow-".length)
  return ARROW_PRESETS.find((preset) => preset === candidate)
}

/**
 * "A", "A × 2", "A × 3" — how many presses of A, from a fresh start, land on
 * this preset (donor SystemSketchToolbar.tsx:84-91). Derived from
 * `arrowPresetPressCount`, never typed, for the same reason that function
 * exists: move the starting preset and every hint renumbers itself.
 */
export function arrowPresetShortcutHint(preset: ArrowPreset): string {
  const count = arrowPresetPressCount(preset)
  return count === 1 ? "A" : `A × ${count}`
}

/**
 * The popout section a host drops into its shape family's `sections`: one
 * heading, then a row per preset IN THE ORDER A REACHES THEM, each carrying
 * its press count as the shortcut hint — the donor's `ARROW_MENU_ITEMS`
 * (SystemSketchToolbar.tsx:84-91), as `ToolDock` data.
 *
 * The host supplies only the icons (this kit ships no icon opinion for a
 * canvas engine's arrow kinds) and wires the rows it gets back: a row id is
 * an `ArrowPresetToolId`, which `arrowPresetFromToolId` turns back into the
 * preset to arm.
 */
export function arrowPresetSection(icons: Readonly<Record<ArrowPreset, ReactNode>>): ToolSection {
  const items: ToolItem[] = arrowPresetsInPressOrder().map((preset) => ({
    id: arrowPresetToolId(preset),
    label: ARROW_PRESET_LABELS[preset],
    icon: icons[preset],
    shortcutHint: arrowPresetShortcutHint(preset),
  }))
  return { heading: ARROW_CYCLE_HEADING, items }
}
