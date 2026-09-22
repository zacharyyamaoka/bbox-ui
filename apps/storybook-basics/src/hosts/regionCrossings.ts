// src/hosts/regionCrossings.ts — one wall-crossing glue for every host.
//
// `Region` paints `crossings` (frame-local points) and `regionViews.layout.ts`'s
// `wallCrossings` computes them from a drawn polyline and a frame box — both
// pure. What neither can do is MEASURE: the frame's box and the cable's route
// are rendered facts, and they are only comparable once both sit in one
// coordinate space. That measurement is host glue, so it lives here, beside
// the hosts, and not in the kit.
//
// The story bench in `presets/RegionViews.stories.tsx` (`useWallCrossings`)
// did this for a private DOM bench, in the bench's own px. This is the same
// reading generalised to a host's SPACE: the DOM canvas's root (unscaled),
// or React Flow's viewport element (scaled by the zoom, divided back out —
// the same rect-to-offsetWidth ratio `reactFlowHost.tsx`'s `flowSpaceOf`
// uses). Each host already reports its drawn polylines in that space
// (`DomCanvas.onWireGeometry`, `ReactFlowHost.onWireGeometry`), so the glue
// needs nothing else from either one.
import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import type { RegionPoint } from "../components/region";
import { wallCrossings } from "../components/regionViews.layout";
import type { Point } from "../components/trace.layout";

function sameCrossings(a: readonly RegionPoint[], b: readonly RegionPoint[]): boolean {
  return a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 0.01 && Math.abs(p.y - b[i].y) < 0.01);
}

export interface RegionWallCrossings {
  /** Frame-local, ready for `Region.crossings` (via `SceneNodeDecoration`). */
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
 * its polylines relative to). Runs after every render and settles by value,
 * plus one follow-up frame for a host that commits its node positions a
 * render after the scene changed (React Flow's store does) — the same
 * "picked up without a dependency list to get wrong" device the bench's
 * `useWallCrossings` uses.
 */
export function useRegionWallCrossings(spaceOf: () => Element | null | undefined, regionId: string, liveWireIds: readonly string[]): RegionWallCrossings {
  const [paths, setPaths] = useState<Record<string, readonly Point[]>>({});
  const [crossings, setCrossings] = useState<RegionPoint[]>([]);
  // A `null` report DELETES the entry: the host stopped drawing that wire,
  // and a crossing computed off its last path would freeze on the wall.
  const onWireGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    setPaths((previous) => {
      if (points) return { ...previous, [wireId]: points };
      if (!(wireId in previous)) return previous;
      const { [wireId]: _dropped, ...rest } = previous;
      return rest;
    });
  }, []);
  useLayoutEffect(() => {
    const measure = () => {
      const space = spaceOf();
      const frame = space?.querySelector<HTMLElement>(`[data-slot="region-frame"][data-region-id="${regionId}"]`);
      let next: RegionPoint[] = [];
      if (space instanceof HTMLElement && frame) {
        const spaceBox = space.getBoundingClientRect();
        const scale = space.offsetWidth > 0 ? spaceBox.width / space.offsetWidth : 1;
        const frameBox = frame.getBoundingClientRect();
        const rect = {
          x: (frameBox.left - spaceBox.left) / scale,
          y: (frameBox.top - spaceBox.top) / scale,
          w: frameBox.width / scale,
          h: frameBox.height / scale,
        };
        next = liveWireIds.flatMap((wireId) => (paths[wireId] ? wallCrossings(paths[wireId], rect) : []));
      }
      setCrossings((previous) => (sameCrossings(previous, next) ? previous : next));
    };
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });
  const trackedWireIds = useMemo(() => Object.keys(paths).sort(), [paths]);
  return { crossings, onWireGeometry, trackedWireIds };
}
