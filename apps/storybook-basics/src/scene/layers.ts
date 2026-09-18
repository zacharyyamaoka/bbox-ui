// src/scene/layers.ts — the layer half of SystemSketch's tunnel feature,
// re-expressed against a scene instead of a tldraw Editor.
//
// Donor: /home/bam/systemsketch/src/blocks/connections/tunnelLayers.ts:1-50
// (revision `10748b8ccdb374e71714f3d351abc43947ecfb0e`) — `getTunnelLayers`,
// `canonicalTunnelLayer`, `shapeTunnelLayer`, and the view-local focus atom.
//
// This file is a RE-EXPRESSION, not a copy, and the header says so up front
// because the donor's every function took an `Editor`. What survived is the
// two derivations; what did not is the storage.
//
// ==========================================================================
// THE CONTRACT DECISION: what is a layer?
// ==========================================================================
//
// Three candidates were on the table. The answer is (a), and the argument
// matters more than the code, because `SceneEdge`'s shape is setting right
// now (`linking.ts` landed the same day) and this is expensive to revisit.
//
//   (a) A FIELD ON THE EDGE'S `data`, with the layer SET derived. <- chosen
//   (b) A registry on `BlockScene` — `layers: SceneLayer[]`.
//   (c) Host state that never enters the scene.
//
// **(c) is wrong because layer MEMBERSHIP is authored.** Which layer a cable
// belongs to is a decision a person makes and expects to still be true
// tomorrow; it survives reload, copy-paste and a change of host. That is the
// definition of document data. The donor agrees and already splits exactly
// here: membership lives on the shape's props (`props.tunnel`,
// `props.tunnelLayer`), while FOCUS lives in a view-local atom that "never
// mutates or dirties the board" (`tunnelLayers.ts:17`). That split ports
// unchanged — focus is host state here too, and this file has no focus
// function at all. Look for it in a story's `useState`.
//
// **(b) is wrong because it makes two structures own one fact.** SCENE-KIT.md
// rejected a separate `placements` table for precisely this ("the split-model
// disease this kit cures"), and a `layers` registry beside `data.layer` is the
// same shape of mistake one level over: it admits a registry entry no edge is
// on, and an edge naming a layer the registry lacks. Both are states that
// cannot be typed away, so both would need a reconcile pass and a lint —
// which is real machinery bought for no capability, since every question
// anyone asks of a layer ("what layers exist", "what is on this one") is
// answerable from the edges in one pass.
//
// **(a) is also what the kit already believes.** `linking.ts`'s rule 1 is
// "same name = same thing": a definition is not a record, it is the set of
// nodes that agree on a name. A layer is that rule applied to edges. Same
// layer name = same layer; the set is a derivation, not a table; and
// `canonicalSceneLayer` is the same case-folding resolution
// `commitDefinitionName` does for definitions.
//
// WHAT IT COSTS, stated plainly: a brand-new EMPTY layer — the "+ New layer"
// button in Zach's inspector mock — has no edges, so it is not in the derived
// set and does not survive a reload. The donor has the identical property and
// lives with it: `canonicalTunnelLayer` resolves a typed name against the
// derived set and FALLS BACK TO THE TRIMMED INPUT, i.e. a name is legal
// before any edge carries it. So the host holds a pending name until the
// first edge joins it, and an empty layer evaporating is arguably the honest
// outcome — there is nothing on it. If that ever stops being acceptable, the
// fix is a registry and it is a migration, which is why it is written down
// here rather than discovered later.
//
// ==========================================================================
//
// WHAT CHANGED from the donor, exhaustively:
//
//   1. `editor.getCurrentPageShapes()` -> `scene.edges`. The donor filtered
//      by `shape.type !== CONNECTION_SHAPE_TYPE`; a scene's edges are edges,
//      so the guard is gone.
//   2. `props.tunnelLayer` -> `data.layer`, `props.tunnel` -> `data.tunnel`.
//      The `tunnel` prefix was disambiguating a flat tldraw props bag; on
//      `SceneEdge.data` there is nothing to disambiguate from, and a layer
//      is a more general idea than the one feature that first needed it.
//   3. DELIBERATE DEVIATION — `getTunnelLayers` counted a layer only if its
//      edge ALSO had `props.tunnel === true`. `sceneLayers` counts every
//      edge that names a layer. WHY: `tunnelDisplayState` checks
//      `focusedLayer` BEFORE `enabled`, so focusing a layer already affects
//      edges that were never configured as tunnels — under the donor's rule
//      a layer holding only such edges is real, does something when focused,
//      and is invisible in the picker that would let you focus it. The
//      donor's filter is a leftover from layers existing only inside the
//      tunnel feature.
//   4. The focus atom (`focusedLayerByEditor`, `getFocusedTunnelLayer`,
//      `setFocusedTunnelLayer`) is DROPPED, not ported. It is a WeakMap keyed
//      by Editor — a host-state store, in a kit that may not import a host.
//      Its one non-obvious behaviour is preserved by being written down:
//      `setFocusedTunnelLayer` TOGGLES (setting the already-focused layer
//      clears focus), which is what makes the picker feel like a filter
//      rather than a mode. A host that reimplements it should keep that.
//
// `scene.ts`'s rule, unchanged here: no React, no DOM, no engine, no imports
// beyond sibling scene types.

