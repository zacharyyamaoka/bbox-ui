/**
 * Ported near-verbatim from
 * /home/bam/systemsketch/src/chrome/floatingToolbarPlacement.test.ts:1-252
 * (read in full for this port, alongside floatingToolbarPlacement.ts:1-343,
 * the file this suite tests). This IS the acceptance evidence for the port —
 * docs/menus/MENU-KIT-DESIGN.md §6 (build order, Lane D) calls it out by name
 * as "the 4,608-case differential suite" that has to travel with the code,
 * not be re-derived.
 *
 * Only two renames cross into this trunk, matching floatingToolbar.placement.ts:
 * `placeSelectionMenu` -> `placeFloatingToolbar`, `selectionMenuMaxWidth` ->
 * `floatingToolbarMaxWidth`. Every call site below also now passes
 * `overlayInset` explicitly (`SELECTION_OVERLAY_INSET`, tldraw's own measured
 * value) because the product function's `overlayInset` param lost its
 * default when it crossed into this host-agnostic core — see that file's
 * module header. The frozen oracle below still defaults it internally: it is
 * a test fixture reproducing the donor's original hand-rolled math bit for
 * bit, not the shipped API, so its own signature is untouched.
 */
import { describe, expect, it } from "vitest";

import {
  SELECTION_MENU_GAP,
  SELECTION_MENU_MARGIN,
  SELECTION_MENU_MIN_WIDTH,
  SELECTION_OVERLAY_INSET,
  floatingToolbarMaxWidth,
  isSelectionOnScreen,
  placeFloatingToolbar,
  type Rect,
  type SelectionMenuPlacement,
  type SelectionMenuSide,
  type Size,
} from "./floatingToolbar.placement";

// ---------------------------------------------------------------------------
// Frozen oracle, copied 2026-09-01 -> 2026-09-07 (in the donor) verbatim from
// src/chrome/selectionMenuPlacement.ts — do not update to match the
// implementation. This IS the spec: the whole point of this test file is to
// prove the Floating UI rewrite above produces bit-identical {x,y,side} to
// the hand-rolled math it replaced, for every input in the sweep below. If a
// real policy change is ever wanted, it lands in the hand-rolled predecessor
// first and this oracle is re-copied deliberately, not silently kept in sync.
// ---------------------------------------------------------------------------

function oracleClamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function oraclePlaceSelectionMenu({
  selection,
  menu,
  viewport,
  bottomObstacleTop,
  overlayInset = SELECTION_OVERLAY_INSET,
}: {
  selection: Rect;
  menu: Size;
  viewport: Size;
  bottomObstacleTop?: number;
  overlayInset?: number;
}): SelectionMenuPlacement {
  const overlayTop = selection.y - overlayInset;
  const overlayBottom = selection.y + selection.h + overlayInset;

  const centreX = selection.w > viewport.w
    ? (Math.max(selection.x, 0) + Math.min(selection.x + selection.w, viewport.w)) / 2
    : selection.x + selection.w / 2;

  let side: SelectionMenuSide;
  let y: number;
  const aboveY = overlayTop - menu.h - SELECTION_MENU_GAP;
  if (aboveY >= SELECTION_MENU_MARGIN) {
    side = "above";
    y = aboveY;
  } else if (overlayTop < 0) {
    side = "pinned";
    y = SELECTION_MENU_MARGIN;
  } else {
    side = "below";
    y = overlayBottom + SELECTION_MENU_GAP;
  }

  const floor = bottomObstacleTop ?? viewport.h;
  const x = oracleClamp(
    centreX - menu.w / 2,
    SELECTION_MENU_MARGIN,
    viewport.w - menu.w - SELECTION_MENU_MARGIN,
  );
  y = oracleClamp(y, SELECTION_MENU_MARGIN, floor - SELECTION_MENU_MARGIN - menu.h);

  return { x: Math.round(x), y: Math.round(y), side };
}

// ---------------------------------------------------------------------------
// Differential sweep
// ---------------------------------------------------------------------------

const XS = [-800, -200, 0, 150, 600, 1300];
const YS = [-800, -200, 0, 150, 600, 1300];
const SIZES = [24, 140, 700, 1900];
const MENUS: Size[] = [
  { w: 560, h: 48 },
  { w: 220, h: 40 },
];
const VIEWPORTS: Size[] = [
  { w: 1280, h: 720 },
  { w: 800, h: 600 },
];

function describeInput(
  selection: Rect,
  menu: Size,
  viewport: Size,
  bottomObstacleTop: number | undefined,
): string {
  return `selection=${JSON.stringify(selection)} menu=${JSON.stringify(menu)} viewport=${JSON.stringify(viewport)} bottomObstacleTop=${bottomObstacleTop}`;
}

