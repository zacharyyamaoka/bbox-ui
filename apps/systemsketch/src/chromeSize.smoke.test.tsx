// src/chromeSize.smoke.test.tsx — the bottom row's DEFAULT size, measured in
// the real app.
//
// Zach, 2026-09-20, on a 4K screen: "All of the scalling of everyhing feel
// just a bit off right now... Compare the chrome size though to the same
// screen in exali draw or tldraw... Feels like by default needs to be
// bigger."
//
// Measured from his own three screenshots, same window size, CSS px:
//
//   tldraw.com   active tool cell 44 x 44, toolbar surface ~56
//   Excalidraw   active tool cell 40 x 40, island 52
//   bbox-ui      active tool cell 36 x 32, dock surface 44
//
// — 73% of tldraw and 80% of Excalidraw, with `devicePixelRatio` 1 and
// nothing DPI-derived, so this is a default value and not a display bug.
// FigJam's own live trace (/home/bam/systemsketch/docs/assets/
// figjam-chrome-traced.json) makes every real FigJam cell 40px tall, so 40
// is the number two of the three references agree on and it is what this
// file pins.
//
// EVERY claim here is measured with getBoundingClientRect. A cell that
// merely EXISTS proves nothing about how big it looks, which is the entire
// complaint being fixed.
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, waitFor, type MountedApp } from "./testing/harness";

/** The cell height this lane raises the chrome to — see toolDock.tsx's
 *  `TOOL_DOCK_CELL_HEIGHT` for why 40 and not 44 or 36. Spelled as a literal
 *  here on purpose: a test that imported the implementation's own constant
 *  would still pass if the constant stopped matching the rendered CSS. */
const CELL = 40;

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/** Every cell in the dock: plain tools, family faces, the library trigger. */
const DOCK_CELLS = '[data-slot="toolbar-button"], [data-slot="tool-dock-family"], [data-slot="tool-dock-library"]';

function heightOf(el: Element): number {
  return el.getBoundingClientRect().height;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function chrome() {
  const root = app!.root;
  const dock = await waitFor(() => root.querySelector<HTMLElement>('[data-slot="tool-dock"]'), { what: "the dock" });
  const strip = await waitFor(() => root.querySelector<HTMLElement>('[data-slot="status-strip"]'), { what: "the status strip" });
  // WHY three slots and not just `toolbar-button`: a family face and the
  // library trigger are `ToolbarButton`s rendered THROUGH a menu/popover
  // trigger (toolDock.tsx's `render={<DropdownMenuTrigger/>}`), and each
  // overrides `data-slot` with its own name. Selecting only
  // `toolbar-button` would measure the four plain tools and silently skip
  // the four cells most likely to be sized differently.
  const dockCells = [
    ...dock.querySelectorAll<HTMLElement>(DOCK_CELLS),
  ];
  const stripCells = [...strip.querySelectorAll<HTMLElement>('[data-slot="toolbar-button"]')];
  expect(dockCells.length, "dock cells found").toBeGreaterThanOrEqual(8);
  expect(stripCells.length, "status-strip cells found").toBeGreaterThanOrEqual(3);
  return { dock, strip, dockCells, stripCells };
}

describe("the bottom chrome is sized for a 4K screen, not for tldraw's 32px default", () => {
  it(`every dock cell measures ${CELL}px tall, and they all measure the SAME`, async () => {
    app = await mountApp();
    const { dockCells } = await chrome();

    const heights = dockCells.map((cell) => ({ label: cell.getAttribute("aria-label"), h: heightOf(cell) }));
    for (const cell of heights) {
      expect(cell.h, `dock cell "${cell.label}" height`).toBe(CELL);
    }
    // One height for the whole row, stated as its own claim: a dock whose
    // family faces were 40 and whose plain tools were 32 would satisfy the
    // loop above on average and still look broken.
    expect(new Set(heights.map((cell) => cell.h)).size, `dock cell heights: ${JSON.stringify(heights)}`).toBe(1);
    // Widths too — the row reads as a row of equal cells or it does not read.
    const widths = new Set(dockCells.map((cell) => cell.getBoundingClientRect().width));
    expect(widths.size, `dock cell widths: ${[...widths].join(", ")}`).toBe(1);
  });

  it("the glyph grew with the cell — a 16px icon adrift in a 40px box is the tell this is meant to fix", async () => {
    app = await mountApp();
    const { dockCells } = await chrome();
    // The family faces carry a second, deliberately small chevron glyph
    // (toolDock.tsx: `size-2.5`, an affordance, not the tool icon), so this
    // asks each cell for its LARGEST glyph.
    for (const cell of dockCells) {
      const glyphs = [...cell.querySelectorAll("svg")].map((svg) => svg.getBoundingClientRect().height);
      expect(glyphs.length, `glyphs in "${cell.getAttribute("aria-label")}"`).toBeGreaterThan(0);
      expect(Math.max(...glyphs), `tool glyph in "${cell.getAttribute("aria-label")}"`).toBeGreaterThanOrEqual(18);
    }
  });

  it("the status strip is the same size as the dock — one coherent bottom row, not two", async () => {
    app = await mountApp();
    const { dock, strip, dockCells, stripCells } = await chrome();

    for (const cell of stripCells) {
      expect(heightOf(cell), `status-strip cell "${cell.getAttribute("aria-label")}" height`).toBe(CELL);
    }
    expect(heightOf(stripCells[0]), "strip cell vs dock cell").toBe(heightOf(dockCells[0]));

    // The two SURFACES differ only by their own padding/border (dock: 6px
    // pad, no border; strip: 4px pad + a 1px border) — so they are within a
    // few px of each other and both are taller than the cell they hold.
    const dockH = heightOf(dock);
    const stripH = heightOf(strip);
    expect(dockH, `dock surface ${dockH}`).toBeGreaterThan(CELL);
    expect(stripH, `strip surface ${stripH}`).toBeGreaterThan(CELL);
    expect(Math.abs(dockH - stripH), `dock surface ${dockH} vs strip surface ${stripH}`).toBeLessThanOrEqual(4);
    // Same bottom edge: the row is level, which is what "coherent" means to
    // the eye that complained.
    expect(Math.abs(dock.getBoundingClientRect().bottom - strip.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
  });

  it("growing the chrome did NOT push the bottom-right cluster off the corner row", async () => {
    // The constraint this lane had to respect: `placeCornerCluster`
    // (chrome/overlay.tsx) seats the cluster between the dock's right edge
    // and tldraw's licence watermark, and a WIDER dock or strip pushes it
    // into the "above-licence" fallback Zach already rejected ("please move
    // the right corner menu to be truly in the right corner"). Measured
    // before this change there were 13.89px of clearance at 1400x900; the
    // cells therefore grew in height only.
    app = await mountApp();
    const { dock, strip } = await chrome();
    const placed = await waitFor(() => strip.closest("[data-corner-placement]"), { what: "the corner cluster wrapper" });
    await waitFor(() => !intersects(placed.getBoundingClientRect(), dock.getBoundingClientRect()), {
      what: "the cluster settling clear of the dock",
    });

    expect(placed.getAttribute("data-corner-placement")).toBe("beside-licence");
    const clusterRect = placed.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    expect(intersects(clusterRect, dockRect)).toBe(false);
    expect(clusterRect.left - dockRect.right, `clearance between dock right and cluster left`).toBeGreaterThan(0);
  });
});
