// src/components/toolAliases.test.ts — the acceptance for the ported tool
// alias vocabulary. The donor (/home/bam/systemsketch/src/library/toolAliases.ts)
// has its own test file, but it only covers normalization and the storage
// round-trip against the donor's mutating, singleton-backed API; the pure
// `addToolAlias`/`removeToolAlias`/`toolAliasItemMatches`/`filterToolAliasItems`
// surface this port adds has no donor test to draw from, so this file is
// written fresh against the contract in `toolAliases.ts`.
import { describe, expect, it } from "vitest";

import {
  EMPTY_TOOL_ALIASES,
  MAX_TOOL_ALIAS_LENGTH,
  TOOL_ALIASES_STORAGE_KEY,
  addToolAlias,
  filterToolAliasItems,
  normalizeToolAlias,
  normalizeToolAliases,
  parseStoredToolAliases,
  readToolAliases,
  removeToolAlias,
  toolAliasItemMatches,
  writeToolAliases,
  type ToolAliasItem,
  type ToolAliases,
} from "./toolAliases";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("tool alias constants", () => {
  it("keeps the donor's exact storage key and length cap", () => {
    expect(TOOL_ALIASES_STORAGE_KEY).toBe("systemsketch.tool-aliases.v1");
    expect(MAX_TOOL_ALIAS_LENGTH).toBe(64);
  });

  it("EMPTY_TOOL_ALIASES is frozen and empty", () => {
    expect(EMPTY_TOOL_ALIASES).toEqual({});
    expect(Object.isFrozen(EMPTY_TOOL_ALIASES)).toBe(true);
  });
});

describe("normalizeToolAlias", () => {
  it("trims and collapses internal whitespace runs to one space", () => {
    expect(normalizeToolAlias("  a   b ")).toBe("a b");
    expect(normalizeToolAlias("  intent   label ")).toBe("intent label");
  });

  it("keeps a handle's case and punctuation intact", () => {
    expect(normalizeToolAlias("  @datatype  ")).toBe("@datatype");
    expect(normalizeToolAlias("MixedCase")).toBe("MixedCase");
  });

  it("rejects empty, whitespace-only, non-string, and over-length values", () => {
    expect(normalizeToolAlias("")).toBeNull();
    expect(normalizeToolAlias("   ")).toBeNull();
    expect(normalizeToolAlias(42)).toBeNull();
    expect(normalizeToolAlias(null)).toBeNull();
    expect(normalizeToolAlias(undefined)).toBeNull();
    expect(normalizeToolAlias("x".repeat(MAX_TOOL_ALIAS_LENGTH + 1))).toBeNull();
  });

  it("accepts exactly the length cap", () => {
    const exact = "x".repeat(MAX_TOOL_ALIAS_LENGTH);
    expect(normalizeToolAlias(exact)).toBe(exact);
  });
});

describe("normalizeToolAliases", () => {
  it("drops a non-array alias list, an empty tool id, and a tool left with no aliases", () => {
    expect(
      normalizeToolAliases({
        text: [" @datatype ", 42, "type"],
        rectangle: "not an array",
        "": ["orphan"],
        empty: [],
        allInvalid: ["", "   ", 7],
      }),
    ).toEqual({ text: ["@datatype", "type"] });
  });

  it("de-duplicates case-insensitively within one tool, keeping insertion order", () => {
    expect(normalizeToolAliases({ text: ["@datatype", "@DataType", "type", "@datatype"] })).toEqual({
      text: ["@datatype", "type"],
    });
  });

  it("is accent-sensitive, not just case-insensitive: café and cafe both survive", () => {
    expect(normalizeToolAliases({ text: ["cafe", "café", "CAFE"] })).toEqual({ text: ["cafe", "café"] });
  });

  it("rejects non-record input", () => {
    for (const junk of [null, undefined, 3, "text", [], true]) {
      expect(normalizeToolAliases(junk)).toEqual({});
    }
  });
});

describe("parseStoredToolAliases", () => {
  it("rejects a wrong version", () => {
    expect(parseStoredToolAliases({ version: 2, aliases: { text: ["@datatype"] } })).toEqual({});
  });

  it("rejects a non-record and junk", () => {
    for (const junk of [null, undefined, 3, "oops", [], true]) {
      expect(parseStoredToolAliases(junk)).toEqual({});
    }
  });

  it("accepts version 1 and normalizes its aliases", () => {
    expect(parseStoredToolAliases({ version: 1, aliases: { text: [" @datatype ", "@datatype"] } })).toEqual({
      text: ["@datatype"],
    });
  });
});

describe("addToolAlias", () => {
  it("appends a new alias to an existing tool", () => {
    const start: ToolAliases = { text: ["@datatype"] };
    expect(addToolAlias(start, "text", "type")).toEqual({ text: ["@datatype", "type"] });
  });

  it("creates a tool entry when the tool had no aliases yet", () => {
    expect(addToolAlias(EMPTY_TOOL_ALIASES, "diamond", "decision-point")).toEqual({
      diamond: ["decision-point"],
    });
  });

  it("returns null for an invalid alias", () => {
    expect(addToolAlias(EMPTY_TOOL_ALIASES, "text", "")).toBeNull();
    expect(addToolAlias(EMPTY_TOOL_ALIASES, "text", "   ")).toBeNull();
    expect(addToolAlias(EMPTY_TOOL_ALIASES, "text", "x".repeat(MAX_TOOL_ALIAS_LENGTH + 1))).toBeNull();
  });

  it("returns null for an empty tool id", () => {
    expect(addToolAlias(EMPTY_TOOL_ALIASES, "", "type")).toBeNull();
  });

  it("returns null for a case-insensitive duplicate", () => {
    const start: ToolAliases = { text: ["@datatype"] };
    expect(addToolAlias(start, "text", "@DataType")).toBeNull();
  });

  it("does not mutate the input map", () => {
    const start: ToolAliases = { text: ["@datatype"] };
    const snapshot = JSON.parse(JSON.stringify(start));
    addToolAlias(start, "text", "type");
    expect(start).toEqual(snapshot);
  });
});

