/**
 * Unit tests for src/scene/fitToContent.ts.
 *
 * The important one is "the RAIL_MAIN_INSET_PX cancellation" — it is the
 * donor's own warning ("any change to the body's padding or to the footer
 * has to move both numbers together or neither", `layoutBlock.ts:497-501`)
 * turned into something that can actually fail. It does NOT restate
 * `railBandHeightForSlots`'s formula; it runs the output through the REAL
 * `railBoxFor` and the REAL track constants and checks where the slots
 * land.
 */
import { describe, expect, it } from "vitest";

import {
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_END_MARGIN_PX,
  RAIL_GAP_PX,
  RAIL_MAIN_INSET_PX,
  offsetEdgePaddingPx,
  railBoxFor,
  type BlockBands,
  type RailPlan,
} from "../components/blockPort.layout";
import { CONTAINER_BORDER, CONTAINER_PADDING, type Distribution } from "../components/portEdge.layout";
import {
  DEFAULT_MEMBER_INSET_PX,
  blockExpandedFitHeight,
  blockPortViewMinHeight,
  fitBoxToMembers,
  portViewSlotCount,
  railBandHeightForSlots,
  railBandIsCrowded,
  railPitchForBand,
  resolveBlockHeight,
} from "./fitToContent";

const ALIGNED: Distribution = { mode: "aligned", anchor: "start", gap: RAIL_GAP_PX, edgePadding: 0 };
const AROUND: Distribution = { mode: "distribute", scheme: "space-around" };
const BETWEEN: Distribution = { mode: "distribute", scheme: "space-between" };
const EVENLY: Distribution = { mode: "distribute", scheme: "space-evenly" };

/** A body-band plan — the port-view, left/right-only case. */
function bodyPlan(overrides: Partial<RailPlan> = {}): RailPlan {
  return {
    distribution: ALIGNED,
    groups: "",
    groupMode: "off",
    band: "body",
    endMarginPx: 0,
    collapsed: false,
    ...overrides,
  };
}

/** Bands for a Block whose body region is exactly `bandPx` tall. */
function bandsWithBody(bandPx: number, headerPx = 0, footerPx = 0): BlockBands {
  return {
    blockLeft: 0,
    blockTop: 0,
    blockWidth: 320,
    blockHeight: headerPx + bandPx + footerPx,
    bodyTop: headerPx,
    bodyBottom: headerPx + bandPx,
    headerTop: headerPx > 0 ? 0 : undefined,
  };
}

/**
 * What `portEdge.tsx` actually gives its slot boxes, given a rail box: the
 * track's border box minus its own border and padding on both ends. Written
 * from the REAL exported constants so it moves when they move.
 */
function trackContentMainPx(railHeightPx: number): number {
  return railHeightPx - 2 * CONTAINER_BORDER - 2 * CONTAINER_PADDING;
}

/** The space `n` slot boxes occupy at full pitch. */
function slotsMainPx(n: number, slot = PORT_EDGE_SLOT_MIN_PX, gap = RAIL_GAP_PX): number {
  return n <= 0 ? 0 : n * slot + (n - 1) * gap;
}

