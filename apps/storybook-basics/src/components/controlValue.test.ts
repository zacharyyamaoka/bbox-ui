// src/components/controlValue.test.ts — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/sharedValues.test.ts:1-53` — every case, renamed
//     for `ControlValue`/`combineControlValues`. No new cases: these pin the
//     fold's contract, not this port's plumbing.
import { describe, expect, it } from "vitest";

import { combineControlValues, sharedValueAcross } from "./controlValue";

describe("the one shared/mixed fold", () => {
  it("agreeing readings fold to one shared value", () => {
    expect(sharedValueAcross(["solid", "solid", "solid"])).toEqual({ type: "shared", value: "solid" });
  });

  it("any disagreement is mixed, whatever came first", () => {
    expect(sharedValueAcross(["solid", "dashed"])).toEqual({ type: "mixed" });
    expect(sharedValueAcross(["dashed", "solid"])).toEqual({ type: "mixed" });
  });

  it("subjects with nothing to say are skipped, never counted as disagreement", () => {
    // A shape without the property abstains — the same rule tldraw's own
    // shared-style map applies, and the rule `sharedEdgeValue` relied on.
    expect(sharedValueAcross([undefined, "black", undefined, "black"])).toEqual({
      type: "shared",
      value: "black",
    });
  });

  it("no opinions at all folds to undefined, never a fabricated value", () => {
    expect(sharedValueAcross([])).toBeUndefined();
    expect(sharedValueAcross([undefined, undefined])).toBeUndefined();
  });

  it("takes a custom equality, so numeric folds can carry a tolerance", () => {
    // `sharedFontPx` folds effective pixels within 0.01 — two shapes at
    // 23.9999 and 24 are the same size, not a mixed selection.
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    expect(sharedValueAcross([23.9999, 24], near)).toEqual({ type: "shared", value: 23.9999 });
    expect(sharedValueAcross([23.9, 24], near)).toEqual({ type: "mixed" });
  });

  it("folds already-folded readings: one mixed poisons the whole verdict", () => {
    expect(
      combineControlValues([
        { type: "shared", value: "curve" },
        { type: "mixed" },
        { type: "shared", value: "curve" },
      ]),
    ).toEqual({ type: "mixed" });
    expect(
      combineControlValues([
        { type: "shared", value: "curve" },
        { type: "shared", value: "curve" },
      ]),
    ).toEqual({ type: "shared", value: "curve" });
    expect(
      combineControlValues([
        { type: "shared", value: "curve" },
        { type: "shared", value: "straight" },
      ]),
    ).toEqual({ type: "mixed" });
    expect(combineControlValues([])).toBeUndefined();
  });

  it("an undefined reading abstains rather than poisoning the fold", () => {
    // New relative to the donor: `combineControlValues` widened its element
    // type to `ControlValue<T> | undefined` (design's `controlRegistry.ts`
    // sketch) so a surface that only sometimes has an opinion doesn't have
    // to synthesize a fake reading just to skip it.
    expect(
      combineControlValues([undefined, { type: "shared", value: "curve" }, undefined]),
    ).toEqual({ type: "shared", value: "curve" });
    expect(combineControlValues([undefined, undefined])).toBeUndefined();
  });
});
