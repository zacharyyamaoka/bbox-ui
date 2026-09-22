/**
 * src/components/returnDividers.test.ts — the pure half of "multiple
 * returns": rail positions, the authoring round trip, and the union-type
 * translation. The rendered half (the two drawings) is measured in a real
 * browser by `MultipleReturns.stories.tsx`.
 */
import { describe, expect, it } from "vitest";

import type { PortEdgeItem } from "./portEdge";
import {
  extractReturnAnnotation,
  formatRailLane,
  isDividerLine,
  railForReturnAnnotation,
  reconcileRailLane,
  returnPortGroups,
  sameDividers,
  sanitizeDividers,
} from "./returnDividers";

const port = (id: string, label = id): PortEdgeItem => ({ id, label, state: "empty" });

describe("sanitizeDividers — a divider is only ever interior", () => {
  it("keeps only 0..portCount-2", () => {
    expect(sanitizeDividers([0, 1, 2], 4)).toEqual([0, 1, 2]);
    expect(sanitizeDividers([-1, 3], 4)).toEqual([]); // first/last for 4 ports
  });

  it("dedupes and sorts", () => {
    expect(sanitizeDividers([2, 0, 2, 1], 5)).toEqual([0, 1, 2]);
  });

  it("has no valid interior position for 0 or 1 ports", () => {
    expect(sanitizeDividers([0], 0)).toEqual([]);
    expect(sanitizeDividers([0], 1)).toEqual([]);
  });

  it("rejects a non-integer or a value outside range", () => {
    expect(sanitizeDividers([1.5, -5, 99], 4)).toEqual([]);
  });
});

describe("sameDividers", () => {
  it("compares two sanitized lists by value", () => {
    expect(sameDividers([0, 1], [0, 1])).toBe(true);
    expect(sameDividers([0, 1], [0, 2])).toBe(false);
    expect(sameDividers([], [])).toBe(true);
  });
});

describe("isDividerLine", () => {
  it("matches exactly '---' or '|', trimmed", () => {
    expect(isDividerLine("---")).toBe(true);
    expect(isDividerLine("|")).toBe(true);
    expect(isDividerLine("  ---  ")).toBe(true);
    expect(isDividerLine("----")).toBe(false);
    expect(isDividerLine("a | b")).toBe(false);
    expect(isDividerLine("")).toBe(false);
  });
});

describe("formatRailLane / reconcileRailLane — the authoring round trip", () => {
  const mint = (label: string): PortEdgeItem => ({ id: `new-${label}`, label, state: "empty" });

  it("formats with no dividers exactly like a plain port list", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(formatRailLane(ports, [])).toBe("a\nb\nc");
  });

  it("inserts a '---' line at each sanitized position", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(formatRailLane(ports, [0])).toBe("a\n---\nb\nc");
    expect(formatRailLane(ports, [1])).toBe("a\nb\n---\nc");
  });

  it("round-trips: format then reconcile with no edit returns the SAME ports array and the same dividers", () => {
    const ports = [port("joint_angles"), port("None")];
    const text = formatRailLane(ports, [0]);
    const result = reconcileRailLane(ports, [0], text, mint);
    expect(result.ports).toBe(ports); // referential no-op, via reconcilePortLane's own purity
    expect(result.dividerAfter).toEqual([0]);
  });

  it("typing '|' instead of '---' parses to the same divider", () => {
    const ports = [port("a"), port("b")];
    const result = reconcileRailLane(ports, [], "a\n|\nb", mint);
    expect(result.dividerAfter).toEqual([0]);
  });

  it("a divider typed before the first line or after the last is trimmed — never first or last", () => {
    const ports = [port("a"), port("b")];
    expect(reconcileRailLane(ports, [], "---\na\nb", mint).dividerAfter).toEqual([]);
    expect(reconcileRailLane(ports, [], "a\nb\n---", mint).dividerAfter).toEqual([]);
  });

  it("consecutive divider lines collapse to one", () => {
    const ports = [port("a"), port("b"), port("c")];
    expect(reconcileRailLane(ports, [], "a\n---\n---\n|\nb\nc", mint).dividerAfter).toEqual([0]);
  });

  it("deleting the divider line removes it, ports untouched", () => {
    const ports = [port("a"), port("b")];
    const withDivider = formatRailLane(ports, [0]);
    expect(withDivider).toBe("a\n---\nb");
    const result = reconcileRailLane(ports, [0], "a\nb", mint);
    expect(result.dividerAfter).toEqual([]);
    expect(result.ports).toBe(ports);
  });

  it("renaming a port around a divider keeps the divider AND the port's id (LCS still does its job)", () => {
    const ports = [port("alpha"), port("beta")];
    const result = reconcileRailLane(ports, [0], "alpha_renamed\n---\nbeta", mint);
    expect(result.dividerAfter).toEqual([0]);
    expect(result.ports.map((p) => p.id)).toEqual(["alpha", "beta"]);
    expect(result.ports[0].label).toBe("alpha_renamed");
  });

  it("a new line past a divider mints a fresh port after it", () => {
    const ports = [port("a")];
    const result = reconcileRailLane(ports, [], "a\n---\nb", mint);
    // divider ends up after the single existing port -> not interior (only 1 gap of ports after mint = 2 total, position 0 IS interior for 2 ports)
    expect(result.ports.map((p) => p.label)).toEqual(["a", "b"]);
    expect(result.dividerAfter).toEqual([0]);
  });

  it("reordering ports leaves divider POSITIONS untouched — the port moves, the boundary doesn't", () => {
    // [a, b | c] -> swap b and c -> [a, c | b]: divider stays "after index 1".
    const ports = [port("a"), port("b"), port("c")];
    const swapped = [port("a"), port("c"), port("b")];
    const dividerAfter = sanitizeDividers([1], ports.length);
    expect(dividerAfter).toEqual([1]);
    // The model asserts nothing moves the divider on a pure reorder — this
    // is the "sensible crossing" behaviour: same index, different neighbours.
    expect(sanitizeDividers(dividerAfter, swapped.length)).toEqual([1]);
  });
});

