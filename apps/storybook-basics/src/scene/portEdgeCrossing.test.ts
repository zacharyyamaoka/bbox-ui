// src/scene/portEdgeCrossing.test.ts — the primitive Zach named, tested
// hardest, because everything else in this lane stands on it.
//
// THE ORACLE IS INDEPENDENT WHERE IT MATTERS. `alongSide` and the crossing
// POINT are checked against a closed form derived by hand from similar
// triangles — `y = y0 + (X − x0)·(y1 − y0)/(x1 − x0)` — which is a
// different derivation path from the parametric Liang–Barsky clipper under
// test, not a restatement of it. Asserting the clipper's own formula back
// at it would be the implementation grading its own homework.
//
// The clipper ITSELF already has a donor suite
// (`components/elbow/boundaryCrossing.test.ts`, written against SystemSketch
// by SystemSketch before this repo existed). These tests deliberately do
// not re-cover it; they cover the two things this module adds — the
// along-the-wall remap and the route/chord provenance.

import { describe, expect, it } from "vitest";

import type { ElbowRect } from "../components/elbow";
import { alongSide, portEdgeCrossings, portEdgeLocation, portEdgeLocationPerBox, tracePolyline } from "./portEdgeCrossing";

/** A 100×100 box at the origin — every expected number below is readable
 *  off it by eye, which is the point of choosing it. */
const BOX: ElbowRect = { x: 0, y: 0, w: 100, h: 100 };

/** INDEPENDENT ORACLE: where a segment meets the vertical line `x = X`, by
 *  similar triangles. Not the clipper's parametric form. */
function meetsVerticalAt(a: { x: number; y: number }, b: { x: number; y: number }, X: number): number {
  return a.y + ((X - a.x) * (b.y - a.y)) / (b.x - a.x);
}

describe("alongSide — the number the donor does not compute", () => {
  const bounds = [0, 0, 100, 100] as const;

  it("reads left→right on the horizontal walls", () => {
    expect(alongSide(bounds, "top", { x: 25, y: 0 })).toBe(0.25);
    expect(alongSide(bounds, "bottom", { x: 80, y: 100 })).toBe(0.8);
  });

  it("reads top→bottom on the vertical walls — the rail's own direction", () => {
    // blockPort.layout.ts's `railBoxFor` lays a column-axis rail from
    // `bandStart` DOWNWARD, so a `t` handed to it must agree.
    expect(alongSide(bounds, "left", { x: 0, y: 25 })).toBe(0.25);
    expect(alongSide(bounds, "right", { x: 100, y: 90 })).toBe(0.9);
  });

  it("clamps rather than reporting a position off the end of the wall", () => {
    expect(alongSide(bounds, "top", { x: -40, y: 0 })).toBe(0);
    expect(alongSide(bounds, "top", { x: 140, y: 0 })).toBe(1);
  });

  it("answers 0 for a wall with no length instead of NaN", () => {
    // A zero-extent box is silly but legal input; `0/0` would poison every
    // downstream comparison silently.
    expect(alongSide([5, 5, 5, 5], "top", { x: 5, y: 5 })).toBe(0);
    expect(alongSide([5, 5, 5, 5], "left", { x: 5, y: 5 })).toBe(0);
  });
});

describe("portEdgeLocation — trace in, location out", () => {
  it("puts a horizontal cable's exit on the right wall, at its own height", () => {
    const hit = portEdgeLocation([{ x: 50, y: 30 }, { x: 250, y: 30 }], BOX);
    expect(hit).not.toBeNull();
    expect(hit!.side).toBe("right");
    expect(hit!.point).toEqual({ x: 100, y: 30 });
    expect(hit!.t).toBe(0.3);
    expect(hit!.direction).toBe("exit");
    expect(hit!.by).toBe("route");
  });

  it("agrees with the hand-derived closed form on a DIAGONAL segment", () => {
    const a = { x: 20, y: 10 };
    const b = { x: 300, y: 220 };
    const hit = portEdgeLocation([a, b], BOX)!;
    expect(hit.side).toBe("right");
    // The oracle, computed a different way entirely.
    const expectedY = meetsVerticalAt(a, b, 100);
    expect(hit.point.x).toBeCloseTo(100, 10);
    expect(hit.point.y).toBeCloseTo(expectedY, 10);
    expect(hit.t).toBeCloseTo(expectedY / 100, 10);
  });

  it("finds an ENTRY on the wall the cable arrives through", () => {
    const hit = portEdgeLocation([{ x: -60, y: 75 }, { x: 40, y: 75 }], BOX, { direction: "enter" })!;
    expect(hit.side).toBe("left");
    expect(hit.t).toBe(0.75);
    expect(hit.direction).toBe("enter");
  });

  it("returns null rather than answering with the WRONG direction", () => {
    // A cable that only ever enters has no exit. Silently handing back the
    // entry would place a port on the opposite wall.
    const entering = [{ x: -60, y: 50 }, { x: 40, y: 50 }];
    expect(portEdgeLocation(entering, BOX, { direction: "exit" })).toBeNull();
    expect(portEdgeLocation(entering, BOX, { direction: "enter" })).not.toBeNull();
  });

  it("is empty for a cable wholly inside, and for one that misses entirely", () => {
    expect(portEdgeCrossings([{ x: 10, y: 10 }, { x: 90, y: 90 }], BOX)).toEqual([]);
    expect(portEdgeCrossings([{ x: 500, y: 10 }, { x: 600, y: 90 }], BOX)).toEqual([]);
  });

  it("is empty for a degenerate path, rather than inventing a second point", () => {
    expect(portEdgeCrossings([], BOX)).toEqual([]);
    expect(portEdgeCrossings([{ x: 50, y: 50 }], BOX)).toEqual([]);
  });

  it("reports EVERY crossing of a weaving cable, in path order", () => {
    const weave = [
      { x: 50, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 20 },
      { x: 50, y: 20 },
    ];
    const all = portEdgeCrossings(weave, BOX);
    expect(all.map((hit) => hit.direction)).toEqual(["exit", "enter"]);
    expect(all.map((hit) => hit.side)).toEqual(["right", "right"]);
    expect(all.map((hit) => hit.t)).toEqual([0.5, 0.2]);
    // Distances order them, which is what lets a caller pick "the last one".
    expect(all[0].distance).toBeLessThan(all[1].distance);
  });

  it("takes the LAST entry, not the first, when asked for one", () => {
    const weave = [
      { x: -50, y: 10 },
      { x: 50, y: 10 },
      { x: -50, y: 40 },
      { x: 50, y: 90 },
    ];
    const entries = portEdgeCrossings(weave, BOX).filter((hit) => hit.direction === "enter");
    expect(entries.length).toBeGreaterThan(1);
    expect(portEdgeLocation(weave, BOX, { direction: "enter" })!.t).toBe(entries[entries.length - 1].t);
  });
});