describe("railBandHeightForSlots", () => {
  it("is zero for an unpopulated edge, so a portless Block keeps hugging", () => {
    expect(railBandHeightForSlots(0)).toBe(0);
    expect(railBandHeightForSlots(-3)).toBe(0);
  });

  it("is the slot boxes plus the gaps between them", () => {
    // 1 slot: just the box. 2: two boxes + one gap. 5: five + four.
    expect(railBandHeightForSlots(1)).toBe(PORT_EDGE_SLOT_MIN_PX);
    expect(railBandHeightForSlots(2)).toBe(2 * PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX);
    expect(railBandHeightForSlots(5)).toBe(5 * PORT_EDGE_SLOT_MIN_PX + 4 * RAIL_GAP_PX);
  });

  it("adds the end margin at BOTH ends when the plan has one", () => {
    expect(railBandHeightForSlots(3, { endMarginPx: RAIL_END_MARGIN_PX })).toBe(
      railBandHeightForSlots(3) + 2 * RAIL_END_MARGIN_PX,
    );
  });

  it("grows strictly with the slot count — the property the bug violates", () => {
    const heights = [1, 2, 3, 4, 8, 16].map((n) => railBandHeightForSlots(n));
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* THE COUPLING TEST                                                   */
/* ------------------------------------------------------------------ */

describe("the RAIL_MAIN_INSET_PX cancellation (donor layoutBlock.ts:497-501)", () => {
  // The donor could only write this coupling down in a comment. Here it is
  // a round trip: band -> railBoxFor -> track content -> slots. If
  // CONTAINER_PADDING, CONTAINER_BORDER or railBoxFor's own inset ever move
  // independently of each other, these go red.
  it.each([1, 2, 3, 5, 9])("a band sized for %i slots fits exactly %i slots, no slack", (n) => {
    const band = railBandHeightForSlots(n);
    const box = railBoxFor("left", bodyPlan(), bandsWithBody(band));
    expect(trackContentMainPx(box.height)).toBeCloseTo(slotsMainPx(n), 10);
  });

  it("holds with a non-zero end margin too", () => {
    const n = 4;
    const band = railBandHeightForSlots(n, { endMarginPx: RAIL_END_MARGIN_PX });
    const box = railBoxFor("left", bodyPlan({ endMarginPx: RAIL_END_MARGIN_PX }), bandsWithBody(band));
    expect(trackContentMainPx(box.height)).toBeCloseTo(slotsMainPx(n), 10);
  });

  it("holds on the row axis (a top wall), where railBoxFor swaps the axes", () => {
    const n = 6;
    const band = railBandHeightForSlots(n, { endMarginPx: RAIL_END_MARGIN_PX });
    const bands: BlockBands = { ...bandsWithBody(200), blockLeft: 0, blockWidth: band };
    const box = railBoxFor("top", bodyPlan({ band: "block", endMarginPx: RAIL_END_MARGIN_PX }), bands);
    expect(trackContentMainPx(box.width)).toBeCloseTo(slotsMainPx(n), 10);
  });

  it("one pixel short of the band is genuinely crowded — the boundary is not off by one", () => {
    const n = 4;
    const band = railBandHeightForSlots(n);
    expect(railBandIsCrowded(band, n)).toBe(false);
    expect(railBandIsCrowded(band - 1, n)).toBe(true);
  });

  it("RAIL_MAIN_INSET_PX really is the track's own border+padding", () => {
    // The identity the cancellation rests on. Stated once, here, so a
    // change to either side fails on this line with a clear name rather
    // than as a mysterious off-by-N in every case above.
    expect(RAIL_MAIN_INSET_PX).toBe(CONTAINER_BORDER + CONTAINER_PADDING);
  });
});

/* ------------------------------------------------------------------ */

describe("portViewSlotCount", () => {
  it("inline shares a row, so the longer wall decides", () => {
    expect(portViewSlotCount({ leftCount: 3, rightCount: 1, portLayout: "inline" })).toBe(3);
    expect(portViewSlotCount({ leftCount: 1, rightCount: 4, portLayout: "inline" })).toBe(4);
  });

  it("offset stacks the lanes, so the counts add", () => {
    expect(portViewSlotCount({ leftCount: 3, rightCount: 2, portLayout: "offset" })).toBe(5);
  });

  it("offset's stacked lanes need EXACTLY the band a plain sum asks for", () => {
    // The derivation in portViewSlotCount's docblock, checked rather than
    // asserted: an offset right rail spends `offsetEdgePaddingPx(nLeft)` of
    // its own track padding before its first slot, and the leftovers must
    // still hold nRight slots at full pitch.
    for (const [nLeft, nRight] of [
      [1, 1],
      [3, 2],
      [2, 5],
      [4, 4],
    ]) {
      const required = offsetEdgePaddingPx(nLeft) + slotsMainPx(nRight);
      expect(required).toBeCloseTo(railBandHeightForSlots(nLeft + nRight), 10);
    }
  });
});

describe("blockPortViewMinHeight", () => {
  it("is header + band + footer", () => {
    const h = blockPortViewMinHeight({ leftCount: 4, rightCount: 2, portLayout: "inline", headerPx: 37, footerPx: 29 });
    expect(h).toBe(37 + railBandHeightForSlots(4) + 29);
  });

  it("imposes no floor at all on a Block with no ports", () => {
    expect(blockPortViewMinHeight({ leftCount: 0, rightCount: 0, portLayout: "inline" })).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* THE BUG, AS A NUMBER                                                */
/* ------------------------------------------------------------------ */

describe("railPitchForBand — the compression the donor warned about", () => {
  it("aligned mode never compresses: the pitch is constant in n", () => {
    // portEdge.tsx:490 sets flexShrink: 0 and the gap is a literal, so the
    // slots overflow rather than squeeze. This is the LOUD failure.
    const band = 120;
    const pitches = [1, 2, 3, 6, 12].map((n) => railPitchForBand(band, n, ALIGNED));
    for (const p of pitches) expect(p).toBe(PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX);
  });

  it("distribute mode DOES compress — pitch is band/n, exactly the donor's A/n", () => {
    // Donor layoutBlock.ts:1434 is `min(44, available / slotCount)`. This
    // kit reaches the same proportional squeeze through CSS Box Alignment
    // instead of an explicit Math.min. Same bug, different road.
    const band = 240;
    expect(railPitchForBand(band, 2, AROUND)).toBeCloseTo(band / 2, 10);
    expect(railPitchForBand(band, 4, AROUND)).toBeCloseTo(band / 4, 10);
    expect(railPitchForBand(band, 8, AROUND)).toBeCloseTo(band / 8, 10);
  });

  it("distribute bottoms out at the slot size and then overflows", () => {
    const band = 100;
    // 10 slots x 24px = 240 > 100, so there is no free space left to share.
    expect(railPitchForBand(band, 10, AROUND)).toBe(PORT_EDGE_SLOT_MIN_PX);
    expect(railBandIsCrowded(band, 10)).toBe(true);
  });

  it("holds the full pitch in EVERY distribution — when the band is sized for THAT distribution", () => {
    // The fix, stated as the property it restores. This test failed on its
    // first run (33 vs 42 for space-around) and is why `RailBandMetrics`
    // carries a `distribution` at all: the space-* schemes spend part of
    // the band on END gaps that `aligned` does not have, so one band height
    // does NOT serve all four.
    const full = PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX;
    for (const distribution of [ALIGNED, BETWEEN, AROUND, EVENLY]) {
      for (const n of [2, 3, 5, 9]) {
        const band = railBandHeightForSlots(n, { distribution });
        expect(railPitchForBand(band, n, distribution)).toBeCloseTo(full, 10);
        expect(railBandIsCrowded(band, n, { distribution })).toBe(false);
      }
    }
  });

  it("sizing for `aligned` and then rendering `space-around` silently squeezes 21%", () => {
    // The finding itself, pinned so it cannot quietly come back as a
    // "simplification" that drops the distribution parameter.
    const n = 2;
    const alignedBand = railBandHeightForSlots(n); // no distribution => aligned
    expect(railPitchForBand(alignedBand, n, ALIGNED)).toBe(42);
    expect(railPitchForBand(alignedBand, n, AROUND)).toBe(33);
    // ...and the correctly-sized band costs exactly one extra gap.
    expect(railBandHeightForSlots(n, { distribution: AROUND })).toBe(alignedBand + RAIL_GAP_PX);
    expect(railBandHeightForSlots(n, { distribution: EVENLY })).toBe(alignedBand + 2 * RAIL_GAP_PX);
    expect(railBandHeightForSlots(n, { distribution: BETWEEN })).toBe(alignedBand);
  });
});

/* ------------------------------------------------------------------ */

describe("fitBoxToMembers", () => {
  it("returns null for an empty list (stock leaves an empty frame alone)", () => {
    expect(fitBoxToMembers([])).toBeNull();
  });

  it("is the axis-aligned bounding box, grown per side", () => {
    const box = fitBoxToMembers(
      [
        { x: 10, y: 20, width: 100, height: 40 },
        { x: 60, y: 10, width: 50, height: 90 },
      ],
      { top: 5, right: 6, bottom: 7, left: 8 },
    );
    expect(box).toEqual({ x: 10 - 8, y: 10 - 5, width: 110 - 10 + 8 + 6, height: 100 - 10 + 5 + 7 });
  });

  it("skips a non-finite member rather than returning NaN", () => {
    const box = fitBoxToMembers([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: Number.NaN, y: 0, width: 10, height: 10 },
    ]);
    expect(box).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe("blockExpandedFitHeight", () => {
  it("measures to the farthest member's BOTTOM, not to the bounds height", () => {
    // A single member dragged down to y=300 makes the Block taller even
    // though the bounds are only 40px tall — the region starts at the
    // region's top, not at the topmost member.
    const h = blockExpandedFitHeight({ members: [{ x: 0, y: 300, width: 80, height: 40 }] });
    expect(h).toBe(300 + 40 + DEFAULT_MEMBER_INSET_PX);
  });

  it("grows as a member is dragged down — the expanded-view case", () => {
    const at = (y: number) => blockExpandedFitHeight({ members: [{ x: 0, y, width: 80, height: 40 }] })!;
    expect(at(100)).toBeLessThan(at(200));
    expect(at(200)).toBeLessThan(at(400));
  });

  it("adds the measured header and footer once", () => {
    const h = blockExpandedFitHeight({
      members: [{ x: 0, y: 0, width: 80, height: 40 }],
      headerPx: 37,
      footerPx: 29,
    });
    expect(h).toBe(37 + 40 + DEFAULT_MEMBER_INSET_PX + 29);
  });

  it("returns null for an empty container, preserving its manual box", () => {
    expect(blockExpandedFitHeight({ members: [] })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("resolveBlockHeight — floored, never overridden", () => {
  it("leaves a manual height LARGER than the floor completely untouched", () => {
    expect(resolveBlockHeight({ manualHeightPx: 500, autoFit: false, minHeightPx: 120 })).toBe(500);
  });

  it("raises a manual height SMALLER than the floor", () => {
    expect(resolveBlockHeight({ manualHeightPx: 80, autoFit: false, minHeightPx: 120 })).toBe(120);
  });

  it("keeps Block hugging when nothing imposes a floor", () => {
    // undefined is load-bearing: it is what block.tsx's "Omit to hug the
    // rendered regions" reads as. A Block with no ports and no members is
    // byte-identical to before this module existed.
    expect(resolveBlockHeight({ autoFit: false })).toBeUndefined();
    expect(resolveBlockHeight({ autoFit: false, minHeightPx: 0 })).toBeUndefined();
  });

  it("applies the floor even with no manual height", () => {
    expect(resolveBlockHeight({ autoFit: false, minHeightPx: 140 })).toBe(140);
  });

  it("auto-fit uses the fit, but still cannot go under the port floor", () => {
    expect(resolveBlockHeight({ autoFit: true, fitHeightPx: 400, minHeightPx: 120 })).toBe(400);
    expect(resolveBlockHeight({ autoFit: true, fitHeightPx: 60, minHeightPx: 120 })).toBe(120);
  });

  it("auto-fit with nothing to fit to falls back to the manual box", () => {
    // blockExpandedFitHeight returns null for an empty container; the
    // useful manual starting box survives (donor blockAutoResize.ts:220-223).
    expect(resolveBlockHeight({ autoFit: true, fitHeightPx: null, manualHeightPx: 260 })).toBe(260);
  });

  it("is monotone in the floor — a floor can only ever grow a Block", () => {
    const manual = 200;
    let previous = 0;
    for (const floor of [0, 100, 200, 300, 400]) {
      const h = resolveBlockHeight({ manualHeightPx: manual, autoFit: false, minHeightPx: floor }) ?? 0;
      expect(h).toBeGreaterThanOrEqual(manual);
      expect(h).toBeGreaterThanOrEqual(previous);
      previous = h;
    }
  });
});
