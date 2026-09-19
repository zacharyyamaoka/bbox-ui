// src/settings.smoke.test.tsx — the Settings surface, mounted from the burger.
// ACCEPTANCE committed by the planning lane of docs/CHROME-FILES-SETTINGS-PLAN.md
// before any builder; off-limits to lane `app-wiring`.
//
// Zach, 2026-09-19: "Please add the setting page. We want the option wether we
// see settings as a [dialog or a page]. You can reference the one in old
// system sketch" and "in settings you can have a toggle wether for file
// navigation to use native or our app one". The app only CONFIGURES the
// trunk's `SettingsView` (which settings, bound to what); how it looks is the
// trunk's (src/stories/SettingsView.stories.tsx).
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { clickRow, openBurger, runFileCommand } from "./testing/menus";

const SETTINGS_KEY = "systemsketch.settings.v1";

let app: MountedApp | null = null;
let restore: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.removeItem(SETTINGS_KEY);
  setDocumentLocation(memoryDocumentLocation());
});

afterEach(() => {
  app?.unmount();
  app = null;
  restore?.();
  restore = null;
  window.localStorage.removeItem(SETTINGS_KEY);
  resetLaunchConfig();
});

const settingsView = () => document.querySelector<HTMLElement>('[data-testid="ss-settings"][data-slot="settings-view"]');

async function openSettings(mounted: MountedApp): Promise<HTMLElement> {
  await clickRow(await openBurger(mounted), "Settings");
  return waitFor(() => settingsView(), { what: "the Settings surface" });
}

function option(view: HTMLElement, section: string, value: string): HTMLElement {
  const element = view.querySelector<HTMLElement>(`[data-slot="settings-section"][data-section-id="${section}"] [role="radio"][data-option-value="${value}"]`);
  if (!element) throw new Error(`no ${section} option ${value}`);
  return element;
}

async function remount() {
  app?.unmount();
  app = null;
  app = await mountApp();
  return app;
}

describe("Settings — a dialog by default, a page on request, remembered per viewer", () => {
  it("opens from the burger as a dialog, with General holding File navigation and Settings presentation", async () => {
    app = await mountApp();
    const view = await openSettings(app);
    expect(view.getAttribute("data-presentation")).toBe("dialog");
    expect(view.getAttribute("role")).toBe("dialog");
    const rect = view.getBoundingClientRect();
    expect(rect.width).toBeLessThan(window.innerWidth - 40);
    expect(rect.height).toBeLessThan(window.innerHeight - 40);

    const nav = view.querySelector('[data-slot="settings-nav"]')!;
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toMatch(/General/);
    expect(option(view, "file-navigation", "app").getAttribute("aria-checked")).toBe("true");
    expect(option(view, "file-navigation", "native").getAttribute("aria-checked")).toBe("false");
    expect(option(view, "settings-presentation", "dialog").getAttribute("aria-checked")).toBe("true");
    expect(option(view, "settings-presentation", "page").getAttribute("aria-checked")).toBe("false");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !settingsView(), { what: "Escape closes it" });
  });

  it("choosing Page re-presents Settings full-window at once, and the choice survives a remount", async () => {
    app = await mountApp();
    let view = await openSettings(app);
    await userEvent.click(option(view, "settings-presentation", "page"));
    view = await waitFor(() => (settingsView()?.getAttribute("data-presentation") === "page" ? settingsView() : null), { what: "the page presentation" });
    const rect = view.getBoundingClientRect();
    expect(Math.abs(rect.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.width - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.height - window.innerHeight)).toBeLessThanOrEqual(1);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !settingsView(), { what: "Escape closes the page too" });

    const again = await remount();
    view = await openSettings(again);
    expect(view.getAttribute("data-presentation")).toBe("page");
  });

  it("choosing System file dialog makes File ▸ Open… call the browser's picker instead of the app navigator — and it survives a remount", async () => {
    app = await mountApp();
    const view = await openSettings(app);
    await userEvent.click(option(view, "file-navigation", "native"));
    await waitFor(() => option(settingsView()!, "file-navigation", "native").getAttribute("aria-checked") === "true", { what: "native selected" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !settingsView(), { what: "closed" });

    let calls = 0;
    const target = window as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(target, "showOpenFilePicker");
    const previous = target.showOpenFilePicker;
    target.showOpenFilePicker = async () => {
      calls += 1;
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    restore = () => {
      if (had) target.showOpenFilePicker = previous;
      else delete target.showOpenFilePicker;
    };

    const again = await remount();
    await runFileCommand(again, "Open…");
    await waitFor(() => calls === 1, { what: "showOpenFilePicker called" });
    expect(document.querySelector('[data-testid="ss-file-navigator"]')).toBeNull();
  });
});
