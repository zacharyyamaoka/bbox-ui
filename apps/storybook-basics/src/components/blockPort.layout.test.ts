/**
 * src/components/blockPort.layout.test.ts — the view→placement table
 * of docs/BLOCK-PORT-EDGES-PLAN.md §3, asserted as pure math.
 *
 * NO LONGER DORMANT. Written while `vitest.config.ts` declared only the
 * `storybook` project (TRACE-PLAN P3's `unit` node project hadn't landed
 * yet), so this file used to sit uncollected by anything but `tsc`. The
 * trace lane's merge added that `unit` project (its `include` globs every
 * `.test.ts` file under `src/`) and this file matches it by extension —
 * `pnpm exec vitest --project=unit run` now runs it for real, alongside
 * `elbow`'s. `pnpm test-stories`
 * deliberately still runs ONLY the `storybook` project (its own module doc
 * says why), so every claim here is ALSO measured in a real browser by
 * `src/stories/BlockPort.stories.tsx`, which is what proves this lane's own
 * work rather than this file alone.
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
  functionPortCenterPx,
  functionPortHeaderInsetPx,
  offsetEdgePaddingPx,
  railAxisFor,
  railBoxFor,
  railPitchPx,
  railPlanFor,
  type BlockBands,
  type RailPlanInput,
} from "./blockPort.layout";
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
 *  origin — the same shape `BlockPort.stories.tsx` renders. */
const BANDS: BlockBands = {
  blockLeft: 0,
  blockTop: 0,
  blockWidth: 220,
  blockHeight: 240,
  bodyTop: 38,
  bodyBottom: 202,
  headerTop: 0,
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
  it("spreads along the full wall with a constant corner margin, in expanded view", () => {
    for (const edge of ["top", "bottom"] as const) {
      const plan = railPlanFor(planInput({ view: "expanded", edge }));
      expect(plan.band).toBe("block");
      expect(plan.endMarginPx).toBe(RAIL_END_MARGIN_PX);
      expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-between" });
    }
  });

  // E-3, 2026-09-17: superseded for "port" view specifically — a populated
  // top/bottom wall is itself "a populated top/bottom wall" (its own plan's
  // `populatedEdges` defaults to `[edge]`), so it now always distributes
  // `space-around` rather than `space-between`. Corner clearance (band
  // "block", RAIL_END_MARGIN_PX) is unchanged — only the SCHEME moved.
  it("switches a horizontal wall in port view to space-around", () => {
    for (const edge of ["top", "bottom"] as const) {
      const plan = railPlanFor(planInput({ view: "port", edge }));
      expect(plan.band).toBe("block");
      expect(plan.endMarginPx).toBe(RAIL_END_MARGIN_PX);
      expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-around" });
    }
  });

  it("still collapses on a horizontal wall in simple view", () => {
    const plan = railPlanFor(planInput({ view: "simple", edge: "top", collapsePorts: true }));
    expect(plan.collapsed).toBe(true);
    expect(plan.endMarginPx).toBe(0);
  });
});

// E-3, 2026-09-17 — Zach: "if port edges on all 4 sides. then the edges
// should all be distribute and around. if port edges just on left or
// right, then it should be aligned to edge and to the start." A single
// edge's OWN plan cannot see its siblings, so `populatedEdges` carries the
// whole block's populated set into `railPlanFor`.
describe("railPlanFor — port view population defaults (E-3)", () => {
  it("keeps left/right aligned to the start when only left/right are populated", () => {
    for (const edge of ["left", "right"] as const) {
      const plan = railPlanFor(planInput({ edge, populatedEdges: ["left", "right"] }));
      expect(plan.distribution).toMatchObject({ mode: "aligned", anchor: "start" });
    }
  });

  it("switches left/right to distribute/space-around once a top or bottom wall is populated too", () => {
    for (const edge of ["left", "right"] as const) {
      const plan = railPlanFor(planInput({ edge, populatedEdges: ["left", "right", "top"] }));
      expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-around" });
    }
  });

  it("a single edge with no `populatedEdges` override reads as populated-by-itself-only", () => {
    // The default (`populatedEdges = [edge]`) is what keeps every existing
    // single-edge caller — this file's own fixtures, BlockPortLane's
    // lane-availability probe — reading exactly as before with no call-site
    // change: "left" alone is not a horizontal wall, so it stays aligned.
    const plan = railPlanFor(planInput({ edge: "left" }));
    expect(plan.distribution).toMatchObject({ mode: "aligned" });
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

describe("functionPortCenterPx", () => {
  it("sits on the block's left border line, centred in the header band", () => {
    const center = functionPortCenterPx(BANDS)!;
    expect(center.x).toBe(BANDS.blockLeft);
    expect(center.y).toBe((BANDS.headerTop! + BANDS.bodyTop) / 2);
    // Sanity: for this fixture's 0..38 header, that's 19 — the header's
    // own midline, not the block's or the body's.
    expect(center.y).toBe(19);
  });

  it("moves with the block, not just the header height", () => {
    const shifted: BlockBands = { ...BANDS, blockLeft: 40, blockTop: 12, headerTop: 12, bodyTop: 50 };
    const center = functionPortCenterPx(shifted)!;
    expect(center.x).toBe(40);
    expect(center.y).toBe(31);
  });

  it("is null when the Block renders no header", () => {
    const { headerTop: _headerTop, ...noHeader } = BANDS;
    expect(functionPortCenterPx(noHeader)).toBeNull();
  });
});

describe("functionPortHeaderInsetPx (D-5)", () => {
  it("is the dot's radius, plus its ring overhang, plus the label gap — never a bare pixel", () => {
    // md: 12px dot -> 6 radius + 5 ring (2 surface + 3 state) + 8 label gap.
    expect(functionPortHeaderInsetPx("md")).toBe(19);
    expect(functionPortHeaderInsetPx("sm")).toBe(4 + 5 + 8); // 8px dot
    expect(functionPortHeaderInsetPx("lg")).toBe(9 + 5 + 8); // 18px dot
  });

  it("defaults to md when omitted", () => {
    expect(functionPortHeaderInsetPx()).toBe(functionPortHeaderInsetPx("md"));
  });

  it("grows with an exact pixel diameter too, not just the named rungs", () => {
    expect(functionPortHeaderInsetPx(40)).toBe(20 + 5 + 8);
  });
});
