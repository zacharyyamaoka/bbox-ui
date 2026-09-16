/**
 * packages/bbox-ui/src/glyph.layout.ts
 *
 * Glyph's own size ladder — deliberately NOT `layout.ts`'s `TEXT_SIZES`
 * (`layout.ts` is frozen for T1, and `Port` independently needs its own
 * 18px rung too — see docs/T1-SPEC.md §0). 18/24/36/44 mirror
 * `TEXT_SIZES{md,lg,xl}` + `META_FONT_PX` BY VALUE, not by import, so
 * `BlockGlyph`'s own `ICON_RATIO`-derived sizing (22/32/40) is untouched —
 * the two ladders coexist on purpose (docs/T1-SPEC.md §4.1).
 */
export const GLYPH_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type GlyphSize = keyof typeof GLYPH_SIZES;
export const GLYPH_SIZE_NAMES: Record<GlyphSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};

export interface GlyphFootprintInput {
  sizePreset?: GlyphSize;
  /** px override — when given, wins over `sizePreset` (docs/GLYPH-PLAN.md's
   *  contract: the override layer of the size cascade, written by a
   *  resize handle or the panel's own number box). */
  size?: number;
  padding?: number;
}

export interface GlyphFootprint {
  /** Resolved side length of the glyph itself, px. */
  size: number;
  padding: number;
  /** Outer box a host places on canvas — `size + 2*padding`, square. */
  w: number;
  h: number;
}

/**
 * The override-vs-preset size rule, in one place, so a host adapter (the
 * tldraw shape util, the React Flow node) never re-derives it. `size`
 * absent/undefined is NOT the same as `size: 0` — an explicit 0 is a real
 * override a resize handle can legally drag to, so this checks
 * `!== undefined`, never falsy/`??`, to keep that case distinguishable.
 */
export function glyphFootprint({
  sizePreset = "sm",
  size,
  padding = 0,
}: GlyphFootprintInput): GlyphFootprint {
  const resolvedSize = size !== undefined ? size : GLYPH_SIZES[sizePreset];
  const outer = resolvedSize + 2 * padding;
  return { size: resolvedSize, padding, w: outer, h: outer };
}
