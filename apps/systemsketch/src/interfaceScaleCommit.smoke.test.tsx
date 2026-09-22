// src/interfaceScaleCommit.smoke.test.tsx — WHEN the interface-scale slider
// writes. Its sibling `interfaceScale.smoke.test.tsx` proves the apply is real
// (the chrome grows, the board does not move, the value persists); this file
// proves the apply happens ONCE, on release.
//
// Zach, 2026-09-21: "the scrolling appearance slider still doesn't work. it
// should only update when I release my finger from the drag, but its updating
// as the slider moves".
//
// The whole bug lives in the MIDDLE of a drag, which is what makes this file
// shaped the way it is. Two rules it follows because of that:
//
//   1. EVERY "did the interface change" claim is a real ruler — the painted
//      height of the dock (`getBoundingClientRect`), the live
//      `--ss-interface-scale` custom property, or the bytes in localStorage.
//      Never a React prop, never DOM presence. A prop-level assertion would
//      pass on the broken build, because the broken build changed the prop
//      exactly the same way — it just also applied it.
//   2. The drag is driven through Chrome's own input pipeline, PAUSED between
//      steps. See `mouseAt` for why that has to be CDP here.
import { cdp, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { INTERFACE_SCALE_STORAGE_KEY } from "@trunk/components/interfaceScale";
import { setInterfaceScalePercent } from "./chrome/ShareMenu";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";
import { clickRow, openBurger } from "./testing/menus";

const DOCK = '[data-slot="tool-dock"]';
const SETTINGS = '[data-testid="ss-settings"][data-slot="settings-view"]';
const SCALE_SECTION = '[data-slot="settings-section"][data-section-id="interface-scale"]';

let app: MountedApp | null = null;
let restoreStorage: (() => void) | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  restoreStorage?.();
  restoreStorage = null;
  // The store is a module singleton and localStorage is real in browser mode,
  // so a test that left the app at 150% would hand the next one a scaled
  // baseline. Put both back.
  setInterfaceScalePercent(100);
  try {
    window.localStorage.removeItem(INTERFACE_SCALE_STORAGE_KEY);
  } catch {
    // Same swallow the production adapter uses.
  }
});

// ───────────────────────── real, pausable pointer input ──────────────────

/**
 * How a point in THIS frame's client coordinates becomes a point in the
 * coordinates `Input.dispatchMouseEvent` takes.
 *
 * It is NOT the identity and it is NOT a translation. Vitest runs the test in
 * an iframe sized to the configured viewport (1400x900) and then CSS-SCALES
 * that iframe down to fit the real browser window, while CDP addresses the
 * top-level page. Measured here: a CDP move at page (700, 450) arrives in this
 * frame at client (875, 562) — a factor of 0.8, not an offset. A translation-
 * only calibration put every event of a drag onto the description text 40px
 * above the track, and the whole gesture silently did nothing.
 *
 * So the map is derived, not assumed: dispatch at two known page points, read
 * where each one landed, and solve for scale and origin per axis.
 */
let pointerMap: { scaleX: number; scaleY: number; originX: number; originY: number } | null = null;

/** Dispatch a bare move at a page point and resolve the event this frame saw. */
async function probeAt(pageX: number, pageY: number): Promise<MouseEvent> {
  const landed = new Promise<MouseEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("mousemove", onMove, true);
      reject(new Error(`CDP mouse input never reached the test frame (probe at ${pageX},${pageY})`));
    }, 5_000);
    function onMove(event: MouseEvent) {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove, true);
      resolve(event);
    }
    window.addEventListener("mousemove", onMove, true);
  });
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pageX, y: pageY, button: "none", buttons: 0 });
  return landed;
}

async function pointerMapping(): Promise<NonNullable<typeof pointerMap>> {
  if (pointerMap) return pointerMap;
  const near = await probeAt(200, 150);
  const far = await probeAt(600, 450);
  const scaleX = (600 - 200) / (far.clientX - near.clientX);
  const scaleY = (450 - 150) / (far.clientY - near.clientY);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new Error(`could not map CDP coordinates onto this frame: ${JSON.stringify({ near: [near.clientX, near.clientY], far: [far.clientX, far.clientY] })}`);
  }
  pointerMap = {
    scaleX,
    scaleY,
    originX: 200 - scaleX * near.clientX,
    originY: 150 - scaleY * near.clientY,
  };
  return pointerMap;
}

