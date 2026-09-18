// src/scene/containment.test.ts — judgeContainment and the empty-container
// lifecycle, tested in the node project (no DOM):
// `pnpm exec vitest --project=unit run`.
//
// Acceptance references are the 2026-09-18 "containment" lane brief,
// numbered #1-#4 (cards 03, 07, 08, 09 respectively).

import { describe, expect, test } from "vitest";

import type { ConnectionMessage } from "./edgeValidation";
import { parkedEnds, type OccurrenceData } from "./linking";
import {
  CONTAINMENT_CYCLE,
  CONTAINMENT_NOT_PERMITTED,
  DEFAULT_CONTAINMENT_POLICY,
  emptyContainers,
  findContainmentCycles,
  judgeContainment,
  pruneEmptyContainers,
  type ContainmentPolicy,
  type ContainmentVerdict,
} from "./containment";
import { findDanglingEdges, type BlockScene, type SceneNode } from "./scene";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type Scene = BlockScene<OccurrenceData>;

function node(id: string, extra: Partial<SceneNode<OccurrenceData>> = {}): SceneNode<OccurrenceData> {
  return { id, position: { x: 0, y: 0 }, data: {}, ...extra };
}

/** frame ▸ box ▸ leaf, plus a loose node — enough nesting to move things
 *  around without every fixture rebuilding it. */
function nested(): Scene {
  return {
    nodes: [node("frame"), node("box", { parentId: "frame" }), node("leaf", { parentId: "box" }), node("loose")],
    edges: [],
  };
}

/* ------------------------------------------------------------------ */
/* Card 03 — the cycle guard, on the write                             */
/* ------------------------------------------------------------------ */

