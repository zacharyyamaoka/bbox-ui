/**
 * The ordering rules, unit-tested against synthetic kinds with no editor at
 * all — the reason planning is pure.
 */
import { describe, expect, it } from "vitest";
import type { TLShape, TLShapeId } from "tldraw";

import type { DetachableKind } from "../src/detach/detachableKind";
import { orderNodes, planDetach, type PlanReader } from "../src/detach/detachPlan";

function shape(id: string, type: string): TLShape {
  return { id: id as TLShapeId, type } as TLShape;
}

/** A stub board: shapes by id, children by parent id. */
function board(
  shapes: TLShape[],
  children: Record<string, string[]> = {},
): PlanReader {
  const byId = new Map(shapes.map((entry) => [entry.id, entry]));
  return {
    getShape: (id) => byId.get(id),
    getSortedChildIdsForParent: (id) =>
      (children[id as string] ?? []) as TLShapeId[],
  };
}

function syntheticKind(
  type: string,
  nodePhase: "leaf" | "container",
  extra: Partial<DetachableKind> = {},
): DetachableKind {
  return {
    kind: type,
    nodePhase,
    matches: (candidate) => candidate.type === type,
    lowerNode: () => null,
    ...extra,
  };
}

const leaf = syntheticKind("leaf-kind", "leaf");
const container = syntheticKind("container-kind", "container");

describe("planDetach", () => {
  it("orders every leaf before any container, whatever the request order", () => {
    const reader = board([
      shape("shape:c1", "container-kind"),
      shape("shape:l1", "leaf-kind"),
      shape("shape:l2", "leaf-kind"),
    ]);
    const plan = planDetach(
      reader,
      ["shape:c1", "shape:l1", "shape:l2"] as TLShapeId[],
      [leaf, container],
    );
    expect(plan.map((p) => p.kind.nodePhase)).toEqual(["leaf", "leaf", "container"]);
  });

  it("finds participants inside an unmatched wrapper (a stock group)", () => {
    const reader = board(
      [
        shape("shape:group", "group"),
        shape("shape:l1", "leaf-kind"),
        shape("shape:c1", "container-kind"),
      ],
      { "shape:group": ["shape:c1", "shape:l1"] },
    );
    const plan = planDetach(reader, ["shape:group"] as TLShapeId[], [leaf, container]);
    expect(plan.map((p) => p.id)).toEqual(["shape:l1", "shape:c1"]);
  });

  it("a container discovered before its leaf children still lowers after them", () => {
    const reader = board(
      [shape("shape:c1", "container-kind"), shape("shape:l1", "leaf-kind")],
      { "shape:c1": ["shape:l1"] },
    );
    const plan = planDetach(reader, ["shape:c1"] as TLShapeId[], [leaf, container]);
    expect(plan.map((p) => p.id)).toEqual(["shape:l1", "shape:c1"]);
  });

  it("does not descend below a kind that declares discoversChildren: false", () => {
    const opaque = syntheticKind("opaque-kind", "container", {
      discoversChildren: false,
    });
    const reader = board(
      [shape("shape:o1", "opaque-kind"), shape("shape:l1", "leaf-kind")],
      { "shape:o1": ["shape:l1"] },
    );
    const plan = planDetach(reader, ["shape:o1"] as TLShapeId[], [leaf, opaque]);
    expect(plan.map((p) => p.id)).toEqual(["shape:o1"]);
  });

  it("enters each shape at most once, however many paths reach it", () => {
    const reader = board(
      [shape("shape:group", "group"), shape("shape:l1", "leaf-kind")],
      { "shape:group": ["shape:l1"] },
    );
    const plan = planDetach(
      reader,
      ["shape:l1", "shape:group"] as TLShapeId[],
      [leaf],
    );
    expect(plan.map((p) => p.id)).toEqual(["shape:l1"]);
  });

  it("orderNodes keeps discovery order within a rank (stable sort)", () => {
    const participants = ["a", "b", "c"].map((id) => ({
      id: `shape:${id}` as TLShapeId,
      kind: leaf,
    }));
    expect(orderNodes(participants).map((p) => p.id)).toEqual([
      "shape:a",
      "shape:b",
      "shape:c",
    ]);
  });
});
