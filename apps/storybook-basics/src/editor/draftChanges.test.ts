// src/components/draftChanges.test.ts — acceptance for the merge gate.
//
// The donor has no equivalent unit suite: in
// /home/bam/systemsketch/src/drafts/DraftProvider.tsx these rules are inlined
// in a React hook that reaches an `Editor`, `fetch` and `window.location`,
// and the same file's sibling `draftHold.test.ts:1-14` says in its own words
// why it did not mount it ("too much surface to mount in a unit test just to
// exercise one ref check"). Extracting the policy into a pure function is
// what makes it directly testable here rather than only through a CDP
// journey; the cases below are the donor's documented rules, one per
// sentence of its own comments, with the line cited on each.
import { describe, expect, it } from "vitest";

import { hasUnpromotedEdits, resolveMergeGate } from "./draftChanges";

const BASE = '{"records":[{"id":"shape:a","x":0,"y":0}]}';
/** Same records, moved. A display diff cannot see this; a digest can. */
const MOVED = '{"records":[{"id":"shape:a","x":40,"y":0}]}';

describe("hasUnpromotedEdits", () => {
  it("is false when the draft has not diverged from its fork point", () => {
    expect(hasUnpromotedEdits(BASE, BASE)).toBe(false);
  });

  it("sees a pure move, which the change count structurally cannot", () => {
    // DraftProvider.tsx:127-133 — x/y/rotation/parentId live outside `props`,
    // which is all the compare engine diffs, so a move-only draft reports
    // zero changes and must still be mergeable.
    expect(hasUnpromotedEdits(BASE, MOVED)).toBe(true);
  });

  it("is false when either side is missing, never a guess", () => {
    expect(hasUnpromotedEdits(null, MOVED)).toBe(false);
    expect(hasUnpromotedEdits(BASE, null)).toBe(false);
    expect(hasUnpromotedEdits(null, null)).toBe(false);
  });

  it("is false for an empty draft with an empty base", () => {
    expect(hasUnpromotedEdits("", "")).toBe(false);
  });
});

describe("resolveMergeGate — nothing to promote", () => {
  it("disables Merge and shows no banner on a clean, undrifted draft", () => {
    expect(resolveMergeGate({ hasUnpromotedEdits: false, mainDrift: 0 })).toEqual({
      canMerge: false,
      mergeState: "disabled",
      conflict: null,
    });
  });

  it("still warns about drift even with nothing of its own to merge", () => {
    const gate = resolveMergeGate({ hasUnpromotedEdits: false, mainDrift: 3 });
    expect(gate.canMerge).toBe(false);
    expect(gate.mergeState).toBe("disabled");
    expect(gate.conflict).toBe("Main changed since this draft — review before merging");
  });

  it("shows no banner when drift is unknown", () => {
    expect(resolveMergeGate({ hasUnpromotedEdits: false, mainDrift: null }).conflict).toBeNull();
  });
});

describe("resolveMergeGate — something to promote", () => {
  it("is a live, normal Merge when Main has not moved", () => {
    expect(resolveMergeGate({ hasUnpromotedEdits: true, mainDrift: 0 })).toEqual({
      canMerge: true,
      mergeState: "normal",
      conflict: null,
    });
  });

  it("is blocked, NOT disabled, when Main has moved", () => {
    // The rejected alternative, ported out: the icepanel-quiet prototype's
    // DraftModeBar.tsx:322 did `disabled={hasConflict}`, which greys out the
    // chevron that opens Rebase — the one action that resolves the state the
    // banner is complaining about. `blocked` greys the primary and keeps the
    // menu live (splitButton.tsx:37-48).
    const gate = resolveMergeGate({ hasUnpromotedEdits: true, mainDrift: 1 });
    expect(gate.mergeState).toBe("blocked");
    expect(gate.mergeState).not.toBe("disabled");
    expect(gate.canMerge).toBe(true);
    expect(gate.conflict).toBe("Main changed since this draft — review before merging");
  });

  it("treats unknown drift as unknown, never as drifted", () => {
    // DraftProvider.tsx:290-294 — "Callers must treat that as 'unknown',
    // never as 'clear'"; merge() does its own fresh check at click time and
    // refuses on null (:520), so the BAR must not cry wolf here.
    const gate = resolveMergeGate({ hasUnpromotedEdits: true, mainDrift: null });
    expect(gate.mergeState).toBe("normal");
    expect(gate.conflict).toBeNull();
  });

  it("never gates on a change count — a move-only draft stays mergeable", () => {
    // The whole reason hasUnpromotedEdits exists as a separate input. There
    // is no changeCount parameter to pass, by construction.
    const gate = resolveMergeGate({
      hasUnpromotedEdits: hasUnpromotedEdits(BASE, MOVED),
      mainDrift: 0,
    });
    expect(gate.canMerge).toBe(true);
  });
});

describe("resolveMergeGate — the banner text", () => {
  it("takes a host-supplied wording", () => {
    const gate = resolveMergeGate({
      hasUnpromotedEdits: true,
      mainDrift: 2,
      driftedBanner: "Main moved on — rebase first",
    });
    expect(gate.conflict).toBe("Main moved on — rebase first");
  });

  it("ignores the wording when there is no drift to report", () => {
    const gate = resolveMergeGate({
      hasUnpromotedEdits: true,
      mainDrift: 0,
      driftedBanner: "Main moved on — rebase first",
    });
    expect(gate.conflict).toBeNull();
  });
});
