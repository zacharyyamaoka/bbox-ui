import { describe, expect, it } from "vitest";
import { scrubValue } from "../src/variants/FigmaDense";
import { snapTo } from "../src/NumberInput";

/** The label scrub is one more surface that writes numbers; it must land on
 *  the same grid as the box and the arrows. */
describe("scrubValue", () => {
  const range = { min: 0, max: 24, step: 1 };
  it("moves one step per four pixels from the start value", () => {
    expect(scrubValue(6, 12, range)).toBe(9);
    expect(scrubValue(6, -12, range)).toBe(3);
  });
  it("clamps onto the grid like the box does", () => {
    expect(scrubValue(20, 400, range)).toBe(24);
    expect(scrubValue(2, -400, range)).toBe(0);
    expect(scrubValue(0.3, 4, { min: 0, max: 1, step: 0.1 })).toBe(snapTo(0.4, { min: 0, max: 1, step: 0.1 }));
  });
});
