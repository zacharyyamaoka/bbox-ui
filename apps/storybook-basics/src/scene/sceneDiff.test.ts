// src/scene/sceneDiff.test.ts — the three-state scene comparison, tested in
// the node project (no DOM): `pnpm exec vitest --project=unit run`.
//
// Ours, not a donor port — `sceneDiff.ts` is RE-EXPRESSED from
// `compareModel.ts`, not copied, so there is no donor test file to port
// (see `sceneDiff.ts`'s own header for the citation).
import { describe, expect, it } from "vitest";

import type { BlockScene, SceneNode } from "./scene";
import { DIFF_STATE_DATA_KEY, diffScene, withoutDiffState } from "./sceneDiff";

type Data = { name?: string; note?: string };

function node(id: string, data: Data, x = 0, y = 0, extra: Partial<SceneNode<Data>> = {}): SceneNode<Data> {
  return { id, position: { x, y }, data, ...extra };
}

function scene(nodes: SceneNode<Data>[], edges: BlockScene<Data>["edges"] = []): BlockScene<Data> {
  return { nodes, edges };
}

describe("diffScene — nodes", () => {
  it("reports nothing for two identical scenes", () => {
    const a = scene([node("n1", { name: "Alpha" })]);
    const b = scene([node("n1", { name: "Alpha" })]);
    expect(diffScene(a, b)).toEqual({ nodes: [], edges: [], ports: [] });
  });

  it("matches by id: after-only is added, before-only is removed", () => {
    const before = scene([node("n1", { name: "Alpha" })]);
    const after = scene([node("n2", { name: "Beta" })]);
    const result = diffScene(before, after);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({ id: "n1", operation: "removed", fields: [] });
    expect(result.nodes[1]).toMatchObject({ id: "n2", operation: "added", fields: [] });
  });

  it("emits added/removed with empty fields — nothing to align against", () => {
    const before = scene([]);
    const after = scene([node("n1", { name: "Alpha" })]);
    const result = diffScene(before, after);
    expect(result.nodes[0].fields).toEqual([]);
    expect(result.nodes[0].before).toBeUndefined();
    expect(result.nodes[0].after?.data.name).toBe("Alpha");
  });

  it("marks a persisting node modified only when one of ITS OWN fields differs", () => {
    const before = scene([node("n1", { name: "Alpha" })]);
    const after = scene([node("n1", { name: "Beta" })]);
    const result = diffScene(before, after);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({ id: "n1", operation: "modified" });
    expect(result.nodes[0].fields).toEqual([{ path: "name", before: "Alpha", after: "Beta" }]);
  });

  it("emits NO row at all for a node that persists with no field difference", () => {
    // The three-state model's central discipline: an unchanged persisting
    // element earns no row, not a `modified` row with empty fields.
    const before = scene([node("n1", { name: "Alpha" }, 10, 20)]);
    const after = scene([node("n1", { name: "Alpha" }, 999, 999)]);
    // Position moved, but position is deliberately excluded from `fields`
    // (geometry is not a text diff) — so this counts as no change at all.
    expect(diffScene(before, after).nodes).toEqual([]);
  });

  it("diffs identity fields (type, parentId, definitionId) alongside data", () => {
    const before = scene([node("n1", { name: "Alpha" }, 0, 0, { parentId: "group-a" })]);
    const after = scene([node("n1", { name: "Alpha" }, 0, 0, { parentId: "group-b" })]);
    const result = diffScene(before, after);
    expect(result.nodes[0].fields).toEqual([{ path: "parentId", before: "group-a", after: "group-b" }]);
  });

  it("sorts multiple changed data keys deterministically", () => {
    const before = scene([node("n1", { name: "Alpha", note: "x" })]);
    const after = scene([node("n1", { name: "Beta", note: "y" })]);
    const result = diffScene(before, after);
    expect(result.nodes[0].fields.map((f) => f.path)).toEqual(["name", "note"]);
  });

  it("preserves scene order: before's order first, then after-only ids in after's order", () => {
    const before = scene([node("b", {}), node("a", {})]);
    const after = scene([node("b", {}), node("a", {}), node("z", {}), node("y", {})]);
    const result = diffScene(before, after);
    expect(result.nodes.map((n) => n.id)).toEqual(["z", "y"]);
  });
});

