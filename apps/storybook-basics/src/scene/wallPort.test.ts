// src/scene/wallPort.test.ts — wall crossings (detection), faces, insertion
// order, the chain split with its link set, and the unsplit round trip.
//
// The clipper itself is `portEdgeCrossing.test.ts`'s and the donor's to
// test; these cover what this module adds. Every expected number is
// readable off the fixtures by eye. The detection cases are the donor's
// (52a1b92 `wallPort.test.ts` :46-98), renamed frames → boxes.

import { describe, expect, it } from "vitest";

import type { ElbowRect } from "../components/elbow";
import { deleteWithLinks, edgeRef, portRef } from "./links";
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

  it("a corner TANGENT is not a crossing — on any of the four corners (finding 3)", () => {
    // Each segment touches exactly one corner of the 100 × 100 box at
    // (100, 0) and stays outside. The donor clipper reports every one of
    // these as an enter + an exit at the same distance (measured); the
    // inside-state probe says neither is a crossing.
    const tangents: Record<string, { x: number; y: number }[]> = {
      "top-left": [
        { x: 90, y: 10 },
        { x: 110, y: -10 },
      ],
      "top-right": [
        { x: 290, y: -10 },
        { x: 310, y: 10 },
      ],
      "bottom-right": [
        { x: 310, y: 90 },
        { x: 290, y: 110 },
      ],
      "bottom-left": [
        { x: 110, y: 110 },
        { x: 90, y: 90 },
      ],
    };
    for (const [corner, points] of Object.entries(tangents)) {
      expect(wallCrossings({ points, boxes: BOXES, through: ["F"] }), corner).toEqual([]);
    }
  });

  it("a segment running ALONG a wall is not a crossing either, on any wall", () => {
    const runs: Record<string, { x: number; y: number }[]> = {
      top: [
        { x: 90, y: 0 },
        { x: 310, y: 0 },
      ],
      bottom: [
        { x: 90, y: 100 },
        { x: 310, y: 100 },
      ],
      left: [
        { x: 100, y: -10 },
        { x: 100, y: 110 },
      ],
      right: [
        { x: 300, y: -10 },
        { x: 300, y: 110 },
      ],
    };
    for (const [wall, points] of Object.entries(runs)) {
      expect(wallCrossings({ points, boxes: BOXES, through: ["F"] }), wall).toEqual([]);
    }
  });

  it("…while a genuine crossing, a cable that STARTS on the wall heading in, and one that ENDS on the wall still count", () => {
    const cross = wallCrossings({ points: [{ x: 60, y: 50 }, { x: 180, y: 50 }], boxes: BOXES, through: ["F"] });
    expect(cross.map((hit) => [hit.side, hit.direction])).toEqual([["left", "enter"]]);
    const startsOn = wallCrossings({ points: [{ x: 100, y: 50 }, { x: 180, y: 50 }], boxes: BOXES, through: ["F"] });
    expect(startsOn.map((hit) => [hit.side, hit.direction])).toEqual([["left", "enter"]]);
    const endsOn = wallCrossings({ points: [{ x: 60, y: 50 }, { x: 100, y: 50 }], boxes: BOXES, through: ["F"] });
    expect(endsOn.map((hit) => [hit.side, hit.direction])).toEqual([["left", "enter"]]);
    // A path through a corner INTO the box crosses.
    const throughCorner = wallCrossings({ points: [{ x: 90, y: -10 }, { x: 200, y: 100 }], boxes: BOXES, through: ["F"] });
    expect(throughCorner.map((hit) => hit.direction)).toEqual(["enter", "exit"]);
    // The donor's stub convention survives the probe: a cable that STARTS on
    // the wall and heads OUT is an exit at its start ("the edge a stub
    // leaves from", boundaryCrossing.ts:196-199).
    const stubOut = wallCrossings({ points: [{ x: 100, y: 50 }, { x: 60, y: 50 }], boxes: BOXES, through: ["F"] });
    expect(stubOut.map((hit) => [hit.side, hit.direction])).toEqual([["left", "exit"]]);
  });

  it("wallPoint is alongSide's inverse on every wall", () => {
    expect(wallPoint(BOX, "left", 0.25)).toEqual({ x: 100, y: 25 });
  });
});

