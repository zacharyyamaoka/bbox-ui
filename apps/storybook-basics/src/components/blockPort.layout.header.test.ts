/**
 * src/components/blockPort.layout.header.test.ts — the HEADER band and the
 * head tab, as pure math.
 *
 * Zach, 2026-09-22, sketching a Block as Header / Body / Footer and then
 * shrinking the header to a tab: *"Ports on Header, inputs and outputs…"*,
 * *"Head Tab View"*, *"With Ports"* (`Pasted image 20260922184406.png`,
 * `…184414.png`, `…184423.png`), concluding *"So everything really is then
 * just a block, definitely no need for a separate BlockRegion."*
 *
 * These are ACCEPTANCE assertions for that geometry, written before the
 * components that consume it. They are deliberately about `railBoxFor`
 * alone — no DOM, no React — because the claim being made is a claim about
 * where a rail's border line lands, and a story that merely renders a dot
 * somewhere cannot fail when the line is wrong.
 *
 * The last block ("the new fields cannot leak") is the mutation-sensitive
 * half: it pins that `headerRight` changes NOTHING for the two bands that
 * existed before, so the feature cannot silently move every port in the kit.
 */
import { describe, expect, it } from "vitest";

import {
  RAIL_CROSS_PX,
  RAIL_MAIN_INSET_PX,
  railBoxFor,
  type BlockBands,
  type RailPlan,
} from "./blockPort.layout";

/** A block at (100, 200), 300×180, whose header strip is 200..240 and whose
 *  body runs 240..380. The header HUGS at 180px wide, so the tab's right
 *  edge is 280 while the block's is 400. Every number here is distinct so a
 *  wrong pick shows up as a wrong number rather than a coincidence. */
const TAB_BANDS: BlockBands = {
  blockLeft: 100,
  blockTop: 200,
  blockWidth: 300,
  blockHeight: 180,
  bodyTop: 240,
  bodyBottom: 380,
  headerTop: 200,
  headerRight: 280,
};

/** The same block with a FULL-WIDTH header: no `headerRight` measured. */
const FULL_BANDS: BlockBands = { ...TAB_BANDS, headerRight: undefined };

/** The same block with no header at all. */
const BARE_BANDS: BlockBands = { ...FULL_BANDS, headerTop: undefined, bodyTop: 200 };

function plan(band: RailPlan["band"], endMarginPx = 0): RailPlan {
  return {
    distribution: { mode: "distribute", scheme: "space-evenly" },
    groups: "",
    groupMode: "off",
    band,
    endMarginPx,
    collapsed: false,
  };
}

/** A rail's content box along the main axis, undoing the constant inset the
 *  border box carries at both ends. */
function contentSpan(box: { top: number; height: number }) {
  return {
    start: box.top + RAIL_MAIN_INSET_PX,
    end: box.top + box.height - RAIL_MAIN_INSET_PX,
  };
}

describe("railBoxFor · header band, column walls", () => {
  it("spans exactly the header strip, not the body and not the whole block", () => {
    const left = railBoxFor("left", plan("header"), TAB_BANDS);
    expect(contentSpan(left)).toEqual({ start: 200, end: 240 });
  });

  it("puts a LEFT header rail on the block's own left wall", () => {
    const left = railBoxFor("left", plan("header"), TAB_BANDS);
    expect(left.left + left.width / 2).toBe(TAB_BANDS.blockLeft);
    expect(left.width).toBe(RAIL_CROSS_PX);
  });

  it("puts a RIGHT header rail on the TAB's right edge when the header hugs", () => {
    const right = railBoxFor("right", plan("header"), TAB_BANDS);
    expect(right.left + right.width / 2).toBe(280);
  });

  it("falls back to the block's right wall when the header is full width", () => {
    const right = railBoxFor("right", plan("header"), FULL_BANDS);
    expect(right.left + right.width / 2).toBe(400);
  });

  it("honours endMargin at both ends of the header strip", () => {
    const left = railBoxFor("left", plan("header", 6), TAB_BANDS);
    expect(contentSpan(left)).toEqual({ start: 206, end: 234 });
  });

  it("degrades to the block band when there is no header to sit in", () => {
    const header = railBoxFor("left", plan("header"), BARE_BANDS);
    const block = railBoxFor("left", plan("block"), BARE_BANDS);
    expect(header).toEqual(block);
  });
});

describe("railBoxFor · header band, row walls", () => {
  it("rides the header's own top line", () => {
    const top = railBoxFor("top", plan("header"), TAB_BANDS);
    expect(top.top + top.height / 2).toBe(200);
  });

  it("rides the line the tab SHARES with the body, not the block's bottom", () => {
    const bottom = railBoxFor("bottom", plan("header"), TAB_BANDS);
    expect(bottom.top + bottom.height / 2).toBe(240);
    expect(bottom.top + bottom.height / 2).not.toBe(TAB_BANDS.blockTop + TAB_BANDS.blockHeight);
  });

  it("stops where the tab stops", () => {
    const top = railBoxFor("top", plan("header"), TAB_BANDS);
    expect(top.left + RAIL_MAIN_INSET_PX).toBe(100);
    expect(top.left + top.width - RAIL_MAIN_INSET_PX).toBe(280);
  });

  it("spans the whole block when the header is full width", () => {
    const top = railBoxFor("top", plan("header"), FULL_BANDS);
    expect(top.left + top.width - RAIL_MAIN_INSET_PX).toBe(400);
  });
});

describe("railBoxFor · the new fields cannot leak into the old bands", () => {
  const bands: [string, BlockBands][] = [
    ["a hugged header", TAB_BANDS],
    ["a full-width header", FULL_BANDS],
  ];

  for (const [name, withHeader] of bands) {
    it(`leaves the body band untouched with ${name}`, () => {
      const withoutHeaderRight = { ...withHeader, headerRight: undefined };
      expect(railBoxFor("right", plan("body"), withHeader)).toEqual(
        railBoxFor("right", plan("body"), withoutHeaderRight),
      );
      expect(railBoxFor("bottom", plan("body"), withHeader)).toEqual(
        railBoxFor("bottom", plan("body"), withoutHeaderRight),
      );
    });

    it(`leaves the block band untouched with ${name}`, () => {
      const withoutHeaderRight = { ...withHeader, headerRight: undefined };
      expect(railBoxFor("right", plan("block"), withHeader)).toEqual(
        railBoxFor("right", plan("block"), withoutHeaderRight),
      );
      expect(railBoxFor("top", plan("block"), withHeader)).toEqual(
        railBoxFor("top", plan("block"), withoutHeaderRight),
      );
    });
  }

  it("still puts a body rail on the BLOCK's right wall even when a tab is narrower", () => {
    const right = railBoxFor("right", plan("body"), TAB_BANDS);
    expect(right.left + right.width / 2).toBe(400);
  });
});
