// src/scene/regionView.ts — the OPAQUE view of a region as a PROJECTION over
// the scene, never a mutation of it. CONTRACT STUB — docs/CONTROL-FLOW-PLAN.md,
// lane E. Signatures frozen by `regionView.test.ts` (off-limits to builders).
//
// ── WHY A PROJECTION, WHEN collapse.ts MUTATES ──────────────────────────
// `collapseToRegion` (collapse.ts) MINTS a region around a loose selection
// and splits every crossing edge through a promoted port; that is a
// document edit and docs/peps/0003 records why. The opaque/expanded TOGGLE
// is a different operation on a region that already exists: Zach's P1
// ruling is that in the expanded view "data cables run straight from
// outside into the calls inside an arm" (V1, picked 2026-09-02, repeated
// 2026-09-18) — so the expanded document has DIRECT crossing edges, and the
// opaque card is what those same edges look like when their inside end is
// hidden. Flipping a view must therefore change ONE field
// (`data.region.view`) and zero edges; positions and ids are untouched by
// construction, which `hosts/regionScene.test.ts` asserts as referential
// identity. The QUERY half of collapse.ts (`classifyBoundary` +
// `promoteBoundary`, both pure, both non-mutating) is exactly what this
// module reuses — one port vocabulary, no second implementation.
//
// Pure: no React, no DOM, no canvas engine.

import type { PromotedPort } from "./boundary";
import type { HiddenSummary } from "./controlFlow";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import type { BlockScene, SceneData, SceneEdge, SceneNode, ScenePortRef } from "./scene";

export interface ProjectOpaqueOptions<N extends SceneData = SceneData> {
  /** Which region nodes are currently opaque. Host vocabulary is injected,
   *  never read off `data` here — the same "no vocabulary supplied, no
   *  opinion" convention `lint.ts`'s resolvers use. */
  isOpaque: (node: SceneNode<N>) => boolean;
  /** Polarity for `promoteBoundary`'s side decision (its `dagPolarityPolicy`). */
  directionOf?: PortDirectionOf;
  typeOf?: PortTypeOf;
  /** Names a promoted port. Default `portKey(inner.nodeId, inner.portId)`
   *  — collapse.ts's own default, so a card and a collapse agree. */
  mintPortId?: (inner: ScenePortRef) => string;
}

/** One opaque region's card, as data: its promoted ports and what it hides. */
export interface OpaqueRegionView {
  regionId: string;
  ports: PromotedPort[];
  hidden: HiddenSummary;
}

export interface RegionProjection<N extends SceneData = SceneData, E extends SceneData = SceneData> {
  /** THE SAME array object as `scene.nodes` — a projection never touches a node. */
  nodes: SceneNode<N>[];
  /**
   * The edges a host paints. When NO region is opaque this is `scene.edges`
   * itself (referential identity — the expanded view costs nothing).
   * Otherwise, per OUTERMOST opaque region R (a region hidden inside another
   * opaque region gets no treatment of its own):
   *   - an edge with exactly one end inside R is re-pointed: that end
   *     becomes `{R, promotedPortId}`; `id`, `data` and the other end are
   *     untouched (a new edge OBJECT, since the end changed);
   *   - an edge with both ends inside R (`interior`) is dropped;
   *   - an edge between R itself and something inside R (`port-inner`) is
   *     dropped — the region's own `Iter`-style cable is private wiring;
   *   - an edge touching R's own ports from outside (`port-outer`) is the
   *     SAME object;
   *   - an edge whose two ends are inside two DIFFERENT outermost opaque
   *     regions is re-pointed at both ends.
   * Scene order preserved.
   */
  edges: SceneEdge<E>[];
  /** One entry per outermost opaque region, scene order. */
  regions: OpaqueRegionView[];
}

export function projectOpaqueRegions<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  options: ProjectOpaqueOptions<N>,
): RegionProjection<N, E> {
  void scene; void options;
  throw new Error("scene/regionView.ts: lane E of docs/CONTROL-FLOW-PLAN.md has not landed yet");
}
