import type { ReactNode } from "react";

/**
 * packages/glyph-picker/src/resolveLucideName.ts
 *
 * STUB — phase 3 replaces this with SystemSketch's `lucideLibrary.ts`
 * lookup (one lazy-loaded JSON chunk of all 1,818 icon names, D6) and
 * returns the real icon element. The name and signature are frozen now so
 * `GlyphResolverProvider`'s `renderLucide` (`@bbox-ui/core`'s
 * `glyph.tsx`) can be wired to `resolveLucideName` from day one — a host
 * mounting the provider today gets "no icon yet" (`null`, the same
 * `data-unresolved` path a missing provider takes) rather than a function
 * that doesn't exist.
 */
export function resolveLucideName(_name: string): ReactNode | null {
  return null;
}
