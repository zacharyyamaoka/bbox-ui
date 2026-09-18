// src/scene/lint.test.ts — the lint engine, tested in the node project (no
// DOM, no browser): `pnpm exec vitest --project=unit run`. Table-driven
// where the registry itself is the table: one fixture per rule, plus the
// combined-scene/subset/id-stability properties the runner as a whole must
// hold.
import { describe, expect, test } from "vitest";

import { LINT_RULE_IDS, LINT_RULES, findingsBySubject, findingsFor, lintScene, subjectKey, typesIntersect, type LintFinding, type LintScene } from "./lint";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function n(id: string) {
  return { id };
}

function e(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string) {
  return { id, source, target, sourceHandle, targetHandle };
}

const clean: LintScene = {
  nodes: [n("src"), n("proc"), n("sink")],
  edges: [e("e1", "src", "proc", "out", "in"), e("e2", "proc", "sink", "out", "in")],
};

const danglingScene: LintScene = {
  nodes: [n("a"), n("b")],
  edges: [
    e("e-missing-node", "a", "ghost", "out", "in"),
    e("e-missing-port", "a", "b", "out", "no-such-port"),
    e("e-both-dangle", "ghost1", "ghost2", "out", "in"),
  ],
};

const cyclicScene: LintScene = {
  nodes: [n("free"), n("loop1"), n("loop2"), n("selfy")],
  edges: [e("e-a", "loop1", "loop2", "out", "in"), e("e-b", "loop2", "loop1", "out", "in"), e("e-self", "selfy", "selfy", "out", "in")],
};

const duplicateScene: LintScene = {
  nodes: [n("x"), n("y")],
  edges: [e("d1", "x", "y", "p", "q"), e("d2", "x", "y", "p", "q"), e("d3", "x", "y", "p", "q")],
};

const manyToOneScene: LintScene = {
  nodes: [n("a"), n("b"), n("sink")],
  edges: [e("m1", "a", "sink", "out", "in"), e("m2", "b", "sink", "out", "in")],
};

const selfConnScene: LintScene = {
  nodes: [n("solo")],
  edges: [e("s1", "solo", "solo", "out", "in")],
};

/* ------------------------------------------------------------------ */
/* The registry itself                                                 */
/* ------------------------------------------------------------------ */

