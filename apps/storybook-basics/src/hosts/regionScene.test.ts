// src/hosts/regionScene.test.ts — ACCEPTANCE for docs/CONTROL-FLOW-PLAN.md
// lane E (the toggle as ONE field flip). Off-limits to builders. Red until
// `regionScene.ts`'s bodies land. Runs in the `unit` project: pure node,
// no React — `regionScene.ts` must stay importable without a DOM.

import { describe, expect, it } from "vitest";

import { REGION_NODE_TYPE } from "../scene/region";
import type { HostScene } from "./hostScene";
import { isOpaqueRegion, projectHostScene, regionViewOf, setRegionView, toggleRegionView } from "./regionScene";

function scene(): HostScene {
  return {
    nodes: [
      { id: "src", type: "block", position: { x: 0, y: 0 }, data: { name: "src", view: "port", ports: { right: ["pose"] } } },
      {
        id: "loop",
        type: REGION_NODE_TYPE,
        position: { x: 200, y: 0 },
        data: { name: "For Loop", region: { kind: "loop", loop: "for" }, w: 400, h: 300, ports: { left: ["Iterable"], right: ["Iter"] } },
      },
      { id: "merge", type: "block", parentId: "loop", position: { x: 40, y: 80 }, data: { name: "merge", view: "port", ports: { left: ["pose", "other"], right: ["Pose"] } } },
      { id: "enc", type: "block", position: { x: 700, y: 0 }, data: { name: "enc", view: "port", ports: { left: ["pose"] } } },
    ],
    edges: [
      { id: "e-seed", source: "src", sourceHandle: "pose", target: "merge", targetHandle: "pose" },
      { id: "e-iter", source: "loop", sourceHandle: "Iter", target: "merge", targetHandle: "other" },
      { id: "e-out", source: "merge", sourceHandle: "Pose", target: "enc", targetHandle: "pose" },
    ],
  };
}

describe("the view vocabulary", () => {
  it("defaults to expanded and reads opaque only off a region", () => {
    const s = scene();
    expect(regionViewOf(s.nodes[1])).toBe("expanded");
    expect(isOpaqueRegion(s.nodes[1])).toBe(false);
    const flipped = setRegionView(s, "loop", "opaque");
    expect(isOpaqueRegion(flipped.nodes[1])).toBe(true);
    // A block with a stray `region` field is still not a region.
    expect(isOpaqueRegion({ id: "x", type: "block", position: { x: 0, y: 0 }, data: { region: { kind: "loop", view: "opaque" } } })).toBe(false);
  });
});

describe("setRegionView — positions preserved BY CONSTRUCTION", () => {
  it("changes exactly one field on exactly one node and nothing else", () => {
    const s = scene();
    const next = setRegionView(s, "loop", "opaque");
    expect(next).not.toBe(s);
    expect(next.edges).toBe(s.edges);
    expect(next.nodes[0]).toBe(s.nodes[0]);
    expect(next.nodes[2]).toBe(s.nodes[2]);
    expect(next.nodes[3]).toBe(s.nodes[3]);
    expect(next.nodes[1]).not.toBe(s.nodes[1]);
    expect(next.nodes[1].position).toEqual(s.nodes[1].position);
    expect(next.nodes[1].data).toEqual({ ...s.nodes[1].data, region: { ...s.nodes[1].data.region, view: "opaque" } });
    expect(JSON.stringify(s)).toBe(JSON.stringify(scene()));
  });

  it("is a referentially-honest no-op for an unknown id, a non-region, or an unchanged view", () => {
    const s = scene();
    expect(setRegionView(s, "nope", "opaque")).toBe(s);
    expect(setRegionView(s, "src", "opaque")).toBe(s);
    expect(setRegionView(s, "loop", "expanded")).toBe(s);
  });

  it("round-trips through toggle: opaque → expanded restores an equal scene", () => {
    const s = scene();
    const there = toggleRegionView(s, "loop");
    expect(regionViewOf(there.nodes[1])).toBe("opaque");
    const back = toggleRegionView(there, "loop");
    expect(regionViewOf(back.nodes[1])).toBe("expanded");
    expect(back.nodes.map((node) => node.position)).toEqual(s.nodes.map((node) => node.position));
  });
});

describe("projectHostScene — the edges a host paints", () => {
  it("is the identity on an all-expanded scene", () => {
    const s = scene();
    const { scene: projected, regions } = projectHostScene(s);
    expect(projected.nodes).toBe(s.nodes);
    expect(projected.edges).toBe(s.edges);
    expect(regions).toEqual([]);
  });

  it("re-points crossing edges at the opaque loop, drops its private Iter cable, and reads polarity off the host's walls", () => {
    const s = setRegionView(scene(), "loop", "opaque");
    const { scene: projected, regions } = projectHostScene(s);
    expect(projected.edges.map((edge) => edge.id)).toEqual(["e-seed", "e-out"]);
    expect(projected.edges[0]).toMatchObject({ target: "loop", targetHandle: "merge/pose" });
    expect(projected.edges[1]).toMatchObject({ source: "loop", sourceHandle: "merge/Pose" });
    expect(regions[0].ports.map((port) => [port.id, port.side, port.by]).sort()).toEqual([
      ["merge/Pose", "right", "polarity"],
      ["merge/pose", "left", "polarity"],
    ]);
    expect(regions[0].hidden).toEqual({ nodes: 1, arms: 0, edges: 1 });
  });
});
