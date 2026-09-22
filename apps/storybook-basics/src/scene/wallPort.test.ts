// src/scene/wallPort.test.ts — wall crossings (detection), faces, insertion
// order, the chain split with its link set, and the unsplit round trip.
//
// The clipper itself is `portEdgeCrossing.test.ts`'s and the donor's to
// test; these cover what this module adds. Every expected number is
// readable off the fixtures by eye. The detection cases are the donor's
// (52a1b92 `wallPort.test.ts` :46-98), renamed frames → boxes.

import { describe, expect, it } from "vitest";

import type { ElbowRect } from "../components/elbow";
import { edgeRef, portRef } from "./links";
import type { BlockScene } from "./scene";
import {
  INNER_FACE_SUFFIX,
  innerFaceHandle,
  insertionIndex,
  isInnerFaceHandle,
  outerPortIdOf,
  splitEdgeAtWalls,
  unsplitWallPort,
  wallCrossings,
  wallFacesFor,
  wallPoint,
  withFaceTypes,
  withInnerFaces,
  withWallFaces,
  type MintedWallPort,
} from "./wallPort";

/** A frame 200 wide, 100 tall, its left wall at x = 100. */
const BOX: ElbowRect = { x: 100, y: 0, w: 200, h: 100 };
const BOXES = new Map([["F", BOX]]);

type NodeData = { ports?: Record<string, string[]> };
type EdgeData = { markerEnd?: string; color?: string };

function scene(): BlockScene<NodeData, EdgeData> {
  return {
    nodes: [
      { id: "F", type: "frame", position: { x: 100, y: 0 }, data: { ports: {} } },
      { id: "inner", parentId: "F", position: { x: 80, y: 30 }, data: {} },
      { id: "outer", position: { x: 0, y: 30 }, data: {} },
    ],
    edges: [
      { id: "e0", source: "x", target: "y" },
      { id: "e1", source: "outer", sourceHandle: "out", target: "inner", targetHandle: "in", data: { color: "red" } },
      { id: "e2", source: "a", target: "b" },
    ],
  };
}

/** The host's `addPort`/`removePort` for this fixture: `data.ports[side]`. */
const ops = {
  mintPortId: (crossing: { containerId: string }, index: number) => `${crossing.containerId}-p${index}`,
  addPort: (s: BlockScene<NodeData, EdgeData>, port: MintedWallPort) => ({
    ...s,
    nodes: s.nodes.map((node) =>
      node.id === port.containerId
        ? { ...node, data: { ...node.data, ports: { ...node.data.ports, [port.crossing.side]: [...(node.data.ports?.[port.crossing.side] ?? []), port.portId] } } }
        : node,
    ),
  }),
};
const removePort = (s: BlockScene<NodeData, EdgeData>, port: { containerId: string; portId: string }) => ({
  ...s,
  nodes: s.nodes.map((node) =>
    node.id === port.containerId
      ? { ...node, data: { ...node.data, ports: Object.fromEntries(Object.entries(node.data.ports ?? {}).map(([side, ids]) => [side, ids.filter((id) => id !== port.portId)])) } }
      : node,
  ),
});

describe("wallCrossings — detection, always computable", () => {
  it("finds the one place an entering cable meets the left wall, at the wall's own t", () => {
    const points = [
      { x: 60, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 60 },
      { x: 180, y: 60 },
    ];
    const [hit, ...rest] = wallCrossings({ points, boxes: BOXES, through: ["F"] });
    expect(rest).toEqual([]);
    expect(hit.containerId).toBe("F");
    expect(hit.side).toBe("left");
    expect(hit.direction).toBe("enter");
    expect(hit.point).toEqual({ x: 100, y: 60 });
    expect(hit.t).toBeCloseTo(0.6, 10);
  });

  it("ignores a container the cable is not genuinely inside — a bypass is not a scope change", () => {
    const points = [
      { x: 60, y: 50 },
      { x: 340, y: 50 },
    ];
    expect(wallCrossings({ points, boxes: BOXES, through: [] })).toEqual([]);
    const both = wallCrossings({ points, boxes: BOXES, through: ["F"] });
    expect(both.map((hit) => [hit.side, hit.direction])).toEqual([
      ["left", "enter"],
      ["right", "exit"],
    ]);
  });

  it("skips a container that is one of the wire's own ends — a wall port's cable starts ON the wall", () => {
    const points = [
      { x: 100, y: 20 },
      { x: 180, y: 20 },
    ];
    expect(wallCrossings({ points, boxes: BOXES, through: ["F"], ends: ["F", "inner"] })).toEqual([]);
  });

  it("orders crossings of nested boxes by distance along the path", () => {
    const boxes = new Map<string, ElbowRect>([
      ["innerFrame", { x: 150, y: 10, w: 100, h: 80 }],
      ["F", BOX],
    ]);
    const points = [
      { x: 60, y: 50 },
      { x: 200, y: 50 },
    ];
    expect(wallCrossings({ points, boxes, through: ["innerFrame", "F"] }).map((hit) => hit.containerId)).toEqual(["F", "innerFrame"]);
  });

  it("wallPoint is alongSide's inverse on every wall", () => {
    expect(wallPoint(BOX, "left", 0.25)).toEqual({ x: 100, y: 25 });
    expect(wallPoint(BOX, "right", 1)).toEqual({ x: 300, y: 100 });
    expect(wallPoint(BOX, "top", 0.5)).toEqual({ x: 200, y: 0 });
    expect(wallPoint(BOX, "bottom", 0)).toEqual({ x: 100, y: 100 });
  });
});

