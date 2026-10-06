// src/chrome/cornerClusterForm.test.ts — the pure form decision, with the
// numbers measured in the running app (lane finish:G-STALE, 2026-09-30).
import { describe, expect, it } from "vitest";

import { cornerClusterForm, type CornerRect } from "./cornerClusterForm";

const wide: CornerRect = { left: 0, top: 0, right: 1400, bottom: 900 };
const narrow: CornerRect = { left: 0, top: 0, right: 720, bottom: 900 };
const dock1400: CornerRect = { left: 529.5, top: 840, right: 870.5, bottom: 892 };
const dock720: CornerRect = { left: 189.5, top: 840, right: 530.5, bottom: 892 };
const watermark1400: CornerRect = { left: 1296, top: 860, right: 1396, bottom: 896 };
const watermark720: CornerRect = { left: 616, top: 860, right: 716, bottom: 896 };

describe("cornerClusterForm", () => {
  it("1400x900 beside the licence keeps the single row, with or without the variant pill", () => {
    for (const width of [294.7, 403.6]) {
      expect(
        cornerClusterForm({ container: wide, row: { width, height: 50 }, watermark: watermark1400, obstacles: [dock1400] }),
      ).toBe("row");
    }
  });

  it("720x900: the row would be lifted over the dock, so the cluster stacks", () => {
    expect(
      cornerClusterForm({ container: narrow, row: { width: 294.7, height: 50 }, watermark: watermark720, obstacles: [dock720] }),
    ).toBe("stacked");
  });

  it("forced corner at 720 (no watermark): the row would sit on the dock, so it stacks", () => {
    expect(cornerClusterForm({ container: narrow, row: { width: 294.7, height: 50 }, watermark: null, obstacles: [dock720] })).toBe(
      "stacked",
    );
  });

  it("licensed 1400 (no watermark): the row is flush in the corner", () => {
    expect(cornerClusterForm({ container: wide, row: { width: 294.7, height: 50 }, watermark: null, obstacles: [dock1400] })).toBe("row");
  });

  it("a row that only has to clear the watermark (lifted exactly to its top) stays a row", () => {
    // 900 wide: the row cannot sit beside the licence, but nothing else is under its span.
    const container: CornerRect = { left: 0, top: 0, right: 700, bottom: 900 };
    const watermark: CornerRect = { left: 596, top: 860, right: 696, bottom: 896 };
    const dock: CornerRect = { left: 100, top: 840, right: 300, bottom: 892 };
    expect(cornerClusterForm({ container, row: { width: 294.7, height: 50 }, watermark, obstacles: [dock] })).toBe("row");
  });
});
