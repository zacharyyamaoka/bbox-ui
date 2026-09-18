// src/scene/linking.test.ts — definition linking's pure functions, tested
// in the node project: `pnpm exec vitest --project=unit run`. The donor's
// rules under test, with their donor lines, are cited at each describe;
// the ported module is src/scene/linking.ts, donor provenance in its
// header. Acceptance L1-L6 from the 2026-09-17 brief are called out where
// they are proved.
import { describe, expect, test } from "vitest";

import {
  commitDefinitionName,
  definitionBadge,
  definitionContentSignature,
  definitionKeyFor,
  definitionOccurrences,
  deleteNode,
  duplicateNodeUnlinked,
  normalizedDefinitionName,
  type OccurrenceData,
  parkedEnds,
  reconcileDefinitions,
  setDefinitionData,
  unlinkOccurrence,
} from "./linking";
import { type BlockScene, findDanglingEdges, portKey, type SceneNode } from "./scene";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

type Scene = BlockScene<OccurrenceData>;

function node(id: string, data: OccurrenceData = {}, extra: Partial<SceneNode<OccurrenceData>> = {}): SceneNode<OccurrenceData> {
  return { id, position: { x: 0, y: 0 }, data, ...extra };
}

/** Deterministic minting for tests — each call `m1`, `m2`, … */
function minter(prefix = "m"): () => string {
  let count = 0;
  return () => `${prefix}${(count += 1)}`;
}

const FILTER_CONTENT = { ports: { left: ["in"], right: ["out"] }, gain: 3 };
const FILTER_EXPANDED = { fill: "oklch(0.95 0.03 250)" };

/** Two linked occurrences of `filter` plus an independent `sink`. */
function filterScene(): Scene {
  return {
    nodes: [
      node("f1", { name: "filter", linked: structuredClone(FILTER_CONTENT), expanded: structuredClone(FILTER_EXPANDED), appearance: { accent: "blue" } }, { definitionId: "g-filter" }),
      node("f2", { name: "filter", linked: structuredClone(FILTER_CONTENT), expanded: structuredClone(FILTER_EXPANDED), appearance: { accent: "red" } }, { definitionId: "g-filter" }),
      node("sink", { name: "sink", linked: { ports: { left: ["in"] } } }, { definitionId: "g-sink" }),
    ],
    edges: [{ id: "e1", source: "f1", sourceHandle: "out", target: "sink", targetHandle: "in" }],
  };
}

/* ------------------------------------------------------------------ */
/* Naming — donor 44-58, 78-80                                         */
/* ------------------------------------------------------------------ */

