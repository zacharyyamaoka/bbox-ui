import { describe, expect, it } from "vitest";
import lucideData from "../src/data/lucide-icons.json";
import { buildLucideLibrary, searchLucide, type LucideLibraryEntry } from "../src/lucideLibrary";

function entry(kebab: string, tags: readonly string[] = []): LucideLibraryEntry {
  return { name: kebab, kebab, tags, node: [] };
}

const BOX = entry("box", ["container", "package"]);
const BOXES = entry("boxes");
const SQUARE = entry("square", ["box"]);
const CIRCUIT_BOARD = entry("circuit-board", ["electronics", "board"]);
const WHITEBOARD = entry("whiteboard", ["board"]);
const ENTRIES = [BOX, BOXES, SQUARE, CIRCUIT_BOARD, WHITEBOARD];

describe("searchLucide ranking (ported from SystemSketch's own suite)", () => {
  it("ranks an exact kebab match first, ahead of a prefix match and a tag match", () => {
    const results = searchLucide(ENTRIES, "box");
    expect(results.map((e) => e.kebab)).toEqual(["box", "boxes", "square"]);
  });

  it("matches on a tag when the kebab id does not contain the term", () => {
    const results = searchLucide(ENTRIES, "container");
    expect(results.map((e) => e.kebab)).toEqual(["box"]);
  });

  it("requires every typed word to match (AND), excluding an entry that only matches one term", () => {
    const results = searchLucide(ENTRIES, "circuit board");
    expect(results.map((e) => e.kebab)).toEqual(["circuit-board"]);
  });

  it("returns every entry, in its original order, for an empty query", () => {
    expect(searchLucide(ENTRIES, "")).toEqual(ENTRIES);
    expect(searchLucide(ENTRIES, "   ")).toEqual(ENTRIES);
  });
});

describe("buildLucideLibrary", () => {
  it("indexes entries by kebab (not the PascalCase name) and wires search to the same entries", () => {
    const library = buildLucideLibrary("9.9.9", ENTRIES);
    expect(library.version).toBe("9.9.9");
    expect(library.entries).toBe(ENTRIES);
    expect(library.byKebab.get("box")).toBe(BOX);
    expect(library.byKebab.get("nope")).toBeUndefined();
    expect(library.search("box").map((e) => e.kebab)).toEqual(["box", "boxes", "square"]);
  });
});

/**
 * The real data, not a fixture — this is the acceptance criterion the plan
 * itself names ("'magnifier' finds 'search'"), so it has to run against
 * the actual copied `data/lucide-icons.json`, not a hand-written stand-in.
 */
describe("the real Lucide data", () => {
  const data = lucideData as unknown as { version: string; icons: LucideLibraryEntry[] };
  const library = buildLucideLibrary(data.version, data.icons);

  it("carries all 1,818 icons", () => {
    expect(library.entries.length).toBe(1818);
  });

  it("finds 'search' by its 'magnifier' tag", () => {
    const results = library.search("magnifier");
    expect(results.map((e) => e.kebab)).toContain("search");
  });

  it("resolves a picked kebab name straight back to its node", () => {
    const rocket = library.byKebab.get("rocket");
    expect(rocket).toBeDefined();
    expect(rocket!.node.length).toBeGreaterThan(0);
  });
});
