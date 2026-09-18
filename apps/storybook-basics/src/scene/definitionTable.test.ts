// src/scene/definitionTable.test.ts — card 13's two laws (L1, L2), the
// conflict report, and `instantiate`'s reference-only occurrence. Run in
// the node project: `pnpm exec vitest --project=unit run`.
import { describe, expect, test } from "vitest";

import { applyDefinitions, type DefinitionTable, instantiate, projectDefinitions } from "./definitionTable";
import { type OccurrenceData, reconcileDefinitions } from "./linking";
import type { BlockScene, SceneNode } from "./scene";

/* ------------------------------------------------------------------ */
/* Fixtures — same shape as linking.test.ts's                          */
/* ------------------------------------------------------------------ */

type Scene = BlockScene<OccurrenceData>;

function node(id: string, data: OccurrenceData = {}, extra: Partial<SceneNode<OccurrenceData>> = {}): SceneNode<OccurrenceData> {
  return { id, position: { x: 0, y: 0 }, data, ...extra };
}

const FILTER_CONTENT = { ports: { left: ["in"], right: ["out"] }, gain: 3 };
const FILTER_EXPANDED = { fill: "oklch(0.95 0.03 250)" };

/** Two agreeing occurrences of `filter`, one independent `sink` — already
 *  reconciled: every occurrence in a group shares content, name and
 *  draftOrdinal, so `reconcileDefinitions` has nothing left to fix. */
function conflictFreeScene(): Scene {
  return {
    nodes: [
      node(
        "f1",
        { name: "filter", linked: structuredClone(FILTER_CONTENT), expanded: structuredClone(FILTER_EXPANDED), appearance: { accent: "blue" } },
        { definitionId: "g-filter" },
      ),
      node(
        "f2",
        { name: "filter", linked: structuredClone(FILTER_CONTENT), expanded: structuredClone(FILTER_EXPANDED), appearance: { accent: "red" } },
        { definitionId: "g-filter" },
      ),
      node("sink", { name: "sink", linked: { ports: { left: ["in"] } } }, { definitionId: "g-sink" }),
      node("solo", { name: "solo" }),
    ],
    edges: [{ id: "e1", source: "f1", sourceHandle: "out", target: "sink", targetHandle: "in" }],
  };
}

/** Same group, but `f2`'s `linked` has drifted from `f1`'s — the exact
 *  fork `reconcileDefinitions` would silently converge away. */