describe("extractReturnAnnotation", () => {
  it("pulls the annotation out of a full def signature", () => {
    expect(extractReturnAnnotation("def run_ik(target) -> joint_angles | None:")).toBe("joint_angles | None");
  });

  it("works with no trailing colon", () => {
    expect(extractReturnAnnotation("run_ik(target) -> joint_angles | None")).toBe("joint_angles | None");
  });

  it("passes a bare annotation through unchanged", () => {
    expect(extractReturnAnnotation("joint_angles | None")).toBe("joint_angles | None");
  });
});

describe("returnPortGroups — declaration string in, port groups out", () => {
  it("run_ik's own sketch: two distinct groups", () => {
    expect(returnPortGroups("joint_angles | None")).toEqual([[{ id: "joint_angles", label: "joint_angles" }], [{ id: "None", label: "None" }]]);
  });

  it("same return types collapse to ONE group", () => {
    expect(returnPortGroups("joint_angles | joint_angles")).toEqual([[{ id: "joint_angles", label: "joint_angles" }]]);
  });

  it("no union at all is one group", () => {
    expect(returnPortGroups("joint_angles")).toEqual([[{ id: "joint_angles", label: "joint_angles" }]]);
  });

  it("three distinct members -> three groups", () => {
    expect(returnPortGroups("float | int | None").map((g) => g[0].id)).toEqual(["float", "int", "None"]);
  });

  it("a repeat anywhere in the union folds into its first group, not just adjacent repeats", () => {
    expect(returnPortGroups("bool | int | bool").map((g) => g[0].id)).toEqual(["bool", "int"]);
  });

  it("does not split inside brackets", () => {
    expect(returnPortGroups("dict[str, int | float] | None").map((g) => g[0].id)).toEqual(["dict[str, int | float]", "None"]);
  });

  it("empty annotation is zero groups", () => {
    expect(returnPortGroups("")).toEqual([]);
    expect(returnPortGroups("   ")).toEqual([]);
  });
});

describe("railForReturnAnnotation", () => {
  it("run_ik(): two ports, one divider between them", () => {
    const rail = railForReturnAnnotation("def run_ik(target) -> joint_angles | None:");
    expect(rail.items.map((i) => i.id)).toEqual(["joint_angles", "None"]);
    expect(rail.dividerAfter).toEqual([0]);
  });

  it("same return types: one port, NO divider", () => {
    const rail = railForReturnAnnotation("joint_angles | joint_angles");
    expect(rail.items.map((i) => i.id)).toEqual(["joint_angles"]);
    expect(rail.dividerAfter).toEqual([]);
  });

  it("three groups: two dividers, both interior", () => {
    const rail = railForReturnAnnotation("float | int | None");
    expect(rail.items).toHaveLength(3);
    expect(rail.dividerAfter).toEqual([0, 1]);
  });

  it("threads an explicit state onto every port", () => {
    const rail = railForReturnAnnotation("a | b", "wired");
    expect(rail.items.every((i) => i.state === "wired")).toBe(true);
  });
});
