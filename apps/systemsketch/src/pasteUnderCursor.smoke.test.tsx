// src/pasteUnderCursor.smoke.test.tsx — acceptance for the "Copy/paste under
// cursor" switch. Zach, 2026-09-22: "there is the toogle but it doesn't seem to
// work."
//
// Measured off the REAL mounted app (`./testing/harness`'s `mountApp`) and off
// the LIVE editor, never by asserting the control renders: the control already
// rendered perfectly while doing nothing, which is the entire bug. The paste
// half is asserted on tldraw's own user preference — the single value its
// native paste handler reads (`useClipboardEvents.ts:959`) — and the duplicate
// half is asserted as GEOMETRY, because "lands at the pointer" is a spatial
// claim and a spatial claim is measured.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GESTURE_SETTINGS,
  GESTURE_SETTINGS_STORAGE_KEY,
  type GestureSettings,
} from "@trunk/editor/gestureSettings";

import { patchGestureSettings, resetCameraGestureCache } from "./chrome/ShareMenu";
import { userEvent } from "vitest/browser";

import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

// WHY every assertion below reads `getIsPasteAtCursorMode()` and never
// `getUserPreferences().isPasteAtCursorMode`: measured 2026-09-22, the manager's
// `getUserPreferences()` returns a DERIVED record that does not carry this key at
// all (its keys are id, name, locale, color, animationSpeed,
// areKeyboardShortcutsEnabled, isSnapMode, colorScheme, isDarkMode, isWrapMode,
// isDynamicResizeMode, enhancedA11yMode, inputMode, isZoomDirectionInverted) — so
// the raw spelling reads `undefined` whether the preference is set or not, and a
// test written that way is vacuous in both directions. The accessor
// (UserPreferencesManager.ts:147-152) is also the exact call tldraw's own paste
// handler makes, so this asserts the value the FEATURE reads.

let app: MountedApp | null = null;

/** The module store reads storage once per process, so a pre-seeding test must
 *  drop the cache too — same contract as `wheelConvention.smoke.test.tsx`. */
function seed(gestures: Partial<GestureSettings> = {}) {
  window.localStorage.setItem(
    GESTURE_SETTINGS_STORAGE_KEY,
    JSON.stringify({ version: 1, ...DEFAULT_GESTURE_SETTINGS, ...gestures }),
  );
  resetCameraGestureCache();
}

function clear() {
  window.localStorage.removeItem(GESTURE_SETTINGS_STORAGE_KEY);
  resetCameraGestureCache();
}

beforeEach(clear);

afterEach(() => {
  app?.unmount();
  app = null;
  clear();
});

describe("paste under cursor — the canvas obeys the stored switch", () => {
  it("defaults ON, and the default reaches tldraw's own paste preference", async () => {
    // The default is the product's first-run contract, so it is read from the
    // model rather than retyped as `true`.
    expect(DEFAULT_GESTURE_SETTINGS.pasteUnderCursor).toBe(true);
    app = await mountApp();
    expect(app.editor.user.getIsPasteAtCursorMode()).toBe(true);
  });

  it("TRACKS the stored value in both directions — the differential, because the OFF half alone is vacuous", async () => {
    // WHY this is one differential test and not two one-sided ones: tldraw's
    // OWN default for `isPasteAtCursorMode` is `false`
    // (TLUserPreferences.ts:178), so "stored OFF → editor false" passes with
    // the installer deleted — it reads tldraw's default and calls it a result.
    // Mutation-checked 2026-09-22: with the write removed, the one-sided OFF
    // assertion stayed GREEN while this differential goes red on the ON leg.
    // Only "the editor's value MOVES with the stored one" can fail correctly.
    //
    // That inversion is also the bug Zach reported. The kit's default is ON
    // (`DEFAULT_GESTURE_SETTINGS.pasteUnderCursor`), tldraw's is OFF, and with
    // nothing reading the setting the canvas obeyed tldraw — so the switch
    // showed ON while paste landed at the viewport centre.
    seed({ pasteUnderCursor: true });
    app = await mountApp();
    expect(app.editor.user.getIsPasteAtCursorMode()).toBe(true);
    app.unmount();
    app = null;

    seed({ pasteUnderCursor: false });
    app = await mountApp();
    expect(app.editor.user.getIsPasteAtCursorMode()).toBe(false);
  });

  it("follows a LIVE change, with no remount — the Settings dialog writes and closes", async () => {
    app = await mountApp();
    expect(app.editor.user.getIsPasteAtCursorMode()).toBe(true);

    patchGestureSettings({ pasteUnderCursor: false });
    await waitFor(
      () => app?.editor.user.getIsPasteAtCursorMode() === false,
      { what: "the editor picked up the live OFF" },
    );

    patchGestureSettings({ pasteUnderCursor: true });
    await waitFor(
      () => app?.editor.user.getIsPasteAtCursorMode() === true,
      { what: "the editor picked up the live ON" },
    );
  });
});

