// src/components/blockRegion.views.layout.ts — the pure geometry under
// BlockRegion's VIEWS (Zach, 2026-09-22: "regions do not have a simple view.
// they just have port, expanded and expanded opaque view"): where the line
// splitting control ports from ordinary ports sits, and how tall a rail band
// of `n` slots is.
//
// Pure: no React, no DOM.
//
// PORTED from the sibling branch's `regionViews.layout.ts`
// (`.claude/worktrees/report-visuals-media-356db5/apps/storybook-basics/src/
// components/regionViews.layout.ts`, `regionControlSplitPx` /
// `regionRailBandPx`), restated here because that branch built its views on
// the older `Region` and never landed on this lineage. Its `wallCrossings`
// and `regionHeaderBandPx` are NOT ported: this lane draws no crossing
// markers and no full-width header.
//
// PROVENANCE (docs/ALGORITHM-PROVENANCE.md class (c), ours): the rail pitch
// arithmetic `blockPort.layout.ts` already states (`railPitchPx`,
// `offsetEdgePaddingPx`), read back as "where is the gap between slot n-1
// and slot n". No prior art claimed.

import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, railPitchPx } from "./blockPort.layout";

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
 */
export function regionRailBandPx(slotCount: number, slotMainPx: number = PORT_EDGE_SLOT_MIN_PX, gap: number = RAIL_GAP_PX): number {
  if (slotCount <= 0) return 0;
  return slotCount * slotMainPx + (slotCount - 1) * gap;
}