describe("LINT_RULES / LINT_RULE_IDS", () => {
  test("every id in LINT_RULE_IDS has a matching registry entry with the same id", () => {
    for (const id of LINT_RULE_IDS) {
      expect(LINT_RULES[id].id).toBe(id);
    }
  });

  test("a closed set — seven rules, no more, no fewer (D6 added type-mismatch, ruling 1 added polarity)", () => {
    expect(LINT_RULE_IDS).toEqual(["dangling-edge", "cycle", "duplicate-edge", "many-to-one", "self-connection", "type-mismatch", "polarity"]);
  });

  test("every rule carries a non-empty provenance string", () => {
    for (const id of LINT_RULE_IDS) {
      expect(LINT_RULES[id].provenance.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* dangling-edge                                                       */
/* ------------------------------------------------------------------ */

describe("dangling-edge", () => {
  test("missing-node and missing-port each produce one finding, missing-node needs no portsOf", () => {
    const findings = lintScene(danglingScene, { rules: ["dangling-edge"], portsOf: () => ["in", "out"] });
    const byEdge = new Map(findings.map((f) => [f.subject.id + (f.id.endsWith(":source") ? ":source" : ":target"), f]));
    expect(byEdge.get("e-missing-node:source")).toBeUndefined(); // the SOURCE end of e-missing-node is fine
    expect(byEdge.get("e-missing-node:target")?.message).toContain('node "ghost"');
    expect(byEdge.get("e-missing-port:target")?.message).toContain('port "b/no-such-port"');
  });

  test("both ends dangling on ONE edge → two distinct findings, distinct ids, same edge subject", () => {
    const findings = lintScene(danglingScene, { rules: ["dangling-edge"] }).filter((f) => f.subject.id === "e-both-dangle");
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.id).sort()).toEqual(["lint:dangling-edge:edge:e-both-dangle:source", "lint:dangling-edge:edge:e-both-dangle:target"]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  test("with no portsOf, only node existence is checked — missing-port is invisible", () => {
    const findings = lintScene(danglingScene, { rules: ["dangling-edge"] });
    expect(findings.some((f) => f.message?.includes("no-such-port"))).toBe(false);
  });

  test("severity error, code is the rule id", () => {
    const [finding] = lintScene(danglingScene, { rules: ["dangling-edge"] });
    expect(finding.severity).toBe("error");
    expect(finding.code).toBe("dangling-edge");
    expect(finding.ruleId).toBe("dangling-edge");
  });

  test("a clean scene has none", () => {
    expect(lintScene(clean, { rules: ["dangling-edge"] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* cycle                                                                */
/* ------------------------------------------------------------------ */

describe("cycle", () => {
  test("a 2-node cycle marks both members, each with the same message", () => {
    const findings = lintScene(cyclicScene, { rules: ["cycle"] }).filter((f) => f.subject.kind === "node" && f.subject.id !== "selfy");
    expect(findings.map((f) => f.subject.id).sort()).toEqual(["loop1", "loop2"]);
    expect(findings[0].message).toBe(findings[1].message);
    expect(findings[0].message).toContain("loop1");
    expect(findings[0].message).toContain("loop2");
  });

  test("a self-loop is a 1-member cycle with its own wording", () => {
    const [finding] = lintScene(cyclicScene, { rules: ["cycle"] }).filter((f) => f.subject.id === "selfy");
    expect(finding.message).toBe('Node "selfy" feeds itself (self-loop)');
  });

  test("the free node is untouched", () => {
    expect(lintScene(cyclicScene, { rules: ["cycle"] }).some((f) => f.subject.id === "free")).toBe(false);
  });

  test("a clean scene has none", () => {
    expect(lintScene(clean, { rules: ["cycle"] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* duplicate-edge                                                       */
/* ------------------------------------------------------------------ */

describe("duplicate-edge", () => {
  test("every edge in a 3-way duplicate group gets its own finding, same message", () => {
    const findings = lintScene(duplicateScene, { rules: ["duplicate-edge"] });
    expect(findings.map((f) => f.subject.id).sort()).toEqual(["d1", "d2", "d3"]);
    expect(new Set(findings.map((f) => f.message))).toEqual(new Set(["3 edges connect the same two ports"]));
  });

  test("severity is warning, not error — the app's own permission-free stance", () => {
    expect(lintScene(duplicateScene, { rules: ["duplicate-edge"] })[0].severity).toBe("warning");
  });

  test("a clean scene has none", () => {
    expect(lintScene(clean, { rules: ["duplicate-edge"] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* many-to-one                                                          */
/* ------------------------------------------------------------------ */

describe("many-to-one", () => {
  test("2 producers into one port → exactly one finding, on the PORT, not either edge", () => {
    const findings = lintScene(manyToOneScene, { rules: ["many-to-one"] });
    expect(findings).toHaveLength(1);
    expect(findings[0].subject).toEqual({ kind: "port", id: "sink/in" });
    expect(findings[0].message).toBe('Port "sink/in" has 2 producers wired in (no region makes them exclusive)');
  });

  test("a single producer is not a finding", () => {
    expect(lintScene(clean, { rules: ["many-to-one"] })).toEqual([]);
  });

  test("a node-level edge (no targetHandle) contributes nothing", () => {
    const scene: LintScene = { nodes: [n("a"), n("b"), n("c")], edges: [e("e1", "a", "c"), e("e2", "b", "c")] };
    expect(lintScene(scene, { rules: ["many-to-one"] })).toEqual([]);
  });

  test("two edges from the SAME source port into one target port are NOT many-to-one — that is duplicate-edge's concern", () => {
    const scene: LintScene = { nodes: [n("a"), n("sink")], edges: [e("e1", "a", "sink", "out", "in"), e("e2", "a", "sink", "out", "in")] };
    expect(lintScene(scene, { rules: ["many-to-one"] })).toEqual([]);
    expect(lintScene(scene, { rules: ["duplicate-edge"] })).toHaveLength(2);
  });

  test("3 edges from 2 distinct sources (one of them duplicated) count as 2 producers, not 3", () => {
    const scene: LintScene = {
      nodes: [n("a"), n("b"), n("sink")],
      edges: [e("e1", "a", "sink", "out", "in"), e("e2", "a", "sink", "out", "in"), e("e3", "b", "sink", "out", "in")],
    };
    const [finding] = lintScene(scene, { rules: ["many-to-one"] });
    expect(finding.message).toBe('Port "sink/in" has 2 producers wired in (no region makes them exclusive)');
  });
});

/* ------------------------------------------------------------------ */
/* self-connection                                                      */
/* ------------------------------------------------------------------ */

describe("self-connection", () => {
  test("source === target → one finding on the edge", () => {
    const [finding] = lintScene(selfConnScene, { rules: ["self-connection"] });
    expect(finding.subject).toEqual({ kind: "edge", id: "s1" });
    expect(finding.message).toBe('Edge "s1" connects "solo" to itself');
  });

  test("a clean scene has none", () => {
    expect(lintScene(clean, { rules: ["self-connection"] })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* type-mismatch (D6) — the seam exists, the vocabulary is caller-supplied */
/* ------------------------------------------------------------------ */

describe("type-mismatch", () => {
  const typedScene: LintScene = {
    nodes: [n("a"), n("b")],
    edges: [e("mismatched", "a", "b", "out", "in"), e("half-known", "a", "b", "out", "unknown-port")],
  };

  test("with no typeOf at all, the rule contributes nothing — pre-existing callers are unaffected", () => {
    expect(LINT_RULES["type-mismatch"].run(typedScene)).toEqual([]);
  });

  test("both ends resolved, disjoint tag arrays → one finding, on the EDGE", () => {
    const typeOf = (ref: { nodeId: string; portId: string }) =>
      ref.nodeId === "a" && ref.portId === "out" ? ["number"] : ref.nodeId === "b" && ref.portId === "in" ? ["string"] : undefined;
    const hits = LINT_RULES["type-mismatch"].run(typedScene, { typeOf });
    expect(hits).toHaveLength(1);
    expect(hits[0].subject).toEqual({ kind: "edge", id: "mismatched" });
    expect(hits[0].message).toBe('Edge "mismatched" carries "number" into "string"');
  });

  test("both ends resolved, overlapping tag arrays → no finding", () => {
    const typeOf = () => ["number", "string"] as readonly string[];
    expect(LINT_RULES["type-mismatch"].run(typedScene, { typeOf })).toEqual([]);
  });

  test("only ONE end resolvable → no judgement, zero findings for that edge", () => {
    const typeOf = (ref: { nodeId: string; portId: string }) => (ref.nodeId === "a" && ref.portId === "out" ? ["number"] : undefined);
    const hits = LINT_RULES["type-mismatch"].run(typedScene, { typeOf });
    expect(hits).toEqual([]);
  });

  test("a custom `compatible` overrides the default typesIntersect", () => {
    const typeOf = () => ["number"] as readonly string[];
    const alwaysIncompatible = () => false;
    const hits = LINT_RULES["type-mismatch"].run(typedScene, { typeOf, compatible: alwaysIncompatible });
    // both edges have both ends resolvable to ["number"]; alwaysIncompatible fires on both
    expect(hits).toHaveLength(2);
  });
});

describe("typesIntersect — the default TypeCompatible (Blockly list-intersection)", () => {
  test("identical single tags intersect", () => {
    expect(typesIntersect(["number"], ["number"])).toBe(true);
  });

  test("disjoint single tags do not intersect", () => {
    expect(typesIntersect(["number"], ["string"])).toBe(false);
  });

  test("a multi-tag side intersecting a single-tag side is compatible", () => {
    expect(typesIntersect(["number", "string"], ["string"])).toBe(true);
  });

  test("empty arrays never intersect with anything, including each other", () => {
    expect(typesIntersect([], ["number"])).toBe(false);
    expect(typesIntersect([], [])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The runner: subsets, totality, combined scenes                      */
/* ------------------------------------------------------------------ */

describe("lintScene — the subset requirement", () => {
  const messy: LintScene = {
    nodes: [n("a"), n("b"), n("sink"), n("loop1"), n("loop2")],
    edges: [
      e("wire-1", "a", "sink", "out", "in"),
      e("wire-2", "b", "sink", "out", "in"), // many-to-one with wire-1
      e("wire-3", "loop1", "loop2", "out", "in"),
      e("wire-4", "loop2", "loop1", "out", "in"), // cycle with wire-3
      e("wire-5", "ghost", "a", "out", "in"), // dangling
    ],
  };

  test("no rules enabled → no findings, even on a scene full of violations", () => {
    expect(lintScene(messy, { rules: [] })).toEqual([]);
  });

  test("every rule enabled → every applicable rule fires", () => {
    const firedRules = new Set(lintScene(messy, { rules: LINT_RULE_IDS }).map((f) => f.ruleId));
    expect(firedRules).toEqual(new Set(["many-to-one", "cycle", "dangling-edge"]));
  });

  test("exactly one rule enabled → ONLY that rule's traces are marked, nothing else's", () => {
    const onlyManyToOne = lintScene(messy, { rules: ["many-to-one"] });
    expect(onlyManyToOne.every((f) => f.ruleId === "many-to-one")).toBe(true);
    expect(onlyManyToOne).toHaveLength(1);

    const onlyCycle = lintScene(messy, { rules: ["cycle"] });
    expect(onlyCycle.every((f) => f.ruleId === "cycle")).toBe(true);
    expect(onlyCycle.map((f) => f.subject.id).sort()).toEqual(["loop1", "loop2"]);
  });

  test("two rules enabled → exactly the union of those two, nothing from the third violation", () => {
    const findings = lintScene(messy, { rules: ["many-to-one", "cycle"] });
    expect(new Set(findings.map((f) => f.ruleId))).toEqual(new Set(["many-to-one", "cycle"]));
    expect(findings.some((f) => f.ruleId === "dangling-edge")).toBe(false);
  });

  test("an unknown rule id is skipped, not thrown on — total, same policy as the rest of scene.ts", () => {
    // @ts-expect-error — deliberately malformed input, proving the runtime stays total
    expect(() => lintScene(messy, { rules: ["not-a-real-rule"] })).not.toThrow();
    // @ts-expect-error
    expect(lintScene(messy, { rules: ["not-a-real-rule"] })).toEqual([]);
  });

  test("omitting `rules` entirely runs the whole registry", () => {
    const withDefault = lintScene(messy, {});
    const withExplicitAll = lintScene(messy, { rules: LINT_RULE_IDS });
    expect(withDefault).toEqual(withExplicitAll);
  });
});

/* ------------------------------------------------------------------ */
/* Id stability — the property the whole multi-producer design rests on */
/* ------------------------------------------------------------------ */

describe("id stability", () => {
  test("the same scene, linted twice, yields byte-identical findings", () => {
    const first = lintScene(manyToOneScene, { rules: LINT_RULE_IDS });
    const second = lintScene(manyToOneScene, { rules: LINT_RULE_IDS });
    expect(second).toEqual(first);
  });

  test("adding an UNRELATED node/edge elsewhere leaves an existing finding's id unchanged", () => {
    const before = lintScene(manyToOneScene, { rules: ["many-to-one"] });
    const grown: LintScene = {
      nodes: [...manyToOneScene.nodes, n("unrelated")],
      edges: [...manyToOneScene.edges, e("unrelated-wire", "unrelated", "unrelated")],
    };
    const after = lintScene(grown, { rules: ["many-to-one"] });
    // The many-to-one finding on sink/in survives byte-for-byte; the new
    // self-loop is invisible because that rule isn't enabled here.
    expect(after.find((f) => f.subject.id === "sink/in")).toEqual(before.find((f) => f.subject.id === "sink/in"));
  });

  test("reordering nodes/edges in the input does not change WHICH ids come out (only algorithm-defined order may shift)", () => {
    const shuffled: LintScene = {
      nodes: [...manyToOneScene.nodes].reverse(),
      edges: [...manyToOneScene.edges].reverse(),
    };
    const idsOriginal = new Set(lintScene(manyToOneScene, { rules: LINT_RULE_IDS }).map((f) => f.id));
    const idsShuffled = new Set(lintScene(shuffled, { rules: LINT_RULE_IDS }).map((f) => f.id));
    expect(idsShuffled).toEqual(idsOriginal);
  });

  test("ids never encode array position — two scenes with an identical single violation at a different array index produce the SAME id", () => {
    const violationFirst: LintScene = { nodes: [n("solo")], edges: [e("s1", "solo", "solo")] };
    const violationLast: LintScene = {
      nodes: [n("pad1"), n("pad2"), n("solo")],
      edges: [e("pad-e1", "pad1", "pad2"), e("s1", "solo", "solo")],
    };
    const idFirst = lintScene(violationFirst, { rules: ["self-connection"] })[0].id;
    const idLast = lintScene(violationLast, { rules: ["self-connection"] }).find((f) => f.subject.id === "s1")!.id;
    expect(idFirst).toBe(idLast);
  });
});

/* ------------------------------------------------------------------ */
/* Grouping helpers                                                     */
/* ------------------------------------------------------------------ */

describe("subjectKey / findingsBySubject / findingsFor", () => {
  test("subjectKey is kind:id", () => {
    expect(subjectKey({ kind: "port", id: "sink/in" })).toBe("port:sink/in");
  });

  test("findingsBySubject groups without collapsing — a carrier with 2 findings keeps both", () => {
    const findings = lintScene(cyclicScene, { rules: ["cycle"] });
    const grouped = findingsBySubject(findings);
    expect(grouped.get("node:loop1")).toHaveLength(1);
    expect(grouped.get("node:selfy")).toHaveLength(1);
  });

  test("findingsFor reads one carrier's findings, order-preserved", () => {
    const findings: LintFinding[] = lintScene(manyToOneScene, { rules: ["many-to-one"] });
    expect(findingsFor(findings, { kind: "port", id: "sink/in" })).toEqual(findings);
    expect(findingsFor(findings, { kind: "port", id: "no-such-port" })).toEqual([]);
  });
});
