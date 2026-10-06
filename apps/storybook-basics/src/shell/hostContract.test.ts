// src/shell/hostContract.test.ts — A0.1 of docs/WORK-ORDER-HOST-LESS-SHELL.md.
//
// Two halves, and the SECOND is the one that matters:
//   1. the fake host satisfies the contract;
//   2. four deliberately broken fakes each fail EXACTLY the named set of
//      checks — not "at least these", and nothing else.
//
// WHY (2) asserts "exactly this check, and no others": a broken host that
// fails every check proves nothing about whether the contract can tell the
// difference between a real violation and a host that simply does not work.
// "A contract that cannot fail is not a contract" — and one that fails
// indiscriminately is not a contract either. This is the same vacuous-
// assertion trap CLAUDE.md already names for story play functions.
//
// Committed RED before any implementation, per §6 "acceptance-first".

import { describe, expect, it } from "vitest";

import { createFakeHost, type FakeHostBreak } from "./fakeHost";
import { describeHostContract, runHostContract, type ContractResult } from "./hostContract";
import { HOST_CAPABILITIES, affordancesFor, type HostCapability } from "./hostPort";

/** The full-capability fake: every affordance on, so every group is exercised. */
const makeFullHost = () => createFakeHost({ capabilities: HOST_CAPABILITIES });

function names(result: ContractResult): string[] {
  return result.violations.map((v) => `[${v.group}] ${v.name}`);
}

// One `it()` per contract check, grouped, so a failure names the rule. Run at
// the top level because vitest registers describe bodies synchronously — this
// is also the exact shape P1's tldrawHostPort suite takes in the BROWSER
// project, which is what A0.1 means by "runnable from both".
describeHostContract(await runHostContract(makeFullHost), { describe, it, expect });

describe("the fake host satisfies the HostPort contract", () => {
  it("has zero violations", async () => {
    const result = await runHostContract(makeFullHost);
    expect(names(result).join("\n")).toBe("");
  });

  it("actually ran every capability group (no group silently absent)", async () => {
    const result = await runHostContract(makeFullHost);
    const groups = new Set(result.checks.map((c) => c.group));
    for (const expected of ["lifecycle", "scene", "selection", "camera", "interaction", "tools", "nodes", "history", "document", "affordances"]) {
      expect([...groups]).toContain(expected);
    }
  });

  it("ran no check in skipped state, because this host declares everything", async () => {
    const result = await runHostContract(makeFullHost);
    expect(result.skipped.map((c) => c.name)).toEqual([]);
  });

  // An audit measured a host declaring NO capabilities passing cleanly while
  // skipping 11 of 28 checks — "0 violations" reads identically either way.
  // Failing such a host would be wrong (declaring less is honest, and it is
  // exactly how the React Flow host arrives incrementally); hiding how little
  // ran would not be. So the count is part of the result and part of the
  // report line.
  it("says out loud how much a sparsely-capable host never ran", async () => {
    const result = await runHostContract(() => createFakeHost({ capabilities: [] }));
    expect(names(result)).toEqual([]);
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.report).toContain(`${result.skipped.length} of ${result.checks.length} checks skipped`);
  });
});

/* ------------------------------------------------------------------ */
/* The teeth: four deliberately broken fakes (A0.1)                    */
/* ------------------------------------------------------------------ */

/**
 * The EXACT set of checks each break must fail — not "at least these".
 *
 * It was an allow-list first, and an independent audit measured six of its
 * twelve permitted cascades never firing at all. Over-permission is harmless
 * only while nothing else is broken: the day a change to `redo()` or the
 * invalidate path introduces a second, unrelated regression that happens to
 * fail one of those named checks, an allow-list waves it through as
 * pre-authorised collateral of a different bug. An exact set cannot.
 *
 * It is also the regression guard for the checks themselves: adding a check
 * that a break SHOULD trip, and forgetting to, now fails here.
 */
