// src/shapes/wire/wireTerminalGrab.test.ts — P-053's one piece of pure
// geometry, in the `unit` project. The BROWSER half — that a real drag on
// these points re-points a real cable — is `src/wireTerminal.smoke.test.tsx`.
//
// This exists because the CLEARANCE is the whole reason the feature works:
// measured in real Chromium, a handle published at the route's end sits
// inside the port dot's 40px hit circle and the press starts a NEW cable
// instead. The browser test proves the consequence; these cases pin the
// arithmetic, including the two shapes that have no obvious right answer —
// a route shorter than twice the clearance, and a degenerate one.
import { Vec } from "tldraw";
import { describe, expect, it } from "vitest";

import { wireTerminalGrabPoints } from "./wireGeometry";

const line = (...points: [number, number][]) => points.map(([x, y]) => new Vec(x, y));

describe("P-053 — where a cable's terminal handles sit", () => {
  it("walks in from each end by the clearance, along the cable", () => {
    const { start, end } = wireTerminalGrabPoints(line([0, 0], [200, 0]), 24);
    expect([start.x, start.y]).toEqual([24, 0]);
    expect([end.x, end.y]).toEqual([176, 0]);
  });

  it("follows a CORNER rather than cutting across it", () => {
    // 30px right, then down. A clearance of 50 lands 20px past the corner —
    // a straight interpolation between the first two vertices would put the
    // handle at (50, 0), which is off the cable entirely.
    const { start } = wireTerminalGrabPoints(line([0, 0], [30, 0], [30, 200]), 50);
    expect([start.x, start.y]).toEqual([30, 20]);
  });

  it("clamps to 40% of the route, so a short cable's two handles never cross", () => {
    // 50px long, 24px asked for from each end: unclamped that is 24 and 26,
    // 2px apart and about to swap. Clamped it is 20 and 30, still in order.
    const { start, end } = wireTerminalGrabPoints(line([0, 0], [50, 0]), 24);
    expect(start.x).toBeLessThan(end.x);
    expect([start.x, end.x]).toEqual([20, 30]);
  });

  it("a zero-length route answers its own point rather than NaN", () => {
    const { start, end } = wireTerminalGrabPoints(line([40, 40], [40, 40]), 24);
    expect([start.x, start.y]).toEqual([40, 40]);
    expect([end.x, end.y]).toEqual([40, 40]);
  });

  it("a clearance of zero is the route's own ends — the pre-P-053 behaviour, and the mutation that breaks the gesture", () => {
    const { start, end } = wireTerminalGrabPoints(line([0, 0], [100, 0]), 0);
    expect([start.x, end.x]).toEqual([0, 100]);
  });
});
