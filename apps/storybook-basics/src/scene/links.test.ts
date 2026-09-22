// src/scene/links.test.ts — linked objects: the ref grammar, the closure,
// and `deleteWithLinks`. Every expected list is readable off the fixture.

import { describe, expect, it } from "vitest";

import { addLink, deleteWithLinks, edgeRef, linkedClosure, linksOf, nodeRef, parseRef, portRef, pruneLinks, removeLink } from "./links";
import type { BlockScene } from "./scene";

type NodeData = { name?: string; ports?: string[] };
type EdgeData = { color?: string };

/** frame with two wall ports; a cable split through `p1`, a second cable
 *  split through the SAME `p1` (so `p1` sits in two sets), an unrelated
 *  edge, and a member of the frame. */
function scene(): BlockScene<NodeData, EdgeData> {
  return {
    nodes: [
      { id: "ext", position: { x: 0, y: 0 }, data: { ports: ["out"] } },
      { id: "ext2", position: { x: 0, y: 0 }, data: { ports: ["out"] } },
      { id: "frame", position: { x: 100, y: 0 }, data: { ports: ["p1", "p2"] } },
      { id: "kid", parentId: "frame", position: { x: 10, y: 10 }, data: { ports: ["in"] } },
    ],
    edges: [
      { id: "a~0", source: "ext", sourceHandle: "out", target: "frame", targetHandle: "p1" },
      { id: "a~1", source: "frame", sourceHandle: "p1@inner", target: "kid", targetHandle: "in" },
      { id: "b~0", source: "ext2", sourceHandle: "out", target: "frame", targetHandle: "p1" },
      { id: "b~1", source: "frame", sourceHandle: "p1@inner", target: "kid", targetHandle: "in" },
      { id: "free", source: "ext", sourceHandle: "out", target: "kid", targetHandle: "in" },
    ],
    links: [
      { id: "L-a", members: [edgeRef("a~0"), portRef("frame", "p1"), edgeRef("a~1")] },
      { id: "L-b", members: [edgeRef("b~0"), portRef("frame", "p1"), edgeRef("b~1")] },
    ],
  };
}

/** The host's port removal — a port is `data.ports` here. */
const ops = {
  deletePort: (s: BlockScene<NodeData, EdgeData>, nodeId: string, portId: string) => ({
    ...s,
    nodes: s.nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ports: (node.data.ports ?? []).filter((id) => id !== portId) } } : node)),
  }),
  portExists: (s: BlockScene<NodeData, EdgeData>, nodeId: string, portId: string) =>
    (s.nodes.find((node) => node.id === nodeId)?.data.ports ?? []).includes(portId),
};

describe("refs", () => {
  it("builds and parses all three kinds, and refuses anything else", () => {
    expect(parseRef(nodeRef("n"))).toEqual({ kind: "node", id: "n" });
    expect(parseRef(edgeRef("e"))).toEqual({ kind: "edge", id: "e" });
    expect(parseRef(portRef("frame", "p1@inner"))).toEqual({ kind: "port", id: "frame", portId: "p1@inner" });
    expect(portRef("frame", "p1")).toBe("port:frame/p1");
    for (const bad of ["", "node:", "port:frame", "port:/p", "port:frame/", "group:x", "frame/p1"]) expect(parseRef(bad), bad).toBeNull();
  });
});

describe("addLink / removeLink", () => {
  it("dedupes members and refuses a set of one — the SAME scene comes back", () => {
    const s = scene();
    expect(addLink(s, { id: "one", members: [nodeRef("kid"), nodeRef("kid")] })).toBe(s);
    expect(addLink(s, { id: "L-a", members: [nodeRef("kid"), nodeRef("ext")] })).toBe(s);
    const added = addLink(s, { id: "L-c", members: [nodeRef("kid"), nodeRef("ext"), nodeRef("kid")] });
    expect(added.links!.at(-1)).toEqual({ id: "L-c", members: [nodeRef("kid"), nodeRef("ext")] });
    expect(removeLink(added, "L-c").links).toEqual(s.links);
    expect(removeLink(s, "missing")).toBe(s);
  });

  it("linksOf lists every set a ref belongs to, in scene order", () => {
    expect(linksOf(scene(), portRef("frame", "p1")).map((link) => link.id)).toEqual(["L-a", "L-b"]);
    expect(linksOf(scene(), edgeRef("free"))).toEqual([]);
  });
});

describe("linkedClosure", () => {
  it("is transitive through a shared member and terminates on a cycle", () => {
    const closure = linkedClosure(scene(), [edgeRef("a~0")]);
    expect([...closure].sort()).toEqual([edgeRef("a~0"), edgeRef("a~1"), edgeRef("b~0"), edgeRef("b~1"), portRef("frame", "p1")].sort());
    const cyclic = { links: [{ id: "x", members: ["node:A", "node:B"] }, { id: "y", members: ["node:B", "node:A"] }] };
    expect([...linkedClosure(cyclic, ["node:A"])].sort()).toEqual(["node:A", "node:B"]);
  });

  it("an unlinked ref is its own closure", () => {
    expect([...linkedClosure(scene(), [edgeRef("free")])]).toEqual([edgeRef("free")]);
  });
});