const EXPECTED_FAILURES: Record<FakeHostBreak, readonly string[]> = {
  "undo-does-not-restore": [
    "[history] undo RESTORES the previous state, not just the flag",
    "[history] one transact is ONE undo step",
  ],
  "selection-does-not-notify": ["[lifecycle] subscribe returns a working unsubscribe"],
  "scene-is-stored": [
    "[scene] the scene is DERIVED — a command is visible in the next read",
    "[scene] no record survives deleting every node the scene reports",
    "[nodes] delete removes exactly the named nodes",
    "[nodes] update merges data rather than replacing it",
    "[nodes] duplicate adds a node with a new id",
    "[history] undo RESTORES the previous state, not just the flag",
    "[history] an undoable:false write does not become an undo step",
    "[document] serialize then load restores the scene",
  ],
  // The one the suite could NOT see until the leak check existed: a host that
  // forwards its own internal helper record (React Flow's invisible anchor) to
  // the shell. Everything else compares a DELTA — one more node, one fewer —
  // so a constant phantom is invisible to every other check, and it is
  // memoised like any real derivation, so the stability rule passes too.
  "scene-leaks-helper": [
    "[scene] no record survives deleting every node the scene reports",
    "[scene] every node the scene reports can actually be selected",
  ],
};

const BREAK_REASONS: Record<FakeHostBreak, string> = {
  "undo-does-not-restore": "canUndo/canRedo move correctly; the scene does not come back",
  "selection-does-not-notify": "state changes, listeners never hear about it",
  "scene-is-stored": "scene() answers from a snapshot taken at construction",
  "scene-leaks-helper": "scene() forwards an internal record the shell cannot address",
};

describe("the contract has teeth — each broken fake fails exactly the checks named for it", () => {
  for (const broken of Object.keys(EXPECTED_FAILURES) as FakeHostBreak[]) {
    it(`${broken}: ${BREAK_REASONS[broken]}`, async () => {
      const result = await runHostContract(() => createFakeHost({ capabilities: HOST_CAPABILITIES, broken }));
      expect(names(result).slice().sort()).toEqual(EXPECTED_FAILURES[broken].slice().sort());
    });
  }

  it("every break is exercised — no FakeHostBreak is missing from the table", () => {
    // `FakeHostBreak` is a union, so a new member added to fakeHost.ts without
    // a row here would otherwise be silently untested. The Record type makes
    // that a compile error; this asserts it at runtime too, for the case where
    // someone widens the type to `string`.
    expect(Object.keys(EXPECTED_FAILURES).sort()).toEqual(
      ["scene-is-stored", "scene-leaks-helper", "selection-does-not-notify", "undo-does-not-restore"],
    );
  });
});

/* ------------------------------------------------------------------ */
/* Capability gating — A0.1's "a host lacking a capability"            */
/* ------------------------------------------------------------------ */

describe("a host that lacks a capability does not get the affordance", () => {
  it("a bare host shows only the unconditional affordances", () => {
    const bare = createFakeHost({ capabilities: [] });
    const shown = affordancesFor(bare);
    expect([...shown].sort()).toEqual(["chrome.boardName", "panel.frames", "panel.problems", "selection.delete", "status.zoom"]);
  });

  it.each(HOST_CAPABILITIES)("dropping %s hides exactly the affordances that need it", async (dropped: HostCapability) => {
    const rest = HOST_CAPABILITIES.filter((c) => c !== dropped);
    const without = affordancesFor(createFakeHost({ capabilities: rest }));
    const withAll = affordancesFor(createFakeHost({ capabilities: HOST_CAPABILITIES }));
    const missing = [...withAll].filter((a) => !without.has(a));
    expect(missing.length).toBeGreaterThan(0);

    // And the contract still passes for the reduced host — hiding, not erroring.
    const result = await runHostContract(() => createFakeHost({ capabilities: rest }));
    expect(names(result).join("\n")).toBe("");
  });
});
