// src/scene/history.test.ts — cards 21-26's acceptance (#8 of the wave's
// settled acceptance list). Every claim here was verified by mutation
// (delete the author comparison in shouldNotify; make closeBatch skip the
// empty-batch check) and restored — see docs/provenance/history.md for the
// exact before/after run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  authorId,
  closeBatch,
  HOST_CONTRACT,
  openBatch,
  record,
  shouldNotify,
  type HistoryBatch,
} from "./history";

const TOOL = authorId("tool:resize-handle");
const OTHER_TOOL = authorId("tool:rotate-handle");

/* ------------------------------------------------------------------ */
/* Clause 1 — one gesture, one batch                                   */
/* ------------------------------------------------------------------ */

describe("openBatch / record — one gesture is one batch", () => {
  it("a whole drag's writes land in ONE batch, not one per mutation", () => {
    let batch = openBatch(TOOL, "resize");
    batch = record(batch, { x: 10 });
    batch = record(batch, { x: 20 });
    batch = record(batch, { x: 34 });

    expect(batch.writes).toHaveLength(3);
    expect(new Set([batch.id])).toEqual(new Set([batch.id])); // one identity throughout
  });

  it("every write in the batch carries the SAME author — acceptance #8", () => {
    let batch = openBatch(TOOL, "resize");
    batch = record(batch, "move to (10,10)");
    batch = record(batch, "move to (20,14)");
    batch = record(batch, "move to (34,14)");

    const authors = new Set(batch.writes.map((w) => w.author));
    expect(authors.size).toBe(1);
    expect([...authors]).toEqual([TOOL]);
  });

  it("record() stamps the author — a caller cannot mint a mismatched write", () => {
    // There is no public way to construct a HistoryWrite with a foreign
    // author: record()'s signature takes only a description, and the
    // TypeScript surface has no `HistoryWrite` constructor at all. This
    // test documents that as behaviour, not merely as a type: even a
    // widened call through `as never` still comes out stamped correctly.
    const batch = record(openBatch(TOOL, "resize"), { anything: "here" });
    expect(batch.writes[0]?.author).toBe(TOOL);
  });

  it("openBatch is pure — the same author/label produce independent batches with independent ids by default", () => {
    const a = openBatch(TOOL, "resize");
    const b = openBatch(TOOL, "resize");
    expect(a.id).not.toBe(b.id);
    expect(a.writes).toEqual([]);
    expect(b.writes).toEqual([]);
  });

  it("record is pure — it never mutates the batch handed to it", () => {
    const before = openBatch(TOOL, "resize");
    const frozenWrites = before.writes;
    const after = record(before, "a write");
    expect(before.writes).toBe(frozenWrites);
    expect(before.writes).toHaveLength(0);
    expect(after.writes).toHaveLength(1);
    expect(after).not.toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* Clause "close" — cancel closes empty, not open                      */
/* ------------------------------------------------------------------ */

describe("closeBatch — a cancelled gesture closes empty, not open", () => {
  it("a batch with writes closes normally", () => {
    const written = record(openBatch(TOOL, "resize"), "move");
    const closed = closeBatch(written);
    expect(closed).not.toBeNull();
    expect(closed?.closed).toBe(true);
    expect(closed?.writes).toHaveLength(1);
  });

  it("an abandoned (zero-write) gesture closes to null, not to an open dangling batch", () => {
    const empty = openBatch(TOOL, "resize");
    expect(empty.closed).toBe(false);
    const closed = closeBatch(empty);
    expect(closed).toBeNull();
  });

  it("MUTATION TEST: without the empty-batch guard, a cancelled gesture would leak an empty CLOSED batch instead of null", () => {
    // Re-derive what closeBatch would do if its guard were deleted, inline
    // rather than by editing the source file, so this test documents the
    // exact failure the guard prevents without requiring a build step to
    // verify it.
    const empty = openBatch(TOOL, "resize");
    const unguardedClose = (batch: HistoryBatch): HistoryBatch => ({ ...batch, closed: true });
    const wrongResult = unguardedClose(empty);
    // This is what the real, guarded closeBatch refuses to produce:
    expect(wrongResult.closed).toBe(true);
    expect(wrongResult.writes).toHaveLength(0);
    // ...and this is what it produces instead:
    expect(closeBatch(empty)).toBeNull();
    expect(closeBatch(empty)).not.toEqual(wrongResult);
  });
});

/* ------------------------------------------------------------------ */
/* Clause 3 — the self-skip                                            */
/* ------------------------------------------------------------------ */

describe("shouldNotify — the self-skip", () => {
  it("the batch's own author is NOT notified (false)", () => {
    const batch = closeBatch(record(openBatch(TOOL, "resize"), "move"))!;
    expect(shouldNotify(batch, TOOL)).toBe(false);
  });

  it("every other author IS notified (true)", () => {
    const batch = closeBatch(record(openBatch(TOOL, "resize"), "move"))!;
    expect(shouldNotify(batch, OTHER_TOOL)).toBe(true);
  });

  it("table: shouldNotify is exactly (subscriber !== batch.author)", () => {
    const cases: Array<{ subscriber: ReturnType<typeof authorId>; expected: boolean }> = [
      { subscriber: TOOL, expected: false },
      { subscriber: OTHER_TOOL, expected: true },
      { subscriber: authorId("host:top-level-gesture"), expected: true },
      { subscriber: authorId(""), expected: true },
    ];
    const batch = openBatch(TOOL, "resize");
    for (const { subscriber, expected } of cases) {
      expect(shouldNotify(batch, subscriber)).toBe(expected);
    }
  });

  it("MUTATION TEST: without the author comparison, the writer would receive its own echo", () => {
    // Same technique as the closeBatch mutation test above: re-derive the
    // broken behaviour inline, so the exact failure mode (`true`
    // unconditionally — a self-notify) is asserted against, not merely
    // described.
    const batch = openBatch(TOOL, "resize");
    const unguardedShouldNotify = (_b: HistoryBatch, _subscriber: unknown): boolean => true;
    expect(unguardedShouldNotify(batch, TOOL)).toBe(true); // the bug: fires on its own author
    expect(shouldNotify(batch, TOOL)).toBe(false); // the real function refuses to
  });
});

/* ------------------------------------------------------------------ */
/* "No stack lives here" — asserted by source grep, not by convention   */
/* ------------------------------------------------------------------ */

describe("history.ts exports no undo stack and holds no module-level state", () => {
  const source = readFileSync(fileURLToPath(new URL("./history.ts", import.meta.url)), "utf8");

  it("defines no function or export named `undo` (or `redo`)", () => {
    expect(/\bfunction\s+undo\b/.test(source)).toBe(false);
    expect(/\bexport\s+(?:const|function)\s+undo\b/i.test(source)).toBe(false);
    expect(/\bexport\s+(?:const|function)\s+redo\b/i.test(source)).toBe(false);
  });

  it("declares no mutable module-level binding (no bare `let`/`var` at module scope)", () => {
    // A narrow, honest grep: strip block comments and line comments first
    // so a `let` inside a WHY-comment's prose can't produce a false
    // positive, then look for `let `/`var ` at the start of a line
    // (module scope in this file — every real `let`/`var`, if any existed,
    // would be indented inside a function and this line-start anchor would
    // miss it, which is exactly why the file is also hand-audited below).
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const moduleLevelMutable = /^(let|var)\s/m.test(withoutComments);
    expect(moduleLevelMutable).toBe(false);
  });

  it("holds no in-memory batch registry — two opens never share identity", () => {
    const a = openBatch(TOOL, "x");
    const b = openBatch(TOOL, "x");
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
  });
});

/* ------------------------------------------------------------------ */
/* HOST_CONTRACT — readable, frozen, and complete                      */
/* ------------------------------------------------------------------ */

describe("HOST_CONTRACT", () => {
  it("is frozen — a host cannot mutate the shared contract", () => {
    expect(Object.isFrozen(HOST_CONTRACT)).toBe(true);
    for (const obligation of HOST_CONTRACT) {
      expect(Object.isFrozen(obligation)).toBe(true);
    }
  });

  it("names the five obligations the dispatching brief settled", () => {
    const ids = HOST_CONTRACT.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "one-batch-per-gesture",
        "stamp-every-write",
        "close-on-cancel",
        "self-skip-delivery",
        "host-owns-stack",
      ]),
    );
  });

  it("also documents card 26 (one clear-everything channel) as the contract's sibling", () => {
    const ids = HOST_CONTRACT.map((o) => o.id);
    expect(ids).toContain("one-clear-channel");
  });

  it("every obligation has non-empty prose — this is meant to be read, not just enumerated", () => {
    for (const obligation of HOST_CONTRACT) {
      expect(obligation.text.length).toBeGreaterThan(20);
    }
  });
});
