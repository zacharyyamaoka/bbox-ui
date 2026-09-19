// src/scene/regionView.ts — the OPAQUE view of a region as a PROJECTION over
// the scene, never a mutation of it. docs/CONTROL-FLOW-PLAN.md §2.B/§3.4,
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
// module reuses — one port vocabulary, no second implementation. The
// MUTATING twin this file deliberately never calls is `collapse.ts:242-262`
// — the `scene.edges.map` that re-points every crossing edge and the loop
// under it that pushes one interior stub per promoted port. The re-pointing
// rule below is that same rule applied to a COPY thrown away on the next
// render, instead of written back into the document.
//
// Pure: no React, no DOM, no canvas engine.

import { classifyBoundary, dagPolarityPolicy, promoteBoundary, type PromotedPort, type PromotionPolicy } from "./boundary";
import { hiddenSummary, type HiddenSummary } from "./controlFlow";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import { ancestorsOf, descendantsOf } from "./region";
import { portKey, type BlockScene, type SceneData, type SceneEdge, type SceneNode, type ScenePortRef } from "./scene";

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

/**
 * WHY the promotion policy here reads the INNER endpoint and not the outer
 * one `dagPolarityPolicy` reads.
 *
 * A projection is not a collapse. `collapseToRegion` promotes a port for a
 * selection that has no container yet, so the only polarity it can trust is
 * the OUTSIDE end's, inverted — Zach's stated v1 ("if it's connecting to an
 * input port of an outside member then it should go out the right side of
 * the header"). Here the inside end is a real port on a real node that is
 * still in the document: the card's port IS that inner port, re-seated on
 * the region's wall, so its polarity is the inner port's polarity, read
 * directly rather than inferred by inverting its partner's. Under a
 * well-formed edge the two readings agree; when they disagree the direct
 * read is the one that is not a heuristic, and `regionView.test.ts` pins
 * exactly that case (`src/pose → merge/pose`, where the resolver calls both
 * ends sinks).
 *
 * `dagPolarityPolicy` still supplies the answer — and the `seat`/`band`
 * choice, and the `by: "gesture"` honesty — whenever the inner port states
 * no direction at all. One policy, one fallback, no second spelling of the
 * side mapping: `source → right`, `sink → left`, which is
 * `port.layout.ts`'s `portSideForDirection` in the source/sink vocabulary
 * `boundary.ts`'s `PromotionDecision` header already maps it to.
 */
const innerPolarityPolicy: PromotionPolicy = (input) => {
  const fallback = dagPolarityPolicy(input);
  const stated = input.inner.portId === "" ? undefined : input.directionOf?.(input.inner);
  if (stated === undefined) return fallback;
  return { ...fallback, direction: stated, side: stated === "source" ? "right" : "left", by: "polarity" };
};

