// src/scene/controlFlow.test.ts — ACCEPTANCE for docs/CONTROL-FLOW-PLAN.md
// lane A, committed before any builder existed. Off-limits to builders: a
// failing assertion here is a signal to close the lane, not a bug in the
// test. Red until `controlFlow.ts`'s bodies land.

import { describe, expect, it } from "vitest";

import { ARM_NODE_TYPE, armOf, armsOf, bodyChildrenOf, describeHidden, hiddenSummary, isArm } from "./controlFlow";
import { REGION_NODE_TYPE } from "./region";
import type { BlockScene } from "./scene";

/**
 * if fast: estimate() / else: fallback() — Zach's one-input branch
 * (`Pasted image 20260918143241.png`): the condition lands on the corner
 * block's own port, data cables run straight from outside into the arms,
 * and both arms fan in at `sink` (V1, picked 2026-09-02).
 */
function branchScene(): BlockScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 0 }, data: {} },
      { id: "br", type: REGION_NODE_TYPE, position: { x: 100, y: 0 }, data: {} },
      { id: "if", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: {} },
      { id: "else", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: {} },
      { id: "est", parentId: "if", position: { x: 10, y: 10 }, data: {} },
      { id: "fb", parentId: "else", position: { x: 10, y: 10 }, data: {} },
      { id: "sink", position: { x: 500, y: 0 }, data: {} },
    ],
    edges: [
      { id: "e-cond", source: "src", sourceHandle: "fast", target: "br", targetHandle: "fast" },
      { id: "e-in1", source: "src", sourceHandle: "frame", target: "est", targetHandle: "frame" },
      { id: "e-in2", source: "src", sourceHandle: "frame", target: "fb", targetHandle: "frame" },
      { id: "e-out1", source: "est", sourceHandle: "pose", target: "sink", targetHandle: "pose" },
      { id: "e-out2", source: "fb", sourceHandle: "pose", target: "sink", targetHandle: "pose" },
    ],
  };
}

/**
 * for other in others: merge() → smooth() with the carried `pose` — the
 * loop from `Pasted image 20260918145709.png`, in P1 form: `Iterable` lands
 * on the corner block, `Iter` leaves it INTO the body, the seed enters the
 * body directly, and the carried value is a delayed self-cable on merge.
 */
function loopScene(): BlockScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 0 }, data: {} },
      { id: "loop", type: REGION_NODE_TYPE, position: { x: 100, y: 0 }, data: {} },
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

describe("an arm is a node kind", () => {
  it("is `type: \"arm\"`, a total predicate like `isRegion`", () => {
    expect(ARM_NODE_TYPE).toBe("arm");
    expect(isArm({ type: "arm" })).toBe(true);
    expect(isArm({ type: "region" })).toBe(false);
    expect(isArm({})).toBe(false);
  });
});

describe("armsOf / bodyChildrenOf — a region's direct children, split by kind", () => {
  it("lists a branch's arms in scene order and a loop's as empty", () => {
    expect(armsOf(branchScene(), "br").map((node) => node.id)).toEqual(["if", "else"]);
    expect(armsOf(loopScene(), "loop")).toEqual([]);
  });

  it("lists a loop's blocks as its body and a branch's body as empty", () => {
    expect(bodyChildrenOf(loopScene(), "loop").map((node) => node.id)).toEqual(["merge", "smooth"]);
    expect(bodyChildrenOf(branchScene(), "br")).toEqual([]);
  });

  it("only reads DIRECT children — a block inside an arm is the arm's, not the region's", () => {
    expect(bodyChildrenOf(branchScene(), "br").map((node) => node.id)).not.toContain("est");
  });

  it("is total: an unknown region has no arms and no body", () => {
    expect(armsOf(branchScene(), "nope")).toEqual([]);
    expect(bodyChildrenOf(branchScene(), "nope")).toEqual([]);
  });
});

describe("armOf — the nearest arm ancestor", () => {
  it("finds the arm a block sits in", () => {
    expect(armOf(branchScene(), "est")?.id).toBe("if");
    expect(armOf(branchScene(), "fb")?.id).toBe("else");
  });

  it("is undefined for a loop member, the region itself, a top-level node and an unknown id", () => {
    expect(armOf(loopScene(), "merge")).toBeUndefined();
    expect(armOf(branchScene(), "br")).toBeUndefined();
    expect(armOf(branchScene(), "src")).toBeUndefined();
    expect(armOf(branchScene(), "nope")).toBeUndefined();
  });

  it("terminates on a malformed parentId cycle", () => {
    const scene: BlockScene = {
      nodes: [
        { id: "a", parentId: "b", position: { x: 0, y: 0 }, data: {} },
        { id: "b", parentId: "a", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    expect(armOf(scene, "a")).toBeUndefined();
  });
});

describe("hiddenSummary — measured, never narrated", () => {
  it("counts a branch's blocks and arms; nothing interior to hide", () => {
    expect(hiddenSummary(branchScene(), "br")).toEqual({ nodes: 2, arms: 2, edges: 0 });
  });

  it("counts a loop's blocks and the edges its card cannot show: interior AND the region's own port-inner `Iter` cable", () => {
    // e-iter (port-inner), e-ms (interior), e-carry (interior, self) — three.
    // e-iterable is port-outer and e-seed/e-out cross the boundary: all shown.
    expect(hiddenSummary(loopScene(), "loop")).toEqual({ nodes: 2, arms: 0, edges: 3 });
  });

  it("is total on an unknown region", () => {
    expect(hiddenSummary(loopScene(), "nope")).toEqual({ nodes: 0, arms: 0, edges: 0 });
  });
});

describe("describeHidden — the opaque card's footer line", () => {
  it("omits zero clauses and pluralises", () => {
    expect(describeHidden({ nodes: 2, arms: 2, edges: 0 })).toBe("2 blocks · 2 arms hidden");
    expect(describeHidden({ nodes: 2, arms: 0, edges: 3 })).toBe("2 blocks · 3 edges hidden");
    expect(describeHidden({ nodes: 1, arms: 1, edges: 1 })).toBe("1 block · 1 arm · 1 edge hidden");
  });

  it("says so when nothing is hidden", () => {
    expect(describeHidden({ nodes: 0, arms: 0, edges: 0 })).toBe("nothing hidden");
  });
});
