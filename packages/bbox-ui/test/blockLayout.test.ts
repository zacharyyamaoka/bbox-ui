import { describe, expect, it } from "vitest";

import {
  BLOCK_BORDER_PX,
  BLOCK_TYPE_BOTTOM,
  CHIP,
  CHIP_INSET_RIGHT,
  HEADER_CHIP_RESERVED_PX,
  LEADING_BASE,
  LEADING_TIGHT,
  META_FONT_PX,
  PORT_LABEL_GAP,
  PORT_LABEL_OFFSET_GAP,
  SIMPLE_BLOCK,
  TEXT_SIZES,
  glyphPx,
  layoutSimpleBlock,
  portLabelBox,
  type SimpleBlockLayoutInput,
} from "../src";

/** Deterministic measurer: width scales with length and font size. */
const measure = (text: string, px: number) => text.length * px * 0.5;

function input(overrides: Partial<SimpleBlockLayoutInput> = {}): SimpleBlockLayoutInput {
  return {
    width: SIMPLE_BLOCK.width,
    height: SIMPLE_BLOCK.height,
    title: "Detect",
    titleSize: "xl",
    icon: "",
    tag: "",
    description: "",
    blockType: "",
    orientation: "horizontal",
    measure,
    ...overrides,
  };
}

describe("layoutSimpleBlock", () => {
  it("centers a lone header vertically, at the title's line height", () => {
    const layout = layoutSimpleBlock(input());
    const titleLineH = Math.round(TEXT_SIZES.xl * LEADING_TIGHT);
    expect(layout.header.h).toBe(titleLineH);
    expect(layout.header.y).toBeCloseTo((SIMPLE_BLOCK.height - titleLineH) / 2);
    expect(layout.title).not.toBeNull();
    expect(layout.glyph).toBeNull();
    expect(layout.chip).toBeNull();
  });

  it("stacks header and description with the gap-1 rhythm", () => {
    const layout = layoutSimpleBlock(input({ description: "blackbox modelling" }));
    const descH = Math.round(META_FONT_PX * LEADING_BASE);
    expect(layout.description).not.toBeNull();
    expect(layout.description!.y).toBeCloseTo(layout.header.y + layout.header.h + 4);
    expect(layout.description!.h).toBe(descH);
    // The stack as a whole is centered.
    const stackH = layout.header.h + 4 + descH;
    expect(layout.header.y).toBeCloseTo((SIMPLE_BLOCK.height - stackH) / 2);
  });

  it("rides the glyph beside the title at the derived 0.9 ratio", () => {
    const layout = layoutSimpleBlock(input({ icon: "🔍" }));
    expect(layout.glyph).not.toBeNull();
    expect(layout.glyph!.w).toBe(glyphPx("xl"));
    // Glyph then title, 8px apart, as one centered row.
    expect(layout.title!.x).toBeCloseTo(layout.glyph!.x + layout.glyph!.w + 8);
  });

  it("the chip reserves its region: measured insets, title room ends before it", () => {
    const layout = layoutSimpleBlock(input({ tag: "Draft 1" }));
    expect(layout.chip).not.toBeNull();
    // Chip right edge sits the measured 28px in from the container edge.
    expect(layout.chip!.x + layout.chip!.w).toBeCloseTo(
      SIMPLE_BLOCK.width - CHIP_INSET_RIGHT,
    );
    expect(layout.chip!.w).toBeGreaterThanOrEqual(CHIP.minWidth);
    expect(layout.chip!.h).toBe(CHIP.height);
    // The title's room ends HEADER_CHIP_RESERVED_PX before the header's
    // right edge — the title box can never intersect the chip box.
    expect(layout.title!.x + layout.title!.w).toBeLessThanOrEqual(
      layout.header.x + layout.header.w - HEADER_CHIP_RESERVED_PX + 0.001,
    );
  });

  it("a long title clamps to the room the chip leaves instead of colliding", () => {
    const layout = layoutSimpleBlock(
      input({ tag: "Draft 1", title: "A very long block title that cannot fit" }),
    );
    expect(layout.title!.w).toBeLessThanOrEqual(
      layout.header.w - HEADER_CHIP_RESERVED_PX,
    );
    expect(layout.title!.x + layout.title!.w).toBeLessThanOrEqual(
      layout.chip!.x + 0.001,
    );
  });

  it("pins the type label bottom-3 above the padding-box bottom, centered", () => {
    const layout = layoutSimpleBlock(input({ blockType: "dataflow" }));
    const typeH = Math.round(META_FONT_PX * LEADING_BASE);
    expect(layout.blockType).not.toBeNull();
    expect(layout.blockType!.y).toBeCloseTo(
      SIMPLE_BLOCK.height - BLOCK_BORDER_PX - BLOCK_TYPE_BOTTOM - typeH,
    );
    expect(layout.blockType!.x + layout.blockType!.w / 2).toBeCloseTo(
      SIMPLE_BLOCK.width / 2,
    );
  });

  it("vertical orientation stacks glyph above title", () => {
    const layout = layoutSimpleBlock(input({ icon: "🔍", orientation: "vertical" }));
    expect(layout.glyph!.y).toBe(layout.header.y);
    expect(layout.title!.y).toBeCloseTo(layout.glyph!.y + layout.glyph!.h + 4);
  });
});

describe("portLabelBox", () => {
  const base = { dotW: 25, dotH: 25, label: "tick", fontPx: 24, measure };
  const w = measure("tick", 24);
  const h = Math.round(24 * LEADING_TIGHT);

  it("right: near edge one gap clear of the dot, cross-axis centered", () => {
    const box = portLabelBox({ ...base, layout: "right" });
    expect(box).toEqual({ x: 25 + PORT_LABEL_GAP, y: 12.5 - h / 2, w, h });
  });

  it("left: far side, right edge one gap short of the dot", () => {
    const box = portLabelBox({ ...base, layout: "left" });
    expect(box.x + box.w).toBeCloseTo(-PORT_LABEL_GAP);
  });

  it("offset layouts push the label further out", () => {
    const box = portLabelBox({ ...base, layout: "right-offset" });
    expect(box.x).toBe(25 + PORT_LABEL_OFFSET_GAP);
  });

  it("top and bot center on the dot", () => {
    const top = portLabelBox({ ...base, layout: "top" });
    const bot = portLabelBox({ ...base, layout: "bot" });
    expect(top.x + top.w / 2).toBeCloseTo(12.5);
    expect(top.y + top.h).toBeCloseTo(-PORT_LABEL_GAP);
    expect(bot.y).toBe(25 + PORT_LABEL_GAP);
  });
});
