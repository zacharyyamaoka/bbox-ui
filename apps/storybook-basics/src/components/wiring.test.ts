// src/components/wiring.test.ts — ACCEPTANCE for docs/CONTROL-FLOW-PLAN.md
// lane D (the keep-out rule). Off-limits to builders. Red until
// `wiring.ts`'s `keepOutsFor` lands.

import { describe, expect, it } from "vitest";

import { fanWires, keepOutsFor, type KeepOutRect, type Wire } from "./wiring";

const RECTS: KeepOutRect[] = [
  { id: "src", x: 0, y: 0, w: 100, h: 60 },
  { id: "loop", x: 200, y: -40, w: 400, h: 300 },
  { id: "merge", x: 260, y: 40, w: 120, h: 60 },
  { id: "arm-if", x: 200, y: 20, w: 400, h: 120 },
  { id: "bystander", x: 300, y: -200, w: 80, h: 40 },
  { id: "enc", x: 700, y: 0, w: 100, h: 60 },
];

describe("keepOutsFor — everything except my endpoints and what I flow through", () => {
  it("excludes both endpoint blocks and keeps input order", () => {
    const wire: Pick<Wire, "from" | "to"> = { from: { blockId: "src", portId: "out" }, to: { blockId: "enc", portId: "in" } };
    expect(keepOutsFor(wire, RECTS)).toEqual([
      { x: 200, y: -40, w: 400, h: 300 },
      { x: 260, y: 40, w: 120, h: 60 },
      { x: 200, y: 20, w: 400, h: 120 },
      { x: 300, y: -200, w: 80, h: 40 },
    ]);
  });

  it("excludes every container in `through` — a cable INTO a region's member may enter the region and its arm, but not a sibling block", () => {
    const wire: Pick<Wire, "from" | "to" | "through"> = {
      from: { blockId: "src", portId: "pose" },
      to: { blockId: "merge", portId: "pose" },
      through: ["arm-if", "loop"],
    };
    expect(keepOutsFor(wire, RECTS)).toEqual([
      { x: 300, y: -200, w: 80, h: 40 },
      { x: 700, y: 0, w: 100, h: 60 },
    ]);
  });

  it("strips the id: the result is a plain ElbowRect list, and always a new array", () => {
    const wire = { from: { blockId: "a", portId: "x" }, to: { blockId: "b", portId: "y" } };
    const out = keepOutsFor(wire, RECTS);
    for (const rect of out) expect(Object.keys(rect).sort()).toEqual(["h", "w", "x", "y"]);
    expect(out).not.toBe(RECTS);
    expect(keepOutsFor(wire, [])).toEqual([]);
  });

  it("a self-loop (the carried value) excludes its one block once and keeps the rest", () => {
    const wire = { from: { blockId: "merge", portId: "Pose" }, to: { blockId: "merge", portId: "pose" }, through: ["loop"] };
    expect(keepOutsFor(wire, RECTS).map((rect) => rect.x)).toEqual([0, 200, 300, 700]);
  });
});

describe("fanWires is untouched by the new fields", () => {
  it("still fans duplicates when `through`/`badge` ride along", () => {
    const wires: Wire[] = [
      { id: "1", from: { blockId: "a", portId: "x" }, to: { blockId: "b", portId: "y" }, through: ["r"], badge: "z⁻¹" },
      { id: "2", from: { blockId: "a", portId: "x" }, to: { blockId: "b", portId: "y" } },
    ];
    const fans = fanWires(wires);
    expect(fans).toHaveLength(2);
    expect(fans[0].offset).not.toEqual(fans[1].offset);
  });
});