describe("removeToolAlias", () => {
  it("removes one alias, leaving the rest", () => {
    const start: ToolAliases = { text: ["@datatype", "type"] };
    expect(removeToolAlias(start, "text", "@datatype")).toEqual({ text: ["type"] });
  });

  it("deletes the tool key entirely when its last alias goes", () => {
    const start: ToolAliases = { text: ["@datatype"], diamond: ["decision-point"] };
    expect(removeToolAlias(start, "text", "@datatype")).toEqual({ diamond: ["decision-point"] });
  });

  it("returns the SAME reference when the alias was not there", () => {
    const start: ToolAliases = { text: ["@datatype"] };
    expect(removeToolAlias(start, "text", "nope")).toBe(start);
    expect(removeToolAlias(start, "missingTool", "nope")).toBe(start);
  });

  it("does not mutate the input map", () => {
    const start: ToolAliases = { text: ["@datatype", "type"] };
    const snapshot = JSON.parse(JSON.stringify(start));
    removeToolAlias(start, "text", "@datatype");
    expect(start).toEqual(snapshot);
  });
});

describe("toolAliasItemMatches / filterToolAliasItems", () => {
  const items: ToolAliasItem[] = [
    { id: "text", label: "Text", detail: "Toolbar tool" },
    { id: "diamond", label: "Diamond", detail: "Toolbar tool" },
    { id: "rectangle", label: "Rectangle", detail: "Toolbar tool" },
  ];
  const aliases: ToolAliases = { text: ["@datatype"], diamond: ["decision-point"] };

  it("matches on a label substring, case-insensitively", () => {
    expect(toolAliasItemMatches(items[0], "tex", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[0], "TEX", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[2], "tex", aliases)).toBe(false);
  });

  it("matches on an alias substring, case-insensitively", () => {
    expect(toolAliasItemMatches(items[0], "datatype", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[0], "@DATA", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[1], "decision", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[2], "decision", aliases)).toBe(false);
  });

  it("a blank query matches every item", () => {
    expect(toolAliasItemMatches(items[2], "", aliases)).toBe(true);
    expect(toolAliasItemMatches(items[2], "   ", aliases)).toBe(true);
  });

  it("filterToolAliasItems returns every item, in order, for a blank query", () => {
    expect(filterToolAliasItems(items, "", aliases)).toEqual(items);
    expect(filterToolAliasItems(items, "   ", aliases)).toEqual(items);
  });

  it("filterToolAliasItems narrows to matches, preserving order", () => {
    // "e" matches "Text" and "Rectangle" by label, and "diamond" by its
    // "decision-point" alias — all three survive, in the given order.
    expect(filterToolAliasItems(items, "e", aliases).map((item) => item.id)).toEqual(["text", "diamond", "rectangle"]);
    expect(filterToolAliasItems(items, "rect", aliases).map((item) => item.id)).toEqual(["rectangle"]);
    expect(filterToolAliasItems(items, "decision", aliases).map((item) => item.id)).toEqual(["diamond"]);
    expect(filterToolAliasItems(items, "nomatch", aliases)).toEqual([]);
  });
});

describe("readToolAliases / writeToolAliases", () => {
  it("round-trips through a Map-backed fake storage", () => {
    const storage = memoryStorage();
    const written = writeToolAliases(storage, { text: ["@datatype"], diamond: ["decision-point"] });
    expect(written).toEqual({ text: ["@datatype"], diamond: ["decision-point"] });
    expect(storage.getItem(TOOL_ALIASES_STORAGE_KEY)).toBe(
      '{"version":1,"aliases":{"text":["@datatype"],"diamond":["decision-point"]}}',
    );
    expect(readToolAliases(storage)).toEqual({ text: ["@datatype"], diamond: ["decision-point"] });
  });

  it("writeToolAliases returns the NORMALIZED value actually stored", () => {
    const storage = memoryStorage();
    const written = writeToolAliases(storage, { text: [" @datatype ", "@datatype"], empty: [] });
    expect(written).toEqual({ text: ["@datatype"] });
    expect(readToolAliases(storage)).toEqual({ text: ["@datatype"] });
  });

  it("readToolAliases handles a null storage, corrupt JSON, and a missing key", () => {
    expect(readToolAliases(null)).toEqual(EMPTY_TOOL_ALIASES);
    const storage = memoryStorage({ [TOOL_ALIASES_STORAGE_KEY]: "{oops" });
    expect(readToolAliases(storage)).toEqual(EMPTY_TOOL_ALIASES);
    expect(readToolAliases(memoryStorage())).toEqual(EMPTY_TOOL_ALIASES);
  });

  it("readToolAliases and writeToolAliases never throw on a throwing storage", () => {
    const throwing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readToolAliases(throwing)).toEqual(EMPTY_TOOL_ALIASES);
    expect(() => writeToolAliases(throwing, { text: ["@datatype"] })).not.toThrow();
  });

  it("writeToolAliases with a null storage still returns the normalized value and never throws", () => {
    expect(() => writeToolAliases(null, { text: ["@datatype"] })).not.toThrow();
    expect(writeToolAliases(null, { text: [" @datatype ", "@datatype"] })).toEqual({ text: ["@datatype"] });
  });
});
