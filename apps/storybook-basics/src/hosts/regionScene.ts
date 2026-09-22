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
/**
 * What the P/E selector picks for a region. There is no `simple` (Zach,
 * 2026-09-22: "regions do not have a simple view. they just have port,
 * expanded and expanded opaque view").
 */
export type RegionPresentation = "expanded" | "port";
export type LoopKind = "for" | "while";

/** `data.region` on a `type: "region"` node. */
export interface RegionData {
  kind: RegionKind;
  /**
   * Default `"expanded"`. The Blackbox toggle's state — but ONLY when
   * `presentation` is also written (see `regionFaceOf`).
   *
   * WHY `view` and `presentation` are two fields and not one three-valued
   * one (Zach, 2026-09-22: "chevron folds, blackbox makes opaque without
   * folding… they are completely different operations"): the P/E selector
   * and the Blackbox toggle are separate controls, so each owns its own
   * field. Picking Port and back to Expanded returns the region to whatever
   * the toggle last said, instead of one control silently resetting the
   * other.
   */
  view?: RegionView;
  /**
   * `"port"` is the region collapsed to a block — what the old opaque card
   * was, now the P/E selector's Port. `"expanded"` is the frame.
   *
   * ALSO THE SCHEMA DISCRIMINATOR. Before 2026-09-22 a record carried only
   * `view`, and `view: "opaque"` meant the folded card. A record with
   * `view: "opaque"` and NO `presentation` is therefore a LEGACY record and
   * reads as Port (`isLegacyOpaqueRegion`, `migrateRegionScene`); every write
   * that produces Expanded Opaque (`toggleBlackbox`) writes `presentation`
   * explicitly, so a new record can never be mistaken for a legacy one.
   */
  presentation?: RegionPresentation;
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

/** Default `"expanded"` — a region with no `view` is the P1 frame. The raw
 *  field; what it MEANS is `regionFaceOf`'s question. */
export function regionViewOf(node: SceneNode<HostNodeData>): RegionView {
  return node.data.region?.view ?? "expanded";
}

/** A pre-2026-09-22 record: `view: "opaque"` with no `presentation` — the
 *  folded card, which is the Port view now. See `RegionData.presentation`. */
export function isLegacyOpaqueRegion(node: SceneNode<HostNodeData>): boolean {
  return isRegion(node) && node.data.region?.view === "opaque" && node.data.region?.presentation === undefined;
}

/** Default `"expanded"`; a legacy opaque record reads `"port"`. */
export function regionPresentationOf(node: SceneNode<HostNodeData>): RegionPresentation {
  return node.data.region?.presentation ?? (isLegacyOpaqueRegion(node) ? "port" : "expanded");
}

/** What a host draws: Port, the expanded frame, or Expanded Opaque (the frame
 *  at its own size, inside hidden). Legacy records resolve to Port. */
export type RegionFace = "port" | "expanded" | "opaque";

export function regionFaceOf(node: SceneNode<HostNodeData>): RegionFace {
  if (regionPresentationOf(node) === "port") return "port";
  return regionViewOf(node) === "opaque" ? "opaque" : "expanded";
}

/**
 * Does the projection hide this region's inside? Expanded Opaque AND the Port
 * view both do: either way the members are off screen, so a crossing cable
 * has to land on the region's own wall (`scene/regionView.ts`).
 */
export function isOpaqueRegion(node: SceneNode<HostNodeData>): boolean {
  return isRegion(node) && regionFaceOf(node) !== "expanded";
}

/** A legacy record rewritten to the current schema — `view: "opaque"` alone
 *  becomes `presentation: "port", view: "expanded"`. Anything else is the
 *  SAME node object. */
export function migrateRegionNode(node: SceneNode<HostNodeData>): SceneNode<HostNodeData> {
  if (!isLegacyOpaqueRegion(node)) return node;
  return { ...node, data: { ...node.data, region: { ...node.data.region!, presentation: "port", view: "expanded" } } };
}

/**
 * The scene-schema migration for regions. Every loader of a stored scene
 * runs this once. The SAME scene object when nothing is legacy (the kit's
 * referentially-honest no-op contract). The migrated record renders exactly
 * as the legacy one did under `regionFaceOf`, so a host that has not run it
 * yet still draws the right thing — the migration makes it explicit on the
 * next write, it does not change what is on screen.
 */
export function migrateRegionScene(scene: HostScene): HostScene {
  if (!scene.nodes.some(isLegacyOpaqueRegion)) return scene;
  return { ...scene, nodes: scene.nodes.map(migrateRegionNode) };
}

/** Writes one region node through `patch`, legacy-migrated first; the SAME
 *  scene when the id is unknown, not a region, or the write changes nothing. */
function writeRegion(scene: HostScene, regionId: string, patch: (region: RegionData) => RegionData): HostScene {
  const index = scene.nodes.findIndex((node) => node.id === regionId);
  if (index === -1) return scene;
  const original = scene.nodes[index];
  if (!isRegion(original)) return scene;
  const node = migrateRegionNode(original);
  const region = node.data.region ?? { kind: "group" as const };
  const next = patch(region);
  if (node === original && next.view === region.view && next.presentation === region.presentation) return scene;
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data: { ...node.data, region: next } };
  return { ...scene, nodes };
}

/**
 * The toggle, as a scene write: ONLY `data.region.view` on `regionId`
 * changes. Every other node is the SAME object, `scene.edges` is the SAME
 * array, and an unknown id / a non-region / an unchanged view returns the
 * SAME scene object (the kit's referentially-honest no-op contract). This
 * is what "positions preserved" means mechanically.
 *
 * The raw field write, frozen by `regionScene.test.ts`. Writing
 * `view: "opaque"` alone is the LEGACY spelling (the folded card, now
 * Port); a host's Blackbox toggle uses `toggleBlackbox`.
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

/**
 * The Blackbox toggle: Expanded ⇄ Expanded Opaque. Writes `view` AND an
 * explicit `presentation: "expanded"` — the discriminator that keeps the
 * new Expanded Opaque from ever reading as a legacy folded card.
 */
export function toggleBlackbox(scene: HostScene, regionId: string): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === regionId);
  if (!node || !isRegion(node)) return scene;
  const opaque = regionFaceOf(node) === "opaque";
  return writeRegion(scene, regionId, (region) => ({ ...region, presentation: "expanded", view: opaque ? "expanded" : "opaque" }));
}

/** The P/E selector, as a scene write: ONLY `data.region.presentation` on
 *  `regionId` changes (a legacy record is migrated first, so leaving Port
 *  lands on the expanded frame, not on Expanded Opaque). */
export function setRegionPresentation(scene: HostScene, regionId: string, presentation: RegionPresentation): HostScene {
  return writeRegion(scene, regionId, (region) => ({ ...region, presentation }));
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
