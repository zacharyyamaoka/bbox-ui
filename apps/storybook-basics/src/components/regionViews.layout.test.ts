// src/components/regionViews.layout.test.ts — the pure half of the region
// views (Zach, 2026-09-22). The measured half — that the painted split line,
// band and crossing markers land where these numbers say — is
// `presets/RegionViews.stories.tsx`'s job; nothing here mounts anything.

import { describe, expect, it } from "vitest";

import { railBandHeightForSlots } from "../scene/fitToContent";
import { alignedFirstCentrePx, PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, railPitchPx, railPlanFor } from "./blockPort.layout";
import { regionControlSplitPx, regionHeaderBandPx, regionRailBandPx, wallCrossings } from "./regionViews.layout";

const FRAME = { x: 100, y: 50, w: 300, h: 200 };

describe("regionControlSplitPx — the line between control and ordinary ports", () => {
  it("is null with no control ports: no section, no line", () => {
    expect(regionControlSplitPx(0)).toBeNull();
    expect(regionControlSplitPx(-2)).toBeNull();
  });

  it("falls strictly between slot n-1's bottom and slot n's top, at the gap's midpoint", () => {
    // Independent oracle: the aligned rail's own first-centre closed form
    // (`alignedFirstCentrePx`) plus one pitch per slot — not this module's
    // arithmetic restated.
    const plan = railPlanFor({ view: "port", portLayout: "inline", edge: "left", itemIds: ["a", "b", "c", "d"], leadCount: 0, collapsePorts: false });
    const bands = { blockLeft: 0, blockTop: 0, blockWidth: 200, blockHeight: 400, bodyTop: 0, bodyBottom: 400 };
    const firstCentre = alignedFirstCentrePx(plan, bands) as number;
    for (const n of [1, 2, 3]) {
      const lastControlBottom = firstCentre + (n - 1) * railPitchPx() + PORT_EDGE_SLOT_MIN_PX / 2;
      const firstOrdinaryTop = firstCentre + n * railPitchPx() - PORT_EDGE_SLOT_MIN_PX / 2;
      const split = regionControlSplitPx(n) as number;
      expect(split).toBeGreaterThan(lastControlBottom);
      expect(split).toBeLessThan(firstOrdinaryTop);
      expect(split).toBeCloseTo((lastControlBottom + firstOrdinaryTop) / 2, 9);
    }
  });
});

describe("regionRailBandPx", () => {
  it("agrees with the scene kit's railBandHeightForSlots for every slot count it will be asked", () => {
    for (let slots = 0; slots <= 8; slots += 1) expect(regionRailBandPx(slots)).toBe(railBandHeightForSlots(slots));
  });

  it("is n slots and n-1 gaps", () => {
    expect(regionRailBandPx(3)).toBe(3 * PORT_EDGE_SLOT_MIN_PX + 2 * RAIL_GAP_PX);
  });
});

describe("regionHeaderBandPx — the full-width header band", () => {
  it("is exactly the split under its control ports, so the header and the opaque face draw one line", () => {
    expect(regionHeaderBandPx(1)).toBe(regionControlSplitPx(1));
    expect(regionHeaderBandPx(3)).toBe(regionControlSplitPx(3));
  });

  it("keeps a one-slot floor for a header with no control ports", () => {
    expect(regionHeaderBandPx(0)).toBe(regionControlSplitPx(1));
  });
});

describe("wallCrossings — wire polyline ∩ frame border, frame-local", () => {
  it("a wire from outside into a member yields ONE point, on the left wall", () => {
    const hits = wallCrossings(
      [
        { x: 20, y: 120 },
        { x: 180, y: 120 },
      ],
      FRAME,
    );
    expect(hits).toEqual([{ x: 0, y: 70 }]);
  });

  it("a wire that passes straight through yields two, enter then exit, in path order", () => {
    const hits = wallCrossings(
      [
        { x: 20, y: 150 },
        { x: 480, y: 150 },
      ],
      FRAME,
    );
    expect(hits).toEqual([
      { x: 0, y: 100 },
      { x: 300, y: 100 },
    ]);
  });

  it("a diagonal segment crosses where similar triangles say it does (independent oracle)", () => {
    const a = { x: 40, y: 60 };
    const b = { x: 160, y: 180 };
    const [hit] = wallCrossings([a, b], FRAME);
    // Line through a→b at X = frame.x: y = y0 + (X − x0)(y1 − y0)/(x1 − x0).
    const expectedY = a.y + ((FRAME.x - a.x) * (b.y - a.y)) / (b.x - a.x);
    expect(hit.x).toBeCloseTo(0, 9);
    expect(hit.y).toBeCloseTo(expectedY - FRAME.y, 9);
  });

  it("an elbow polyline that turns inside counts each wall once", () => {
    const hits = wallCrossings(
      [
        { x: 20, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 300 },
      ],
      FRAME,
    );
    expect(hits).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 200 },
    ]);
  });

  it("a wire wholly inside or wholly outside yields none; a degenerate path yields none", () => {
    expect(
      wallCrossings(
        [
          { x: 150, y: 100 },
          { x: 350, y: 200 },
        ],
        FRAME,
      ),
    ).toEqual([]);
    expect(
      wallCrossings(
        [
          { x: 0, y: 0 },
          { x: 90, y: 400 },
        ],
        FRAME,
      ),
    ).toEqual([]);
    expect(wallCrossings([{ x: 150, y: 100 }], FRAME)).toEqual([]);
  });
});
