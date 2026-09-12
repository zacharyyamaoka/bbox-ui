import { describe, expect, it } from "vitest";

import { BLOCK_BORDER_PX } from "../src/layout";
import {
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_TEXT_LAYOUTS,
  inwardTextLayout,
  portAnchor,
  portDotPlacement,
  portFlexDirection,
  portLabelGap,
  portLabelOut,
  portSideForDirection,
  portLabelPlacement,
  type BlockSide,
  type PortDotBox,
  type PortLabelPlacement,
  type PortTextLayout,
} from "../src/port.layout";

// INTEGRATION NOTE (docs/T1-SPEC.md §0): this geometry used to live in
// `layout.ts`, under "Port anchors on a block boundary" / "Port
// placement". Lane P carried it forward into `port.layout.ts`
// "verified-correct-and-unchanged" (its own file header) alongside the
// rebuilt Port-state geometry, and `layout.ts`'s copy was deleted once
// `port.layout.ts` landed — so this file picks the same assertions up
// against their new home, narrowed to the four `PortTextLayout` members
// the rebuilt Port actually has (the "-offset" variants and the
// wired-inner-dot ratio were a deliberate redesign, not carried forward
// — see `test/layout.test.ts`'s own note and `test/appearance.test.ts`).

describe("port anchors on a block boundary", () => {
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

  it("maps a bare direction to a side, and a side to an inward label flow", () => {
    expect(portSideForDirection("input")).toBe("left");
    expect(portSideForDirection("output")).toBe("right");
    expect(inwardTextLayout("left")).toBe("right");
    expect(inwardTextLayout("right")).toBe("left");
    expect(inwardTextLayout("top")).toBe("bot");
    expect(inwardTextLayout("bottom")).toBe("top");
  });
});

describe("port text layouts", () => {
  it("covers the four rebuilt-Port layouts", () => {
    expect(PORT_TEXT_LAYOUTS).toEqual(["top", "bot", "right", "left"]);
  });

  const expected: Record<PortTextLayout, string> = {
    top: "column-reverse",
    bot: "column",
    right: "row",
    left: "row-reverse",
  };

  it.each(PORT_TEXT_LAYOUTS)("places the text slot for %s", (layout) => {
    expect(portFlexDirection(layout)).toBe(expected[layout]);
  });

  it("every layout uses the one label gap — no offset variant anymore", () => {
    for (const layout of PORT_TEXT_LAYOUTS) {
      expect(portLabelGap(layout)).toBe(PORT_LABEL_GAP);
    }
  });
});

describe("port diameters (rebuilt Port, PORT-SPEC.md §1.1)", () => {
  it("matches the three re-measured sizes", () => {
    expect(PORT_DIAMETERS).toEqual({ sm: 8, md: 12, lg: 18 });
  });
});

describe("port placement — dot on the boundary, label off the dot", () => {
  const SIDES: BlockSide[] = ["left", "right", "top", "bottom"];

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
    const placement = portLabelPlacement(layout, { w: diameter, h: diameter }, boxInsetPx);
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
        expect(nearEdgeFromDotCentre(layout, diameter, 0)).toBeCloseTo(expected, 10);
      }
    },
  );

  it("a resized (non-square) dot offsets each label by the dot's span along the label's axis", () => {
    // The 100×25 reproducer: a top label must clear the 25px HEIGHT, not
    // float w−h = 75px too high off the 100px width (the shipped defect).
    const w = 100;
    const h = 25;
    const dot = { w, h };
    expect(portLabelPlacement("top", dot).bottom).toBe(`${h + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("bot", dot).top).toBe(`${h + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("right", dot).left).toBe(`${w + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("left", dot).right).toBe(`${w + PORT_LABEL_GAP}px`);
  });

  const flowSide: Record<PortTextLayout, keyof PortLabelPlacement> = {
    right: "left",
    left: "right",
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
        const placement = portLabelPlacement(layout, {
          w: PORT_DIAMETERS.md,
          h: PORT_DIAMETERS.md,
        });
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

  it("portLabelOut is the dot's along-axis span plus the layout gap", () => {
    const dot: PortDotBox = { w: 12, h: 12 };
    for (const layout of PORT_TEXT_LAYOUTS) {
      const alongAxis = layout === "top" || layout === "bot" ? dot.h : dot.w;
      expect(portLabelOut(layout, dot)).toBe(alongAxis + portLabelGap(layout));
    }
  });
});
