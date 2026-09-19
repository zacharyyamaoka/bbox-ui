// src/corner.smoke.test.tsx — the bottom-right cluster (frames · zoom ·
// problems) sits in the true bottom-right corner, as close as tldraw's
// licence watermark allows, and NEVER over it.
//
// Zach, 2026-09-19 (Pasted image 20260919134814.png): "please move the right
// corner menu to be truly in the right corner right now its above this text
// 'get a license for production'".
//
// The licence half is not negotiable, and it is asserted here rather than
// trusted: tldraw 5.3.2's own watermark stylesheet says the watermark must
// stay "visible, unobscured, and available to user-interaction"
// (@tldraw/editor dist-esm/lib/license/Watermark.mjs:123-129). With no key,
// every `http:` page counts as development (LicenseManager.mjs:87-94) and
// renders the "Get a license for production" watermark — in `vite` dev, in a
// served production build, and in this test runner alike. So:
//
//   - no watermark        → the cluster is flush in the corner (8px inset);
//   - watermark, and room → the cluster sits on the bottom edge immediately
//                           LEFT of the watermark (the documented fallback);
//   - watermark, no room  → the cluster stacks immediately ABOVE it, flush
//                           right (a narrow window, where "beside" would run
//                           into the bottom-centre dock).
//
// Spatial claims are measured with getBoundingClientRect, never presence-
// asserted, and "unobscured" is measured the way a user experiences it: the
// element under the watermark's own centre point must be the watermark.
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { CORNER_INSET, placeCornerCluster, type CornerRect } from "./chrome/overlay";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(async () => {
  app?.unmount();
  app = null;
  // The config's desktop posture (vitest.config.ts: 1400×900) for whoever
  // runs next in this file.
  await page.viewport(1400, 900);
});

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const WATERMARK = ".tl-watermark_SEE-LICENSE";

async function corner() {
  const root = app!.root;
  const strip = await waitFor(() => root.querySelector<HTMLElement>('[data-slot="status-strip"]'), { what: "the status strip" });
  const watermark = await waitFor(() => root.querySelector<HTMLElement>(WATERMARK), {
    what: "tldraw's licence watermark — no key + http: means tldraw renders it (LicenseManager.mjs:87-94)",
  });
  const dock = await waitFor(() => root.querySelector<HTMLElement>('[data-slot="tool-dock"]'), { what: "the dock" });
  // Placement settles one observer tick after the watermark mounts
  // (licence validation is async), so wait for the SETTLED state rather than
  // measuring the first frame.
  await waitFor(() => !intersects(box(strip), box(watermark)), { what: "the strip clear of the watermark" });
  return { strip, watermark, dock };
}

function expectLicenceUnobscured(watermark: HTMLElement) {
  const style = getComputedStyle(watermark);
  expect(style.display).not.toBe("none");
  expect(style.visibility).toBe("visible");
  expect(Number(style.opacity)).toBeGreaterThan(0);
  const w = box(watermark);
  expect(w.right - w.left).toBeGreaterThan(0);
  expect(w.bottom - w.top).toBeGreaterThan(0);
  // What a pointer at the watermark's centre actually hits: the watermark (or
  // its own button), never a piece of this app's chrome laid over it.
  const hit = document.elementFromPoint((w.left + w.right) / 2, (w.top + w.bottom) / 2);
  expect(hit, "element under the watermark's centre").not.toBeNull();
  expect(watermark.contains(hit), `the watermark is covered by ${hit?.outerHTML.slice(0, 120)}`).toBe(true);
}

describe("the bottom-right cluster — truly in the corner, never over the licence", () => {
  it("desktop (1400×900, watermark present): bottom edge flush, immediately left of the watermark, clear of it and the dock", async () => {
    app = await mountApp();
    const { strip, watermark, dock } = await corner();
    const s = box(strip);
    const w = box(watermark);
    const d = box(dock);

    expect(intersects(s, w)).toBe(false);
    expect(intersects(s, d)).toBe(false);
    // Bottom edge: within 8px of the viewport's bottom — the same row as the
    // corner, not parked above the licence text (the screenshot's complaint).
    expect(innerHeight - s.bottom).toBeGreaterThanOrEqual(0);
    expect(innerHeight - s.bottom).toBeLessThanOrEqual(CORNER_INSET);
    // Right edge: as close to the corner as the watermark allows — within 8px
    // of the watermark's own left edge.
    expect(w.left - s.right).toBeGreaterThanOrEqual(0);
    expect(w.left - s.right).toBeLessThanOrEqual(CORNER_INSET);
    expect(strip.closest("[data-corner-placement]")?.getAttribute("data-corner-placement")).toBe("beside-licence");

    expectLicenceUnobscured(watermark);
  });

  it("narrow (720×900, no room beside the watermark before the dock): flush right, immediately above the watermark, still clear of both", async () => {
    await page.viewport(720, 900);
    app = await mountApp();
    const { strip, watermark, dock } = await corner();
    await waitFor(() => strip.closest("[data-corner-placement]")?.getAttribute("data-corner-placement") === "above-licence", {
      what: "the narrow-window fallback",
    });
    const s = box(strip);
    const w = box(watermark);
    const d = box(dock);

    expect(intersects(s, w)).toBe(false);
    expect(intersects(s, d)).toBe(false);
    expect(innerWidth - s.right).toBeGreaterThanOrEqual(0);
    expect(innerWidth - s.right).toBeLessThanOrEqual(CORNER_INSET);
    expect(w.top - s.bottom).toBeGreaterThanOrEqual(0);
    expect(w.top - s.bottom).toBeLessThanOrEqual(CORNER_INSET);

    expectLicenceUnobscured(watermark);
  });

  it("the placement rule, pure: flush corner with no watermark, beside it when there is room, above it when there is not", () => {
    const container: CornerRect = { left: 0, top: 0, right: 1400, bottom: 900 };
    const cluster = { width: 152, height: 42 };
    // tldraw's own numbers: 96×32 + 2px padding, anchored 4px from the corner
    // (Watermark.mjs:132-148) → x 1296-1396, y 860-896 in a 1400×900 box.
    const watermark: CornerRect = { left: 1296, top: 860, right: 1396, bottom: 896 };
    const dock: CornerRect = { left: 556, top: 848, right: 844, bottom: 892 };

    // Licensed (no watermark element): truly in the corner.
    expect(placeCornerCluster({ container, cluster, watermark: null, obstacles: [dock] })).toEqual({
      right: CORNER_INSET,
      bottom: CORNER_INSET,
      placement: "corner",
    });

    // Unlicensed, room to spare: the bottom row, flush against the watermark.
    expect(placeCornerCluster({ container, cluster, watermark, obstacles: [dock] })).toEqual({
      right: 1400 - 1296 + CORNER_INSET,
      bottom: CORNER_INSET,
      placement: "beside-licence",
    });

    // A dock that "beside" would run into: stack above the watermark instead.
    const wideDock: CornerRect = { left: 400, top: 848, right: 1200, bottom: 892 };
    expect(placeCornerCluster({ container, cluster, watermark, obstacles: [wideDock] })).toEqual({
      right: CORNER_INSET,
      bottom: 900 - 860 + CORNER_INSET,
      placement: "above-licence",
    });

    // A watermark somewhere the corner does not reach (tldraw puts it
    // bottom-LEFT for `dir="rtl"`, Watermark.mjs:179-182) costs the corner
    // nothing.
    const leftWatermark: CornerRect = { left: 4, top: 860, right: 104, bottom: 896 };
    expect(placeCornerCluster({ container, cluster, watermark: leftWatermark, obstacles: [dock] }).placement).toBe("corner");
  });
});
