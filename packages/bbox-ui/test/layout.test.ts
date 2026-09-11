import { describe, expect, it } from "vitest";

import {
  BLOCK_BORDER_PX,
  BLOCK_PADDING_X,
  CHIP,
  CHIP_INSET_RIGHT,
  CHIP_RIGHT_IN_HEADER_PX,
  CHIP_TITLE_GAP,
  HEADER_CHIP_RESERVED_PX,
  ICON_RATIO,
  META_FONT_PX,
  SIMPLE_BLOCK,
  TEXT_SIZES,
  glyphPx,
  headerContentWidth,
} from "../src/layout";

// INTEGRATION NOTE (docs/T1-SPEC.md §0): this file used to also cover
// Port's geometry (states, diameters, text layouts, boundary placement).
// That whole surface moved to `port.layout.ts` as part of Lane P's
// rebuild — some of it verified-unchanged (portAnchor, portDotPlacement,
// portLabelPlacement, portLabelOut — now in `test/port.layout.test.ts`),
// some of it deliberately redesigned away (offset text layouts, the
// wired-inner-dot ratio, the four-member `PortState` — superseded by
// `AppearanceState`'s six-rung ladder, covered by `test/appearance.test.ts`).
// Nothing here duplicates or contradicts those; this file now tests only
// what `layout.ts` itself still exports.

describe("glyph sizing (the 0.9 icon ratio)", () => {
  it("holds the board rule across all three rungs", () => {
    // 0.9 × 44 ≈ 40 reproduces the approved face; 36→32, 24→22.
    expect(glyphPx("xl")).toBe(40);
    expect(glyphPx("lg")).toBe(32);
    expect(glyphPx("md")).toBe(22);
  });

  it("is derived from the title rung, never independent", () => {
    for (const size of Object.keys(TEXT_SIZES) as (keyof typeof TEXT_SIZES)[]) {
      expect(glyphPx(size)).toBe(Math.round(TEXT_SIZES[size] * ICON_RATIO));
    }
  });
});

describe("text size rungs", () => {
  it("matches the board's Medium (h3) / Large (h2) / Extra Large (h1)", () => {
    expect(TEXT_SIZES).toEqual({ md: 24, lg: 36, xl: 44 });
    expect(META_FONT_PX).toBe(18);
  });
});

describe("Simple View block geometry", () => {
  it("matches the measured container and chip", () => {
    expect(SIMPLE_BLOCK).toEqual({ width: 384, height: 258 });
    expect(CHIP).toEqual({ minWidth: 102, height: 39 });
  });
});

describe("header + chip — the chip reserves a region", () => {
  it("names the measured chip insets", () => {
    // Board: container right 4915, chip 4785→4887, title right 4775.
    expect(CHIP_INSET_RIGHT).toBe(28);
    expect(CHIP_TITLE_GAP).toBe(10);
    expect(BLOCK_PADDING_X).toBe(16);
  });

  it("available width without a chip is the normal padded width", () => {
    expect(headerContentWidth()).toBe(
      SIMPLE_BLOCK.width - 2 * (BLOCK_BORDER_PX + BLOCK_PADDING_X),
    );
    expect(headerContentWidth()).toBe(348);
    expect(headerContentWidth(500)).toBe(464);
  });

  it("available width with a chip ends before the reserved chip region", () => {
    expect(headerContentWidth(SIMPLE_BLOCK.width, true)).toBe(
      SIMPLE_BLOCK.width - CHIP_INSET_RIGHT - CHIP.minWidth - CHIP_TITLE_GAP,
    );
    expect(headerContentWidth(SIMPLE_BLOCK.width, true)).toBe(244);
    // The board's own x-spans: container left 4531, title right edge 4775.
    expect(4531 + headerContentWidth(384, true)).toBe(4775);
  });

  it("the CSS reservation and the named width agree, at any width", () => {
    for (const width of [300, SIMPLE_BLOCK.width, 500, 1000]) {
      const headerLeft = BLOCK_BORDER_PX + BLOCK_PADDING_X;
      const headerRight = width - headerLeft;
      // Content's right limit under the header's chip padding, measured
      // from the container's left edge, is exactly headerContentWidth.
      expect(headerRight - HEADER_CHIP_RESERVED_PX).toBe(
        headerContentWidth(width, true),
      );
    }
  });

  it("title box and chip box never intersect — even for an over-long title", () => {
    for (const width of [300, SIMPLE_BLOCK.width, 500]) {
      // Container coordinates, mirroring the DOM: the header spans the
      // padding box; with a chip it carries HEADER_CHIP_RESERVED_PX of
      // right padding, and the truncating title clamps to the content box.
      const contentLeft = BLOCK_BORDER_PX + BLOCK_PADDING_X;
      const contentRight = width - contentLeft - HEADER_CHIP_RESERVED_PX;
      const chipRight = width - CHIP_INSET_RIGHT;
      const chipLeft = chipRight - CHIP.minWidth;
      for (const naturalTitleWidth of [10, 133, 226, 1000, 10000]) {
        const titleWidth = Math.min(
          naturalTitleWidth,
          contentRight - contentLeft,
        );
        const centre = (contentLeft + contentRight) / 2;
        const titleLeft = centre - titleWidth / 2;
        const titleRight = centre + titleWidth / 2;
        // no intersection, and the full measured gap survives
        expect(titleRight).toBeLessThanOrEqual(chipLeft - CHIP_TITLE_GAP);
        expect(titleLeft).toBeGreaterThanOrEqual(contentLeft);
        expect(chipRight).toBeLessThanOrEqual(width - CHIP_INSET_RIGHT);
      }
    }
  });

  it("re-expresses the container-edge inset in the header's frame", () => {
    // Chip right edge: header padding-box edge + CHIP_RIGHT_IN_HEADER_PX
    // from the container's right edge must equal CHIP_INSET_RIGHT.
    expect(
      BLOCK_BORDER_PX + BLOCK_PADDING_X + CHIP_RIGHT_IN_HEADER_PX,
    ).toBe(CHIP_INSET_RIGHT);
  });
});
