// src/zoom.smoke.test.tsx — acceptance for the zoom-menu / grid-toggle /
// help-button / show-zoom-buttons / dock-library rebuild (2026-09-20).
//
// Written against the REAL mounted app (`./testing/harness`'s `mountApp`),
// never a rendered-in-isolation mock — every claim below is measured off the
// live editor (`editor.getZoomLevel()`, `editor.getInstanceState().isGridMode`)
// or the real DOM (`getBoundingClientRect`, `getComputedStyle`), never
// asserted by presence alone.
import { createShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APPEARANCE_PREFERENCES_STORAGE_KEY, DEFAULT_APPEARANCE_PREFERENCES } from "@trunk/editor/appearancePreferences";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { rowsOf, type MenuRow } from "./testing/menus";

let app: MountedApp | null = null;

beforeEach(() => {
  window.localStorage.removeItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
});

afterEach(() => {
  app?.unmount();
  app = null;
  window.localStorage.removeItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
});

/** Writes a whole `AppearancePreferences` record, exactly the stored shape
 *  `writeAppearancePreferences` produces — so a test can pre-set
 *  `showZoomButtons` before `mountApp()` (this preference is read ONCE at
 *  mount, `statusStrip.tsx`'s own `useShowZoomButtons` doc explains why). */
function storeShowZoomButtons(value: boolean) {
  window.localStorage.setItem(
    APPEARANCE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ version: 1, ...DEFAULT_APPEARANCE_PREFERENCES, showZoomButtons: value }),
  );
}

function placeBlock(name: string, x = 200, y = 200) {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, view: "port", ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

/** Open the zoom trigger and resolve its popup (waits for at least one row —
 *  the same shape `openBurger` in `./testing/menus` waits for). */
async function openZoomMenu(mounted: MountedApp): Promise<HTMLElement> {
  const trigger = await waitFor(() => mounted.root.querySelector<HTMLElement>('[data-testid="ss-status-zoom"]'), { what: "the zoom trigger" });
  await userEvent.click(trigger);
  return waitFor(() => {
    const popup = document.querySelector<HTMLElement>('[data-testid="ss-status-zoom-menu"]');
    return popup && rowsOf(popup).length > 0 ? popup : null;
  }, { what: "the zoom menu's rows" });
}

/** A row counts as disabled when it measurably cannot receive a click — the
 *  real effect of Base UI's `data-disabled` (`dropdown-menu.tsx`'s own
 *  `data-disabled:pointer-events-none`) — not merely the attribute's
 *  presence. */
function isDisabled(row: MenuRow): boolean {
  return getComputedStyle(row.element).pointerEvents === "none";
}

async function closeMenu(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => !document.querySelector('[data-testid="ss-status-zoom-menu"]'), { what: "the zoom menu closed" });
}

