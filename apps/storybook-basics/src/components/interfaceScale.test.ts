// src/components/interfaceScale.test.ts — ports the donor's own cases
// (/home/bam/systemsketch/src/settings/interfaceScale.test.ts) and adds the
// storage-adapter cases the donor's module-level store made impossible to
// exercise directly: a null storage, a throwing storage, corrupt JSON.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_PRESETS,
  INTERFACE_SCALE_STORAGE_KEY,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  interfaceScaleCssValues,
  normalizeInterfaceScale,
  parseStoredInterfaceScale,
  readInterfaceScale,
  writeInterfaceScale,
} from "./interfaceScale";

describe("interface scale preference", () => {
  it("keeps the donor's storage key, range, step and default", () => {
    expect(INTERFACE_SCALE_STORAGE_KEY).toBe("systemsketch.interface-scale.v1");
    expect(MIN_INTERFACE_SCALE).toBe(80);
    expect(MAX_INTERFACE_SCALE).toBe(160);
    expect(DEFAULT_INTERFACE_SCALE).toBe(100);
    expect(INTERFACE_SCALE_PRESETS).toEqual([90, 100, 110, 125, 150]);
  });

  it("clamps and snaps scale values to safe five-percent increments", () => {
    expect(normalizeInterfaceScale(77)).toBe(80);
    expect(normalizeInterfaceScale(113)).toBe(115);
    expect(normalizeInterfaceScale(999)).toBe(160);
    expect(normalizeInterfaceScale(Number.NaN)).toBe(DEFAULT_INTERFACE_SCALE);
    expect(normalizeInterfaceScale("125")).toBe(DEFAULT_INTERFACE_SCALE);
    expect(normalizeInterfaceScale(undefined)).toBe(DEFAULT_INTERFACE_SCALE);
  });

  it("rejects malformed or unknown stored preference versions", () => {
    expect(parseStoredInterfaceScale({ version: 1, percent: 125 })).toBe(125);
    expect(parseStoredInterfaceScale({ version: 2, percent: 125 })).toBe(DEFAULT_INTERFACE_SCALE);
    expect(parseStoredInterfaceScale("125")).toBe(DEFAULT_INTERFACE_SCALE);
    expect(parseStoredInterfaceScale(null)).toBe(DEFAULT_INTERFACE_SCALE);
    expect(parseStoredInterfaceScale({ version: 1 })).toBe(DEFAULT_INTERFACE_SCALE);
    expect(parseStoredInterfaceScale([1, 2, 3])).toBe(DEFAULT_INTERFACE_SCALE);
  });

  it("provides matching scale and inverse CSS values", () => {
    expect(interfaceScaleCssValues(125)).toEqual({ scale: "1.25", inverse: "0.8" });
  });

  it("round-trips through storage, snapping on write and reading it back", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };

    expect(writeInterfaceScale(storage, 127)).toBe(125);
    expect(JSON.parse(store.get(INTERFACE_SCALE_STORAGE_KEY)!)).toEqual({ version: 1, percent: 125 });
    expect(readInterfaceScale(storage)).toBe(125);
  });

  it("falls back safely for a null, throwing or corrupt storage — never throws", () => {
    expect(readInterfaceScale(null)).toBe(DEFAULT_INTERFACE_SCALE);
    expect(() => writeInterfaceScale(null, 150)).not.toThrow();
    expect(writeInterfaceScale(null, 150)).toBe(150);

    const throwing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readInterfaceScale(throwing)).toBe(DEFAULT_INTERFACE_SCALE);
    expect(() => writeInterfaceScale(throwing, 100)).not.toThrow();
    expect(writeInterfaceScale(throwing, 130)).toBe(130);

    const corrupt = { getItem: () => "{not json", setItem: () => {} };
    expect(readInterfaceScale(corrupt)).toBe(DEFAULT_INTERFACE_SCALE);
  });
});
