// src/scene/boundary.test.ts — Zach's show/hide rule, and the v1 heuristic,
// each pinned to the sentence it came from.
//
// The classification tests are written as his sentence read back: one test
// per clause, quoting the clause. If a future change makes one fail, the
// failure message says which of his rules broke, not which branch moved.

import { describe, expect, it } from "vitest";

import {
  DAG_HEURISTIC_LIMIT,
  classifyBoundary,
  containerPortEdges,
  crossingEdges,
  crossingGeometryPolicy,
  dagPolarityPolicy,
  promoteBoundary,
  promotedDirectionOf,
  promotedPortIds,
  promotedTypeOf,
  surfacingEdges,
  type PromotionInput,
} from "./boundary";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import { REGION_NODE_TYPE } from "./region";
import type { BlockScene } from "./scene";

const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);
const typeOf: PortTypeOf = ({ portId }) => (portId === "out" ? ["pose", "frame"] : portId === "in" ? ["pose"] : undefined);

/** `src → a → b → c`, `b → sink`, plus an unrelated pair. */
function scene(): BlockScene {
  return {
    nodes: ["src", "a", "b", "c", "sink", "other", "other2"].map((id, index) => ({
      id,
      position: { x: index * 100, y: 0 },
      data: {},
    })),
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in" },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

const INSIDE = ["a", "b", "c"];

function kindOf(report: ReturnType<typeof classifyBoundary>, edgeId: string): string {
  return report.edges.find((hit) => hit.edge.id === edgeId)!.kind;
}

/* ------------------------------------------------------------------ */
/* His sentence, clause by clause                                      */
/* ------------------------------------------------------------------ */

describe('"From inside member to inside member those can all be hidden"', () => {
  it("classes them interior and does not surface them", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    expect(kindOf(report, "e2")).toBe("interior");
    expect(kindOf(report, "e3")).toBe("interior");
    expect(report.edges.filter((hit) => hit.kind === "interior").every((hit) => hit.surfaces === false)).toBe(true);
  });
});

describe('"any traces going from outside members to inside members"', () => {
  it("classes them by DIRECTION, and surfaces both", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    expect(kindOf(report, "e1")).toBe("inbound");
    expect(kindOf(report, "e4")).toBe("outbound");
    expect(surfacingEdges(report).map((hit) => hit.edge.id)).toEqual(["e1", "e4"]);
  });

  it("names which end is inside and which is out", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    const inbound = report.edges.find((hit) => hit.edge.id === "e1")!;
    expect(inbound.inner).toEqual({ nodeId: "a", portId: "in" });
    expect(inbound.outer).toEqual({ nodeId: "src", portId: "out" });
    const outbound = report.edges.find((hit) => hit.edge.id === "e4")!;
    expect(outbound.inner).toEqual({ nodeId: "b", portId: "out" });
    expect(outbound.outer).toEqual({ nodeId: "sink", portId: "in" });
  });
});

describe('"any traces going to ports on the parent block itself"', () => {
  const nested: BlockScene = {
    nodes: [
      { id: "box", type: REGION_NODE_TYPE, position: { x: 0, y: 0 }, data: {} },
      { id: "kid", parentId: "box", position: { x: 10, y: 10 }, data: {} },
      { id: "far", position: { x: 500, y: 0 }, data: {} },
    ],
    edges: [
      { id: "stub", source: "kid", sourceHandle: "out", target: "box", targetHandle: "p" },
      { id: "wire", source: "box", sourceHandle: "p", target: "far", targetHandle: "in" },
    ],
  };

  it("surfaces the outer half and hides the interior stub", () => {
    const report = classifyBoundary(nested, { containerId: "box" });
    expect(kindOf(report, "wire")).toBe("port-outer");
    expect(kindOf(report, "stub")).toBe("port-inner");
    expect(surfacingEdges(report).map((hit) => hit.edge.id)).toEqual(["wire"]);
  });

  it("derives the inside set from the container's own children", () => {
    const report = classifyBoundary(nested, { containerId: "box" });
    expect([...report.inside]).toEqual(["kid"]);
    // The container is never inside itself — its ports ARE the boundary.
    expect(report.inside.has("box")).toBe(false);
  });

  it("splits a container's edges for a caller that wants them separately", () => {
    const split = containerPortEdges(nested, "box");
    expect(split.inner.map((edge) => edge.id)).toEqual(["stub"]);
    expect(split.outer.map((edge) => edge.id)).toEqual(["wire"]);
  });
});

