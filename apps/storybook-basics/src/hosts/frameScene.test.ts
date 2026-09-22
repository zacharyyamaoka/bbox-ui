// src/hosts/frameScene.test.ts — the host bindings: structural face
// resolution (judge round 1, finding 7), the reserved marker at ingestion,
// and split → unsplit through the host's own port ops (finding 5).

import { describe, expect, it } from "vitest";

import type { WallTrack } from "../components/frame.layout";
import { edgeRef, portRef } from "../scene/links";
import { wallCrossings } from "../scene/wallPort";
import { addWallPort, frameDirectionOf, framePortsOf, frameTypeOf, resolveWallHandle, sideOfPort, splitEdgeAtFrameWalls, unsplitFrameWallPort } from "./frameScene";
import type { HostScene } from "./hostScene";

function scene(): HostScene {
  return {
    nodes: [
      // An ORDINARY block that authored an id spelling an inner face.
      { id: "gauge", type: "block", position: { x: 0, y: 0 }, data: { view: "port", ports: { left: ["temperature"], right: ["temperature@inner"] }, portTypes: { temperature: "float", "temperature@inner": "Pose" } } },
      // A frame with one wall port, and an authored collision on its right wall.
      { id: "F", type: "frame", position: { x: 100, y: 0 }, data: { w: 200, h: 100, ports: { left: ["p"], right: ["p@inner"] }, portTypes: { p: "float", "p@inner": "str" } } },
      { id: "kid", type: "block", parentId: "F", position: { x: 80, y: 30 }, data: { view: "port", ports: { left: ["in"] }, portTypes: { in: "float" } } },
      { id: "ext", type: "block", position: { x: 0, y: 30 }, data: { view: "port", ports: { right: ["out"] }, portTypes: { out: "float" } } },
    ],
    edges: [{ id: "w", source: "ext", sourceHandle: "out", target: "kid", targetHandle: "in", data: { color: "red" } }],
  };
}

describe("structural face resolution (finding 7)", () => {
  it("an ordinary block's authored `temperature@inner` is its own port: right-wall source, type Pose — not temperature's inner face", () => {
    const s = scene();
    expect(framePortsOf(s)("gauge")).toEqual(["temperature", "temperature@inner"]);
    expect(frameDirectionOf(s)({ nodeId: "gauge", portId: "temperature@inner" })).toBe("source");
    expect(frameDirectionOf(s)({ nodeId: "gauge", portId: "temperature" })).toBe("sink");
    expect(frameTypeOf(s)({ nodeId: "gauge", portId: "temperature@inner" })).toEqual(["Pose"]);
    expect(frameTypeOf(s)({ nodeId: "gauge", portId: "temperature" })).toEqual(["float"]);
  });

  it("on a wall container the authored id wins too, and the colliding inner face is not minted", () => {
    const s = scene();
    const node = s.nodes.find((candidate) => candidate.id === "F")!;
    expect(resolveWallHandle(node, "p@inner")).toEqual({ portId: "p@inner", side: "right", face: "outer" });
    expect(resolveWallHandle(node, "p")).toEqual({ portId: "p", side: "left", face: "outer" });
    expect(resolveWallHandle(node, "ghost@inner")).toBeUndefined();
    expect(sideOfPort(node, "p@inner")).toBe("right");
    // `p`'s inner face would be spelt `p@inner`, which is taken: not minted.
    expect(framePortsOf(s)("F")).toEqual(["p", "p@inner", "p@inner@inner"]);
    // …and `p@inner` reads as the right-wall port it is: a SOURCE of type str.
    expect(frameDirectionOf(s)({ nodeId: "F", portId: "p@inner" })).toBe("source");
    expect(frameTypeOf(s)({ nodeId: "F", portId: "p@inner" })).toEqual(["str"]);
    // A genuine inner face on a port with no collision still resolves.
    expect(resolveWallHandle(node, "p@inner@inner")).toEqual({ portId: "p@inner", side: "right", face: "inner" });
    expect(frameDirectionOf(s)({ nodeId: "F", portId: "p@inner@inner" })).toBe("sink");
  });

  it("ingestion refuses to MINT a reserved id — the scene comes back unchanged", () => {
    const s = scene();
    expect(addWallPort(s, { containerId: "F", side: "top", portId: "x@inner" })).toBe(s);
    expect(addWallPort(s, { containerId: "F", side: "top", portId: "x" })).not.toBe(s);
  });
});

describe("split → unsplit through the host bindings (finding 5)", () => {
  const track: WallTrack = { contentStart: 18, contentLength: 64, wallStart: 0, wallLength: 100 };

  it("is byte-identical, restores the original edge id, and mints the same ids again", () => {
    const original = scene();
    const crossings = wallCrossings({ points: [{ x: 60, y: 60 }, { x: 180, y: 60 }], boxes: new Map([["F", { x: 100, y: 0, w: 200, h: 100 }]]), through: ["F"] });
    expect(crossings.map((hit) => [hit.side, hit.direction])).toEqual([["left", "enter"]]);
    for (let round = 0; round < 2; round += 1) {
      const { scene: split, ports, link } = splitEdgeAtFrameWalls(original, "w", crossings, { trackOf: () => track, mintPortId: (_c, i) => `F:w:${i}` });
      expect(ports.map((port) => port.portId)).toEqual(["F:w:0"]);
      expect(split.edges.map((edge) => edge.id)).toEqual(["w~0", "w~1"]);
      expect(link).toEqual({ id: "link:w", members: [edgeRef("w~0"), portRef("F", "F:w:0"), edgeRef("w~1")], origin: edgeRef("w") });
      const frame = split.nodes.find((node) => node.id === "F")!;
      // `p` alone was centred (t = 0.5); the crossing at t = 0.6 lands after it.
      expect(frame.data.ports!.left).toEqual(["p", "F:w:0"]);
      expect(frame.data.portTypes!["F:w:0"]).toBe("float");
      expect(frame.data.frame!.faces!["F:w:0"]).toEqual({ outer: "sink", inner: "source" });
      const back = unsplitFrameWallPort(split, { nodeId: "F", portId: "F:w:0" });
      expect(back.edges.map((edge) => edge.id)).toEqual(["w"]);
      // Byte-identical: `removeWallPort` takes the label, type and faces it
      // added back out and drops the records it emptied.
      expect(JSON.stringify(back)).toBe(JSON.stringify(original));
    }
  });
});