describe("deleteWithLinks", () => {
  it("deleting one half-cable deletes the port and BOTH cables that share it, and prunes the sets", () => {
    const { scene: next, deleted, stale, unhandled } = deleteWithLinks(scene(), [edgeRef("a~1")], ops);
    expect(next.edges.map((edge) => edge.id)).toEqual(["free"]);
    expect(next.nodes.find((node) => node.id === "frame")!.data.ports).toEqual(["p2"]);
    expect(deleted.edges.sort()).toEqual(["a~0", "a~1", "b~0", "b~1"]);
    expect(deleted.ports).toEqual([{ nodeId: "frame", portId: "p1" }]);
    expect(deleted.nodes).toEqual([]);
    expect(stale).toEqual([]);
    expect(unhandled).toEqual([]);
    // No sets left = no `links` key at all (one spelling of "none").
    expect(next.links).toBeUndefined();
  });

  it("deleting the PORT is the same cascade (a link set has no privileged member)", () => {
    const { scene: next } = deleteWithLinks(scene(), [portRef("frame", "p1")], ops);
    expect(next.edges.map((edge) => edge.id)).toEqual(["free"]);
    expect(next.links).toBeUndefined();
  });

  it("deleting an unlinked edge touches nothing else, and the sets survive", () => {
    const s = scene();
    const { scene: next } = deleteWithLinks(s, [edgeRef("free")], ops);
    expect(next.edges.map((edge) => edge.id)).toEqual(["a~0", "a~1", "b~0", "b~1"]);
    expect(next.links).toEqual(s.links);
  });

  it("deleting a NODE takes its descendants and its edges (drop policy), then prunes what the sets still named", () => {
    const { scene: next, deleted } = deleteWithLinks(scene(), [nodeRef("frame")], ops);
    expect(next.nodes.map((node) => node.id)).toEqual(["ext", "ext2"]);
    expect(next.edges).toEqual([]);
    expect(deleted.nodes).toEqual(["frame"]);
    expect(next.links).toBeUndefined();
  });

  it("reports stale refs instead of throwing, and returns the SAME scene when nothing was live", () => {
    const s = scene();
    const result = deleteWithLinks(s, [edgeRef("nope"), "garbage", portRef("frame", "p9")], ops);
    expect(result.scene).toBe(s);
    expect(result.stale.sort()).toEqual([edgeRef("nope"), "garbage", portRef("frame", "p9")].sort());
  });

  it("without a deletePort op, a live port is reported unhandled — never silently skipped", () => {
    const result = deleteWithLinks(scene(), [portRef("frame", "p1")]);
    expect(result.unhandled).toEqual([portRef("frame", "p1")]);
    // Its linked cables still went, and the sets are pruned to nothing.
    expect(result.scene.edges.map((edge) => edge.id)).toEqual(["free"]);
  });

  it("a set left with one member is dropped whole; a set with two survivors keeps them", () => {
    const s: BlockScene<NodeData, EdgeData> = {
      nodes: [
        { id: "a", position: { x: 0, y: 0 }, data: {} },
        { id: "b", position: { x: 0, y: 0 }, data: {} },
        { id: "c", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      links: [
        { id: "pair", members: [nodeRef("a"), nodeRef("zombie")] },
        { id: "trio", members: [nodeRef("a"), nodeRef("b"), nodeRef("c")] },
      ],
    };
    expect(pruneLinks(s).links).toEqual([{ id: "trio", members: [nodeRef("a"), nodeRef("b"), nodeRef("c")] }]);
    // Deleting `a` cascades to b and c through `trio`; `zombie` was never live.
    const { scene: next, stale } = deleteWithLinks(s, [nodeRef("a")]);
    expect(next.nodes).toEqual([]);
    // `zombie` never carried anything: it is not even reported, because it
    // was never reached — only a SEED can be stale (finding 4).
    expect(stale).toEqual([]);
    expect(next.links).toBeUndefined();
  });

  it("a STALE seed deletes nothing live — the closure never starts from a dead id (finding 4)", () => {
    const s: BlockScene<NodeData, EdgeData> = {
      nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      links: [{ id: "L", members: [nodeRef("zombie"), nodeRef("a")] }],
    };
    const { scene: next, stale, deleted } = deleteWithLinks(s, [nodeRef("zombie")]);
    expect(next.nodes.map((node) => node.id)).toEqual(["a"]);
    expect(deleted.nodes).toEqual([]);
    expect(stale).toEqual([nodeRef("zombie")]);
  });

  it("a stale member never BRIDGES two sets", () => {
    const s: BlockScene<NodeData, EdgeData> = {
      nodes: [
        { id: "a", position: { x: 0, y: 0 }, data: {} },
        { id: "b", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      links: [
        { id: "L1", members: [nodeRef("a"), nodeRef("zombie")] },
        { id: "L2", members: [nodeRef("zombie"), nodeRef("b")] },
      ],
    };
    const { scene: next } = deleteWithLinks(s, [nodeRef("a")]);
    expect(next.nodes.map((node) => node.id)).toEqual(["b"]);
    // …and `linkedClosure` says the same when asked with a liveness test.
    const live = (ref: string) => ref === nodeRef("a") || ref === nodeRef("b");
    expect([...linkedClosure(s, [nodeRef("a")], live)]).toEqual([nodeRef("a")]);
    // Without the test, the bare closure is what it always was — every
    // ref the sets name.
    expect([...linkedClosure(s, [nodeRef("a")])].sort()).toEqual([nodeRef("a"), nodeRef("b"), nodeRef("zombie")].sort());
  });

  it("pruneLinks is identity on an honest table", () => {
    const s = scene();
    expect(pruneLinks(s, [], ops)).toBe(s);
  });
});
