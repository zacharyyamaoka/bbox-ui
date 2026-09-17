/**
 * src/components/glyph.layout.ts — ported by value from
 * packages/bbox-ui/src/glyph.layout.ts (Glyph v2, docs/GLYPH-PLAN.md's
 * contract). Same size ladder and override-vs-preset rule; this app has no
 * `layout.ts`/`TEXT_SIZES` of its own to stay independent of, but the
 * ladder is kept in its own file anyway so `glyph.tsx` matches its source
 * shape 1:1 for anyone diffing the two later.
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
  /** px override — when given, wins over `sizePreset`. */
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
 * The override-vs-preset size rule, in one place. `size` absent/undefined
 * is NOT the same as `size: 0` — an explicit 0 is a real override, so this
 * checks `!== undefined`, never falsy/`??`, to keep that case distinguishable.
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
