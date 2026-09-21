// src/components/cameraGestures.test.ts — the translation, pinned against the
// two persisted records' OWN exported defaults and bounds, never a retyped
// number.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPEARANCE_PREFERENCES,
  MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  type AppearancePreferences,
} from "./appearancePreferences";
import {
  DEFAULT_GESTURE_SETTINGS,
  MAX_SPEED_PERCENT,
  MIN_SPEED_PERCENT,
  type GestureSettings,
} from "./gestureSettings";
import {
  WHEEL_CONVENTIONS_IN_ORDER,
  WHEEL_CONVENTION_DESCRIPTIONS,
  WHEEL_CONVENTION_LABELS,
  appearanceForWheelConvention,
  cameraGesturePlan,
  wheelConventionOf,
} from "./cameraGestures";

function appearance(patch: Partial<AppearancePreferences> = {}): AppearancePreferences {
  return { ...DEFAULT_APPEARANCE_PREFERENCES, ...patch };
}

function gestures(patch: Partial<GestureSettings> = {}): GestureSettings {
  return { ...DEFAULT_GESTURE_SETTINGS, bindings: { ...DEFAULT_GESTURE_SETTINGS.bindings }, ...patch };
}

describe("wheelConventionOf — the stored boolean, read as a named convention", () => {
  it("the SHIPPED default is the stock whiteboard contract, not direct zoom", () => {
    expect(DEFAULT_APPEARANCE_PREFERENCES.directWheelZoom).toBe(false);
    expect(wheelConventionOf(DEFAULT_APPEARANCE_PREFERENCES)).toBe("pan");
  });

  it("direct wheel zoom reads as `zoom`", () => {
    expect(wheelConventionOf(appearance({ directWheelZoom: true }))).toBe("zoom");
  });

  it("round-trips through `appearanceForWheelConvention` for BOTH offered conventions", () => {
    for (const convention of WHEEL_CONVENTIONS_IN_ORDER) {
      expect(wheelConventionOf(appearanceForWheelConvention(convention))).toBe(convention);
    }
  });

  it("both conventions are offered, each with its own label and description", () => {
    expect([...WHEEL_CONVENTIONS_IN_ORDER]).toEqual(["pan", "zoom"]);
    const labels = WHEEL_CONVENTIONS_IN_ORDER.map((c) => WHEEL_CONVENTION_LABELS[c]);
    expect(new Set(labels).size).toBe(WHEEL_CONVENTIONS_IN_ORDER.length);
    for (const convention of WHEEL_CONVENTIONS_IN_ORDER) {
      expect(WHEEL_CONVENTION_DESCRIPTIONS[convention].length).toBeGreaterThan(0);
    }
  });
});

describe("cameraGesturePlan — which slider each convention actually reads", () => {
  it("at the factory defaults every speed is exactly stock (1), so a fresh load behaves as before", () => {
    const plan = cameraGesturePlan(DEFAULT_APPEARANCE_PREFERENCES, DEFAULT_GESTURE_SETTINGS);
    expect(plan).toEqual({ wheelBehavior: "pan", invertZoomDirection: false, panSpeed: 1, zoomSpeed: 1 });
  });

  it("under `pan`, zoom speed comes from the GESTURES slider — the one the settings page shows in that mode", () => {
    const plan = cameraGesturePlan(
      appearance({ directWheelZoom: false, wheelZoomSensitivityPercent: MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT }),
      gestures({ zoomSpeedPercent: MIN_SPEED_PERCENT, panSpeedPercent: MAX_SPEED_PERCENT }),
    );
    expect(plan.zoomSpeed).toBe(MIN_SPEED_PERCENT / 100);
    expect(plan.panSpeed).toBe(MAX_SPEED_PERCENT / 100);
  });

  it("under `zoom`, zoom speed comes from the APPEARANCE slider instead — and pan speed still comes from gestures", () => {
    const plan = cameraGesturePlan(
      appearance({ directWheelZoom: true, wheelZoomSensitivityPercent: MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT }),
      gestures({ zoomSpeedPercent: MIN_SPEED_PERCENT, panSpeedPercent: MAX_SPEED_PERCENT }),
    );
    expect(plan.zoomSpeed).toBe(MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT / 100);
    expect(plan.panSpeed).toBe(MAX_SPEED_PERCENT / 100);
  });

  it("`scrollDownZoomsIn` inverts, and ONLY under the zoom convention", () => {
    expect(cameraGesturePlan(appearance({ directWheelZoom: true, scrollDownZoomsIn: true }), gestures()).invertZoomDirection).toBe(false);
    expect(cameraGesturePlan(appearance({ directWheelZoom: true, scrollDownZoomsIn: false }), gestures()).invertZoomDirection).toBe(true);
    // Under `pan` the plain wheel never zooms, so there is no direction to
    // invert — reporting `true` here would flip Ctrl+wheel for no reason.
    expect(cameraGesturePlan(appearance({ directWheelZoom: false, scrollDownZoomsIn: false }), gestures()).invertZoomDirection).toBe(false);
  });

  it("the convention in the plan is the one `wheelConventionOf` names, for both", () => {
    for (const convention of WHEEL_CONVENTIONS_IN_ORDER) {
      const prefs = appearance(appearanceForWheelConvention(convention));
      expect(cameraGesturePlan(prefs, gestures()).wheelBehavior).toBe(convention);
    }
  });
});