describe("placeFloatingToolbar (Floating UI) matches the frozen oracle", () => {
  it("is identical to the oracle across the full input grid", async () => {
    let checked = 0;
    for (const viewport of VIEWPORTS) {
      for (const bottomObstacleTop of [undefined, viewport.h - 64]) {
        for (const x of XS) {
          for (const y of YS) {
            for (const w of SIZES) {
              for (const h of SIZES) {
                for (const menu of MENUS) {
                  const selection: Rect = { x, y, w, h };
                  const expected = oraclePlaceSelectionMenu({ selection, menu, viewport, bottomObstacleTop });
                  // eslint-disable-next-line no-await-in-loop
                  const actual = await placeFloatingToolbar({
                    selection,
                    menu,
                    viewport,
                    bottomObstacleTop,
                    overlayInset: SELECTION_OVERLAY_INSET,
                  });
                  expect(actual, describeInput(selection, menu, viewport, bottomObstacleTop)).toEqual(expected);
                  checked += 1;
                }
              }
            }
          }
        }
      }
    }
    // Sanity on the sweep itself: fail loudly if someone shrinks the grid to
    // nothing instead of failing individual assertions.
    expect(checked).toBe(
      VIEWPORTS.length * 2 * XS.length * YS.length * SIZES.length * SIZES.length * MENUS.length,
    );
  });

  it("flips below when there is no room above near the top of the viewport", async () => {
    const selection: Rect = { x: 400, y: 10, w: 200, h: 40 };
    const menu: Size = { w: 220, h: 40 };
    const viewport: Size = { w: 1280, h: 720 };
    const result = await placeFloatingToolbar({ selection, menu, viewport, overlayInset: SELECTION_OVERLAY_INSET });
    expect(result.side).toBe("below");
    expect(result).toEqual(oraclePlaceSelectionMenu({ selection, menu, viewport }));
  });

  it("pins to the top margin when the overlay top edge is off-screen", async () => {
    const selection: Rect = { x: 400, y: -500, w: 200, h: 40 };
    const menu: Size = { w: 220, h: 40 };
    const viewport: Size = { w: 1280, h: 720 };
    const result = await placeFloatingToolbar({ selection, menu, viewport, overlayInset: SELECTION_OVERLAY_INSET });
    expect(result.side).toBe("pinned");
    expect(result.y).toBe(SELECTION_MENU_MARGIN);
    expect(result).toEqual(oraclePlaceSelectionMenu({ selection, menu, viewport }));
  });

  it("centres on the visible slice when the selection is wider than the viewport", async () => {
    // Right edge (-200 + 1900 = 1700) overhangs the 1280-wide viewport, and
    // the left edge (-200) overhangs it too, so the visible slice is exactly
    // [0, 1280] -- centre 640 -- not the true selection centre
    // (-200 + 1900/2 = 750).
    const selection: Rect = { x: -200, y: 300, w: 1900, h: 40 };
    const menu: Size = { w: 220, h: 40 };
    const viewport: Size = { w: 1280, h: 720 };
    const result = await placeFloatingToolbar({ selection, menu, viewport, overlayInset: SELECTION_OVERLAY_INSET });
    expect(result.x).toBe(640 - menu.w / 2);
    expect(result).toEqual(oraclePlaceSelectionMenu({ selection, menu, viewport }));
  });

  it("floors y above a bottom obstacle instead of the viewport edge", async () => {
    // aboveY = (700 - overlayInset) - menu.h - GAP = 639, which clears the
    // MARGIN so the side stays 'above', but exceeds the obstacle-floored max
    // (656 - MARGIN - menu.h = 596) and must be pulled down to it.
    const selection: Rect = { x: 400, y: 700, w: 200, h: 10 };
    const menu: Size = { w: 220, h: 40 };
    const viewport: Size = { w: 1280, h: 720 };
    const bottomObstacleTop = viewport.h - 64;
    const result = await placeFloatingToolbar({
      selection,
      menu,
      viewport,
      bottomObstacleTop,
      overlayInset: SELECTION_OVERLAY_INSET,
    });
    expect(result.side).toBe("above");
    expect(result.y).toBe(bottomObstacleTop - SELECTION_MENU_MARGIN - menu.h);
    expect(result).toEqual(oraclePlaceSelectionMenu({ selection, menu, viewport, bottomObstacleTop }));
  });
});

