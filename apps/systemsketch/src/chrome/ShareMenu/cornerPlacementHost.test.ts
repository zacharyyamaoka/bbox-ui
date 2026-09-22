// src/chrome/ShareMenu/cornerPlacementHost.test.ts — the store behind
// Settings ▸ About ▸ "Bottom-right menu position", proportionate to what it
// is: two pure functions around one boolean.
//
// This file runs in the "unit" vitest project (plain node, no DOM — see
// vitest.config.ts), so it exercises the PURE `readForceCornerPlacement` /
// `writeForceCornerPlacement` against fake `Storage` objects — the same shape
// `src/backend/backend.test.ts` already uses for `readStoredSetting`, because
// there is no real `window.localStorage` to reach for here. Live wiring
// through the real Settings dialog and real storage is
// `../../settings.smoke.test.tsx`'s job (the browser project); this file is
// the model-level half.
import { describe, expect, it } from "vitest";

import { CORNER_PLACEMENT_STORAGE_KEY, getForceCornerPlacement, readForceCornerPlacement, writeForceCornerPlacement } from "./cornerPlacementHost";

/** A storage that answers, mirroring `backend.test.ts`'s `memoryStorage`. */
function memoryStorage(seed?: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** A storage that throws on every call — a private window, blocked site
 *  data, or a hostile third-party context. */
function throwingStorage(): Storage {
  return {
    get length(): number {
      throw new Error("blocked");
    },
    clear: () => {
      throw new Error("blocked");
    },
    getItem: () => {
      throw new Error("blocked");
    },
    key: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

describe("corner placement — off by default, an explicit opt-in that persists", () => {
  it("defaults to false: missing storage, an empty entry, and no storage at all", () => {
    expect(readForceCornerPlacement(memoryStorage())).toBe(false);
    expect(readForceCornerPlacement(null)).toBe(false);
    expect(readForceCornerPlacement(undefined)).toBe(false);
    // The real store's own read path, with no `window` to reach for in this
    // node-only project — proves it degrades to the same safe default rather
    // than throwing.
    expect(getForceCornerPlacement()).toBe(false);
  });

  it("writing true persists under the .v1 key, and a fresh read off the same storage reflects it", () => {
    const storage = memoryStorage();
    writeForceCornerPlacement(storage, true);
    expect(storage.getItem(CORNER_PLACEMENT_STORAGE_KEY)).toBe("true");
    expect(readForceCornerPlacement(storage)).toBe(true);

    writeForceCornerPlacement(storage, false);
    expect(storage.getItem(CORNER_PLACEMENT_STORAGE_KEY)).toBe("false");
    expect(readForceCornerPlacement(storage)).toBe(false);
  });

  it("an invalid or corrupt stored value falls back to false rather than throwing", () => {
    expect(readForceCornerPlacement(memoryStorage({ [CORNER_PLACEMENT_STORAGE_KEY]: "not a boolean" }))).toBe(false);
    expect(readForceCornerPlacement(memoryStorage({ [CORNER_PLACEMENT_STORAGE_KEY]: "1" }))).toBe(false);
    expect(readForceCornerPlacement(memoryStorage({ [CORNER_PLACEMENT_STORAGE_KEY]: "" }))).toBe(false);
    expect(() => readForceCornerPlacement(throwingStorage())).not.toThrow();
    expect(readForceCornerPlacement(throwingStorage())).toBe(false);
    expect(() => writeForceCornerPlacement(throwingStorage(), true)).not.toThrow();
  });
});
