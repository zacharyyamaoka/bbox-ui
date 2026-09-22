// src/scene/region.branch.test.ts — this lane's OWN unit tests (the
// acceptance files under `src/scene`, `src/components`, `src/hosts` and
// `src/components/region.acceptance.ts` were committed before this lane
// and are read-only to it).
//
// What is worth testing about a factory that only builds records: the
// RULINGS it encodes, because those are the things a well-meaning refactor
// would undo. A branch's corner block has no output wall (Q1/V1), a branch
// is never a definition occurrence, arms are nodes parented at the region,
// and a nested branch hangs off an ARM. Each of those is one assertion here
// and a paragraph of prose in `branch.ts`.

import { describe, expect, it } from "vitest";

import { armsOf, armOf, isArm } from "./controlFlow";
import { isRegion } from "./region";
import { childrenOf } from "./scene";
import { armNode, branchNode, ifElifElseArms, matchCaseArms } from "./region.branch";
import { BRANCH_ACTIVE, BRANCH_FOLDED, BRANCH_MANY_INPUTS, BRANCH_NESTED, BRANCH_ONE_INPUT, MATCH_CASE } from "./region.branch.fixtures";

describe("branchNode — the region", () => {
  const [region, ...arms] = branchNode({
    id: "br",
    position: { x: 10, y: 20 },
    conditions: ["fast"],
    arms: ifElifElseArms(["fast"]),
  });

  it("is ONE region node, first in the returned array", () => {
    expect(region.id).toBe("br");
    expect(region.type).toBe("region");
    expect(isRegion(region)).toBe(true);
    expect(region.position).toEqual({ x: 10, y: 20 });
  });

  it("carries the branch vocabulary and the default title (Q2)", () => {
    expect(region.data.region).toEqual({ kind: "branch", view: "expanded" });
    expect(region.data.name).toBe("Branch");
  });

  it("puts the conditions on the LEFT wall and mints NO right wall (Q1, V1)", () => {
    expect(region.data.ports).toEqual({ left: ["fast"] });
    expect(region.data.ports?.right).toBeUndefined();
    // Every wall, not just `right`: a yield dot smuggled onto `top` or
    // `bottom` would be the same ruling broken by a different door.
    expect(Object.keys(region.data.ports ?? {})).toEqual(["left"]);
  });

  it("is never a definition occurrence", () => {
    expect(region.definitionId).toBeUndefined();
  });

  it("copies the conditions rather than aliasing the caller's array", () => {
    const conditions = ["fast"];
    const [built] = branchNode({ id: "br", position: { x: 0, y: 0 }, conditions, arms: [] });
    conditions.push("later");
    expect(built.data.ports?.left).toEqual(["fast"]);
  });

  it("only carries `activeArm` when one was named", () => {
    expect(region.data.region?.activeArm).toBeUndefined();
    const [withActive] = branchNode({ id: "br", position: { x: 0, y: 0 }, activeArm: "if", arms: ifElifElseArms(["fast"]) });
    expect(withActive.data.region).toEqual({ kind: "branch", view: "expanded", activeArm: "if" });
  });

  it("takes a `parentId` for nesting and omits the field otherwise", () => {
    expect(region.parentId).toBeUndefined();
    const [nested] = branchNode({ id: "inner", parentId: "if", position: { x: 0, y: 0 }, arms: [] });
    expect(nested.parentId).toBe("if");
  });

  it("hugs its arms unless a height is given", () => {
    expect(region.data.h).toBeUndefined();
    expect(region.data.w).toBe(520);
    const [sized] = branchNode({ id: "br", position: { x: 0, y: 0 }, w: 400, h: 300, arms: [] });
    expect(sized.data.w).toBe(400);
    expect(sized.data.h).toBe(300);
  });

  it("returns the arms after it, one per spec, in order", () => {
    expect(arms.map((arm) => arm.id)).toEqual(["if", "else"]);
    expect(arms.every(isArm)).toBe(true);
  });
});

