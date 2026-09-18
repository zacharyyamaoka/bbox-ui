// Pure-function tests for `placeEdgeDropMenu` — the flip-then-clamp
// placement math, re-expressed from
// `/home/bam/systemsketch/src/blocks/ui/OnCanvasBlockPicker.tsx:107-121`.
//
// WHY this file is `.test.ts`, not `.test.tsx`: `vitest.config.ts`'s
// "unit" project (the one with no browser, `environment: "node"`) only
// includes `src/**/*.test.ts` — a `.tsx` unit test would never be picked
// up by either Vitest project and would silently never run (the exact
// failure class `CLAUDE.md`'s `reportedException` section already warns
// about: a check that always looks green). This file is deliberately kept
// to the pure function so a real DOM is never needed; the component's own
// DOM-level behaviour (measuring, focusing, dismissing, judge-filtering)
// is instead covered by `EdgeDropMenu.stories.tsx`'s play function, run
// for real in Chromium via `pnpm test-stories` — the same split the repo
// already uses everywhere else (`elbow/*` pure math vs. story-level
// gesture proof).
//
// `vitest.config.ts` is out of this lane's write set (task's HARD REPO
// RULES / write-set boundary), so this split is the only way both test
// files actually execute rather than one of them running nowhere.

import { describe, expect, it } from "vitest";

import { placeEdgeDropMenu } from "./edgeDropMenu";

const VIEWPORT = { width: 800, height: 600 };
const SIZE = { width: 200, height: 120 };

describe("placeEdgeDropMenu", () => {
  it("prefers the end (right) side when it fits, matching the donor's !wantsProducer branch", () => {
    const placement = placeEdgeDropMenu({ x: 300, y: 300 }, VIEWPORT, SIZE, "end");
    expect(placement.side).toBe("end");
    expect(placement.x).toBe(300);
  });

  it("prefers the start (left) side when it fits, matching the donor's wantsProducer branch", () => {
    const placement = placeEdgeDropMenu({ x: 500, y: 300 }, VIEWPORT, SIZE, "start");
    expect(placement.side).toBe("start");
    expect(placement.x).toBe(500 - SIZE.width);
  });

  it("flips from end to start when the preferred (right) side would overflow the viewport", () => {
    // anchor near the right edge: rightOfCable(780) + width(200) > viewport.width(800) - margin(8)
    const placement = placeEdgeDropMenu({ x: 780, y: 300 }, VIEWPORT, SIZE, "end");
    expect(placement.side).toBe("start");
    // clamped: left side would be 780-200=580, which fits without further clamping
    expect(placement.x).toBe(580);
  });

  it("flips from start to end when the preferred (left) side would overflow past x=0", () => {
    const placement = placeEdgeDropMenu({ x: 20, y: 300 }, VIEWPORT, SIZE, "start");
    expect(placement.side).toBe("end");
    expect(placement.x).toBe(20);
  });

  it("clamps x so the menu never renders outside the viewport even after flipping", () => {
    // anchor pinned at the far right edge: neither side fits cleanly, so the
    // flipped (start) placement is clamped to the viewport's right margin.
    const placement = placeEdgeDropMenu({ x: 799, y: 300 }, { width: 100, height: 600 }, { width: 200, height: 50 }, "end");
    const maxX = 100 - 200 - 8; // viewport.width - size.width - margin
    expect(placement.x).toBeLessThanOrEqual(Math.max(8, maxX));
    expect(placement.x).toBeGreaterThanOrEqual(8);
  });

  it("clamps y symmetrically top and bottom, centering the menu on the anchor when there is room", () => {
    const centered = placeEdgeDropMenu({ x: 300, y: 300 }, VIEWPORT, SIZE, "end");
    expect(centered.y).toBe(300 - SIZE.height / 2);

    const nearTop = placeEdgeDropMenu({ x: 300, y: 2 }, VIEWPORT, SIZE, "end");
    expect(nearTop.y).toBe(8); // margin floor

    const nearBottom = placeEdgeDropMenu({ x: 300, y: 598 }, VIEWPORT, SIZE, "end");
    expect(nearBottom.y).toBe(VIEWPORT.height - SIZE.height - 8); // margin ceiling
  });

  it("respects a caller-supplied margin", () => {
    const placement = placeEdgeDropMenu({ x: 2, y: 300 }, VIEWPORT, SIZE, "end", 20);
    expect(placement.x).toBe(20);
  });
});