describe("judgeContainment — the cycle guard (card 03)", () => {
  test("a node cannot become its own parent", () => {
    const verdict = judgeContainment(nested(), { childId: "box", parentId: "box" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe(CONTAINMENT_CYCLE);
    expect(verdict.allowed === false && (verdict.refusal.message ?? "").length).toBeGreaterThan(0);
  });

  test("a node cannot be moved into its own descendant", () => {
    // box's descendant is leaf — moving box under leaf would nest box
    // inside a thing box itself contains.
    const verdict = judgeContainment(nested(), { childId: "box", parentId: "leaf" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe(CONTAINMENT_CYCLE);
  });

  test("moving a node UNDER an unrelated node, or to top level, is fine — the guard is specific to actual cycles", () => {
    expect(judgeContainment(nested(), { childId: "leaf", parentId: "loose" }).allowed).toBe(true);
    expect(judgeContainment(nested(), { childId: "leaf", parentId: undefined }).allowed).toBe(true);
  });

  test("a 200-deep parent chain still resolves in bounded time — no recursion, no runaway walk", () => {
    const nodes: SceneNode<OccurrenceData>[] = [node("n0")];
    for (let i = 1; i <= 200; i++) nodes.push(node(`n${i}`, { parentId: `n${i - 1}` }));
    const deep: Scene = { nodes, edges: [] };
    const start = Date.now();
    // n200 is n0's deepest descendant — moving n0 under it is the worst
    // case for a walk that does not terminate early.
    const verdict = judgeContainment(deep, { childId: "n0", parentId: "n200" });
    expect(Date.now() - start).toBeLessThan(500);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe(CONTAINMENT_CYCLE);
  });

  test("MUTATION (report only, not a live gate): deleting the descendant check would wrongly allow this — see the handoff for the actual mutation run", () => {
    // Documented rather than executed against the shipped source: the
    // real mutation (comment out the `descendantsOf(...).has(parentId)`
    // branch, watch this exact assertion flip to `allowed: true`, restore)
    // was run manually per the repo's verify-by-mutation rule and is
    // reported in the handoff, not encoded as a toggle here — a toggle
    // that flips production logic from a test file is worse than the bug
    // it would catch.
    expect(judgeContainment(nested(), { childId: "box", parentId: "leaf" }).allowed).toBe(false);
  });
});

describe("findContainmentCycles — the at-rest twin, for documents already malformed", () => {
  test("no cycle in a well-formed tree", () => {
    expect(findContainmentCycles(nested())).toEqual([]);
  });

  test("a written two-node parentId loop is reported by both members", () => {
    const scene: Scene = {
      nodes: [node("x", { parentId: "y" }), node("y", { parentId: "x" }), node("bystander")],
      edges: [],
    };
    expect(findContainmentCycles(scene)).toEqual([["x", "y"]]);
  });

  test("a direct self-parent is reported as its own singleton component", () => {
    const scene: Scene = { nodes: [node("self", { parentId: "self" })], edges: [] };
    expect(findContainmentCycles(scene)).toEqual([["self"]]);
  });
});

/* ------------------------------------------------------------------ */
/* Card 09 — containment validation, the shape                         */
/* ------------------------------------------------------------------ */

describe("ContainmentVerdict — the SAME discriminant as ConnectionVerdict (card 09)", () => {
  test("refusal IS ConnectionMessage, imported — not a re-declared lookalike", () => {
    const shared: ConnectionMessage = { severity: "error", message: "shared vocabulary", code: "demo" };
    // No cast: a ConnectionMessage value assigns directly into `refusal`
    // because the field's type is a re-export of that same type, not a
    // structurally-similar copy.
    const provesSharedType: ContainmentVerdict = { allowed: false, refusal: shared };
    expect(provesSharedType.allowed).toBe(false);
  });

  test("Zach's own acceptance case: a BT-kind node refused into an async-region parent, via the injected permits callback — never a hardcoded table", () => {
    const scene: Scene = { nodes: [node("bt-1"), node("async-region-1")], edges: [] };
    const kindOf = (id: string) => (id === "bt-1" ? "bt-node" : id === "async-region-1" ? "async-region" : undefined);
    const permits = (childKind: string | undefined, parentKind: string | undefined) =>
      !(childKind === "bt-node" && parentKind === "async-region");

    const verdict = judgeContainment(scene, { childId: "bt-1", parentId: "async-region-1" }, { kindOf, permits });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe(CONTAINMENT_NOT_PERMITTED);
    // The severity comes from the pre-existing DiagnosticSeverity
    // vocabulary ("error" | "warning" | "info") — TypeScript itself
    // refuses a fourth word here, since `ConnectionMessage.severity` is
    // typed against that exact union; this asserts the runtime value
    // agrees.
    expect(verdict.allowed === false && verdict.refusal.severity).toBe("error");

    // A kind `permits` allows sails through unchanged.
    const allowedElsewhere = judgeContainment(scene, { childId: "bt-1", parentId: undefined }, { kindOf, permits });
    expect(allowedElsewhere.allowed).toBe(true);
  });

  // Compile-level, module scope: the silent case is UNREPRESENTABLE, not
  // merely unused — same discipline edgeValidation.test.ts asserts for
  // ConnectionVerdict, and the same type-check-via-Vite mechanism makes a
  // `@ts-expect-error` that stops erroring fail this run.
  // @ts-expect-error — `allowed: false` requires `refusal`.
  const _noRefusal: ContainmentVerdict = { allowed: false };
  void _noRefusal;
  // @ts-expect-error — `allowed: true` requires `effect`.
  const _noEffect: ContainmentVerdict = { allowed: true };
  void _noEffect;
});

/* ------------------------------------------------------------------ */
/* Card 08 — three INDEPENDENT policies                                */
/* ------------------------------------------------------------------ */

describe("ContainmentPolicy — three independent booleans (card 08)", () => {
  test("the default is the permissive stance, documented field by field", () => {
    expect(DEFAULT_CONTAINMENT_POLICY).toEqual({ extendParent: false, constrainChild: false, allowOverlapParent: true });
  });

  test("a move to top level never asks policyOf — there is no parent to have an opinion", () => {
    let asked = false;
    const scene: Scene = { nodes: [node("a")], edges: [] };
    const verdict = judgeContainment(scene, { childId: "a", parentId: undefined }, { policyOf: () => ((asked = true), {}) });
    expect(asked).toBe(false);
    expect(verdict.allowed === true && verdict.effect.policy).toEqual(DEFAULT_CONTAINMENT_POLICY);
  });

  test("all 2×2×2 = 8 combinations resolve to 8 DISTINCT effects — no two flags share one boolean", () => {
    const scene: Scene = { nodes: [node("child"), node("parent")], edges: [] };
    const bools = [false, true];
    const seen = new Set<string>();
    for (const extendParent of bools) {
      for (const constrainChild of bools) {
        for (const allowOverlapParent of bools) {
          const want: ContainmentPolicy = { extendParent, constrainChild, allowOverlapParent };
          const verdict = judgeContainment(scene, { childId: "child", parentId: "parent" }, { policyOf: () => want });
          expect(verdict.allowed).toBe(true);
          expect(verdict.allowed === true && verdict.effect.policy).toEqual(want);
          seen.add(JSON.stringify(want));
        }
      }
    }
    expect(seen.size).toBe(8);
  });

  test("policyOf is merged OVER the default — an omitted field keeps its default rather than becoming undefined", () => {
    const scene: Scene = { nodes: [node("child"), node("parent")], edges: [] };
    const verdict = judgeContainment(scene, { childId: "child", parentId: "parent" }, { policyOf: () => ({ constrainChild: true }) });
    expect(verdict.allowed === true && verdict.effect.policy).toEqual({ ...DEFAULT_CONTAINMENT_POLICY, constrainChild: true });
  });

  test("a caller cannot obtain 'allowed' without also being handed the resolved policy — the field is required by the type", () => {
    const scene: Scene = { nodes: [node("a")], edges: [] };
    const verdict = judgeContainment(scene, { childId: "a" });
    if (verdict.allowed) {
      // `verdict.effect` typechecks with no narrowing beyond `allowed` —
      // if `effect` were optional this line would need `!` or a cast.
      expect(verdict.effect.policy).toBeDefined();
    } else {
      throw new Error("expected allowed");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Card 07 — the empty-container lifecycle, default KEEP                */
/* ------------------------------------------------------------------ */

function container(id: string, extra: Partial<SceneNode<OccurrenceData>> = {}): SceneNode<OccurrenceData> {
  return node(id, { type: "container", ...extra });
}

describe("emptyContainers — the raw query", () => {
  test("with the default isContainer, every node with zero children counts — including leaves, deliberately", () => {
    // This file mints no opinion about what a "container kind" is; the
    // default is maximally inclusive, matching the kit-wide "no
    // vocabulary supplied, no narrowing" convention. It is `emptyContainers`
    // that is unopinionated — `pruneEmptyContainers`' own
    // `removeWhenEmptyOf` default (false, below) is what keeps that
    // inclusiveness from ever deleting anything by itself.
    expect(emptyContainers(nested()).sort()).toEqual(["leaf", "loose"]);
  });

  test("a supplied isContainer narrows which ids are even asked about", () => {
    const scene: Scene = { nodes: [container("box"), node("block"), node("leaf", { parentId: "block" })], edges: [] };
    expect(emptyContainers(scene, (n) => n.type === "container")).toEqual(["box"]);
  });
});

describe("pruneEmptyContainers — default is KEEP (card 07)", () => {
  test("the default returns a scene deep-equal (in fact reference-equal) to its input — nothing is ever removed unasked", () => {
    const scene: Scene = { nodes: [container("box"), node("block")], edges: [] };
    const out = pruneEmptyContainers(scene, {});
    expect(out).toEqual(scene);
    expect(out).toBe(scene); // stronger than deep-equal: no removal ran at all
  });

  test("removeWhenEmptyOf true for exactly ONE kind removes only that kind's emptied containers", () => {
    const scene: Scene = {
      nodes: [container("box"), node("block"), node("leaf", { parentId: "block" })],
      edges: [],
    };
    const out = pruneEmptyContainers(scene, {
      isContainer: (n) => n.type === "container" || (n.type === undefined && n.id !== "leaf"),
      removeWhenEmptyOf: (n) => n.type === "container", // ONLY the container kind
      edgePolicy: "drop",
    });
    // "box" (container, empty) is gone; "block" (not a container kind,
    // also empty on its own) survives untouched.
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["block", "leaf"]);
  });

  test("cascading emptiness is picked up in one call: emptying a child container can empty its own parent", () => {
    const scene: Scene = {
      nodes: [container("outer"), container("inner", { parentId: "outer" })],
      edges: [],
    };
    const out = pruneEmptyContainers(scene, {
      isContainer: (n) => n.type === "container",
      removeWhenEmptyOf: () => true,
      edgePolicy: "drop",
    });
    expect(out.nodes).toEqual([]);
  });

  describe("every DeletedNodeEdgePolicy is passed straight through to linking.ts's deleteNode", () => {
    function wiredScene(): Scene {
      return {
        nodes: [container("box"), node("a"), node("b")],
        edges: [{ id: "e1", source: "a", sourceHandle: "out", target: "box", targetHandle: "in" }],
      };
    }
    const options = { isContainer: (n: SceneNode<OccurrenceData>) => n.type === "container", removeWhenEmptyOf: () => true };

    test('"drop" removes box AND its edge', () => {
      const out = pruneEmptyContainers(wiredScene(), { ...options, edgePolicy: "drop" });
      expect(out.nodes.map((n) => n.id)).toEqual(["a", "b"]);
      expect(out.edges).toEqual([]);
    });

    test('"dangle" removes box but leaves the edge pointing at nothing', () => {
      const out = pruneEmptyContainers(wiredScene(), { ...options, edgePolicy: "dangle" });
      expect(out.edges).toHaveLength(1);
      expect(findDanglingEdges(out).map((d) => d.edgeId)).toEqual(["e1"]);
    });

    test('"park" removes box and stamps the dead end', () => {
      const out = pruneEmptyContainers(wiredScene(), { ...options, edgePolicy: "park" });
      expect(parkedEnds(out.edges[0])).toEqual(["target"]);
    });
  });

  test("the default edgePolicy (\"dangle\") is inert unless removeWhenEmptyOf actually opts a kind in", () => {
    const scene: Scene = {
      nodes: [container("box"), node("a")],
      edges: [{ id: "e1", source: "a", sourceHandle: "out", target: "box", targetHandle: "in" }],
    };
    // No edgePolicy passed, no removeWhenEmptyOf passed — default KEEP,
    // so the default edgePolicy never fires.
    expect(pruneEmptyContainers(scene, { isContainer: (n) => n.type === "container" })).toBe(scene);
  });
});
