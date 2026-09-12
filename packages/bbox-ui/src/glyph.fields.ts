/**
 * packages/bbox-ui/src/glyph.fields.ts
 *
 * `Glyph`'s controllable props as data — every `id` below is a real
 * `GlyphProps` key (see `./glyph.tsx`), and every enum/default mirrors
 * `./glyph.layout.ts`. `GLYPH_PRESETS` is the empty-array convention
 * every schema-driven component exports (docs/T1-SPEC.md §0): nothing on
 * the board or in any donor gives Glyph a state axis (§4.1), but a
 * consumer (the generic story generator, the generic inspector) can
 * always `.map()` over it without a null check.
 */
import type { FieldOption, FieldSpec, PresetSpec } from "@bbox-ui/schema";

import { GLYPH_SIZES, GLYPH_SIZE_NAMES, type GlyphSize } from "./glyph.layout";

const SIZE_OPTIONS: FieldOption[] = (Object.keys(GLYPH_SIZES) as GlyphSize[]).map((size) => ({
  value: size,
  label: `${GLYPH_SIZE_NAMES[size]} · ${GLYPH_SIZES[size]}px`,
}));

export const GLYPH_FIELDS: FieldSpec[] = [
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "xl",
    options: SIZE_OPTIONS,
    cascades: true,
  },
  {
    id: "padding",
    label: "Padding",
    kind: "number",
    defaultValue: 0,
    min: 0,
    max: 24,
    step: 1,
    unit: "px",
  },
  {
    id: "children",
    label: "Content",
    kind: "text",
    // NOTE (deviation, same shape as Port.fields.ts's own `children`
    // discussion — docs/T0-SPEC.md §3): `Glyph` has no real destructured
    // default for `children` — omitting it renders an empty square slot,
    // not the literal string below. `FieldValue` has no way to express
    // "undefined" for a `kind: "text"` control, so this is a deliberate
    // demoable placeholder (docs/T1-SPEC.md §4.1), not a fact about the
    // component.
    defaultValue: "🔍",
    hint: "The icon slot. Empty renders the bare square — see the `Empty` story.",
  },
];

/** No board or donor state axis governs anything on Glyph (docs/T1-SPEC.md
 * §4.1) — empty per the every-component-exports-one convention (§0). */
export const GLYPH_PRESETS: PresetSpec[] = [];