/**
 * One mouse event, at a point in THIS frame's client coordinates.
 *
 * WHY CDP rather than `userEvent`: vitest's browser `userEvent` exposes no
 * mouse down / move / up. It has `click`, `hover` and an ATOMIC `dragAndDrop`
 * that presses, moves and releases inside a single await — so a test written
 * with it cannot observe anything while the button is still down, which is the
 * only moment this bug exists in. `Input.dispatchMouseEvent` is Chrome's own
 * input pipeline (the same one Playwright's mouse drives underneath), so these
 * are TRUSTED events going through real hit-testing and real pointer capture —
 * not `element.dispatchEvent` synthetics. `pillGeometry.smoke.test.tsx`
 * already drives CDP from this suite.
 */
async function mouseAt(type: "mousePressed" | "mouseMoved" | "mouseReleased", point: { x: number; y: number }): Promise<void> {
  const map = await pointerMapping();
  await cdp().send("Input.dispatchMouseEvent", {
    type,
    x: map.originX + map.scaleX * point.x,
    y: map.originY + map.scaleY * point.y,
    button: "left",
    // A move with `buttons: 0` is how Base UI's slider decides a release was
    // swallowed and ends the drag itself (`SliderControl.js:267-271`), so the
    // held-down moves have to carry the button.
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: type === "mouseMoved" ? 0 : 1,
    pointerType: "mouse",
  });
  await nextFrame();
}

