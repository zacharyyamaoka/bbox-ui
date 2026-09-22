/**
 * src/components/minBlockHeight.test.ts — `minBlockHeightFor`, the floor a
 * Block's wall ports put under its height (Zach, 2026-09-22: "Please enforce
 * a minimum height on the blocks … that can be calculated from the minimum
 * port spacing").
 *
 * WHY the headline case is checked against `railBoxFor` + the rail's own
 * slot arithmetic and not against a restated formula: a test that re-typed
 * `n*slot + (n-1)*gap` would pass a floor and a renderer that drifted
 * together. The oracle below places the LAST slot the way the renderer
 * does — the first aligned centre from `alignedFirstCentrePx`, then one full
 * pitch per port — inside the band `railBoxFor` gives a box of exactly the
 * floor's height, and asserts the slot's bottom lands on the body's bottom
 * edge: at the floor it fits, one pixel shorter it does not.
 */
import { describe, expect, it } from "vitest";

import {
  PORT_EDGE_SLOT_MIN_PX as SLOT,
  RAIL_END_MARGIN_PX,
  RAIL_GAP_PX as GAP,
  alignedFirstCentrePx,
  floorMinHeight,
  minBlockHeightFor,
  railPitchPx,
  railPlanFor,
  type BlockBands,
} from "./blockPort.layout";

const HEADER = 37;
const FOOTER = 29;

function bandsFor(height: number, headerPx = HEADER, footerPx = 0): BlockBands {
  return { blockLeft: 0, blockTop: 0, blockWidth: 150, blockHeight: height, bodyTop: headerPx, bodyBottom: height - footerPx, headerTop: 0 };
}

/** Where the renderer puts the bottom of the LAST slot on an aligned rail. */
function lastAlignedSlotBottom(n: number, bands: BlockBands): number {
  const plan = railPlanFor({ view: "port", portLayout: "inline", edge: "right", itemIds: Array.from({ length: n }, (_, i) => `p${i}`), leadCount: 0, collapsePorts: false });
  const first = alignedFirstCentrePx(plan, bands)!;
  return first + (n - 1) * railPitchPx() + SLOT / 2;
}

describe("minBlockHeightFor", () => {
  it("is 0 with no side-wall ports, so a portless Block keeps hugging", () => {
    expect(minBlockHeightFor({ view: "port", ports: {}, headerPx: HEADER })).toBe(0);
    expect(minBlockHeightFor({ view: "port", ports: { left: 0, right: 0 }, headerPx: HEADER })).toBe(0);
  });

  it("ignores top/bottom counts for the floor itself — those rails run along the width", () => {
    expect(minBlockHeightFor({ view: "port", ports: { top: 4, bottom: 2 }, headerPx: HEADER })).toBe(0);
  });

  it("the reported `src` block: three right-wall ports fit exactly at the floor, and not one pixel under it", () => {
    const floor = minBlockHeightFor({ view: "port", ports: { right: 3 }, headerPx: HEADER });
    expect(floor).toBe(HEADER + 3 * SLOT + 2 * GAP);
    expect(lastAlignedSlotBottom(3, bandsFor(floor))).toBe(bandsFor(floor).bodyBottom);
    expect(lastAlignedSlotBottom(3, bandsFor(floor - 1))).toBeGreaterThan(bandsFor(floor - 1).bodyBottom);
    // The stored 116px from branch.fixtures.ts really was too short.
    expect(floor).toBeGreaterThan(116);
  });

  it("uneven walls: the longer wall decides (inline lanes share the band top)", () => {
    expect(minBlockHeightFor({ view: "port", ports: { left: 1, right: 3 }, headerPx: HEADER })).toBe(
      minBlockHeightFor({ view: "port", ports: { right: 3 }, headerPx: HEADER }),
    );
    expect(minBlockHeightFor({ view: "port", ports: { left: 4, right: 2 }, headerPx: HEADER })).toBe(HEADER + 4 * SLOT + 3 * GAP);
  });

  it("adds the footer band below the rail", () => {
    expect(minBlockHeightFor({ view: "port", ports: { left: 2 }, headerPx: HEADER, footerPx: FOOTER })).toBe(HEADER + 2 * SLOT + GAP + FOOTER);
  });

  it("offset layout stacks the trailing lane below the leading one", () => {
    expect(minBlockHeightFor({ view: "port", portLayout: "offset", ports: { left: 2, right: 3 }, headerPx: HEADER })).toBe(HEADER + 5 * SLOT + 4 * GAP);
  });

  it("a populated top wall switches the side rails to space-around, which needs a half gap at each end (E-3)", () => {
    const withTop = minBlockHeightFor({ view: "port", ports: { left: 2, top: 1 }, headerPx: HEADER });
    expect(withTop).toBe(HEADER + 2 * SLOT + 2 * GAP);
    expect(withTop).toBeGreaterThan(minBlockHeightFor({ view: "port", ports: { left: 2 }, headerPx: HEADER }));
  });

  it("a collapsed (simple) wall is ONE dot on the whole block, whatever its count — grouped ports do not stack", () => {
    expect(minBlockHeightFor({ view: "simple", ports: { left: 5, right: 2 }, headerPx: HEADER })).toBe(SLOT);
  });

  it("a spread simple face spans the whole block with the constant corner margin", () => {
    expect(minBlockHeightFor({ view: "simple", collapsePorts: false, ports: { right: 3 }, headerPx: HEADER })).toBe(
      3 * SLOT + 2 * GAP + 2 * RAIL_END_MARGIN_PX,
    );
  });

  it("expanded view spreads space-evenly across the body, a full gap at each end", () => {
    expect(minBlockHeightFor({ view: "expanded", ports: { left: 3 }, headerPx: HEADER, footerPx: FOOTER })).toBe(HEADER + 3 * SLOT + 4 * GAP + FOOTER);
  });

  it("a LONE port needs one slot and no end gaps, in every view", () => {
    expect(minBlockHeightFor({ view: "expanded", ports: { left: 1 }, headerPx: HEADER })).toBe(HEADER + SLOT);
    expect(minBlockHeightFor({ view: "port", ports: { left: 1, top: 1 }, headerPx: HEADER })).toBe(HEADER + SLOT);
  });

  it("honours a caller's explicit per-wall distribution over the view default", () => {
    expect(
      minBlockHeightFor({
        view: "port",
        ports: { right: 3 },
        headerPx: HEADER,
        distributions: { right: { mode: "aligned", anchor: "start", gap: 6, edgePadding: 10 } },
      }),
    ).toBe(HEADER + 10 + 3 * SLOT + 2 * 6);
  });
});

