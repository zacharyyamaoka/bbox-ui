/**
 * src/components/trace.handles.test.ts — the pure handle derivation
 * (docs/TRACE-CONTROL-POINTS-PLAN.md D3, A6). `pnpm exec vitest
 * --project=unit run`.
 */
import { describe, expect, it } from "vitest";

import { traceHandles } from "./trace.handles";
import type { Point } from "./trace.layout";

describe("traceHandles — A6, a 3-vertex polyline with long segments", () => {
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: 60, y: 0 }, // the one bend
    { x: 120, y: 40 },
  ];

  it("returns exactly 2 terminal + 1 bend + 2 virtual", () => {
    const handles = traceHandles(points);
    const byKind = (kind: string) => handles.filter((h) => h.kind === kind);
    expect(byKind("terminal")).toHaveLength(2);
    expect(byKind("bend")).toHaveLength(1);
    expect(byKind("virtual")).toHaveLength(2);
    expect(handles).toHaveLength(5);
  });

  it("ids and positions match the contract", () => {
    const handles = traceHandles(points);
    const byId = (id: string) => handles.find((h) => h.id === id)!;

    expect(byId("start")).toMatchObject({ kind: "terminal", x: 0, y: 0, index: 0 });
    expect(byId("end")).toMatchObject({ kind: "terminal", x: 120, y: 40, index: 0 });
    expect(byId("bend:0")).toMatchObject({ kind: "bend", x: 60, y: 0, index: 0 });

    // The virtuals sit at the two segment midpoints.
    expect(byId("virtual:0")).toMatchObject({ kind: "virtual", x: 30, y: 0, index: 0 });
    expect(byId("virtual:1")).toMatchObject({ kind: "virtual", x: 90, y: 20, index: 1 });
  });
});

describe("traceHandles — a stubby segment gets no virtual", () => {
  it("omits a virtual handle under minVirtualSegmentPx (default 24)", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // 10px — under the default 24px floor
      { x: 110, y: 0 },
    ];
    const handles = traceHandles(points);
    const virtualIds = handles.filter((h) => h.kind === "virtual").map((h) => h.id);
    expect(virtualIds).toEqual(["virtual:1"]);
  });

  it("respects a custom minVirtualSegmentPx", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(traceHandles(points, { minVirtualSegmentPx: 5 }).some((h) => h.kind === "virtual")).toBe(true);
    expect(traceHandles(points, { minVirtualSegmentPx: 20 }).some((h) => h.kind === "virtual")).toBe(false);
  });
});

describe("traceHandles — edge cases", () => {
  it("returns [] for fewer than 2 points", () => {
    expect(traceHandles([])).toEqual([]);
    expect(traceHandles([{ x: 0, y: 0 }])).toEqual([]);
  });

  it("a plain 2-point chord has 2 terminals and, if long enough, 1 virtual, no bends", () => {
    const points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const handles = traceHandles(points);
    expect(handles.filter((h) => h.kind === "bend")).toHaveLength(0);
    expect(handles.filter((h) => h.kind === "virtual")).toHaveLength(1);
    expect(handles.find((h) => h.id === "virtual:0")).toMatchObject({ x: 50, y: 0, index: 0 });
  });

  it("virtual index matches where a new bend would land in the bends array", () => {
    // points = [start, bend0, bend1, end] -> segments 0,1,2 -> new-bend
    // indices 0,1,2 respectively (inserting before bend0, between bend0 and
    // bend1, after bend1).
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 60, y: 0 },
      { x: 90, y: 0 },
    ];
    const handles = traceHandles(points);
    const virtualIndexes = handles
      .filter((h) => h.kind === "virtual")
      .map((h) => h.index)
      .sort((a, b) => a - b);
    expect(virtualIndexes).toEqual([0, 1, 2]);
  });
});
