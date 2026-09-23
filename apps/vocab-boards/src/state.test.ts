import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  anchoredBucket,
  buildBoardHash,
  buildHomeHash,
  buildScenarioHash,
  buildVocabHash,
  filterQueryOf,
  matchesFilters,
  parseHash,
  parseQuery,
  serializeQuery,
  toggleInList,
  type FilterState,
} from "./state";

/**
 * `state.ts` is the whole reason a filtered view survives Back and a reload:
 * the hash query IS the filter. These are the assertions that would go red if
 * that stopped being true — a round trip that loses a key, a route that stops
 * parsing, or an anchor leaking into the list hash.
 */

const item = (over: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  haystack: "b1__b0__ex1 b1 function definition block titled node labview",
  members: ["labview", "simulink"],
  sectionId: "g-boundary",
  kind: "Block",
  ...over,
});

describe("parseQuery / serializeQuery", () => {
  it("round-trips every key", () => {
    const state: FilterState = {
      q: "labview",
      vocab: ["labview", "simulink"],
      section: ["g-loops"],
      kind: ["Block", "Wire"],
      view: "table",
      sort: "mechanism",
    };
    expect(parseQuery(serializeQuery(state))).toEqual(state);
  });

  it("omits defaults so a clean list is a clean hash", () => {
    expect(serializeQuery(EMPTY_FILTERS)).toBe("");
    expect(buildHomeHash(serializeQuery(EMPTY_FILTERS))).toBe("#/");
  });

  it("falls back on an unknown view or sort rather than trusting the URL", () => {
    const parsed = parseQuery("view=hologram&sort=vibes");
    expect(parsed.view).toBe(EMPTY_FILTERS.view);
    expect(parsed.sort).toBe(EMPTY_FILTERS.sort);
  });

  it("tolerates a leading ? and empty list values", () => {
    expect(parseQuery("?vocab=&q=x").vocab).toEqual([]);
    expect(parseQuery("?vocab=,,labview,").vocab).toEqual(["labview"]);
  });
});

describe("parseHash", () => {
  it("reads every route, with its query", () => {
    expect(parseHash("#/")).toEqual({ kind: "home", query: "" });
    expect(parseHash("#/?q=x")).toEqual({ kind: "home", query: "q=x" });
    expect(parseHash("#/sc/C1?q=x&b=2")).toEqual({ kind: "scenario", id: "C1", query: "q=x&b=2" });
    expect(parseHash("#/board/C1__b1__ex1")).toEqual({
      kind: "board",
      id: "C1__b1__ex1",
      query: "",
    });
    expect(parseHash("#/vocab/labview")).toEqual({ kind: "vocab", key: "labview", query: "" });
  });

  it("falls back to home rather than rendering nothing", () => {
    expect(parseHash("#/nope/deeper").kind).toBe("home");
    expect(parseHash("").kind).toBe("home");
  });

  it("survives the round trip through every builder", () => {
    const q = serializeQuery({ ...EMPTY_FILTERS, q: "a b", vocab: ["max"] });
    expect(parseHash(buildScenarioHash("C1", q)).query).toBe(q);
    expect(parseHash(buildBoardHash("C1__b1__ex1", q)).query).toBe(q);
    expect(parseHash(buildVocabHash("labview", q)).query).toBe(q);
  });
});

describe("the bucket anchor", () => {
  it("rides in the query and is read back", () => {
    const hash = buildScenarioHash("C1", "q=x", 2);
    expect(hash).toBe("#/sc/C1?q=x&b=2");
    expect(anchoredBucket(parseHash(hash).query)).toBe(2);
  });

  it("is NOT a filter — it never survives into a list hash", () => {
    // Otherwise Back from a scenario would re-scroll the page it just left.
    expect(filterQueryOf("q=x&vocab=max&b=2")).toBe("q=x&vocab=max");
    expect(anchoredBucket(filterQueryOf("q=x&b=2"))).toBeNull();
  });

  it("rejects a non-index rather than scrolling somewhere arbitrary", () => {
    expect(anchoredBucket("b=-1")).toBeNull();
    expect(anchoredBucket("b=two")).toBeNull();
    expect(anchoredBucket("")).toBeNull();
  });
});

describe("matchesFilters", () => {
  it("passes everything when nothing is set", () => {
    expect(matchesFilters(item(), EMPTY_FILTERS)).toBe(true);
  });

  it("searches the haystack case-insensitively", () => {
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, q: "LabVIEW" })).toBe(true);
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, q: "houdini" })).toBe(false);
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, q: "   " })).toBe(true);
  });

  it("treats a vocabulary chip as ANY-of over a mechanism's members", () => {
    // A mechanism is up to eleven tools wide; "show me LabVIEW" means "every
    // mechanism LabVIEW is IN", not "mechanisms that are only LabVIEW".
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, vocab: ["simulink"] })).toBe(true);
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, vocab: ["max"] })).toBe(false);
    expect(matchesFilters(item(), { ...EMPTY_FILTERS, vocab: ["max", "labview"] })).toBe(true);
  });

  it("ANDs across groups", () => {
    const filters = { ...EMPTY_FILTERS, vocab: ["labview"], kind: ["Wire"] };
    expect(matchesFilters(item(), filters)).toBe(false);
    expect(matchesFilters(item({ kind: "Wire" }), filters)).toBe(true);
  });
});

describe("toggleInList", () => {
  it("adds, then removes", () => {
    expect(toggleInList<string>([], "a")).toEqual(["a"]);
    expect(toggleInList(["a", "b"], "a")).toEqual(["b"]);
  });
});
