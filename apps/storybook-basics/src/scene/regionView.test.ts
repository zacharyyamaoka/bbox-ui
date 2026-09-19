// src/scene/regionView.test.ts — ACCEPTANCE for docs/CONTROL-FLOW-PLAN.md
// lane E, committed before any builder existed. Off-limits to builders.
// Red until `regionView.ts`'s body lands.

import { describe, expect, it } from "vitest";

import { ARM_NODE_TYPE } from "./controlFlow";
import type { PortDirectionOf } from "./lint";
import { REGION_NODE_TYPE } from "./region";
import { projectOpaqueRegions } from "./regionView";
import type { BlockScene, SceneNode } from "./scene";

type Data = { opaque?: boolean };

/** Same loop as controlFlow.test.ts, with a `data.opaque` flag the test flips. */
function loopScene(opaque: boolean): BlockScene<Data> {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 0 }, data: {} },
      { id: "loop", type: REGION_NODE_TYPE, position: { x: 100, y: 0 }, data: { opaque } },
      { id: "merge", parentId: "loop", position: { x: 40, y: 80 }, data: {} },
      { id: "smooth", parentId: "loop", position: { x: 260, y: 80 }, data: {} },
      { id: "enc", position: { x: 700, y: 0 }, data: {} },
    ],
    edges: [
      { id: "e-iterable", source: "src", sourceHandle: "others", target: "loop", targetHandle: "Iterable" },
      { id: "e-iter", source: "loop", sourceHandle: "Iter", target: "merge", targetHandle: "other" },
      { id: "e-seed", source: "src", sourceHandle: "pose", target: "merge", targetHandle: "pose" },
      { id: "e-ms", source: "merge", sourceHandle: "Pose", target: "smooth", targetHandle: "in" },
      { id: "e-carry", source: "merge", sourceHandle: "Pose", target: "merge", targetHandle: "pose", data: { variant: "delayed" } },
      { id: "e-out", source: "smooth", sourceHandle: "out", target: "enc", targetHandle: "pose" },
    ],
  };
}

const SINKS = new Set(["Iterable", "other", "pose", "in"]);
const directionOf: PortDirectionOf = ({ portId }) => (SINKS.has(portId) ? "sink" : "source");
const isOpaque = (node: SceneNode<Data>) => node.data.opaque === true;

describe("expanded is free", () => {
  it("returns the SAME node and edge arrays when no region is opaque", () => {
    const scene = loopScene(false);
    const projection = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(projection.nodes).toBe(scene.nodes);
    expect(projection.edges).toBe(scene.edges);
    expect(projection.regions).toEqual([]);
  });
});

describe("an opaque loop", () => {
  it("never touches a node and never mutates the input", () => {
    const scene = loopScene(true);
    const before = JSON.stringify(scene);
    const projection = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(projection.nodes).toBe(scene.nodes);
    expect(JSON.stringify(scene)).toBe(before);
  });

  it("re-points a crossing edge's hidden end at the region's promoted port and keeps its id, data and outer end", () => {
    const scene = loopScene(true);
    const { edges } = projectOpaqueRegions(scene, { isOpaque, directionOf });
    const seed = edges.find((edge) => edge.id === "e-seed");
    expect(seed).toMatchObject({ id: "e-seed", source: "src", sourceHandle: "pose", target: "loop", targetHandle: "merge/pose" });
    const out = edges.find((edge) => edge.id === "e-out");
    expect(out).toMatchObject({ id: "e-out", source: "loop", sourceHandle: "smooth/out", target: "enc", targetHandle: "pose" });
  });

  it("keeps a port-outer edge as the SAME object and drops interior and port-inner edges", () => {
    const scene = loopScene(true);
    const { edges } = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(edges.find((edge) => edge.id === "e-iterable")).toBe(scene.edges[0]);
    expect(edges.map((edge) => edge.id)).toEqual(["e-iterable", "e-seed", "e-out"]);
  });

  it("reports the card: one promoted port per hidden endpoint, with a side, and what it hides", () => {
    const scene = loopScene(true);
    const { regions } = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(regions).toHaveLength(1);
    const [loop] = regions;
    expect(loop.regionId).toBe("loop");
    expect(loop.hidden).toEqual({ nodes: 2, arms: 0, edges: 3 });
    const byId = new Map(loop.ports.map((port) => [port.id, port]));
    expect(byId.get("merge/pose")).toMatchObject({ direction: "sink", side: "left", inner: { nodeId: "merge", portId: "pose" } });
    expect(byId.get("smooth/out")).toMatchObject({ direction: "source", side: "right", inner: { nodeId: "smooth", portId: "out" } });
  });

  it("honours a caller-minted port id", () => {
    const scene = loopScene(true);
    const { edges, regions } = projectOpaqueRegions(scene, {
      isOpaque,
      directionOf,
      mintPortId: (inner) => `${inner.portId}@${inner.nodeId}`,
    });
    expect(edges.find((edge) => edge.id === "e-seed")?.targetHandle).toBe("pose@merge");
    expect(regions[0].ports.map((port) => port.id).sort()).toEqual(["out@smooth", "pose@merge"]);
  });
});

