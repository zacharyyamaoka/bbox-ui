import { describe, expect, it } from "vitest";

import type { CodeFieldLine } from "../src/codeGrammar";
import { pruneExpandedPaths, rowIdentity } from "../src/codeFieldRows";

function line(index: number, name: string, extra: Partial<CodeFieldLine> = {}): CodeFieldLine {
  return {
    line: index,
    lineStart: 0,
    indent: 0,
    segments: [{ text: name, role: "name" }],
    ...extra,
  };
}

describe("rowIdentity", () => {
  it("combines the line index and the name-role segment", () => {
    expect(rowIdentity(line(3, "target"))).toBe("3:target");
  });

  it("falls back to the full row text when nothing is marked role: 'name'", () => {
    const noName: CodeFieldLine = { line: 2, lineStart: 0, indent: 0, segments: [{ text: "raw text" }] };
    expect(rowIdentity(noName)).toBe("2:raw text");
  });
});

describe("pruneExpandedPaths (finding E, round 3 — optional)", () => {
  it("drops a top-level key whose row was deleted outright", () => {
    const lines = [line(0, "origin"), line(1, "samples")];
    const expanded = new Set(["0:origin", "1:samples", "2:target"]); // "2:target" no longer exists
    const pruned = pruneExpandedPaths(expanded, lines);
    expect([...pruned].sort()).toEqual(["0:origin", "1:samples"]);
  });

  it("drops a nested key whose top-level parent was deleted", () => {
    const lines = [line(0, "samples")];
    const expanded = new Set(["0:origin", "0:origin/1:x", "0:samples"]);
    const pruned = pruneExpandedPaths(expanded, lines);
    expect([...pruned]).toEqual(["0:samples"]);
  });

  it("keeps a nested key whose top-level parent still exists, without inspecting the nested segment itself", () => {
    // Pruning only checks the TOP-LEVEL segment — a nested key under a
    // still-valid parent survives even if that specific nested row was
    // removed from a lazy `expandLines()` result; catching that would mean
    // re-calling `expandLines()` during every prune, which isn't cheap
    // (it can mean a live board scan) and is out of scope for this fix.
    const lines = [line(0, "origin")];
    const expanded = new Set(["0:origin", "0:origin/5:stale-child"]);
    const pruned = pruneExpandedPaths(expanded, lines);
    expect([...pruned].sort()).toEqual(["0:origin", "0:origin/5:stale-child"]);
  });

  it("returns the SAME set reference when nothing needs pruning (no unnecessary re-render)", () => {
    const lines = [line(0, "origin")];
    const expanded = new Set(["0:origin"]);
    expect(pruneExpandedPaths(expanded, lines)).toBe(expanded);
  });

  it("is empty-safe", () => {
    expect(pruneExpandedPaths(new Set(), [])).toEqual(new Set());
  });

  it("documents the known residual collision: a stale key can validate against an UNRELATED same-name row (not fixed by pruning alone)", () => {
    // Repro: "origin: Pose" at line 0 was expanded ("0:origin" in the set).
    // Insert "origin: int" ABOVE it — the ORIGINAL row shifts to line 1
    // ("1:origin" per rowIdentity), but the NEW row at line 0 is ALSO
    // named "origin", so "0:origin" is still a "valid" top-level identity
    // — just for a different row nobody ever expanded.
    const lines = [line(0, "origin"), line(1, "origin")]; // the new "origin: int", then the shifted "origin: Pose"
    const expanded = new Set(["0:origin"]); // stale: this used to mean the NOW-line-1 row
    const pruned = pruneExpandedPaths(expanded, lines);
    // Pruning does not (and per its own doc, cannot) tell these apart —
    // "0:origin" survives, now describing the WRONG row.
    expect(pruned).toBe(expanded);
  });
});