describe("diffScene — edges", () => {
  it("treats a rewiring (source/target/handle change) as an ordinary field, not a coordinate", () => {
    const before = scene([node("a", {}), node("b", {}), node("c", {})], [
      { id: "e1", source: "a", target: "b" },
    ]);
    const after = scene([node("a", {}), node("b", {}), node("c", {})], [
      { id: "e1", source: "a", target: "c" },
    ]);
    const result = diffScene(before, after);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ id: "e1", operation: "modified" });
    expect(result.edges[0].fields).toEqual([{ path: "target", before: "b", after: "c" }]);
  });

  it("matches edges by id, independent of node changes", () => {
    const before = scene([node("a", {}), node("b", {})], [{ id: "e1", source: "a", target: "b" }]);
    const after = scene([node("a", {}), node("b", {})], []);
    const result = diffScene(before, after);
    expect(result.edges).toEqual([
      { id: "e1", operation: "removed", before: before.edges[0], fields: [] },
    ]);
  });
});

describe("diffScene — ports", () => {
  const portsOf = (vocabulary: Record<string, readonly string[]>) => (nodeId: string) => vocabulary[nodeId];

  it("without a portsOf resolver, produces no port rows at all", () => {
    const before = scene([node("n1", {})]);
    const after = scene([node("n1", {})]);
    expect(diffScene(before, after).ports).toEqual([]);
  });

  it("reports a port gained by a persisting node as `added`, not a node modification", () => {
    const before = scene([node("n1", { name: "Alpha" })]);
    const after = scene([node("n1", { name: "Alpha" })]);
    const result = diffScene(before, after, {
      before: portsOf({ n1: ["in"] }),
      after: portsOf({ n1: ["in", "out"] }),
    });
    // The node itself did not change (same name, same everything else) —
    // it must not get a `modified` row just because a port appeared.
    expect(result.nodes).toEqual([]);
    expect(result.ports).toEqual([{ nodeId: "n1", portId: "out", operation: "added" }]);
  });

  it("reports a lost port as `removed`", () => {
    const before = scene([node("n1", {})]);
    const after = scene([node("n1", {})]);
    const result = diffScene(before, after, {
      before: portsOf({ n1: ["in", "out"] }),
      after: portsOf({ n1: ["in"] }),
    });
    expect(result.ports).toEqual([{ nodeId: "n1", portId: "out", operation: "removed" }]);
  });

  it("emits no port rows for a node that itself was added or removed", () => {
    // The node's own added/removed row already covers everything under it;
    // a port row would repeat the fact, not add one.
    const before = scene([]);
    const after = scene([node("n1", {})]);
    const result = diffScene(before, after, {
      before: portsOf({}),
      after: portsOf({ n1: ["in"] }),
    });
    expect(result.ports).toEqual([]);
    expect(result.nodes).toEqual([{ id: "n1", operation: "added", after: after.nodes[0], fields: [] }]);
  });

  it("an unresolved vocabulary (undefined) on one side is treated as empty, not a crash", () => {
    const before = scene([node("n1", {})]);
    const after = scene([node("n1", {})]);
    const result = diffScene(before, after, {
      before: () => undefined,
      after: portsOf({ n1: ["in"] }),
    });
    expect(result.ports).toEqual([{ nodeId: "n1", portId: "in", operation: "added" }]);
  });
});

describe("withoutDiffState", () => {
  it("removes the convention key from every node and edge, whole-document", () => {
    const marked: BlockScene<Data> = {
      nodes: [node("n1", { name: "Alpha", [DIFF_STATE_DATA_KEY]: "added" } as Data)],
      edges: [{ id: "e1", source: "n1", target: "n1", data: { [DIFF_STATE_DATA_KEY]: "removed" } as Data }],
    };
    const cleared = withoutDiffState(marked);
    expect(cleared.nodes[0].data).not.toHaveProperty(DIFF_STATE_DATA_KEY);
    expect(cleared.nodes[0].data.name).toBe("Alpha");
    expect(cleared.edges[0].data).not.toHaveProperty(DIFF_STATE_DATA_KEY);
  });

  it("is a no-op — not merely idempotent, referentially inert on data — when nothing is marked", () => {
    const clean = scene([node("n1", { name: "Alpha" })]);
    const cleared = withoutDiffState(clean);
    expect(cleared.nodes[0].data).toEqual({ name: "Alpha" });
  });

  it("leaves edges with no data at all untouched", () => {
    const noData: BlockScene<Data> = { nodes: [], edges: [{ id: "e1", source: "a", target: "b" }] };
    expect(withoutDiffState(noData).edges[0].data).toBeUndefined();
  });
});
