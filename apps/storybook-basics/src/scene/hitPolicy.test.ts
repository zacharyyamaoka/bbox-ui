import { describe, expect, it } from "vitest";

import { HIT_POLICIES, ZOOM_LEVELS, effectiveHitValue, screenHitValue } from "./hitPolicy";

describe("effectiveHitValue", () => {
  it("scene policy passes the constant through untouched at every zoom", () => {
    for (const zoom of ZOOM_LEVELS) {
      expect(effectiveHitValue(40, zoom, "scene")).toBe(40);
      expect(effectiveHitValue(12, zoom, "scene")).toBe(12);
    }
  });

  it("screen policy divides by zoom", () => {
    expect(effectiveHitValue(40, 0.5, "screen")).toBe(80);
    expect(effectiveHitValue(40, 2, "screen")).toBe(20);
    expect(effectiveHitValue(12, 4, "screen")).toBe(3);
  });

  it("rejects a non-positive zoom rather than emitting Infinity", () => {
    expect(() => effectiveHitValue(40, 0, "screen")).toThrow(/zoom/);
    expect(() => effectiveHitValue(40, -1, "scene")).toThrow(/zoom/);
  });
});

describe("screenHitValue — what lands on screen", () => {
  it("scene policy: the screen size is value × zoom (6px at 0.5×, 48px at 4× for the 12px band)", () => {
    expect(screenHitValue(12, 0.5, "scene")).toBe(6);
    expect(screenHitValue(12, 4, "scene")).toBe(48);
    expect(screenHitValue(40, 0.5, "scene")).toBe(20);
    expect(screenHitValue(40, 4, "scene")).toBe(160);
  });

  it("screen policy: the screen size is the constant, at every zoom (the round trip)", () => {
    for (const zoom of ZOOM_LEVELS) {
      for (const value of [12, 13, 40]) {
        expect(screenHitValue(value, zoom, "screen")).toBeCloseTo(value, 10);
      }
    }
  });

  it("the two policies agree exactly at 1× and nowhere else", () => {
    for (const policy of HIT_POLICIES) {
      expect(screenHitValue(40, 1, policy)).toBe(40);
    }
    expect(screenHitValue(40, 2, "scene")).not.toBe(screenHitValue(40, 2, "screen"));
  });
});
