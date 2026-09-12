import { describe, expect, it } from "vitest";
import { clickSelect, stepRow, visibleRows } from "../src/navigator/selection";

const rows = ["a", "b", "c", "d", "e"];
const none = { selected: [], anchor: null };

describe("clickSelect — Finder / VS Code semantics over the visible rows", () => {
  it("a plain click selects exactly that row and anchors there", () => {
    expect(clickSelect(rows, { selected: ["a", "b"], anchor: "a" }, "d")).toEqual({ selected: ["d"], anchor: "d" });
  });
  it("ctrl-click toggles and moves the anchor", () => {
    const s1 = clickSelect(rows, none, "b", { toggle: true });
    expect(s1).toEqual({ selected: ["b"], anchor: "b" });
    const s2 = clickSelect(rows, s1, "d", { toggle: true });
    expect(s2.selected).toEqual(["b", "d"]);
    expect(clickSelect(rows, s2, "b", { toggle: true }).selected).toEqual(["d"]);
  });
  it("shift-click ranges from the anchor over the visible order, in either direction", () => {
    const s1 = clickSelect(rows, none, "d");
    expect(clickSelect(rows, s1, "b", { shift: true })).toEqual({ selected: ["b", "c", "d"], anchor: "d" });
    expect(clickSelect(rows, s1, "e", { shift: true })).toEqual({ selected: ["d", "e"], anchor: "d" });
  });
  it("a second shift-click re-ranges from the same anchor instead of extending", () => {
    const s1 = clickSelect(rows, clickSelect(rows, none, "a"), "d", { shift: true });
    expect(clickSelect(rows, s1, "b", { shift: true }).selected).toEqual(["a", "b"]);
  });
  it("ctrl+shift adds the range to what was already selected", () => {
    const s = { selected: ["a"], anchor: "d" };
    expect(clickSelect(rows, s, "e", { shift: true, toggle: true }).selected).toEqual(["a", "d", "e"]);
  });
  it("shift-click with no anchor, or an anchor that is folded away, is a plain click", () => {
    expect(clickSelect(rows, none, "c", { shift: true })).toEqual({ selected: ["c"], anchor: "c" });
    expect(clickSelect(["a", "b"], { selected: ["z"], anchor: "z" }, "b", { shift: true })).toEqual({ selected: ["b"], anchor: "b" });
  });
});

describe("stepRow", () => {
  it("moves by delta and clamps at the ends", () => {
    expect(stepRow(rows, "b", 1)).toBe("c");
    expect(stepRow(rows, "a", -1)).toBe("a");
    expect(stepRow(rows, "e", 1)).toBe("e");
    expect(stepRow(rows, null, 1)).toBe("a");
    expect(stepRow(rows, null, -1)).toBe("e");
    expect(stepRow([], "a", 1)).toBeNull();
  });
});

describe("visibleRows", () => {
  const tree = [
    { id: "s", children: [{ id: "p", children: [] }, { id: "b", children: [{ id: "q", children: [] }] }] },
    { id: "r", children: [] },
  ];
  it("lists the painted rows top to bottom", () => {
    expect(visibleRows(tree, new Set())).toEqual(["s", "p", "b", "q", "r"]);
  });
  it("a folded node hides its descendants, so a range cannot reach into them", () => {
    expect(visibleRows(tree, new Set(["b"]))).toEqual(["s", "p", "b", "r"]);
    expect(visibleRows(tree, new Set(["s"]))).toEqual(["s", "r"]);
  });
});