describe("naming", () => {
  test("keeps display spelling separate from its namespace key (donor test parity)", () => {
    expect(normalizedDefinitionName("  run()  ")).toBe("run()");
    expect(normalizedDefinitionName("a   b")).toBe("a b");
    expect(definitionKeyFor("run()")).toBe("run");
    expect(definitionKeyFor("run()", 1)).toBe("run_draft_1");
    expect(definitionKeyFor("estimate pair()", 2)).toBe("estimate_pair_draft_2");
    expect(definitionKeyFor("   ")).toBe("");
  });

  test("draft state is quiet metadata beside an unchanged title", () => {
    expect(definitionBadge({ name: "run()", draftOrdinal: 3 })).toBe("Draft 3");
    expect(definitionBadge({ name: "run()" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Content signature — donor 379-391, facets not subtrees              */
/* ------------------------------------------------------------------ */

describe("definitionContentSignature", () => {
  test("key order never matters — authored `{a,b}` and `{b,a}` are one content", () => {
    expect(definitionContentSignature({ linked: { a: 1, b: [2, { c: 3 }] } })).toBe(
      definitionContentSignature({ linked: { b: [2, { c: 3 }], a: 1 } }),
    );
  });

  test("appearance and name are NOT content — free things cannot split a definition", () => {
    const base = definitionContentSignature({ name: "x", linked: { gain: 1 } });
    expect(definitionContentSignature({ name: "y", linked: { gain: 1 }, appearance: { accent: "red" } })).toBe(base);
  });

  test("expanded IS content — the function body belongs to the definition", () => {
    expect(definitionContentSignature({ linked: { gain: 1 }, expanded: { fill: "red" } })).not.toBe(
      definitionContentSignature({ linked: { gain: 1 }, expanded: { fill: "blue" } }),
    );
  });

  test("an absent facet, an undefined facet and an empty `{}` facet are the same nothing", () => {
    expect(definitionContentSignature({})).toBe(definitionContentSignature({ linked: {}, expanded: undefined }));
  });
});

/* ------------------------------------------------------------------ */
/* Occurrences — donor 127-130                                         */
/* ------------------------------------------------------------------ */

describe("definitionOccurrences", () => {
  test("every node sharing the group id, in scene order, self included", () => {
    expect(definitionOccurrences(filterScene(), "f2").map((n) => n.id)).toEqual(["f1", "f2"]);
  });

  test("a node without a group is a group of one; an unknown id has none", () => {
    const scene: Scene = { nodes: [node("lone", { name: "x" })], edges: [] };
    expect(definitionOccurrences(scene, "lone").map((n) => n.id)).toEqual(["lone"]);
    expect(definitionOccurrences(scene, "ghost")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* L4 — port identity is namespaced to the node                        */
/* ------------------------------------------------------------------ */

describe("port identity across occurrences (L4)", () => {
  test("one vocabulary, disjoint keys", () => {
    const scene = filterScene();
    const [f1, f2] = scene.nodes;
    // Same VOCABULARY: linked data is shared, so the port id lists agree…
    expect(f1.data.linked).toEqual(f2.data.linked);
    const vocabulary = [...(FILTER_CONTENT.ports.left as string[]), ...(FILTER_CONTENT.ports.right as string[])];
    // …while every port FACT is keyed per node: the key sets are disjoint.
    const keys1 = new Set(vocabulary.map((port) => portKey(f1.id, port)));
    const keys2 = new Set(vocabulary.map((port) => portKey(f2.id, port)));
    expect([...keys1].filter((key) => keys2.has(key))).toEqual([]);
    expect(keys1.size).toBe(vocabulary.length);
  });
});

/* ------------------------------------------------------------------ */
/* commitDefinitionName — donor 439-515                                */
/* ------------------------------------------------------------------ */

describe("commitDefinitionName", () => {
  test("L1: renaming ONE occurrence detaches it; the other occurrence is untouched, byte for byte", () => {
    const scene = filterScene();
    const before = scene.nodes[0];
    const out = commitDefinitionName(scene, "f2", "smooth", minter());
    // The OTHER occurrence: the same object, not merely an equal one.
    expect(out.nodes.find((n) => n.id === "f1")).toBe(before);
    expect(out.nodes.find((n) => n.id === "f1")!.data.name).toBe("filter");
    // The renamed one left the group with its data intact.
    const renamed = out.nodes.find((n) => n.id === "f2")!;
    expect(renamed.data.name).toBe("smooth");
    expect(renamed.definitionId).toBe("m1");
    expect(renamed.data.linked).toEqual(FILTER_CONTENT);
    expect(definitionOccurrences(out, "f1").map((n) => n.id)).toEqual(["f1"]);
    expect(definitionOccurrences(out, "f2").map((n) => n.id)).toEqual(["f2"]);
  });

  test("with three occurrences, the two LEFT BEHIND stay linked to each other", () => {
    const scene = filterScene();
    const third = node("f3", { name: "filter", linked: structuredClone(FILTER_CONTENT), expanded: structuredClone(FILTER_EXPANDED) }, { definitionId: "g-filter" });
    const bigger: Scene = { ...scene, nodes: [...scene.nodes, third] };
    const out = commitDefinitionName(bigger, "f2", "smooth", minter());
    expect(definitionOccurrences(out, "f1").map((n) => n.id)).toEqual(["f1", "f3"]);
  });

  test("renaming INTO a name with the same content JOINS that definition — the software model both ways", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "decode", linked: { gain: 1 } }, { definitionId: "g-a" }),
        node("b", { name: "other", linked: { gain: 1 } }, { definitionId: "g-b" }),
      ],
      edges: [],
    };
    const out = commitDefinitionName(scene, "b", "decode", minter());
    expect(out.nodes.find((n) => n.id === "b")!.definitionId).toBe("g-a");
    expect(definitionOccurrences(out, "a").map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("sequential renames converge — renaming every call site IS renaming the function", () => {
    let scene = filterScene();
    scene = commitDefinitionName(scene, "f1", "smooth", minter("x"));
    scene = commitDefinitionName(scene, "f2", "smooth", minter("y"));
    const f1 = scene.nodes.find((n) => n.id === "f1")!;
    const f2 = scene.nodes.find((n) => n.id === "f2")!;
    expect(f1.definitionId).toBe(f2.definitionId);
    expect(definitionOccurrences(scene, "f1").map((n) => n.id)).toEqual(["f1", "f2"]);
  });

  test("an EMPTY block named after an existing definition adopts it, content flowing IN (donor 466-475 intent)", () => {
    const scene = filterScene();
    const blank = node("blank", { name: "untitled" }, { definitionId: "g-blank" });
    const out = commitDefinitionName({ ...scene, nodes: [...scene.nodes, blank] }, "blank", "filter", minter());
    const joined = out.nodes.find((n) => n.id === "blank")!;
    expect(joined.definitionId).toBe("g-filter");
    expect(joined.data.linked).toEqual(FILTER_CONTENT);
    expect(joined.data.expanded).toEqual(FILTER_EXPANDED);
    // The definition it joined kept its content — the flow was inward.
    expect(out.nodes.find((n) => n.id === "f1")).toBe(scene.nodes[0]);
  });

  test("L2: same name over DIFFERENT content drafts automatically — ordinal 1, then 2", () => {
    const scene = filterScene();
    const gate = node("gate", { name: "gate", linked: { gain: 9 } }, { definitionId: "g-gate" });
    const trim = node("trim", { name: "trim", linked: { gain: 5 } }, { definitionId: "g-trim" });
    let out = commitDefinitionName({ ...scene, nodes: [...scene.nodes, gate, trim] }, "gate", "filter", minter());
    expect(out.nodes.find((n) => n.id === "gate")!.data.draftOrdinal).toBe(1);
    expect(definitionBadge(out.nodes.find((n) => n.id === "gate")!.data)).toBe("Draft 1");
    // The canonical stays canonical, untouched.
    expect(out.nodes.find((n) => n.id === "f1")!.data.draftOrdinal).toBeUndefined();
    out = commitDefinitionName(out, "trim", "filter", minter("t"));
    expect(out.nodes.find((n) => n.id === "trim")!.data.draftOrdinal).toBe(2);
  });

  test("L3: the ordinal always increments past the highest IN USE — a freed number is never refilled", () => {
    // Draft 1 is long gone; Draft 3 survives. The next collision takes 4.
    const scene: Scene = {
      nodes: [
        node("canon", { name: "filter", linked: { gain: 3 } }, { definitionId: "g-canon" }),
        node("d3", { name: "filter", linked: { gain: 7 }, draftOrdinal: 3 }, { definitionId: "g-d3" }),
        node("late", { name: "late", linked: { gain: 11 } }, { definitionId: "g-late" }),
      ],
      edges: [],
    };
    const out = commitDefinitionName(scene, "late", "filter", minter());
    expect(out.nodes.find((n) => n.id === "late")!.data.draftOrdinal).toBe(4); // 1 + max(3), donor 490-496
  });

  test("a rename INTO a collision keeps its own unused ordinal (donor 494)", () => {
    const scene: Scene = {
      nodes: [
        node("canon", { name: "filter", linked: { gain: 3 } }, { definitionId: "g-canon" }),
        node("d1", { name: "filter", linked: { gain: 7 }, draftOrdinal: 1 }, { definitionId: "g-d1" }),
        node("old", { name: "old", linked: { gain: 11 }, draftOrdinal: 5 }, { definitionId: "g-old" }),
      ],
      edges: [],
    };
    const out = commitDefinitionName(scene, "old", "filter", minter());
    expect(out.nodes.find((n) => n.id === "old")!.data.draftOrdinal).toBe(5);
  });

  test("renaming the canonical AWAY promotes the oldest draft — FIFO — and later drafts keep their numbers", () => {
    const scene: Scene = {
      nodes: [
        node("canon", { name: "filter", linked: { gain: 3 } }, { definitionId: "g-canon" }),
        node("d1", { name: "filter", linked: { gain: 7 }, draftOrdinal: 1 }, { definitionId: "g-d1" }),
        node("d2", { name: "filter", linked: { gain: 9 }, draftOrdinal: 2 }, { definitionId: "g-d2" }),
      ],
      edges: [],
    };
    const out = commitDefinitionName(scene, "canon", "other", minter());
    expect(out.nodes.find((n) => n.id === "d1")!.data.draftOrdinal).toBeUndefined(); // promoted, donor 530-546
    expect(out.nodes.find((n) => n.id === "d2")!.data.draftOrdinal).toBe(2); // valid ordinals are never renumbered
  });

  test("empty names bind nothing — ten fresh blocks are ten separate things", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "x", draftOrdinal: 2 }, { definitionId: "g-a" }),
        node("b", { name: "" }, { definitionId: "g-b" }),
      ],
      edges: [],
    };
    const out = commitDefinitionName(scene, "a", "", minter());
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(a.data.name).toBe("");
    expect(a.data.draftOrdinal).toBeUndefined(); // a nothing has no drafts
    expect(a.definitionId).not.toBe(out.nodes.find((n) => n.id === "b")!.definitionId);
  });

  test("a no-op commit is a no-op — the SAME scene object (deviation #7 from the donor's blur handler)", () => {
    const scene = filterScene();
    expect(commitDefinitionName(scene, "f1", "filter", minter())).toBe(scene);
  });

  test("a whitespace respell keeps the group and stores the author's spelling verbatim", () => {
    const scene = filterScene();
    const out = commitDefinitionName(scene, "f2", "filter ", minter());
    const respelled = out.nodes.find((n) => n.id === "f2")!;
    expect(respelled.data.name).toBe("filter "); // truthful rendering — the typed characters survive
    expect(respelled.definitionId).toBe("g-filter"); // normalized-same ⇒ still the same thing
    expect(out.nodes.find((n) => n.id === "f1")).toBe(scene.nodes[0]);
  });

  test("total + pure: unknown node returns the same object; inputs are never mutated", () => {
    const scene = filterScene();
    const snapshot = JSON.stringify(scene);
    expect(commitDefinitionName(scene, "ghost", "x", minter())).toBe(scene);
    commitDefinitionName(scene, "f2", "smooth", minter());
    expect(JSON.stringify(scene)).toBe(snapshot);
  });
});

/* ------------------------------------------------------------------ */
/* setDefinitionData — donor 340-352                                   */
/* ------------------------------------------------------------------ */

describe("setDefinitionData", () => {
  test("L6: linked and expanded facets propagate to every occurrence; free appearance does not move", () => {
    const scene = filterScene();
    const out = setDefinitionData(scene, "f1", { linked: { ...FILTER_CONTENT, gain: 8 }, expanded: { fill: "red" } });
    for (const id of ["f1", "f2"]) {
      const occurrence = out.nodes.find((n) => n.id === id)!;
      expect(occurrence.data.linked).toEqual({ ...FILTER_CONTENT, gain: 8 });
      expect(occurrence.data.expanded).toEqual({ fill: "red" });
    }
    // Appearance stayed occurrence-local through the write.
    expect(out.nodes.find((n) => n.id === "f1")!.data.appearance).toEqual({ accent: "blue" });
    expect(out.nodes.find((n) => n.id === "f2")!.data.appearance).toEqual({ accent: "red" });
    // And the unrelated definition never heard about any of it.
    expect(out.nodes.find((n) => n.id === "sink")).toBe(scene.nodes[2]);
  });

  test("each occurrence gets its OWN clone — records never share a mutable object", () => {
    const out = setDefinitionData(filterScene(), "f1", { linked: { gain: 8 } });
    const [f1, f2] = out.nodes;
    expect(f1.data.linked).not.toBe(f2.data.linked);
    expect(f1.data.linked).toEqual(f2.data.linked);
  });

  test("an omitted key is untouched; an explicit undefined clears the facet everywhere", () => {
    const kept = setDefinitionData(filterScene(), "f2", { linked: { gain: 8 } });
    expect(kept.nodes.find((n) => n.id === "f1")!.data.expanded).toEqual(FILTER_EXPANDED);
    const cleared = setDefinitionData(filterScene(), "f2", { expanded: undefined });
    expect("expanded" in cleared.nodes.find((n) => n.id === "f1")!.data).toBe(false);
  });

  test("total: an unknown node is a no-op, same object", () => {
    const scene = filterScene();
    expect(setDefinitionData(scene, "ghost", { linked: {} })).toBe(scene);
  });
});

/* ------------------------------------------------------------------ */
/* unlinkOccurrence / duplicateNodeUnlinked — donor 602-671            */
/* ------------------------------------------------------------------ */

describe("unlinkOccurrence", () => {
  test("breaks one occurrence out under a collision-free NUMBERED name, keeping its content", () => {
    const scene = filterScene();
    const out = unlinkOccurrence(scene, "f2", minter());
    const freed = out.nodes.find((n) => n.id === "f2")!;
    expect(freed.data.name).toBe("filter_1");
    expect(freed.definitionId).toBe("m1");
    expect(freed.data.linked).toEqual(FILTER_CONTENT);
    expect(out.nodes.find((n) => n.id === "f1")).toBe(scene.nodes[0]);
    expect(out.edges).toBe(scene.edges); // node ids are stable, so no edge notices
  });

  test("numbering counts up past occupied names, and `()` titles keep their call parens", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "mix" }, { definitionId: "g" }),
        node("b", { name: "mix" }, { definitionId: "g" }),
        node("taken", { name: "mix_1" }, { definitionId: "g-taken" }),
        node("r1", { name: "run()" }, { definitionId: "g-run" }),
        node("r2", { name: "run()" }, { definitionId: "g-run" }),
      ],
      edges: [],
    };
    expect(unlinkOccurrence(scene, "b", minter()).nodes.find((n) => n.id === "b")!.data.name).toBe("mix_2");
    expect(unlinkOccurrence(scene, "r2", minter()).nodes.find((n) => n.id === "r2")!.data.name).toBe("run_1()");
  });

  test("unlinking a draft clears its ordinal — the new name has no queue to sit in", () => {
    const scene: Scene = {
      nodes: [
        node("canon", { name: "filter", linked: { gain: 3 } }, { definitionId: "g-canon" }),
        node("d1", { name: "filter", linked: { gain: 7 }, draftOrdinal: 1 }, { definitionId: "g-d1" }),
      ],
      edges: [],
    };
    const freed = unlinkOccurrence(scene, "d1", minter()).nodes.find((n) => n.id === "d1")!;
    expect(freed.data.name).toBe("filter_1");
    expect(freed.data.draftOrdinal).toBeUndefined();
  });
});