describe("nesting — the outermost opaque region wins", () => {
  /** outer (opaque) ▸ inner region ▸ leaf; src → leaf; leaf → sink. */
  function nested(innerOpaque: boolean): BlockScene<Data> {
    return {
      nodes: [
        { id: "src", position: { x: 0, y: 0 }, data: {} },
        { id: "outer", type: REGION_NODE_TYPE, position: { x: 100, y: 0 }, data: { opaque: true } },
        { id: "arm", type: ARM_NODE_TYPE, parentId: "outer", position: { x: 0, y: 0 }, data: {} },
        { id: "inner", type: REGION_NODE_TYPE, parentId: "arm", position: { x: 10, y: 10 }, data: { opaque: innerOpaque } },
        { id: "leaf", parentId: "inner", position: { x: 5, y: 5 }, data: {} },
        { id: "sink", position: { x: 900, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e-in", source: "src", sourceHandle: "a", target: "leaf", targetHandle: "in" },
        { id: "e-out", source: "leaf", sourceHandle: "out", target: "sink", targetHandle: "in" },
      ],
    };
  }

  it.each([false, true])("projects a deep edge onto the OUTER region (inner opaque: %s) and reports only the outer card", (innerOpaque) => {
    const scene = nested(innerOpaque);
    const { edges, regions } = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(edges.find((edge) => edge.id === "e-in")).toMatchObject({ target: "outer", targetHandle: "leaf/in" });
    expect(edges.find((edge) => edge.id === "e-out")).toMatchObject({ source: "outer", sourceHandle: "leaf/out" });
    expect(regions.map((region) => region.regionId)).toEqual(["outer"]);
    expect(regions[0].hidden).toEqual({ nodes: 2, arms: 1, edges: 0 });
  });
});

describe("two opaque regions", () => {
  it("re-points BOTH ends of an edge that runs from inside one into the other", () => {
    const scene: BlockScene<Data> = {
      nodes: [
        { id: "a", type: REGION_NODE_TYPE, position: { x: 0, y: 0 }, data: { opaque: true } },
        { id: "a1", parentId: "a", position: { x: 0, y: 0 }, data: {} },
        { id: "b", type: REGION_NODE_TYPE, position: { x: 400, y: 0 }, data: { opaque: true } },
        { id: "b1", parentId: "b", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [{ id: "e", source: "a1", sourceHandle: "out", target: "b1", targetHandle: "in" }],
    };
    const { edges, regions } = projectOpaqueRegions(scene, { isOpaque, directionOf });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ id: "e", source: "a", sourceHandle: "a1/out", target: "b", targetHandle: "b1/in" });
    expect(regions.map((region) => region.regionId)).toEqual(["a", "b"]);
  });
});
