// src/components/trace.crossing.test.ts
//
// The pyblocks donor shipped `crossingMark.ts` with NO test file of its own
// (checked: `ls pyblocks/src/pipeline/connection/*crossing*` is one file) —
// its casing dash lived inside a `useLayoutEffect` and was only ever
// verified by driving the app and counting cleared pixels. So there is no
// oracle to port here, and these are written against the donor's stated
// contract instead: the dash construction it spells out in its comment
// (`0 lead middle lead`) and the short-cable rule it states in prose
// ("no casing at all beats a stub of one").

import { describe, expect, it } from "vitest";

import {
  CROSSING_CASING_MIN_LENGTH,
  CROSSING_CASING_PORT_GAP,
  CROSSING_CASING_WIDTH,
  CROSSING_MARKS,
  DEFAULT_CROSSING_MARK,
  casingDashArray,
  isCrossingMark,
} from "./trace.crossing";

describe("crossing mark seam", () => {
  it("is a style NAME, not a boolean — so hop/gap can land without a rewrite", () => {
    // The seam is the whole reason this is a union type (crossingMark.ts's
    // own "ADDING ANOTHER TREATMENT"). Zach, 2026-09-17: "Edge hops out of
    // scope for now." This pins the shape that keeps them cheap later.
    expect(CROSSING_MARKS).toEqual(["halo", "none"]);
    expect(isCrossingMark("halo")).toBe(true);
    expect(isCrossingMark("none")).toBe(true);
    expect(isCrossingMark("hop")).toBe(false);
    expect(isCrossingMark(true)).toBe(false);
    expect(isCrossingMark(undefined)).toBe(false);
  });

  it("recommends halo — the donor's researched default, carried over intact", () => {
    expect(DEFAULT_CROSSING_MARK).toBe("halo");
  });

  it("keeps the measured 11px calibration", () => {
    // Not a magic number: 7px was measured as almost invisible and 16px as
    // gappy (the sweep table in trace.crossing.ts). Pinned so a tidy-up
    // cannot round it to 10 or 12 without deleting a measurement.
    expect(CROSSING_CASING_WIDTH).toBe(11);
  });
});

describe("casing dash array", () => {
  it("covers only the middle, leaving both port fan-out zones bare", () => {
    const lead = CROSSING_CASING_PORT_GAP;
    expect(casingDashArray(300)).toBe(`0 ${lead} ${300 - lead * 2} ${lead}`);
  });

  it("the drawn casing is exactly the route minus both leads", () => {
    // Read the middle straight back out of the dash string, so the test
    // measures the produced artifact rather than restating the formula.
    const parts = casingDashArray(500)!.split(" ").map(Number);
    expect(parts).toHaveLength(4);
    const [gapBefore, leadIn, middle, leadOut] = parts;
    expect(gapBefore).toBe(0);
    expect(leadIn).toBe(CROSSING_CASING_PORT_GAP);
    expect(leadOut).toBe(CROSSING_CASING_PORT_GAP);
    expect(middle).toBe(500 - CROSSING_CASING_PORT_GAP * 2);
    expect(leadIn + middle + leadOut).toBe(500);
  });

  it("gives a short cable no casing at all rather than a stub of one", () => {
    expect(casingDashArray(CROSSING_CASING_MIN_LENGTH)).toBeNull();
    expect(casingDashArray(CROSSING_CASING_MIN_LENGTH - 1)).toBeNull();
    expect(casingDashArray(CROSSING_CASING_MIN_LENGTH + 1)).not.toBeNull();
    expect(casingDashArray(0)).toBeNull();
    expect(casingDashArray(Number.NaN)).toBeNull();
    expect(casingDashArray(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("never emits a negative middle — the donor's clamp, restated as a boundary", () => {
    for (const length of [1, 34, 68, 83, 84, 85, 200]) {
      const dash = casingDashArray(length);
      if (dash === null) continue;
      const middle = Number(dash.split(" ")[2]);
      expect(middle).toBeGreaterThan(0);
    }
  });
});
