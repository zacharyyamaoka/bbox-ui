// src/components/blockRegion.layout.test.ts — ACCEPTANCE for
// docs/CONTROL-FLOW-PLAN.md lane A. Off-limits to builders. Red until
// `blockRegion.layout.ts`'s `regionLayout` lands.

import { describe, expect, it } from "vitest";

import {
  REGION_ARM_DEFAULT_BODY_PX,
  REGION_ARM_HEADER_PX,
  REGION_ARM_MIN_BODY_PX,
  REGION_BODY_MIN_PX,
  REGION_PAD_BOTTOM_PX,
  regionLayout,
} from "./blockRegion.layout";

const CORNER = { w: 140, h: 64 };

describe("the constants are the donor's (branchModel.ts:29-33)", () => {
  it("carries the ported numbers unchanged", () => {
    expect(REGION_ARM_HEADER_PX).toBe(32);
    expect(REGION_ARM_DEFAULT_BODY_PX).toBe(180);
    expect(REGION_ARM_MIN_BODY_PX).toBe(48);
  });
});

describe("a region with no arms (a loop, a group)", () => {
  it("puts the corner block at the origin and the free body directly under it", () => {
    const layout = regionLayout({ width: 400, height: 300, corner: CORNER });
    expect(layout.corner).toEqual({ x: 0, y: 0, w: 140, h: 64 });
    expect(layout.body).toEqual({ x: 0, y: 64, w: 400, h: 300 - 64 });
    expect(layout.arms).toEqual([]);
    expect(layout.height).toBe(300);
    expect(layout.width).toBe(400);
  });

  it("hugs to a minimum body when no height is given", () => {
    const layout = regionLayout({ width: 400, corner: CORNER });
    expect(layout.height).toBe(CORNER.h + REGION_BODY_MIN_PX);
    expect(layout.body.h).toBe(REGION_BODY_MIN_PX);
  });
});

describe("a region with arms (a branch)", () => {
  const arms = [
    { id: "if", open: true, bodyHeight: 120 },
    { id: "elif", open: false, bodyHeight: 200 },
    { id: "else", open: true },
  ];

  it("stacks rows under the corner block: header then body, next row at this row's bottom", () => {
    const layout = regionLayout({ width: 520, corner: CORNER, arms });
    const [a, b, c] = layout.arms;
    expect(a).toMatchObject({ id: "if", index: 0, open: true, rowTop: 64, headerTop: 64, bodyTop: 64 + 32, bodyHeight: 120, bottom: 64 + 32 + 120 });
    expect(b).toMatchObject({ id: "elif", index: 1, open: false, rowTop: a.bottom, headerTop: a.bottom, bodyTop: a.bottom + 32, bodyHeight: 0, bottom: a.bottom + 32 });
    expect(c).toMatchObject({ id: "else", index: 2, open: true, rowTop: b.bottom, bodyHeight: REGION_ARM_DEFAULT_BODY_PX, bottom: b.bottom + 32 + REGION_ARM_DEFAULT_BODY_PX });
  });

  it("hugs to the last row plus the bottom pad, and has no free body", () => {
    const layout = regionLayout({ width: 520, corner: CORNER, arms });
    const last = layout.arms[layout.arms.length - 1];
    expect(layout.height).toBe(last.bottom + REGION_PAD_BOTTOM_PX);
    expect(layout.body).toEqual({ x: 0, y: 64, w: 520, h: 0 });
  });

  it("lets an explicit height win only when it is large enough — the arms never overflow the region", () => {
    const tall = regionLayout({ width: 520, height: 900, corner: CORNER, arms });
    expect(tall.height).toBe(900);
    const short = regionLayout({ width: 520, height: 100, corner: CORNER, arms });
    const last = short.arms[short.arms.length - 1];
    expect(short.height).toBe(last.bottom + REGION_PAD_BOTTOM_PX);
  });

  it("clamps an open arm's body to the minimum and remembers a folded arm's height without spending it", () => {
    const layout = regionLayout({ width: 520, corner: CORNER, arms: [{ id: "a", open: true, bodyHeight: 10 }, { id: "b", open: false, bodyHeight: 10 }] });
    expect(layout.arms[0].bodyHeight).toBe(REGION_ARM_MIN_BODY_PX);
    expect(layout.arms[1].bodyHeight).toBe(0);
  });

  it("is deterministic and pure — same input, equal output, input untouched", () => {
    const input = { width: 520, corner: CORNER, arms };
    const before = JSON.stringify(input);
    expect(regionLayout(input)).toEqual(regionLayout(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});
