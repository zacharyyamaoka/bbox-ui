// src/components/boardSearch.test.ts — the Find half.
//
// The occurrence, whole-word, regex-escape and snippet cases are ported from
// the donor's own suite (/home/bam/systemsketch/src/commands/boardSearch.test.ts),
// which built a 200-line fake tldraw `Editor` to reach them. They reach the
// same arithmetic here with a plain array, because that is the whole point of
// the engine-free port: what travels is the matching, not the canvas.
import { describe, expect, it } from "vitest";

import {
  findTextOccurrences,
  replaceAllInSources,
  replaceTextRanges,
  replacedTextForMatch,
  searchMatchSnippet,
  searchTextSources,
  type SearchableText,
} from "./boardSearch";

interface Where {
  page: string;
}

const sources: SearchableText<Where>[] = [
  { sourceId: "block-1", group: "Page 1", field: "Block title", text: "Grip the bottle", meta: { page: "1" } },
  { sourceId: "frame-1", group: "Page 1", field: "Frame name", text: "Bottle sorting", meta: { page: "1" } },
  {
    sourceId: "note-1",
    group: "Page 2",
    field: "Shape text",
    text: "a bottle, then another bottle",
    meta: { page: "2" },
  },
  {
    sourceId: "locked-1",
    group: "Page 2",
    field: "Shape text",
    text: "bottle (locked)",
    replaceBlocker: "Locked shape",
    meta: { page: "2" },
  },
];

describe("findTextOccurrences", () => {
  it("returns ordered, non-overlapping occurrences", () => {
    expect(findTextOccurrences("bottle bottle", "bottle")).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
    ]);
  });

  it("is case-insensitive unless asked otherwise", () => {
    expect(findTextOccurrences("Bottle bottle", "bottle")).toHaveLength(2);
    expect(findTextOccurrences("Bottle bottle", "bottle", { matchCase: true })).toEqual([{ start: 7, end: 13 }]);
  });

  it("honours whole-word boundaries, including across scripts and digits", () => {
    expect(findTextOccurrences("bottle bottles", "bottle", { wholeWord: true })).toEqual([{ start: 0, end: 6 }]);
    expect(findTextOccurrences("a_bottle", "bottle", { wholeWord: true })).toEqual([]);
    expect(findTextOccurrences("bottle2", "bottle", { wholeWord: true })).toEqual([]);
    expect(findTextOccurrences("ボトル bottle", "bottle", { wholeWord: true })).toEqual([{ start: 4, end: 10 }]);
  });

  it("never interprets the query as a regular expression", () => {
    expect(findTextOccurrences("cost (usd)", "(usd)")).toEqual([{ start: 5, end: 10 }]);
    expect(findTextOccurrences("a.b acb", "a.b")).toEqual([{ start: 0, end: 3 }]);
    expect(() => findTextOccurrences("anything", "[")).not.toThrow();
  });

  it("returns nothing for an empty query", () => {
    expect(findTextOccurrences("bottle", "")).toEqual([]);
  });
});

describe("searchTextSources", () => {
  it("finds every occurrence across every source and keeps the host's order", () => {
    const matches = searchTextSources(sources, "bottle");
    expect(matches.map((match) => `${match.sourceId}#${match.occurrence}`)).toEqual([
      "block-1#0",
      "frame-1#0",
      "note-1#0",
      "note-1#1",
      "locked-1#0",
    ]);
  });

  it("carries the host's own payload through untouched", () => {
    const matches = searchTextSources(sources, "bottle");
    expect(matches.map((match) => match.meta?.page)).toEqual(["1", "1", "2", "2", "2"]);
    expect(matches[0].group).toBe("Page 1");
    expect(matches[0].field).toBe("Block title");
  });

  it("gives each match a stable, distinct key", () => {
    const ids = searchTextSources(sources, "bottle").map((match) => match.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(searchTextSources(sources, "bottle").map((match) => match.id)).toEqual(ids);
  });

  it("marks a blocked source unreplaceable and says why", () => {
    const blocked = searchTextSources(sources, "bottle").find((match) => match.sourceId === "locked-1");
    expect(blocked?.replaceable).toBe(false);
    expect(blocked?.replaceBlocker).toBe("Locked shape");
    expect(searchTextSources(sources, "bottle").filter((match) => match.replaceable)).toHaveLength(4);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(searchTextSources(sources, "")).toEqual([]);
  });
});

describe("replacement arithmetic", () => {
  it("applies ranges back-to-front so earlier edits cannot shift later ones", () => {
    expect(
      replaceTextRanges("one two three", [
        { start: 0, end: 3, value: "ONE!" },
        { start: 8, end: 13, value: "THREE!!" },
      ]),
    ).toBe("ONE! two THREE!!");
  });

  it("replaces exactly one occurrence for one match", () => {
    const second = searchTextSources(sources, "bottle").filter((match) => match.sourceId === "note-1")[1];
    expect(replacedTextForMatch(second, "can")).toBe("a bottle, then another can");
  });

  it("groups every safe match by source so two hits in one string land together", () => {
    const result = replaceAllInSources(sources, "bottle", "can");
    expect(result.updates.map((update) => [update.sourceId, update.text])).toEqual([
      ["block-1", "Grip the can"],
      ["frame-1", "can sorting"],
      ["note-1", "a can, then another can"],
    ]);
    expect(result.replacedCount).toBe(4);
    expect(result.skippedCount).toBe(1);
    expect(result.updates.map((update) => update.meta?.page)).toEqual(["1", "1", "2"]);
  });

  it("skips the blocked source entirely", () => {
    const result = replaceAllInSources(sources, "bottle", "can");
    expect(result.updates.some((update) => update.sourceId === "locked-1")).toBe(false);
  });

  it("reports nothing changed when the replacement is the text already there", () => {
    const result = replaceAllInSources(
      [{ sourceId: "a", field: "Block title", text: "bottle" }],
      "bottle",
      "bottle",
    );
    expect(result.updates).toEqual([]);
    expect(result.replacedCount).toBe(0);
  });

  it("respects matchCase and wholeWord when replacing everything", () => {
    const mixed: SearchableText[] = [{ sourceId: "a", field: "Block title", text: "Bottle bottles bottle" }];
    expect(replaceAllInSources(mixed, "bottle", "can", { matchCase: true }).updates[0].text).toBe(
      "Bottle cans can",
    );
    expect(replaceAllInSources(mixed, "bottle", "can", { wholeWord: true }).updates[0].text).toBe(
      "can bottles can",
    );
  });
});

describe("searchMatchSnippet", () => {
  it("splits the text around the match", () => {
    const match = searchTextSources(sources, "sorting")[0];
    expect(searchMatchSnippet(match)).toEqual({ before: "Bottle ", found: "sorting", after: "" });
  });

  it("ellipsises only the side it actually cut", () => {
    const long: SearchableText[] = [
      { sourceId: "a", field: "Shape text", text: `${"x".repeat(60)}needle${"y".repeat(60)}` },
    ];
    const snippet = searchMatchSnippet(searchTextSources(long, "needle")[0], 4);
    expect(snippet).toEqual({ before: "…xxxx", found: "needle", after: "yyyy…" });
  });
});
