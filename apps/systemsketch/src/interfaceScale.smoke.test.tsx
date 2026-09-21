// src/interfaceScale.smoke.test.tsx — acceptance for the interface-scale
// setting, against the real mounted app.
//
// Zach, 2026-09-20: "As I move the interface scale I would expect for it to
// resize but its not... also I want that interface scale setting to persist."
//
// The value already persisted before this lane — `@trunk/components/
// interfaceScale` is a character-for-character port of the donor model and
// `chrome/ShareMenu/appSettings.tsx` already wrote through it. Nothing read it back, so
// nothing ever resized. That makes this file's job specific: prove the APPLY,
// and prove the two things the apply must not break.
//
// EVERY size claim here is `getBoundingClientRect`, never a class name and
// never DOM presence. Under `zoom` those rulers genuinely disagree —
// `offsetWidth` reports the UNZOOMED border box (measured 150 vs 187.5 at
// 125%) — so a suite that asserted "the dock has class X" or read
// `offsetHeight` would pass on an app that visibly did not scale, which is
// exactly the bug being fixed.
import { createShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { INTERFACE_SCALE_STORAGE_KEY, readInterfaceScale } from "@trunk/components/interfaceScale";
import { setInterfaceScalePercent } from "./chrome/ShareMenu";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";

const DOCK = '[data-slot="tool-dock"]';
const FAMILY_TRIGGER = '[data-slot="tool-dock-family"]';
const MENU = '[data-slot="dropdown-menu-content"]';

let app: MountedApp | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
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

/** Set the preference the way the Settings slider does, then wait until the
 *  document has actually been re-stamped and re-painted. A ResizeObserver is
 *  blind to `zoom` (measured: zero callbacks), so nothing else here may wait
 *  on one. */
async function applyScale(percent: number): Promise<void> {
  setInterfaceScalePercent(percent);
  await waitFor(() => document.documentElement.style.getPropertyValue("--ss-interface-scale") === String(percent / 100), {
    what: `--ss-interface-scale to become ${percent / 100}`,
  });
  await nextFrame();
  await nextFrame();
}

/**
 * The element's box once it has STOPPED moving.
 *
 * WHY every measurement here goes through this and not a bare
 * `getBoundingClientRect()`: two things in this app settle a frame or more
 * after the DOM says they exist. The pill's placement resolves in a
 * microtask (`placeFloatingToolbar` is async — chrome/ContextualPopupMenu/floatingToolbar.tsx's
 * STEP 5 pass counter exists because of it), and every Base UI popup opens
 * through a `zoom-in-95` enter animation, which is a real transform and so a
 * real change in the painted rect. Measured once, on a loaded box, both read
 * mid-flight and the assertion missed by 9px. Waiting for two consecutive
 * frames to agree is the cheap fix, and it is a measurement, not a sleep.
 */
async function settledRect(el: Element): Promise<DOMRect> {
  let previous = el.getBoundingClientRect();
  for (let attempt = 0; attempt < 60; attempt++) {
    await nextFrame();
    const now = el.getBoundingClientRect();
    if (Math.abs(now.x - previous.x) < 0.05 && Math.abs(now.y - previous.y) < 0.05
      && Math.abs(now.width - previous.width) < 0.05 && Math.abs(now.height - previous.height) < 0.05) {
      return now;
    }
    previous = now;
  }
  return previous;
}

async function settledHeight(el: Element): Promise<number> {
  return (await settledRect(el)).height;
}

async function dock(): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelector<HTMLElement>(DOCK), { what: "the tool dock" });
}

