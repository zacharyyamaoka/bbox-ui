/**
 * src/components/blockPortEdges.layout.test.ts — the view→placement table
 * of docs/BLOCK-PORT-EDGES-PLAN.md §3, asserted as pure math.
 *
 * DORMANT ON PURPOSE. `vitest.config.ts` currently declares exactly one
 * project — `storybook`, whose `include` is the stories glob — and that file
 * is owned by the sibling trace lane (TRACE-PLAN P3 adds the node `unit`
 * project; "no two lanes edit this file"). So `pnpm test-stories` neither
 * runs nor collects this file today. It is written now because the math it
 * pins is written now, and it costs one line of config to arm later:
 *
 *     pnpm vitest run --project=unit          # once that project exists
 *
 * It is NOT this lane's proof in the meantime. Every claim below is also
 * measured in a real browser by `src/stories/BlockPorts.stories.tsx`, which
 * does run — a dormant test standing in for a live one would be exactly the
 * false-green this repo has already paid for once.
 *
 * `tsc -p tsconfig.json` DOES compile this file, so it cannot rot silently
 * against the module's own types.
 */
import { describe, expect, it } from "vitest";

import {
  OFFSET_TRAILING_EDGE,
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_CROSS_PX,
  RAIL_END_MARGIN_PX,
  RAIL_GAP_PX,
  RAIL_MAIN_INSET_PX,
  alignedFirstCentrePx,
  offsetEdgePaddingPx,
  railAxisFor,
  railBoxFor,
  railPitchPx,
  railPlanFor,
  type BlockBands,
  type RailPlanInput,
} from "./blockPortEdges.layout";
import { CONTAINER_BORDER, CONTAINER_PADDING, offsetPaddingFor } from "./portEdge.layout";

const INPUT_IDS = ["pose", "gain", "reset"];
const OUTPUT_IDS = ["cmd", "status"];

function planInput(overrides: Partial<RailPlanInput> = {}): RailPlanInput {
  return {
    view: "port",
    portLayout: "inline",
    edge: "left",
    itemIds: INPUT_IDS,
    leadCount: 0,
    collapsePorts: false,
    ...overrides,
  };
}

/** A 220×240 Block with a 37px header and a 37px footer, at the wrapper's
 *  origin — the same shape `BlockPorts.stories.tsx` renders. */
const BANDS: BlockBands = {
  blockLeft: 0,
  blockTop: 0,
  blockWidth: 220,
  blockHeight: 240,
  bodyTop: 38,
  bodyBottom: 202,
};

describe("constants", () => {
  it("derives the rail's cross size from PortEdge's own track chrome", () => {
    expect(RAIL_MAIN_INSET_PX).toBe(CONTAINER_BORDER + CONTAINER_PADDING);
    expect(RAIL_CROSS_PX).toBe(PORT_EDGE_SLOT_MIN_PX + 2 * RAIL_MAIN_INSET_PX);
  });

  it("pitches by slot size plus gap", () => {
    expect(railPitchPx()).toBe(PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX);
  });

  it("maps left/right to a column and top/bottom to a row", () => {
    expect(railAxisFor("left")).toBe("column");
    expect(railAxisFor("right")).toBe("column");
    expect(railAxisFor("top")).toBe("row");
    expect(railAxisFor("bottom")).toBe("row");
  });
});

describe("railPlanFor — simple", () => {
  it("collapses the whole wall into one slot, centred", () => {
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: true }));
    expect(plan.groupMode).toBe("collapsed");
    expect(plan.groups).toBe(INPUT_IDS.join(", "));
    expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-evenly" });
    expect(plan.band).toBe("block");
    expect(plan.endMarginPx).toBe(0);
    expect(plan.collapsed).toBe(true);
  });

  it("uses space-evenly, not space-between — a lone slot under space-between pins to the top", () => {
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: true }));
    expect(plan.distribution).not.toMatchObject({ scheme: "space-between" });
  });

  it("spreads along the wall instead when collapsePorts is false (the donor's communication face)", () => {
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: false }));
    expect(plan.groupMode).toBe("off");
    expect(plan.collapsed).toBe(false);
    expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-between" });
    expect(plan.endMarginPx).toBe(RAIL_END_MARGIN_PX);
  });
});