describe("wallCrossings — sub-pixel segments, collinear runs, vertices on the wall, thin frames (judge round 2, finding 1)", () => {
  const crossingsOf = (points: { x: number; y: number }[], boxes = BOXES, through = ["F"]) =>
    wallCrossings({ points, boxes, through }).map((hit) => [hit.containerId, hit.side, hit.direction, Number(hit.t.toFixed(3))] as const);

  it("a SUB-PIXEL corner tangent is still no crossing, on any corner — a 0.28px segment through (100, 0) used to split a cable twice", () => {
    const tangents: Record<string, { x: number; y: number }[]> = {
      "top-left": [{ x: 99.9, y: 0.1 }, { x: 100.1, y: -0.1 }],
      "top-right": [{ x: 299.9, y: -0.1 }, { x: 300.1, y: 0.1 }],
      "bottom-right": [{ x: 300.1, y: 99.9 }, { x: 299.9, y: 100.1 }],
      "bottom-left": [{ x: 100.1, y: 100.1 }, { x: 99.9, y: 99.9 }],
    };
    for (const [corner, points] of Object.entries(tangents)) expect(crossingsOf(points), corner).toEqual([]);
  });

  it("a short run ALONG a wall is no crossing — whether it starts on the wall, ends on it, or both", () => {
    expect(crossingsOf([{ x: 150, y: 0 }, { x: 150.3, y: 0 }])).toEqual([]);
    expect(crossingsOf([{ x: 100, y: 40 }, { x: 100, y: 40.2 }])).toEqual([]);
    expect(crossingsOf([{ x: 90, y: 100 }, { x: 100, y: 100 }, { x: 100.4, y: 100 }])).toEqual([]);
    // A zero-length path has no inside-state to change.
    expect(crossingsOf([{ x: 100, y: 50 }, { x: 100, y: 50 }])).toEqual([]);
  });

  it("a run along the wall that then TURNS IN crosses once, where it leaves the wall — a vertex the clipper stays silent on", () => {
    // The clipper reports only the touch at (100, 0); the entry at (200, 0)
    // is a vertex on the top wall where the state goes on → in.
    expect(crossingsOf([{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }])).toEqual([["F", "top", "enter", 0.5]]);
    // …and the mirror: in, along the wall, then off it.
    expect(crossingsOf([{ x: 200, y: 50 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }])).toEqual([["F", "top", "exit", 0.5]]);
  });

  it("DUPLICATE zero-length events coalesce: a vertex repeated on the wall is one crossing, with one side", () => {
    expect(crossingsOf([{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 50 }])).toEqual([["F", "left", "enter", 0.5]]);
    expect(crossingsOf([{ x: 150, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 50 }, { x: 350, y: 50 }])).toEqual([["F", "right", "exit", 0.5]]);
  });

  it("a VERTEX exactly on a wall: touching from outside, sliding along, then entering is one crossing at the entry point", () => {
    expect(crossingsOf([{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 80 }, { x: 150, y: 80 }])).toEqual([["F", "left", "enter", 0.8]]);
    // Touching the wall from INSIDE and turning back is no crossing.
    expect(crossingsOf([{ x: 150, y: 50 }, { x: 100, y: 60 }, { x: 150, y: 70 }])).toEqual([]);
    // Touching the wall from outside and turning back is no crossing either.
    expect(crossingsOf([{ x: 50, y: 50 }, { x: 100, y: 60 }, { x: 50, y: 70 }])).toEqual([]);
  });

  it("a THIN nested frame keeps both of its crossings, ordered with the outer frame's — the old ½px probe jumped its whole interior", () => {
    const thin: ElbowRect = { x: 150, y: 0, w: 0.2, h: 100 };
    const boxes = new Map([["F", BOX], ["T", thin]]);
    expect(crossingsOf([{ x: 60, y: 50 }, { x: 160, y: 50 }], boxes, ["F", "T"])).toEqual([
      ["F", "left", "enter", 0.5],
      ["T", "left", "enter", 0.5],
      ["T", "right", "exit", 0.5],
    ]);
    // A 0.05px frame, crossed diagonally, is still two crossings.
    const hair: ElbowRect = { x: 200, y: 20, w: 0.05, h: 60 };
    expect(crossingsOf([{ x: 199, y: 49 }, { x: 201, y: 51 }], new Map([["H", hair]]), ["H"]).map((hit) => hit[2])).toEqual(["enter", "exit"]);
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

    const isAuthored = (ref: { nodeId: string; portId: string }) => (ref.nodeId === "F" && ref.portId === "p") || (ref.nodeId === "kid" && ref.portId === "in");
    const baseDirection = (ref: { nodeId: string; portId: string }) => (ref.nodeId === "kid" ? ("sink" as const) : undefined);
    const direction = withWallFaces(baseDirection, (ref) => (ref.nodeId === "F" && ref.portId === "p" ? wallFacesFor("sink") : undefined), isAuthored);
    expect(direction({ nodeId: "F", portId: "p" })).toBe("sink");
    expect(direction({ nodeId: "F", portId: "p@inner" })).toBe("source");
    expect(direction({ nodeId: "kid", portId: "in" })).toBe("sink");
    expect(direction({ nodeId: "F", portId: "unknown" })).toBeUndefined();

    const typeOf = withFaceTypes((ref) => (ref.nodeId === "F" && ref.portId === "p" ? ["Pose"] : undefined), isAuthored);
    expect(typeOf({ nodeId: "F", portId: "p@inner" })).toEqual(["Pose"]);
    expect(typeOf({ nodeId: "F", portId: "p" })).toEqual(["Pose"]);
  });

  it("an AUTHORED id that spells an inner face is its own port — never the inner face of another (finding 7)", () => {
    // A block that authored `temperature@inner` beside `temperature`.
    const authored = (ref: { nodeId: string; portId: string }) => ref.nodeId === "B" && (ref.portId === "temperature" || ref.portId === "temperature@inner");
    const base = (ref: { nodeId: string; portId: string }) => (ref.nodeId === "B" ? (ref.portId === "temperature@inner" ? ("source" as const) : ("sink" as const)) : undefined);
    const facesOf = (ref: { nodeId: string; portId: string }) => (authored(ref) ? wallFacesFor(base(ref)!) : undefined);
    const direction = withWallFaces(base, facesOf, authored);
    // The authored port keeps its OWN outer polarity (a right-wall source),
    // instead of reading as "the inner face of temperature" (which would be
    // the opposite of temperature's sink: source — the same word by
    // accident here, so the test also pins the type, which differs).
    expect(direction({ nodeId: "B", portId: "temperature@inner" })).toBe("source");
    expect(direction({ nodeId: "B", portId: "temperature" })).toBe("sink");
    const typeOf = withFaceTypes((ref) => (ref.portId === "temperature" ? ["float"] : ref.portId === "temperature@inner" ? ["Pose"] : undefined), authored);
    expect(typeOf({ nodeId: "B", portId: "temperature@inner" })).toEqual(["Pose"]);
    // The colliding inner handle is not minted into the vocabulary twice;
    // the authored `temperature@inner` port still gets an inner face of its
    // own, spelt one level deeper.
    const ports = withInnerFaces(() => ["temperature", "temperature@inner"], () => true);
    expect(ports("B")).toEqual(["temperature", "temperature@inner", "temperature@inner@inner"]);
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
    expect(link).toEqual({ id: "link:e1", members: [edgeRef("e1~0"), portRef("F", "F-p0"), edgeRef("e1~1")], origin: edgeRef("e1") });
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

  it("unsplit is the EXACT inverse: the original id, data and position come back, the port leaves the wall, the link goes (finding 5)", () => {
    const original = scene();
    const split = splitEdgeAtWalls(original, "e1", enterLeft, ops).scene;
    expect(split.links![0].origin).toBe(edgeRef("e1"));
    const back = unsplitWallPort(split, { containerId: "F", portId: "F-p0" }, { removePort });
    expect(back.edges.map((edge) => edge.id)).toEqual(["e0", "e1", "e2"]);
    const restored = back.edges[1];
    expect([restored.source, restored.sourceHandle, restored.target, restored.targetHandle]).toEqual(["outer", "out", "inner", "in"]);
    expect(restored.data).toEqual({ color: "red" });
    expect(back.links).toBeUndefined();
    // Byte-identical, up to the wall the host emptied (`ports.left: []`
    // is the host's own `removePort` leaving an empty wall behind).
    const expected = { ...original, nodes: original.nodes.map((node) => (node.id === "F" ? { ...node, data: { ...node.data, ports: { left: [] } } } : node)) };
    expect(JSON.stringify(back)).toBe(JSON.stringify(expected));
  });

  it("repeated split → unsplit → split mints the SAME ids every time — never e1~0~0", () => {
    let current = scene();
    for (let round = 0; round < 3; round += 1) {
      const { scene: split, ports } = splitEdgeAtWalls(current, "e1", enterLeft, ops);
      expect(split.edges.map((edge) => edge.id), `round ${round}`).toEqual(["e0", "e1~0", "e1~1", "e2"]);
      expect(ports.map((port) => port.portId)).toEqual(["F-p0"]);
      current = unsplitWallPort(split, { containerId: "F", portId: "F-p0" }, { removePort });
      expect(current.edges.map((edge) => edge.id), `round ${round}`).toEqual(["e0", "e1", "e2"]);
      expect(current.links).toBeUndefined();
    }
  });

  it("a chain through TWO walls unsplits one port at a time: the set survives the first, the id returns on the last", () => {
    const through = wallCrossings({ points: [{ x: 60, y: 50 }, { x: 340, y: 50 }], boxes: BOXES, through: ["F"] });
    const split = splitEdgeAtWalls(scene(), "e1", through, ops).scene;
    const afterFirst = unsplitWallPort(split, { containerId: "F", portId: "F-p0" }, { removePort });
    expect(afterFirst.edges.map((edge) => edge.id)).toEqual(["e0", "e1~0", "e1~2", "e2"]);
    expect(afterFirst.edges[1].target).toBe("F");
    expect(afterFirst.edges[1].targetHandle).toBe("F-p1@inner");
    expect(afterFirst.links).toEqual([{ id: "link:e1", members: [edgeRef("e1~0"), portRef("F", "F-p1"), edgeRef("e1~2")], origin: edgeRef("e1") }]);
    const afterBoth = unsplitWallPort(afterFirst, { containerId: "F", portId: "F-p1" }, { removePort });
    expect(afterBoth.edges.map((edge) => edge.id)).toEqual(["e0", "e1", "e2"]);
    expect(afterBoth.links).toBeUndefined();
    // Reverse order gives the same answer.
    const other = unsplitWallPort(unsplitWallPort(split, { containerId: "F", portId: "F-p1" }, { removePort }), { containerId: "F", portId: "F-p0" }, { removePort });
    expect(other.edges.map((edge) => edge.id)).toEqual(["e0", "e1", "e2"]);
  });

  it("unsplit refuses a port that is not the shared end of exactly one arriving and one departing cable", () => {
    const s = scene();
    expect(unsplitWallPort(s, { containerId: "F", portId: "nope" }, { removePort })).toBe(s);
  });

  it("a REFUSED port aborts the whole split — the scene comes back untouched, no segment, no link (judge round 2, finding 4)", () => {
    const s = scene();
    const through = wallCrossings({ points: [{ x: 60, y: 50 }, { x: 340, y: 50 }], boxes: BOXES, through: ["F"] });
    expect(through.length).toBe(2);
    // The host refuses the SECOND port (say, the id is already taken):
    // the first must not survive on the wall.
    const refusing = { ...ops, addPort: (current: BlockScene<NodeData, EdgeData>, port: MintedWallPort) => (port.portId === "F-p1" ? current : ops.addPort(current, port)) };
    const refused = splitEdgeAtWalls(s, "e1", through, refusing);
    expect(refused.scene).toBe(s);
    expect(refused.ports).toEqual([]);
    expect(refused.link).toBeUndefined();
    // A reserved id is refused BEFORE the host is asked at all.
    const reserved = splitEdgeAtWalls(s, "e1", through, { ...ops, mintPortId: () => "x@inner" });
    expect(reserved.scene).toBe(s);
    expect(reserved.ports).toEqual([]);
    // So is a mint that hands two crossings the same id.
    const dup = splitEdgeAtWalls(s, "e1", through, { ...ops, mintPortId: () => "dup" });
    expect(dup.scene).toBe(s);
    // A host that answers `null` is a refusal too.
    const nulling = splitEdgeAtWalls(s, "e1", through, { ...ops, addPort: () => null });
    expect(nulling.scene).toBe(s);
  });
});

describe("splitEdgeAtWalls — SEQUENTIAL splits of one cable are one set (judge round 2, finding 3)", () => {
  /** Two frames side by side; `e1` runs from `outer` (left of F) into `inner` (inside G). */
  const G_BOX: ElbowRect = { x: 400, y: 0, w: 200, h: 100 };
  const TWO = new Map([["F", BOX], ["G", G_BOX]]);
  function two(): BlockScene<NodeData, EdgeData> {
    return {
      nodes: [
        { id: "F", type: "frame", position: { x: 100, y: 0 }, data: { ports: {} } },
        { id: "G", type: "frame", position: { x: 400, y: 0 }, data: { ports: {} } },
        { id: "inner", parentId: "G", position: { x: 80, y: 30 }, data: {} },
        { id: "outer", position: { x: 0, y: 30 }, data: {} },
      ],
      edges: [
        { id: "e0", source: "x", target: "y" },
        { id: "e1", source: "outer", sourceHandle: "out", target: "inner", targetHandle: "in", data: { color: "red" } },
        { id: "e2", source: "a", target: "b" },
      ],
    };
  }
  const portExists = (s: BlockScene<NodeData, EdgeData>, nodeId: string, portId: string) =>
    Object.values(s.nodes.find((node) => node.id === nodeId)?.data.ports ?? {}).some((ids) => ids.includes(portId));
  const deletePort = (s: BlockScene<NodeData, EdgeData>, nodeId: string, portId: string) => removePort(s, { containerId: nodeId, portId });

  /** Cut `e1` through F's two walls, then cut the LAST segment through G's wall. */
  function sequential() {
    const original = two();
    const snapshot = JSON.stringify(original);
    const throughF = wallCrossings({ points: [{ x: 60, y: 50 }, { x: 500, y: 50 }], boxes: TWO, through: ["F"] });
    const afterF = splitEdgeAtWalls(original, "e1", throughF, ops).scene;
    expect(afterF.edges.map((edge) => edge.id)).toEqual(["e0", "e1~0", "e1~1", "e1~2", "e2"]);
    // The last segment now runs from F's right wall into G — and crosses G's left wall.
    const throughG = wallCrossings({ points: [{ x: 300, y: 50 }, { x: 500, y: 50 }], boxes: TWO, through: ["G"] });
    expect(throughG.map((hit) => [hit.containerId, hit.side, hit.direction])).toEqual([["G", "left", "enter"]]);
    const result = splitEdgeAtWalls(afterF, "e1~2", throughG, ops);
    // Undo is a snapshot: nothing above mutated its input.
    expect(JSON.stringify(original)).toBe(snapshot);
    return { original, afterF, result };
  }

  it("the second cut joins the first cut's set — one link, the root origin, every piece in path order", () => {
    const { result } = sequential();
    expect(result.scene.edges.map((edge) => edge.id)).toEqual(["e0", "e1~0", "e1~1", "e1~2~0", "e1~2~1", "e2"]);
    expect(result.ports.map((port) => port.portId)).toEqual(["G-p0"]);
    expect(result.scene.links).toEqual([
      { id: "link:e1", members: [edgeRef("e1~0"), portRef("F", "F-p0"), edgeRef("e1~1"), portRef("F", "F-p1"), edgeRef("e1~2~0"), portRef("G", "G-p0"), edgeRef("e1~2~1")], origin: edgeRef("e1") },
    ]);
    expect(result.link).toEqual(result.scene.links![0]);
  });

  it("unsplit in ANY order brings back `e1` — never `e1~2` — and the set goes only with the last cut", () => {
    const { original, result } = sequential();
    const orders: [string, string][][] = [
      [["G", "G-p0"], ["F", "F-p0"], ["F", "F-p1"]],
      [["F", "F-p0"], ["F", "F-p1"], ["G", "G-p0"]],
      [["F", "F-p1"], ["G", "G-p0"], ["F", "F-p0"]],
      [["F", "F-p0"], ["G", "G-p0"], ["F", "F-p1"]],
    ];
    for (const order of orders) {
      let current = result.scene;
      order.forEach(([containerId, portId], step) => {
        current = unsplitWallPort(current, { containerId, portId }, { removePort });
        if (step < order.length - 1) {
          expect(current.links?.length, `${order.map((o) => o[1]).join(",")} after ${step + 1}`).toBe(1);
          expect(current.links![0].origin).toBe(edgeRef("e1"));
        }
      });
      expect(current.edges.map((edge) => edge.id), order.map((o) => o[1]).join(",")).toEqual(["e0", "e1", "e2"]);
      const restored = current.edges[1];
      expect([restored.source, restored.sourceHandle, restored.target, restored.targetHandle]).toEqual(["outer", "out", "inner", "in"]);
      expect(restored.data).toEqual({ color: "red" });
      expect(current.links).toBeUndefined();
      // Byte-identical up to the two walls the host's `removePort` emptied.
      const expected = { ...original, nodes: original.nodes.map((node) => (node.id === "F" ? { ...node, data: { ports: { left: [], right: [] } } } : node.id === "G" ? { ...node, data: { ports: { left: [] } } } : node)) };
      expect(JSON.stringify(current)).toBe(JSON.stringify(expected));
    }
  });

  it("a linked delete afterwards takes the WHOLE cable — every segment and every port, from any piece", () => {
    const { result } = sequential();
    for (const seed of [edgeRef("e1~2~1"), edgeRef("e1~0"), portRef("G", "G-p0"), portRef("F", "F-p1")]) {
      const { scene: next, deleted, stale, unhandled } = deleteWithLinks(result.scene, [seed], { deletePort, portExists });
      expect(next.edges.map((edge) => edge.id), seed).toEqual(["e0", "e2"]);
      expect(deleted.edges.sort(), seed).toEqual(["e1~0", "e1~1", "e1~2~0", "e1~2~1"]);
      expect(deleted.ports.map((port) => port.portId).sort(), seed).toEqual(["F-p0", "F-p1", "G-p0"]);
      expect(stale).toEqual([]);
      expect(unhandled).toEqual([]);
      expect(next.links).toBeUndefined();
      expect(portExists(next, "F", "F-p0")).toBe(false);
      expect(portExists(next, "G", "G-p0")).toBe(false);
    }
  });
});