describe("duplicateNodeUnlinked", () => {
  test("a verbatim copy that immediately unlinks — fresh id, fresh group, numbered name", () => {
    const scene = filterScene();
    const out = duplicateNodeUnlinked(scene, "f1", minter());
    expect(out.nodes).toHaveLength(4);
    const copy = out.nodes[3];
    expect(copy.id).toBe("m1");
    expect(copy.definitionId).toBe("m2");
    expect(copy.data.name).toBe("filter_1");
    expect(copy.data.linked).toEqual(FILTER_CONTENT);
    expect(copy.position).toEqual(scene.nodes[0].position); // the CALLER offsets ghosts (deviation #9)
    expect(out.nodes.find((n) => n.id === "f1")).toBe(scene.nodes[0]);
  });
});

/* ------------------------------------------------------------------ */
/* deleteNode — the edge policy and the definition consequences        */
/* ------------------------------------------------------------------ */

describe("deleteNode", () => {
  test("L5 `drop`: attached edges are gone, survivors are untouched, and nothing dangles", () => {
    const scene = filterScene();
    const out = deleteNode(scene, "f1", "drop");
    expect(out.nodes.map((n) => n.id)).toEqual(["f2", "sink"]);
    expect(out.nodes.find((n) => n.id === "f2")).toBe(scene.nodes[1]);
    expect(out.nodes.find((n) => n.id === "sink")).toBe(scene.nodes[2]);
    expect(out.edges).toEqual([]);
    expect(findDanglingEdges(out)).toEqual([]);
  });

  test("L5 `dangle`: edges survive untouched, and findDanglingEdges names exactly them by id", () => {
    const scene = filterScene();
    const out = deleteNode(scene, "f1", "dangle");
    expect(out.edges).toBe(scene.edges);
    expect(findDanglingEdges(out)).toEqual([
      { edgeId: "e1", end: "source", nodeId: "f1", portId: "out", reason: "missing-node" },
    ]);
  });

  test("`park`: the dead end is stamped so a lint can tell deliberate from broken", () => {
    const scene = filterScene();
    const out = deleteNode(scene, "f1", "park");
    const parked = out.edges.find((e) => e.id === "e1")!;
    expect(parkedEnds(parked)).toEqual(["source"]);
    // Still DANGLING — parked is a fact about intent, not resolution…
    expect(findDanglingEdges(out).map((d) => d.edgeId)).toEqual(["e1"]);
    // …so "document error" is precisely dangling-and-not-parked.
    const broken = findDanglingEdges(out).filter((d) => !parkedEnds(out.edges.find((e) => e.id === d.edgeId)!).includes(d.end));
    expect(broken).toEqual([]);
  });

  test("`park` stamps BOTH ends of an interior edge — undo wants it back whole", () => {
    const scene: Scene = {
      nodes: [node("parent", { name: "box" }), node("kid", {}, { parentId: "parent" })],
      edges: [{ id: "e", source: "parent", sourceHandle: "out", target: "kid", targetHandle: "in" }],
    };
    const out = deleteNode(scene, "parent", "park");
    expect(out.nodes).toEqual([]);
    expect(parkedEnds(out.edges[0])).toEqual(["source", "target"]);
  });

  test("the cascade is containment-deep: members and their members die with the parent", () => {
    const scene: Scene = {
      nodes: [node("root", { name: "box" }), node("kid", {}, { parentId: "root" }), node("grandkid", {}, { parentId: "kid" }), node("bystander", {})],
      edges: [],
    };
    expect(deleteNode(scene, "root", "drop").nodes.map((n) => n.id)).toEqual(["bystander"]);
  });

  test("deleting one occurrence leaves the definition alive in the others — nothing about them changed", () => {
    const scene = filterScene();
    const out = deleteNode(scene, "f2", "drop");
    const survivor = out.nodes.find((n) => n.id === "f1")!;
    expect(survivor).toBe(scene.nodes[0]);
    expect(definitionOccurrences(out, "f1").map((n) => n.id)).toEqual(["f1"]);
  });

  test("deleting the LAST occurrence of the canonical FIFO-promotes the oldest draft", () => {
    const scene: Scene = {
      nodes: [
        node("canon", { name: "filter", linked: { gain: 3 } }, { definitionId: "g-canon" }),
        node("d1", { name: "filter", linked: { gain: 7 }, draftOrdinal: 1 }, { definitionId: "g-d1" }),
        node("d3", { name: "filter", linked: { gain: 9 }, draftOrdinal: 3 }, { definitionId: "g-d3" }),
      ],
      edges: [],
    };
    const out = deleteNode(scene, "canon", "drop");
    expect(out.nodes.find((n) => n.id === "d1")!.data.draftOrdinal).toBeUndefined(); // Draft 1 → canonical
    expect(out.nodes.find((n) => n.id === "d3")!.data.draftOrdinal).toBe(3); // never renumbered backward
  });

  test("total: deleting an unknown node returns the SAME scene object", () => {
    const scene = filterScene();
    expect(deleteNode(scene, "ghost", "drop")).toBe(scene);
  });
});