describe("armNode — an arm is a node whose parent is the region", () => {
  it("parents at the region, titles from `title`, and defaults to open", () => {
    const arm = armNode({ id: "if", title: "if fast:" }, "br");
    expect(arm.type).toBe("arm");
    expect(arm.parentId).toBe("br");
    expect(arm.data.name).toBe("if fast:");
    expect(arm.data.arm).toEqual({ open: true });
  });

  it("carries a fold state and a remembered body height when given", () => {
    expect(armNode({ id: "elif", title: "elif cached:", open: false, h: 120 }, "br").data.arm).toEqual({ open: false, h: 120 });
  });

  it("writes a derived position that no host reads — `regionLayout` stacks the rows", () => {
    expect(armNode({ id: "if", title: "if fast:" }, "br").position).toEqual({ x: 0, y: 0 });
  });

  it("is found by `armsOf` in authored order, and only arms are", () => {
    const scene = {
      nodes: [
        ...branchNode({ id: "br", position: { x: 0, y: 0 }, arms: ifElifElseArms(["a", "b"]) }),
        { id: "member", parentId: "if", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    expect(armsOf(scene, "br").map((arm) => arm.id)).toEqual(["if", "elif", "else"]);
    expect(armOf(scene, "member")?.id).toBe("if");
  });
});

describe("the arm-title helpers render the source header verbatim", () => {
  it("if / elif / else, with `elif-2…` once there are several", () => {
    expect(ifElifElseArms(["fast", 'mode == "safe"', "cached"])).toEqual([
      { id: "if", title: "if fast:" },
      { id: "elif", title: 'elif mode == "safe":' },
      { id: "elif-2", title: "elif cached:" },
      { id: "else", title: "else:" },
    ]);
  });

  it("a guard chain with no conditions is a lone `else:`", () => {
    expect(ifElifElseArms([])).toEqual([{ id: "else", title: "else:" }]);
  });

  it("match / case, ending in the wildcard", () => {
    expect(matchCaseArms(['"go"', '"stop"'])).toEqual([
      { id: "case-1", title: 'case "go":' },
      { id: "case-2", title: 'case "stop":' },
      { id: "case-_", title: "case _:" },
    ]);
  });
});

describe("the fixtures encode the rulings they are drawn from", () => {
  const scenes = [
    ["BRANCH_ONE_INPUT", BRANCH_ONE_INPUT],
    ["BRANCH_MANY_INPUTS", BRANCH_MANY_INPUTS],
    ["MATCH_CASE", MATCH_CASE],
    ["BRANCH_FOLDED", BRANCH_FOLDED],
    ["BRANCH_ACTIVE", BRANCH_ACTIVE],
    ["BRANCH_NESTED", BRANCH_NESTED],
  ] as const;

  it.each(scenes)("%s: no region grows an output wall, and none is a definition occurrence", (_name, scene) => {
    const regions = scene.nodes.filter(isRegion);
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      expect(Object.keys(region.data.ports ?? {})).toEqual(["left"]);
      expect(region.definitionId).toBeUndefined();
    }
  });

  it.each(scenes)("%s: every arm is parented at a region and every member at an arm or a region", (_name, scene) => {
    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    for (const node of scene.nodes) {
      if (isArm(node)) expect(isRegion(byId.get(node.parentId ?? "")!)).toBe(true);
      else if (node.parentId !== undefined) {
        const parent = byId.get(node.parentId)!;
        expect(isArm(parent) || isRegion(parent)).toBe(true);
      }
    }
  });

  it("BRANCH_ONE_INPUT joins at the CONSUMER: two sibling-arm cables, one port (Q1/V1)", () => {
    const intoEncode = BRANCH_ONE_INPUT.edges.filter((edge) => edge.target === "encode" && edge.targetHandle === "pose");
    expect(intoEncode.map((edge) => edge.source)).toEqual(["estimate", "fallback"]);
    // The producers are members of DIFFERENT arms — which is what makes this
    // a join rather than two unrelated cables.
    expect(armOf(BRANCH_ONE_INPUT, "estimate")?.id).toBe("if");
    expect(armOf(BRANCH_ONE_INPUT, "fallback")?.id).toBe("else");
  });

  it.each(scenes)("%s: no cable runs between sibling arms — the shape makes it unrepresentable", (_name, scene) => {
    for (const edge of scene.edges) {
      const from = armOf(scene, edge.source);
      const to = armOf(scene, edge.target);
      if (from && to) expect(from.id).toBe(to.id);
    }
  });

  it("BRANCH_NESTED hangs the inner branch off the ARM, never off the region", () => {
    const inner = BRANCH_NESTED.nodes.find((node) => node.id === "inner")!;
    expect(inner.parentId).toBe("if");
    expect(isArm(BRANCH_NESTED.nodes.find((node) => node.id === "if")!)).toBe(true);
    // Read the other way round: the outer arm's children include the inner
    // region, and the outer REGION's own free body holds no members at all.
    expect(childrenOf(BRANCH_NESTED, "if").map((node) => node.id)).toEqual(["inner"]);
    expect(childrenOf(BRANCH_NESTED, "br").every(isArm)).toBe(true);
    expect(armsOf(BRANCH_NESTED, "inner").map((node) => node.id)).toEqual(["inner-if", "inner-else"]);
  });

  it("BRANCH_FOLDED and BRANCH_ACTIVE are the same board, one field apart", () => {
    expect(BRANCH_ACTIVE.edges).toEqual(BRANCH_FOLDED.edges);
    const folded = BRANCH_FOLDED.nodes.find((node) => node.id === "elif")!;
    const active = BRANCH_ACTIVE.nodes.find((node) => node.id === "elif")!;
    expect(folded.data.arm?.open).toBe(false);
    expect(active.data.arm?.open).toBe(true);
    expect(BRANCH_FOLDED.nodes.find((node) => node.id === "br")!.data.region?.activeArm).toBeUndefined();
    expect(BRANCH_ACTIVE.nodes.find((node) => node.id === "br")!.data.region?.activeArm).toBe("if");
  });

  it("MATCH_CASE titles read as source, character for character", () => {
    expect(armsOf(MATCH_CASE, "br").map((arm) => arm.data.name)).toEqual(['case "go":', 'case "stop":', "case _:"]);
  });

  it("BRANCH_MANY_INPUTS puts every condition on the one corner block", () => {
    expect(BRANCH_MANY_INPUTS.nodes.find((node) => node.id === "br")!.data.ports).toEqual({ left: ["input_1", "input_2", "input_3"] });
    expect(armsOf(BRANCH_MANY_INPUTS, "br").map((arm) => arm.id)).toEqual(["arm-1", "arm-2", "arm-3"]);
  });
});
