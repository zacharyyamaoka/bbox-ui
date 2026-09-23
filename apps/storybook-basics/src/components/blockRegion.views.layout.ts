// src/components/blockRegion.views.layout.ts — the pure geometry under
// BlockRegion's VIEWS (Zach, 2026-09-22: "regions do not have a simple view.
// they just have port, expanded and expanded opaque view"): where the line
// splitting control ports from ordinary ports sits, how tall a rail band of
// `n` slots is, and how tall a full-width header band is.
//
// Pure: no React, no DOM. `blockRegion.tsx` paints from these numbers and
// `blockRegion.views.layout.test.ts` pins them without mounting anything.
//
// ── ONE MODULE, NOT TWO (merge, 2026-09-22) ─────────────────────────────
// This file and the sibling lineage's `regionViews.layout.ts` each held a
// byte-identical `regionControlSplitPx` / `regionRailBandPx`, because each
// lineage grew its own views on its own component. Two derivations of one
// number is exactly the failure `scene/portEdgeCrossing.ts`'s header warns
// about — a fix to one silently leaves the other painting the old line — so
// the merge folds `regionViews.layout.ts` in here rather than keeping both.
// `regionHeaderBandPx` arrives from that file unchanged; its `wallCrossings`
// lands in `blockRegion.crossings.ts` for the reason below.
//
// PROVENANCE (docs/ALGORITHM-PROVENANCE.md, "Region views"):
//   • `regionControlSplitPx` / `regionRailBandPx` / `regionHeaderBandPx` —
//     class (c), ours: the rail pitch arithmetic `blockPort.layout.ts`
//     already states (`railPitchPx`, `offsetEdgePaddingPx`,
//     `alignedFirstCentrePx`), read back as "where is the gap between slot
//     n-1 and slot n". No prior art claimed.
//
// WHY `wallCrossings` is NOT here but in `blockRegion.crossings.ts`, one file
// over: it needs the elbow clipper, and this module is inside
// `blockRegion.tsx`'s import closure, which is what `registry.json`'s
// `block-region` item ships. Pulling `./elbow` in behind the component made
// the generator's own sibling check fail — "this registry would install and
// then fail to compile", because `elbow/` is a directory the walk does not
// land as a sibling. Nothing the COMPONENT paints needs a clipper: it is
// handed points. Measured 2026-09-22 by `docs/build_menu_registry_items.py`.

import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, railPitchPx } from "./blockPort.layout";

/** A point in a region frame's OWN coordinates — its border-box top-left is
 *  0,0. What `BlockRegion`'s `crossings` prop paints in. */
export interface RegionPoint {
  x: number;
  y: number;
}

/** How far into the opaque frame the L-split corner box reaches — room for
 *  a `port Any` label beside its dot. A constant, not a measurement: a
 *  longer control-port label crosses the L's upright rather than moving it. */
export const REGION_CONTROL_BOX_WIDTH_PX = 112;

/**
 * The y, measured from the top of the band the rail packs from, of the line
 * that splits the first `controlCount` slots (the control ports) from the
 * ones after them (the ordinary ports) — the midpoint of the gap between
 * slot `n-1`'s bottom and slot `n`'s top on an `aligned`/`start` rail.
 * `null` when there are no control ports: no section, no line.
 *
 * WHY the gap's midpoint and not a slot edge: Zach's port-view sketch draws
 * the line BETWEEN the two groups with room on both sides; a line on slot
 * `n`'s top edge would touch the first ordinary port's label box.
 */
export function regionControlSplitPx(controlCount: number, slotMainPx: number = PORT_EDGE_SLOT_MIN_PX, gap: number = RAIL_GAP_PX): number | null {
  if (controlCount <= 0) return null;
  return controlCount * railPitchPx(slotMainPx, gap) - gap / 2;
}

/**
 * The band `slotCount` aligned slots need, px: `n` slots and `n-1` gaps
 * (0 for no slots) — the same sum `scene/fitToContent.ts`'s
 * `railBandHeightForSlots` makes, restated because `src/components` may not
 * import the scene kit (`layering.test.ts`'s import wall).
 * `blockRegion.views.layout.test.ts` pins the two against each other.
 */
export function regionRailBandPx(slotCount: number, slotMainPx: number = PORT_EDGE_SLOT_MIN_PX, gap: number = RAIL_GAP_PX): number {
  if (slotCount <= 0) return 0;
  return slotCount * slotMainPx + (slotCount - 1) * gap;
}

/**
 * The full-width header band's height for `controlCount` control ports
 * stacked inside it — exactly where the split line would fall under them,
 * with ONE slot's worth as the floor so a header with no ports (or one) is
 * still a bar a glyph and a title fit in.
 *
 * WHY it is the split and not a hugged box: the expanded header card and
 * the opaque face draw the same band (sketch 6's header, sketch 4's opaque
 * "w/ opaque toggled" when the drawing is full-width), and they must agree
 * to the pixel or the toggle visibly moves the rule. One formula, both
 * faces.
 */
export function regionHeaderBandPx(controlCount: number): number {
  return regionControlSplitPx(Math.max(controlCount, 1)) as number;
}
