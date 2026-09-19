// src/backend/backendSetting.test.ts — ACCEPTANCE for the backend setting
// model (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`). RED
// until the lane lands; off-limits to the builder.
import { describe, expect, test } from "vitest";

import {
  BACKEND_SETTING_STORAGE_KEY,
  DEFAULT_PYBLOCKS_URL,
  NO_BACKEND,
  normalizePyblocksUrl,
  parseBackendSetting,
  serializeBackendSetting,
} from "./backendSetting";

describe("normalizePyblocksUrl", () => {
  test("keeps an http(s) origin and drops path, query and trailing slash", () => {
    expect(normalizePyblocksUrl("http://127.0.0.1:4177")).toBe("http://127.0.0.1:4177");
    expect(normalizePyblocksUrl("http://127.0.0.1:4177/")).toBe("http://127.0.0.1:4177");
    expect(normalizePyblocksUrl("http://localhost:4177/api/health?x=1")).toBe("http://localhost:4177");
    expect(normalizePyblocksUrl("  https://example.test  ")).toBe("https://example.test");
  });

  test("refuses anything that is not an http(s) URL", () => {
    expect(normalizePyblocksUrl("")).toBeNull();
    expect(normalizePyblocksUrl("4177")).toBeNull();
    expect(normalizePyblocksUrl("ftp://127.0.0.1")).toBeNull();
    expect(normalizePyblocksUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePyblocksUrl("not a url")).toBeNull();
  });

  test("the default URL is the port pyblocks' own `npm run backend` binds", () => {
    expect(DEFAULT_PYBLOCKS_URL).toBe("http://127.0.0.1:4177");
    expect(normalizePyblocksUrl(DEFAULT_PYBLOCKS_URL)).toBe(DEFAULT_PYBLOCKS_URL);
  });
});

describe("parseBackendSetting", () => {
  test("is total: garbage, null, wrong kinds and bad urls all parse to NO_BACKEND", () => {
    for (const raw of [null, undefined, 0, "x", [], {}, { kind: "gpt" }, { kind: "pyblocks" }, { kind: "pyblocks", url: "nope" }, { kind: "pyblocks", url: 4177 }]) {
      expect(parseBackendSetting(raw)).toEqual(NO_BACKEND);
    }
  });

  test("accepts exactly the two shapes, normalizing the url", () => {
    expect(parseBackendSetting({ kind: "none" })).toEqual({ kind: "none" });
    expect(parseBackendSetting({ kind: "pyblocks", url: "http://127.0.0.1:4177/" })).toEqual({ kind: "pyblocks", url: "http://127.0.0.1:4177" });
  });

  test("round-trips through serialize for both kinds", () => {
    for (const setting of [{ kind: "none" as const }, { kind: "pyblocks" as const, url: "http://localhost:4177" }]) {
      expect(parseBackendSetting(JSON.parse(serializeBackendSetting(setting)))).toEqual(setting);
    }
  });

  test("the storage key is versioned", () => {
    expect(BACKEND_SETTING_STORAGE_KEY).toBe("systemsketch.backend.v1");
  });
});
