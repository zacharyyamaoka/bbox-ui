// src/scene/batchWire.test.ts — the batch-wiring rules, asserted as pure
// functions.
//
// Structure ported from the donor's own suite, SystemSketch
// `.claude/worktrees/vision-consolidated/src/blocks/connections/
// batchWiring.test.ts` (474 lines, opened): its `describe` blocks for
// `resolvePair`, `describeBatchWireOutcome`, `dominantBatchRefusal`,
// `getWireIntoSources`, `wireIntoTargetKeys`-with-`candidateHosts` and
// `wireTogetherTarget` each have a counterpart below. The donor's cases
// are tldraw-`Editor` driven; these run on plain records, so the
// ASSERTIONS are ported and the setup is not.
import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS,
  applyBatchWire,
  batchWireEdges,
  batchWireSources,
  batchWireTargets,
  canArmBatchWire,
  describeBatchWireOutcome,
  dominantRefusal,
  planBatchWire,
  resolveWirePair,
  sharedParentId,
  tallyRefusals,
  type BatchWirePair,
  type PortsOf,
  type WireJudge,
} from "./batchWire";
import { hostPortsOf, standInJudge } from "./batchWire.standIn";
import { portKey, producersOf, type BlockScene } from "./scene";
import type { HostScene } from "../hosts/hostScene";

/* ------------------------------------------------------------------ */
/* Tiny hand-built judges — the point is that the judge is INJECTED,   */
/* so most cases state a verdict table instead of running real rules.  */
/* ------------------------------------------------------------------ */

const vocabulary = (table: Record<string, readonly string[]>): PortsOf => (nodeId) => table[nodeId];

/** Allow exactly the listed `"node/port → node/port"` pairs; refuse the rest. */
function allowOnly(allowed: readonly string[], reason = "same-polarity"): WireJudge {
  const set = new Set(allowed);
  return ({ source, target }) =>
    set.has(`${portKey(source.nodeId, source.portId)} → ${portKey(target.nodeId, target.portId)}`)
      ? { ok: true }
      : { ok: false, reason };
}

const ALLOW_ALL: WireJudge = () => ({ ok: true });

describe("resolveWirePair", () => {
  const portsOf = vocabulary({ a: ["out"], hub: ["in"] });

  it("resolves a single legal port with no name required", () => {
    const choice = resolveWirePair({
      sourceNodeId: "a",
      targets: [{ nodeId: "hub", portId: "in" }],
      portsOf,
      judge: ALLOW_ALL,
    });
    expect(choice).toEqual({
      ok: true,
      matchedByName: false,
      pair: { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } },
    });
  });

  it("picks the port whose NAME matches among several legal ones — the standard-vocabulary tiebreak", () => {
    // Nine legal ports, one of which is called `logs` like the landing.
    // Donor :127-147: "first that fits" would quietly wire `config`.
    const many = vocabulary({
      src: ["config", "logs", "metrics", "trace", "debug", "audit", "state", "clock", "seed"],
      sink: ["logs"],
    });
    const choice = resolveWirePair({
      sourceNodeId: "src",
      targets: [{ nodeId: "sink", portId: "logs" }],
      portsOf: many,
      judge: ALLOW_ALL,
    });
    expect(choice).toEqual({
      ok: true,
      matchedByName: true,
      pair: { source: { nodeId: "src", portId: "logs" }, target: { nodeId: "sink", portId: "logs" } },
    });
  });

  it("refuses as ambiguous when several ports are legal and none matches by name", () => {
    const choice = resolveWirePair({
      sourceNodeId: "src",
      targets: [{ nodeId: "sink", portId: "in" }],
      portsOf: vocabulary({ src: ["a", "b"], sink: ["in"] }),
      judge: ALLOW_ALL,
    });
    expect(choice).toEqual({ ok: false, reason: AMBIGUOUS });
  });

  it("refuses as ambiguous when two DIFFERENT names both match — two channels, not one cable", () => {
    // Both source ports match a target port by name, against two landings.
    const choice = resolveWirePair({
      sourceNodeId: "src",
      targets: [
        { nodeId: "sink", portId: "logs" },
        { nodeId: "sink", portId: "config" },
      ],
      portsOf: vocabulary({ src: ["logs", "config"], sink: ["logs", "config"] }),
      judge: ALLOW_ALL,
    });
    expect(choice).toEqual({ ok: false, reason: AMBIGUOUS });
  });

  it("reports the judge's own reason when nothing is legal, most specific first when ports disagree", () => {
    const judge: WireJudge = ({ source }) =>
      source.portId === "x" ? { ok: false, reason: "duplicate" } : { ok: false, reason: "same-polarity" };
    const choice = resolveWirePair({
      sourceNodeId: "src",
      targets: [{ nodeId: "sink", portId: "in" }],
      portsOf: vocabulary({ src: ["x", "y", "z"], sink: ["in"] }),
      judge,
    });
    // `duplicate` outranks `same-polarity` in DEFAULT_REFUSAL_PRECEDENCE.
    expect(choice).toEqual({ ok: false, reason: "duplicate" });
  });

  it("refuses missing-port for a landing its own node does not speak", () => {
    const choice = resolveWirePair({
      sourceNodeId: "a",
      targets: [{ nodeId: "hub", portId: "nope" }],
      portsOf,
      judge: ALLOW_ALL,
    });
    expect(choice).toEqual({ ok: false, reason: "missing-port" });
  });

  it("honours a caller's own precedence over the donor default", () => {
    const judge: WireJudge = ({ source }) =>
      source.portId === "x" ? { ok: false, reason: "duplicate" } : { ok: false, reason: "same-polarity" };
    const choice = resolveWirePair({
      sourceNodeId: "src",
      targets: [{ nodeId: "sink", portId: "in" }],
      portsOf: vocabulary({ src: ["x", "y"], sink: ["in"] }),
      judge,
      precedence: ["same-polarity", "duplicate"],
    });
    expect(choice).toEqual({ ok: false, reason: "same-polarity" });
  });
});