describe("the zoom % is a menu trigger (Zach, 2026-09-20, reversing the prior no-menu decision)", () => {
  it("opens a menu listing all five zoom rows, in order, with tldraw's own shortcuts", async () => {
    app = await mountApp();
    const popup = await openZoomMenu(app);
    const rows = rowsOf(popup).map((row) => [row.label, row.shortcut]);
    expect(rows).toEqual([
      ["Zoom in", "Ctrl + ="],
      ["Zoom out", "Ctrl + -"],
      ["Zoom to 100%", "⇧ + 0"],
      ["Zoom to fit", "⇧ + 1"],
      ["Zoom to selection", "⇧ + 2"],
    ]);
    await closeMenu();
  });

  // Zach, 2026-09-20, driving the real app on 4390: at the popup's ORIGINAL
  // width (tied to the trigger's own ~40px via the trunk's default
  // `w-(--anchor-width)`) the text-content assertion above still passed
  // while the PIXELS were truncated — "Zoom in" painted as "Zoom …", "Zoom
  // to selection" as "Zoom to s…", and every shortcut wrapped onto a second
  // line. A label/text assertion cannot catch that (the DOM's textContent
  // is whole either way); this is a MEASURED assertion instead, per Zach's
  // truthful-property-rendering rule — an authored label keeps every
  // character, and a wrap or an ellipsis without geometry that genuinely
  // needs it is the failure this rule names.
  it("no row wraps onto a second line, and no label or shortcut is visually clipped", async () => {
    app = await mountApp();
    const popup = await openZoomMenu(app);
    const rows = rowsOf(popup);
    expect(rows.length).toBe(5);

    // Baseline: "Zoom in" + "Ctrl + =" is short enough to never wrap or
    // clip under any reasonable width, so its own painted height is what a
    // correct SINGLE line looks like — comparing every row against it
    // catches a wrap without hardcoding a pixel constant this kit's own
    // type scale could drift out from under.
    const singleLineHeight = rows[0].element.getBoundingClientRect().height;
    expect(singleLineHeight).toBeGreaterThan(0);

    for (const row of rows) {
      const rowHeight = row.element.getBoundingClientRect().height;
      expect(
        Math.abs(rowHeight - singleLineHeight),
        `${row.label}: wrapped onto a second line (row height ${rowHeight}px vs single-line ${singleLineHeight}px)`,
      ).toBeLessThanOrEqual(2);

      for (const span of Array.from(row.element.querySelectorAll<HTMLElement>("span"))) {
        expect(
          span.scrollWidth,
          `${row.label}: "${span.textContent}" is clipped (scrollWidth ${span.scrollWidth}px > clientWidth ${span.clientWidth}px)`,
        ).toBeLessThanOrEqual(span.clientWidth + 1);
      }
    }
    await closeMenu();
  });

  it("Zoom to fit actually moves the editor's zoom level — the number, not just the row", async () => {
    app = await mountApp();
    placeBlock("far", 4000, 3000);
    app.editor.setCamera({ x: 0, y: 0, z: 1 });
    const before = app.editor.getZoomLevel();

    const popup = await openZoomMenu(app);
    const fit = rowsOf(popup).find((row) => row.label === "Zoom to fit")!;
    expect(isDisabled(fit), "zoom to fit is enabled with a shape on the page").toBe(false);
    await userEvent.click(fit.element);

    await waitFor(() => (Math.abs(app!.editor.getZoomLevel() - before) > 1e-6 ? true : null), {
      what: `zoom level to move off ${before}`,
    });
  });

  it("Zoom to 100% is disabled exactly at 100% zoom, and enabled away from it", async () => {
    app = await mountApp();
    // The harness's own posture (`mountApp`): camera at {0,0,1} — already 100%.
    let popup = await openZoomMenu(app);
    let row = rowsOf(popup).find((candidate) => candidate.label === "Zoom to 100%")!;
    expect(isDisabled(row), "disabled while already at 100%").toBe(true);
    await closeMenu();

    app.editor.setCamera({ x: 0, y: 0, z: 0.5 });
    await waitFor(() => Math.abs(app!.editor.getZoomLevel() - 0.5) < 1e-6, { what: "camera settled at 50%" });
    popup = await openZoomMenu(app);
    row = rowsOf(popup).find((candidate) => candidate.label === "Zoom to 100%")!;
    expect(isDisabled(row), "enabled away from 100%").toBe(false);
    await userEvent.click(row.element);
    await waitFor(() => Math.abs(app!.editor.getZoomLevel() - 1) < 1e-6, { what: "zoom returned to 100%" });
  });

  it("Zoom to selection is disabled with nothing selected, and enabled with a shape selected", async () => {
    app = await mountApp();
    let popup = await openZoomMenu(app);
    let row = rowsOf(popup).find((candidate) => candidate.label === "Zoom to selection")!;
    expect(isDisabled(row), "disabled with an empty selection").toBe(true);
    await closeMenu();

    const id = placeBlock("sel", 900, 700);
    app.editor.select(id);
    popup = await openZoomMenu(app);
    row = rowsOf(popup).find((candidate) => candidate.label === "Zoom to selection")!;
    expect(isDisabled(row), "enabled with a shape selected").toBe(false);
    await closeMenu();
  });
});

describe("the grid toggle drives tldraw's real grid, both ways", () => {
  it("clicking the grid item flips editor.getInstanceState().isGridMode on, then off again", async () => {
    app = await mountApp();
    const grid = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-grid"]'), { what: "the grid item" });
    expect(app.editor.getInstanceState().isGridMode, "grid starts off").toBe(false);

    await userEvent.click(grid);
    await waitFor(() => (app!.editor.getInstanceState().isGridMode ? true : null), { what: "grid mode turned on" });

    await userEvent.click(grid);
    await waitFor(() => (app!.editor.getInstanceState().isGridMode ? null : true), { what: "grid mode turned back off" });
  });
});

describe("showZoomButtons (the already-shipped appearance preference, now actually wired)", () => {
  it("true: zoom−/zoom+ buttons exist and each moves the zoom level", async () => {
    storeShowZoomButtons(true);
    app = await mountApp();
    const out = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-zoom-out"]'), { what: "the zoom-out button" });
    const zoomIn = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-zoom-in"]'), { what: "the zoom-in button" });

    app.editor.setCamera({ x: 0, y: 0, z: 1 });
    await waitFor(() => Math.abs(app!.editor.getZoomLevel() - 1) < 1e-6, { what: "camera settled at 100%" });
    const before = app.editor.getZoomLevel();
    await userEvent.click(out);
    await waitFor(() => (app!.editor.getZoomLevel() < before ? true : null), { what: "zoom-out button decreased the zoom level" });

    const middle = app.editor.getZoomLevel();
    await userEvent.click(zoomIn);
    await waitFor(() => (app!.editor.getZoomLevel() > middle ? true : null), { what: "zoom-in button increased the zoom level" });
  });

  it("false (the default): no zoom−/zoom+ buttons — only the readout/menu trigger", async () => {
    app = await mountApp();
    await waitFor(() => app!.root.querySelector('[data-testid="ss-status-zoom"]'), { what: "the zoom trigger still mounts" });
    expect(app.root.querySelector('[data-testid="ss-status-zoom-out"]')).toBeNull();
    expect(app.root.querySelector('[data-testid="ss-status-zoom-in"]')).toBeNull();
  });
});

describe("the dock's trailing library slot", () => {
  it("renders ss-dock-library", async () => {
    app = await mountApp();
    await waitFor(() => app!.root.querySelector('[data-testid="ss-dock-library"]'), { what: "the dock's library trigger" });
  });
});
