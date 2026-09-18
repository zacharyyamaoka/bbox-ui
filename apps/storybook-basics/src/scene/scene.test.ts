// src/scene/scene.test.ts — the scene kit's pure functions, tested in the
// node project (no DOM, no browser): `pnpm exec vitest --project=unit run`.
// Every function is TOTAL — malformed input earns the honest smaller
// answer, never a throw — so a good half of these tests feed it garbage.
import { describe, expect, test } from "vitest";

import {
  type BlockScene,
  childrenOf,
  consumersOf,
  duplicateEdges,
  duplicateNode,
  findCycles,
  findDanglingEdges,
  linkedCopies,
  linkedCopy,
  portKey,
  producersOf,
  rank,
  topologicalOrder,
  wiredPorts,
} from "./scene";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function node(id: string, extra: Partial<BlockScene["nodes"][number]> = {}) {
  return { id, position: { x: 0, y: 0 }, data: {}, ...extra };
}

/** src ──▶ proc ──▶ sink, plus a config port fan into sink. */
const pipeline: BlockScene = {
  nodes: [node("src"), node("proc"), node("sink")],
  edges: [
    { id: "e1", source: "src", sourceHandle: "out", target: "proc", targetHandle: "in" },
    { id: "e2", source: "proc", sourceHandle: "out", target: "sink", targetHandle: "in" },
    { id: "e3", source: "src", sourceHandle: "out", target: "sink", targetHandle: "cfg" },
  ],
};

const empty: BlockScene = { nodes: [], edges: [] };

/* ------------------------------------------------------------------ */
/* wiredPorts                                                          */
/* ------------------------------------------------------------------ */

describe("wiredPorts", () => {
  test("names both ends of every edge, as node/port keys", () => {
    expect(wiredPorts(pipeline)).toEqual(
      new Set([portKey("src", "out"), portKey("proc", "in"), portKey("proc", "out"), portKey("sink", "in"), portKey("sink", "cfg")]),
    );
  });

  test("duplicate edges are idempotent; handle-less ends contribute nothing", () => {
    const scene = {
      edges: [
        { id: "a", source: "x", sourceHandle: "p", target: "y", targetHandle: "q" },
        { id: "b", source: "x", sourceHandle: "p", target: "y", targetHandle: "q" },
        { id: "c", source: "x", target: "y" }, // node-level edge: no port wired
      ],
    };
    expect(wiredPorts(scene)).toEqual(new Set([portKey("x", "p"), portKey("y", "q")]));
  });

  test("empty scene → empty set", () => {
    expect(wiredPorts(empty)).toEqual(new Set());
  });
});

/* ------------------------------------------------------------------ */
/* producersOf / consumersOf                                           */
/* ------------------------------------------------------------------ */