describe("interface scale — the chrome resizes", () => {
  it("grows the dock by the factor and shrinks it again, MEASURED in painted pixels", async () => {
    app = await mountApp();
    const bar = await dock();

    const base = await settledHeight(bar);
    expect(base, "the dock has a real painted height at 100%").toBeGreaterThan(20);

    await applyScale(150);
    const big = await settledHeight(bar);
    // The number, not a class. 1.5x of a 44px dock is 66px: a 22px change no
    // screenshot could be squinted away.
    expect(big - base, "150% is a MEASURABLE growth, not a re-render").toBeGreaterThan(8);
    expect(big / base, "150% paints the dock at 1.5x").toBeCloseTo(1.5, 2);

    await applyScale(90);
    const small = await settledHeight(bar);
    expect(small, "90% is smaller than 100%").toBeLessThan(base);
    expect(small / base, "90% paints the dock at 0.9x").toBeCloseTo(0.9, 2);

    await applyScale(100);
    expect(await settledHeight(bar), "returning to 100% returns the original pixels").toBeCloseTo(base, 1);
  });

  it("scales a PORTALED popout with the bar that opened it — they live in different trees", async () => {
    // The dock's family popout is a Base UI portal to `document.body`, a
    // SIBLING of the app root, so it inherits nothing from the zoomed layer.
    // Measured before the variables moved to the document element: the dock
    // was 66px at 150% while its own popout stayed 224x148 with a computed
    // `zoom` of exactly "1".
    app = await mountApp();
    const trigger = await waitFor(() => app!.root.querySelector<HTMLElement>(FAMILY_TRIGGER), { what: "a dock family cell" });

    await userEvent.click(trigger);
    const menuAt100 = await waitFor(() => document.querySelector<HTMLElement>(MENU), { what: "the family popout" });
    const base = await settledRect(menuAt100);
    expect(base.height, "the popout has a real painted height").toBeGreaterThan(40);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => document.querySelector(MENU) === null, { what: "the popout to close" });

    await applyScale(150);
    await userEvent.click(trigger);
    const menuAt150 = await waitFor(() => document.querySelector<HTMLElement>(MENU), { what: "the family popout at 150%" });
    const grown = await settledRect(menuAt150);

    // WHY the tolerance is 0.1 and not `toBeCloseTo(1.5, 2)` (= +/-0.005):
    // measured, this assertion is FLAKY at that precision under full-suite
    // load while passing 5/5 three times in isolation. The popout's own height
    // is small and `zoom` makes it land on fractional device pixels, so the
    // RATIO of two rounded measurements wobbles — one observed run read
    // 1.5789 (30/19), which is a sub-pixel artefact, not a scaling bug.
    //
    // 0.1 still fails hard on the thing this test exists to catch: a popout
    // that does not scale at all reads 1.0, and one that scales by the wrong
    // factor reads 1.0 or 2.25. Mutation-tested that way rather than trusted.
    // Tightening this back to 2 decimal places re-introduces the flake.
    const tolerance = 0.1;
    expect(Math.abs(grown.height / base.height - 1.5), "the popout paints at 1.5x too").toBeLessThan(tolerance);
    expect(Math.abs(grown.width / base.width - 1.5), "in both axes").toBeLessThan(tolerance);
  });
});

