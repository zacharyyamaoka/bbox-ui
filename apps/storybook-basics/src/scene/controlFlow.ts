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
// derived (arms stack under the corner block, `components/region.layout.ts`)
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

import type { SceneData, SceneNode } from "./scene";

/** `SceneNode.type` for an arm. One spelling, in one place — the same
 *  device as `REGION_NODE_TYPE`. */
export const ARM_NODE_TYPE = "arm";

/** Is this node an arm? Total — an absent `type` is a block-ish node. */
export function isArm(node: { type?: string }): boolean {
  return node.type === ARM_NODE_TYPE;
}

function notImplemented(): never {
  throw new Error("scene/controlFlow.ts: lane A of docs/CONTROL-FLOW-PLAN.md has not landed yet");
}

/** The DIRECT children of `regionId` that are arms, in scene order. A loop
 *  has none; a branch has one per `if`/`elif`/`else` or `case`. */
export function armsOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  regionId: string,
): SceneNode<N>[] {
  void scene; void regionId;
  return notImplemented();
}

/** The DIRECT children of `regionId` that are NOT arms — the region's own
 *  free body (a loop's blocks; a plain group's members). Scene order. */
export function bodyChildrenOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  regionId: string,
): SceneNode<N>[] {
  void scene; void regionId;
  return notImplemented();
}

/** The nearest ARM ancestor of `nodeId`, or `undefined` (a loop member, a
 *  top-level node, the region itself, an unknown id). Walks `parentId`,
 *  cycle-safe — the same walk as `region.ts`'s `regionOf`. */
export function armOf<N extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[] },
  nodeId: string,
): SceneNode<N> | undefined {
  void scene; void nodeId;
  return notImplemented();
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
  void scene; void regionId;
  return notImplemented();
}

/** "2 blocks · 2 arms · 3 edges hidden" — zero clauses omitted, singular
 *  when 1, and "nothing hidden" when every count is zero. The footer line
 *  of the opaque card (P5: "a card whose footer states what it hides"). */
export function describeHidden(summary: HiddenSummary): string {
  void summary;
  return notImplemented();
}
