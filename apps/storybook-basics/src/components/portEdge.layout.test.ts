// src/components/portEdge.layout.test.ts — the pure half of RULING 7.
//
// Zach, 2026-09-21, on the "+X more" chip: "ideally this just comes from the
// port edge implementation... but YOu do need to provide the chrome to do
// this... should be in bbox-editor." `splitByMaxVisible` IS "comes from the
// port edge implementation", extracted precisely so the COUNT can be pinned
// here — in plain Node, in milliseconds, with no DOM — while the chrome that
// draws it is proved separately in `src/editor/PortOverflowChip.stories.tsx`.
//
// The measured half (where the chip lands on the real track, and that the
// number it shows is the one this function returned) is that story's job;
// this file never mounts anything.

import { describe, expect, it } from "vitest";

import { computeSlots, groupingSetFromText, splitByMaxVisible, type Slot } from "./portEdge.layout";

const ORDER = ["a", "b", "c", "d", "e", "f"];
const UNGROUPED: Slot[] = computeSlots(ORDER, groupingSetFromText("", ORDER).set, "off");

describe("splitByMaxVisible", () => {
  it("cuts nothing when no cap is set — the normal case", () => {
    const { visible, hidden, hiddenPortCount } = splitByMaxVisible(UNGROUPED, undefined);
    expect(visible).toBe(UNGROUPED);
    expect(hidden).toEqual([]);
    expect(hiddenPortCount).toBe(0);
  });

  it("keeps the first N slots and reports the rest as hidden ports", () => {
    const { visible, hidden, hiddenPortCount } = splitByMaxVisible(UNGROUPED, 3);
    expect(visible.map((s) => s.slotId)).toEqual(["a", "b", "c"]);
    expect(hidden.map((s) => s.slotId)).toEqual(["d", "e", "f"]);
    // Ungrouped, so one port per slot — the boring case, pinned so the
    // grouped case below is visibly different rather than just asserted.
    expect(hiddenPortCount).toBe(ORDER.length - 3);
  });

  it("counts PORTS, not slot boxes, when the cut lands past a real group", () => {
    // `b,c,d` is one slot; cap 2 leaves [a, (b,c,d)] visible and cuts
    // [e, f]. Now raise the cut to 1: the group itself falls past the
    // cutoff, and the honest answer is 5 hidden ports in 3 hidden slots.
    const grouped = computeSlots(ORDER, groupingSetFromText("b,c,d", ORDER).set, "grouped");
    const { visible, hidden, hiddenPortCount } = splitByMaxVisible(grouped, 1);
    expect(visible.map((s) => s.slotId)).toEqual(["a"]);
    expect(hidden).toHaveLength(3);
    expect(hiddenPortCount).toBe(5);
    // The failure this test exists to catch: counting slots would say "+3".
    expect(hiddenPortCount).not.toBe(hidden.length);
  });

  it("a cap of 0 hides every port; a cap at or past the end hides none", () => {
    expect(splitByMaxVisible(UNGROUPED, 0).hiddenPortCount).toBe(ORDER.length);
    expect(splitByMaxVisible(UNGROUPED, 0).visible).toEqual([]);
    expect(splitByMaxVisible(UNGROUPED, ORDER.length).hiddenPortCount).toBe(0);
    expect(splitByMaxVisible(UNGROUPED, ORDER.length + 10).hiddenPortCount).toBe(0);
  });

  it("clamps a negative cap to 0 rather than slicing from the end", () => {
    // `Array.prototype.slice(-2)` would keep the LAST two slots and report
    // four hidden — a silent, plausible-looking lie. The clamp is the whole
    // reason this branch exists.
    const { visible, hiddenPortCount } = splitByMaxVisible(UNGROUPED, -2);
    expect(visible).toEqual([]);
    expect(hiddenPortCount).toBe(ORDER.length);
  });

  it("never mutates the slots it was handed", () => {
    const before = JSON.stringify(UNGROUPED);
    splitByMaxVisible(UNGROUPED, 2);
    expect(JSON.stringify(UNGROUPED)).toBe(before);
  });
});
