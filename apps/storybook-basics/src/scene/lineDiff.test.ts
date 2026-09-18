// src/scene/lineDiff.test.ts — coverage for the ported `lineDiff.ts`.
//
// NOT a donor port, unlike `wordDiff.test.ts`. Verified 2026-09-17: the donor
// (`/home/bam/systemsketch/src/compare/lineDiff.ts`) has no dedicated test
// file of its own — `grep -rl "lineDiff\|stableJson\|collapseContext"
// /home/bam/systemsketch/src --include=*.test.ts` returns nothing. The donor
// exercises it only indirectly, through the tldraw-bound `CodeView.tsx` and
// through fixtures in `compareModel.test.ts`, neither of which is a portable
// unit test over this module's own exports. `docs/COMPARISON-VIEW-PLAN.md`'s
// own "What I could not verify" section names this exact gap ("I did not run
// the donor's own test suites... green is not claimed") — this file closes
// it for the module that actually ported, written fresh against the ported
// source rather than against a donor oracle that does not exist.
//
// Run: `pnpm exec vitest --project=unit run` (node project, no DOM).
import { describe, expect, it } from "vitest";

import { CONTEXT_LINES, ELISION, collapseContext, lineDiff, stableJson } from "./lineDiff";

describe("stableJson", () => {
  it("sorts object keys so write order never masquerades as a change", () => {
    expect(stableJson({ b: 1, a: 2 })).toBe(stableJson({ a: 2, b: 1 }));
  });

  it("sorts nested object keys too, not just the top level", () => {
    const nested = { outer: { z: 1, a: 2 } };
    const reordered = { outer: { a: 2, z: 1 } };
    expect(stableJson(nested)).toBe(stableJson(reordered));
  });

  it("leaves array order alone — arrays carry position as meaning", () => {
    expect(stableJson([2, 1])).not.toBe(stableJson([1, 2]));
  });

  it("is the honest empty for null/undefined, not the string \"null\"", () => {
    expect(stableJson(null)).toBe("");
    expect(stableJson(undefined)).toBe("");
  });
});

describe("lineDiff", () => {
  it("reports no lines for two identical texts other than context", () => {
    const lines = lineDiff("a\nb\nc", "a\nb\nc");
    expect(lines.every((line) => line.kind === "context")).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it("orders a removed line before the added line that replaced it", () => {
    const lines = lineDiff("old", "new");
    expect(lines.map((line) => line.kind)).toEqual(["removed", "added"]);
    expect(lines[0].text).toBe("old");
    expect(lines[1].text).toBe("new");
  });

  it("numbers each side independently, null on the side a line does not exist", () => {
    const lines = lineDiff("a\nb", "a\nc");
    // "a" is context on both sides; "b" is removed (before-only), "c" is
    // added (after-only).
    const removed = lines.find((line) => line.kind === "removed")!;
    const added = lines.find((line) => line.kind === "added")!;
    expect(removed.beforeNumber).toBe(2);
    expect(removed.afterNumber).toBeNull();
    expect(added.beforeNumber).toBeNull();
    expect(added.afterNumber).toBe(2);
  });

  it("treats the empty string as zero lines, not one blank line", () => {
    expect(lineDiff("", "")).toEqual([]);
    const lines = lineDiff("", "only line");
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("added");
  });

  it("keeps a real LCS alignment — an insertion in the middle does not disturb the tail", () => {
    const lines = lineDiff("a\nb\nc", "a\nx\nb\nc");
    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ["context", "a"],
      ["added", "x"],
      ["context", "b"],
      ["context", "c"],
    ]);
  });
});

describe("collapseContext", () => {
  function contextLines(count: number): ReturnType<typeof lineDiff> {
    return Array.from({ length: count }, (_, i) => ({
      kind: "context" as const,
      text: `line ${i}`,
      beforeNumber: i + 1,
      afterNumber: i + 1,
    }));
  }

  it("keeps every line when nothing needs collapsing", () => {
    const lines = lineDiff("a\nb", "a\nc");
    expect(collapseContext(lines)).toEqual(lines);
  });

  it("returns nothing at all when every line is unchanged context", () => {
    // No change means no hunk to anchor context around — the donor's own
    // rule ("if (!keep.some(Boolean)) return []"): an all-context diff has
    // nothing worth showing, not a giant single elided block.
    expect(collapseContext(contextLines(10))).toEqual([]);
  });

  it(`collapses a long unchanged run beyond ${CONTEXT_LINES} lines of context either side of a change`, () => {
    const before = contextLines(10).map((line) => line.text).join("\n");
    const after = `${before}\nchanged`;
    const lines = lineDiff(before, after);
    const collapsed = collapseContext(lines);
    // The 10 unchanged lines plus the one addition: only the last
    // CONTEXT_LINES of context survive before the change, the rest elides
    // into a single marker line.
    const elisions = collapsed.filter((line) => line.text === ELISION);
    expect(elisions).toHaveLength(1);
    expect(collapsed.filter((line) => line.kind === "context" && line.text !== ELISION)).toHaveLength(
      CONTEXT_LINES,
    );
    expect(collapsed[collapsed.length - 1].kind).toBe("added");
  });

  it("never elides two markers back to back", () => {
    // Two separate changes far apart in scene order still produce ONE
    // marker per gap, not one per skipped line.
    const before = contextLines(20).map((line) => line.text).join("\n");
    const afterLines = contextLines(20).map((line) => line.text);
    afterLines[0] = "changed-start";
    afterLines[19] = "changed-end";
    const lines = lineDiff(before, afterLines.join("\n"));
    const collapsed = collapseContext(lines);
    const elisionRun = collapsed.filter((line, index, all) => line.text === ELISION && all[index - 1]?.text === ELISION);
    expect(elisionRun).toHaveLength(0);
  });
});
