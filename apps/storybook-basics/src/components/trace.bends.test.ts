/**
 * src/components/trace.bends.test.ts — pure math for `TraceBend`'s
 * chord-relative `(t, o)` frame (docs/TRACE-CONTROL-POINTS-PLAN.md D1).
 * `pnpm exec vitest --project=unit run` (node, no browser — see
 * `vitest.config.ts`'s own `unit` project comment).
 */
import { describe, expect, it } from "vitest";

import { traceBendFrom, traceBendPoint, type TraceBend } from "./trace.bends";
import type { Point } from "./trace.layout";

describe("traceBendPoint / traceBendFrom round-trip", () => {
  const cases: { start: Point; end: Point; bend: TraceBend }[] = [
    { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, bend: { t: 0.5, o: 40 } },
    { start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, bend: { t: 0.25, o: -12 } },
    { start: { x: 10, y: 10 }, end: { x: 110, y: 60 }, bend: { t: 0.75, o: 8 } },
    // A hairpin: t sits behind the start on purpose (D1 says this is legal).
    { start: { x: 50, y: 50 }, end: { x: 150, y: 50 }, bend: { t: -0.4, o: 20 } },
  ];

  it.each(cases)("round-trips $bend over ($start.x,$start.y)->($end.x,$end.y)", ({ start, end, bend }) => {
    const point = traceBendPoint(bend, start, end);
    const back = traceBendFrom(point, start, end);
    expect(back.t).toBeCloseTo(bend.t, 9);
    expect(back.o).toBeCloseTo(bend.o, 9);
  });
});

describe("traceBendPoint — chord-relative scaling (A5)", () => {
  it("doubling the chord length doubles |bend - start| along the chord, offset unchanged", () => {
    const start: Point = { x: 0, y: 0 };
    const shortEnd: Point = { x: 100, y: 0 };
    const longEnd: Point = { x: 200, y: 0 };
    const bend: TraceBend = { t: 0.25, o: 30 };

    const shortPoint = traceBendPoint(bend, start, shortEnd);
    const longPoint = traceBendPoint(bend, start, longEnd);

    // "Along the chord" here is just the x-component: both chords run +x.
    const shortAlong = shortPoint.x - start.x;
    const longAlong = longPoint.x - start.x;
    expect(longAlong).toBeCloseTo(shortAlong * 2, 9);

    // The perpendicular offset (y here) stays 30px regardless of length.
    expect(shortPoint.y - start.y).toBeCloseTo(-30, 9);
    expect(longPoint.y - start.y).toBeCloseTo(-30, 9);
  });

  it("o is the exact perpendicular distance off the chord, t=0", () => {
    const start: Point = { x: 20, y: 20 };
    const end: Point = { x: 20, y: 120 }; // straight down
    const point = traceBendPoint({ t: 0, o: 15 }, start, end);
    // Travelling +y (down screen), left-of-travel is +x.
    expect(point.x - start.x).toBeCloseTo(15, 9);
    expect(point.y - start.y).toBeCloseTo(0, 9);
  });
});

describe("degenerate chord (D1's fallback)", () => {
  it("falls back to the screen axes instead of throwing", () => {
    const start: Point = { x: 40, y: 40 };
    const end: Point = { x: 40, y: 40 };
    const bend: TraceBend = { t: 12, o: 6 };
    expect(() => traceBendPoint(bend, start, end)).not.toThrow();
    const point = traceBendPoint(bend, start, end);
    // t along +x, o along -y.
    expect(point.x).toBeCloseTo(start.x + 12, 9);
    expect(point.y).toBeCloseTo(start.y - 6, 9);

    const back = traceBendFrom(point, start, end);
    expect(back.t).toBeCloseTo(12, 9);
    expect(back.o).toBeCloseTo(6, 9);
  });

  it("is total for a chord under the epsilon but not exactly zero-length", () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 1e-8, y: 0 };
    expect(() => traceBendPoint({ t: 1, o: 1 }, start, end)).not.toThrow();
  });
});
