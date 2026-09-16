import { describe, expect, it } from "vitest";

import { BLOCK_BORDER_PX } from "../src/layout";
import {
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_RING_OVERHANG_PX,
  PORT_SECONDARY_SLOT_GAP_PX,
  PORT_TEXT_LAYOUTS,
  SECONDARY_SLOT_LAYOUTS,
  defaultLiftOffsetY,
  defaultPortLabelLift,
  defaultSecondarySlotLayout,
  inwardTextLayout,
  isOffsetTextLayout,
  portAnchor,
  portDotPlacement,
  portFlexDirection,
  portLabelLift,
  portLabelHeight,
  portLabelOut,
  slotPlacementStyle,
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

  it.each(PORT_TEXT_LAYOUTS)("places the text slot for %s", (layout) => {
    expect(portFlexDirection(layout)).toBe(expected[layout]);
  });

  it("only the two -Offset members are offset layouts", () => {
    expect(PORT_TEXT_LAYOUTS.filter(isOffsetTextLayout)).toEqual(["rightOffset", "leftOffset"]);
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

  it("an -Offset layout lifts the label's bottom edge clear of the dot's PAINTED ring; every other layout lifts nothing", () => {
    // sm/md/lg is Port's whole real diameter ladder — the "xl" SIZE rung
    // pairs the same `lg` dot with bigger text (port.presets.ts's own WHY).
    for (const size of ["sm", "md", "lg"] as const) {
      const diameter = PORT_DIAMETERS[size];
      const dot: PortDotBox = { w: diameter, h: diameter };
      // Measured from the dot's CENTRE (where the wire runs) out past the
      // ring's painted edge, plus the one shared label gap.
      const expected = diameter / 2 + PORT_RING_OVERHANG_PX + PORT_LABEL_GAP;
      expect(portLabelLift("rightOffset", dot)).toBe(expected);
      expect(portLabelLift("leftOffset", dot)).toBe(expected);
      for (const layout of ["top", "bot", "right", "left"] as const) {
        expect(portLabelLift(layout, dot)).toBe(0);
      }
    }
  });

  it("the lift GROWS with the dot, so a big port clears its own ring as well as a small one", () => {
    const small: PortDotBox = { w: PORT_DIAMETERS.sm, h: PORT_DIAMETERS.sm };
    const large: PortDotBox = { w: PORT_DIAMETERS.lg, h: PORT_DIAMETERS.lg };
    expect(portLabelLift("rightOffset", large)).toBeGreaterThan(portLabelLift("rightOffset", small));
  });

  /** Zach, 2026-09-15: "In expert mode please expose the offset distance as
   *  a parameter you can tune." */
  it("a tuned labelOffset REPLACES the computed lift outright, so the field's number is the on-screen distance", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    expect(portLabelLift("rightOffset", dot, 40)).toBe(40);
    expect(portLabelLift("leftOffset", dot, 0)).toBe(0);
    // Not a delta on top of the default — 40 means 40, not 19 + 40.
    expect(portLabelLift("rightOffset", dot, 40)).not.toBe(defaultPortLabelLift(dot) + 40);
  });

  it("a tuned labelOffset is IGNORED by a layout that has no lift, so a stale value cannot ghost-lift a plain label", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    for (const layout of ["top", "bot", "right", "left"] as const) {
      expect(portLabelLift(layout, dot, 40)).toBe(0);
    }
  });

  it("omitting labelOffset (or passing a non-finite one) falls back to the computed default", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    const expected = defaultPortLabelLift(dot);
    expect(portLabelLift("rightOffset", dot)).toBe(expected);
    expect(portLabelLift("rightOffset", dot, Number.NaN)).toBe(expected);
  });

  /**
   * `portLabelPlacement` is now a THIN WRAPPER over `slotPlacementStyle`,
   * not a second implementation. That matters: the adapters and blockFace
   * all still call it, and while it computed its own dot-based lift it
   * disagreed with what `LabeledPort` rendered for the same port — 22px vs
   * 35.5px at `xl`, the same port drawn two ways in two renderers. One
   * model, one answer (adversarial judge, 2026-09-15).
   */
  it("delegates to the unified model, so a host adapter and LabeledPort agree on the same port", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    for (const layout of PORT_TEXT_LAYOUTS) {
      const preset = TEXT_LAYOUT_AS_PLACEMENT[layout];
      const viaWrapper = portLabelPlacement(layout, dot, 0, PORT_TEXT_SIZES.md);
      const viaModel = slotPlacementStyle(
        {
          origin: preset.origin,
          offsetX: 0,
          offsetY: preset.liftedLabel
            ? defaultLiftOffsetY(portLabelHeight(PORT_TEXT_SIZES.md), PORT_LABEL_GAP)
            : 0,
        },
        dot,
        PORT_LABEL_GAP,
      );
      expect(viaWrapper, layout).toEqual(viaModel);
    }
  });

  it("its lift tracks the TEXT size, which is what the guarantee actually depends on", () => {
    const dot: PortDotBox = { w: PORT_DIAMETERS.md, h: PORT_DIAMETERS.md };
    const atSm = portLabelPlacement("rightOffset", dot, 0, PORT_TEXT_SIZES.sm).transform;
    const atXl = portLabelPlacement("rightOffset", dot, 0, PORT_TEXT_SIZES.xl).transform;
    expect(atSm).not.toBe(atXl);
    // …and a non-offset layout lifts nothing at any text size.
    expect(portLabelPlacement("right", dot, 0, PORT_TEXT_SIZES.xl).transform).toBe(
      "translate(0px, calc(-50% + 0px))",
    );
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
          const lift = defaultLiftOffsetY(portLabelHeight(PORT_TEXT_SIZES.sm), PORT_LABEL_GAP);
          expect(placement.top).toBe("50%");
          expect(placement.transform).toBe(`translate(0px, calc(-50% + ${lift}px))`);
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
      slotPlacementStyle({ origin, offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP);
    expect(at("right").left).toBe(`${out}px`);
    expect(at("left").right).toBe(`${out}px`);
    expect(at("top").bottom).toBe(`${out}px`);
    expect(at("bottom").top).toBe(`${out}px`);
    // …and the cross axis still centres.
    expect(at("right").top).toBe("50%");
    expect(at("top").left).toBe("50%");
  });

  it("carries BOTH offsets in the transform, so negatives work and the centring never has to be added by hand", () => {
    const p = slotPlacementStyle({ origin: "right", offsetX: 4, offsetY: -23 }, dot, PORT_LABEL_GAP);
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
      const p = slotPlacementStyle({ origin, offsetX: 5, offsetY: 7 }, dot, PORT_LABEL_GAP);
      const horizontal = origin === "top" || origin === "bottom";
      expect(p.transform, origin).toBe(
        horizontal ? "translate(calc(-50% + 5px), 7px)" : "translate(5px, calc(-50% + 7px))",
      );
    }
  });

  it("the two gaps stay distinct: a secondary slot hugs tighter than a label", () => {
    const label = slotPlacementStyle({ origin: "right", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP);
    const secondary = slotPlacementStyle({ origin: "right", offsetX: 0, offsetY: 0 }, dot, PORT_SECONDARY_SLOT_GAP_PX);
    expect(parseFloat(String(label.left))).toBeGreaterThan(parseFloat(String(secondary.left)));
    expect(parseFloat(String(label.left)) - parseFloat(String(secondary.left)))
      .toBe(PORT_LABEL_GAP - PORT_SECONDARY_SLOT_GAP_PX);
  });

  it("boxInsetPx still resolves for a host whose positioning context is inset (React Flow's bordered Handle)", () => {
    const flush = slotPlacementStyle({ origin: "right", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP, 0);
    const inset = slotPlacementStyle({ origin: "right", offsetX: 0, offsetY: 0 }, dot, PORT_LABEL_GAP, 5);
    expect(parseFloat(String(flush.left)) - parseFloat(String(inset.left))).toBe(5);
  });

  it("defaultLiftOffsetY puts the content's BOTTOM edge exactly gap above the wire, and is negative", () => {
    const h = portLabelHeight(PORT_TEXT_SIZES.md);
    const y = defaultLiftOffsetY(h, PORT_LABEL_GAP);
    expect(y).toBeLessThan(0);
    // centred content's bottom is at +h/2; after y it is at h/2 + y.
    expect(h / 2 + y).toBe(-PORT_LABEL_GAP);
  });

  it("the lift GROWS with the text size — the exact reason it is resolved live and not frozen into a preset", () => {
    const small = defaultLiftOffsetY(portLabelHeight(PORT_TEXT_SIZES.sm), PORT_LABEL_GAP);
    const huge = defaultLiftOffsetY(portLabelHeight(PORT_TEXT_SIZES.xl), PORT_LABEL_GAP);
    expect(huge).toBeLessThan(small);
    // Freezing the `md` value and using it at `xl` would leave the bottom
    // edge BELOW the wire — the failure this design exists to avoid.
    const frozenAtMd = defaultLiftOffsetY(portLabelHeight(PORT_TEXT_SIZES.md), PORT_LABEL_GAP);
    const bottomAtXlWithFrozen = portLabelHeight(PORT_TEXT_SIZES.xl) / 2 + frozenAtMd;
    expect(bottomAtXlWithFrozen).toBeGreaterThan(0);
  });

  it("every old PortTextLayout member maps to an origin, and only the two Offset ones are lifted", () => {
    expect(Object.keys(TEXT_LAYOUT_AS_PLACEMENT).sort()).toEqual([...PORT_TEXT_LAYOUTS].sort());
    const lifted = PORT_TEXT_LAYOUTS.filter((l) => TEXT_LAYOUT_AS_PLACEMENT[l].liftedLabel);
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
