// src/pillGeometry.smoke.test.tsx — acceptance for the selection pill's
// GEOMETRY and SURFACE, measured in the real mounted app.
//
// Zach, 2026-09-20, on the pill as it shipped the day before: "the sizing and
// formating and everything is a bit off", "the icons are not aligned", and the
// diagnosis in his own words — "It feels like you are making this look like
// the tldraw stock floating toolbar which I don't like ... Our goal was for it
// to be more like system sketch which is copying the figjam floating tool
// bar."
//
// THE ORACLE IS A TRACE, NOT THIS FILE'S OPINION.
// /home/bam/systemsketch/docs/assets/figjam-chrome-traced.json is a live
// getComputedStyle + getBoundingClientRect dump of FigJam's own selection
// pill, captured over CDP. Every literal below comes out of it:
//
//   toolbar   603x40  r=13px  bg=rgb(30,30,30)  color=rgb(255,255,255)
//   cells     56x40 / 54x40 / 144x40 / 32x40, EVERY ONE r=5px and h=40
//   popovers  r=13px bg=rgb(30,30,30), all five traced ones
//
// EVERY ASSERTION HERE IS A MEASUREMENT. Not one of them checks that an
// element exists, and none of them reads a className — a bar whose buttons are
// all present and all on different baselines passes a DOM-presence suite
// completely, and that is exactly the bar this test was written against. The
// numbers it replaces, measured in the running app at 4340 in dark scheme
// before the fix:
//
//   ss-style-*            h28  centreY 20      (inside an items-center wrapper)
//   ss-selection-arrange  h28  centreY 14      (a direct child of a stretched bar)
//   ss-selection-focus    h32  centreY 16
//   bar background        oklch(0.985 0 0) = #fafafa, IN DARK MODE
//   open popover          oklch(0.205 0 0) — a different surface from its trigger
import { createShapeId, type TLShapeId } from "tldraw";
import { cdp, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

/**
 * WHY every test restores `prefers-color-scheme` in `afterEach` rather than
 * inside itself: `Emulation.setEmulatedMedia` is a property of the PAGE, and
 * the page outlives the test — a run that threw mid-assertion would hand the
 * next file a browser stuck in the other scheme and the failure would land
 * somewhere unrelated.
 */
async function emulateColorScheme(scheme: "light" | "dark" | null) {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: scheme === null ? [] : [{ name: "prefers-color-scheme", value: scheme }],
  });
}

afterEach(async () => {
  app?.unmount();
  app = null;
  await emulateColorScheme(null);
});

function placeGeo(x: number, y: number, w = 320, h = 200): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: "geo", x, y, props: { w, h, geo: "rectangle" } } as never);
  return id;
}

async function pill(): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
    what: "the floating toolbar visible",
  });
}

/**
 * A CELL is every `<button>` on the bar — the style triggers, Arrange, Focus,
 * Duplicate, Delete, and the block-view toggle items when a Block is selected.
 * Taken by tag rather than by a hand-written list of test ids so a control
 * added to the pill next month is measured by this file the day it lands
 * instead of being silently exempt.
 */
function cellsOf(bar: HTMLElement): HTMLButtonElement[] {
  return [...bar.querySelectorAll<HTMLButtonElement>("button")];
}

