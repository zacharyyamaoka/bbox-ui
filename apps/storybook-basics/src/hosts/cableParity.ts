// src/hosts/cableParity.ts — the measured parity claim between the DOM
// canvas and its React Flow twin (docs/peps/0005-dom-canvas-stays-static.md):
// for the same scene, both hosts draw every cable on the same waypoints.
//
// Two readings, deliberately independent of each other:
//   1. the polyline each host REPORTS it drew (`onWireGeometry`, recorded
//      onto the pane element by `useWireGeometryRecorder`), and
//   2. the box of the path each host actually PAINTED
//      (`getBoundingClientRect` on the `trace-line`), relative to that host's
//      own origin — the DOM canvas's root, React Flow's viewport element.
// (1) alone would pass a React Flow edge whose route was right but whose
// paint sat in the wrong coordinate space; (2) alone cannot see a bend that
// moved inside the same bounding box.
//
// "Normalising for the container offset" is the space each host reports in:
// the DOM canvas's root padding box, and React Flow's flow space, which at a
// `{ x: 0, y: 0, zoom: 1 }` viewport is the same numbers.
import { useCallback, useRef } from "react";
import { expect } from "storybook/test";

import type { Point } from "../components/trace.layout";

export const PARITY_TOLERANCE_PX = 1;

/**
 * `onWireGeometry` for a host, recording every reported polyline as JSON on
 * the element `ref` lands on (`data-wire-points`) so a play function can
 * read what the host drew without reaching into React state. `forward` is
 * called too, for a caller that also needs the geometry (the crossing glue).
 */
export function useWireGeometryRecorder(forward?: (wireId: string, points: readonly Point[] | null) => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const record = useRef<Record<string, readonly Point[]>>({});
  const forwardRef = useRef(forward);
  forwardRef.current = forward;
  const onWireGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    const { [wireId]: _previous, ...rest } = record.current;
    record.current = points ? { ...rest, [wireId]: points.map(({ x, y }) => ({ x, y })) } : rest;
    if (ref.current) ref.current.dataset.wirePoints = JSON.stringify(record.current);
    forwardRef.current?.(wireId, points);
  }, []);
  return { ref, onWireGeometry };
}

export function recordedWirePoints(pane: HTMLElement): Record<string, Point[]> {
  return JSON.parse(pane.dataset.wirePoints ?? "{}") as Record<string, Point[]>;
}

/** The painted line of one wire, as a box relative to `origin`. */
function paintedBox(host: HTMLElement, origin: Element, wireId: string): { x: number; y: number; w: number; h: number } {
  const line = host.querySelector(`[data-wire-id="${wireId}"] [data-slot="trace-line"]:not([data-sketch="true"])`);
  if (!line) throw new Error(`no painted trace-line for wire ${wireId}`);
  const box = line.getBoundingClientRect();
  const at = origin.getBoundingClientRect();
  return { x: box.left - at.left, y: box.top - at.top, w: box.width, h: box.height };
}

/**
 * Every wire in `wireIds` is drawn by both hosts, on the same waypoints
 * (±`PARITY_TOLERANCE_PX` per coordinate, same vertex count), and its
 * painted line sits in the same place relative to each host's origin.
 */
export function expectSameCables(domPane: HTMLElement, reactFlowPane: HTMLElement, wireIds: readonly string[]): void {
  const dom = recordedWirePoints(domPane);
  const reactFlow = recordedWirePoints(reactFlowPane);
  const domHost = domPane.querySelector<HTMLElement>('[data-host="dom-canvas"]')!;
  const rfHost = reactFlowPane.querySelector<HTMLElement>('[data-host="react-flow"]')!;
  const rfOrigin = rfHost.querySelector(".react-flow__viewport")!;
  // Every cable is the kit's: none fell back to React Flow's stock path.
  expect(rfHost.querySelectorAll('[data-edge-route="stock"]').length, "React Flow edges on the stock fallback path").toBe(0);
  for (const wireId of wireIds) {
    const a = dom[wireId];
    const b = reactFlow[wireId];
    expect(a, `DOM canvas reported no polyline for ${wireId}`).toBeDefined();
    expect(b, `React Flow reported no polyline for ${wireId}`).toBeDefined();
    expect(b.length, `${wireId}: vertex count`).toBe(a.length);
    a.forEach((point, index) => {
      const other = b[index];
      const off = Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y));
      expect(off, `${wireId} vertex ${index}: DOM (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) vs React Flow (${other.x.toFixed(1)}, ${other.y.toFixed(1)})`).toBeLessThanOrEqual(PARITY_TOLERANCE_PX);
    });
    const painted = [paintedBox(domHost, domHost, wireId), paintedBox(rfHost, rfOrigin, wireId)];
    for (const key of ["x", "y", "w", "h"] as const) {
      expect(Math.abs(painted[0][key] - painted[1][key]), `${wireId}: painted ${key} DOM ${painted[0][key].toFixed(1)} vs React Flow ${painted[1][key].toFixed(1)}`).toBeLessThanOrEqual(PARITY_TOLERANCE_PX);
    }
  }
}
