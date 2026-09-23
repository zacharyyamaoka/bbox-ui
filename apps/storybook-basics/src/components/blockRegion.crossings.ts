// src/components/blockRegion.crossings.ts — where a wire crosses a region
// frame's wall, in the frame's own coordinates. The numbers behind
// `BlockRegion`'s `crossings` prop.
//
// Pure: no React, no DOM. `hosts/regionCrossings.ts` does the MEASURING (the
// frame's box and the cable's route are rendered facts) and calls this.
//
// WHY it is its own file and not part of `blockRegion.views.layout.ts`: this
// one needs the elbow clipper, and that module sits inside `blockRegion.tsx`'s
// import closure — which is exactly what `registry.json`'s `block-region` item
// copies into a consumer's project. `docs/build_menu_registry_items.py`
// rejected the combined file by name ("this registry would install and then
// fail to compile": `./elbow` is a DIRECTORY the walk cannot land as a
// sibling). Nothing the component paints needs a clipper — it is handed
// points — so the dependency belongs on the glue's side of the line, not the
// component's.
//
// PROVENANCE (docs/ALGORITHM-PROVENANCE.md, "Region views"): class (a)
// underneath — the intersection is `elbow/boundaryCrossing.ts`'s
// `boundaryCrossings` (Liang–Barsky, Excalidraw→SystemSketch, byte-for-byte
// donor copy). The only thing written here is the translation into the
// frame's own coordinates. A second clipper would be the "two derivations of
// one number" failure `scene/portEdgeCrossing.ts`'s header already warns
// about.

import { boundaryCrossings, type ElbowPoint, type ElbowRect } from "./elbow";
import type { RegionPoint } from "./blockRegion.views.layout";

/**
 * Where a wire's drawn polyline crosses a region frame's border, in the
 * FRAME's own coordinates (its border-box top-left is 0,0). `path` and
 * `frame` share one space (a fixture's, say); the answer is frame-local
 * because that is what `BlockRegion`'s `crossings` prop paints in.
 *
 * Every crossing, in path order: a cable that enters and leaves yields two.
 * A path that ends ON the border counts as crossing there (the donor's own
 * convention — "a cable drawn to land on the boundary") — which is why a
 * wire into the region's own corner-card port produces none: `Trace` pulls
 * its drawn end back off the wall.
 */
export function wallCrossings(path: readonly ElbowPoint[], frame: ElbowRect): RegionPoint[] {
  if (path.length < 2) return [];
  return boundaryCrossings(path, frame).map((crossing) => ({ x: crossing.point.x - frame.x, y: crossing.point.y - frame.y }));
}
