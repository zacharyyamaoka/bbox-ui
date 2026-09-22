// src/editor/appSettings.test.ts — ACCEPTANCE committed by the planning
// lane of docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits
// to lane `settings-kit`.
import { describe, expect, it } from "vitest";

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  readAppSettings,
  serializeAppSettings,
  writeAppSettings,
  type AppSettings,
} from "./appSettings";

describe("app settings", () => {
  it("defaults to the app navigator and a dialog — the old app's behaviour", () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({ fileNavigation: "app", settingsPresentation: "dialog" });
    expect(APP_SETTINGS_STORAGE_KEY).toBe("systemsketch.settings.v1");
  });

  it("round-trips every legal combination", () => {
    for (const fileNavigation of ["app", "native"] as const) {
      for (const settingsPresentation of ["dialog", "page"] as const) {
        const settings: AppSettings = { fileNavigation, settingsPresentation };
        expect(parseAppSettings(JSON.parse(serializeAppSettings(settings)))).toEqual(settings);
      }
    }
  });

  it("falls back per FIELD, never throwing and never letting one bad field reset its sibling", () => {
    expect(parseAppSettings({ fileNavigation: "native", settingsPresentation: "sheet" })).toEqual({ fileNavigation: "native", settingsPresentation: "dialog" });
    expect(parseAppSettings({ fileNavigation: 7, settingsPresentation: "page" })).toEqual({ fileNavigation: "app", settingsPresentation: "page" });
    expect(parseAppSettings({ settingsPresentation: "page", extra: true })).toEqual({ fileNavigation: "app", settingsPresentation: "page" });
    for (const junk of [null, undefined, 3, "native", [], ["native"], true]) {
      expect(parseAppSettings(junk)).toEqual(DEFAULT_APP_SETTINGS);
    }
  });

  it("never hands out the frozen default object for a caller to mutate", () => {
    const parsed = parseAppSettings(null);
    expect(parsed).toEqual(DEFAULT_APP_SETTINGS);
    expect(Object.isFrozen(parsed)).toBe(false);
  });

  it("reads and writes through storage, surviving a missing, throwing or corrupt one", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    writeAppSettings(storage, { fileNavigation: "native", settingsPresentation: "page" });
    expect(JSON.parse(store.get(APP_SETTINGS_STORAGE_KEY)!)).toEqual({ fileNavigation: "native", settingsPresentation: "page" });
    expect(readAppSettings(storage)).toEqual({ fileNavigation: "native", settingsPresentation: "page" });

    store.set(APP_SETTINGS_STORAGE_KEY, "{not json");
    expect(readAppSettings(storage)).toEqual(DEFAULT_APP_SETTINGS);
    expect(readAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readAppSettings(throwing)).toEqual(DEFAULT_APP_SETTINGS);
    expect(() => writeAppSettings(throwing, DEFAULT_APP_SETTINGS)).not.toThrow();
    expect(() => writeAppSettings(null, DEFAULT_APP_SETTINGS)).not.toThrow();
  });
});
