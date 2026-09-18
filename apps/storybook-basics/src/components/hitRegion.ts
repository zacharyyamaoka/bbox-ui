/**
 * src/components/hitRegion.ts — the one shared paint for `showHitRegion`.
 *
 * WHY this lives in `components/`, not beside the story harness
 * (`src/hitRegions/`): the components themselves paint their hit regions
 * (a `showHitRegion` prop paints the EXISTING hit element — Port's halo
 * span, Trace's hit path — rather than a second overlay that could drift
 * from the real target), so the paint tokens must be importable from the
 * core side. The harness imports components, never the reverse.
 *
 * WHY the region is painted BY the hit element itself and never by a
 * separate measured overlay: the whole exercise exists to avoid a drawn
 * rectangle that does not correspond to real hit-testing (pyblocks'
 * hit-regions report, 2026-08-27, calls that decoration). Painting the
 * element that IS the pointer target makes region and target identical by
 * construction — they share one DOM node, one geometry, one constant.
 *
 * WHY orange (`--bbox-primary`) and not the Chrome-inspector red that
 * `PortEdge`'s `showCard` uses: red already means "layout slot" in this
 * app's dev overlays. Hit regions are a different fact (where the pointer
 * lands, not where layout reserves space), so they get a different colour
 * — the design system's own accent, translucent enough to read what is
 * under it.
 */

/** Translucent wash for an area-shaped hit region (Port's halo circle,
 * Block's border box, a handle circle). */
export const HIT_REGION_FILL =
  "color-mix(in srgb, var(--bbox-primary, #f0883e) 20%, transparent)";

/** The same wash for a STROKE-shaped hit region (Trace's invisible hit
 * path) — one token, so a band and an area read as the same overlay. */
export const HIT_REGION_STROKE = HIT_REGION_FILL;

/** Edge line for the region, so its boundary is readable even where the
 * wash sits over a busy background. */
export const HIT_REGION_LINE =
  "color-mix(in srgb, var(--bbox-primary, #f0883e) 75%, transparent)";

/** CSS `outline` shorthand — outline never affects layout, which is what
 * keeps `showHitRegion` a pure paint fact (toggling it moves nothing). */
export const HIT_REGION_OUTLINE = `1px dashed ${HIT_REGION_LINE}`;
