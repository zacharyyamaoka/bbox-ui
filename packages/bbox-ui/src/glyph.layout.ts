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
