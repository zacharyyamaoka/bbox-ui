// src/hosts/regionScene.ts — this host family's region vocabulary
// (`HostNodeData.region` / `.arm`) and the ONE write a view toggle makes.
// CONTRACT STUB — docs/CONTROL-FLOW-PLAN.md, lane E. Signatures frozen by
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

function notImplemented(): never {
  throw new Error("hosts/regionScene.ts: lane E of docs/CONTROL-FLOW-PLAN.md has not landed yet");
}

/**
 * The toggle, as a scene write: ONLY `data.region.view` on `regionId`
 * changes. Every other node is the SAME object, `scene.edges` is the SAME
 * array, and an unknown id / a non-region / an unchanged view returns the
 * SAME scene object (the kit's referentially-honest no-op contract). This
 * is what "positions preserved" means mechanically.
 */
export function setRegionView(scene: HostScene, regionId: string, view: RegionView): HostScene {
  void scene; void regionId; void view;
  return notImplemented();
}

export function toggleRegionView(scene: HostScene, regionId: string): HostScene {
  void scene; void regionId;
  return notImplemented();
}

export interface HostSceneProjection {
  /** Same nodes, projected edges — what every host hands its edge painter. */
  scene: HostScene;
  regions: OpaqueRegionView[];
}

/** `projectOpaqueRegions` with this family's own predicates plugged in. */
export function projectHostScene(scene: HostScene): HostSceneProjection {
  const projection = projectOpaqueRegions(scene, { isOpaque: isOpaqueRegion, directionOf: hostPolarityOf(scene) });
  return { scene: { nodes: projection.nodes, edges: projection.edges }, regions: projection.regions };
}