export function projectOpaqueRegions<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  options: ProjectOpaqueOptions<N>,
): RegionProjection<N, E> {
  const mintPortId = options.mintPortId ?? ((inner: ScenePortRef) => portKey(inner.nodeId, inner.portId));

  // WHY only the OUTERMOST opaque region gets a card: a region hidden
  // inside another opaque region is not on screen at all, so promoting its
  // ports would mint a seat nothing can paint and re-point an edge at a
  // node the viewer cannot see. The outer card already stands for
  // everything under it — `hiddenSummary` counts the nested region as one
  // of the blocks it hides. `ancestorsOf` walks containment (`parentId`),
  // which is the only nesting a region has (regions are isolated — they
  // never carry a `definitionId`).
  const opaqueIds = scene.nodes.filter((node) => options.isOpaque(node)).map((node) => node.id);
  const opaque = new Set(opaqueIds);
  const outermost = opaqueIds.filter((id) => !ancestorsOf(scene, id).some((ancestor) => opaque.has(ancestor)));

  // Nothing opaque: the expanded view costs NOTHING — the very arrays the
  // caller passed in come back, so a host's `useMemo`/`===` guards never
  // see a change and no render is provoked by asking the question.
  if (outermost.length === 0) return { nodes: scene.nodes, edges: scene.edges, regions: [] };

  const regions: OpaqueRegionView[] = [];
  /** node id → the outermost opaque region that hides it. Built ONCE. */
  const ownerOf = new Map<string, string>();
  /** region id → (portKey of the inner endpoint → the promoted port). */
  const portsOfRegion = new Map<string, Map<string, PromotedPort>>();

  for (const regionId of outermost) {
    const report = classifyBoundary(scene, { containerId: regionId });
    const { ports } = promoteBoundary(report, {
      policy: innerPolarityPolicy,
      directionOf: options.directionOf,
      typeOf: options.typeOf,
      // `promoteBoundary` hands its minter `{inner, index, decision}`; this
      // module's own seam takes the endpoint alone, because the DEFAULT has
      // to be `portKey(inner)` — the same id `collapse.ts:197` mints — so a
      // card and a collapse of the same region name the same port.
      mintPortId: ({ inner }) => mintPortId(inner),
    });
    portsOfRegion.set(regionId, new Map(ports.map((port) => [portKey(port.inner.nodeId, port.inner.portId), port])));
    regions.push({ regionId, ports, hidden: hiddenSummary(scene, regionId) });
    // The seeds include the region itself; a region never owns ITSELF (its
    // own ports are the boundary, which is what `port-outer`/`port-inner`
    // separate). Outermost regions are disjoint by construction, so the
    // first writer is the only writer.
    for (const id of descendantsOf(scene, [regionId])) if (id !== regionId) ownerOf.set(id, regionId);
  }

  /** The promoted port id an owned endpoint is re-pointed at. */
  const promotedIdFor = (regionId: string, nodeId: string, handle: string | undefined): string | undefined =>
    portsOfRegion.get(regionId)?.get(portKey(nodeId, handle ?? ""))?.id;

  const edges: SceneEdge<E>[] = [];
  for (const edge of scene.edges) {
    const sourceOwner = ownerOf.get(edge.source);
    const targetOwner = ownerOf.get(edge.target);
    // Neither end is hidden: `port-outer` and `exterior` both land here and
    // both are the SAME OBJECT — a projection that copied them would make
    // every host's edge memo churn for edges nothing happened to.
    if (sourceOwner === undefined && targetOwner === undefined) {
      edges.push(edge);
      continue;
    }
    // `interior` — "from inside member to inside member those can all be
    // hidden" (boundary.ts's quoted rule).
    if (sourceOwner !== undefined && sourceOwner === targetOwner) continue;
    // `port-inner` — the region's own port wired to something inside it (a
    // loop's `Iter` cable). Private wiring, never re-pointed: promoting it
    // would draw the region's own port feeding the region's own port, and
    // "never mix data and control lines" starts with not inventing a cable
    // that the expanded document does not contain.
    if (sourceOwner !== undefined && edge.target === sourceOwner) continue;
    if (targetOwner !== undefined && edge.source === targetOwner) continue;

    // A crossing edge: the hidden end moves to the card's promoted port.
    // `id`, `data` and the end that is still visible are untouched — that
    // is the whole trick, and it is the same one `collapse.ts:242-262`
    // plays, minus the document write.
    let next = edge;
    if (sourceOwner !== undefined) {
      const portId = promotedIdFor(sourceOwner, edge.source, edge.sourceHandle);
      if (portId !== undefined) next = { ...next, source: sourceOwner, sourceHandle: portId };
    }
    if (targetOwner !== undefined) {
      const portId = promotedIdFor(targetOwner, edge.target, edge.targetHandle);
      if (portId !== undefined) next = { ...next, target: targetOwner, targetHandle: portId };
    }
    edges.push(next);
  }

  // `scene.nodes` ITSELF: the one sentence this module exists to make true.
  return { nodes: scene.nodes, edges, regions };
}
