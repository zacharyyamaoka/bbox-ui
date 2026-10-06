// src/scene/region.branch.test.ts — this lane's OWN unit tests (the
// acceptance files under `src/scene`, `src/components`, `src/hosts` and
// `src/components/blockRegion.acceptance.ts` (then `region.acceptance.ts`) were committed before this lane
// and are read-only to it).
//
// REWRITTEN 2026-09-22 for the split (`region.branch.ts`'s own header):
// `match` is a LabVIEW Case Structure — one subject, static patterns, no
// arm operand — and `if`/`elif`/`else` is not — no shared subject, one
// operand PER ARM. What is worth testing about factories that only build
// records: the RULINGS they encode, because those are the things a
// well-meaning refactor would undo. This file tests the GRAMMAR (who owns
// which dot), not the strings the old, conflated version happened to write.

import { describe, expect, it } from "vitest";

import { armsOf, armOf, isArm } from "./controlFlow";
import { isRegion } from "./region";
import { childrenOf } from "./scene";
import { armNode, branchNode, ifElifElseArms, matchCaseArms, matchNode } from "./region.branch";
import { BRANCH_ACTIVE, BRANCH_FOLDED, BRANCH_MANY_INPUTS, BRANCH_NESTED, BRANCH_ONE_INPUT, MATCH_CASE } from "./region.branch.fixtures";

