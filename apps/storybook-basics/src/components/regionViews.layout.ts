// src/components/regionViews.layout.ts — the pure geometry under the region
// VIEWS Zach sketched on 2026-09-22 ("Please create stories that show region
// in different views. Simple: not support — but there is port and expanded,
// and expanded opaque."): where the line splitting control ports from
// ordinary ports sits, how tall a full-width header band is, and where a
// wire crosses the frame's wall.
//
// Pure: no React, no DOM. `region.tsx` paints from these numbers and
// `regionViews.layout.test.ts` pins them without mounting anything.
//
// PROVENANCE (docs/ALGORITHM-PROVENANCE.md, "Region views"):
//   • `regionControlSplitPx` / `regionRailBandPx` — class (c), ours: the rail
//     pitch arithmetic `blockPort.layout.ts` already states (`railPitchPx`,
//     `offsetEdgePaddingPx`, `alignedFirstCentrePx`), read back as "where is
//     the gap between slot n-1 and slot n". No prior art claimed.
//   • `wallCrossings` — class (a) underneath: the intersection is
//     `elbow/boundaryCrossing.ts`'s `boundaryCrossings` (Liang–Barsky,
//     Excalidraw→SystemSketch, byte-for-byte donor copy). The only thing
//     written here is the translation into the frame's own coordinates.
//     A second clipper would be the "two derivations of one number" failure
//     `scene/portEdgeCrossing.ts`'s header already warns about.

import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, railPitchPx } from "./blockPort.layout";
import { boundaryCrossings, type ElbowPoint, type ElbowRect } from "./elbow";

export interface RegionPoint {
  x: number;
  y: number;
}

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
 * `railBandHeightForSlots` makes, restated here because `src/components`
 * may not import the scene kit (`layering.test.ts`'s import wall).
 * `regionViews.layout.test.ts` pins the two against each other.
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

/**
 * Where a wire's drawn polyline crosses a region frame's border, in the
 * FRAME's own coordinates (its border-box top-left is 0,0). `path` and
 * `frame` share one space (a fixture's, say); the answer is frame-local
 * because that is what `Region`'s `crossings` prop paints in.
 *
 * Every crossing, in path order: a cable that enters and leaves yields two.
 * A path that ends ON the border counts as crossing there (the donor's own
 * convention — "a cable drawn to land on the boundary") — which is why a
 * wire into the region's own corner-card port produces none: `Trace` pulls
 * its drawn end back by `TRACE_TERMINAL_GAP`, off the wall.
 */
export function wallCrossings(path: readonly ElbowPoint[], frame: ElbowRect): RegionPoint[] {
  if (path.length < 2) return [];
  return boundaryCrossings(path, frame).map((crossing) => ({ x: crossing.point.x - frame.x, y: crossing.point.y - frame.y }));
}
