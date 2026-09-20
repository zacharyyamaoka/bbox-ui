// src/components/appearancePreferences.test.ts — ports the donor's own
// cases (/home/bam/systemsketch/src/settings/appearancePreferences.test.ts)
// and adds the storage-adapter cases the donor's module-level store made
// impossible to exercise directly: a null storage, a throwing storage, and
// mutating a returned default.
import { describe, expect, it } from "vitest";

import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  WHEEL_ZOOM_SENSITIVITY_STEP,
  parseStoredAppearancePreferences,
  readAppearancePreferences,
  writeAppearancePreferences,
} from "./appearancePreferences";

describe("appearance preferences (wheel/zoom input behaviour)", () => {
  it("keeps the donor's storage key, defaults and sensitivity range", () => {
    expect(APPEARANCE_PREFERENCES_STORAGE_KEY).toBe("systemsketch.appearance.v1");
    expect(DEFAULT_APPEARANCE_PREFERENCES).toEqual({
      showZoomButtons: false,
      directWheelZoom: false,
      scrollDownZoomsIn: true,
      modifierWheelZoomsOppositely: false,
      wheelZoomSensitivityPercent: 100,
    });
    expect(DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT).toBe(100);
    expect(MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT).toBe(50);
    expect(MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT).toBe(150);
    expect(WHEEL_ZOOM_SENSITIVITY_STEP).toBe(5);
  });

  it("accepts only the current version with well-typed fields", () => {
    expect(parseStoredAppearancePreferences({
      version: 1,
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 125,
    })).toEqual({
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 125,
    });

    for (const junk of [null, undefined, 3, "native", [], ["native"], true, { version: 2, showZoomButtons: true }]) {
      expect(parseStoredAppearancePreferences(junk)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    }
  });

  it("resets the WHOLE record when a present field has the wrong type", () => {
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: "yes" }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseStoredAppearancePreferences({ version: 1, scrollDownZoomsIn: "yes" }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseStoredAppearancePreferences({ version: 1, modifierWheelZoomsOppositely: "yes" }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseStoredAppearancePreferences({ version: 1, directWheelZoom: "yes" }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseStoredAppearancePreferences({ version: 1, wheelZoomSensitivityPercent: 153 }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    // Present but off the five-percent step, and present but non-integer.
    expect(parseStoredAppearancePreferences({ version: 1, wheelZoomSensitivityPercent: 101 }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parseStoredAppearancePreferences({ version: 1, wheelZoomSensitivityPercent: 100.5 }))
      .toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it("falls back for a single UNDEFINED field only, keeping the rest of the record", () => {
    // Simulates an older localStorage record: its saved value must survive
    // while a newly introduced field receives its own default.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true }))
      .toEqual({
        showZoomButtons: true,
        directWheelZoom: false,
        scrollDownZoomsIn: true,
        modifierWheelZoomsOppositely: false,
        wheelZoomSensitivityPercent: 100,
      });
  });

  it("ignores a stored key the current schema no longer defines", () => {
    // Simulates a record written before a preference was retired: the extra
    // key must not corrupt or reset the rest of the record.
    expect(parseStoredAppearancePreferences({ version: 1, showZoomButtons: true, punctuatedPortRow: false }))
      .toEqual({
        showZoomButtons: true,
        directWheelZoom: false,
        scrollDownZoomsIn: true,
        modifierWheelZoomsOppositely: false,
        wheelZoomSensitivityPercent: 100,
      });
  });

  it("persists under the app-level appearance key and round-trips", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };

    writeAppearancePreferences(storage, {
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 75,
    });
    expect(JSON.parse(store.get(APPEARANCE_PREFERENCES_STORAGE_KEY)!)).toEqual({
      version: 1,
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 75,
    });
    expect(readAppearancePreferences(storage)).toEqual({
      showZoomButtons: true,
      directWheelZoom: true,
      scrollDownZoomsIn: false,
      modifierWheelZoomsOppositely: true,
      wheelZoomSensitivityPercent: 75,
    });
  });

  it("falls back safely for a null, throwing or corrupt storage — never throws", () => {
    expect(readAppearancePreferences(null)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(() => writeAppearancePreferences(null, DEFAULT_APPEARANCE_PREFERENCES)).not.toThrow();

    const corrupt = { getItem: () => "{bad json", setItem: () => {} };
    expect(readAppearancePreferences(corrupt)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);

    const throwing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readAppearancePreferences(throwing)).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(() => writeAppearancePreferences(throwing, DEFAULT_APPEARANCE_PREFERENCES)).not.toThrow();
  });

  it("never hands back the frozen default object for a caller to mutate", () => {
    expect(Object.isFrozen(DEFAULT_APPEARANCE_PREFERENCES)).toBe(true);

    const parsed = parseStoredAppearancePreferences(null);
    expect(parsed).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
    expect(parsed).not.toBe(DEFAULT_APPEARANCE_PREFERENCES);
    expect(Object.isFrozen(parsed)).toBe(false);
    expect(() => {
      parsed.showZoomButtons = true;
    }).not.toThrow();

    const read = readAppearancePreferences(null);
    expect(read).not.toBe(DEFAULT_APPEARANCE_PREFERENCES);
    expect(Object.isFrozen(read)).toBe(false);
  });
});