/** Centre of a rendered element, in painted pixels. */
function centre(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ───────────────────────────── the three rulers ──────────────────────────

/**
 * Every value `--ss-interface-scale` has taken since recording started. This
 * is the APPLIED scale: `interfaceScaleHost.tsx`'s layout effect writes it and
 * `src/interface-scale.css` is the only thing that reads it, so one entry here
 * is one visible re-scale of the whole interface.
 */
function recordAppliedScale(): { values: string[]; stop(): void } {
  const values: string[] = [];
  let last = document.documentElement.style.getPropertyValue("--ss-interface-scale");
  const observer = new MutationObserver(() => {
    const now = document.documentElement.style.getPropertyValue("--ss-interface-scale");
    if (now === last) return;
    last = now;
    values.push(now);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  return { values, stop: () => observer.disconnect() };
}

/**
 * Every percent written to the preference's own key. Patched on
 * `Storage.prototype` and not on the `localStorage` instance: `Storage` routes
 * unknown instance properties into the store itself, so assigning
 * `localStorage.setItem` is not reliably a method override.
 */
function recordWrites(): { values: number[]; restore(): void } {
  const values: number[] = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function patched(this: Storage, key: string, value: string) {
    if (key === INTERFACE_SCALE_STORAGE_KEY) {
      values.push((JSON.parse(value) as { percent: number }).percent);
    }
    return original.call(this, key, value);
  };
  return {
    values,
    restore() {
      Storage.prototype.setItem = original;
    },
  };
}

/** Every distinct number the readout has shown — the live PREVIEW. */
function recordPreview(readout: Element): { values: string[]; stop(): void } {
  const values: string[] = [readout.textContent ?? ""];
  const observer = new MutationObserver(() => {
    const now = readout.textContent ?? "";
    if (now === values[values.length - 1]) return;
    values.push(now);
  });
  observer.observe(readout, { characterData: true, childList: true, subtree: true });
  return { values, stop: () => observer.disconnect() };
}

// ──────────────────────────── opening the control ────────────────────────

interface ScaleControl {
  slider: HTMLElement;
  thumb: HTMLElement;
  track: HTMLElement;
  range: HTMLInputElement;
  readout: HTMLElement;
  preset(percent: number): HTMLButtonElement;
  reset(): HTMLButtonElement;
}

async function openScaleControl(mounted: MountedApp): Promise<ScaleControl> {
  await clickRow(await openBurger(mounted), "Settings");
  const view = await waitFor(() => document.querySelector<HTMLElement>(SETTINGS), { what: "the Settings surface" });
  const nav = view.querySelector<HTMLElement>('[data-slot="settings-nav"]')!;
  const appearance = Array.from(nav.querySelectorAll<HTMLElement>("button")).find((button) => button.textContent?.includes("Appearance"))!;
  await userEvent.click(appearance);

  const section = await waitFor(() => view.querySelector<HTMLElement>(SCALE_SECTION), { what: "the Interface scale section" });
  const slider = section.querySelector<HTMLElement>('[data-slot="settings-slider"]')!;
  // Base UI keeps a thumb `visibility: hidden` — and out of the accessibility
  // tree — until it has measured the track, so wait for it rather than
  // querying once.
  const thumb = await waitFor(() => slider.querySelector<HTMLElement>('[data-slot="slider-thumb"]'), { what: "the slider thumb" });
  return {
    slider,
    thumb,
    track: slider.querySelector<HTMLElement>('[data-slot="slider-track"]')!,
    range: thumb.querySelector<HTMLInputElement>('input[type="range"]')!,
    readout: slider.querySelector<HTMLElement>('[data-slot="settings-slider-value"]')!,
    preset: (percent: number) => slider.querySelector<HTMLButtonElement>(`[data-preset-value="${percent}"]`)!,
    reset: () => slider.querySelector<HTMLButtonElement>('[data-slot="settings-slider-reset"]')!,
  };
}

async function dockBar(): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelector<HTMLElement>(DOCK), { what: "the tool dock" });
}

/** The element's box once it has stopped moving — the ruler used everywhere
 *  a size claim is made, copied from `interfaceScale.smoke.test.tsx`. */
async function settledHeight(el: Element): Promise<number> {
  let previous = el.getBoundingClientRect().height;
  for (let attempt = 0; attempt < 60; attempt++) {
    await nextFrame();
    const now = el.getBoundingClientRect().height;
    if (Math.abs(now - previous) < 0.05) return now;
    previous = now;
  }
  return previous;
}

/**
 * The APPLIED scale as a percent.
 *
 * `Math.round` is load-bearing, not tidiness: the variable is written as a
 * factor, and `Number("1.1") * 100` is `110.00000000000001` in IEEE doubles —
 * measured, and it cost this file two red tests before it was here. 105, 125,
 * 150 and 90 all multiply exactly, so an equality check without the round
 * passes everywhere except the one preset that matters.
 */
const appliedPercent = () => Math.round(Number(document.documentElement.style.getPropertyValue("--ss-interface-scale") || "1") * 100);

// ─────────────────────────────────── tests ───────────────────────────────

describe("interface scale — a drag applies on RELEASE", () => {
  it("crosses several values with the button down without re-scaling anything, then applies exactly once", async () => {
    app = await mountApp();
    const bar = await dockBar();
    const baseHeight = await settledHeight(bar);
    const scale = await openScaleControl(app);

    expect(scale.slider.getAttribute("data-commit"), "the row is bound to the deferred mode").toBe("exit");

    const applied = recordAppliedScale();
    const written = recordWrites();
    restoreStorage = written.restore;
    const preview = recordPreview(scale.readout);

    // Grab the handle and walk it right, a step at a time, never releasing.
    const track = scale.track.getBoundingClientRect();
    const y = centre(scale.thumb).y;
    await mouseAt("mouseMoved", centre(scale.thumb));
    await mouseAt("mousePressed", centre(scale.thumb));
    let last = centre(scale.thumb);
    for (const fraction of [0.55, 0.65, 0.75, 0.85]) {
      last = { x: track.left + track.width * fraction, y };
      await mouseAt("mouseMoved", last);
    }

    // ── still holding ──────────────────────────────────────────────────
    // The drag really did cross several values: the readout moved, which is
    // the live feedback the person needs and the reason "one commit" below is
    // not vacuously true.
    expect(preview.values.length, "the readout previewed several values during the drag").toBeGreaterThanOrEqual(4);

    // …and NOTHING was applied or persisted while the finger was down.
    //
    // ORDER MATTERS HERE, and it is the mutation test that decided it. With
    // the commit moved back onto the change event, `data-pending` also goes
    // null — so if that assertion came first the red line would name an
    // attribute instead of the product failure. These three name the product
    // failure, so they go first and the attribute check follows.
    expect(applied.values, "the interface did not re-scale mid-drag").toEqual([]);
    expect(appliedPercent(), "the live scale variable is untouched").toBe(100);
    expect(written.values, "and nothing reached storage mid-drag").toEqual([]);
    expect(await settledHeight(bar), "the dock is painting the same pixels it was").toBeCloseTo(baseHeight, 1);
    expect(scale.slider.getAttribute("data-pending"), "the control says it is holding an unwritten value").toBe("true");

    // ── release ────────────────────────────────────────────────────────
    await mouseAt("mouseReleased", last);
    await waitFor(() => applied.values.length > 0, { what: "the scale to apply on release" });

    const committed = Number(scale.readout.textContent!.replace("%", ""));
    expect(committed, "the drag ended somewhere above the default").toBeGreaterThan(100);
    expect(applied.values, "ONE apply, not one per value crossed").toEqual([String(committed / 100)]);
    expect(written.values, "ONE write, not one per value crossed").toEqual([committed]);
    expect(scale.slider.getAttribute("data-pending"), "nothing is pending any more").toBeNull();

    // Measured, not inferred: the chrome really is at the committed factor.
    expect((await settledHeight(bar)) / baseHeight, "the dock paints at the committed factor").toBeCloseTo(committed / 100, 1);
    expect(JSON.parse(window.localStorage.getItem(INTERFACE_SCALE_STORAGE_KEY)!), "under the donor's record shape").toEqual({
      version: 1,
      percent: committed,
    });

    applied.stop();
    preview.stop();
  });

  it("re-opening Settings shows the committed value, not the last thing the drag hovered over", async () => {
    app = await mountApp();
    const scale = await openScaleControl(app);
    await userEvent.click(scale.preset(125));
    await waitFor(() => appliedPercent() === 125, { what: "125% to apply" });

    // A drag that is abandoned by closing the dialog must leave nothing behind.
    const track = scale.track.getBoundingClientRect();
    await mouseAt("mouseMoved", centre(scale.thumb));
    await mouseAt("mousePressed", centre(scale.thumb));
    await mouseAt("mouseMoved", { x: track.left + track.width * 0.95, y: centre(scale.thumb).y });
    expect(scale.readout.textContent, "the preview moved off 125%").not.toBe("125%");
    await mouseAt("mouseReleased", { x: track.left + track.width * 0.95, y: centre(scale.thumb).y });
    await waitFor(() => appliedPercent() !== 125, { what: "the released value to apply" });
    const committed = appliedPercent();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => !document.querySelector(SETTINGS), { what: "Settings to close" });

    const reopened = await openScaleControl(app);
    expect(reopened.readout.textContent, "the reopened control reads the committed value").toBe(`${committed}%`);
    expect(reopened.range.value, "and so does the stock range input").toBe(String(committed));
  });
});

