// src/scene/focus.test.ts — ported from SystemSketch
// `src/propagation/propagationGraph.test.ts` (the `walkPropagationGraph`
// describe block, full) and `propagationFocus.test.ts`-class coverage
// embedded in `propagationGraph.test.ts`'s "propagation graph admission"
// block (the parts that exercise `normalizePropagationSteps` and the
// step-limit clamping policy, re-expressed over a plain scene instead of an
// `Editor` + tldraw shapes — see focus.ts's header for what did and did not
// travel). Donor read 2026-09-18. See docs/ALGORITHM-PROVENANCE.md.
import { describe, expect, it } from "vitest";

import { focusReachableDepth, focusSnapshot, focusStepLimits, normalizeFocusSteps, walkFocus, type FocusEdgeEnds } from "./focus";

const chain: FocusEdgeEnds[] = [
  { id: "ab", source: "a", target: "b" },
  { id: "bc", source: "b", target: "c" },
  { id: "cd", source: "c", target: "d" },
];

function ids(value: ReadonlySet<string>) {
  return [...value].sort();
}

describe("walkFocus", () => {
  it("keeps upstream and downstream bounds independent", () => {
    const result = walkFocus({
      edges: chain,
      upstreamStarts: ["b"],
      downstreamStarts: ["b"],
      upstreamSteps: 1,
      downstreamSteps: 2,
      initialNodes: ["b"],
    });
    expect(ids(result.nodes)).toEqual(["a", "b", "c", "d"]);
    expect(ids(result.edges)).toEqual(["ab", "bc", "cd"]);
  });

  it("includes every fan-in and fan-out route at the same bound", () => {
    const result = walkFocus({
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "cb", source: "c", target: "b" },
        { id: "bd", source: "b", target: "d" },
        { id: "be", source: "b", target: "e" },
      ],
      upstreamStarts: ["b"],
      downstreamStarts: ["b"],
      upstreamSteps: 1,
      downstreamSteps: 1,
      initialNodes: ["b"],
    });
    expect(ids(result.nodes)).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(result.edges)).toEqual(["ab", "bd", "be", "cb"]);
  });

  it("retains the closing edge but terminates a cycle", () => {
    const result = walkFocus({
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "ca", source: "c", target: "a" },
      ],
      upstreamStarts: ["a"],
      downstreamStarts: ["a"],
      upstreamSteps: 5,
      downstreamSteps: 5,
      initialNodes: ["a"],
    });
    expect(ids(result.nodes)).toEqual(["a", "b", "c"]);
    expect(ids(result.edges)).toEqual(["ab", "bc", "ca"]);
  });

  it("does not traverse when either direction is set to zero", () => {
    const result = walkFocus({
      edges: chain,
      upstreamStarts: ["b"],
      downstreamStarts: ["b"],
      upstreamSteps: 0,
      downstreamSteps: 0,
      initialNodes: ["b"],
    });
    expect(ids(result.nodes)).toEqual(["b"]);
    expect(ids(result.edges)).toEqual([]);
  });

  it("measures each slider cap from the furthest useful graph layer, not a fixed ceiling", () => {
    const longChain: FocusEdgeEnds[] = Array.from({ length: 8 }, (_, index) => ({
      id: `e${index}`,
      source: `n${index}`,
      target: `n${index + 1}`,
    }));
    expect(focusReachableDepth(longChain, ["n4"], "upstream")).toBe(4);
    expect(focusReachableDepth(longChain, ["n4"], "downstream")).toBe(4);
    expect(
      focusReachableDepth(
        [
          { id: "ab", source: "a", target: "b" },
          { id: "bc", source: "b", target: "c" },
          { id: "ca", source: "c", target: "a" },
        ],
        ["a"],
        "downstream",
      ),
    ).toBe(3);
  });

  it("does not offer a selected edge an extra step just to revisit its initial endpoints", () => {
    const edges: FocusEdgeEnds[] = [
      { id: "selected", source: "source", target: "join" },
      { id: "closing", source: "join", target: "source" },
    ];
    expect(focusReachableDepth(edges, ["source"], "upstream", ["source", "join"], ["selected"])).toBe(1);
    const atCap = walkFocus({
      edges,
      upstreamStarts: ["source"],
      downstreamStarts: ["join"],
      upstreamSteps: 1,
      downstreamSteps: 0,
      initialNodes: ["source", "join"],
      initialEdges: ["selected"],
    });
    expect(ids(atCap.edges)).toEqual(["closing", "selected"]);
  });

  it("removes downstream feedback steps already lit by the chosen upstream range", () => {
    const feedback: FocusEdgeEnds[] = [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
      { id: "ca", source: "c", target: "a" },
    ];
    const afterUpstream = walkFocus({
      edges: feedback,
      upstreamStarts: ["a"],
      downstreamStarts: ["a"],
      upstreamSteps: 1,
      downstreamSteps: 0,
      initialNodes: ["a"],
    });
    // c and ca are already bright. Downstream a → b → c has two useful
    // evidence additions, not a third inert click back through ca.
    expect(focusReachableDepth(feedback, ["a"], "downstream", [...afterUpstream.nodes], [...afterUpstream.edges])).toBe(2);
  });
});