describe("the classes partition the edge list", () => {
  it("classifies every edge exactly once, in scene order", () => {
    const input = scene();
    const report = classifyBoundary(input, { inside: INSIDE });
    expect(report.edges).toHaveLength(input.edges.length);
    expect(report.edges.map((hit) => hit.edge.id)).toEqual(input.edges.map((edge) => edge.id));
    expect(kindOf(report, "e5")).toBe("exterior");
  });

  it("expands the inside set TRANSITIVELY — containment is ownership", () => {
    const input = scene();
    input.nodes = input.nodes.map((node) => (node.id === "c" ? { ...node, parentId: "b" } : node));
    // Selecting only `b` still puts `c` inside, so b→c is interior.
    const report = classifyBoundary(input, { inside: ["b"] });
    expect([...report.inside].sort()).toEqual(["b", "c"]);
    expect(kindOf(report, "e3")).toBe("interior");
  });

  it("is total on an empty inside set — every edge is exterior", () => {
    const report = classifyBoundary(scene(), { inside: [] });
    expect(report.edges.every((hit) => hit.kind === "exterior")).toBe(true);
    expect(crossingEdges(report)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The v1 heuristic, in his words                                      */
/* ------------------------------------------------------------------ */

describe('v1: "connecting to an input port of an outside member → out the right side of the header"', () => {
  const base: Omit<PromotionInput, "kind" | "inner" | "outer" | "edge"> = { directionOf };

  it("puts a cable into an outside INPUT on the right, as a source", () => {
    const decision = dagPolarityPolicy({
      ...base,
      kind: "outbound",
      inner: { nodeId: "b", portId: "out" },
      outer: { nodeId: "sink", portId: "in" },
      edge: { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
    });
    expect(decision).toEqual({ side: "right", direction: "source", seat: "header", band: "block", by: "polarity" });
  });

  it("mirrors it: a cable from an outside OUTPUT lands left, as a sink", () => {
    const decision = dagPolarityPolicy({
      ...base,
      kind: "inbound",
      inner: { nodeId: "a", portId: "in" },
      outer: { nodeId: "src", portId: "out" },
      edge: { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in" },
    });
    expect(decision).toMatchObject({ side: "left", direction: "sink", by: "polarity" });
  });

  it("falls back to the edge's own order when no polarity is known — and SAYS so", () => {
    const decision = dagPolarityPolicy({
      kind: "outbound",
      inner: { nodeId: "b", portId: "out" },
      outer: { nodeId: "sink", portId: "in" },
      edge: { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
    });
    // Right answer, but reached by assumption, not by reading — which is
    // exactly `DAG_HEURISTIC_LIMIT.secondCase`.
    expect(decision.side).toBe("right");
    expect(decision.by).toBe("gesture");
  });

  it("uses HIS chosen mechanism — the header seat, not an overloaded port edge", () => {
    const decision = dagPolarityPolicy({
      ...base,
      kind: "outbound",
      inner: { nodeId: "b", portId: "out" },
      outer: { nodeId: "sink", portId: "in" },
      edge: { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
    });
    expect(decision.seat).toBe("header");
    // `"block"` is the band that spans the header; `"body"` cannot reach
    // header height (blockPort.layout.ts:155).
    expect(decision.band).toBe("block");
  });
});

describe("crossingGeometryPolicy — the falsifier", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const input: PromotionInput = {
    kind: "outbound",
    inner: { nodeId: "b", portId: "out" },
    outer: { nodeId: "sink", portId: "in" },
    edge: { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
    directionOf,
  };

  it("reads the side off the wall the cable actually meets", () => {
    const decision = crossingGeometryPolicy({
      ...input,
      box,
      geometry: { start: { x: 50, y: 20 }, end: { x: 400, y: 20 } },
    });
    expect(decision).toEqual({ side: "right", direction: "source", seat: "rail", t: 0.2, band: "block", by: "geometry" });
  });

  it("contradicts v1 on a leftward cable — and keeps the polarity v1 got right", () => {
    const decision = crossingGeometryPolicy({
      ...input,
      box,
      geometry: { start: { x: 50, y: 70 }, end: { x: -400, y: 70 } },
    });
    expect(decision.side).toBe("left");
    expect(dagPolarityPolicy(input).side).toBe("right");
    // Polarity is not a geometric fact. Moving it with the side would make
    // the promoted port refuse its own cable on the next validateConnection.
    expect(decision.direction).toBe("source");
    expect(decision.t).toBe(0.7);
  });

  it("falls back to v1 rather than guessing when either input is missing", () => {
    expect(crossingGeometryPolicy({ ...input, box }).by).toBe("polarity");
    expect(crossingGeometryPolicy({ ...input, geometry: { start: { x: 0, y: 0 }, end: { x: 9, y: 9 } } }).by).toBe("polarity");
    // A cable that never crosses this box at all is also a fall-back, not
    // a crash and not an invented side.
    expect(crossingGeometryPolicy({ ...input, box, geometry: { start: { x: 500, y: 0 }, end: { x: 600, y: 0 } } }).by).toBe("polarity");
  });

  it("states the limit it exists to demonstrate", () => {
    expect(DAG_HEURISTIC_LIMIT.name).toBe("feedback edge");
    expect(DAG_HEURISTIC_LIMIT.why).toContain("polarity is still correct and the SIDE is wrong");
    expect(DAG_HEURISTIC_LIMIT.whyItIsNotJustABug).toContain("allowCycles");
  });
});

/* ------------------------------------------------------------------ */
/* Promotion                                                           */
/* ------------------------------------------------------------------ */

describe("promoteBoundary", () => {
  const mintPortId = ({ inner }: { inner: { nodeId: string; portId: string } }) => `${inner.nodeId}_${inner.portId}`;

  it("makes one port per inner endpoint, in first-seen scene order", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    const { ports } = promoteBoundary(report, { directionOf, typeOf, mintPortId });
    expect(ports.map((port) => port.id)).toEqual(["a_in", "b_out"]);
    expect(ports.map((port) => port.side)).toEqual(["left", "right"]);
  });

  it("narrows a multi-tag inner port to ONE declared type — and that is stated", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    const { ports } = promoteBoundary(report, { directionOf, typeOf, mintPortId });
    // `typeOf("b/out")` returns ["pose", "frame"]; a promoted port carries
    // one string because `arePortTypesCompatible` compares one to one.
    expect(ports.find((port) => port.id === "b_out")!.portType).toBe("pose");
  });

  it("hands back resolvers so the collapsed container can be re-judged", () => {
    const report = classifyBoundary(scene(), { inside: INSIDE });
    const { ports } = promoteBoundary(report, { directionOf, typeOf, mintPortId });
    expect(promotedPortIds(ports)).toEqual(["a_in", "b_out"]);
    expect(promotedTypeOf("R", ports)({ nodeId: "R", portId: "b_out" })).toEqual(["pose"]);
    expect(promotedTypeOf("R", ports)({ nodeId: "elsewhere", portId: "b_out" })).toBeUndefined();
    expect(promotedDirectionOf("R", ports)({ nodeId: "R", portId: "a_in" })).toBe("sink");
  });

  it("handles an end with NO handle as portId '' rather than dropping it", () => {
    const input = scene();
    input.edges.push({ id: "bare", source: "b", target: "sink" });
    const report = classifyBoundary(input, { inside: INSIDE });
    const { ports } = promoteBoundary(report, { directionOf, mintPortId });
    const bare = ports.find((port) => port.inner.nodeId === "b" && port.inner.portId === "")!;
    expect(bare).toBeDefined();
    // No handle, no type lookup — asking `typeOf` for the node's "" port
    // would be asking about a port that does not exist.
    expect(bare.portType).toBeUndefined();
  });

  it("returns no ports when nothing crosses", () => {
    const report = classifyBoundary(scene(), { inside: ["other", "other2"] });
    expect(promoteBoundary(report, { directionOf, mintPortId }).ports).toEqual([]);
  });
});
