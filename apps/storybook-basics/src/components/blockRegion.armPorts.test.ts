/**
 * src/components/blockRegion.armPorts.test.ts — the PURE half of an arm's
 * own port (docs/CONTROL-FLOW-PLAN.md, "an arm can carry its own port"): the
 * closed-form geometry `armHeaderBands`/`armHeaderRailPlan` (`blockRegion.tsx`)
 * feed into `railBoxFor`, asserted as math, no DOM.
 *
 * This is the narrower half of the acceptance. The wider half — that a real
 * `<BlockRegion>` actually renders one dot per arm on the wall this file
 * predicts, that the ARM (never the region) owns the `[data-block-id]` a
 * wire resolves through, and that a real `WireLayer` wire actually lands on
 * one — is measured against the rendered DOM in
 * `BlockRegion.stories.tsx`'s `ArmPorts` play function (`pnpm test-stories`,
 * a real Chromium tab). Both exist for the same reason
 * `blockPort.layout.test.ts` sits beside `BlockPort.stories.tsx`: a pure
 * twin proves the arithmetic once, in milliseconds, node-only; the story
 * proves the arithmetic is what actually got WIRED into the render.
 */
import { describe, expect, it } from "vitest";

import { armHeaderBands, armHeaderRailPlan } from "./blockRegion";
import { RAIL_MAIN_INSET_PX, railBoxFor } from "./blockPort.layout";

const HEADER_PX = 32;
const WIDTH_PX = 306; // e.g. a 308px frame minus its two 1px borders.

describe("armHeaderBands", () => {
  it("is local to the header strip itself — 0 at its own top-left, not the row's", () => {
    // WHY 0, not `row.headerTop`/`row.rowTop`: the rail this bands feeds
    // mounts INSIDE `region-arm-header` (blockRegion.tsx), whose own
    // `position: relative` box is what an absolutely positioned child's
    // `top`/`left: 0` land on — see that file's own doc on `armHeaderBands`.
    const bands = armHeaderBands(HEADER_PX, WIDTH_PX);
    expect(bands.blockLeft).toBe(0);
    expect(bands.blockTop).toBe(0);
    expect(bands.headerTop).toBe(0);
  });

  it("the header band spans the strip's own full height, with no separate body", () => {
    // `railBoxFor`'s `band: "header"` case never reads `bodyBottom` for a
    // column-axis edge — it stays equal to `bodyTop` here only so the shape
    // is total, never read for anything but that identity.
    const bands = armHeaderBands(HEADER_PX, WIDTH_PX);
    expect(bands.bodyTop).toBe(HEADER_PX);
    expect(bands.bodyBottom).toBe(HEADER_PX);
    expect(bands.blockHeight).toBe(HEADER_PX);
  });

  it("carries the width the caller measured — never derives its own", () => {
    expect(armHeaderBands(HEADER_PX, WIDTH_PX).blockWidth).toBe(WIDTH_PX);
  });
});

describe("armHeaderRailPlan", () => {
  it("always overrides the band to \"header\", regardless of the view rule's own default", () => {
    // `railPlanFor`'s own "expanded" branch returns `band: "body"` — this
    // function's entire job is winning that field back, the same override
    // seam `BlockEdgeSpec.band` already publishes for an ordinary Block.
    expect(armHeaderRailPlan("left", ["if"]).band).toBe("header");
    expect(armHeaderRailPlan("right", ["y"]).band).toBe("header");
  });

  it("centres a single item — \"expanded\"'s own space-evenly rule for one arm's one operand", () => {
    const plan = armHeaderRailPlan("left", ["if"]);
    expect(plan.distribution).toEqual({ mode: "distribute", scheme: "space-evenly" });
    expect(plan.collapsed).toBe(false);
  });
});

describe("armHeaderBands + armHeaderRailPlan, fed through the REAL railBoxFor", () => {
  const bands = armHeaderBands(HEADER_PX, WIDTH_PX);

  it("the left rail's cross centre lands on x = 0 — the header's own left wall", () => {
    const plan = armHeaderRailPlan("left", ["if"]);
    const box = railBoxFor("left", plan, bands);
    expect(box.left + box.width / 2).toBe(bands.blockLeft);
  });

  it("the right rail's cross centre lands on x = the header's own width, never the block's derived one", () => {
    // `bands.headerRight` is deliberately never set (an arm header does not
    // hug in this lane) — `railBoxFor` then falls back to
    // `blockLeft + blockWidth`, which IS this bands' own `widthPx`, not some
    // other number a hugging tab would have measured.
    const plan = armHeaderRailPlan("right", ["y"]);
    const box = railBoxFor("right", plan, bands);
    expect(box.left + box.width / 2).toBe(bands.blockLeft + bands.blockWidth);
  });

  it("spans the header band with its CONTENT box, top to bottom of the strip — never the (absent) body", () => {
    const plan = armHeaderRailPlan("left", ["if"]);
    const box = railBoxFor("left", plan, bands);
    expect(box.top + RAIL_MAIN_INSET_PX).toBe(bands.headerTop);
    expect(box.top + box.height - RAIL_MAIN_INSET_PX).toBe(bands.bodyTop);
  });

  it("MUTATION: a band that used the row's full height (header + body) instead of the header's own would move the rail past the strip", () => {
    // The break `BlockRegion.stories.tsx`'s `ArmPorts` play function catches
    // for real (mutation 1 in the handoff): if `armHeaderBands` were fed the
    // whole row's height instead of just the header's, the band's own
    // `bodyTop` would sit well past where the header strip actually ends —
    // provably wrong against THIS bands object alone, no DOM required.
    const wrongBands = armHeaderBands(HEADER_PX + 180 /* + a body */, WIDTH_PX);
    expect(wrongBands.bodyTop).not.toBe(HEADER_PX);
    expect(wrongBands.bodyTop).toBeGreaterThan(HEADER_PX);
  });
});
