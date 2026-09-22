// src/wheelConvention.smoke.test.tsx — acceptance for ruling 2: the wheel/zoom
// mapping is a SETTING, and the canvas obeys it.
//
// Measured off the REAL mounted app (`./testing/harness`'s `mountApp`) and off
// the LIVE editor — `editor.getCameraOptions()` and
// `editor.user.getUserPreferences()` — never by asserting a control is present.
// Every expected number is derived from the preference's own exported
// arithmetic (`cameraGesturePlan`), never retyped.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  type AppearancePreferences,
} from "@trunk/editor/appearancePreferences";
import { cameraGesturePlan, wheelConventionOf } from "@trunk/editor/cameraGestures";
import {
  DEFAULT_GESTURE_SETTINGS,
  GESTURE_SETTINGS_STORAGE_KEY,
  MAX_SPEED_PERCENT,
  type GestureSettings,
} from "@trunk/editor/gestureSettings";

import { patchAppearancePreferences, resetCameraGestureCache } from "./chrome/ShareMenu";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

/** Both records are read ONCE per process by the module store, so a test that
 *  pre-seeds storage must also drop the cache — that is what
 *  `resetCameraGestureCache` exists for. */
function seed(appearance: Partial<AppearancePreferences>, gestures: Partial<GestureSettings> = {}) {
  window.localStorage.setItem(
    APPEARANCE_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ version: 1, ...DEFAULT_APPEARANCE_PREFERENCES, ...appearance }),
  );
  window.localStorage.setItem(
    GESTURE_SETTINGS_STORAGE_KEY,
    JSON.stringify({ version: 1, ...DEFAULT_GESTURE_SETTINGS, ...gestures }),
  );
  resetCameraGestureCache();
}

function clear() {
  window.localStorage.removeItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
  window.localStorage.removeItem(GESTURE_SETTINGS_STORAGE_KEY);
  resetCameraGestureCache();
}

beforeEach(clear);

afterEach(() => {
  app?.unmount();
  app = null;
  clear();
});

describe("wheel convention — the canvas obeys the stored preference", () => {
  it("with nothing stored, the canvas is on the stock whiteboard contract: wheel pans, and both speeds are stock", async () => {
    app = await mountApp();
    const plan = cameraGesturePlan(DEFAULT_APPEARANCE_PREFERENCES, DEFAULT_GESTURE_SETTINGS);
    expect(plan.wheelBehavior).toBe("pan");

    const camera = app.editor.getCameraOptions();
    expect(camera.wheelBehavior).toBe(plan.wheelBehavior);
    expect(camera.panSpeed).toBe(plan.panSpeed);
    expect(camera.zoomSpeed).toBe(plan.zoomSpeed);
  });

  it("the stored `zoom` convention reaches BOTH seams — the camera option and tldraw's overriding inputMode", async () => {
    // The override is the whole reason this takes two calls: tldraw 5.3.2's
    // wheel handler replaces `wheelBehavior` outright whenever `inputMode` is
    // non-null (Editor.js:8147-8149). A test that only read `wheelBehavior`
    // would pass while the setting was dead.
    seed({ directWheelZoom: true });
    app = await mountApp();

    expect(wheelConventionOf({ directWheelZoom: true })).toBe("zoom");
    expect(app.editor.getCameraOptions().wheelBehavior).toBe("zoom");
    expect(app.editor.user.getUserPreferences().inputMode).toBe("mouse");
  });

  it("the stored `pan` convention pins inputMode to the value that AGREES with it, rather than leaving the override live", async () => {
    seed({ directWheelZoom: false });
    app = await mountApp();

    expect(app.editor.getCameraOptions().wheelBehavior).toBe("pan");
    expect(app.editor.user.getUserPreferences().inputMode).toBe("trackpad");
  });

  it("`scroll down to zoom in`, turned off, inverts the direction — and only the zoom convention can", async () => {
    seed({ directWheelZoom: true, scrollDownZoomsIn: false });
    app = await mountApp();
    expect(app.editor.user.getUserPreferences().isZoomDirectionInverted).toBe(true);

    app.unmount();
    app = null;
    // Under `pan` the plain wheel never zooms, so the same stored `false` must
    // NOT reach the editor: `cameraGesturePlan` reports `invertZoomDirection:
    // false` there, and the canvas must match its own plan.
    seed({ directWheelZoom: false, scrollDownZoomsIn: false });
    app = await mountApp();
    expect(app.editor.user.getUserPreferences().isZoomDirectionInverted).toBe(false);
  });

  it("the speed sliders reach the camera, each convention reading the slider its settings page actually shows", async () => {
    seed({ directWheelZoom: false }, { panSpeedPercent: MAX_SPEED_PERCENT, zoomSpeedPercent: 50 });
    app = await mountApp();
    const expected = cameraGesturePlan(
      { ...DEFAULT_APPEARANCE_PREFERENCES, directWheelZoom: false },
      { ...DEFAULT_GESTURE_SETTINGS, panSpeedPercent: MAX_SPEED_PERCENT, zoomSpeedPercent: 50 },
    );
    const camera = app.editor.getCameraOptions();
    expect(camera.panSpeed).toBe(expected.panSpeed);
    expect(camera.zoomSpeed).toBe(expected.zoomSpeed);
  });

  it("changing the preference at RUNTIME moves the canvas — no reload, which is the bug this lane exists to end", async () => {
    app = await mountApp();
    expect(app.editor.getCameraOptions().wheelBehavior).toBe("pan");

    // Exactly what the Settings radio row calls.
    patchAppearancePreferences({ directWheelZoom: true });

    const mounted = app;
    await waitFor(
      () => (mounted.editor.getCameraOptions().wheelBehavior === "zoom" ? true : null),
      { what: "the camera to pick up the new wheel convention" },
    );
    expect(mounted.editor.user.getUserPreferences().inputMode).toBe("mouse");
  });
});