/** The centre of an element's own box, in viewport px. */
function centreY(el: Element): number {
  const rect = el.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

/** What a cell actually SHOWS — its first element child: the glyph span, the
 *  swatch box, the label. This is the thing Zach was looking at when he said
 *  the icons are not aligned; a cell can be perfectly centred and still draw
 *  its content off-centre. */
function contentOf(cell: Element): Element | null {
  return cell.firstElementChild;
}

/** Selecting a plain geo box is the widest pill this app draws: six style
 *  triggers, Arrange, the opacity row, Focus, a separator, Duplicate, Delete —
 *  every cell family in one bar. */
async function pillOverGeo(): Promise<HTMLElement> {
  app = await mountApp();
  app.editor.select(placeGeo(300, 300));
  const bar = await pill();
  // The bar reflows as the style rows resolve; wait for a settled width before
  // measuring anything, or the first read races the second render.
  let previous = -1;
  await waitFor(
    () => {
      const w = bar.getBoundingClientRect().width;
      const settled = w > 0 && Math.abs(w - previous) < 0.5;
      previous = w;
      return settled ? true : null;
    },
    { what: "the pill's width to settle" },
  );
  return bar;
}

describe("the selection pill — one baseline, one cell height", () => {
  it("every cell's CONTENT sits on the bar's own centre line — one baseline, not three", async () => {
    await emulateColorScheme("dark");
    const bar = await pillOverGeo();
    const barCentre = centreY(bar);
    const cells = cellsOf(bar);
    expect(cells.length, "the pill draws its controls").toBeGreaterThan(5);

    const offsets = cells.map((cell) => {
      const content = contentOf(cell);
      return {
        id: cell.getAttribute("data-testid") ?? cell.getAttribute("aria-label") ?? "?",
        cell: Math.round((centreY(cell) - barCentre) * 100) / 100,
        content: content ? Math.round((centreY(content) - barCentre) * 100) / 100 : null,
      };
    });
    // A sub-pixel tolerance, not a "close enough": the failures this catches
    // were 4px and 6px off, and a half-pixel budget still fails all of them.
    const off = offsets.filter((o) => Math.abs(o.cell) > 0.5 || (o.content !== null && Math.abs(o.content) > 0.5));
    expect(off, `every cell and its content centre on the bar's centre line (y=${barCentre})`).toEqual([]);
  });

  it("every cell FILLS the bar: one height, 40px, the traced FigJam cell", async () => {
    await emulateColorScheme("dark");
    const bar = await pillOverGeo();
    const heights = cellsOf(bar).map((cell) => ({
      id: cell.getAttribute("data-testid") ?? cell.getAttribute("aria-label") ?? "?",
      h: Math.round(cell.getBoundingClientRect().height * 100) / 100,
    }));
    const distinct = [...new Set(heights.map((h) => h.h))];
    expect(distinct, `one cell height, not ${distinct.length}: ${JSON.stringify(heights)}`).toEqual([40]);
    // …and the bar is that height too, so "40" means "fills it" rather than
    // "happens to be 40 inside something taller".
    expect(Math.round(bar.getBoundingClientRect().height)).toBe(40);
  });

  it("radius: 13px on the bar, 5px on every cell — the two numbers the whole trace agrees on", async () => {
    await emulateColorScheme("dark");
    const bar = await pillOverGeo();
    expect(getComputedStyle(bar).borderRadius, "the bar").toBe("13px");
    const radii = cellsOf(bar).map((cell) => ({
      id: cell.getAttribute("data-testid") ?? cell.getAttribute("aria-label") ?? "?",
      r: getComputedStyle(cell).borderRadius,
    }));
    // 5, never 7 and never `rounded-lg`'s 10: the 7px in the donor's
    // systemsketch-chrome.css is the fallback of the same custom property
    // whose other fallback is 5, sitting on a family FigJam never had.
    expect(radii.filter((x) => x.r !== "5px"), "every cell").toEqual([]);
  });
});

describe("the selection pill — a fixed dark surface, shared with its popovers", () => {
  const FIGJAM_SURFACE = "rgb(30, 30, 30)";
  const FIGJAM_INK = "rgb(255, 255, 255)";

  for (const scheme of ["dark", "light"] as const) {
    it(`is ${FIGJAM_SURFACE} with white ink in ${scheme.toUpperCase()} colour scheme — the pill does not follow the page`, async () => {
      await emulateColorScheme(scheme);
      // Prove the emulation actually took, or this test passes for the wrong
      // reason in whichever scheme the browser happened to start in.
      expect(matchMedia("(prefers-color-scheme: dark)").matches, `emulated ${scheme}`).toBe(scheme === "dark");
      const bar = await pillOverGeo();
      const style = getComputedStyle(bar);
      expect(style.backgroundColor, "the pill's surface").toBe(FIGJAM_SURFACE);
      expect(style.color, "the pill's ink").toBe(FIGJAM_INK);
    });
  }

  it("an open popover paints the SAME surface as the bar it hangs off", async () => {
    await emulateColorScheme("dark");
    const bar = await pillOverGeo();
    const trigger = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-style-color"]'), {
      what: "the colour trigger",
    });
    await userEvent.click(trigger);
    // The panel PORTALS out of the pill's subtree — which is the whole reason
    // this can go wrong, and why the donor scopes its surface tokens on a
    // shared ANCESTOR rather than on the bar (pillSkins.css:15-23).
    const panel = await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-style-color-panel"]'), {
      what: "the colour panel",
    });
    const panelStyle = getComputedStyle(panel);
    expect(panelStyle.backgroundColor, "the panel's surface equals the bar's").toBe(
      getComputedStyle(bar).backgroundColor,
    );
    expect(panelStyle.borderRadius, "and its radius is the bar's 13px").toBe("13px");
  });
});