describe("interface scale — the board does NOT move", () => {
  it("leaves page coordinates, the camera and the canvas box byte-identical at 160%", async () => {
    app = await mountApp();
    const editor = app.editor;
    const id = createShapeId();
    editor.createShape({ id, type: "geo", x: 420, y: 320, props: { w: 220, h: 130, geo: "rectangle" } } as never);
    editor.select(id);
    await nextFrame();

    const canvas = await waitFor(() => app!.root.querySelector<HTMLElement>(".tl-canvas"), { what: "tldraw's canvas" });
    const before = {
      shape: (() => {
        const s = editor.getShape(id) as { x: number; y: number; props: { w: number; h: number } };
        return { x: s.x, y: s.y, w: s.props.w, h: s.props.h };
      })(),
      camera: { ...editor.getCamera() },
      canvas: canvas.getBoundingClientRect().toJSON(),
      screen: { ...editor.getSelectionRotatedScreenBounds()! },
    };

    await applyScale(160);

    const after = {
      shape: (() => {
        const s = editor.getShape(id) as { x: number; y: number; props: { w: number; h: number } };
        return { x: s.x, y: s.y, w: s.props.w, h: s.props.h };
      })(),
      camera: { ...editor.getCamera() },
      canvas: canvas.getBoundingClientRect().toJSON(),
      screen: { ...editor.getSelectionRotatedScreenBounds()! },
    };

    expect(after.shape, "page coordinates are untouched").toEqual(before.shape);
    expect(after.camera.z, "camera zoom is untouched").toBe(before.camera.z);
    expect(after.camera.x, "camera x is untouched").toBe(before.camera.x);
    expect(after.camera.y, "camera y is untouched").toBe(before.camera.y);
    expect(after.canvas, "the canvas box is untouched").toEqual(before.canvas);
    // The selection's SCREEN box is the number the shape's own pixels are
    // drawn against; if the board had scaled, this would have moved.
    expect(after.screen, "the selection paints at the same screen box").toEqual(before.screen);
  });

  it("keeps the selection pill anchored to its selection at every scale", async () => {
    // The pill's position is a per-frame SCREEN measurement painted as an
    // inline `transform: translate(...)`, and `zoom` multiplies a translate —
    // measured, `translate(300px,200px)` inside `zoom:1.25` paints at x=375.
    // `src/interface-scale.css` cancels the layer's zoom on this one element
    // so the anchor survives; this is the assertion that catches it if that
    // rule is ever dropped or the selector drifts.
    app = await mountApp();
    const editor = app.editor;
    const id = createShapeId();
    editor.createShape({ id, type: "geo", x: 420, y: 320, props: { w: 220, h: 130, geo: "rectangle" } } as never);
    editor.select(id);

    const pill = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
      what: "the selection pill",
    });
    const at100 = await settledRect(pill);
    expect(at100.width, "the pill is really painted").toBeGreaterThan(100);

    for (const percent of [150, 160, 90]) {
      await applyScale(percent);
      const now = await settledRect(pill);
      expect(Math.abs(now.x - at100.x), `the pill does not walk horizontally at ${percent}%`).toBeLessThan(1);
      expect(Math.abs(now.y - at100.y), `the pill does not walk vertically at ${percent}%`).toBeLessThan(1);
      // UPDATED DELIBERATELY, which is what the line this replaces asked for.
      // The `scale` prop has since landed on the kit component
      // (`FloatingToolbarProps.scale`), so the pill now GROWS with the rest of
      // the chrome instead of staying at 1:1 — while still not walking off its
      // selection, which the two assertions above are what prove.
      //
      // Both halves are load-bearing and they pull against each other. The
      // scale is composed INSIDE the same transform as the translate, with
      // `transform-origin: 0 0`, precisely so the anchor survives the growth:
      // the standalone `scale:` property composes OUTSIDE `transform` and
      // would re-multiply the translate, moving the pill by (scale - 1) x the
      // offset. If someone "simplifies" it to `scale:`, the x/y assertions
      // above go red, not this one.
      expect(now.height, `the pill grows with the chrome at ${percent}%`).toBeCloseTo(at100.height * (percent / 100), 0);
    }
  });
});

describe("interface scale — the setting persists", () => {
  it("writes the donor's record and re-applies it on a remount", async () => {
    app = await mountApp();
    const bar = await dock();
    const base = await settledHeight(bar);

    await applyScale(125);
    const scaled = await settledHeight(bar);
    expect(scaled / base, "125% is applied").toBeCloseTo(1.25, 2);

    // The durable half: the donor's key, the donor's record shape.
    const raw = window.localStorage.getItem(INTERFACE_SCALE_STORAGE_KEY);
    expect(raw, "the preference reached this browser's storage").not.toBeNull();
    expect(JSON.parse(raw!), "under the donor's own record shape").toEqual({ version: 1, percent: 125 });
    expect(readInterfaceScale(window.localStorage), "and reads back through the shared model").toBe(125);

    // The apply half: unmount tears the variables off the document element, so
    // a remount that did not re-stamp them would come back at 100%.
    app.unmount();
    app = null;
    expect(document.documentElement.style.getPropertyValue("--ss-interface-scale"), "unmount leaves the document clean").toBe("");

    app = await mountApp();
    const remounted = await dock();
    expect(app.root.getAttribute("data-interface-scale"), "the root re-stamps the stored percent").toBe("125");
    expect((await settledHeight(remounted)) / base, "and the chrome comes back at 125%").toBeCloseTo(1.25, 2);
  });
});