/**
 * Fire the real `duplicate` command the way a person does — a REAL Ctrl+D
 * through tldraw's own keyboard layer, not by calling the override directly.
 *
 * WHY the round trip matters: the fix is an `overrides.actions` wrapper, so
 * calling `withDuplicateAtPointer` from a test would prove the arithmetic while
 * saying nothing about whether `App.tsx` actually composes it. Pressing the key
 * proves the wiring and the geometry in one shot — and it is the same path the
 * Edit menu item and the shortcuts dialog use, because all three read one
 * action record.
 */
async function runDuplicate(app: MountedApp, before: Set<string>) {
  await userEvent.keyboard("{Control>}d{/Control}");
  await waitFor(
    () => [...app.editor.getCurrentPageShapeIds()].some((id) => !before.has(id)),
    { what: "Ctrl+D created a shape" },
  );
}

describe("duplicate under cursor — the half tldraw has no preference for", () => {
  /** A stock tldraw box at a known page position, selected. Stock `geo` rather
   *  than an app shape so this measures the OFFSET RULE, not a Block's own
   *  layout. Returns its id and page bounds. */
  async function selectedBox(app: MountedApp) {
    const { editor } = app;
    // Focus the board first: tldraw binds its shortcuts to the container, so
    // an unfocused canvas swallows Ctrl+D and the test would time out rather
    // than measure anything.
    canvasOf(app.root).focus();
    editor.createShape({ type: "geo", x: 100, y: 100, props: { w: 80, h: 60 } });
    const id = editor.getCurrentPageShapeIds().values().next().value!;
    editor.select(id);
    const bounds = editor.getShapePageBounds(id)!;
    return { id, bounds };
  }

  /** Put tldraw's input pipeline at a page point, the way `getCurrentPagePoint`
   *  reads it. The camera is pinned at {0,0,z:1} by the harness, so page and
   *  screen coordinates coincide here. */
  async function pointerAt(app: MountedApp, page: { x: number; y: number }) {
    app.editor.dispatch({
      type: "pointer",
      target: "canvas",
      name: "pointer_move",
      point: { x: page.x, y: page.y, z: 0.5 },
      pointerId: 1,
      button: 0,
      isPen: false,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      accelKey: false,
    });
    // WHY this waits rather than reading straight back: `editor.dispatch` QUEUES
    // the event and the pipeline drains it on a tick, so the point is still the
    // old one on the next line. Measured 2026-09-22 — the synchronous read
    // returned {0,0} and this guard is what caught it. Without the guard the
    // ON test would have compared the copy against a stale origin and could
    // have passed for the wrong reason.
    await waitFor(() => {
      const at = app.editor.inputs.getCurrentPagePoint();
      return at.x === page.x && at.y === page.y;
    }, { what: `the pointer reached ${page.x},${page.y}` });
  }

  /** The shape that was NOT there before. */
  function newShapeBounds(app: MountedApp, before: Set<string>) {
    const added = [...app.editor.getCurrentPageShapeIds()].filter((id) => !before.has(id));
    expect(added, "duplicate created exactly one shape").toHaveLength(1);
    return app.editor.getShapePageBounds(added[0]!)!;
  }

  it("ON: the copy's CENTRE lands on the pointer, not beside the original", async () => {
    seed({ pasteUnderCursor: true });
    app = await mountApp();
    const { bounds } = await selectedBox(app);
    await pointerAt(app, { x: 640, y: 480 });

    const before = new Set(app.editor.getCurrentPageShapeIds());
    await runDuplicate(app, before);
    const copy = newShapeBounds(app, before);

    // The spatial claim, measured — not "a second shape exists".
    expect(copy.center.x).toBeCloseTo(640, 6);
    expect(copy.center.y).toBeCloseTo(480, 6);
    // And it is genuinely somewhere else: stock would have put it here.
    expect(copy.center.x).not.toBeCloseTo(bounds.center.x + bounds.width, 1);
  });

  it("OFF: the copy lands BESIDE the original — stock tldraw's own offset, delegated to", async () => {
    seed({ pasteUnderCursor: false });
    app = await mountApp();
    const { bounds } = await selectedBox(app);
    // Pointer parked far away: under OFF it must make no difference at all.
    await pointerAt(app, { x: 640, y: 480 });

    const before = new Set(app.editor.getCurrentPageShapeIds());
    await runDuplicate(app, before);
    const copy = newShapeBounds(app, before);

    // tldraw's rule (actions.tsx:533-536): x += commonBounds.width + margin.
    const margin = app.editor.options.adjacentShapeMargin;
    expect(copy.center.x).toBeCloseTo(bounds.center.x + bounds.width + margin, 6);
    expect(copy.center.y).toBeCloseTo(bounds.center.y, 6);
  });
});
