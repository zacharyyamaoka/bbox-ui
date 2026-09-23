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

import { INTERFACE_SCALE_STORAGE_KEY } from "@trunk/editor/interfaceScale";
import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import { setInterfaceScalePercent } from "./chrome/ShareMenu";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";
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
  // Finding 3's 160% test leaves the scale preference changed — a module
  // singleton + real localStorage, same trap `interfaceScale.smoke.test.tsx`
  // guards against — so every test after it would inherit a scaled baseline.
  setInterfaceScalePercent(100);
  try {
    window.localStorage.removeItem(INTERFACE_SCALE_STORAGE_KEY);
  } catch {
    // Same swallow the production adapter uses.
  }
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

/**
 * The element's box once its own geometry transition has actually finished.
 *
 * WHY this is a wait on `getAnimations()` rather than "poll two frames until
 * they agree" (`interfaceScale.smoke.test.tsx`'s `settledRect`, the sibling
 * idiom this is named after): `settingsView.tsx`'s `POPUP_BASE` carries
 * `duration-100` with no `transition-property` beside it, and the CSS
 * Transitions spec's initial value for `transition-property` is `all` — so
 * `duration-100` alone quietly transitions every animatable property that
 * differs between the dialog and page presentations (`top`, `left`, `width`,
 * `height`, `translate`, all four `border-radius` corners), not only the
 * opacity the `data-open:` keyframes were written for. MEASURED: one frame
 * after `data-presentation` flips to "page", `getBoundingClientRect()` was
 * still reporting the outgoing dialog's centred 1040x720 box, and it was
 * STILL reporting it a full second (60 polled frames) later — not a
 * transient mid-flight read, because `popup.getAnimations()` at that moment
 * returns nine live WAAPI-backed CSS Transitions sitting at `playState:
 * "running"`. Waiting for that list to empty is what makes the box real. */
async function settledRect(el: HTMLElement): Promise<DOMRect> {
  await waitFor(() => el.getAnimations().length === 0, { what: "the popup's geometry transition to finish", timeout: 3000 });
  return el.getBoundingClientRect();
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
    const rect = await settledRect(view);
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

  it("at 160% interface scale, the popup stays inside the window and never scrolls sideways", async () => {
    // Finding 3 (Codex judge, `settings-panel-fixes` verdict, 2026-09-22):
    // `interface-scale.css` used to zoom `[data-slot="settings-view"]`
    // itself, so the frame's own viewport-bound sizing (`settingsView.tsx`'s
    // `min(1040px, calc(100vw-4rem))`) was multiplied by the scale too. The
    // judge's own number (~1664x1152 at 1280x800) turned out not to
    // reproduce in real Chromium — an unrelated `max-w-[calc(100%-2rem)]`
    // safety clamp already on the same class happened to claw it back on
    // screen at every width tried (`interface-scale.css`'s own WHY has the
    // full account) — but the frame's on-screen guarantee riding on that
    // accident, rather than being true by construction, was real. The fix
    // keeps the frame at zoom 1 and scales only its two direct children
    // (header, nav+pane row); this is the harness's own harness-viewport
    // (1400x900) proof that it holds against the real mounted app, not a
    // story — `interface-scale.css`'s WHY carries the multi-width real-
    // Chromium measurement this harness's fixed viewport cannot.
    app = await mountApp();
    setInterfaceScalePercent(160);
    await waitFor(() => document.documentElement.style.getPropertyValue("--ss-interface-scale") === "1.6", {
      what: "--ss-interface-scale to become 1.6",
    });
    await nextFrame();
    await nextFrame();

    const view = await openSettings(app);
    // Connections: the stress case already used for the un-scaled overflow
    // check — nine switches with the longest descriptions in the panel.
    const connections = Array.from(view.querySelectorAll<HTMLElement>('[data-slot="settings-nav"] button')).find(
      (button) => button.textContent?.includes("Connections"),
    );
    if (!connections) throw new Error("no Connections nav row");
    await userEvent.click(connections);
    await waitFor(() => view.querySelector('[data-section-id="type-matching"]'), { what: "Connections rendered" });
    const rect = view.getBoundingClientRect();
    expect(rect.left, "left edge on screen").toBeGreaterThanOrEqual(-1);
    expect(rect.top, "top edge on screen").toBeGreaterThanOrEqual(-1);
    expect(rect.right, "right edge on screen").toBeLessThanOrEqual(window.innerWidth + 1);
    expect(rect.bottom, "bottom edge on screen").toBeLessThanOrEqual(window.innerHeight + 1);
    // The bounds checks above are NECESSARY but not SUFFICIENT: this
    // harness's fixed 1400x900 viewport is wide enough that even the old,
    // single-rule `zoom: var(--ss-interface-scale)` on the frame ITSELF
    // stayed inside the window here (it rendered at 1348.8px, still under
    // 1400 — an accident of this one viewport, not proof of the fix; see
    // `interface-scale.css`'s WHY for the width where that accident stops
    // holding). What the fix actually guarantees — the frame is
    // scale-INVARIANT, real 1040px at every scale, not merely "smaller than
    // 1664px" — is what the old rule could not, and MEASURING it is what
    // makes this a real regression test rather than a bounds check the bug
    // already passed.
    expect(rect.width, "the frame is its true unscaled width, not shrunk-by-accident").toBeCloseTo(1040, 0);
    expect(rect.height, "the frame is its true unscaled height, not shrunk-by-accident").toBeCloseTo(720, 0);

    const viewport = view.querySelector<HTMLElement>('[data-slot="settings-pane"]')!.closest('[data-slot="scroll-area"]')!
      .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    expect(viewport.scrollWidth, "content pane never scrolls sideways, even scaled").toBeLessThanOrEqual(viewport.clientWidth);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !settingsView(), { what: "Escape closes it" });
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