describe("dominantRefusal", () => {
  it("walks the whole precedence chain, and defaults to missing-port on an empty list", () => {
    expect(dominantRefusal([])).toBe("missing-port");
    expect(dominantRefusal(["cycle", "duplicate", "same-polarity"])).toBe("duplicate");
    expect(dominantRefusal(["hidden-port", "cycle"])).toBe("cycle");
    expect(dominantRefusal(["same-polarity", AMBIGUOUS])).toBe(AMBIGUOUS);
    // An unranked reason still reports itself rather than vanishing.
    expect(dominantRefusal(["never-heard-of-it"])).toBe("never-heard-of-it");
  });
});

describe("describeBatchWireOutcome", () => {
  it("describes all four shapes an outcome can take", () => {
    expect(describeBatchWireOutcome({ created: 0, sources: 2, refused: [] })).toBe("Wired nothing");
    expect(describeBatchWireOutcome({ created: 0, sources: 2, refused: [{ reason: "cycle", count: 2 }] })).toBe(
      "Wired nothing — would loop",
    );
    expect(describeBatchWireOutcome({ created: 1, sources: 1, refused: [] })).toBe("Wired 1 cable");
    expect(
      describeBatchWireOutcome({
        created: 4,
        sources: 7,
        refused: [
          { reason: "duplicate", count: 2 },
          { reason: AMBIGUOUS, count: 1 },
        ],
      }),
    ).toBe("Wired 4 cables · skipped 2 already wired, 1 no single obvious port");
  });

  it("names the hub only when the gesture chose one", () => {
    expect(describeBatchWireOutcome({ created: 3, sources: 3, refused: [], hubLabel: "sink" })).toBe("Wired 3 cables into sink");
    expect(describeBatchWireOutcome({ created: 0, sources: 3, refused: [], hubLabel: "sink" })).toBe("Wired nothing into sink");
  });
});

