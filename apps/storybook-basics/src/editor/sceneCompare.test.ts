// src/editor/sceneCompare.test.ts — the bridge's own rules, the ones the
// story cannot show because they are about what is ABSENT from the surface.
import { describe, expect, it } from "vitest";

import { compareScenes, compareTally, subjectOfNode } from "./sceneCompare";
import type { BlockScene } from "../scene/scene";
import type { ScenePortsOf } from "../scene/sceneDiff";

type Data = { name?: string; ports?: Record<string, string[]> };

const scene = (nodes: BlockScene<Data>["nodes"], edges: BlockScene<Data>["edges"] = []): BlockScene<Data> => ({ nodes, edges });

const block = (id: string, name: string, ports: Record<string, string[]> = {}) => ({
  id,
  type: "block",
  position: { x: 0, y: 0 },
  data: { name, ports },
});

function portsOf(before: BlockScene<Data>, after: BlockScene<Data>): ScenePortsOf {
  const read = (target: BlockScene<Data>) => (nodeId: string) =>
    Object.values(target.nodes.find((node) => node.id === nodeId)?.data.ports ?? {}).flat();
  return { before: read(before), after: read(after) };
}

describe("compareScenes — two identical scenes", () => {
  it("produces no rows and a zeroed tally, not a row per unchanged element", () => {
    const only = scene([block("a", "alpha")]);
    const comparison = compareScenes(only, only);
    expect(comparison.changes).toEqual([]);
    expect(comparison.total).toBe(0);
    expect(compareTally(comparison, "added")).toBe(0);
    expect(compareTally(comparison, "modified")).toBe(0);
  });
});

describe("compareScenes — naming", () => {
  it("names a node by what it is called NOW, so a rename reads forward", () => {
    const comparison = compareScenes(scene([block("a", "reader")]), scene([block("a", "ingest")]));
    expect(comparison.changes).toHaveLength(1);
    expect(comparison.changes[0].element).toBe("ingest");
    expect(comparison.changes[0].fields).toEqual([{ path: "name", before: "reader", after: "ingest" }]);
  });

  it("falls back to the id when a scene names nothing", () => {
    const bare = { id: "n1", type: "block", position: { x: 0, y: 0 }, data: {} };
    const comparison = compareScenes(scene([]), scene([bare]));
    expect(comparison.changes[0].name).toBe("n1");
  });

  it("names an edge by its two ends, never by its wire id", () => {
    const before = scene([block("a", "reader"), block("b", "sink"), block("c", "store")], [
      { id: "w", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
    ]);
    const after = scene([block("a", "reader"), block("b", "sink"), block("c", "store")], [
      { id: "w", source: "a", sourceHandle: "out", target: "c", targetHandle: "in" },
    ]);
    const comparison = compareScenes(before, after);
    expect(comparison.changes.map((change) => change.name)).toEqual(["reader → store"]);
    expect(comparison.changes[0].subject).toBe("cable");
  });

  it("prefixes a port row with its element, which is how propertyRows reads it back", () => {
    const before = scene([block("a", "filter", { left: ["in"] })]);
    const after = scene([block("a", "filter", { left: ["in", "cfg"] })]);
    const comparison = compareScenes(before, after, {
      portsOf: portsOf(before, after),
      omitNodeFields: ["ports"],
    });
    const port = comparison.changes.find((change) => change.subject === "port")!;
    expect(port.name).toBe("filter.cfg");
    expect(port.element).toBe("filter");
    expect(port.portId).toBe("cfg");
    expect(port.fields).toEqual([]);
  });
});

describe("compareScenes — omitNodeFields", () => {
  const before = scene([block("a", "filter", { left: ["in"] })]);
  const after = scene([block("a", "filter", { left: ["in", "cfg"] })]);

  it("reports the port insertion ONCE when the host names its port key", () => {
    const comparison = compareScenes(before, after, { portsOf: portsOf(before, after), omitNodeFields: ["ports"] });
    expect(comparison.changes.map((change) => change.id)).toEqual(["port:a:cfg"]);
    expect(comparison.total).toBe(1);
  });

  it("reports it TWICE without the option — which is why the option exists", () => {
    const comparison = compareScenes(before, after, { portsOf: portsOf(before, after) });
    expect(comparison.changes.map((change) => change.id)).toEqual(["node:a", "port:a:cfg"]);
  });

  it("keeps a node row when a NON-omitted field also differs", () => {
    const renamed = scene([block("a", "sieve", { left: ["in", "cfg"] })]);
    const comparison = compareScenes(before, renamed, { portsOf: portsOf(before, renamed), omitNodeFields: ["ports"] });
    const node = comparison.changes.find((change) => change.id === "node:a")!;
    expect(node.fields.map((field) => field.path)).toEqual(["name"]);
  });
});

describe("compareScenes — anchors and subjects", () => {
  it("anchors a removed node on the before side only, and an added one on the after side only", () => {
    const comparison = compareScenes(scene([block("gone", "sink")]), scene([block("new", "store")]));
    const removed = comparison.changes.find((change) => change.kind === "removed")!;
    const added = comparison.changes.find((change) => change.kind === "added")!;
    expect([removed.anchorBefore, removed.anchorAfter]).toEqual(["gone", null]);
    expect([added.anchorBefore, added.anchorAfter]).toEqual([null, "new"]);
  });

  it("calls only a block a block; every other node type is the kit's catch-all", () => {
    expect(subjectOfNode({ id: "a", type: "block", position: { x: 0, y: 0 }, data: {} })).toBe("block");
    expect(subjectOfNode({ id: "a", type: "region", position: { x: 0, y: 0 }, data: {} })).toBe("shape");
    // A STANDALONE port shape owns itself, so it is not a "port" row — a
    // "port" in this vocabulary is a port OF something.
    expect(subjectOfNode({ id: "a", type: "port", position: { x: 0, y: 0 }, data: {} })).toBe("shape");
  });

  it("hangs a port row under its node's row only when that row exists", () => {
    const before = scene([block("a", "filter", { left: ["in"] })]);
    const renamed = scene([block("a", "sieve", { left: ["in", "cfg"] })]);
    const withNodeRow = compareScenes(before, renamed, { portsOf: portsOf(before, renamed), omitNodeFields: ["ports"] });
    expect(withNodeRow.changes.find((change) => change.subject === "port")!.parentId).toBe("node:a");

    const after = scene([block("a", "filter", { left: ["in", "cfg"] })]);
    const withoutNodeRow = compareScenes(before, after, { portsOf: portsOf(before, after), omitNodeFields: ["ports"] });
    expect(withoutNodeRow.changes.find((change) => change.subject === "port")!.parentId).toBeNull();
  });
});
