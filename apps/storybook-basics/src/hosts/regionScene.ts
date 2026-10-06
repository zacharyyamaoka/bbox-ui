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
   * Default `"expanded"`. The Blackbox toggle's state: `"opaque"` is
   * Expanded Opaque, the frame at its own size with the members hidden.
   *
   * WHY `view` and `presentation` are two fields and not one three-valued
   * one (Zach, 2026-09-22: "chevron folds, blackbox makes opaque without
   * folding… they are completely different operations"): the P/E selector
   * and the Blackbox toggle are separate controls, so each owns its own
   * field. Picking Port and back to Expanded returns the region to whatever
   * the toggle last said, instead of one control silently resetting the
   * other.
   *
   * WHY a record renders LITERALLY, with no legacy reading of `view:
   * "opaque"` as the old folded card (Codex re-judge, 2026-09-22): inferring
   * "legacy" from an absent `presentation` made the same bytes mean two
   * things depending on who wrote them — `setRegionView(…, "opaque")` wrote
   * exactly what the inference called legacy.
   *
   * The ONE place HostScenes arrive from outside is the pyblocks backend:
   * `backend/pyblocksClient.ts`'s `scene()` → `parsePyblocksScene` →
   * `hosts/pyblocksScene.ts`'s `loadPyblocksScene`. pyblocks never authors
   * region view state (view is client-owned UI state), so that boundary
   * DROPS `view`/`presentation` rather than interpreting them
   * (`withoutRegionViewState`, with the evidence) — network bytes cannot set a
   * view, stale or new. Everything else — `definitionsToScene.ts`,
   * `collapse.ts`, the `region.loop`/`region.branch` presets, literal
   * fixtures — is built in code by current writers. (`files/*` and
   * `apps/systemsketch` load tldraw documents, not HostScenes.) A future
   * stored-HostScene loader is where a version marker and a migration would
   * belong — not here.
   */
  view?: RegionView;
  /** Default `"expanded"`. `"port"` is the region collapsed to a block —
   *  what the old opaque card was, now the P/E selector's Port. */
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
  /**
   * An `if`/`elif` arm's OWN operand — the boolean it is selected by.
   * `else` has none.
   *
   * WHY this lives here and not only in `data.ports.left`: the wall list
   * carries the port's ID, which is all a wire needs, but NOT the inline
   * expression a reader sees when nothing is wired (`PortState
   * "valueSet"` — "owns a default", `components/port.tsx:60`). Storing
   * only the id dropped `default` on the floor, so a scene round-tripped
   * through `branchNode` rendered a bare dot and the condition vanished —
   * the exact "hiding things inside the header" failure this whole change
   * set exists to end, reintroduced one layer down. Both are written:
   * `ports.left` so hosts and `wireLayer` resolve the dot, `arm.test` so
   * the tab can paint the expression verbatim.
   */
  test?: { id: string; default?: string };
  /**
   * A `match` arm's pattern CAPTURES — the names it binds INTO its body
   * (`case Point(x=0, y=y)` binds `y`). Mirrored in `data.ports.right`
   * for the same reason `test` is mirrored in `ports.left`.
   */
  captures?: readonly string[];
}

export function isRegionNode(node: SceneNode<HostNodeData>): boolean {
  return isRegion(node);
}

/** Default `"expanded"` — a region with no `view` is the P1 frame. */
export function regionViewOf(node: SceneNode<HostNodeData>): RegionView {
  return node.data.region?.view ?? "expanded";
}

/** Default `"expanded"`. */
export function regionPresentationOf(node: SceneNode<HostNodeData>): RegionPresentation {
  return node.data.region?.presentation ?? "expanded";
}

/** What a host draws: Port, the expanded frame, or Expanded Opaque (the frame
 *  at its own size, inside hidden). Read literally off the two fields. */
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

/** The Blackbox toggle: Expanded ⇄ Expanded Opaque. */
export function toggleRegionView(scene: HostScene, regionId: string): HostScene {
  const node = scene.nodes.find((candidate) => candidate.id === regionId);
  if (!node || !isRegion(node)) return scene;
  return setRegionView(scene, regionId, regionViewOf(node) === "opaque" ? "expanded" : "opaque");
}

/** The P/E selector, as a scene write: ONLY `data.region.presentation` on
 *  `regionId` changes, with `setRegionView`'s same no-op contract. */
export function setRegionPresentation(scene: HostScene, regionId: string, presentation: RegionPresentation): HostScene {
  const index = scene.nodes.findIndex((node) => node.id === regionId);
  if (index === -1) return scene;
  const node = scene.nodes[index];
  if (!isRegion(node) || regionPresentationOf(node) === presentation) return scene;
  const nodes = scene.nodes.slice();
  nodes[index] = { ...node, data: { ...node.data, region: { ...(node.data.region ?? { kind: "group" as const }), presentation } } };
  return { ...scene, nodes };
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