describe("branchNode — the if/elif/else region has NO head operand", () => {
  const [region, ...arms] = branchNode({
    id: "br",
    position: { x: 10, y: 20 },
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

  it("mints NO left-wall port and NO right-wall port — no wall at all (the split)", () => {
    expect(region.data.ports).toBeUndefined();
  });

  it("is never a definition occurrence", () => {
    expect(region.definitionId).toBeUndefined();
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

  it("MUTATION 1 — rejects an arm that carries `captures` (that field is match's)", () => {
    expect(() => branchNode({ id: "br", position: { x: 0, y: 0 }, arms: [{ id: "if", title: "if:", captures: ["y"] }] })).toThrow();
  });

  it("rejects an arm that carries both `test` and `captures`", () => {
    expect(() =>
      branchNode({ id: "br", position: { x: 0, y: 0 }, arms: [{ id: "if", title: "if:", test: { id: "if" }, captures: ["y"] }] }),
    ).toThrow();
  });
});

describe("matchNode — the match region has exactly ONE head operand, the subject", () => {
  const [region, ...arms] = matchNode({
    id: "br",
    position: { x: 10, y: 20 },
    subject: "cmd",
    arms: matchCaseArms(['"go"']),
  });

  it("is ONE region node carrying `kind: \"branch\"` (RegionKind has no third kind — see region.branch.ts)", () => {
    expect(region.type).toBe("region");
    expect(region.data.region?.kind).toBe("branch");
  });

  it("puts the subject on the LEFT wall and mints NO right wall (Q1, V1) and no other wall", () => {
    expect(region.data.ports).toEqual({ left: ["cmd"] });
    expect(Object.keys(region.data.ports ?? {})).toEqual(["left"]);
  });

  it("is never a definition occurrence", () => {
    expect(region.definitionId).toBeUndefined();
  });

  it("returns one arm node per pattern plus the wildcard, none carrying a test port", () => {
    expect(arms.map((arm) => arm.id)).toEqual(["case-1", "case-_"]);
    for (const arm of arms) expect(arm.data.ports?.left).toBeUndefined();
  });

  it("MUTATION 2 — rejects an arm that carries its own `test` (a match arm tests nothing)", () => {
    expect(() =>
      matchNode({ id: "br", position: { x: 0, y: 0 }, subject: "cmd", arms: [{ id: "case-1", title: 'case "go":', test: { id: "case-1" } }] }),
    ).toThrow();
  });

  it("accepts an arm that carries `captures` — a pattern may bind", () => {
    const [, arm] = matchNode({
      id: "br",
      position: { x: 0, y: 0 },
      subject: "pt",
      arms: [{ id: "case-1", title: "case Point(x=0, y=y):", captures: ["y"] }],
    });
    expect(arm.data.ports?.right).toEqual(["y"]);
  });
});

describe("armNode — an arm is a node whose parent is the region", () => {
  it("parents at the region, titles from `title`, and defaults to open", () => {
    const arm = armNode({ id: "if", title: "if:" }, "br");
    expect(arm.type).toBe("arm");
    expect(arm.parentId).toBe("br");
    expect(arm.data.name).toBe("if:");
    expect(arm.data.arm).toEqual({ open: true });
  });

  it("carries a fold state and a remembered body height when given", () => {
    expect(armNode({ id: "elif", title: "elif:", open: false, h: 120 }, "br").data.arm).toEqual({ open: false, h: 120 });
  });

  it("writes a derived position that no host reads — `regionLayout` stacks the rows", () => {
    expect(armNode({ id: "if", title: "if:" }, "br").position).toEqual({ x: 0, y: 0 });
  });

  it("projects `test.id` onto the arm's own LEFT wall — the operand's dot", () => {
    const arm = armNode({ id: "if", title: "if:", test: { id: "if", default: "fast" } }, "br");
    expect(arm.data.ports).toEqual({ left: ["if"] });
  });

  it("projects `captures` onto the arm's own RIGHT wall — the header producing a value INTO the arm", () => {
    const arm = armNode({ id: "case-1", title: "case Point(x=0, y=y):", captures: ["y"] }, "br");
    expect(arm.data.ports).toEqual({ right: ["y"] });
  });

  it("carries NO `ports` at all when the arm has neither (else, case _:)", () => {
    expect(armNode({ id: "else", title: "else:" }, "br").data.ports).toBeUndefined();
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

describe("ifElifElseArms — one operand PER ARM, none shared, none on `else`", () => {
  it("if / elif / else, with `elif-2…` once there are several — the expression leaves the title", () => {
    expect(ifElifElseArms(["fast", 'mode == "safe"', "cached"])).toEqual([
      { id: "if", title: "if:", test: { id: "if", default: "fast" } },
      { id: "elif", title: "elif:", test: { id: "elif", default: 'mode == "safe"' } },
      { id: "elif-2", title: "elif:", test: { id: "elif-2", default: "cached" } },
      { id: "else", title: "else:" },
    ]);
  });

  it("a guard chain with no conditions is a lone `else:`, carrying no test", () => {
    expect(ifElifElseArms([])).toEqual([{ id: "else", title: "else:" }]);
  });

  it("every non-else arm's `test.id` equals its own arm `id` — stable, already unique", () => {
    for (const arm of ifElifElseArms(["a", "b", "c"])) {
      if (arm.id === "else") continue;
      expect(arm.test?.id).toBe(arm.id);
    }
  });

  it("MUTATION 3 — the expression is preserved VERBATIM in `test.default`, spaces and quotes intact", () => {
    const [, elif] = ifElifElseArms(["fast", 'mode == "safe"']);
    expect(elif.test?.default).toBe('mode == "safe"');
    // A broken port that trimmed or normalised whitespace/quotes would fail
    // this exact-equality check (truthful property rendering).
    expect(elif.test?.default).not.toBe("mode=='safe'");
  });

  it("no arm carries `captures` — that field is match's, from a matched pattern", () => {
    for (const arm of ifElifElseArms(["a", "b"])) expect(arm.captures).toBeUndefined();
  });
});

describe("matchCaseArms — static patterns, no arm owns an operand", () => {
  it("match / case, ending in the wildcard", () => {
    expect(matchCaseArms(['"go"', '"stop"'])).toEqual([
      { id: "case-1", title: 'case "go":' },
      { id: "case-2", title: 'case "stop":' },
      { id: "case-_", title: "case _:" },
    ]);
  });

  it("no arm carries `test` — the subject is tested once, on the head card", () => {
    for (const arm of matchCaseArms(['"go"', '"stop"'])) expect(arm.test).toBeUndefined();
  });
});

describe("the split is enforced at construction, not just documented (mutation-tested)", () => {
  it("MUTATION 1, replayed at the factory boundary — a `branchNode` arm smuggling a head-shaped test is fine (tests ARE branch's), but `captures` is rejected", () => {
    // A deliberate break: what if `branchNode` re-admitted match's field?
    // This is the exact assertion that would go green if `assertArmShape`'s
    // `forbidden === "captures"` branch were deleted.
    expect(() => branchNode({ id: "br", position: { x: 0, y: 0 }, arms: [{ id: "case-1", title: "case _:", captures: ["y"] }] })).toThrow();
  });

  it("MUTATION 2, replayed — a deliberate break: what if `ifElifElseArms` left the expression IN the title instead of moving it to `test.default`?", () => {
    // If a future edit reverted to writing the expression INTO the title
    // (the old code's `title: \`if ${condition}:\``), this assertion goes
    // red: the title would stop being the bare label `ifElifElseArms` now
    // promises.
    const [ifArm] = ifElifElseArms(["fast"]);
    expect(ifArm.title).toBe("if:");
    expect(ifArm.title).not.toContain("fast");
  });

  it("MUTATION 3, replayed — a deliberate break: what if `else`'s arm were given a `test` by mistake?", () => {
    const arms = ifElifElseArms(["fast"]);
    const elseArm = arms.find((arm) => arm.id === "else")!;
    expect(elseArm.test).toBeUndefined();
    // The same fact, read off the emitted scene node: an `else` with a
    // (mistaken) test would grow a left-wall port here.
    expect(armNode(elseArm, "br").data.ports?.left).toBeUndefined();
  });
});

describe("the fixtures encode the rulings they are drawn from", () => {
  const branchScenes = [
    ["BRANCH_ONE_INPUT", BRANCH_ONE_INPUT],
    ["BRANCH_MANY_INPUTS", BRANCH_MANY_INPUTS],
    ["BRANCH_FOLDED", BRANCH_FOLDED],
    ["BRANCH_ACTIVE", BRANCH_ACTIVE],
    ["BRANCH_NESTED", BRANCH_NESTED],
  ] as const;
  const allScenes = [...branchScenes, ["MATCH_CASE", MATCH_CASE]] as const;

  it.each(branchScenes)("%s: every if/elif/else region has NO head port at all", (_name, scene) => {
    const regions = scene.nodes.filter(isRegion);
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) expect(region.data.ports).toBeUndefined();
  });

  it("MATCH_CASE: the region has exactly ONE head port, the subject — and no arm carries a test", () => {
    const region = MATCH_CASE.nodes.find(isRegion)!;
    expect(region.data.ports).toEqual({ left: ["cmd"] });
    for (const arm of armsOf(MATCH_CASE, "br")) expect(arm.data.ports?.left).toBeUndefined();
  });

  it.each(allScenes)("%s: no region is a definition occurrence", (_name, scene) => {
    for (const region of scene.nodes.filter(isRegion)) expect(region.definitionId).toBeUndefined();
  });

  it.each(allScenes)("%s: every arm is parented at a region and every member at an arm or a region", (_name, scene) => {
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
    expect(armOf(BRANCH_ONE_INPUT, "estimate")?.id).toBe("if");
    expect(armOf(BRANCH_ONE_INPUT, "fallback")?.id).toBe("else");
  });

  it("BRANCH_ONE_INPUT's condition targets the `if` ARM's own test port, not the region", () => {
    const cond = BRANCH_ONE_INPUT.edges.find((edge) => edge.id === "e-cond")!;
    expect(cond.target).toBe("if");
    expect(cond.target).not.toBe("br");
  });

  it.each(allScenes)("%s: no cable runs between sibling arms — the shape makes it unrepresentable", (_name, scene) => {
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

  it("BRANCH_MANY_INPUTS puts each condition on ITS OWN arm — the vertical-coincidence ambiguity is gone", () => {
    expect(BRANCH_MANY_INPUTS.nodes.find((node) => node.id === "br")!.data.ports).toBeUndefined();
    const arms = armsOf(BRANCH_MANY_INPUTS, "br");
    expect(arms.map((arm) => arm.id)).toEqual(["arm-1", "arm-2", "arm-3"]);
    expect(arms.map((arm) => arm.data.ports?.left)).toEqual([["input_1"], ["input_2"], ["input_3"]]);
  });
});
