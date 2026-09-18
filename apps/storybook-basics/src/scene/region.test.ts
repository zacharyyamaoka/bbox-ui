// src/scene/region.test.ts — the nesting queries, including the two
// malformed-input cases that would otherwise hang a UI thread.

import { describe, expect, it } from "vitest";

import {
  REGION_NODE_TYPE,
  absolutePosition,
  ancestorsOf,
  boundsOfNodes,
  descendantsOf,
  isRegion,
  regionOf,
  regionsOf,
  selectionRoots,
} from "./region";
import type { BlockScene } from "./scene";

/** frame ▸ region ▸ block ▸ leaf, plus a loose node. */
function nested(): BlockScene {
  return {
    nodes: [
      { id: "frame", position: { x: 1000, y: 100 }, data: {} },
      { id: "region", type: REGION_NODE_TYPE, parentId: "frame", position: { x: 10, y: 20 }, data: {} },
      { id: "block", parentId: "region", position: { x: 5, y: 5 }, data: {} },
      { id: "leaf", parentId: "block", position: { x: 2, y: 3 }, data: {} },
      { id: "loose", position: { x: 900, y: 900 }, data: {} },
    ],
    edges: [],
  };
}

describe("a region is a node kind", () => {
  it("is `type`, the field React Flow already keys `nodeTypes` off", () => {
    expect(REGION_NODE_TYPE).toBe("region");
    expect(isRegion({ type: "region" })).toBe(true);
    expect(isRegion({ type: "block" })).toBe(false);
    // An absent `type` is an ordinary node, not an error.
    expect(isRegion({})).toBe(false);
  });

  it("finds every region in scene order", () => {
    expect(regionsOf(nested()).map((node) => node.id)).toEqual(["region"]);
  });
});

describe("descendantsOf", () => {
  it("is the transitive closure, seeds included, in scene order", () => {
    expect([...descendantsOf(nested(), ["region"])]).toEqual(["region", "block", "leaf"]);
  });

  it("drops seeds that name nothing rather than throwing", () => {
    expect([...descendantsOf(nested(), ["ghost", "block"])]).toEqual(["block", "leaf"]);
    expect([...descendantsOf(nested(), [])]).toEqual([]);
  });

  it("TERMINATES on a malformed parentId cycle", () => {
    // The record's contract forbids this; a corrupt document does not.
    const cyclic: BlockScene = {
      nodes: [
        { id: "a", parentId: "b", position: { x: 0, y: 0 }, data: {} },
        { id: "b", parentId: "a", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    expect([...descendantsOf(cyclic, ["a"])].sort()).toEqual(["a", "b"]);
  });
});

describe("selectionRoots", () => {
  it("returns only the outermost members — nesting the selection did not ask to change", () => {
    const inside = descendantsOf(nested(), ["region"]);
    expect(selectionRoots(nested(), inside).map((node) => node.id)).toEqual(["region"]);
  });

  it("returns several when the selection has several outermost members", () => {
    const scene = nested();
    const inside = new Set(["block", "loose"]);
    expect(selectionRoots(scene, inside).map((node) => node.id)).toEqual(["block", "loose"]);
  });
});

describe("absolutePosition", () => {
  it("folds in every ancestor's offset", () => {
    // frame(1000,100) + region(10,20) + block(5,5) + leaf(2,3)
    expect(absolutePosition(nested(), "leaf")).toEqual({ x: 1017, y: 128 });
    expect(absolutePosition(nested(), "frame")).toEqual({ x: 1000, y: 100 });
  });

  it("is undefined for an unknown node", () => {
    expect(absolutePosition(nested(), "ghost")).toBeUndefined();
  });

  it("stops at a parentId that names nothing, rather than throwing", () => {
    const orphan: BlockScene = {
      nodes: [{ id: "a", parentId: "gone", position: { x: 7, y: 9 }, data: {} }],
      edges: [],
    };
    expect(absolutePosition(orphan, "a")).toEqual({ x: 7, y: 9 });
  });

  it("TERMINATES on a malformed parentId cycle", () => {
    const cyclic: BlockScene = {
      nodes: [
        { id: "a", parentId: "b", position: { x: 1, y: 1 }, data: {} },
        { id: "b", parentId: "a", position: { x: 2, y: 2 }, data: {} },
      ],
      edges: [],
    };
    expect(absolutePosition(cyclic, "a")).toEqual({ x: 3, y: 3 });
  });
});

describe("regionOf / ancestorsOf", () => {
  it("finds the nearest enclosing REGION, skipping ordinary containers", () => {
    expect(regionOf(nested(), "leaf")!.id).toBe("region");
    expect(regionOf(nested(), "loose")).toBeUndefined();
    // A frame that is not a region is not an answer.
    expect(regionOf(nested(), "region")).toBeUndefined();
  });

  it("lists the containment chain nearest-first, excluding the node itself", () => {
    expect(ancestorsOf(nested(), "leaf")).toEqual(["block", "region", "frame"]);
    expect(ancestorsOf(nested(), "loose")).toEqual([]);
    expect(ancestorsOf(nested(), "ghost")).toEqual([]);
  });

  it("TERMINATES on a malformed parentId cycle", () => {
    const cyclic: BlockScene = {
      nodes: [
        { id: "a", parentId: "b", position: { x: 0, y: 0 }, data: {} },
        { id: "b", parentId: "a", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    // `a` is seeded into the visited set, so the walk stops before naming
    // the node as its own ancestor — which is the right answer as well as
    // a terminating one.
    expect(ancestorsOf(cyclic, "a")).toEqual(["b"]);
    expect(regionOf(cyclic, "a")).toBeUndefined();
  });
});

describe("boundsOfNodes", () => {
  const boxOf = (id: string) => (id === "block" ? { x: 0, y: 0, w: 40, h: 30 } : undefined);

  it("unions the members' absolute boxes", () => {
    // block at (1015,125) sized 40×30; leaf at (1017,128) sized 0.
    expect(boundsOfNodes(nested(), ["block", "leaf"], boxOf)).toEqual({ x: 1015, y: 125, w: 40, h: 30 });
  });

  it("counts an unmeasured member as a POINT rather than skipping it", () => {
    // Deliberate widening: a region drawn slightly too large is cosmetic,
    // one drawn too small clips a member.
    expect(boundsOfNodes(nested(), ["block", "loose"], boxOf)).toEqual({ x: 900, y: 125, w: 155, h: 775 });
  });

  it("is undefined when nothing resolves — never a zero box", () => {
    expect(boundsOfNodes(nested(), ["ghost"], boxOf)).toBeUndefined();
    expect(boundsOfNodes(nested(), [], boxOf)).toBeUndefined();
  });

  it("works with no boxOf at all — positions alone", () => {
    expect(boundsOfNodes(nested(), ["block", "leaf"])).toEqual({ x: 1015, y: 125, w: 2, h: 3 });
  });
});
