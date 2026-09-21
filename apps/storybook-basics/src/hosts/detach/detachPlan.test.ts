/**
 * src/hosts/detach/detachPlan.test.ts — the ordering rule, tested with no editor
 * at all (the donor's own reason `planDetach`/`orderNodes` are kept pure —
 * see `./detachPlan.ts`'s header).
 */
import { describe, expect, it } from "vitest";
import type { TLShape, TLShapeId } from "tldraw";

import type { HostScene } from "../hostScene";
import type { DetachableKind } from "./detachableKind";
import { orderNodes, planDetach, type PlanReader } from "./detachPlan";

function fakeShape(id: string, type = "bbox-node"): TLShape {
  return { id, type } as unknown as TLShape;
}

function stubKind(kind: string, phase: "leaf" | "container", matchIds: Set<string>): DetachableKind {
  return {
    kind,
    nodePhase: phase,
    matches: (shape) => matchIds.has(shape.id as string),
    lowerNode: () => null,
  };
}

function stubReader(shapes: Record<string, TLShape>, children: Record<string, string[]>): PlanReader {
  return {
    getShape: (id) => shapes[id as string],
    getSortedChildIdsForParent: (id) => (children[id as string] ?? []) as TLShapeId[],
  };
}

const emptyScene: HostScene = { nodes: [], edges: [] };

describe("planDetach / orderNodes", () => {
  it("walks down from requested ids into unmatched containers (a stock group's members)", () => {
    const a = fakeShape("a", "bbox-node");
    const b = fakeShape("b", "bbox-node");
    const group = fakeShape("g", "group");
    const shapes = { g: group, a, b };
    const reader = stubReader(shapes, { g: ["a", "b"] });
    const kind = stubKind("block", "leaf", new Set(["a", "b"]));

    const plan = planDetach(reader, { scene: emptyScene }, ["g" as TLShapeId], [kind]);
    expect(plan.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("de-duplicates a shape reachable by two paths", () => {
    const a = fakeShape("a");
    const reader = stubReader({ a }, {});
    const kind = stubKind("block", "leaf", new Set(["a"]));
    const plan = planDetach(reader, { scene: emptyScene }, ["a" as TLShapeId, "a" as TLShapeId], [kind]);
    expect(plan).toHaveLength(1);
  });

  it("orders leaf kinds before container kinds, stable within a rank", () => {
    const leafKind = stubKind("leaf-kind", "leaf", new Set(["c1", "c2"]));
    const containerKind = stubKind("container-kind", "container", new Set(["b1"]));
    const participants = [
      { id: "b1" as TLShapeId, kind: containerKind },
      { id: "c1" as TLShapeId, kind: leafKind },
      { id: "c2" as TLShapeId, kind: leafKind },
    ];
    const ordered = orderNodes(participants);
    expect(ordered.map((p) => p.id)).toEqual(["c1", "c2", "b1"]);
  });

  it("an unmatched shape with no detectable descendants contributes nothing", () => {
    const stray = fakeShape("stray", "geo");
    const reader = stubReader({ stray }, {});
    const kind = stubKind("block", "leaf", new Set());
    const plan = planDetach(reader, { scene: emptyScene }, ["stray" as TLShapeId], [kind]);
    expect(plan).toHaveLength(0);
  });
});