function conflictingScene(): Scene {
  const scene = conflictFreeScene();
  const f2 = scene.nodes.find((n) => n.id === "f2")!;
  return {
    ...scene,
    nodes: scene.nodes.map((n) =>
      n.id === f2.id ? { ...n, data: { ...n.data, linked: { ...FILTER_CONTENT, gain: 9 } } } : n,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* L1 — the table is a representation of what reconcile already does   */
/* ------------------------------------------------------------------ */

describe("L1 — applyDefinitions(scene, projectDefinitions(scene).table) === reconcileDefinitions(scene)", () => {
  test("holds for a conflict-free scene", () => {
    const scene = conflictFreeScene();
    const { table, conflicts } = projectDefinitions(scene);
    expect(conflicts).toEqual([]);
    expect(applyDefinitions(scene, table)).toEqual(reconcileDefinitions(scene));
  });

  test("reconcileDefinitions is genuinely a no-op on this fixture (the law is not vacuous)", () => {
    const scene = conflictFreeScene();
    expect(reconcileDefinitions(scene)).toEqual(scene);
  });
});

/* ------------------------------------------------------------------ */
/* L2 — round trip, restricted to ids present, array order included    */
/* ------------------------------------------------------------------ */

describe("L2 — projectDefinitions(applyDefinitions(scene, table)).table === table (restricted to present ids)", () => {
  test("round-trips a table built from the scene itself", () => {
    const scene = conflictFreeScene();
    const { table } = projectDefinitions(scene);
    const roundTripped = projectDefinitions(applyDefinitions(scene, table)).table;
    expect(roundTripped).toEqual(table);
  });

  test("array order inside a facet survives the round trip", () => {
    const scene = conflictFreeScene();
    const { table } = projectDefinitions(scene);
    // ports.left/.right are arrays — reverse-checking order, not just membership.
    expect(table.definitions["g-filter"]!.linked!["ports"]).toEqual({ left: ["in"], right: ["out"] });
    const roundTripped = projectDefinitions(applyDefinitions(scene, table)).table;
    expect(roundTripped.definitions["g-filter"]!.linked!["ports"]).toEqual({ left: ["in"], right: ["out"] });
  });

  test("a record for a definitionId absent from the scene is dropped by the restriction", () => {
    const scene = conflictFreeScene();
    const { table } = projectDefinitions(scene);
    const withPhantom: DefinitionTable = {
      definitions: { ...table.definitions, "g-ghost": { id: "g-ghost", name: "ghost" } },
    };
    // Nothing in `scene` names "g-ghost", so applying it changes nothing,
    // and projecting the (unchanged) result never manufactures the id.
    const applied = applyDefinitions(scene, withPhantom);
    expect(applied).toEqual(scene);
    const reprojected = projectDefinitions(applied).table;
    expect(reprojected.definitions["g-ghost"]).toBeUndefined();
    expect(reprojected).toEqual(table);
  });
});

/* ------------------------------------------------------------------ */
/* Conflicts — reported, never silently resolved                       */
/* ------------------------------------------------------------------ */

describe("projectDefinitions — conflicts", () => {
  test("two occurrences disagreeing on content signature are reported, not silently picked", () => {
    const scene = conflictingScene();
    const { table, conflicts } = projectDefinitions(scene);
    expect(conflicts).toEqual([{ definitionId: "g-filter", nodeIds: ["f1", "f2"] }]);
    // The record still holds a value (the first occurrence's) — reported,
    // not left blank — but the conflicts array is what makes the fork
    // discoverable rather than silently thrown away.
    expect(table.definitions["g-filter"]!.linked).toEqual(FILTER_CONTENT);
  });

  test("name/draftOrdinal disagreement alone is NOT a conflict — only definitionContentSignature is", () => {
    const scene = conflictFreeScene();
    const drifted: Scene = {
      ...scene,
      nodes: scene.nodes.map((n) => (n.id === "f2" ? { ...n, data: { ...n.data, draftOrdinal: 3 } } : n)),
    };
    const { conflicts } = projectDefinitions(drifted);
    expect(conflicts).toEqual([]);
  });

  test("a node with no definitionId contributes no record at all", () => {
    const { table } = projectDefinitions(conflictFreeScene());
    expect(Object.keys(table.definitions).sort()).toEqual(["g-filter", "g-sink"]);
  });
});

/* ------------------------------------------------------------------ */
/* applyDefinitions — unknown means untouched                          */
/* ------------------------------------------------------------------ */

describe("applyDefinitions", () => {
  test("an empty table is a no-op over any scene", () => {
    const scene = conflictFreeScene();
    expect(applyDefinitions(scene, { definitions: {} })).toEqual(scene);
  });

  test("a node whose definitionId is absent from the table is left byte-for-byte untouched", () => {
    const scene = conflictFreeScene();
    const partial: DefinitionTable = { definitions: { "g-sink": { id: "g-sink", name: "sink", linked: { ports: { left: ["in"] } } } } };
    const applied = applyDefinitions(scene, partial);
    const f1 = applied.nodes.find((n) => n.id === "f1")!;
    const original = scene.nodes.find((n) => n.id === "f1")!;
    expect(f1).toEqual(original);
    // solo has no definitionId at all — also untouched.
    expect(applied.nodes.find((n) => n.id === "solo")).toEqual(scene.nodes.find((n) => n.id === "solo"));
  });

  test("a facet absent from the record CLEARS that facet on every occurrence", () => {
    const scene = conflictFreeScene();
    const table: DefinitionTable = { definitions: { "g-filter": { id: "g-filter", name: "filter" } } };
    const applied = applyDefinitions(scene, table);
    for (const id of ["f1", "f2"]) {
      const applied_node = applied.nodes.find((n) => n.id === id)!;
      expect(applied_node.data.linked).toBeUndefined();
      expect(applied_node.data.expanded).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/* instantiate — a reference, never inlined content                    */
/* ------------------------------------------------------------------ */

describe("instantiate", () => {
  test("a new occurrence carries the definition's synced facets but mints no id itself", () => {
    const { table } = projectDefinitions(conflictFreeScene());
    const occurrence = instantiate(table, "g-filter", { id: "f3", position: { x: 10, y: 20 } });
    expect(occurrence).toEqual({
      id: "f3",
      position: { x: 10, y: 20 },
      definitionId: "g-filter",
      data: { name: "filter", linked: FILTER_CONTENT, expanded: FILTER_EXPANDED },
    });
  });

  test("an unknown definitionId still mints an occurrence, empty of synced facets", () => {
    const occurrence = instantiate({ definitions: {} }, "g-nonexistent", { id: "n1", position: { x: 0, y: 0 } });
    expect(occurrence).toEqual({ id: "n1", position: { x: 0, y: 0 }, definitionId: "g-nonexistent", data: {} });
  });

  test("parentId is carried when given, absent otherwise", () => {
    const withParent = instantiate({ definitions: {} }, "g", { id: "n1", position: { x: 0, y: 0 }, parentId: "box" });
    expect(withParent.parentId).toBe("box");
    const withoutParent = instantiate({ definitions: {} }, "g", { id: "n2", position: { x: 0, y: 0 } });
    expect("parentId" in withoutParent).toBe(false);
  });

  test("compile-time proof that `id` cannot be omitted", () => {
    // `@ts-expect-error` is itself a type error ("unused directive") if the
    // line below type-checks cleanly — so `pnpm typecheck` is what actually
    // proves this, not the runtime assertion, which exists only so the
    // call is not dead code an unused-var lint could flag.
    // @ts-expect-error — `id` is required, not minted by this module (D9).
    const withoutId = instantiate({ definitions: {} }, "g", { position: { x: 0, y: 0 } });
    expect(withoutId.id).toBeUndefined();
  });
});
