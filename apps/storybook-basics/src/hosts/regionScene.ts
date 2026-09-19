// src/hosts/regionScene.ts — this host family's region vocabulary
// (`HostNodeData.region` / `.arm`) and the ONE write a view toggle makes.
// docs/CONTROL-FLOW-PLAN.md §3.1/§3.4, lane E. Signatures frozen by
// `regionScene.test.ts` (off-limits to builders). Pure: no React, no DOM —
// it lives in `hosts/` only because it reads `HostNodeData`, which the scene
// kit never learns about (the same licence `hostPortsOf` claims).

import { projectOpaqueRegions, type OpaqueRegionView } from "../scene/regionView";
import { isRegion } from "../scene/region";
import type { SceneNode } from "../scene/scene";
import { hostPolarityOf, type HostNodeData, type HostScene } from "./hostScene";

export type RegionKind = "loop" | "branch" | "group";
export type RegionView = "expanded" | "opaque";
export type LoopKind = "for" | "while";

/** `data.region` on a `type: "region"` node. */
export interface RegionData {
  kind: RegionKind;
  /** Default `"expanded"`. The P5 card is `"opaque"`. */
  view?: RegionView;
  /** Only meaningful with `kind: "loop"`. Decides the corner block's typed,
   *  unnamed header contract (DP - Loop): `for` = `Iterable` in / `Iter`
   *  out; `while` = `Bool` in, no item outlet. */
  loop?: LoopKind;
  /** At most one active arm (donor branchModel.ts:11-12: "no active arm
   *  means every arm is active"). Non-active arms fade. */
  activeArm?: string;
}

/** `data.arm` on a `type: "arm"` node. */
export interface ArmData {
  /** Default `true`. */
  open?: boolean;
  /** Body height while open. Default `REGION_ARM_DEFAULT_BODY_PX`. */
  h?: number;
}

export function isRegionNode(node: SceneNode<HostNodeData>): boolean {
  return isRegion(node);
}

/** Default `"expanded"` — a region with no `view` is the P1 frame. */
export function regionViewOf(node: SceneNode<HostNodeData>): RegionView {
  return node.data.region?.view ?? "expanded";
}

export function isOpaqueRegion(node: SceneNode<HostNodeData>): boolean {
  return isRegion(node) && regionViewOf(node) === "opaque";
}

/**
 * The toggle, as a scene write: ONLY `data.region.view` on `regionId`
 * changes. Every other node is the SAME object, `scene.edges` is the SAME
 * array, and an unknown id / a non-region / an unchanged view returns the
 * SAME scene object (the kit's referentially-honest no-op contract). This
 * is what "positions preserved" means mechanically.
 */
export function setRegionView(scene: HostScene, regionId: string, view: RegionView): HostScene {
  const index = scene.nodes.findIndex((node) => node.id === regionId);
  // Unknown id, a node that is not a region, or a view that is already what
  // it would be set to: the SAME scene object. WHY it matters beyond tidiness
  // — every host memoizes off `scene` identity (`reactFlowHost.tsx`'s
  // `rfNodes`/`rfEdges`, `DomCanvas`'s `layoutKey`), so returning a fresh
  // object for a write that changed nothing would re-measure the whole board
  // and, in React Flow, briefly unset `measured` on every node.
  if (index === -1) return scene;
  const node = scene.nodes[index];
  if (!isRegion(node) || regionViewOf(node) === view) return scene;
  // ONE new node object in a copy of the array. Every sibling passes through
  // by reference and `scene.edges` is handed back untouched — which is what
  // "positions preserved by construction" MEANS: there is no code path here
  // that could move one, because nothing but `data.region.view` is written.
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data: { ...node.data, region: { ...(node.data.region ?? { kind: "group" as const }), view } } };
  return { ...scene, nodes };
}

export function toggleRegionView(scene: HostScene, regionId: string): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === regionId);
  if (!node || !isRegion(node)) return scene;
  return setRegionView(scene, regionId, regionViewOf(node) === "opaque" ? "expanded" : "opaque");
}

export interface HostSceneProjection {
  /** Same nodes, projected edges — what every host hands its edge painter. */
  scene: HostScene;
  regions: OpaqueRegionView[];
}

/**
 * `HostSceneProjection.regions` as a lookup — what `SceneNodeView` takes.
 *
 * WHY it lives here and not in a new module: this is the host family's
 * region vocabulary file, the three hosts each need the same one line, and
 * a fourth file whose whole content is `new Map(...)` is how one-line
 * helpers start disagreeing. Empty map for an all-expanded scene, so a
 * region reading it finds nothing and renders from the document alone.
 */
export function regionViewMap(regions: readonly OpaqueRegionView[]): ReadonlyMap<string, OpaqueRegionView> {
  return new Map(regions.map((region) => [region.regionId, region]));
}

/** `projectOpaqueRegions` with this family's own predicates plugged in. */
export function projectHostScene(scene: HostScene): HostSceneProjection {
  const projection = projectOpaqueRegions(scene, { isOpaque: isOpaqueRegion, directionOf: hostPolarityOf(scene) });
  return { scene: { nodes: projection.nodes, edges: projection.edges }, regions: projection.regions };
}
