// src/editor/selectionHistory.test.ts — the journal's rules, in node.
// The listeners, the swallow and the tldraw wiring are the host's, and they
// are driven in `apps/systemsketch/src/selectionHistory.smoke.test.tsx`.
import { describe, expect, it } from "vitest";

import {
  EMPTY_SELECTION_JOURNAL,
  recordSelection,
  selectionHistoryKeyStep,
  selectionHistoryStep,
  selectionKey,
  stepSelection,
} from "./selectionHistory";

const record = (...landings: string[][]) =>
  landings.reduce((journal, ids) => recordSelection(journal, ids), EMPTY_SELECTION_JOURNAL);

describe("recording a landing", () => {
  it("keeps each landing, oldest first, standing on the newest", () => {
    const journal = record(["a"], ["b"], ["c"]);
    expect(journal.entries).toEqual([["a"], ["b"], ["c"]]);
    expect(journal.index).toBe(2);
  });

  it("ignores a re-selection of what is already selected, whatever the order", () => {
    // tldraw returns selected ids in board z-order, which a bring-to-front
    // changes without the selection changing.
    const journal = record(["a", "b"], ["b", "a"]);
    expect(journal.entries).toEqual([["a", "b"]]);
    expect(selectionKey(["a", "b"])).toBe(selectionKey(["b", "a"]));
  });

  it("ignores an empty selection — deselecting is not a place to go back to", () => {
    const journal = record(["a"], [], ["b"]);
    expect(journal.entries).toEqual([["a"], ["b"]]);
  });

  it("truncates the forward entries when a new landing happens mid-history", () => {
    const walked = stepSelection(record(["a"], ["b"], ["c"]), -1)!;
    expect(walked.selection).toEqual(["b"]);
    const afterNewLanding = recordSelection(walked.journal, ["d"]);
    expect(afterNewLanding.entries).toEqual([["a"], ["b"], ["d"]]);
    expect(afterNewLanding.index).toBe(2);
  });
});

describe("walking it", () => {
  it("goes back and then forward again over the same entries", () => {
    const journal = record(["a"], ["b"], ["c"]);
    const back1 = stepSelection(journal, -1)!;
    expect(back1.selection).toEqual(["b"]);
    const back2 = stepSelection(back1.journal, -1)!;
    expect(back2.selection).toEqual(["a"]);
    expect(stepSelection(back2.journal, 1)!.selection).toEqual(["b"]);
  });

  it("answers null at either end, so the host knows it has nowhere to go", () => {
    const journal = record(["a"]);
    expect(stepSelection(journal, -1)).toBeNull();
    expect(stepSelection(journal, 1)).toBeNull();
    expect(stepSelection(EMPTY_SELECTION_JOURNAL, -1)).toBeNull();
  });

  it("drops ids whose shape is gone, and walks PAST an entry nothing survives in", () => {
    const journal = record(["a"], ["gone1", "gone2"], ["c", "gone3"]);
    const alive = (id: string) => !id.startsWith("gone");
    const back = stepSelection(journal, -1, alive)!;
    // `c` was the entry we were standing on; one press back must not stop on
    // the all-deleted entry in between.
    expect(back.selection).toEqual(["a"]);
    expect(back.journal.index).toBe(0);
  });

  it("keeps the surviving half of a partly-deleted entry", () => {
    const journal = record(["a"], ["b", "gone"]);
    const back = stepSelection(journal, -1, (id) => !id.startsWith("gone"))!;
    expect(back.selection).toEqual(["a"]);
    const forward = stepSelection(back.journal, 1, (id) => !id.startsWith("gone"))!;
    expect(forward.selection).toEqual(["b"]);
  });
});

describe("which gesture asks for a step", () => {
  it("reads the two side buttons and nothing else", () => {
    expect(selectionHistoryStep(3)).toBe(-1);
    expect(selectionHistoryStep(4)).toBe(1);
    for (const button of [0, 1, 2, 5, -1]) expect(selectionHistoryStep(button)).toBeNull();
  });

  it("reads both keyboard spellings of the same two buttons", () => {
    expect(selectionHistoryKeyStep("BrowserBack")).toBe(-1);
    expect(selectionHistoryKeyStep("GoBack")).toBe(-1);
    expect(selectionHistoryKeyStep("BrowserForward")).toBe(1);
    expect(selectionHistoryKeyStep("GoForward")).toBe(1);
    expect(selectionHistoryKeyStep("a")).toBeNull();
  });
});
