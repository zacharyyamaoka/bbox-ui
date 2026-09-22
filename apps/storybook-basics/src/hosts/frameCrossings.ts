// src/hosts/frameCrossings.ts — one wall-crossing glue for every host and
// every wall container (a frame, an expanded block, a region's frame).
//
// `scene/wallPort.ts`'s `wallCrossings` is pure: a polyline and some boxes
// in one space in, the crossings out. What it cannot do is MEASURE — the
// container's box and the cable's route are rendered facts, comparable
// only once both sit in one coordinate space. That measurement is host glue
// (`regionCrossings.ts` did it for one region; this is the same reading
// generalised to N containers and to the richer answer a port needs: which
// wall, how far along it, entering or leaving, which wire).
//
// Each host already reports its drawn polylines in its own space
// (`DomCanvas.onWireGeometry`, `ReactFlowHost.onWireGeometry`), so the glue
// needs nothing else from either one — the same device `regionCrossings.ts`
// documents, which now delegates to this file.
//
// WHY the crossings are computed EVERY render and never only when
// `frame.crossings` is on (Zach, 2026-09-22: "you need to be able to like
// detect those ports, even if you don't choose to draw them"): the answer
// is what a port view, a lint, or a mode switch reads. Drawing is the
// consumer's choice, made after asking.

import { useCallback, useLayoutEffect, useMemo, useState } from "react";

import type { ElbowRect } from "../components/elbow";
import type { RegionPoint } from "../components/region";
import type { Point } from "../components/trace.layout";
import { wallCrossings, type WallCrossing } from "../scene/wallPort";

/** One wire the glue may hold a polyline for. `through` absent = test the
 *  cable against EVERY container (a plain "does it cross this box" — the
 *  region mirror's reading); present = only the containers the cable is
 *  genuinely inside (`Wire.through`). `ends` absent = skip nothing. */
export interface CrossingWire {
  id: string;
  through?: readonly string[];
  ends?: readonly string[];
}

/** A crossing that also knows which WIRE made it. In SPACE px (the element
 *  `spaceOf()` returns), not box-local. */
export interface WireWallCrossing extends WallCrossing {
  wireId: string;
}

export interface WallCrossingsGlue {
  /** Every crossing of every tracked wire against every measured
   *  container, in space px. */
  crossings: WireWallCrossing[];
  /** Each container's measured box, in space px. Absent = not on screen. */
  boxes: ReadonlyMap<string, ElbowRect>;
  /** The crossings of ONE container, box-local — ready for
   *  `Frame.crossings` / `Region.crossings`. */
  markersOf(containerId: string): RegionPoint[];
  /** Hand to the host's own `onWireGeometry`. `null` drops the wire. */
  onWireGeometry(wireId: string, points: readonly Point[] | null): void;
  /** The wires whose drawn polyline this glue currently holds. */
  trackedWireIds: string[];
}

/**
 * Where a container's WALL box is in the DOM: a frame's own box (its root
 * also carries the title, which is not a wall), a region's frame, else the
 * block's owner box. The first selector that matches wins.
 */
export function wallBoxSelectorsFor(containerId: string): string[] {
  return [
    `[data-frame-id="${containerId}"] > [data-slot="frame-box"]`,
    `[data-slot="region-frame"][data-region-id="${containerId}"]`,
    `[data-block-id="${containerId}"]`,
  ];
}

function sameCrossings(a: readonly WireWallCrossing[], b: readonly WireWallCrossing[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        p.wireId === b[i].wireId &&
        p.containerId === b[i].containerId &&
        p.side === b[i].side &&
        p.direction === b[i].direction &&
        Math.abs(p.point.x - b[i].point.x) < 0.01 &&
        Math.abs(p.point.y - b[i].point.y) < 0.01,
    )
  );
}

function sameBoxes(a: ReadonlyMap<string, ElbowRect>, b: ReadonlyMap<string, ElbowRect>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, box] of a) {
    const other = b.get(id);
    if (!other) return false;
    if (Math.abs(box.x - other.x) >= 0.01 || Math.abs(box.y - other.y) >= 0.01 || Math.abs(box.w - other.w) >= 0.01 || Math.abs(box.h - other.h) >= 0.01) return false;
  }
  return true;
}

/** An element's box in the SPACE's px: client px minus the space's origin,
 *  divided by the space's rect-to-offsetWidth ratio (React Flow's zoom; 1
 *  for the DOM canvas) — the same recipe `reactFlowHost.tsx`'s
 *  `flowSpaceOf` uses. */
export function spaceRectOf(space: HTMLElement, element: Element): ElbowRect {
  const spaceBox = space.getBoundingClientRect();
  const scale = space.offsetWidth > 0 ? spaceBox.width / space.offsetWidth : 1;
  const rect = element.getBoundingClientRect();
  return { x: (rect.left - spaceBox.left) / scale, y: (rect.top - spaceBox.top) / scale, w: rect.width / scale, h: rect.height / scale };
}

/**
 * The wall crossings of every container in `containerIds` by every wire in
 * `wires`, measured in the space `spaceOf()` returns. Runs after every
 * render and settles by value, plus one follow-up frame for a host that
 * commits its node positions a render after the scene changed (React
 * Flow's store does) — `regionCrossings.ts`'s own device, kept.
 */
export function useWallCrossings(
  spaceOf: () => Element | null | undefined,
  containerIds: readonly string[],
  wires: readonly CrossingWire[],
  selectorsFor: (containerId: string) => string[] = wallBoxSelectorsFor,
): WallCrossingsGlue {
  const [paths, setPaths] = useState<Record<string, readonly Point[]>>({});
  const [crossings, setCrossings] = useState<WireWallCrossing[]>([]);
  const [boxes, setBoxes] = useState<ReadonlyMap<string, ElbowRect>>(new Map());
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
      const nextBoxes = new Map<string, ElbowRect>();
      let next: WireWallCrossing[] = [];
      if (space instanceof HTMLElement) {
        for (const containerId of containerIds) {
          for (const selector of selectorsFor(containerId)) {
            const element = space.querySelector(selector);
            if (element) {
              nextBoxes.set(containerId, spaceRectOf(space, element));
              break;
            }
          }
        }
        for (const wire of wires) {
          const points = paths[wire.id];
          if (!points) continue;
          const found = wallCrossings({ points, boxes: nextBoxes, through: wire.through ?? containerIds, ends: wire.ends });
          for (const crossing of found) next.push({ ...crossing, wireId: wire.id });
        }
        next = next.sort((a, b) => (a.wireId < b.wireId ? -1 : a.wireId > b.wireId ? 1 : a.distance - b.distance));
      }
      setBoxes((previous) => (sameBoxes(previous, nextBoxes) ? previous : nextBoxes));
      setCrossings((previous) => (sameCrossings(previous, next) ? previous : next));
    };
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  });
  const trackedWireIds = useMemo(() => Object.keys(paths).sort(), [paths]);
  const markersOf = useCallback(
    (containerId: string): RegionPoint[] => {
      const box = boxes.get(containerId);
      if (!box) return [];
      return crossings.filter((crossing) => crossing.containerId === containerId).map((crossing) => ({ x: crossing.point.x - box.x, y: crossing.point.y - box.y }));
    },
    [boxes, crossings],
  );
  return { crossings, boxes, markersOf, onWireGeometry, trackedWireIds };
}