describe("isSelectionOnScreen", () => {
  it("uses intersection, not the midpoint, so an oversized selection still counts", () => {
    const viewport: Size = { w: 1280, h: 720 };
    // Centre is far outside the viewport, but the rect still overlaps it.
    const oversized: Rect = { x: -5000, y: -5000, w: 6000, h: 6000 };
    expect(isSelectionOnScreen(oversized, viewport)).toBe(true);
  });

  it("is false once the selection fully leaves the viewport", () => {
    const viewport: Size = { w: 1280, h: 720 };
    expect(isSelectionOnScreen({ x: 1300, y: 0, w: 100, h: 100 }, viewport)).toBe(false);
    expect(isSelectionOnScreen({ x: 0, y: -200, w: 100, h: 100 }, viewport)).toBe(false);
  });
});

describe("floatingToolbarMaxWidth", () => {
  it("caps a wide pill to the Codex-reported scenario: ~935px of controls in a ~900px viewport", () => {
    // Three selected text shapes with the full appearance + opacity + arrange
    // cluster measured ~935px in Codex's repro (on the donor); a 900px-wide
    // viewport leaves only 860px (900 - 2*MARGIN) once the CSS max-width
    // applies. The pill's own `getBoundingClientRect().width` reflects that
    // CSS constraint, so `placeFloatingToolbar` never sees the unclamped
    // 935px width that produced the inverted x-range Codex found.
    const viewport: Size = { w: 900, h: 650 };
    const cappedWidth = floatingToolbarMaxWidth(viewport);
    expect(cappedWidth).toBe(viewport.w - 2 * SELECTION_MENU_MARGIN);
    expect(cappedWidth).toBeLessThan(935);

    const selection: Rect = { x: 300, y: 350, w: 200, h: 40 };
    const result = placeFloatingToolbar({
      selection,
      menu: { w: cappedWidth, h: 40 },
      viewport,
      overlayInset: SELECTION_OVERLAY_INSET,
    });
    return result.then((placement) => {
      // The pill's left edge and right edge (x + capped width) both stay
      // within the margins — the bug Codex found was the right edge running
      // off-screen because `menu.w` (935) exceeded `viewport.w - 2*MARGIN`
      // (860), which inverts the clamp range `placeFloatingToolbar` computes.
      expect(placement.x).toBeGreaterThanOrEqual(SELECTION_MENU_MARGIN);
      expect(placement.x + cappedWidth).toBeLessThanOrEqual(viewport.w - SELECTION_MENU_MARGIN + 0.001);
    });
  });

  it("never caps below the floor, so a tiny viewport still leaves a readable pill", () => {
    const tiny: Size = { w: 200, h: 400 };
    expect(floatingToolbarMaxWidth(tiny)).toBe(SELECTION_MENU_MIN_WIDTH);
  });

  it("divides the floor by scale too, so it still paints at exactly the floor size — Codex round 4", () => {
    // Codex's round-4 repro (on the donor): at a 240px viewport and 160%
    // scale, the old `max(FLOOR, (viewport - margin) / scale)` returned the
    // unscaled 160px floor verbatim, which then painted at 160 * 1.6 = 256px
    // — 56px past the 200px (240 - 2*20) the viewport actually allows.
    // Dividing the whole max() by scale (equivalent to flooring in painted
    // pixels directly, since max(a,b)/s === max(a/s,b/s) for s>0) fixes both
    // terms at once.
    const viewport: Size = { w: 240, h: 400 };
    const scale = 1.6;
    const capped = floatingToolbarMaxWidth(viewport, scale);
    const painted = capped * scale;
    expect(painted).toBeLessThanOrEqual(viewport.w - 2 * SELECTION_MENU_MARGIN + 0.001);
  });

  it("divides by scale so a bar painted through a scale() transform still fits — Codex round 2", () => {
    // Codex's round-2 repro (on the donor): an 860px cap (900 - 2*20) at a
    // 160% ceiling re-inflates to 860 * 1.6 = 1,376px once the transform
    // applies — wider than the 900px viewport it was meant to fit. Dividing
    // the raw cap by scale first cancels that back out.
    const viewport: Size = { w: 900, h: 650 };
    const unscaled = floatingToolbarMaxWidth(viewport, 1);
    const scaled = floatingToolbarMaxWidth(viewport, 1.6);
    expect(unscaled).toBe(860);
    expect(scaled * 1.6).toBeCloseTo(unscaled, 5);
    // What actually paints on screen, at every scale, stays within budget.
    expect(scaled * 1.6).toBeLessThanOrEqual(viewport.w - 2 * SELECTION_MENU_MARGIN + 0.001);
  });
});