describe("the inset is part of the answer", () => {
  it("normalises t against the INSET wall, so it stays inside 0..1", () => {
    // Grow the box by 10: the wall is now at x = 110 and spans y −10..110.
    const hit = portEdgeLocation([{ x: 50, y: -5 }, { x: 250, y: -5 }], BOX, { inset: 10 })!;
    expect(hit.side).toBe("right");
    expect(hit.point.x).toBe(110);
    // Against the UN-inset box this y would read as −0.05 — outside the
    // wall it was measured on, which is the bug this test pins.
    expect(hit.t).toBeCloseTo(0.0417, 3);
    expect(hit.t).toBeGreaterThanOrEqual(0);
    expect(hit.t).toBeLessThanOrEqual(1);
  });

  it("a negative inset catches a cable that stops ON the edge", () => {
    const landing = [{ x: 50, y: 50 }, { x: 100, y: 50 }];
    expect(portEdgeLocation(landing, BOX, { inset: -2 })!.point.x).toBe(98);
  });
});

describe("route vs chord — the honesty field", () => {
  it("says 'route' when the cable had real vertices", () => {
    const route = { points: [{ x: 50, y: 50 }, { x: 250, y: 50 }] };
    const resolved = tracePolyline(route, { start: { x: 50, y: 50 }, end: { x: 250, y: 50 } });
    expect(resolved.by).toBe("route");
    expect(portEdgeLocation(resolved.points, BOX)!.by).toBe("route");
  });

  it("says 'chord' when the route is a Bezier with no vertices", () => {
    // `TraceRoute.points` is null for `curved` — its own deliberate
    // contract ("null is not 'not computed yet' — it is the honest
    // answer"). The chord stands in; `by` refuses to pretend otherwise.
    const curved = { points: null };
    const resolved = tracePolyline(curved, { start: { x: 50, y: 20 }, end: { x: 250, y: 20 } });
    expect(resolved.by).toBe("chord");
    expect(resolved.points).toEqual([{ x: 50, y: 20 }, { x: 250, y: 20 }]);
    const hit = portEdgeLocation({ start: { x: 50, y: 20 }, end: { x: 250, y: 20 } }, BOX)!;
    expect(hit.by).toBe("chord");
    expect(hit.t).toBe(0.2);
  });

  it("says 'chord' for a one-point route too — a single vertex is not a path", () => {
    expect(tracePolyline({ points: [{ x: 1, y: 1 }] }, { start: { x: 0, y: 0 }, end: { x: 9, y: 9 } }).by).toBe("chord");
    expect(tracePolyline(undefined, { start: { x: 0, y: 0 }, end: { x: 9, y: 9 } }).by).toBe("chord");
  });
});

describe("nested containers in one pass", () => {
  it("derives a port per level, skipping boxes the cable never leaves", () => {
    const cable = [{ x: 40, y: 50 }, { x: 400, y: 50 }];
    const found = portEdgeLocationPerBox(cable, [
      { key: "block", box: { x: 30, y: 30, w: 40, h: 40 } },
      { key: "region", box: BOX },
      { key: "frame", box: { x: -50, y: -50, w: 300, h: 300 } },
      { key: "elsewhere", box: { x: 800, y: 800, w: 10, h: 10 } },
    ]);
    expect([...found.keys()].sort()).toEqual(["block", "frame", "region"]);
    expect(found.get("block")!.point.x).toBe(70);
    expect(found.get("region")!.point.x).toBe(100);
    expect(found.get("frame")!.point.x).toBe(250);
    // Each level reads its own wall, so the t values genuinely differ.
    expect(found.get("block")!.t).toBe(0.5);
    expect(found.get("frame")!.t).toBeCloseTo(100 / 300, 10);
  });
});
