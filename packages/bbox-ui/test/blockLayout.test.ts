import { afterEach, describe, expect, it, vi } from "vitest";

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
  collapseWhitespace,
  glyphPx,
  layoutSimpleBlock,
  portLabelBox,
  portLabelPlacement,
  wrapTextLines,
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
    expect(layout.descriptionLines).toBe(1);
    expect(layout.description!.y).toBeCloseTo(layout.header.y + layout.header.h + 4);
    expect(layout.description!.h).toBe(descH);
    // The stack as a whole is centered.
    const stackH = layout.header.h + 4 + descH;
    expect(layout.header.y).toBeCloseTo((SIMPLE_BLOCK.height - stackH) / 2);
  });

  it("a long description wraps and the whole stack re-centres around its height", () => {
    // The live <p> has no nowrap/truncate: it wraps at the content width and
    // the flex column centres around the WRAPPED height — a layout that
    // assumed one 27px line pushed the header down and crowded the type.
    const description = "blackbox modelling ".repeat(20).trim();
    const layout = layoutSimpleBlock(input({ description }));
    const contentX = BLOCK_BORDER_PX + 16;
    const contentW = SIMPLE_BLOCK.width - 2 * contentX;
    const lineH = Math.round(META_FONT_PX * LEADING_BASE);
    const lines = wrapTextLines(description, contentW, META_FONT_PX, 400, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(layout.descriptionLines).toBe(lines.length);
    // The box is the full wrapped paragraph…
    expect(layout.description!.h).toBe(lines.length * lineH);
    expect(layout.description!.w).toBe(contentW);
    // …and the header sits where centering the taller stack puts it.
    const stackH = layout.header.h + 4 + lines.length * lineH;
    expect(layout.header.y).toBeCloseTo((SIMPLE_BLOCK.height - stackH) / 2);
    expect(layout.description!.y).toBeCloseTo(layout.header.y + layout.header.h + 4);
  });

  it("wrapTextLines breaks greedily at spaces, like CSS normal wrapping", () => {
    // 10 chars fit per line at width 50 (measure = len × 10 × 0.5).
    expect(wrapTextLines("aaa bbb cc", 50, 10, 400, measure)).toEqual(["aaa bbb cc"]);
    expect(wrapTextLines("aaa bbb ccc", 50, 10, 400, measure)).toEqual([
      "aaa bbb",
      "ccc",
    ]);
    // Collapsed whitespace, and a too-long word overflows on its own line
    // rather than splitting (overflow-wrap: normal).
    expect(wrapTextLines("  aa   bb  ", 50, 10, 400, measure)).toEqual(["aa bb"]);
    expect(wrapTextLines("aa indivisible bb", 50, 10, 400, measure)).toEqual([
      "aa",
      "indivisible",
      "bb",
    ]);
    expect(wrapTextLines("", 50, 10, 400, measure)).toEqual([]);
  });

  it("collapseWhitespace folds document white space and keeps NBSP", () => {
    expect(collapseWhitespace(" a \t\n b\r\fc ")).toBe("a b c");
    expect(collapseWhitespace("north\nsouth")).toBe("north south");
    // NBSP is glue, not a separator — trim()/\s would have eaten it.
    expect(collapseWhitespace("\u00a0a\u00a0b\u00a0")).toBe("\u00a0a\u00a0b\u00a0");
    expect(collapseWhitespace("   ")).toBe("");
  });

  it("an explicit newline collapses to a space before wrapping, as white-space: normal does", () => {
    expect(wrapTextLines("north\nsouth", 200, 10, 400, measure)).toEqual([
      "north south",
    ]);
  });

  it("breaks inside an unspaced CJK run, like the live <p> does", () => {
    // The R3 reproducer: split(/\s+/) saw 40 ideographs as ONE word and
    // counted one line — half the wrapped height, a 13.5px stack shift.
    // 10 chars fit per line at width 50.
    expect(wrapTextLines("測".repeat(40), 50, 10, 400, measure)).toEqual([
      "測".repeat(10),
      "測".repeat(10),
      "測".repeat(10),
      "測".repeat(10),
    ]);
    // Mixed: the Latin word stays whole, the CJK run breaks per character.
    expect(wrapTextLines("ab 測測測測測測測測測", 50, 10, 400, measure)).toEqual([
      "ab 測測測測測測測",
      "測測",
    ]);
  });

  it("never breaks at a no-break space", () => {
    // 17 chars at width 50: an ordinary space would wrap; NBSP must not —
    // the pair overflows as one unbreakable line, exactly like the DOM.
    const glued = `${"a".repeat(8)}\u00a0${"b".repeat(8)}`;
    expect(wrapTextLines(glued, 50, 10, 400, measure)).toEqual([glued]);
    expect(wrapTextLines(glued.replace("\u00a0", " "), 50, 10, 400, measure)).toEqual([
      "a".repeat(8),
      "b".repeat(8),
    ]);
  });

  it("a soft hyphen is invisible until used, then renders a hyphen at the break", () => {
    const hyphenated = "aaaa\u00adbbbb";
    // Fits on one line: the soft hyphen vanishes (8 chars ≤ 10).
    expect(wrapTextLines(hyphenated, 50, 10, 400, measure)).toEqual(["aaaabbbb"]);
    // Forced to break: the line ends with a visible hyphen.
    expect(wrapTextLines(hyphenated, 30, 10, 400, measure)).toEqual([
      "aaaa-",
      "bbbb",
    ]);
  });

  it("a wrapped CJK description re-centres the stack around all its lines", () => {
    const layout = layoutSimpleBlock(input({ description: "測".repeat(40) }));
    const contentW = SIMPLE_BLOCK.width - 2 * (BLOCK_BORDER_PX + 16);
    const perLine = Math.floor(contentW / (META_FONT_PX * 0.5));
    const expectedLines = Math.ceil(40 / perLine);
    expect(expectedLines).toBeGreaterThan(1);
    expect(layout.descriptionLines).toBe(expectedLines);
    const lineH = Math.round(META_FONT_PX * LEADING_BASE);
    const stackH = layout.header.h + 4 + expectedLines * lineH;
    expect(layout.header.y).toBeCloseTo((SIMPLE_BLOCK.height - stackH) / 2);
  });

  it("a newline description measures as the single line the DOM paints", () => {
    const layout = layoutSimpleBlock(input({ description: "north\nsouth" }));
    expect(layout.descriptionLines).toBe(1);
    // Width is the collapsed "north south" (11 chars), not the raw string's.
    expect(layout.description!.w).toBeCloseTo(measure("north south", META_FONT_PX));
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

describe("wrapTextLines fallback (Intl.Segmenter absent)", () => {
  // A fallback nothing exercises is a fallback that is wrong (the R2 lesson
  // from splitGraphemes) — so stub the segmenter away and run the same
  // break-opportunity cases through the documented CJK-and-spaces model.
  afterEach(() => vi.unstubAllGlobals());

  function stubSegmenterAway() {
    vi.stubGlobal(
      "Intl",
      Object.create(Intl, { Segmenter: { value: undefined } }),
    );
  }

  it("still wraps spaces, CJK runs, NBSP and soft hyphens", () => {
    stubSegmenterAway();
    expect(wrapTextLines("aaa bbb ccc", 50, 10, 400, measure)).toEqual([
      "aaa bbb",
      "ccc",
    ]);
    expect(wrapTextLines("測".repeat(40), 50, 10, 400, measure)).toEqual([
      "測".repeat(10),
      "測".repeat(10),
      "測".repeat(10),
      "測".repeat(10),
    ]);
    const glued = `${"a".repeat(8)}\u00a0${"b".repeat(8)}`;
    expect(wrapTextLines(glued, 50, 10, 400, measure)).toEqual([glued]);
    expect(wrapTextLines("aaaa\u00adbbbb", 30, 10, 400, measure)).toEqual([
      "aaaa-",
      "bbbb",
    ]);
    expect(wrapTextLines("aa indivisible bb", 50, 10, 400, measure)).toEqual([
      "aa",
      "indivisible",
      "bb",
    ]);
  });

  it("layoutSimpleBlock still counts a CJK description's wrapped lines", () => {
    stubSegmenterAway();
    const layout = layoutSimpleBlock(input({ description: "測".repeat(40) }));
    expect(layout.descriptionLines).toBe(2);
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

  it("a resized dot's top/bot label clears the HEIGHT and agrees with the live placement", () => {
    // The 100×25 reproducer: the live renderer and the detach geometry used
    // to answer this differently (w-based vs h-based, 75px apart). Both now
    // read portLabelOut, so the boxes and the CSS offsets must coincide.
    const resized = { ...base, dotW: 100, dotH: 25 };
    const top = portLabelBox({ ...resized, layout: "top" });
    const bot = portLabelBox({ ...resized, layout: "bot" });
    expect(top.y + top.h).toBeCloseTo(-PORT_LABEL_GAP);
    expect(bot.y).toBe(25 + PORT_LABEL_GAP);
    expect(top.x + top.w / 2).toBeCloseTo(50);
    // The CSS placement resolves to the same near edge: bottom offset is
    // measured up from the 25px-tall wrapper's bottom.
    const cssTop = portLabelPlacement("top", { w: 100, h: 25 });
    expect(25 - parseFloat(cssTop.bottom!)).toBeCloseTo(top.y + top.h);
    const cssBot = portLabelPlacement("bot", { w: 100, h: 25 });
    expect(parseFloat(cssBot.top!)).toBeCloseTo(bot.y);
    // Left/right still key off the width.
    const right = portLabelBox({ ...resized, layout: "right" });
    expect(right.x).toBe(100 + PORT_LABEL_GAP);
  });
});
