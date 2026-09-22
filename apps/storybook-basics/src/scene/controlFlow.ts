// src/scene/controlFlow.ts — the control-flow vocabulary over `BlockScene`:
// ARMS as a node kind, and the three queries a Region's renderer and its
// opaque view need. CONTRACT STUB — docs/CONTROL-FLOW-PLAN.md, lane A.
//
// The signatures below are frozen by `controlFlow.test.ts` (an acceptance
// file committed BEFORE any builder existed; builders may not edit it).
// Bodies that `throw` are lane A's to write. `isArm` is real because it is
// the definition, not an implementation.
//
// ── WHY ARMS ARE NODES (Zach: "everything is a block") ──────────────────
// A branch's arm is a container in its own right: it has members, a fold
// state, a body height, and children whose `position` must be stable when
// a SIBLING arm folds. `SceneNode.position` is documented as "in the
// parent's coordinate space when `parentId` is set" (scene.ts:60-72), so
// the only way a child's authored position survives its sibling arm folding
// is for the ARM to be the parent. An `arm` node's own `position` is
// derived (arms stack under the corner block, `components/blockRegion.layout.ts`)
// and a host never reads it. The donor reached the same shape from the
// other direction: SystemSketch materialised one invisible frame shape per
// arm (`src/branch/branchArmFrames.ts:56-61`, "an idempotent projection,
// not a second arm model").
//
// pyblocks DIVERGES here, deliberately recorded: its P1 projection puts an
// If's children directly under `region:if` with no arm node
// (`docs/viewer-spike/specimen/expanded.blockview.json`, and
// `analyzer.py:1707-1708` defers "arm becomes its own nested region" to a
// phase 2). Stream 3's `to_systemsketch` mints arm nodes; see the plan's
// contract table.
//
// Pure: no React, no DOM, no canvas engine.

import { classifyBoundary } from "./boundary";
import { descendantsOf } from "./region";
import { childrenOf, type SceneData, type SceneNode } from "./scene";

/** `SceneNode.type` for an arm. One spelling, in one place — the same
 *  device as `REGION_NODE_TYPE`. */
export const ARM_NODE_TYPE = "arm";

/** Is this node an arm? Total — an absent `type` is a block-ish node. */
export function isArm(node: { type?: string }): boolean {
  return node.type === ARM_NODE_TYPE;
}

/** The DIRECT children of `regionId` that are arms, in scene order. A loop
 *  has none; a branch has one per `if`/`elif`/`else` or `case`. */
export function armsOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  regionId: string,
): SceneNode<N>[] {
  return childrenOf(scene, regionId).filter((node) => isArm(node));
}

/** The DIRECT children of `regionId` that are NOT arms — the region's own
 *  free body (a loop's blocks; a plain group's members). Scene order. */
export function bodyChildrenOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  regionId: string,
): SceneNode<N>[] {
  return childrenOf(scene, regionId).filter((node) => !isArm(node));
}

/** The nearest ARM ancestor of `nodeId`, or `undefined` (a loop member, a
 *  top-level node, the region itself, an unknown id). Walks `parentId`,
 *  cycle-safe — the same walk as `region.ts`'s `regionOf`. */
export function armOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): SceneNode<N> | undefined {
  // WHY this walk is copied in shape from `region.ts`'s `regionOf` (:165-180)
  // rather than generalised into a shared `nearestAncestorWhere`: the two
  // predicates are the only difference, and `regionOf` lives behind the scene
  // kit's own "no file edits" fence for this lane. One ported walk with the
  // same visited-set cycle guard is the honest cost; a shared helper is a
  // change to a frozen file, which is not.
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>([nodeId]);
  let parentId = byId.get(nodeId)?.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return undefined;
    if (isArm(parent)) return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

/**
 * What an opaque region hides — every clause MEASURED off the scene, never
 * narrated (the same discipline as pyblocks' `describeHidden`,
 * `vscode-pyblocks/src/viewer/adapter/collapse.ts:29`):
 *   nodes  every descendant that is not an arm (blocks of any type)
 *   arms   the region's direct arm children
 *   edges  edges the opaque card cannot show: `classifyBoundary`'s
 *          `interior` (both ends strictly inside) and `port-inner` (the
 *          region's own port to something inside — a loop's `Iter` cable)
 */
export interface HiddenSummary {
  nodes: number;
  arms: number;
  edges: number;
}

export function hiddenSummary<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[]; edges: readonly { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[] },
  regionId: string,
): HiddenSummary {
  // Descendants minus the region itself minus every arm: an arm is counted
  // in its own clause, and counting it twice would tell a person a branch
  // hides more blocks than it has. `descendantsOf` is already total on an
  // unknown id (its `known.has` filter drops the seed), which is where
  // "unknown region -> zeros" comes from for free.
  const inside = descendantsOf(scene, [regionId]);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  let nodes = 0;
  for (const id of inside) {
    if (id === regionId) continue;
    const node = byId.get(id);
    if (node && isArm(node)) continue;
    nodes += 1;
  }
  // WHY `classifyBoundary` and not a hand-rolled edge scan: "which edges
  // cross this boundary" already has ONE implementation (boundary.ts:171),
  // and a second one is exactly how the vendored copy diverged last time
  // (the plan's C2). The two classes an opaque card genuinely cannot show
  // are `interior` (both ends strictly inside) and `port-inner` (the
  // region's own port wired to something inside — a loop's private `Iter`
  // cable); every other class still has at least one end a card can paint.
  const report = classifyBoundary(scene, { containerId: regionId });
  const edges = report.edges.filter((hit) => hit.kind === "interior" || hit.kind === "port-inner").length;
  return { nodes, arms: armsOf(scene, regionId).length, edges };
}

/** "2 blocks · 2 arms · 3 edges hidden" — zero clauses omitted, singular
 *  when 1, and "nothing hidden" when every count is zero. The footer line
 *  of the opaque card (P5: "a card whose footer states what it hides"). */
export function describeHidden(summary: HiddenSummary): string {
  const clauses = [
    { count: summary.nodes, one: "block", many: "blocks" },
    { count: summary.arms, one: "arm", many: "arms" },
    { count: summary.edges, one: "edge", many: "edges" },
  ]
    .filter((clause) => clause.count > 0)
    .map((clause) => `${clause.count} ${clause.count === 1 ? clause.one : clause.many}`);
  // "nothing hidden" rather than "0 blocks hidden": the P5 card's footer is
  // read at a glance, and a row of zeroes reads as a defect rather than as
  // an empty region. Same sentence pyblocks' own `describeHidden` settles on
  // (vscode-pyblocks/src/viewer/adapter/collapse.ts:29).
  if (clauses.length === 0) return "nothing hidden";
  return `${clauses.join(" · ")} hidden`;
}