describe("tallyRefusals", () => {
  it("counts by reason, most common first, ties alphabetical", () => {
    expect(tallyRefusals(["cycle", "duplicate", "cycle", "ambiguous", "duplicate", "cycle"])).toEqual([
      { reason: "cycle", count: 3 },
      { reason: "duplicate", count: 2 },
      { reason: "ambiguous", count: 1 },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Reading a selection — donor `getWireIntoSources`, :350-366          */
/* ------------------------------------------------------------------ */

const NESTED: BlockScene = {
  nodes: [
    { id: "proc", position: { x: 0, y: 0 }, data: {} },
    { id: "kidA", parentId: "proc", position: { x: 0, y: 0 }, data: {} },
    { id: "kidB", parentId: "proc", position: { x: 0, y: 0 }, data: {} },
    { id: "kidC", parentId: "proc", position: { x: 0, y: 0 }, data: {} },
    { id: "lonely", position: { x: 0, y: 0 }, data: {} },
    { id: "onlyChild", parentId: "lonely", position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [],
};

describe("batchWireSources", () => {
  it("reads two or more selected nodes as a literal list", () => {
    expect(batchWireSources(NESTED, ["kidA", "kidB"])).toEqual({
      kind: "list",
      sources: ["kidA", "kidB"],
      containerId: "proc",
    });
  });

  it("reads ONE selected container as its direct members — the scope shorthand", () => {
    expect(batchWireSources(NESTED, ["proc"])).toEqual({
      kind: "container",
      sources: ["kidA", "kidB", "kidC"],
      containerId: "proc",
    });
  });

  it("refuses a container with fewer than two members", () => {
    expect(batchWireSources(NESTED, ["lonely"])).toBeNull();
  });

  it("refuses a single non-container selection", () => {
    expect(batchWireSources(NESTED, ["kidA"])).toBeNull();
  });

  it("drops ids the scene does not know, and refuses when too few survive", () => {
    expect(batchWireSources(NESTED, ["kidA", "ghost"])).toBeNull();
  });

  it("reports no shared parent when the selection straddles scopes", () => {
    expect(batchWireSources(NESTED, ["kidA", "lonely"])).toEqual({
      kind: "list",
      sources: ["kidA", "lonely"],
      containerId: null,
    });
  });
});

describe("sharedParentId", () => {
  it("is null for an empty list, the parent when shared, null when split", () => {
    expect(sharedParentId(NESTED, [])).toBeNull();
    expect(sharedParentId(NESTED, ["kidA", "kidB"])).toBe("proc");
    expect(sharedParentId(NESTED, ["proc", "lonely"])).toBeNull(); // both top-level → shared `undefined`
    expect(sharedParentId(NESTED, ["kidA", "proc"])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Availability — THE "smart detection". Donor :398-416                */
/* ------------------------------------------------------------------ */

describe("batchWireTargets", () => {
  const portsOf = vocabulary({ a: ["out"], b: ["out"], c: ["out"], hub: ["in"], outsider: ["in"] });
  const group = ["a", "b", "c", "hub"];
  const board = [...group, "outsider"];
  // Every group member may reach hub/in, and a/out may also reach an
  // `outsider` sitting outside the selection entirely.
  const judge = allowOnly([
    "a/out → hub/in",
    "b/out → hub/in",
    "c/out → hub/in",
    "a/out → outsider/in",
    "b/out → outsider/in",
  ]);

  it('"into" rings every board dot a source could reach, INCLUDING outside the selection', () => {
    const keys = batchWireTargets({ sources: group, intent: "into", candidateNodeIds: board, portsOf, judge });
    expect([...keys].sort()).toEqual(["hub/in", "outsider/in"]);
  });

  it('"together" rings only the armed group\'s OWN ports, even when a legal target sits outside it', () => {
    // Donor :399 verbatim. This is the one line separating the two commands.
    const keys = batchWireTargets({ sources: group, intent: "together", candidateNodeIds: board, portsOf, judge });
    expect([...keys]).toEqual(["hub/in"]);
    expect(keys.has("outsider/in")).toBe(false);
  });

  it("never rings a dot that would produce ZERO cables, even when a port there is legal", () => {
    // `solo` can legally take a cable, but only from itself — and
    // planBatchWire skips a source equal to the target's own node.
    const keys = batchWireTargets({
      sources: ["solo"],
      intent: "into",
      candidateNodeIds: ["solo"],
      portsOf: vocabulary({ solo: ["in", "out"] }),
      judge: ALLOW_ALL,
    });
    expect(keys.size).toBe(0);
  });

  it("never rings a dot every source resolves AMBIGUOUSLY against — legal, but wires nothing", () => {
    // Two legal source ports and no name match ⇒ `ambiguous` ⇒ no pairs ⇒
    // no ring. Judging per PORT instead of per SOURCE would ring it.
    const ambiguousOnly = batchWireTargets({
      sources: ["twin"],
      intent: "into",
      candidateNodeIds: ["sink"],
      portsOf: vocabulary({ twin: ["p", "q"], sink: ["in"] }),
      judge: ALLOW_ALL,
    });
    expect(ambiguousOnly.size).toBe(0);
    // Same shape, but now one source port matches the landing by NAME, so
    // the ambiguity resolves and the dot DOES ring. Same judge, same
    // vocabulary size — only the names differ.
    const named = batchWireTargets({
      sources: ["twin"],
      intent: "into",
      candidateNodeIds: ["sink"],
      portsOf: vocabulary({ twin: ["in", "q"], sink: ["in"] }),
      judge: ALLOW_ALL,
    });
    expect([...named]).toEqual(["sink/in"]);
  });

  it("canArmBatchWire refuses to arm a gesture whose ring would be empty", () => {
    const input = {
      sources: ["a", "b"],
      intent: "into" as const,
      candidateNodeIds: ["a", "b"],
      portsOf: vocabulary({ a: ["out"], b: ["out"] }),
      judge: allowOnly([]),
    };
    expect(canArmBatchWire(input)).toBe(false);
    expect(canArmBatchWire({ ...input, judge: allowOnly(["a/out → b/out"]) })).toBe(true);
  });
});

describe("planBatchWire", () => {
  it("skips a source that IS the target's own node rather than refusing it", () => {
    // Donor :427-429: four cables and a no-op, not four cables and a complaint.
    const plan = planBatchWire({
      sources: ["a", "b", "hub"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: vocabulary({ a: ["out"], b: ["out"], hub: ["in"] }),
      judge: ALLOW_ALL,
    });
    expect(plan.pairs).toHaveLength(2);
    expect(plan.refusals).toEqual([]);
    expect(plan.pairs.map((pair) => pair.source.nodeId)).toEqual(["a", "b"]);
  });
});

/* ------------------------------------------------------------------ */
/* The commit — donor `wireTogetherTarget` :449-465, `createBatch` :281 */
/* ------------------------------------------------------------------ */

const FAN: BlockScene = {
  nodes: ["a", "b", "c", "hub"].map((id) => ({ id, position: { x: 0, y: 0 }, data: {} })),
  edges: [],
};

const FAN_PORTS = vocabulary({ a: ["out"], b: ["out"], c: ["out"], hub: ["in"] });

describe("applyBatchWire", () => {
  it("elects the clicked node the hub, wires the REST of the group into it (fan-in), and names it", () => {
    const { scene, outcome } = applyBatchWire(FAN, {
      sources: ["a", "b", "c", "hub"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: FAN_PORTS,
      judgeFor: () => ALLOW_ALL,
      mintEdgeId: (_pair, index) => `e${index}`,
      hubLabel: "hub",
    });
    expect(outcome.created).toBe(3);
    expect(describeBatchWireOutcome(outcome)).toBe("Wired 3 cables into hub");
    expect(scene.edges).toEqual([
      { id: "e0", source: "a", sourceHandle: "out", target: "hub", targetHandle: "in" },
      { id: "e1", source: "b", sourceHandle: "out", target: "hub", targetHandle: "in" },
      { id: "e2", source: "c", sourceHandle: "out", target: "hub", targetHandle: "in" },
    ]);
    // Non-mutating: the input scene is untouched.
    expect(FAN.edges).toEqual([]);
  });

  it("judges each cable against the ones this batch already committed — NOT against a frozen board", () => {
    // REGRESSION. This shipped broken once: `applyBatchWire` re-judged
    // every pair against the same unchanged scene, so three sources wired
    // into ONE single-feed input produced three cables and reported no
    // refusals. The donor never had the bug because its judge reads a live
    // `Editor` being mutated inside `editor.run()`; a pure function has to
    // rebuild the scene between pairs. See `SceneJudge`.
    // A HOST-shaped fixture, because the rule under test is the stand-in
    // judge's `singleFeed` and that reads real host port data.
    const fan: HostScene = {
      nodes: [
        { id: "a", type: "block", position: { x: 0, y: 0 }, data: { name: "a", ports: { right: ["out"] } } },
        { id: "b", type: "block", position: { x: 0, y: 0 }, data: { name: "b", ports: { right: ["out"] } } },
        { id: "c", type: "block", position: { x: 0, y: 0 }, data: { name: "c", ports: { right: ["out"] } } },
        { id: "hub", type: "block", position: { x: 0, y: 0 }, data: { name: "hub", ports: { left: ["in"] } } },
      ],
      edges: [],
    };
    const shared = {
      sources: ["a", "b", "c"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: hostPortsOf(fan),
      mintEdgeId: (_pair: BatchWirePair, index: number) => `e${index}`,
      hubLabel: "hub",
    };
    const { scene, outcome } = applyBatchWire(fan, { ...shared, judgeFor: (working) => standInJudge(working, { singleFeed: true }) });
    expect(outcome.created).toBe(1);
    expect(outcome.refused).toEqual([{ reason: "input-occupied", count: 2 }]);
    expect(describeBatchWireOutcome(outcome)).toBe("Wired 1 cable into hub · skipped 2 input already fed");
    expect(scene.edges).toHaveLength(1);

    // The mutation proof: a judge PINNED to the starting board — which is
    // exactly what the broken version did — wires all three. Without this
    // half, the assertion above could pass for the wrong reason.
    const frozen = applyBatchWire(fan, { ...shared, judgeFor: () => standInJudge(fan, { singleFeed: true }) });
    expect(frozen.outcome.created).toBe(3);
    expect(frozen.outcome.refused).toEqual([]);
  });

  it("returns the SAME scene object when nothing was created — the kit's no-op contract", () => {
    const { scene, outcome } = applyBatchWire(FAN, {
      sources: ["a", "b"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: FAN_PORTS,
      judgeFor: () => allowOnly([]),
      mintEdgeId: () => "never",
    });
    expect(scene).toBe(FAN);
    expect(outcome.created).toBe(0);
    expect(outcome.refused).toEqual([{ reason: "same-polarity", count: 2 }]);
  });

  it("appends to existing edges rather than replacing them", () => {
    const seeded: BlockScene = { ...FAN, edges: [{ id: "old", source: "a", sourceHandle: "out", target: "c", targetHandle: "in" }] };
    const { scene } = applyBatchWire(seeded, {
      sources: ["b"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: FAN_PORTS,
      judgeFor: () => ALLOW_ALL,
      mintEdgeId: () => "new",
    });
    expect(scene.edges.map((edge) => edge.id)).toEqual(["old", "new"]);
  });

  it("leaves a SILENT refusal out of the reported tally while still refusing the cable", () => {
    const { outcome } = applyBatchWire(FAN, {
      sources: ["a", "b"],
      target: { nodeId: "hub", portId: "in" },
      portsOf: FAN_PORTS,
      judgeFor: () => ({ source }) =>
        source.nodeId === "a" ? { ok: true } : { ok: false, reason: "duplicate", silent: true },
      mintEdgeId: () => "e0",
    });
    expect(outcome.created).toBe(1);
    // `b` got no cable, and said nothing about it.
    expect(outcome.refused).toEqual([{ reason: "duplicate", count: 1 }]);
  });
});

describe("batchWireEdges", () => {
  it("re-judges the plan, and reports a pair that lost a race with the board", () => {
    // Donor :276-280 — planning and creating are separated by a click.
    const pairs: BatchWirePair[] = [
      { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } },
      { source: { nodeId: "b", portId: "out" }, target: { nodeId: "hub", portId: "in" } },
    ];
    const { edges, lateRefusals } = batchWireEdges({
      plan: { pairs, refusals: [] },
      judgeAt: () => ({ source }) => (source.nodeId === "b" ? { ok: false, reason: "input-occupied" } : { ok: true }),
      mintEdgeId: (pair) => `e-${pair.source.nodeId}`,
    });
    expect(edges.map((edge) => edge.id)).toEqual(["e-a"]);
    expect(lateRefusals).toEqual(["input-occupied"]);
  });

  it("writes the edge in the judge's DATAFLOW order, not the gesture's order", () => {
    // REGRESSION. A gesture names its ends in the order they were touched.
    // Here the batch's "source" is a SINK (`fuse/logs`, a left-wall input)
    // and the landing is a SOURCE (`probe/logs`, a right-wall output) —
    // a legal pair that resolves by name, and one whose edge must run
    // probe → fuse, not fuse → probe. Shipped backwards once: the donor
    // fixes it with `normalizeConnectionDirection` (donor :330), which
    // reads like binding plumbing and is actually this rule.
    const backwards: HostScene = {
      nodes: [
        { id: "fuse", type: "block", position: { x: 0, y: 0 }, data: { name: "fuse", ports: { left: ["logs"] } } },
        { id: "probe", type: "block", position: { x: 0, y: 0 }, data: { name: "probe", ports: { right: ["logs"] } } },
      ],
      edges: [],
    };
    const { scene } = applyBatchWire(backwards, {
      sources: ["fuse"],
      target: { nodeId: "probe", portId: "logs" },
      portsOf: hostPortsOf(backwards),
      judgeFor: (working) => standInJudge(working),
      mintEdgeId: () => "e",
    });
    expect(scene.edges).toEqual([
      // Dataflow order: the OUTPUT is the edge's source.
      { id: "e", source: "probe", sourceHandle: "logs", target: "fuse", targetHandle: "logs" },
    ]);
    // And the derived reads agree, which is the reason the order matters.
    expect(producersOf(scene, { nodeId: "fuse", portId: "logs" })).toHaveLength(1);
    expect(producersOf(scene, { nodeId: "probe", portId: "logs" })).toHaveLength(0);
  });

  it("leaves the pair alone when the judge states no orientation", () => {
    const pair: BatchWirePair = { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } };
    const { edges } = batchWireEdges({ plan: { pairs: [pair], refusals: [] }, judgeAt: () => ALLOW_ALL, mintEdgeId: () => "e" });
    expect(edges[0]).toMatchObject({ source: "a", sourceHandle: "out", target: "hub", targetHandle: "in" });
  });

  it("attaches per-edge data only when the host supplies it", () => {
    const pair: BatchWirePair = { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } };
    const plain = batchWireEdges({ plan: { pairs: [pair], refusals: [] }, judgeAt: () => ALLOW_ALL, mintEdgeId: () => "e" });
    expect("data" in plain.edges[0]).toBe(false);
    const styled = batchWireEdges({
      plan: { pairs: [pair], refusals: [] },
      judgeAt: () => ALLOW_ALL,
      mintEdgeId: () => "e",
      edgeData: () => ({ variant: "async" }),
    });
    expect(styled.edges[0].data).toEqual({ variant: "async" });
  });
});

/* ------------------------------------------------------------------ */
/* The stand-in judge — it is a stand-in, but it is not a mock         */
/* ------------------------------------------------------------------ */

const HOST: HostScene = {
  nodes: [
    { id: "a", type: "block", position: { x: 0, y: 0 }, data: { name: "a", ports: { right: ["out"] } } },
    { id: "b", type: "block", position: { x: 0, y: 0 }, data: { name: "b", ports: { right: ["out"] } } },
    { id: "hub", type: "block", position: { x: 0, y: 0 }, data: { name: "hub", ports: { left: ["in", "cfg"] } } },
    { id: "gain", type: "value", position: { x: 0, y: 0 }, data: { name: "gain", value: "1", writers: ["set"], readers: ["val"] } },
    { id: "logo", type: "glyph", position: { x: 0, y: 0 }, data: { name: "logo", content: "lucide:rocket" } },
    { id: "kid", type: "block", parentId: "hub", position: { x: 0, y: 0 }, data: { name: "kid", ports: { left: ["in"] } } },
  ],
  edges: [],
};

describe("standInJudge", () => {
  const judge = standInJudge(HOST);

  it("reads polarity off the wall: left/top sink, right/bottom source", () => {
    expect(judge({ source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } })).toEqual({
      ok: true,
      oriented: { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } },
    });
    expect(judge({ source: { nodeId: "a", portId: "out" }, target: { nodeId: "b", portId: "out" } })).toEqual({
      ok: false,
      reason: "same-polarity",
    });
  });

  it("reads a value capsule's writers as sinks and readers as sources", () => {
    expect(judge({ source: { nodeId: "gain", portId: "val" }, target: { nodeId: "hub", portId: "in" } })).toEqual({
      ok: true,
      oriented: { source: { nodeId: "gain", portId: "val" }, target: { nodeId: "hub", portId: "in" } },
    });
    expect(judge({ source: { nodeId: "gain", portId: "set" }, target: { nodeId: "hub", portId: "in" } })).toEqual({
      ok: false,
      reason: "same-polarity",
    });
  });

  it("refuses across a scope boundary, and reports glyph/code as speaking no ports at all", () => {
    expect(judge({ source: { nodeId: "a", portId: "out" }, target: { nodeId: "kid", portId: "in" } })).toEqual({
      ok: false,
      reason: "no-shared-scope",
    });
    expect(hostPortsOf(HOST)("logo")).toEqual([]);
    expect(hostPortsOf(HOST)("nobody")).toBeUndefined();
  });

  it("reports the DATAFLOW orientation, flipping a pair asked sink-first", () => {
    // `hub/in` is a sink and `a/out` a source, so asking in that order must
    // come back flipped — this is the field `batchWireEdges` relies on to
    // avoid writing a backwards edge.
    expect(judge({ source: { nodeId: "hub", portId: "in" }, target: { nodeId: "a", portId: "out" } })).toEqual({
      ok: true,
      oriented: { source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } },
    });
  });

  it("refuses a duplicate and a second feed into an occupied input", () => {
    const wired: HostScene = { ...HOST, edges: [{ id: "e", source: "a", sourceHandle: "out", target: "hub", targetHandle: "in" }] };
    const onWired = standInJudge(wired);
    expect(onWired({ source: { nodeId: "a", portId: "out" }, target: { nodeId: "hub", portId: "in" } })).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(onWired({ source: { nodeId: "b", portId: "out" }, target: { nodeId: "hub", portId: "in" } })).toEqual({
      ok: false,
      reason: "input-occupied",
    });
    // Both rules are switchable, because the story exposes them as toggles.
    expect(standInJudge(wired, { singleFeed: false })({ source: { nodeId: "b", portId: "out" }, target: { nodeId: "hub", portId: "in" } })).toMatchObject({
      ok: true,
    });
  });

  it("refuses a cable that would close a loop", () => {
    const loopy: HostScene = {
      nodes: [
        { id: "x", type: "block", position: { x: 0, y: 0 }, data: { ports: { left: ["in"], right: ["out"] } } },
        { id: "y", type: "block", position: { x: 0, y: 0 }, data: { ports: { left: ["in"], right: ["out"] } } },
      ],
      edges: [{ id: "e", source: "x", sourceHandle: "out", target: "y", targetHandle: "in" }],
    };
    expect(standInJudge(loopy)({ source: { nodeId: "y", portId: "out" }, target: { nodeId: "x", portId: "in" } })).toEqual({
      ok: false,
      reason: "cycle",
    });
    expect(standInJudge(loopy, { acyclic: false, singleFeed: true, sameScope: true })({
      source: { nodeId: "y", portId: "out" },
      target: { nodeId: "x", portId: "in" },
    })).toMatchObject({ ok: true });
  });

  it("composes with batchWireTargets to produce a real availability set", () => {
    // The end-to-end claim: real host records + the stand-in rules ⇒ the
    // ring contains exactly the three sinks in scope. `kid/in` is out of
    // scope (parented to `hub`), `logo` speaks no ports, `gain/val` is a
    // reader and so a source, and `a`/`b`'s own outputs are sources too.
    //
    // `gain/set` in this list is the assertion catching ME: it is a value
    // capsule's WRITER, which is a sink on a top-level node, so it is
    // genuinely available and the first version of this expectation was
    // simply wrong. Left recorded rather than quietly corrected — an
    // availability set is exactly the kind of answer that is easier to
    // assume than to enumerate.
    const keys = batchWireTargets({
      sources: ["a", "b"],
      intent: "into",
      candidateNodeIds: HOST.nodes.map((node) => node.id),
      portsOf: hostPortsOf(HOST),
      judge: standInJudge(HOST),
    });
    expect([...keys].sort()).toEqual(["gain/set", "hub/cfg", "hub/in"]);
  });
});