describe("faces — two per wall port, explicit", () => {
  it("names the inner face as a second handle on the same node, and reads it back", () => {
    expect(innerFaceHandle("p")).toBe(`p${INNER_FACE_SUFFIX}`);
    expect(isInnerFaceHandle("p@inner")).toBe(true);
    expect(isInnerFaceHandle("p")).toBe(false);
    expect(isInnerFaceHandle("@inner")).toBe(false);
    expect(outerPortIdOf("p@inner")).toBe("p");
    expect(outerPortIdOf("in1")).toBe("in1");
  });

  it("an input port's inner face is a SOURCE for the members; an output's is a sink", () => {
    expect(wallFacesFor("sink")).toEqual({ outer: "sink", inner: "source" });
    expect(wallFacesFor("source")).toEqual({ outer: "source", inner: "sink" });
  });

  it("withInnerFaces adds the inner handles only for containers; withWallFaces resolves each face; types follow the outer id", () => {
    const base = (nodeId: string) => (nodeId === "F" ? ["p"] : nodeId === "kid" ? ["in"] : undefined);
    const ports = withInnerFaces(base, (nodeId) => nodeId === "F");
    expect(ports("F")).toEqual(["p", "p@inner"]);
    expect(ports("kid")).toEqual(["in"]);
    expect(ports("ghost")).toBeUndefined();

    const baseDirection = (ref: { nodeId: string; portId: string }) => (ref.nodeId === "kid" ? ("sink" as const) : undefined);
    const direction = withWallFaces(baseDirection, (ref) => (ref.nodeId === "F" && ref.portId === "p" ? wallFacesFor("sink") : undefined));
    expect(direction({ nodeId: "F", portId: "p" })).toBe("sink");
    expect(direction({ nodeId: "F", portId: "p@inner" })).toBe("source");
    expect(direction({ nodeId: "kid", portId: "in" })).toBe("sink");
    expect(direction({ nodeId: "F", portId: "unknown" })).toBeUndefined();

    const typeOf = withFaceTypes((ref) => (ref.nodeId === "F" && ref.portId === "p" ? ["Pose"] : undefined));
    expect(typeOf({ nodeId: "F", portId: "p@inner" })).toEqual(["Pose"]);
    expect(typeOf({ nodeId: "F", portId: "p" })).toEqual(["Pose"]);
  });
});

describe("insertionIndex — where a port at t slots in", () => {
  it("lands before the first port further along the wall, at the end otherwise, after a tie", () => {
    expect(insertionIndex([], 0.5)).toBe(0);
    expect(insertionIndex([0.2, 0.6], 0.4)).toBe(1);
    expect(insertionIndex([0.2, 0.6], 0.1)).toBe(0);
    expect(insertionIndex([0.2, 0.6], 0.9)).toBe(2);
    expect(insertionIndex([0.2, 0.6], 0.6)).toBe(2);
  });
});