describe("interface scale — the discrete controls stay immediate", () => {
  it("presets and Reset apply on the click, with no release to wait for", async () => {
    app = await mountApp();
    const bar = await dockBar();
    const baseHeight = await settledHeight(bar);
    const scale = await openScaleControl(app);

    const applied = recordAppliedScale();
    const written = recordWrites();
    restoreStorage = written.restore;

    await userEvent.click(scale.preset(150));
    await waitFor(() => appliedPercent() === 150, { what: "150% to apply on the click alone" });
    expect(written.values, "the preset wrote once, immediately").toEqual([150]);
    expect((await settledHeight(bar)) / baseHeight, "and the dock really is 1.5x").toBeCloseTo(1.5, 1);
    expect(scale.preset(150).getAttribute("aria-pressed"), "the pressed preset is the APPLIED one").toBe("true");

    await userEvent.click(scale.preset(90));
    await waitFor(() => appliedPercent() === 90, { what: "90% to apply" });

    const reset = scale.reset();
    expect(reset.disabled, "Reset is live while the value is not the default").toBe(false);
    await userEvent.click(reset);
    await waitFor(() => appliedPercent() === 100, { what: "Reset to return to 100%" });
    expect(written.values, "three discrete clicks, three immediate writes").toEqual([150, 90, 100]);
    expect(scale.reset().disabled, "and Reset goes dead once there is nothing to undo").toBe(true);

    applied.stop();
  });

  it("each arrow key is its own commit — one press, one apply", async () => {
    app = await mountApp();
    const scale = await openScaleControl(app);
    const written = recordWrites();
    restoreStorage = written.restore;
    const applied = recordAppliedScale();

    scale.range.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => appliedPercent() === 105, { what: "one press to apply one step" });
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => appliedPercent() === 110, { what: "the second press" });
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => appliedPercent() === 105, { what: "and back down" });

    expect(written.values, "three presses, three commits — no blur needed, nothing buffered").toEqual([105, 110, 105]);
    expect(applied.values, "and each one was applied when it was pressed").toEqual(["1.05", "1.1", "1.05"]);
    expect(scale.slider.getAttribute("data-pending"), "a keyboard step never leaves a value hanging").toBeNull();

    applied.stop();
  });
});

