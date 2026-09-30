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
//
// W1 (the anchor-layout registry, ported 2026-09-30 from
// `claude/w1-anchor-layout` f00fb2b; docs/WORK-ORDER-2026-09-18.md) appends
// its own pure-math surface below: `portConstraintOf`'s two rungs, a check
// that the built-in registry entries reuse `mainAxisPositions` rather than a
// second, parallel implementation, and `slotMainSpan`/`packVariableSlotSpans`.
// The REAL proof that the registry renders byte-identically to the flex
// layout it replaced is `src/components/PortEdge.stories.tsx`'s stories, run
// in a real browser; this file is the fast, no-DOM complement.

import { describe, expect, it } from "vitest";

import {
  computeSlots,
  groupingSetFromText,
  mainAxisPositions,
  packVariableSlotSpans,
  portConstraintOf,
  portLayout,
  registerPortLayout,
  slotMainSpan,
  splitByMaxVisible,
  type Anchor,
  type PortLayoutRail,
  type Slot,
} from "./portEdge.layout";

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

describe("portConstraintOf", () => {
  it("reports FIXED_ORDER for auto mode, regardless of scheme", () => {
    expect(portConstraintOf({ mode: "auto" })).toBe("FIXED_ORDER");
    expect(portConstraintOf({})).toBe("FIXED_ORDER"); // default, unset
  });

  it("reports FIXED_POS for custom mode (freeOffsets)", () => {
    expect(portConstraintOf({ mode: "custom" })).toBe("FIXED_POS");
  });
});

describe("the built-in registry entries", () => {
  const rail: PortLayoutRail = { mainSize: 200, cardMain: 24, axis: "row", gap: 18 };
  const items = [{ id: "a", label: "" }, { id: "b", label: "" }, { id: "c", label: "" }];

  it("space-between/space-evenly/space-around reproduce mainAxisPositions exactly", () => {
    for (const scheme of ["space-between", "space-evenly", "space-around"] as const) {
      const fn = portLayout(scheme);
      expect(fn).toBeDefined();
      const anchors = fn!(items, rail) as Anchor[];
      const expected = mainAxisPositions(items.length, rail.mainSize, rail.cardMain, scheme);
      expect(anchors.map((a) => a.x)).toEqual(expected);
      expect(anchors.map((a) => a.y)).toEqual(items.map(() => 0)); // cross owned by the caller, not the registry
    }
  });

  it("aligned packs from the anchor edge with the given gap", () => {
    const fn = portLayout("aligned");
    expect(fn).toBeDefined();
    const anchors = fn!(items, rail, { mode: "aligned", anchor: "start", gap: 10, edgePadding: 5 }) as Anchor[];
    expect(anchors.map((a) => a.x)).toEqual([5, 5 + 34, 5 + 68]); // edgePadding + i*(cardMain+gap)
  });

  it("a story can register a brand-new layout under its own name", () => {
    registerPortLayout("__test-diagonal__", (testItems, testRail) => testItems.map((_, i) => ({ x: i * testRail.cardMain, y: i * testRail.cardMain })));
    const fn = portLayout("__test-diagonal__");
    expect(fn).toBeDefined();
    expect(fn!(items, rail)).toEqual([
      { x: 0, y: 0 },
      { x: 24, y: 24 },
      { x: 48, y: 48 },
    ]);
  });
});

describe("slotMainSpan / packVariableSlotSpans", () => {
  it("a singleton or collapsed slot's span is just cardMain", () => {
    expect(slotMainSpan(1, 24, 18)).toBe(24);
  });

  it("a real group's span is its members plus their own internal gaps", () => {
    expect(slotMainSpan(2, 24, 18)).toBe(2 * 24 + 18);
  });

  it("packs variable spans with a fixed gap between them, space-between anchored at 0", () => {
    const spans = [24, 66, 24]; // singleton, a 2-member group, singleton
    const positions = packVariableSlotSpans(spans, { mode: "distribute", scheme: "space-between" }, 18, 300);
    expect(positions[0]).toBe(0);
    expect(positions[1]).toBe(24 + 18);
    expect(positions[2]).toBe(24 + 18 + 66 + 18);
  });
});
