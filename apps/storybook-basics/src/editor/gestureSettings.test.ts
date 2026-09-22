// src/editor/gestureSettings.test.ts — ported from
// /home/bam/systemsketch/src/settings/gestureSettings.test.ts (109 lines),
// plus the storage-adapter cases the donor's module-level store made
// impossible to express (it hydrated from `window.localStorage` directly).
// Modelled on this trunk's `appSettings.test.ts` shape.
import { describe, expect, it } from "vitest";

import {
  clampSpeedPercent,
  DEFAULT_GESTURE_SETTINGS,
  GESTURE_SETTINGS_STORAGE_KEY,
  gestureSettingsAreDefault,
  MAX_SPEED_PERCENT,
  MIN_SPEED_PERCENT,
  parseStoredGestureSettings,
  readGestureSettings,
  WHEEL_COMMANDS_IN_MENU_ORDER,
  WHEEL_GESTURES_IN_ORDER,
  writeGestureSettings,
  type GestureSettings,
} from "./gestureSettings";

describe("gesture settings", () => {
  it("defaults to the stock wheel contract, unmodified speed, and paste under cursor on", () => {
    expect(DEFAULT_GESTURE_SETTINGS.bindings).toEqual({
      wheelDown: "pan-down",
      wheelUp: "pan-up",
      ctrlWheelDown: "zoom-out",
      ctrlWheelUp: "zoom-in",
    });
    expect(DEFAULT_GESTURE_SETTINGS.panSpeedPercent).toBe(100);
    expect(DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent).toBe(100);
    expect(DEFAULT_GESTURE_SETTINGS.pasteUnderCursor).toBe(true);
    expect(GESTURE_SETTINGS_STORAGE_KEY).toBe("systemsketch.gestures.v1");
    expect(parseStoredGestureSettings(null)).toEqual(DEFAULT_GESTURE_SETTINGS);
  });

  it("lists gestures and commands in the donor's menu order, not object-key order", () => {
    expect(WHEEL_GESTURES_IN_ORDER).toEqual(["wheelDown", "wheelUp", "ctrlWheelDown", "ctrlWheelUp"]);
    expect(WHEEL_COMMANDS_IN_MENU_ORDER).toEqual([
      "none", "pan-up", "pan-down", "pan-left", "pan-right", "zoom-in", "zoom-out", "undo", "redo",
    ]);
  });

  it("clamps to the supported range, rounds to a whole percent, and rescues a non-finite input", () => {
    expect(clampSpeedPercent(0)).toBe(MIN_SPEED_PERCENT);
    expect(clampSpeedPercent(1000)).toBe(MAX_SPEED_PERCENT);
    expect(clampSpeedPercent(137.6)).toBe(138);
    expect(clampSpeedPercent(Number.NaN)).toBe(100);
    expect(clampSpeedPercent(Number.POSITIVE_INFINITY)).toBe(100);
  });

  it("accepts a fully custom record from the current version", () => {
    expect(parseStoredGestureSettings({
      version: 1,
      pasteUnderCursor: false,
      bindings: { wheelDown: "zoom-in", wheelUp: "zoom-out", ctrlWheelDown: "undo", ctrlWheelUp: "redo" },
      panSpeedPercent: 25,
      zoomSpeedPercent: 300,
    })).toEqual({
      pasteUnderCursor: false,
      bindings: { wheelDown: "zoom-in", wheelUp: "zoom-out", ctrlWheelDown: "undo", ctrlWheelUp: "redo" },
      panSpeedPercent: 25,
      zoomSpeedPercent: 300,
    });
  });

  it("repairs one bad binding without discarding the other three", () => {
    expect(parseStoredGestureSettings({
      version: 1,
      bindings: { wheelDown: "teleport", wheelUp: "zoom-out", ctrlWheelDown: "undo", ctrlWheelUp: "redo" },
    })).toEqual({
      pasteUnderCursor: DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
      bindings: { wheelDown: "pan-down", wheelUp: "zoom-out", ctrlWheelDown: "undo", ctrlWheelUp: "redo" },
      panSpeedPercent: DEFAULT_GESTURE_SETTINGS.panSpeedPercent,
      zoomSpeedPercent: DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
    });
  });

  it("discards a dropped command this product no longer offers, like a page turn, resetting just that binding", () => {
    expect(parseStoredGestureSettings({
      version: 1,
      bindings: { wheelDown: "next-page", wheelUp: "pan-up", ctrlWheelDown: "zoom-out", ctrlWheelUp: "zoom-in" },
    })).toEqual(DEFAULT_GESTURE_SETTINGS);
  });

  it("resets the whole record when a top-level field is present with the wrong type, or the version doesn't match", () => {
    expect(parseStoredGestureSettings({ version: 1, pasteUnderCursor: "yes" })).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(parseStoredGestureSettings({ version: 1, panSpeedPercent: 1000 })).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(parseStoredGestureSettings({ version: 1, bindings: "none" })).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(parseStoredGestureSettings({ version: 2, panSpeedPercent: 150 })).toEqual(DEFAULT_GESTURE_SETTINGS);
    for (const junk of [null, undefined, 3, "gestures", [], true]) {
      expect(parseStoredGestureSettings(junk)).toEqual(DEFAULT_GESTURE_SETTINGS);
    }
  });

  it("defaults a field a stored record predates, rather than discarding the whole record", () => {
    expect(parseStoredGestureSettings({ version: 1, panSpeedPercent: 200 })).toEqual({
      pasteUnderCursor: DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
      bindings: DEFAULT_GESTURE_SETTINGS.bindings,
      panSpeedPercent: 200,
      zoomSpeedPercent: DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
    });
  });

  it("never hands back a frozen object, or a frozen nested bindings, for a caller to mutate", () => {
    for (const value of [null, { version: 1, pasteUnderCursor: "yes" }, { version: 1, panSpeedPercent: 200 }]) {
      const parsed = parseStoredGestureSettings(value);
      expect(Object.isFrozen(parsed)).toBe(false);
      expect(Object.isFrozen(parsed.bindings)).toBe(false);
    }
  });

  it("gestureSettingsAreDefault is true for the defaults and false for each single-field change", () => {
    expect(gestureSettingsAreDefault(DEFAULT_GESTURE_SETTINGS)).toBe(true);
    expect(gestureSettingsAreDefault({ ...DEFAULT_GESTURE_SETTINGS, pasteUnderCursor: false })).toBe(false);
    expect(gestureSettingsAreDefault({ ...DEFAULT_GESTURE_SETTINGS, panSpeedPercent: 150 })).toBe(false);
    expect(gestureSettingsAreDefault({ ...DEFAULT_GESTURE_SETTINGS, zoomSpeedPercent: 150 })).toBe(false);
    for (const gesture of WHEEL_GESTURES_IN_ORDER) {
      const settings: GestureSettings = {
        ...DEFAULT_GESTURE_SETTINGS,
        bindings: { ...DEFAULT_GESTURE_SETTINGS.bindings, [gesture]: "undo" },
      };
      expect(gestureSettingsAreDefault(settings)).toBe(false);
    }
  });

  it("persists under its own storage key and round-trips through a Map-backed fake storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    const custom: GestureSettings = {
      pasteUnderCursor: false,
      bindings: { wheelDown: "zoom-in", wheelUp: "zoom-out", ctrlWheelDown: "pan-down", ctrlWheelUp: "pan-up" },
      panSpeedPercent: 60,
      zoomSpeedPercent: 140,
    };
    writeGestureSettings(storage, custom);
    expect(values.has(GESTURE_SETTINGS_STORAGE_KEY)).toBe(true);
    expect(JSON.parse(values.get(GESTURE_SETTINGS_STORAGE_KEY)!)).toEqual({ version: 1, ...custom });
    expect(readGestureSettings(storage)).toEqual(custom);
  });

  it("falls back safely when storage is unavailable, throwing, null, or malformed — never throws", () => {
    expect(readGestureSettings({ getItem: () => "{bad json" })).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(readGestureSettings({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_GESTURE_SETTINGS);
    expect(readGestureSettings(null)).toEqual(DEFAULT_GESTURE_SETTINGS);

    const throwingWrite = {
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    };
    expect(() => writeGestureSettings(throwingWrite, DEFAULT_GESTURE_SETTINGS)).not.toThrow();
    expect(() => writeGestureSettings(null, DEFAULT_GESTURE_SETTINGS)).not.toThrow();
  });
});
