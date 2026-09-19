// src/presets/loop/loop.test.ts — this lane's OWN unit tests (lane B of
// docs/CONTROL-FLOW-PLAN.md). The story-level acceptance lives in
// `stories/controlFlow.acceptance.ts` and is off-limits; this file pins the
// pure half: the shape of the records the factories mint.
//
// What is worth asserting here is exactly what a future refactor could
// quietly undo without breaking a render: the `while` header's MISSING
// right wall, the absence of a `definitionId`, and the absence of an
// authored badge when no seed is given. All three are decisions, and all
// three look like omissions.

import { describe, expect, it } from "vitest";

import { REGION_NODE_TYPE } from "../../scene/region";
import { LOOP_PORT_IDS, carriedValueEdge, forLoopNode, whileLoopNode } from "./loop";

describe("LOOP_PORT_IDS", () => {
  it("is the header's type vocabulary — the id IS the label", () => {
    expect(LOOP_PORT_IDS).toEqual({ iterable: "Iterable", iter: "Iter", bool: "Bool" });
  });
});

describe("forLoopNode", () => {
  it("is ONE region node whose ports are the corner block's", () => {
    const node = forLoopNode({ id: "loop", position: { x: 10, y: 20 } });
    expect(node.id).toBe("loop");
    expect(node.type).toBe(REGION_NODE_TYPE);
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data.region).toEqual({ kind: "loop", loop: "for", view: "expanded" });
    expect(node.data.ports).toEqual({ left: ["Iterable"], right: ["Iter"] });
    expect(node.data.name).toBe("For Loop");
    expect(node.data.w).toBe(400);
    expect(node.data.h).toBe(300);
  });

  it("never carries a definitionId — a region is isolated, not an occurrence", () => {
    const node = forLoopNode({ id: "loop", position: { x: 0, y: 0 } });
    expect("definitionId" in node).toBe(false);
  });

  it("omits parentId and badge entirely when unset, rather than writing undefined", () => {
    const node = forLoopNode({ id: "loop", position: { x: 0, y: 0 } });
    expect("parentId" in node).toBe(false);
    expect("badge" in node.data).toBe(false);
  });

  it("takes a name, a size, a header chip, a view and a parent", () => {
    const node = forLoopNode({
      id: "inner",
      name: "for row in rows",
      position: { x: 5, y: 5 },
      w: 520,
      h: 280,
      view: "opaque",
      badge: "iteration 3 of 7",
      parentId: "outer",
    });
    expect(node.parentId).toBe("outer");
    expect(node.data.name).toBe("for row in rows");
    expect(node.data.badge).toBe("iteration 3 of 7");
    expect(node.data.w).toBe(520);
    expect(node.data.h).toBe(280);
    expect(node.data.region?.view).toBe("opaque");
  });
});

describe("whileLoopNode", () => {
  it("has a Bool inlet and NO right wall — the body owns the values it carries", () => {
    const node = whileLoopNode({ id: "loop", position: { x: 0, y: 0 } });
    expect(node.data.region).toEqual({ kind: "loop", loop: "while", view: "expanded" });
    expect(node.data.ports).toEqual({ left: ["Bool"] });
    // The assertion that matters: not merely "right is empty" but that the
    // wall was never named. `expectCornerPorts` reads rails by `data-edge`,
    // and `edgeSpecsOf` mints one rail per KEY of `data.ports` — an empty
    // `right: []` would paint an empty right rail, which is the DOM the
    // story asserts must not exist.
    expect("right" in (node.data.ports ?? {})).toBe(false);
    expect(node.data.name).toBe("While Loop");
  });

  it("never carries a definitionId either", () => {
    expect("definitionId" in whileLoopNode({ id: "loop", position: { x: 0, y: 0 } })).toBe(false);
  });

  it("mints a fresh record per call (no shared ports object between loops)", () => {
    const first = forLoopNode({ id: "a", position: { x: 0, y: 0 } });
    const second = forLoopNode({ id: "b", position: { x: 0, y: 0 } });
    expect(first.data.ports).not.toBe(second.data.ports);
    expect(first.data.region).not.toBe(second.data.region);
  });
});

describe("carriedValueEdge", () => {
  it("leaves and re-enters the SAME block, dotted and orthogonal", () => {
    const edge = carriedValueEdge({ id: "e-carry", nodeId: "merge", from: "Pose", to: "pose" });
    expect(edge).toEqual({
      id: "e-carry",
      source: "merge",
      sourceHandle: "Pose",
      target: "merge",
      targetHandle: "pose",
      data: { variant: "delayed", routing: "elbow" },
    });
  });

  it("authors no badge without a seed — `sceneWires` derives z⁻¹ (plan Q7)", () => {
    const edge = carriedValueEdge({ id: "e-carry", nodeId: "merge", from: "Pose", to: "pose" });
    expect("badge" in (edge.data ?? {})).toBe(false);
  });

  it("spells the seed into the pill when one is named", () => {
    const edge = carriedValueEdge({ id: "e-carry", nodeId: "merge", from: "Pose", to: "pose", seed: "estimate()" });
    expect(edge.data?.badge).toBe("z⁻¹ = estimate()");
    // Character-for-character: the superscript minus and the superscript
    // one are authored content, not decoration a renderer may normalize.
    expect(Array.from(edge.data?.badge ?? "")).toEqual(Array.from("z⁻¹ = estimate()"));
  });
});
