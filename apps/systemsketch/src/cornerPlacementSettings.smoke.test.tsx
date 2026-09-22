// src/cornerPlacementSettings.smoke.test.tsx — the live wire between Settings
// ▸ About ▸ "Bottom-right menu position" and the actual bottom-right cluster,
// proved through the real Settings dialog with NO remount.
//
// WHY this file exists separately from `settings.smoke.test.tsx` (which is
// off-limits — see that file's own header) and `corner.smoke.test.tsx`
// (which asserts the FORCED placement only after a fresh mount): this repo
// has shipped the "slider writes storage but the canvas never re-reads it"
// bug three separate times before this feature existed — interface scale,
// camera gestures, edge policy (`appSettings.tsx`'s own WHY comments). The
// regression this file pins is exactly that class: a switch that persists
// but never reaches the mounted canvas until the next reload. Toggling it on
// WITHOUT remounting and watching the corner cluster move live is the whole
// point.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { CORNER_PLACEMENT_STORAGE_KEY } from "./chrome/ShareMenu/cornerPlacementHost";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { openBurger, clickRow } from "./testing/menus";

let app: MountedApp | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  window.localStorage.removeItem(CORNER_PLACEMENT_STORAGE_KEY);
});

const settingsView = () => document.querySelector<HTMLElement>('[data-testid="ss-settings"][data-slot="settings-view"]');

async function openSettings(mounted: MountedApp): Promise<HTMLElement> {
  await clickRow(await openBurger(mounted), "Settings");
  return waitFor(() => settingsView(), { what: "the Settings surface" });
}

/** The nav is a plain list of stock `Button`s, one per category, printing the
 *  category's own label as its text — the same shape `settings.smoke.test.tsx`
 *  reads `aria-current="page"` off. There is no `data-category-id`, so this
 *  reads the label the way that file already does. */
async function openAboutCategory(view: HTMLElement): Promise<void> {
  const nav = view.querySelector<HTMLElement>('[data-slot="settings-nav"]');
  if (!nav) throw new Error("no settings nav");
  const button = Array.from(nav.querySelectorAll<HTMLElement>("button")).find((candidate) => candidate.textContent?.includes("About"));
  if (!button) throw new Error("no About category button");
  await userEvent.click(button);
  await waitFor(() => nav.querySelector('[aria-current="page"]')?.textContent?.includes("About"), { what: "About selected" });
}

function cornerPlacementSwitch(view: HTMLElement): HTMLElement {
  const element = view.querySelector<HTMLElement>('[data-slot="settings-section"][data-section-id="corner-menu-placement"] [role="switch"]');
  if (!element) throw new Error("no corner-menu-placement switch");
  return element;
}

describe("Bottom-right menu position — the Settings switch reaches the live canvas, no remount", () => {
  it("off by default: the cluster is placed by the watermark-avoidance rule, never forced", async () => {
    app = await mountApp();
    const cluster = await waitFor(() => app!.root.querySelector<HTMLElement>("[data-corner-placement]"), { what: "the corner cluster" });
    // Default posture: whatever the watermark-avoidance rule decides — never
    // "corner" outright the instant the app mounts with no opt-in stored.
    // (The watermark mounts async, so the settled value is read, not the
    // first frame's.)
    await waitFor(() => cluster.getAttribute("data-corner-placement") !== null, { what: "placement settled" });
    expect(cluster.getAttribute("data-corner-placement")).not.toBeNull();

    const view = await openSettings(app);
    await openAboutCategory(view);
    const toggle = cornerPlacementSwitch(view);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("flipping the switch ON moves the live corner cluster to the true corner — the same mounted instance, no remount", async () => {
    app = await mountApp();
    const root = app.root;
    const cluster = await waitFor(() => root.querySelector<HTMLElement>("[data-corner-placement]"), { what: "the corner cluster" });

    const view = await openSettings(app);
    await openAboutCategory(view);
    const toggle = cornerPlacementSwitch(view);
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    await userEvent.click(toggle);

    await waitFor(() => toggle.getAttribute("aria-checked") === "true", { what: "the switch reflects the click" });
    // The regression this file exists to catch: without live wiring, storage
    // is written but `cluster`'s attribute never changes until a reload.
    await waitFor(() => cluster.getAttribute("data-corner-placement") === "corner", { what: "the corner cluster forced flush, live" });
    expect(window.localStorage.getItem(CORNER_PLACEMENT_STORAGE_KEY)).toBe("true");

    // And back off, still live, still no remount.
    await userEvent.click(toggle);
    await waitFor(() => toggle.getAttribute("aria-checked") === "false", { what: "the switch reflects the second click" });
    await waitFor(() => cluster.getAttribute("data-corner-placement") !== "corner" || window.localStorage.getItem(CORNER_PLACEMENT_STORAGE_KEY) === "false", {
      what: "the watermark-avoidance rule back in charge",
    });
    expect(window.localStorage.getItem(CORNER_PLACEMENT_STORAGE_KEY)).toBe("false");
  });

  it("the red warning sits beside the toggle, visible before AND after it is turned on", async () => {
    app = await mountApp();
    const view = await openSettings(app);
    await openAboutCategory(view);
    const warning = view.querySelector<HTMLElement>('[data-slot="settings-section"][data-section-id="corner-menu-placement-warning"] p');
    if (!warning) throw new Error("no corner-menu-placement-warning text");
    expect(warning.textContent).toMatch(/licence/i);
    expect(warning.textContent).toMatch(/Terms of Service/i);
    expect(getComputedStyle(warning).color).not.toBe("");

    const toggle = cornerPlacementSwitch(view);
    await userEvent.click(toggle);
    await waitFor(() => toggle.getAttribute("aria-checked") === "true", { what: "toggled on" });
    // Still there, unconditionally — never gated on the toggle's own state.
    expect(view.querySelector('[data-slot="settings-section"][data-section-id="corner-menu-placement-warning"] p')?.textContent).toBe(
      warning.textContent,
    );
  });
});
