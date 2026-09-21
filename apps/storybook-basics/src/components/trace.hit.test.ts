// src/components/trace.hit.test.ts — does the grab polyline follow the line
// that is actually PAINTED?
//
// THE ORACLE IS THE `d` STRING, not a second call to the same control-point
// helper. `traceHitPolyline` asks `getConnectionControlPoints`; this file
// parses the cubic out of `geometry.path` — the string `TraceBody` hands to
// SVG — and evaluates it with its own de Casteljau. If the two ever stop
// agreeing, the polyline has stopped describing the drawn cable, which is
// the entire failure this function exists to prevent.
import { describe, expect, it } from "vitest";

import { traceGeometry, type TraceRouteRequest } from "./trace";
import { TRACE_HIT_CORRIDOR_PX, traceHitPolyline } from "./trace.hit";
import type { Point } from "./trace.layout";

const FROM = { x: 40, y: 80, dir: "right" } as const;
const TO = { x: 340, y: 240, dir: "left" } as const;

/** `M x y C c1 c2 end` → the four points, read off the painted string. */
function parseCubic(path: string): [Point, Point, Point, Point] {
  const numbers = path.match(/-?\d+(\.\d+)?/g);
  if (!numbers || numbers.length < 8) throw new Error(`not a single cubic: ${path}`);
  const n = numbers.map(Number);
  return [
    { x: n[0], y: n[1] },
    { x: n[2], y: n[3] },
    { x: n[4], y: n[5] },
    { x: n[6], y: n[7] },
  ];
}

/** De Casteljau — deliberately a different expression from `trace.hit.ts`'s
 *  Bernstein form, so a sign error in one cannot hide in the other. */
function deCasteljau(points: [Point, Point, Point, Point], t: number): Point {
  let level: Point[] = points;
  while (level.length > 1) {
    const next: Point[] = [];
    for (let i = 0; i + 1 < level.length; i++) {
      next.push({ x: level[i].x + (level[i + 1].x - level[i].x) * t, y: level[i].y + (level[i + 1].y - level[i].y) * t });
    }
    level = next;
  }
  return level[0];
}

/** Shortest distance from `point` to a polyline. */
function distanceToPolyline(polyline: readonly Point[], point: Point): number {
  let best = Infinity;
  for (let i = 0; i + 1 < polyline.length; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)));
  }
  return best;
}

describe("traceHitPolyline", () => {
  it("returns the router's own vertices untouched for every routing that has them", () => {
    for (const routing of ["straight", "slanted", "elbow"] as const) {
      const geometry = traceGeometry({ from: FROM, to: TO, routing } satisfies TraceRouteRequest);
      expect(geometry.points, `${routing} must carry exact vertices`).not.toBeNull();
      expect(traceHitPolyline(geometry), `${routing} must not be re-routed`).toEqual(geometry.points);
    }
  });

  it("flattens a curve onto the cubic that is PAINTED, well inside the corridor", () => {
    const geometry = traceGeometry({ from: FROM, to: TO, routing: "curved" });
    expect(geometry.points, "a cubic has no vertices — that is the premise").toBeNull();

    const polyline = traceHitPolyline(geometry);
    const drawn = parseCubic(geometry.path);
    let worst = 0;
    for (let step = 0; step <= 200; step++) {
      worst = Math.max(worst, distanceToPolyline(polyline, deCasteljau(drawn, step / 200)));
    }
    // Every point of the painted curve is grabbable: the flattening error has
    // to disappear inside the corridor's half-width, not merely be "small".
    expect(worst).toBeLessThan(TRACE_HIT_CORRIDOR_PX / 2);
    expect(worst).toBeLessThan(1);
  });

  it("is NOT the chord — the failure it replaces would be caught here", () => {
    const geometry = traceGeometry({ from: FROM, to: TO, routing: "curved" });
    const chord: Point[] = [
      { x: geometry.start.x, y: geometry.start.y },
      { x: geometry.end.x, y: geometry.end.y },
    ];
    const drawn = parseCubic(geometry.path);
    let worstChord = 0;
    for (let step = 0; step <= 200; step++) {
      worstChord = Math.max(worstChord, distanceToPolyline(chord, deCasteljau(drawn, step / 200)));
    }
    // The measured gap the shipped `points ?? [start, end]` fallback left.
    expect(worstChord).toBeGreaterThan(TRACE_HIT_CORRIDOR_PX);
  });

  it("follows a BENT curve's quadratic, not the default cubic", () => {
    const curve = { dx: 0, dy: 160 };
    const geometry = traceGeometry({ from: FROM, to: TO, routing: "curved", curve });
    const polyline = traceHitPolyline(geometry, { curve });
    const unbent = traceHitPolyline(geometry);

    // `bentCurvedPath` writes a QUADRATIC, so the oracle here is the waypoint
    // the bend is defined by: the drawn path crosses it at t = 0.5.
    expect(distanceToPolyline(polyline, geometry.waypoint)).toBeLessThan(1);
    // And ignoring the bend would miss it by most of the bend.
    expect(distanceToPolyline(unbent, geometry.waypoint)).toBeGreaterThan(TRACE_HIT_CORRIDOR_PX);
  });

  it("converges as samples rise — the flattening is a real approximation, not a fixed fudge", () => {
    const geometry = traceGeometry({ from: FROM, to: TO, routing: "curved" });
    const drawn = parseCubic(geometry.path);
    const worstAt = (samples: number) => {
      const polyline = traceHitPolyline(geometry, { samples });
      let worst = 0;
      for (let step = 0; step <= 200; step++) worst = Math.max(worst, distanceToPolyline(polyline, deCasteljau(drawn, step / 200)));
      return worst;
    };
    expect(worstAt(4)).toBeGreaterThan(worstAt(16));
    expect(worstAt(16)).toBeGreaterThan(worstAt(64));
  });
});
