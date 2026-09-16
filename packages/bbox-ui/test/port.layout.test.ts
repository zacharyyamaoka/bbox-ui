import { describe, expect, it } from "vitest";

import { BLOCK_BORDER_PX } from "../src/layout";
import { portLabelBox } from "../src/blockLayout";
import {
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_RING_OVERHANG_PX,
  PORT_SECONDARY_SLOT_GAP_PX,
  PORT_TEXT_LAYOUTS,
  SECONDARY_SLOT_LAYOUTS,
  defaultSecondarySlotLayout,
  inwardTextLayout,
  isOffsetTextLayout,
  portAnchor,
  portDotPlacement,
  originFlexDirection,
  portLabelOut,
  slotPlacementStyle,
  SLOT_ALIGNS,
  SLOT_ORIGINS,
  SECONDARY_LAYOUT_AS_ORIGIN,
  TEXT_LAYOUT_AS_PLACEMENT,
  PORT_TEXT_SIZES,
  portSideForDirection,
  portLabelPlacement,
  type BlockSide,
  type PortDotBox,
  type PortLabelPlacement,
  type PortTextLayout,
  type SecondarySlotLayout,
  type SlotOrigin,
} from "../src/port.layout";

// INTEGRATION NOTE (docs/T1-SPEC.md §0): this geometry used to live in
// `layout.ts`, under "Port anchors on a block boundary" / "Port
// placement". Lane P carried it forward into `port.layout.ts`
// "verified-correct-and-unchanged" (its own file header) alongside the
// rebuilt Port-state geometry, and `layout.ts`'s copy was deleted once
// `port.layout.ts` landed — so this file picks the same assertions up
// against their new home.
//
// WIDENED 2026-09-12 (the two-slot proposal): PORT_TEXT_LAYOUTS grew back
// from four to six — `rightOffset`/`leftOffset` re-added for the label
// slot's own six-way placement axis (Zach's diagram; see port.layout.ts's
// own WHY on `PortTextLayout`). The wired-inner-dot ratio is unrelated and
// still not carried forward — see `test/appearance.test.ts`. A brand new,
// always-offset `SecondarySlotLayout` axis (four members) covers the
// dot's own second slot, tested in its own describe block below.

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
  it("covers the six label-slot layouts (top/bot/right/left, plus the re-added rightOffset/leftOffset)", () => {
    expect(PORT_TEXT_LAYOUTS).toEqual(["top", "bot", "right", "left", "rightOffset", "leftOffset"]);
  });

  const expected: Record<PortTextLayout, string> = {
    top: "column-reverse",
    bot: "column",
    right: "row",
    left: "row-reverse",
    rightOffset: "row",
    leftOffset: "row-reverse",
  };

  // Asserted through the composition the component actually uses —
  // legacy layout -> origin -> flex direction — rather than a
  // layout-keyed helper of its own. `portFlexDirection` was deleted once
  // the row started following the resolved origin; this pins that the
  // legacy vocabulary still lands on the same answer it always did.
  it.each(PORT_TEXT_LAYOUTS)("places the text slot for %s", (layout) => {
    expect(originFlexDirection(TEXT_LAYOUT_AS_PLACEMENT[layout].origin)).toBe(expected[layout]);
  });

  it("only the two -Offset members are offset layouts", () => {
    expect(PORT_TEXT_LAYOUTS.filter((l) => TEXT_LAYOUT_AS_PLACEMENT[l].align === "end")).toEqual(["rightOffset", "leftOffset"]);
  });

  /**
   * The 2026-09-15 correction, pinned so it cannot silently regress: an
   * "Offset" layout differs from its plain counterpart in Y ONLY. The
   * first implementation spent the offset on extra X distance, which
   * does nothing about the trace wire the position exists to dodge —
   * the wire leaves the dot along its centre line, so a label pushed
   * further right is still impaled by it, just later.
   */
  it("an -Offset layout adds NO along-axis distance — its plain counterpart's `out` to the pixel", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    expect(portLabelOut("rightOffset", dot)).toBe(portLabelOut("right", dot));
    expect(portLabelOut("leftOffset", dot)).toBe(portLabelOut("left", dot));
  });

  /**
   * These replaced four tests of the old DOT-based lift, deleted with the
   * function itself. That lift derived a distance from the dot's size and
   * the label's height; the align model needs neither, so the property
   * worth pinning changed shape entirely.
   */
  it("a lifted layout is expressed as a reference EDGE plus a static gap — no derived distance", () => {
    for (const layout of ["rightOffset", "leftOffset"] as const) {
      const preset = TEXT_LAYOUT_AS_PLACEMENT[layout];
      expect(preset.align).toBe("end");
      expect(preset.offsetY).toBe(-PORT_LABEL_GAP);
    }
    for (const layout of ["top", "bot", "right", "left"] as const) {
      expect(TEXT_LAYOUT_AS_PLACEMENT[layout].align).toBe("center");
      expect(TEXT_LAYOUT_AS_PLACEMENT[layout].offsetY).toBe(0);
    }
  });

  it("isOffsetTextLayout is DERIVED from that table, so the two can never disagree", () => {
    for (const layout of PORT_TEXT_LAYOUTS) {
      expect(isOffsetTextLayout(layout), layout).toBe(TEXT_LAYOUT_AS_PLACEMENT[layout].align === "end");
    }
  });
});