describe("splitEdgeAtWalls — one cable becomes a chain through a REAL port, as one linked set", () => {
  const enterLeft = wallCrossings({
    points: [
      { x: 60, y: 60 },
      { x: 180, y: 60 },
    ],
    boxes: BOXES,
    through: ["F"],
  });

  it("replaces the edge IN PLACE with two segments that share the new port's two faces, and links all three", () => {
    const { scene: next, ports, link } = splitEdgeAtWalls(scene(), "e1", enterLeft, ops);
    expect(ports.map((port) => [port.containerId, port.portId, port.crossing.side])).toEqual([["F", "F-p0", "left"]]);
    expect(next.nodes.find((node) => node.id === "F")!.data.ports).toEqual({ left: ["F-p0"] });
    expect(next.edges.map((edge) => edge.id)).toEqual(["e0", "e1~0", "e1~1", "e2"]);
    const [first, second] = next.edges.slice(1, 3);
    expect([first.source, first.sourceHandle, first.target, first.targetHandle]).toEqual(["outer", "out", "F", "F-p0"]);
    expect([second.source, second.sourceHandle, second.target, second.targetHandle]).toEqual(["F", "F-p0@inner", "inner", "in"]);
    expect(link).toEqual({ id: "link:e1", members: [edgeRef("e1~0"), portRef("F", "F-p0"), edgeRef("e1~1")] });
    expect(next.links).toEqual([link]);
  });

  it("keeps the arrowhead on the original target only, and every other style field on both halves", () => {
    const { scene: next } = splitEdgeAtWalls(scene(), "e1", enterLeft, ops);
    const [first, second] = next.edges.slice(1, 3);
    expect(first.data).toEqual({ color: "red", markerEnd: "none" });
    expect(second.data).toEqual({ color: "red" });
  });

  it("lands an EXITING cable on the inner face first and leaves by the outer one", () => {
    const exit = wallCrossings({
      points: [
        { x: 180, y: 60 },
        { x: 60, y: 60 },
      ],
      boxes: BOXES,
      through: ["F"],
    });
    expect(exit[0].direction).toBe("exit");
    const { scene: next } = splitEdgeAtWalls(scene(), "e1", exit, ops);
    const [first, second] = next.edges.slice(1, 3);
    expect(first.targetHandle).toBe("F-p0@inner");
    expect(second.sourceHandle).toBe("F-p0");
  });

  it("chains through one port per crossing, in path order", () => {
    const through = wallCrossings({
      points: [
        { x: 60, y: 50 },
        { x: 340, y: 50 },
      ],
      boxes: BOXES,
      through: ["F"],
    });
    const { scene: next, ports, link } = splitEdgeAtWalls(scene(), "e1", through, ops);
    expect(ports.map((port) => port.crossing.side)).toEqual(["left", "right"]);
    expect(next.edges.slice(1, 4).map((edge) => `${edge.source}/${edge.sourceHandle}->${edge.target}/${edge.targetHandle}`)).toEqual([
      "outer/out->F/F-p0",
      "F/F-p0@inner->F/F-p1@inner",
      "F/F-p1->inner/in",
    ]);
    expect(link!.members).toEqual([edgeRef("e1~0"), portRef("F", "F-p0"), edgeRef("e1~1"), portRef("F", "F-p1"), edgeRef("e1~2")]);
  });

  it("returns the SAME scene when there is nothing to split", () => {
    const s = scene();
    expect(splitEdgeAtWalls(s, "e1", [], ops).scene).toBe(s);
    expect(splitEdgeAtWalls(s, "missing", enterLeft, ops).scene).toBe(s);
  });

  it("unsplit is the inverse: the direct cable comes back with its data, the port leaves the wall, the link goes", () => {
    const split = splitEdgeAtWalls(scene(), "e1", enterLeft, ops).scene;
    const back = unsplitWallPort(split, { containerId: "F", portId: "F-p0" }, { removePort });
    expect(back.edges.map((edge) => edge.id)).toEqual(["e0", "e1~0", "e2"]);
    const restored = back.edges[1];
    expect([restored.source, restored.sourceHandle, restored.target, restored.targetHandle]).toEqual(["outer", "out", "inner", "in"]);
    expect(restored.data).toEqual({ color: "red" });
    expect(back.nodes.find((node) => node.id === "F")!.data.ports).toEqual({ left: [] });
    expect(back.links).toEqual([]);
  });

  it("unsplit refuses a port that is not the shared end of exactly one arriving and one departing cable", () => {
    const s = scene();
    expect(unsplitWallPort(s, { containerId: "F", portId: "nope" }, { removePort })).toBe(s);
  });
});
