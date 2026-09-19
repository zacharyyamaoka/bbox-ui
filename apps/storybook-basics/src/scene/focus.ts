// src/scene/focus.ts — the pure half of the "focus view" lens: given a
// scene, a seed (a node or an edge), and a bounded step count in each
// direction, which nodes and edges should stay bright.
//
// Ported from SystemSketch's propagation reading lens — Zach, 2026-09-18:
// "We did a lot of nice work with the actual design of the slider... There
// is the pure functional code that can go in scene with regards to like
// calculating the graph traversal to see which nodes and edges to
// highlight/focus". Two donor files, two different treatments:
//
//   - `propagationGraph.ts` (134 lines) is ALREADY pure — no tldraw import,
//     no Editor. `focusReachableDepth`/`walkFocus` below are that file
//     copied near-verbatim, with `DirectedPropagationEdge`'s
//     `edgeId`/`sourceId`/`sinkId` renamed to this repo's own
//     `id`/`source`/`target` (`SceneEdge`'s own field names, scene.ts) so
//     the same function reads a `BlockScene`'s `edges` directly with no
//     adapter struct in between.
//   - `propagationFocus.ts` (434 lines) is tldraw-bound: `Editor`,
//     `TLShapeId`, `useSyncExternalStore`, a `WeakMap<Editor, …>` store, a
//     `MutationObserver`-driven DOM lens, and a connection-admission filter
//     over tldraw's own binding graph. None of that travels. What DOES
//     travel is its DECISION POLICY — `rootsFor` (a selected edge lights
//     both its own endpoints and expands past them; a selected node lights
//     itself and expands both ways), `stepLimitsFor` (each direction's
//     slider maximum is measured by the SAME traversal the lens performs,
//     and downstream's cap is measured against whatever upstream's chosen
//     range already lit — donor's own WHY, preserved below), and
//     `snapshotFor` (clamp the requested steps into that range, then walk).
//     `focusStepLimits`/`focusSnapshot` below are that policy, re-expressed
//     over a `BlockScene` and a plain seed id instead of an `Editor` and a
//     `TLShapeId` — no shape lookups, no store, no subscription. The
//     store/subscription/DOM-dimming half stays host state; see
//     `src/editor/README.md`.
//
// Donor: /home/bam/systemsketch/src/propagation/propagationGraph.ts (full
// file, 134 lines) and propagationFocus.ts:16-27 (`normalizePropagationSteps`),
// :24-28 (`clampPropagationSteps`), :251-345 (`rootsFor`/`getPropagationFocusStepLimits`/
// `stepLimitsFor`/`snapshotFor`). Read 2026-09-18. See
// docs/ALGORITHM-PROVENANCE.md.

/** One directed connection, in the minimal shape this module needs — a
 *  `SceneEdge` satisfies it structurally with no cast (matching this repo's
 *  own scene.ts convention of typing pure functions by the slice of the
 *  record they actually read, not the whole `BlockScene`). */
export interface FocusEdgeEnds {
  id: string;
  source: string;
  target: string;
}

export type FocusDirection = "upstream" | "downstream";

