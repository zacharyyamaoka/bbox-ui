/**
 * src/components/glyph.layout.ts — ported by value from
 * packages/bbox-ui/src/glyph.layout.ts (Glyph v2, docs/GLYPH-PLAN.md's
 * contract). Same size ladder and override-vs-preset rule; this app has no
 * `layout.ts`/`TEXT_SIZES` of its own to stay independent of, but the
 * ladder is kept in its own file anyway so `glyph.tsx` matches its source
 * shape 1:1 for anyone diffing the two later.
 *
 * DONOR LINES (read 2026-09-17; the donor is 53 lines and lives in this
 * same repo, so this is a `diff` away, not an archaeology dig):
 *   • `glyph.layout.ts:11`    `GLYPH_SIZES` — same four rungs, same values.
 *   • `glyph.layout.ts:20-43` the two interfaces.
 *   • `glyph.layout.ts:45-52` `glyphFootprint`, including the `!== undefined`
 *     rule restated below. Arithmetic unchanged.
 *
 * NO PRIOR ART IS CLAIMED, and none applies: the "ladder plus override"
 * rule and the square `size + 2*padding` footprint are this repo's own
 * product decisions, not an algorithm. There is nothing here to cite but
 * the donor.
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