describe("secondary slot layouts (the two-slot proposal's own, always-offset axis)", () => {
  it("has exactly the four named corners, none of them a bare top/bot/left/right", () => {
    expect(SECONDARY_SLOT_LAYOUTS).toEqual(["leftOffset", "rightOffset", "topOffset", "botOffset"]);
  });

  it("defaultSecondarySlotLayout picks the corner OPPOSITE wherever the label is flowing — the same rule the old portBadgeSide used, generalized", () => {
    const expected: Record<PortTextLayout, SecondarySlotLayout> = {
      left: "rightOffset",
      leftOffset: "rightOffset",
      right: "leftOffset",
      rightOffset: "leftOffset",
      top: "botOffset",
      bot: "topOffset",
    };
    for (const layout of PORT_TEXT_LAYOUTS) {
      expect(defaultSecondarySlotLayout(layout)).toBe(expected[layout]);
    }
  });

  it("hugs the dot more tightly than the label's own gap (the diagram's own visual distinction)", () => {
    expect(PORT_SECONDARY_SLOT_GAP_PX).toBeLessThan(PORT_LABEL_GAP);
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
    "label near edge for %s clears the dot's painted ring by exactly the layout gap",
    (layout) => {
      for (const size of ["sm", "md", "lg"] as const) {
        const diameter = PORT_DIAMETERS[size];
        // + PORT_RING_OVERHANG_PX: the ring is box-shadow, painted OUTSIDE
        // the dot's layout box, so the near edge clears the RING's outer
        // edge, not the box's — see port.layout.ts's own WHY.
        const expected = diameter / 2 + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
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
    // + PORT_RING_OVERHANG_PX throughout: the CSS offset clears the painted
    // ring, not the box edge (port.layout.ts's own WHY).
    expect(portLabelPlacement("top", dot).bottom).toBe(`${h + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("bot", dot).top).toBe(`${h + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("right", dot).left).toBe(`${w + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP}px`);
    expect(portLabelPlacement("left", dot).right).toBe(`${w + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP}px`);
  });

  const flowSide: Record<PortTextLayout, keyof PortLabelPlacement> = {
    right: "left",
    rightOffset: "left",
    left: "right",
    leftOffset: "right",
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
        const dot = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
        const placement = portLabelPlacement(layout, dot);
        // The flow-axis offset is on the expected edge either way.
        expect(placement[flowSide[layout]]).toBe(`${portLabelOut(layout, dot)}px`);

        if (isOffsetTextLayout(layout)) {
          // A lifted label is the SAME anchor as its plain counterpart —
          // near edge, cross-axis centred — displaced upward. Unifying it
          // to one rule is what lets the flex row and every host adapter
          // reproduce it without a second implementation.
          // Bottom edge on the reference line, then one static gap up.
          expect(placement.top).toBe("50%");
          expect(placement.transform).toBe(`translate(0px, calc(-100% + ${-PORT_LABEL_GAP}px))`);
          continue;
        }

        // Every other layout keeps the cross-axis centring pair.
        const cross = layout === "top" || layout === "bot" ? "left" : "top";
        expect(placement[cross]).toBe("50%");
        // One transform shape now, from the one model: the cross-axis
        // centring and the (here zero) displacement composed together.
        expect(placement.transform).toBe(
          layout === "top" || layout === "bot"
            ? "translate(calc(-50% + 0px), 0px)"
            : "translate(0px, calc(-50% + 0px))",
        );
      }
    },
  );

  it("portLabelOut is the dot's along-axis span plus the ring overhang plus the one shared label gap", () => {
    const dot: PortDotBox = { w: 12, h: 12 };
    for (const layout of PORT_TEXT_LAYOUTS) {
      const alongAxis = layout === "top" || layout === "bot" ? dot.h : dot.w;
      expect(portLabelOut(layout, dot)).toBe(alongAxis + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP);
    }
  });
});

/**
 * The unified placement model (Zach, 2026-09-15): "Its just Top, bottom,
 * right, left. thoose basically set the origins. and then sepertly we can
 * always control a x and y offset."
 */
describe("unified slot placement — one origin type, free x/y", () => {
  const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };

  it("has exactly four origins, shared by BOTH slots", () => {
    expect(SLOT_ORIGINS).toEqual(["top", "bottom", "left", "right"]);
  });

  it("at zero offset, every origin reproduces its old flush placement to the pixel", () => {
    const out = PORT_DIAMETERS.md + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
    const at = (origin: SlotOrigin) =>
      slotPlacementStyle({ origin, align: "center", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP);
    expect(at("right").left).toBe(`${out}px`);
    expect(at("left").right).toBe(`${out}px`);
    expect(at("top").bottom).toBe(`${out}px`);
    expect(at("bottom").top).toBe(`${out}px`);
    // …and the cross axis still centres.
    expect(at("right").top).toBe("50%");
    expect(at("top").left).toBe("50%");
  });

  it("carries BOTH offsets in the transform, so negatives work and the centring never has to be added by hand", () => {
    const p = slotPlacementStyle({ origin: "right", align: "center", offsetX: 4, offsetY: -23 }, dot, PORT_LABEL_GAP);
    expect(p.transform).toBe("translate(4px, calc(-50% + -23px))");
    // The edge property is untouched by the offset — displacement is the
    // transform's whole job, so the anchor stays one fixed rule.
    expect(p.left).toBe(`${PORT_DIAMETERS.md + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP}px`);
  });

  /**
   * SCREEN SPACE on every origin — `+x` right, `+y` down, always.
   *
   * An earlier version mirrored the sign so `+x` would read as "away from
   * the dot". That is defensible prose and a bad control: it reverses
   * itself depending on which origin you picked, and it contradicted this
   * very type's own "+x right, +y DOWN" contract (adversarial judge,
   * 2026-09-15). A transform is applied in screen space regardless of
   * which edge property anchors the box, so unmirrored is also the
   * simpler implementation.
   */
  it("uses the SAME screen-space signs on all four origins", () => {
    for (const origin of SLOT_ORIGINS) {
      const p = slotPlacementStyle({ origin, align: "center", offsetX: 5, offsetY: 7 }, dot, PORT_LABEL_GAP);
      const horizontal = origin === "top" || origin === "bottom";
      expect(p.transform, origin).toBe(
        horizontal ? "translate(calc(-50% + 5px), 7px)" : "translate(5px, calc(-50% + 7px))",
      );
    }
  });

  it("the two gaps stay distinct: a secondary slot hugs tighter than a label", () => {
    const label = slotPlacementStyle({ origin: "right", align: "center", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP);
    const secondary = slotPlacementStyle({ origin: "right", align: "center", offsetX: 0, offsetY: 0 }, dot, PORT_SECONDARY_SLOT_GAP_PX);
    expect(parseFloat(String(label.left))).toBeGreaterThan(parseFloat(String(secondary.left)));
    expect(parseFloat(String(label.left)) - parseFloat(String(secondary.left)))
      .toBe(PORT_LABEL_GAP - PORT_SECONDARY_SLOT_GAP_PX);
  });

  it("boxInsetPx still resolves for a host whose positioning context is inset (React Flow's bordered Handle)", () => {
    const flush = slotPlacementStyle({ origin: "right", align: "center", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP, 0);
    const inset = slotPlacementStyle({ origin: "right", align: "center", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP, 5);
    expect(parseFloat(String(flush.left)) - parseFloat(String(inset.left))).toBe(5);
  });

  it("an aligned edge makes the lift STATIC — the same offset whatever the slot's size", () => {
    // `end` puts the slot's bottom edge on the reference line; the offset
    // beside it is a plain gap. Nothing here reads the content's height,
    // which is the whole reason this replaced the derived version.
    const small = slotPlacementStyle({ origin: "right", align: "end", offsetX: 0, offsetY: -PORT_LABEL_GAP }, dot, PORT_LABEL_GAP);
    const huge = slotPlacementStyle({ origin: "right", align: "end", offsetX: 0, offsetY: -PORT_LABEL_GAP }, { w: 64, h: 64 }, PORT_LABEL_GAP);
    expect(small.transform).toBe(`translate(0px, calc(-100% + ${-PORT_LABEL_GAP}px))`);
    // Same transform for a dot four times the size — only the along-axis
    // `left` changes, which is the dot's own span, not the slot's.
    expect(huge.transform).toBe(small.transform);
  });

  it("each align pins a different edge of the slot to the origin's line", () => {
    const at = (align: (typeof SLOT_ALIGNS)[number]) =>
      slotPlacementStyle({ origin: "right", align, offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP).transform;
    expect(at("start")).toBe("translate(0px, calc(0% + 0px))");
    expect(at("center")).toBe("translate(0px, calc(-50% + 0px))");
    expect(at("end")).toBe("translate(0px, calc(-100% + 0px))");
  });

  /**
   * THE round-1 invariant, pinned directly rather than inferred: the CSS
   * placement and the measured detach rectangle must put a lifted label in
   * the same place. They drifted twice — `portLabelPlacement` kept a
   * dot-based lift (22px vs 35.5px at xl), then `portLabelBox` did — so
   * this asserts the agreement itself instead of trusting that both happen
   * to call the right function.
   */
  it("the CSS placement and the measured detach box agree on the lift, for every layout", () => {
    const fontPx = PORT_TEXT_SIZES.md;
    for (const layout of PORT_TEXT_LAYOUTS) {
      const preset = TEXT_LAYOUT_AS_PLACEMENT[layout];
      if (!isOffsetTextLayout(layout)) continue;
      const box = portLabelBox({ dotW: dot.w, dotH: dot.h, layout, fontPx, label: "x", measure: () => 40 });
      // `align: "end"` means the BOX's bottom edge sits at the dot's centre
      // line plus the offset — the rectangle twin of `translate(…,-100%)`.
      expect(box.y + box.h, layout).toBeCloseTo(dot.h / 2 + preset.offsetY, 6);
    }
  });

  it("every old PortTextLayout member maps to an origin, and only the two Offset ones are lifted", () => {
    expect(Object.keys(TEXT_LAYOUT_AS_PLACEMENT).sort()).toEqual([...PORT_TEXT_LAYOUTS].sort());
    const lifted = PORT_TEXT_LAYOUTS.filter((l) => TEXT_LAYOUT_AS_PLACEMENT[l].align === "end");
    expect(lifted).toEqual(["rightOffset", "leftOffset"]);
    expect(TEXT_LAYOUT_AS_PLACEMENT.bot.origin).toBe("bottom");
    expect(TEXT_LAYOUT_AS_PLACEMENT.rightOffset.origin).toBe("right");
  });

  it("every old SecondarySlotLayout member maps to an origin too", () => {
    expect(Object.keys(SECONDARY_LAYOUT_AS_ORIGIN).sort()).toEqual([...SECONDARY_SLOT_LAYOUTS].sort());
    expect(SECONDARY_LAYOUT_AS_ORIGIN.botOffset).toBe("bottom");
    expect(new Set(Object.values(SECONDARY_LAYOUT_AS_ORIGIN)).size).toBe(SLOT_ORIGINS.length);
  });
});