export interface FocusWalk {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

/**
 * The furthest useful breadth-first expansion in one direction.
 *
 * Deliberately not a longest-simple-path search through a cyclic graph.
 * Instead it mirrors the lens's visited-node walk and stops at the last
 * step that would add a node or edge not already present in the supplied
 * evidence — donor `propagationGraph.ts:20-26`'s own WHY, unchanged.
 */
export function focusReachableDepth(
  edges: readonly FocusEdgeEnds[],
  starts: readonly string[],
  direction: FocusDirection,
  initialNodes: readonly string[] = [],
  initialEdges: readonly string[] = [],
): number {
  let frontier = new Set(starts);
  const expanded = new Set<string>();
  const nodes = new Set(initialNodes);
  const includedEdges = new Set(initialEdges);
  let depth = 0;
  let usefulDepth = 0;
  while (frontier.size > 0) {
    const expandable = new Set([...frontier].filter((id) => !expanded.has(id)));
    if (expandable.size === 0) break;
    for (const id of expandable) {
      expanded.add(id);
      nodes.add(id);
    }
    const next = new Set<string>();
    const evidenceBefore = nodes.size + includedEdges.size;
    for (const edge of edges) {
      const from = direction === "upstream" ? edge.target : edge.source;
      const to = direction === "upstream" ? edge.source : edge.target;
      if (!expandable.has(from)) continue;
      includedEdges.add(edge.id);
      const wasSeen = nodes.has(to);
      nodes.add(from);
      nodes.add(to);
      if (!wasSeen && !frontier.has(to)) next.add(to);
    }
    depth += 1;
    // A selected edge's endpoints and edge are already evidence. Do not
    // offer another slider position merely to revisit one of those records.
    if (nodes.size + includedEdges.size === evidenceBefore) break;
    usefulDepth = depth;
    frontier = new Set([...next].filter((id) => !expanded.has(id)));
  }
  return usefulDepth;
}

function addAdjacent(
  edges: readonly FocusEdgeEnds[],
  frontier: ReadonlySet<string>,
  direction: FocusDirection,
  nodes: Set<string>,
  includedEdges: Set<string>,
): Set<string> {
  const next = new Set<string>();
  for (const edge of edges) {
    const from = direction === "upstream" ? edge.target : edge.source;
    const to = direction === "upstream" ? edge.source : edge.target;
    if (!frontier.has(from)) continue;
    // An edge is a first-class scene object. Keeping it in the result means
    // branching still reads as real flow rather than a set of glowing nodes.
    includedEdges.add(edge.id);
    const wasSeen = nodes.has(to);
    nodes.add(from);
    nodes.add(to);
    if (!wasSeen && !frontier.has(to)) next.add(to);
  }
  return next;
}

/**
 * Walk independently in both directions, with a hard caller-supplied bound.
 *
 * A visited node is never expanded twice. That terminates cycles while
 * still retaining the closing edge, which is the useful evidence that a
 * cycle exists. Fan-in and fan-out remain sets, rather than being
 * arbitrarily reduced to one "primary" route.
 */
export function walkFocus({
  edges,
  upstreamStarts,
  downstreamStarts,
  upstreamSteps,
  downstreamSteps,
  initialNodes = [],
  initialEdges = [],
}: {
  edges: readonly FocusEdgeEnds[];
  upstreamStarts: readonly string[];
  downstreamStarts: readonly string[];
  upstreamSteps: number;
  downstreamSteps: number;
  initialNodes?: readonly string[];
  initialEdges?: readonly string[];
}): FocusWalk {
  const nodes = new Set(initialNodes);
  const includedEdges = new Set(initialEdges);
  const walk = (starts: readonly string[], steps: number, direction: FocusDirection) => {
    let frontier = new Set(starts);
    const expanded = new Set<string>();
    for (let step = 0; step < Math.max(0, steps) && frontier.size > 0; step++) {
      for (const id of frontier) nodes.add(id);
      const expandable = new Set([...frontier].filter((id) => !expanded.has(id)));
      if (expandable.size === 0) break;
      for (const id of expandable) expanded.add(id);
      const next = addAdjacent(edges, expandable, direction, nodes, includedEdges);
      frontier = new Set([...next].filter((id) => !expanded.has(id)));
    }
  };
  walk(upstreamStarts, upstreamSteps, "upstream");
  walk(downstreamStarts, downstreamSteps, "downstream");
  return { nodes, edges: includedEdges };
}

/* ------------------------------------------------------------------ */
/* Policy — re-expressed from propagationFocus.ts's Editor-bound half,   */
/* over a plain scene and a plain seed id (donor :16-28, :266-345).      */
/* ------------------------------------------------------------------ */

/** Browser number inputs (and a slider's own `onChange`) can yield blanks,
 *  decimals, and NaN while being edited. Donor `propagationFocus.ts:19-22`. */
export function normalizeFocusSteps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/** A direction with a neighbour begins at one; a dead end is the only
 *  zero. Donor `propagationFocus.ts:24-28`. */
function clampFocusSteps(value: number, maximum: number): number {
  if (maximum === 0) return 0;
  return Math.min(Math.max(1, normalizeFocusSteps(value)), maximum);
}

export interface FocusStepLimits {
  upstream: number;
  downstream: number;
}

interface FocusRoots {
  upstreamStarts: string[];
  downstreamStarts: string[];
  initialNodes: string[];
  initialEdges: string[];
}

/**
 * A selected edge begins with its two concrete endpoints lit and expands
 * past either end; a selected node uses the node itself as both directional
 * root. Donor `propagationFocus.ts:266-286` (`rootsFor`) — the tldraw shape
 * lookups and canonical-connection admission are gone, replaced by plain
 * scene membership: `seedId` is a root only if it actually names a node or
 * an edge in THIS scene.
 */
function rootsForSeed(
  scene: { nodes: readonly { id: string }[]; edges: readonly FocusEdgeEnds[] },
  seedId: string,
): FocusRoots | null {
  if (scene.nodes.some((node) => node.id === seedId)) {
    return { upstreamStarts: [seedId], downstreamStarts: [seedId], initialNodes: [seedId], initialEdges: [] };
  }
  const seedEdge = scene.edges.find((edge) => edge.id === seedId);
  if (seedEdge) {
    return {
      upstreamStarts: [seedEdge.source],
      downstreamStarts: [seedEdge.target],
      initialNodes: [seedEdge.source, seedEdge.target],
      initialEdges: [seedEdge.id],
    };
  }
  return null;
}

/**
 * Simulate the lens in its real upstream-then-downstream order: the
 * downstream cap is measured against whatever upstream's chosen range
 * already lit, so a feedback edge can never consume a displayed slider
 * position without changing the focused set at all. Donor
 * `propagationFocus.ts:316-345` (`stepLimitsFor`).
 */
function stepLimitsFor(edges: readonly FocusEdgeEnds[], roots: FocusRoots, requestedUpstreamSteps: number): FocusStepLimits {
  const upstream = focusReachableDepth(edges, roots.upstreamStarts, "upstream", roots.initialNodes, roots.initialEdges);
  const upstreamSteps = clampFocusSteps(requestedUpstreamSteps, upstream);
  const upstreamWalk = walkFocus({ edges, ...roots, upstreamSteps, downstreamSteps: 0 });
  return {
    upstream,
    downstream: focusReachableDepth(edges, roots.downstreamStarts, "downstream", [...upstreamWalk.nodes], [...upstreamWalk.edges]),
  };
}

/**
 * Return the actual useful range for each direction from this seed.
 *
 * WHY: a fixed ceiling makes a reading tool lie twice: shallow graphs
 * invite pointless clicks, while deep graphs silently hide real
 * dependencies. These caps are derived from the same breadth-first
 * traversal used by the lens, so every non-zero slider position can reveal
 * a reachable graph layer. Donor `propagationFocus.ts:293-309`
 * (`getPropagationFocusStepLimits`).
 */
export function focusStepLimits(
  scene: { nodes: readonly { id: string }[]; edges: readonly FocusEdgeEnds[] },
  seedId: string,
  upstreamSteps = 1,
): FocusStepLimits {
  const roots = rootsForSeed(scene, seedId);
  if (!roots) return { upstream: 0, downstream: 0 };
  return stepLimitsFor(scene.edges, roots, upstreamSteps);
}

export interface FocusSnapshot {
  seedId: string | null;
  upstreamSteps: number;
  downstreamSteps: number;
  /** The real scene objects allowed to stay bright. */
  includedNodeIds: ReadonlySet<string>;
  includedEdgeIds: ReadonlySet<string>;
}

const EMPTY_FOCUS_SNAPSHOT: FocusSnapshot = {
  seedId: null,
  upstreamSteps: 0,
  downstreamSteps: 0,
  includedNodeIds: new Set(),
  includedEdgeIds: new Set(),
};

/**
 * `F(scene, seed, depths) → the focused set of node and edge ids` — the
 * function Zach asked for. Clamps the requested steps into each
 * direction's real range (`focusStepLimits`), then walks. A `seedId` that
 * names nothing in this scene, or `null`, is the honest empty snapshot —
 * never a throw. Donor `propagationFocus.ts:325-345` (`snapshotFor`).
 */
export function focusSnapshot(
  scene: { nodes: readonly { id: string }[]; edges: readonly FocusEdgeEnds[] },
  seedId: string | null,
  upstreamSteps: number,
  downstreamSteps: number,
): FocusSnapshot {
  if (!seedId) return EMPTY_FOCUS_SNAPSHOT;
  const roots = rootsForSeed(scene, seedId);
  if (!roots) return EMPTY_FOCUS_SNAPSHOT;
  const limits = stepLimitsFor(scene.edges, roots, upstreamSteps);
  const upstream = clampFocusSteps(upstreamSteps, limits.upstream);
  const downstream = clampFocusSteps(downstreamSteps, limits.downstream);
  const walk = walkFocus({ edges: scene.edges, ...roots, upstreamSteps: upstream, downstreamSteps: downstream });
  return {
    seedId,
    upstreamSteps: upstream,
    downstreamSteps: downstream,
    includedNodeIds: walk.nodes,
    includedEdgeIds: walk.edges,
  };
}
