/**
 * packages/bbox-ui/src/glyph.fields.ts
 *
 * `Glyph`'s controllable props as data — every `id` below is a real
 * `GlyphProps` key (see `./glyph.tsx`), and every enum/default mirrors
 * `./glyph.layout.ts`. docs/GLYPH-PLAN.md's contract table is the source;
 * `test/glyph.fields.test.ts` pins every default to the component's own.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import { GLYPH_SIZES, GLYPH_SIZE_NAMES, type GlyphSize } from "./glyph.layout";

const SIZE_OPTIONS: FieldOption[] = (Object.keys(GLYPH_SIZES) as GlyphSize[]).map((size) => ({
  value: size,
  label: `${GLYPH_SIZE_NAMES[size]} · ${GLYPH_SIZES[size]}px`,
}));

export const GLYPH_FIELDS: FieldSpec[] = [
  {
    id: "content",
    label: "Content",
    kind: "glyph",
    defaultValue: "",
    hint: "Click to pick an icon, emoji or image.",
  },
  {
    id: "sizePreset",
    label: "Size",
    kind: "segments",
    defaultValue: "sm",
    options: SIZE_OPTIONS,
    cascades: true,
  },
  {
    id: "size",
    label: "Size (px)",
    kind: "number",
    defaultValue: GLYPH_SIZES.sm,
    min: 8,
    max: 512,
    step: 1,
    unit: "px",
    hint: "Driven by the size preset until a resize handle or this box sets a custom value.",
  },
  {
    id: "padding",
    label: "Padding",
    kind: "number",
    defaultValue: 0,
    min: 0,
    max: 64,
    step: 1,
    unit: "px",
  },
];

/**
 * The three-layer cascade (docs/bbox-ui-three-layer-cascade), one entry
 * per size preset — each `governs: ["size"]`, so a bare `sizePreset="lg"`
 * resolves `size` to 36 without anyone setting `size` explicitly, and a
 * resize handle writing `size` directly (the override layer) always wins
 * over whichever preset is selected.
 */
export const GLYPH_PRESETS: PresetSpec[] = (Object.keys(GLYPH_SIZES) as GlyphSize[]).map((preset) => ({
  id: preset,
  label: GLYPH_SIZE_NAMES[preset],
  selector: "sizePreset",
  governs: ["size"],
  values: { size: GLYPH_SIZES[preset] },
}));
