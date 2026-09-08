import { describe, expect, it } from "vitest";

import {
  CHIP,
  ICON_RATIO,
  META_FONT_PX,
  PERSISTABLE_PORT_STATES,
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_LABEL_OFFSET_GAP,
  PORT_STATE_LABELS,
  PORT_STATES,
  PORT_TEXT_LAYOUTS,
  SIMPLE_BLOCK,
  TEXT_SIZES,
  glyphPx,
  isOffsetLayout,
  portAnchor,
  portFlexDirection,
  portLabelGap,
  wiredInnerPx,
  type PortTextLayout,
} from "../src/layout";

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

describe("port states", () => {
  it("covers exactly the four board states", () => {
    expect(PORT_STATES).toEqual(["empty", "default", "wired", "received"]);
  });

  it("keeps the board labels verbatim, spelling included", () => {
    expect(PORT_STATE_LABELS).toEqual({
      empty: "Empty",
      default: "Default Value",
      wired: "Wired",
      received: "Data Recived",
    });
  });

  it("excludes received from the persistable set — it is runtime-only", () => {
    expect(PERSISTABLE_PORT_STATES).toEqual(["empty", "default", "wired"]);
    expect(PERSISTABLE_PORT_STATES).not.toContain("received");
  });
});

describe("port diameters", () => {
  it("matches the three measured sizes", () => {
    expect(PORT_DIAMETERS).toEqual({ sm: 14, md: 25, lg: 36 });
  });

  it("wired inner dot is half the diameter", () => {
    expect(wiredInnerPx("sm")).toBe(7);
    expect(wiredInnerPx("md")).toBe(13);
    expect(wiredInnerPx("lg")).toBe(18);
  });
});

describe("port text layouts", () => {
  it("covers all six board layouts", () => {
    expect(PORT_TEXT_LAYOUTS).toEqual([
      "top",
      "bot",
      "right",
      "left",
      "right-offset",
      "left-offset",
    ]);
  });

  const expected: Record<PortTextLayout, string> = {
    top: "column-reverse",
    bot: "column",
    right: "row",
    left: "row-reverse",
    "right-offset": "row",
    "left-offset": "row-reverse",
  };

  it.each(PORT_TEXT_LAYOUTS)("places the text slot for %s", (layout) => {
    expect(portFlexDirection(layout)).toBe(expected[layout]);
  });

  it("offset layouts sit the label further out", () => {
    for (const layout of PORT_TEXT_LAYOUTS) {
      const offset = layout === "right-offset" || layout === "left-offset";
      expect(isOffsetLayout(layout)).toBe(offset);
      expect(portLabelGap(layout)).toBe(
        offset ? PORT_LABEL_OFFSET_GAP : PORT_LABEL_GAP,
      );
    }
    expect(PORT_LABEL_OFFSET_GAP).toBeGreaterThan(PORT_LABEL_GAP);
  });
});

describe("Simple View block geometry", () => {
  it("matches the measured container and chip", () => {
    expect(SIMPLE_BLOCK).toEqual({ width: 384, height: 258 });
    expect(CHIP).toEqual({ minWidth: 102, height: 39 });
  });

  it("anchors ports on the boundary of the default block", () => {
    expect(portAnchor("left", 0.5)).toEqual({ x: 0, y: 129 });
    expect(portAnchor("right", 0.25)).toEqual({ x: 384, y: 64.5 });
    expect(portAnchor("top", 0.5)).toEqual({ x: 192, y: 0 });
    expect(portAnchor("bottom", 1)).toEqual({ x: 384, y: 258 });
  });

  it("anchors scale with an explicit size (tldraw's w/h are authoritative)", () => {
    expect(portAnchor("right", 0.5, 500, 300)).toEqual({ x: 500, y: 150 });
    expect(portAnchor("left", 0, 500, 300)).toEqual({ x: 0, y: 0 });
  });
});
