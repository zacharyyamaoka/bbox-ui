// src/hosts/regionCrossings.ts — one wall-crossing glue for every host.
//
// `BlockRegion` paints `crossings` (frame-local points) and
// `blockRegion.crossings.ts`'s `wallCrossings` computes them from a drawn
// polyline and a frame box — both
// pure. What neither can do is MEASURE: the frame's box and the cable's route
// are rendered facts, and they are only comparable once both sit in one
// coordinate space. That measurement is host glue, so it lives here, beside
// the hosts, and not in the kit.
//
// The story bench in `components/RegionViews.stories.tsx` (`useWallCrossings`)
// did this for a private DOM bench, in the bench's own px. This is the same
// reading generalised to a host's SPACE: the DOM canvas's root (unscaled),
// or React Flow's viewport element (scaled by the zoom, divided back out —
// the same rect-to-offsetWidth ratio `reactFlowHost.tsx`'s `flowSpaceOf`
// uses). Each host already reports its drawn polylines in that space
// (`DomCanvas.onWireGeometry`, `ReactFlowHost.onWireGeometry`), so the glue
// needs nothing else from either one.
//
// GENERALISED 2026-09-22 (lane `frame-auto-port-edges`): the measuring is now
// `frameCrossings.ts`'s `useWallCrossings`, which answers for N containers
// (frames, expanded blocks, region frames) with the richer crossing a port
// needs (which wall, `t`, entering/leaving, which wire). This hook is that
// glue narrowed to ONE region and mapped to the frame-local points
// `BlockRegion.crossings` paints — same numbers, same settle-by-value, same
// follow-up frame; `WallCrossingMirror.stories.tsx` measures it unchanged.
// One measuring recipe, not two.
//
// WHY the import moved (merge, 2026-09-22): this lane delegated away the
// local `wallCrossings` while the region lineages were being reconciled into
// one component, so `RegionPoint` now comes from `blockRegion.views.layout`
// — `components/region.ts` no longer exists. The delegation is this lane's;
// the path is the reconciliation's. Neither side alone had both.
import type { RegionPoint } from "../components/blockRegion.views.layout";
import type { Point } from "../components/trace.layout";
import { useWallCrossings } from "./frameCrossings";

export interface RegionWallCrossings {
  /** Frame-local, ready for `BlockRegion.crossings` (via `SceneNodeDecoration`). */
  crossings: RegionPoint[];
  /** Hand to the host's own `onWireGeometry`. `null` drops the wire. */
  onWireGeometry(wireId: string, points: readonly Point[] | null): void;
  /** The wires whose drawn polyline this glue currently holds — what a
   *  host's retraction (`null`, on a lost route or on unmount) empties. */
  trackedWireIds: string[];
}

/**
 * The wall crossings of `regionId`'s frame by every wire in `liveWireIds`,
 * measured in the space `spaceOf()` returns (the element the host reports
 * its polylines relative to). Every live wire is tested against the frame —
 * no `through` filter, no end skipping — exactly the reading this hook had
 * before it delegated to `useWallCrossings`.
 */
export function useRegionWallCrossings(spaceOf: () => Element | null | undefined, regionId: string, liveWireIds: readonly string[]): RegionWallCrossings {
  const glue = useWallCrossings(
    spaceOf,
    [regionId],
    liveWireIds.map((id) => ({ id })),
    (id) => [`[data-slot="region-frame"][data-region-id="${id}"]`],
  );
  return { crossings: glue.markersOf(regionId), onWireGeometry: glue.onWireGeometry, trackedWireIds: glue.trackedWireIds };
}