describe("floorMinHeight — the floor never lowers a caller's own min-height", () => {
  it("takes the floor when the caller set none", () => {
    expect(floorMinHeight(undefined, 146)).toBe(146);
    expect(floorMinHeight("", 146)).toBe(146);
  });
  it("keeps a caller's LARGER numeric min-height (the audit's case: 300 must not become 146)", () => {
    expect(floorMinHeight(300, 146)).toBe(300);
  });
  it("raises a caller's SMALLER numeric min-height to the floor", () => {
    expect(floorMinHeight(40, 146)).toBe(146);
  });
  it("hands a non-numeric caller value to CSS max()", () => {
    expect(floorMinHeight("10rem", 146)).toBe("max(10rem, 146px)");
  });
  it("hands lengths and percentages to CSS max(), unit or not", () => {
    expect(floorMinHeight("50%", 146)).toBe("max(50%, 146px)");
    expect(floorMinHeight("0", 146)).toBe("max(0, 146px)");
    expect(floorMinHeight("12.5vh", 146)).toBe("max(12.5vh, 146px)");
  });
  it("hands math and substitution functions to CSS max()", () => {
    expect(floorMinHeight("calc(100% - 2rem)", 146)).toBe("max(calc(100% - 2rem), 146px)");
    expect(floorMinHeight("clamp(4rem, 20vh, 20rem)", 146)).toBe("max(clamp(4rem, 20vh, 20rem), 146px)");
    expect(floorMinHeight("var(--block-min)", 146)).toBe("max(var(--block-min), 146px)");
  });
  // `max(max-content, 146px)` is invalid CSS math: the browser drops the
  // whole declaration, losing the caller's value AND the port floor.
  it("keeps the floor px for an intrinsic sizing keyword, never max(keyword, …)", () => {
    for (const keyword of ["auto", "min-content", "max-content", "fit-content", "fit-content(10rem)", " max-content "]) {
      expect(floorMinHeight(keyword, 146), keyword).toBe(146);
    }
  });
  it("keeps the floor px for a CSS-wide keyword", () => {
    for (const keyword of ["inherit", "initial", "unset", "revert", "revert-layer"]) {
      expect(floorMinHeight(keyword, 146), keyword).toBe(146);
    }
  });
});
