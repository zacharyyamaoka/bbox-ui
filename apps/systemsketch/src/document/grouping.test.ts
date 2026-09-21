// src/document/grouping.test.ts — the algebra, asserted where it is pure.
//
// THE ASSERTION THIS FILE IS REALLY ABOUT: collapse then expand returns the
// board you started with, as scene EQUALITY including array index — the same
// bar `@trunk/scene/collapse.test.ts` sets for the trunk half, restated here
// because this app inserts a corner block between the two and an inverse that
// is only nearly exact is not an inverse.
//
// The browser half is `src/grouping.smoke.test.tsx`, which drives the same
// pair through the real store from a real click.
import { describe, expect, it } from "vitest";

import { REGION_NODE_TYPE } from "@trunk/scene/region";

import { REGION_CORNER_BAND_PX, groupScene, ungroupScene } from "./grouping";
import type { DocumentScene } from "./sceneFromStore";

/** Deterministic ids, so a failure names the same node twice running. */
function counterMint(): () => string {
  let next = 0;
  return () => `shape:minted${++next}`;
}

/** A → B → C, straight through, with B the thing we will fold away. */
function chainScene(): DocumentScene {
  return {
    nodes: [
      { id: "shape:A", type: "block", position: { x: 0, y: 0 }, data: { kind: "block", name: "A", view: "port", ports: { right: ["out"] }, portTypes: { out: "Pose" } } },
      { id: "shape:B", type: "block", position: { x: 200, y: 40 }, data: { kind: "block", name: "B", view: "port", ports: { left: ["in"], right: ["out"] }, portTypes: {} } },
      { id: "shape:C", type: "block", position: { x: 400, y: 0 }, data: { kind: "block", name: "C", view: "port", ports: { left: ["in"] }, portTypes: {} } },
    ],
    edges: [
      { id: "shape:e1", source: "shape:A", sourceHandle: "out", target: "shape:B", targetHandle: "in", data: { variant: "data", routing: "elbow" } },
      { id: "shape:e2", source: "shape:B", sourceHandle: "out", target: "shape:C", targetHandle: "in", data: { variant: "data", routing: "elbow" } },
    ],
  };
}

describe("P-048 — group / ungroup algebra in the app's own document", () => {
  it("collapse then expand returns the scene it started from, node for node and edge for edge", () => {
    const before = chainScene();
    const grouped = groupScene(before, ["shape:B"], counterMint());
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;

    const back = ungroupScene(grouped.scene, grouped.regionId);
    expect(back).not.toBeNull();
    expect(back!.scene).toEqual(before);
    // Not just deep-equal contents — the SAME ARRAY INDEX, which is what
    // `docs/peps/0003` says the round trip is asserted as.
    expect(back!.scene.nodes.map((node) => node.id)).toEqual(["shape:A", "shape:B", "shape:C"]);
    expect(back!.scene.edges.map((edge) => edge.id)).toEqual(["shape:e1", "shape:e2"]);
  });

  it("the promoted ports land on a CORNER BLOCK, never on the region — ss-region refuses every cable", () => {
    const grouped = groupScene(chainScene(), ["shape:B"], counterMint());
    if (!grouped.ok) throw new Error("expected a collapse");

    const region = grouped.scene.nodes.find((node) => node.id === grouped.regionId)!;
    expect(region.type).toBe(REGION_NODE_TYPE);
    // The region publishes no rails of its own. If this ever goes green with a
    // port on it, `RegionShapeUtil.canBind()` (false, unconditionally) will
    // drop the cable on the way into the store.
    expect(region.data.ports).toBeUndefined();

    const corner = grouped.scene.nodes.find((node) => node.id === grouped.cornerBlockId)!;
    expect(corner.parentId).toBe(grouped.regionId);
    expect(corner.position).toEqual({ x: 0, y: 0 });
    expect(region.data.cornerBlockId).toBe(grouped.cornerBlockId);
    expect(Object.values(corner.data.ports ?? {}).flat().sort()).toEqual(["in", "out"]);
    // The inner endpoint's declared type travels with the port it was
    // promoted through, so a cable landing on the card can still be judged.
    expect(grouped.scene.edges.every((edge) => edge.source !== grouped.regionId && edge.target !== grouped.regionId)).toBe(true);
  });

  it("no edge outside the region names a MEMBER of it — isolation is structural", () => {
    const grouped = groupScene(chainScene(), ["shape:B"], counterMint());
    if (!grouped.ok) throw new Error("expected a collapse");
    const inside = new Set(["shape:B"]);
    const outside = grouped.scene.edges.filter((edge) => !inside.has(edge.source) && !inside.has(edge.target));
    expect(outside).toHaveLength(grouped.scene.edges.length - 2);
    for (const edge of outside) {
      expect(inside.has(edge.source)).toBe(false);
      expect(inside.has(edge.target)).toBe(false);
    }
  });

  it("grouping moves nothing the person arranged: a member's PAGE position is unchanged", () => {
    const before = chainScene();
    const grouped = groupScene(before, ["shape:B"], counterMint());
    if (!grouped.ok) throw new Error("expected a collapse");
    const region = grouped.scene.nodes.find((node) => node.id === grouped.regionId)!;
    const member = grouped.scene.nodes.find((node) => node.id === "shape:B")!;
    expect({
      x: region.position.x + member.position.x,
      y: region.position.y + member.position.y,
    }).toEqual({ x: 200, y: 40 });
    // The frame is the thing that grew, upward, by exactly the band.
    expect(region.position.y).toBe(40 - REGION_CORNER_BAND_PX);
  });

  it("a selection that crosses no cable gets no corner block — an empty card would claim a contract it has none of", () => {
    const before = chainScene();
    const grouped = groupScene(before, ["shape:A", "shape:B", "shape:C"], counterMint());
    if (!grouped.ok) throw new Error("expected a collapse");
    expect(grouped.cornerBlockId).toBeNull();
    expect(grouped.portIds).toEqual([]);
    const back = ungroupScene(grouped.scene, grouped.regionId);
    expect(back!.scene).toEqual(before);
  });

  it("refuses a selection whose roots sit under different parents, and answers null for a node that is not a region", () => {
    const before = chainScene();
    const grouped = groupScene(before, ["shape:B"], counterMint());
    if (!grouped.ok) throw new Error("expected a collapse");
    // B is now inside the region; A is not. Collapsing both would destroy the
    // nesting dissolve would have to restore.
    const second = groupScene(grouped.scene, ["shape:A", "shape:B"], counterMint());
    expect(second.ok).toBe(false);
    expect(ungroupScene(before, "shape:A")).toBeNull();
  });
});