describe("producersOf / consumersOf", () => {
  test("producers are the edges writing INTO the port", () => {
    expect(producersOf(pipeline, { nodeId: "sink", portId: "in" }).map((e) => e.id)).toEqual(["e2"]);
    expect(producersOf(pipeline, { nodeId: "sink", portId: "cfg" }).map((e) => e.id)).toEqual(["e3"]);
  });

  test("consumers are the edges reading FROM the port — a fan-out is N consumers", () => {
    expect(consumersOf(pipeline, { nodeId: "src", portId: "out" }).map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  test("unknown node or port → empty, never a throw", () => {
    expect(producersOf(pipeline, { nodeId: "ghost", portId: "in" })).toEqual([]);
    expect(consumersOf(pipeline, { nodeId: "src", portId: "no-such-port" })).toEqual([]);
  });

  test("a node-level edge (no handle) belongs to no port", () => {
    const scene = { edges: [{ id: "a", source: "x", target: "y" }] };
    expect(producersOf(scene, { nodeId: "y", portId: "in" })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* topologicalOrder                                                    */
/* ------------------------------------------------------------------ */

describe("topologicalOrder", () => {
  test("every edge's source lands before its target", () => {
    const { order, blocked } = topologicalOrder(pipeline);
    expect(order).toEqual(["src", "proc", "sink"]);
    expect(blocked).toEqual([]);
  });

  test("stable: independent nodes keep scene order", () => {
    const scene = {
      nodes: [node("b"), node("a"), node("c")],
      edges: [{ id: "e", source: "c", target: "a" }],
    };
    // b and c are both ready first; scene order (b before c) survives, and
    // a waits only for its actual dependency.
    expect(topologicalOrder(scene).order).toEqual(["b", "c", "a"]);
  });

  test("a cycle blocks its members AND everything strictly behind it", () => {
    const scene = {
      nodes: [node("free"), node("loop1"), node("loop2"), node("behind")],
      edges: [
        { id: "e1", source: "loop1", target: "loop2" },
        { id: "e2", source: "loop2", target: "loop1" },
        { id: "e3", source: "loop2", target: "behind" },
      ],
    };
    const { order, blocked } = topologicalOrder(scene);
    expect(order).toEqual(["free"]);
    expect(blocked).toEqual(["loop1", "loop2", "behind"]);
  });

  test("a self-loop blocks its node", () => {
    const scene = { nodes: [node("a"), node("b")], edges: [{ id: "e", source: "a", target: "a" }] };
    expect(topologicalOrder(scene)).toEqual({ order: ["b"], blocked: ["a"] });
  });

  test("total on malformed input: edges to unknown nodes are ignored, duplicate node ids collapse to the first", () => {
    const scene = {
      nodes: [node("a"), node("a"), node("b")],
      edges: [
        { id: "e1", source: "ghost", target: "b" },
        { id: "e2", source: "a", target: "nowhere" },
      ],
    };
    expect(topologicalOrder(scene)).toEqual({ order: ["a", "b"], blocked: [] });
  });

  test("empty scene → empty order", () => {
    expect(topologicalOrder(empty)).toEqual({ order: [], blocked: [] });
  });
});

/* ------------------------------------------------------------------ */
/* rank                                                                */
/* ------------------------------------------------------------------ */

describe("rank", () => {
  test("longest path from the sources — the diamond's join ranks past its DEEPEST producer", () => {
    const scene = {
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "a", target: "c" }, // short path a→c must NOT win
        { id: "e4", source: "c", target: "d" },
      ],
    };
    expect(rank(scene)).toEqual(
      new Map([
        ["a", 0],
        ["b", 1],
        ["c", 2],
        ["d", 3],
      ]),
    );
  });

  test("disconnected nodes are their own rank-0 sources", () => {
    const ranks = rank(pipeline);
    expect(ranks.get("src")).toBe(0);
    expect(ranks.get("proc")).toBe(1);
    expect(ranks.get("sink")).toBe(2);
    expect(rank({ nodes: [node("lone")], edges: [] })).toEqual(new Map([["lone", 0]]));
  });

  test("blocked nodes have NO rank — absent, not zero", () => {
    const scene = {
      nodes: [node("free"), node("loop"), node("behind")],
      edges: [
        { id: "e1", source: "loop", target: "loop" },
        { id: "e2", source: "loop", target: "behind" },
      ],
    };
    const ranks = rank(scene);
    expect(ranks.get("free")).toBe(0);
    expect(ranks.has("loop")).toBe(false);
    expect(ranks.has("behind")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* findCycles                                                          */
/* ------------------------------------------------------------------ */

describe("findCycles", () => {
  test("an acyclic scene has none", () => {
    expect(findCycles(pipeline)).toEqual([]);
    expect(findCycles(empty)).toEqual([]);
  });

  test("a two-node loop is one knot", () => {
    const scene = {
      nodes: [node("a"), node("b")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    };
    expect(findCycles(scene)).toEqual([["a", "b"]]);
  });

  test("a self-loop counts; a lone node does not", () => {
    const scene = {
      nodes: [node("a"), node("b")],
      edges: [{ id: "e", source: "a", target: "a" }],
    };
    expect(findCycles(scene)).toEqual([["a"]]);
  });

  test("interleaved loops through shared nodes report as ONE knot, not two arbitrary paths", () => {
    // a→b→a and b→c→b share b: one SCC {a,b,c}.
    const scene = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
        { id: "e3", source: "b", target: "c" },
        { id: "e4", source: "c", target: "b" },
      ],
    };
    expect(findCycles(scene)).toEqual([["a", "b", "c"]]);
  });

  test("two independent knots report separately, in scene order, members in scene order", () => {
    const scene = {
      nodes: [node("n1"), node("n2"), node("n3"), node("n4"), node("n5")],
      edges: [
        { id: "e1", source: "n4", target: "n2" },
        { id: "e2", source: "n2", target: "n4" },
        { id: "e3", source: "n5", target: "n3" },
        { id: "e4", source: "n3", target: "n5" },
      ],
    };
    expect(findCycles(scene)).toEqual([
      ["n2", "n4"],
      ["n3", "n5"],
    ]);
  });

  test("a knot that points into an ALREADY-FINISHED knot still reports itself", () => {
    // Found by mutation testing: dropping Tarjan's on-stack check only
    // misbehaves when a live component folds in the index of a FINISHED
    // one — the second knot's lowlink then never equals its root's index
    // and the whole component silently vanishes from the report. No other
    // test in this file has a cross-component edge into finished work.
    const scene = {
      nodes: [node("x"), node("y"), node("w"), node("z")],
      edges: [
        { id: "e1", source: "x", target: "y" },
        { id: "e2", source: "y", target: "x" },
        { id: "e3", source: "w", target: "z" },
        { id: "e4", source: "z", target: "w" },
        { id: "e5", source: "z", target: "x" }, // the cross-edge
      ],
    };
    expect(findCycles(scene)).toEqual([
      ["x", "y"],
      ["w", "z"],
    ]);
  });

  test("an upstream acyclic tail is not dragged into the knot", () => {
    const scene = {
      nodes: [node("tail"), node("a"), node("b")],
      edges: [
        { id: "e1", source: "tail", target: "a" },
        { id: "e2", source: "a", target: "b" },
        { id: "e3", source: "b", target: "a" },
      ],
    };
    expect(findCycles(scene)).toEqual([["a", "b"]]);
  });

  test("total on malformed input: edges naming unknown nodes are ignored", () => {
    const scene = {
      nodes: [node("a")],
      edges: [
        { id: "e1", source: "a", target: "ghost" },
        { id: "e2", source: "ghost", target: "a" },
      ],
    };
    expect(findCycles(scene)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* duplicateEdges                                                      */
/* ------------------------------------------------------------------ */

describe("duplicateEdges", () => {
  test("unique pairs → no groups", () => {
    expect(duplicateEdges(pipeline)).toEqual([]);
  });

  test("N edges on one pair group together; direction does not split the pair", () => {
    const forward = { id: "f", source: "a", sourceHandle: "x", target: "b", targetHandle: "y" };
    const again = { id: "g", source: "a", sourceHandle: "x", target: "b", targetHandle: "y" };
    const reversed = { id: "r", source: "b", sourceHandle: "y", target: "a", targetHandle: "x" };
    const other = { id: "o", source: "a", sourceHandle: "x", target: "b", targetHandle: "z" };
    expect(duplicateEdges({ edges: [forward, again, reversed, other] })).toEqual([[forward, again, reversed]]);
  });

  test("same nodes, different ports are different pairs", () => {
    const e1 = { id: "e1", source: "a", sourceHandle: "p1", target: "b", targetHandle: "q" };
    const e2 = { id: "e2", source: "a", sourceHandle: "p2", target: "b", targetHandle: "q" };
    expect(duplicateEdges({ edges: [e1, e2] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Identity: duplicateNode / linkedCopy / linkedCopies                 */
/* ------------------------------------------------------------------ */

describe("identity under duplication", () => {
  // Group-id semantics: `definitionId` is an id every occurrence SHARES —
  // minted like a node id, never equal to one, no privileged root node.
  const scene: BlockScene = {
    nodes: [
      node("amp1", { data: { name: "Amp" }, definitionId: "g-amp" }),
      node("amp2", { data: { name: "Amp" }, definitionId: "g-amp" }),
      node("member", { parentId: "amp1" }),
      node("solo", { data: { name: "Solo" } }),
    ],
    edges: [{ id: "e", source: "amp1", sourceHandle: "out", target: "amp2", targetHandle: "in" }],
  };

  test("duplicateNode mints a fresh id via the CALLER and copies everything else verbatim", () => {
    const out = duplicateNode(scene, "amp1", () => "minted-1");
    expect(out.nodes.map((n) => n.id)).toEqual(["amp1", "amp2", "member", "solo", "minted-1"]);
    const copy = out.nodes[4];
    expect(copy.data).toEqual({ name: "Amp" }); // the NAME copies — names may collide, ids may not
    expect(copy.definitionId).toBe("g-amp"); // duplicating an occurrence yields another occurrence
    expect(copy.position).toEqual(scene.nodes[0].position);
  });

  test("duplicating an ungrouped node adds no link — the copy carries the same absent id", () => {
    const out = duplicateNode(scene, "solo", () => "minted-2");
    expect(out.nodes[4].definitionId).toBeUndefined();
  });

  test("edges and children never multiply with the node", () => {
    const out = duplicateNode(scene, "amp1", () => "minted-3");
    expect(out.edges).toBe(scene.edges); // untouched, by reference
    expect(childrenOf(out, "minted-3")).toEqual([]); // the member stayed with the original
    expect(childrenOf(out, "amp1").map((n) => n.id)).toEqual(["member"]);
  });

  test("linkedCopy of an occurrence shares its group id and touches nobody else", () => {
    const out = linkedCopy(scene, "amp1", () => "lc-1");
    expect(out.nodes[4].definitionId).toBe("g-amp");
    expect(out.nodes[0]).toBe(scene.nodes[0]); // the source is already a member — untouched
  });

  test("linkedCopy of an ungrouped node mints ONE group id and stamps BOTH members", () => {
    const minted: string[] = [];
    const out = linkedCopy(scene, "solo", () => {
      const id = `mint-${minted.length + 1}`;
      minted.push(id);
      return id;
    });
    expect(minted).toEqual(["mint-1", "mint-2"]); // copy id first, then the group id
    const solo = out.nodes.find((n) => n.id === "solo")!;
    const copy = out.nodes.find((n) => n.id === "mint-1")!;
    expect(solo.definitionId).toBe("mint-2");
    expect(copy.definitionId).toBe("mint-2");
  });

  test("linkedCopies lists every occurrence — the original among them, none privileged", () => {
    const out = linkedCopy(scene, "amp1", () => "lc-1");
    expect(linkedCopies(out, "g-amp").map((n) => n.id)).toEqual(["amp1", "amp2", "lc-1"]);
    expect(linkedCopies(out, "amp1")).toEqual([]); // a node id is never a group id
  });

  test("total: an unknown id returns the SAME scene object — the reconcilePortLane no-op contract", () => {
    expect(duplicateNode(scene, "ghost", () => "never")).toBe(scene);
    expect(linkedCopy(scene, "ghost", () => "never")).toBe(scene);
  });

  test("purity: the input scene's arrays are never mutated", () => {
    const before = [...scene.nodes];
    duplicateNode(scene, "amp1", () => "minted");
    linkedCopy(scene, "solo", () => "minted");
    expect(scene.nodes).toEqual(before);
    expect(scene.nodes[3].definitionId).toBeUndefined(); // linkedCopy stamped a COPY of solo, not solo itself
  });
});

/* ------------------------------------------------------------------ */
/* findDanglingEdges                                                   */
/* ------------------------------------------------------------------ */

describe("findDanglingEdges", () => {
  const ports = new Map<string, string[]>([
    ["a", ["out"]],
    ["b", ["in", "cfg"]],
  ]);
  const portsOf = (nodeId: string) => ports.get(nodeId);

  test("a healthy scene yields the honest empty report", () => {
    const scene = {
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }],
    };
    expect(findDanglingEdges(scene, portsOf)).toEqual([]);
    expect(findDanglingEdges(scene)).toEqual([]); // no vocabulary given — node check alone still passes
  });

  test("a missing node is reported per end, by edge id, in scene order", () => {
    const scene = {
      nodes: [node("a")],
      edges: [
        { id: "e1", source: "a", sourceHandle: "out", target: "gone", targetHandle: "in" },
        { id: "e2", source: "ghost", target: "also-gone" },
      ],
    };
    expect(findDanglingEdges(scene)).toEqual([
      { edgeId: "e1", end: "target", nodeId: "gone", portId: "in", reason: "missing-node" },
      { edgeId: "e2", end: "source", nodeId: "ghost", reason: "missing-node" },
      { edgeId: "e2", end: "target", nodeId: "also-gone", reason: "missing-node" },
    ]);
  });

  test("a dead PORT on a live node is caught — the case a node-only check misses", () => {
    const scene = {
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "removed" }],
    };
    expect(findDanglingEdges(scene, portsOf)).toEqual([
      { edgeId: "e1", end: "target", nodeId: "b", portId: "removed", reason: "missing-port" },
    ]);
    // Without the vocabulary the same scene looks healthy — which is why
    // `portsOf` exists.
    expect(findDanglingEdges(scene)).toEqual([]);
  });

  test("an unknown vocabulary suspends port judgement for that node only", () => {
    const scene = {
      nodes: [node("a"), node("mystery")],
      edges: [
        { id: "e1", source: "a", sourceHandle: "bogus", target: "mystery", targetHandle: "whatever" },
      ],
    };
    expect(findDanglingEdges(scene, portsOf)).toEqual([
      { edgeId: "e1", end: "source", nodeId: "a", portId: "bogus", reason: "missing-port" },
      // `mystery` has no stated vocabulary — no judgement, not a defect
    ]);
  });

  test("a handle-less end wires the NODE, so it can only dangle by missing-node", () => {
    const scene = { nodes: [node("a"), node("b")], edges: [{ id: "e1", source: "a", target: "b" }] };
    expect(findDanglingEdges(scene, () => [])).toEqual([]); // empty vocabularies, yet nothing to judge
  });

  test("total: empty and malformed scenes report, never throw", () => {
    expect(findDanglingEdges({ nodes: [], edges: [] })).toEqual([]);
    expect(
      findDanglingEdges({ nodes: [], edges: [{ id: "e", source: "x", target: "y" }] }).map((d) => d.edgeId),
    ).toEqual(["e", "e"]);
  });
});

/* ------------------------------------------------------------------ */
/* childrenOf                                                          */
/* ------------------------------------------------------------------ */

describe("childrenOf", () => {
  test("reads parentId, in scene order; top-level nodes belong to no one", () => {
    const scene = {
      nodes: [node("p"), node("k2", { parentId: "p" }), node("top"), node("k1", { parentId: "p" })],
    };
    expect(childrenOf(scene, "p").map((n) => n.id)).toEqual(["k2", "k1"]);
    expect(childrenOf(scene, "top")).toEqual([]);
    expect(childrenOf(scene, "ghost")).toEqual([]);
  });
});