/* ------------------------------------------------------------------ */
/* reconcileDefinitions — donor 518-600                                */
/* ------------------------------------------------------------------ */

describe("reconcileDefinitions", () => {
  test("a scene already holding the invariant comes back as the same object", () => {
    const scene = filterScene();
    expect(reconcileDefinitions(scene)).toBe(scene);
    expect(reconcileDefinitions(scene, minter())).toBe(scene);
  });

  test("id-less nodes each get their OWN minted group — and are honestly skipped without a mint", () => {
    const scene: Scene = { nodes: [node("a", { name: "" }), node("b", { name: "" })], edges: [] };
    const out = reconcileDefinitions(scene, minter());
    const [a, b] = out.nodes;
    expect(a.definitionId).toBe("m1");
    expect(b.definitionId).toBe("m2"); // empty names bind nothing
    expect(reconcileDefinitions(scene)).toBe(scene); // no mint, no invented ids (D9)
  });

  test("same name + same content across groups MERGES — duplicate-then-reconcile links them", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "amp", linked: { gain: 2 } }, { definitionId: "g-a" }),
        node("b", { name: "amp", linked: { gain: 2 } }, { definitionId: "g-b" }),
      ],
      edges: [],
    };
    const out = reconcileDefinitions(scene);
    expect(out.nodes[1].definitionId).toBe("g-a");
    expect(definitionOccurrences(out, "a").map((n) => n.id)).toEqual(["a", "b"]);
  });

  test("same name + different content drafts the later group (scene order decides who was first)", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "amp", linked: { gain: 2 } }, { definitionId: "g-a" }),
        node("b", { name: "amp", linked: { gain: 5 } }, { definitionId: "g-b" }),
      ],
      edges: [],
    };
    const out = reconcileDefinitions(scene);
    expect(out.nodes[0].data.draftOrdinal).toBeUndefined();
    expect(out.nodes[1].data.draftOrdinal).toBe(1);
  });

  test("a colliding ordinal pair renumbers BOTH from the lowest free numbers — the donor's stale-list rule, exactly", () => {
    const scene: Scene = {
      nodes: [
        node("canon", { name: "amp", linked: { gain: 1 } }, { definitionId: "g-c" }),
        node("x", { name: "amp", linked: { gain: 2 }, draftOrdinal: 2 }, { definitionId: "g-x" }),
        node("y", { name: "amp", linked: { gain: 3 }, draftOrdinal: 2 }, { definitionId: "g-y" }),
      ],
      edges: [],
    };
    const out = reconcileDefinitions(scene);
    expect(out.nodes.find((n) => n.id === "x")!.data.draftOrdinal).toBe(1); // donor 568-574
    expect(out.nodes.find((n) => n.id === "y")!.data.draftOrdinal).toBe(3);
  });

  test("no canonical → the lowest ordinal is promoted (FIFO), the rest keep their numbers", () => {
    const scene: Scene = {
      nodes: [
        node("d2", { name: "amp", linked: { gain: 2 }, draftOrdinal: 2 }, { definitionId: "g-2" }),
        node("d5", { name: "amp", linked: { gain: 5 }, draftOrdinal: 5 }, { definitionId: "g-5" }),
      ],
      edges: [],
    };
    const out = reconcileDefinitions(scene);
    expect(out.nodes.find((n) => n.id === "d2")!.data.draftOrdinal).toBeUndefined();
    expect(out.nodes.find((n) => n.id === "d5")!.data.draftOrdinal).toBe(5);
  });

  test("authored drift WITHIN a group converges to the first occurrence — free keys surviving", () => {
    const scene: Scene = {
      nodes: [
        node("a", { name: "amp", linked: { gain: 2 }, appearance: { accent: "blue" } }, { definitionId: "g" }),
        node("b", { name: "amp", linked: { gain: 99 }, appearance: { accent: "red" } }, { definitionId: "g" }),
      ],
      edges: [],
    };
    const out = reconcileDefinitions(scene);
    expect(out.nodes[1].data.linked).toEqual({ gain: 2 }); // first in scene order wins (donor 588-600)
    expect(out.nodes[1].data.appearance).toEqual({ accent: "red" }); // free keys are nobody's business
    expect(out.nodes[0]).toBe(scene.nodes[0]);
  });
});