import type { SceneData, SceneEdge } from "./scene";

/**
 * The edge-data slice this file reads. Typed as its own interface rather
 * than as `SceneEdge<...>` for the reason `SceneEdgeEnds` exists: the same
 * functions then run on a `BlockScene`, on a React Flow store's edges, or on
 * any host record that speaks the vocabulary.
 */
export interface SceneLayerData extends SceneData {
  /** Which layer this edge is on. Absent or blank = no layer. */
  layer?: string;
  /** Is this edge configured to tunnel when idle? */
  tunnel?: boolean;
}

export type SceneLayerEdge = Pick<SceneEdge<SceneLayerData>, "data">;

/** The layer an edge is on, trimmed, or `null`. Blank is not a layer name. */
export function edgeLayer(edge: SceneLayerEdge): string | null {
  const layer = edge.data?.layer;
  if (typeof layer !== "string") return null;
  return layer.trim() || null;
}

/** Is this edge configured as a tunnel? `data.tunnel === true`, nothing
 *  looser — an absent flag is not a tunnel. */
export function edgeTunnels(edge: SceneLayerEdge): boolean {
  return edge.data?.tunnel === true;
}

/**
 * Reusable names, derived from the scene's own edges.
 *
 * PORTED from `getTunnelLayers` (`tunnelLayers.ts:38-46`) including the
 * case-folded dedupe and the locale sort: two edges written `Diagnostics`
 * and `diagnostics` are on ONE layer.
 *
 * ONE DEVIATION, in which SPELLING survives — the ORDER is the donor's
 * either way, since both sort afterwards. The donor's bare `Map.set` keeps
 * the LAST spelling encountered, so adding an edge spelled `diagnostics`
 * silently relabels an existing `Diagnostics` layer in the picker. This
 * keeps the FIRST, which is the same first-occurrence rule
 * `reconcileDefinitions` uses to converge intra-group drift (SCENE-KIT.md,
 * linking rule 8) — a later edge joins a layer, it does not rename it.
 */
export function sceneLayers(scene: { edges: readonly SceneLayerEdge[] }): string[] {
  const byCaseFoldedName = new Map<string, string>();
  for (const edge of scene.edges) {
    const layer = edgeLayer(edge);
    if (!layer) continue;
    const key = layer.toLocaleLowerCase();
    if (!byCaseFoldedName.has(key)) byCaseFoldedName.set(key, layer);
  }
  return [...byCaseFoldedName.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve a typed name to the scene's existing spelling of it, or keep the
 * trimmed input when it is new.
 *
 * PORTED from `canonicalTunnelLayer` (`tunnelLayers.ts:48-50`). The fallback
 * is the whole reason "+ New layer" works without a registry — see this
 * file's header.
 */
export function canonicalSceneLayer(
  scene: { edges: readonly SceneLayerEdge[] },
  name: string,
): string {
  const trimmed = name.trim();
  return (
    sceneLayers(scene).find(
      (layer) => layer.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    ) ?? trimmed
  );
}

/**
 * Every edge on `layer`, case-insensitively. ADDED — the donor never needed
 * it (tldraw asks the board), but a host driving a scene does, and doing the
 * case-fold in one place is what stops `Diagnostics`/`diagnostics` from
 * being one layer in the picker and two in the render.
 */
export function edgesOnLayer<E extends SceneLayerEdge>(
  scene: { edges: readonly E[] },
  layer: string,
): E[] {
  const key = layer.trim().toLocaleLowerCase();
  if (!key) return [];
  return scene.edges.filter((edge) => edgeLayer(edge)?.toLocaleLowerCase() === key);
}