describe("interface scale — Escape mid-drag abandons the gesture", () => {
  it("drops the preview, writes nothing on release, and leaves Settings open", async () => {
    app = await mountApp();
    const scale = await openScaleControl(app);
    await userEvent.click(scale.preset(110));
    await waitFor(() => appliedPercent() === 110, { what: "a committed starting point" });

    const written = recordWrites();
    restoreStorage = written.restore;
    const applied = recordAppliedScale();

    const track = scale.track.getBoundingClientRect();
    const y = centre(scale.thumb).y;
    await mouseAt("mouseMoved", centre(scale.thumb));
    await mouseAt("mousePressed", centre(scale.thumb));
    const away = { x: track.left + track.width * 0.9, y };
    await mouseAt("mouseMoved", away);
    expect(scale.readout.textContent, "the preview moved off the committed value").not.toBe("110%");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => scale.readout.textContent === "110%", { what: "the preview to be abandoned" });
    expect(document.querySelector(SETTINGS), "Escape cancelled the DRAG, not the dialog").not.toBeNull();
    expect(scale.slider.getAttribute("data-pending"), "nothing is pending after the cancel").toBeNull();

    // Keep dragging after the cancel: the rest of this gesture is dead.
    await mouseAt("mouseMoved", { x: track.left + track.width * 0.3, y });
    expect(scale.readout.textContent, "a cancelled gesture stops previewing too").toBe("110%");
    await mouseAt("mouseReleased", { x: track.left + track.width * 0.3, y });
    await nextFrame();
    await nextFrame();

    expect(written.values, "an abandoned drag writes nothing at all").toEqual([]);
    expect(applied.values, "and applies nothing at all").toEqual([]);
    expect(appliedPercent(), "the interface is still where it was committed").toBe(110);

    // And a FRESH gesture still works — the cancel is per-gesture, not a latch.
    await mouseAt("mouseMoved", centre(scale.thumb));
    await mouseAt("mousePressed", centre(scale.thumb));
    const next = { x: track.left + track.width * 0.95, y: centre(scale.thumb).y };
    await mouseAt("mouseMoved", next);
    await mouseAt("mouseReleased", next);
    await waitFor(() => appliedPercent() !== 110, { what: "the next drag to commit normally" });
    expect(written.values.length, "one write from the gesture that was not cancelled").toBe(1);

    applied.stop();
  });

  it("with nothing in flight, Escape still closes Settings", async () => {
    app = await mountApp();
    const scale = await openScaleControl(app);
    scale.range.focus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !document.querySelector(SETTINGS), { what: "Escape to close Settings as it always has" });
  });
});
