import { describe, expect, it } from "vitest";

import {
  BLOCK_BORDER_PX,
  CHIP,
  ICON_RATIO,
  META_FONT_PX,
  PERSISTABLE_PORT_STATES,
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_LABEL_OFFSET_GAP,
  PORT_RING_PX,
  PORT_STATE_LABELS,
  PORT_STATES,
  PORT_TEXT_LAYOUTS,
  SIMPLE_BLOCK,
  TEXT_SIZES,
  glyphPx,
  inwardTextLayout,
  isOffsetLayout,
  portAnchor,
  portDotPlacement,
  portFlexDirection,
  portLabelGap,
  portLabelPlacement,
  portSideForDirection,
  wiredInnerPx,
  type BlockSide,
  type PortLabelPlacement,
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

describe("port placement — dot on the boundary, label off the dot", () => {
  const SIDES: BlockSide[] = ["left", "right", "top", "bottom"];

  it("maps a bare direction to a side, and a side to an inward label flow", () => {
    expect(portSideForDirection("input")).toBe("left");
    expect(portSideForDirection("output")).toBe("right");
    expect(inwardTextLayout("left")).toBe("right");
    expect(inwardTextLayout("right")).toBe("left");
    expect(inwardTextLayout("top")).toBe("bot");
    expect(inwardTextLayout("bottom")).toBe("top");
  });

  it.each(SIDES)(
    "portDotPlacement on %s compensates the container border so the centre lands on the anchor",
    (side) => {
      for (const t of [0, 0.35, 0.5, 1]) {
        const anchor = portAnchor(side, t);
        const placement = portDotPlacement(side, t);
        // placement is in padding-box coordinates; adding the border width
        // back must recover the outer-boundary anchor exactly.
        expect(placement.left + BLOCK_BORDER_PX).toBeCloseTo(anchor.x, 10);
        expect(placement.top + BLOCK_BORDER_PX).toBeCloseTo(anchor.y, 10);
      }
      const scaled = portDotPlacement(side, 0.5, 500, 300);
      const scaledAnchor = portAnchor(side, 0.5, 500, 300);
      expect(scaled.left + BLOCK_BORDER_PX).toBeCloseTo(scaledAnchor.x, 10);
      expect(scaled.top + BLOCK_BORDER_PX).toBeCloseTo(scaledAnchor.y, 10);
    },
  );

  /**
   * Resolve a portLabelPlacement into the label's near-edge distance from
   * the dot centre, along the flow axis, in border-box coordinates —
   * mirroring how CSS resolves it inside a box `boxInsetPx` inside the
   * dot's border box.
   */
  function nearEdgeFromDotCentre(
    layout: PortTextLayout,
    diameter: number,
    boxInsetPx: number,
  ): number {
    const placement = portLabelPlacement(layout, diameter, boxInsetPx);
    const radius = diameter / 2;
    const flowEdge =
      layout === "top" ? "bottom" : layout === "bot" ? "top" : undefined;
    const offsetPx = parseFloat(
      (flowEdge
        ? placement[flowEdge]
        : (placement.left !== "50%" ? placement.left : undefined) ??
          placement.right) ?? "",
    );
    // CSS offsets resolve from the padding box, boxInsetPx inside the
    // border box; the near edge sits offset − (radius − inset) from centre.
    return offsetPx + boxInsetPx - radius;
  }

  it.each(PORT_TEXT_LAYOUTS)(
    "label near edge for %s clears the dot by exactly the layout gap",
    (layout) => {
      for (const size of ["sm", "md", "lg"] as const) {
        const diameter = PORT_DIAMETERS[size];
        const expected = diameter / 2 + portLabelGap(layout);
        // Unbordered wrapper (tldraw) and bordered handle (React Flow, the
        // dot's ring is the box border) must agree to the pixel — this is
        // the drift that shipped when each adapter answered for itself.
        expect(nearEdgeFromDotCentre(layout, diameter, 0)).toBeCloseTo(expected, 10);
        expect(nearEdgeFromDotCentre(layout, diameter, PORT_RING_PX)).toBeCloseTo(
          expected,
          10,
        );
      }
    },
  );

  const flowSide: Record<PortTextLayout, keyof PortLabelPlacement> = {
    right: "left",
    "right-offset": "left",
    left: "right",
    "left-offset": "right",
    top: "bottom",
    bot: "top",
  };

  it.each(SIDES)(
    "every layout stays well-formed for a dot on the %s side",
    (side) => {
      // The label placement is relative to the dot box, so it is side-
      // independent by construction; assert the full contract for each
      // layout with the dot pinned to this side's anchor.
      const dot = portDotPlacement(side, 0.5);
      expect(Number.isFinite(dot.left)).toBe(true);
      expect(Number.isFinite(dot.top)).toBe(true);
      for (const layout of PORT_TEXT_LAYOUTS) {
        const placement = portLabelPlacement(layout, PORT_DIAMETERS.md);
        // exactly one flow-axis offset, on the expected edge…
        const offsets = (["left", "right", "top", "bottom"] as const).filter(
          (edge) => placement[edge] !== undefined && placement[edge] !== "50%",
        );
        expect(offsets).toEqual([flowSide[layout]]);
        // …and a cross-axis centring pair.
        const cross = layout === "top" || layout === "bot" ? "left" : "top";
        expect(placement[cross]).toBe("50%");
        expect(placement.transform).toBe(
          layout === "top" || layout === "bot"
            ? "translateX(-50%)"
            : "translateY(-50%)",
        );
      }
    },
  );

  it("offset layouts push the label a full offset gap out", () => {
    const d = PORT_DIAMETERS.md;
    expect(nearEdgeFromDotCentre("right-offset", d, 0)).toBeCloseTo(
      d / 2 + PORT_LABEL_OFFSET_GAP,
      10,
    );
    expect(nearEdgeFromDotCentre("right", d, 0)).toBeCloseTo(
      d / 2 + PORT_LABEL_GAP,
      10,
    );
  });
});