describe("normalizeFocusSteps", () => {
  it("normalizes slider state to a finite non-negative integer", () => {
    expect([normalizeFocusSteps(Number("")), normalizeFocusSteps(1.8), normalizeFocusSteps(Number.NaN), normalizeFocusSteps(-4), normalizeFocusSteps(99)]).toEqual([
      0, 1, 0, 0, 99,
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* focusStepLimits / focusSnapshot — the seed-and-scene policy          */
/* ------------------------------------------------------------------ */

function scene(nodeIds: string[], edges: FocusEdgeEnds[]) {
  return { nodes: nodeIds.map((id) => ({ id })), edges };
}

describe("focusStepLimits / focusSnapshot", () => {
  it("keeps zero only for a direction with no reachable neighbour", () => {
    const s = scene(["source", "sink"], [{ id: "edge", source: "source", target: "sink" }]);
    expect(focusStepLimits(s, "source")).toEqual({ upstream: 0, downstream: 1 });
    expect(focusSnapshot(s, "source", 0, 0)).toMatchObject({ upstreamSteps: 0, downstreamSteps: 1 });
  });

  it("caps a selected reverse-cycle edge at useful evidence, including the shared upstream state", () => {
    const s = scene(
      ["source", "join"],
      [
        { id: "selected", source: "source", target: "join" },
        { id: "closing", source: "join", target: "source" },
      ],
    );
    expect(focusStepLimits(s, "selected")).toEqual({ upstream: 1, downstream: 0 });
  });

  it("a seed id naming neither a node nor an edge is the honest empty snapshot", () => {
    const s = scene(["a", "b"], [{ id: "ab", source: "a", target: "b" }]);
    expect(focusStepLimits(s, "ghost")).toEqual({ upstream: 0, downstream: 0 });
    expect(focusSnapshot(s, "ghost", 1, 1)).toMatchObject({ seedId: null, includedNodeIds: new Set(), includedEdgeIds: new Set() });
  });

  it("a null seed is the honest empty snapshot", () => {
    const s = scene(["a"], []);
    expect(focusSnapshot(s, null, 1, 1).seedId).toBeNull();
  });

  it("walks both directions from a node seed at the requested (clamped) depths", () => {
    const s = scene(
      ["n0", "n1", "n2", "n3", "n4", "n5", "n6"],
      Array.from({ length: 6 }, (_, index) => ({ id: `e${index}`, source: `n${index}`, target: `n${index + 1}` })),
    );
    // Seeded at n3: upstream n2,n1 (2 steps), downstream n4 (1 step).
    const snapshot = focusSnapshot(s, "n3", 2, 1);
    expect(snapshot).toMatchObject({ seedId: "n3", upstreamSteps: 2, downstreamSteps: 1 });
    expect(ids(snapshot.includedNodeIds)).toEqual(["n1", "n2", "n3", "n4"]);
    expect(ids(snapshot.includedEdgeIds)).toEqual(["e1", "e2", "e3"]);
    // Requesting past the real range clamps rather than throwing.
    const clamped = focusSnapshot(s, "n3", 99, 99);
    expect(clamped.upstreamSteps).toBe(3);
    expect(clamped.downstreamSteps).toBe(3);
  });

  it("a selected edge seed lights both endpoints and expands past them", () => {
    const s = scene(
      ["a", "b", "c", "d"],
      [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    );
    const snapshot = focusSnapshot(s, "bc", 1, 1);
    expect(ids(snapshot.includedNodeIds)).toEqual(["a", "b", "c", "d"]);
    expect(ids(snapshot.includedEdgeIds)).toEqual(["ab", "bc", "cd"]);
  });
});