describe("railPlanFor — port view", () => {
  it("packs both lanes from the body top when inline", () => {
    for (const edge of ["left", "right"] as const) {
      const plan = railPlanFor(planInput({ edge, portLayout: "inline", leadCount: INPUT_IDS.length }));
      expect(plan.band).toBe("body");
      expect(plan.distribution).toEqual({ mode: "aligned", anchor: "start", gap: RAIL_GAP_PX, edgePadding: 0 });
    }
  });

  it("pushes only the trailing lane down when offset", () => {
    const lead = railPlanFor(planInput({ edge: "left", portLayout: "offset", leadCount: INPUT_IDS.length }));
    const trail = railPlanFor(planInput({ edge: OFFSET_TRAILING_EDGE, portLayout: "offset", itemIds: OUTPUT_IDS, leadCount: INPUT_IDS.length }));
    expect(lead.distribution).toMatchObject({ edgePadding: 0 });
    expect(trail.distribution).toMatchObject({ edgePadding: offsetEdgePaddingPx(INPUT_IDS.length) });
  });

  it("puts the trailing lane's first port exactly one pitch below the leading lane's last", () => {
    const lead = railPlanFor(planInput({ edge: "left", portLayout: "offset", leadCount: INPUT_IDS.length }));
    const trail = railPlanFor(planInput({ edge: "right", portLayout: "offset", itemIds: OUTPUT_IDS, leadCount: INPUT_IDS.length }));
    const leadFirst = alignedFirstCentrePx(lead, BANDS)!;
    const leadLast = leadFirst + (INPUT_IDS.length - 1) * railPitchPx();
    const trailFirst = alignedFirstCentrePx(trail, BANDS)!;
    expect(trailFirst - leadLast).toBe(railPitchPx());
  });

  it("is exact where offsetPaddingFor is an approximation", () => {
    // `offsetPaddingFor` is documented in portEdge.layout.ts as ignoring
    // card size; it has zero call sites and stays untouched (D-A3). The
    // shortfall is the whole reason a new helper exists.
    expect(offsetEdgePaddingPx(3)).toBe(3 * (PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX));
    expect(offsetPaddingFor(3, RAIL_GAP_PX)).toBe(3 * RAIL_GAP_PX);
    expect(offsetEdgePaddingPx(3) - offsetPaddingFor(3, RAIL_GAP_PX)).toBe(3 * PORT_EDGE_SLOT_MIN_PX);
  });
});

describe("railPlanFor — expanded", () => {
  it("spreads evenly over the body band", () => {
    const plan = railPlanFor(planInput({ view: "expanded" }));
    expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-evenly" });
    expect(plan.band).toBe("body");
    expect(plan.endMarginPx).toBe(0);
    expect(alignedFirstCentrePx(plan, BANDS)).toBeNull();
  });
});

describe("railPlanFor — horizontal walls", () => {
  it("spreads along the full wall with a constant corner margin, in every view", () => {
    for (const view of ["port", "expanded"] as const) {
      for (const edge of ["top", "bottom"] as const) {
        const plan = railPlanFor(planInput({ view, edge }));
        expect(plan.band).toBe("block");
        expect(plan.endMarginPx).toBe(RAIL_END_MARGIN_PX);
        expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-between" });
      }
    }
  });

  it("still collapses on a horizontal wall in simple view", () => {
    const plan = railPlanFor(planInput({ view: "simple", edge: "top", collapsePorts: true }));
    expect(plan.collapsed).toBe(true);
    expect(plan.endMarginPx).toBe(0);
  });
});

describe("railBoxFor", () => {
  it("puts the rail's cross centre on the wall line", () => {
    const plan = railPlanFor(planInput());
    const left = railBoxFor("left", plan, BANDS);
    const right = railBoxFor("right", plan, BANDS);
    expect(left.left + left.width / 2).toBe(BANDS.blockLeft);
    expect(right.left + right.width / 2).toBe(BANDS.blockLeft + BANDS.blockWidth);

    const top = railBoxFor("top", railPlanFor(planInput({ edge: "top" })), BANDS);
    expect(top.top + top.height / 2).toBe(BANDS.blockTop);
  });

  it("spans the body band with its CONTENT box, not its border box", () => {
    const plan = railPlanFor(planInput());
    const box = railBoxFor("left", plan, BANDS);
    expect(box.top + RAIL_MAIN_INSET_PX).toBe(BANDS.bodyTop);
    expect(box.top + box.height - RAIL_MAIN_INSET_PX).toBe(BANDS.bodyBottom);
    // ...which is what makes the stated rule the measured one.
    expect(alignedFirstCentrePx(plan, BANDS)).toBe(BANDS.bodyTop + PORT_EDGE_SLOT_MIN_PX / 2);
  });

  it("spans the whole block in simple view", () => {
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: true }));
    const box = railBoxFor("left", plan, BANDS);
    expect(box.top + RAIL_MAIN_INSET_PX).toBe(BANDS.blockTop);
    expect(box.height - 2 * RAIL_MAIN_INSET_PX).toBe(BANDS.blockHeight);
  });

  it("insets a spread wall by the donor's constant corner margin", () => {
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: false }));
    const box = railBoxFor("left", plan, BANDS);
    expect(box.top + RAIL_MAIN_INSET_PX).toBe(BANDS.blockTop + RAIL_END_MARGIN_PX);
    expect(box.height - 2 * RAIL_MAIN_INSET_PX).toBe(BANDS.blockHeight - 2 * RAIL_END_MARGIN_PX);
  });

  it("never returns a negative main size when a band is shorter than its margins", () => {
    const squashed: BlockBands = { ...BANDS, blockHeight: 20, bodyTop: 10, bodyBottom: 10 };
    const plan = railPlanFor(planInput({ view: "simple", collapsePorts: false }));
    expect(railBoxFor("left", plan, squashed).height).toBeGreaterThanOrEqual(2 * RAIL_MAIN_INSET_PX);
  });
});
