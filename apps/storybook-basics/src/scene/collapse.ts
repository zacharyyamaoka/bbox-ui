// src/scene/collapse.ts — group and ungroup, as two pure functions over
// `BlockScene` that undo each other.
//
// Zach, 2026-09-18: "This is going to be the bread and butter of what we are
// doing here!!!" and "A lot of design is basically just changing how we are
// grouping and ungrouping things."
//
// ── THE ONE DESIGN DECISION THAT MAKES THE INVERSE POSSIBLE ─────────────
//
// A collapse could have REMEMBERED what each container port stood for — a
// `data.promotedPorts` side-table on the region node — and dissolve could
// have read it back. That was the obvious design and it is the wrong one:
// the scene would then carry a fact only this module could maintain, it
// would go stale the moment anything else edited the region, and
// `findDanglingEdges` could never check it.
//
// Instead, a collapse SPLITS each crossing edge in two and leaves both
// halves in the scene:
//
//     before   outerNode/o ──────────────────────────────► innerNode/i
//     after    outerNode/o ──► region/p        region/p ──► innerNode/i
//               (the SAME edge, id and all,     (a new STUB edge)
//                just re-pointed at the port)
//
// which is what a hierarchical netlist has always done — a hierarchical pin
// has a net on each side of it. Three things fall out for free:
//
//   1. THE REGION IS GENUINELY ISOLATED, which is Zach's ruling: "100%
//      region is isolated. Regions in code are not linked, so our regions
//      shouldn't be either!" Nothing outside the region names anything
//      inside it any more; every reference goes through a port. That is
//      isolation as a structural property, not a rule someone has to obey.
//   2. DISSOLVE IS DERIVABLE, not remembered. Splicing `outer → region/p`
//      with `region/p → inner` is exactly Zach's "unwire helper": "if you
//      delete a parent, new wires are drawn that connect the children
//      directly to the things they were connected to before."
//   3. THE OUTER HALF KEEPS ITS ORIGINAL ID, `data`, AND ARRAY POSITION,
//      so splicing restores the original edge record byte for byte rather
//      than a fresh one that merely connects the same two things. That is
//      what makes the round trip assertable as scene equality instead of
//      set equality.
//
// ── WHAT ROUND-TRIPS EXACTLY, AND WHAT DOES NOT ────────────────────────
//
// EXACT: every original edge's id, ends, handles, `data` and array index;
// every node's id, `type`, `data`, `definitionId` and array index; and node
// positions whenever coordinates are integers (the normal case — measured
// in collapse.test.ts).
//
// NOT EXACT: node positions when coordinates are FRACTIONAL. Re-parenting
// rebases a child by `local − regionOrigin` and dissolve restores it by
// `local + regionOrigin`; in IEEE-754 `(a − r) + r` is not always `a`
// (measured: 0.1 − 0.3 + 0.3 = 0.10000000000000003). The error is ~1 ulp,
// it does not accumulate over repeated round trips beyond the first, and
// collapse.test.ts measures it rather than asserting it away.
//
// ALSO NOT EXACT: the stub edges' ids. They are minted, they exist only
// while the region does, and dissolve deletes them — so nothing survives a
// round trip to compare. Every id a caller ever saw before the collapse
// comes back unchanged.
//
// ── PROVENANCE ─────────────────────────────────────────────────────────
// Class (c) "ours, ad hoc" per docs/ALGORITHM-PROVENANCE.md, with two
// in-repo compositions rather than reimplementations: the
// `"drop" | "dangle" | "park"` remainder policy is `linking.ts`'s own
// `DeletedNodeEdgePolicy`, and the cross-scope refusal is
// `edgeValidation.ts`'s `allowCrossScope` permission and its `CROSS_SCOPE`
// code. The split-edge/hierarchical-pin structure is the standard shape of
// a hierarchical netlist; no specific source is claimed for it because none
// was read for this file.
//
// Pure: no React, no DOM, no canvas engine.

import type { ElbowRect } from "../components/elbow";
import {
  classifyBoundary,
  crossingEdges,
  promoteBoundary,
  type PromotedPort,
  type PromotionConflict,
  type PromotionPolicy,
} from "./boundary";
import { CROSS_SCOPE, type ConnectionMessage } from "./edgeValidation";
import type { DeletedNodeEdgePolicy } from "./linking";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import type { TraceGeometry } from "./portEdgeCrossing";
import { absolutePosition, boundsOfNodes, descendantsOf, selectionRoots, REGION_NODE_TYPE, type BoxOf } from "./region";
import {
  portKey,
  type BlockScene,
  type SceneData,
  type SceneEdge,
  type SceneNode,
  type ScenePortRef,
} from "./scene";

/* ------------------------------------------------------------------ */
/* Collapse                                                            */
/* ------------------------------------------------------------------ */

export interface CollapseOptions<N extends SceneData = SceneData, E extends SceneData = SceneData> {
  /** Mints the region node id and every stub edge id. Caller-owned — the
   *  D9 rule this kit already holds (`duplicateNode`, `mintItem`). */
  mintId: () => string;
  /**
   * Names a promoted port. Defaults to `portKey(inner.nodeId,
   * inner.portId)` — DERIVED from scene data the caller already owns, not
   * invented, and deterministic so a round trip and a story can both
   * compare against it. Two inner refs that collide under `portKey` were
   * already merged into one port by `promoteBoundary`'s own map, so the
   * default cannot create a collision this module does not already have.
   */
  mintPortId?: (inner: ScenePortRef) => string;
  /** Default `dagPolarityPolicy` — Zach's v1. */
  policy?: PromotionPolicy;
  directionOf?: PortDirectionOf;
  typeOf?: PortTypeOf;
  /** Sizes, for placing the region and for a geometry policy. */
  boxOf?: BoxOf;
  /** Per-edge route/chord, for a geometry policy. */
  geometryOf?: (edgeId: string) => TraceGeometry | undefined;
  /** `data` for the new region node. Default `{}` — `SceneNode.data` is
   *  required precisely so `{}` is the honest empty. */
  regionData?: N;
  /** The region's own `data.name`-style payload aside, a region NEVER gets
   *  a `definitionId`: "100% region is isolated" (region.ts's header). This
   *  option does not exist and will not be added here. */
  /**
   * Allow a selection whose roots sit under DIFFERENT parents. Default
   * false, refusing with `edgeValidation.ts`'s own `CROSS_SCOPE` code.
   *
   * WHY refuse rather than do it: collapse would have to re-parent roots
   * out of two different spaces into one, and dissolve could then only put
   * them all back under ONE parent — the region's. The original nesting is
   * destroyed by the operation and no amount of care at dissolve time can
   * recover it, so the round trip would be silently lossy in a way this
   * module could not even report. A refusal is the honest answer, and
   * `allowCrossScope` is already this repo's word for the permission.
   */
  allowCrossScope?: boolean;
}

export interface CollapseSuccess<N extends SceneData, E extends SceneData> {
  ok: true;
  scene: BlockScene<N, E>;
  regionId: string;
  /** The container's ports, in promotion order. */
  ports: PromotedPort[];
  /** Crossing edges that disagreed about a side — reported, not resolved. */
  conflicts: PromotionConflict[];
  /** How much the collapse hid: interior edges that no longer surface. */
  hidden: number;
}

/** Refusals are `Diagnostic`-shaped, exactly like `ConnectionVerdict`'s —
 *  give one an `id` and it IS a diagnostic a host can render. */
export type CollapseResult<N extends SceneData, E extends SceneData> =
  | CollapseSuccess<N, E>
  | { ok: false; refusal: ConnectionMessage };

function refuse(code: string, message: string): { ok: false; refusal: ConnectionMessage } {
  return { ok: false, refusal: { severity: "error", message, code } };
}

/** No node in the selection actually exists. */
export const EMPTY_SELECTION: string = "empty-selection";

/**
 * Draw a loose selection, promote it to a real container.
 *
 * Returns a NEW scene; the input is never mutated. Node and edge arrays
 * keep their original order with new records appended, which is what makes
 * `dissolveRegion` able to restore the input exactly.
 */
export function collapseToRegion<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeIds: readonly string[],
  options: CollapseOptions<N, E>,
): CollapseResult<N, E> {
  const { mintId, mintPortId = (inner) => portKey(inner.nodeId, inner.portId) } = options;

  const inside = descendantsOf(scene, nodeIds);
  if (inside.size === 0) {
    return refuse(EMPTY_SELECTION, `Nothing to collapse: none of the ${nodeIds.length} selected node ids is in the scene`);
  }
  const roots = selectionRoots(scene, inside);
  const parents = new Set(roots.map((node) => node.parentId));
  if (parents.size > 1 && options.allowCrossScope !== true) {
    const named = [...parents].map((id) => id ?? "(top level)").join(", ");
    return refuse(
      CROSS_SCOPE,
      `Cannot collapse a selection whose outermost members sit under different parents (${named}) — dissolving could only return them all to one`,
    );
  }
  const regionParentId = roots[0].parentId;

  // ---- classify + promote, against the LOOSE selection (no container) ----
  const report = classifyBoundary(scene, { inside });
  const box: ElbowRect | undefined = options.boxOf ? boundsOfNodes(scene, inside, options.boxOf) : undefined;
  const { ports, conflicts } = promoteBoundary(report, {
    policy: options.policy,
    directionOf: options.directionOf,
    typeOf: options.typeOf,
    box,
    geometryOf: options.geometryOf,
    mintPortId: ({ inner }) => mintPortId(inner),
  });

  // ---- place the region ----
  const regionId = mintId();
  // The region's ORIGIN in the parent's space: the min corner of its roots'
  // own local positions. Using the roots' LOCAL positions (not absolutes)
  // is what makes the rebase below a single subtraction and its inverse a
  // single addition — see this file's header on what round-trips exactly.
  const originX = Math.min(...roots.map((node) => node.position.x));
  const originY = Math.min(...roots.map((node) => node.position.y));
  const regionNode: SceneNode<N> = {
    id: regionId,
    type: REGION_NODE_TYPE,
    position: { x: originX, y: originY },
    data: options.regionData ?? ({} as N),
    ...(regionParentId !== undefined ? { parentId: regionParentId } : {}),
    // No `definitionId`, ever. See region.ts's header: regions are isolated.
  };

  const rootIds = new Set(roots.map((node) => node.id));
  const nodes: SceneNode<N>[] = scene.nodes.map((node) =>
    rootIds.has(node.id)
      ? { ...node, parentId: regionId, position: { x: node.position.x - originX, y: node.position.y - originY } }
      : node,
  );
  nodes.push(regionNode);

  // ---- split every crossing edge ----
  const portForInner = new Map(ports.map((port) => [portKey(port.inner.nodeId, port.inner.portId), port]));
  const outerHalf = new Map<string, { portId: string; kind: "inbound" | "outbound" }>();
  for (const hit of crossingEdges(report)) {
    const port = portForInner.get(portKey(hit.inner!.nodeId, hit.inner!.portId))!;
    outerHalf.set(hit.edge.id, { portId: port.id, kind: hit.kind as "inbound" | "outbound" });
  }

  const edges: SceneEdge<E>[] = scene.edges.map((edge) => {
    const half = outerHalf.get(edge.id);
    if (!half) return edge;
    // Re-point the edge's INSIDE end at the container's port. The outside
    // end, the id and `data` are untouched — that is the whole trick.
    //
    // WHY this MUTATES the document instead of resolving at render time
    // (maxGraph's stance, `GraphView.ts:1656-1679`, which never edits):
    // docs/GROUPING-ALGEBRA.md §1. Short version — three of Zach's rulings
    // are unsatisfiable by a projection: a collapse MINTS a node
    // ("100% its a node"), isolation has to be structural rather than
    // remembered ("100% region is isolated"), and a cable must survive its
    // child being deleted ("the cables can remain wired if they go through
    // the ports on the parent edge"), which it can only do by naming the
    // PORT. The projection reading is kept for the QUERY — `classifyBoundary`
    // and `promoteBoundary` mutate nothing — and rejected only here.
    // This is the lane's one decision-record candidate; see that doc.
    return half.kind === "outbound"
      ? { ...edge, source: regionId, sourceHandle: half.portId }
      : { ...edge, target: regionId, targetHandle: half.portId };
  });

  // One stub per PORT, not per edge: several outside members reading one
  // inner output share a single port and therefore a single interior wire.
  for (const port of ports) {
    const flowsOut = port.direction === "source";
    edges.push({
      id: mintId(),
      ...(flowsOut
        ? { source: port.inner.nodeId, target: regionId, targetHandle: port.id, ...(port.inner.portId !== "" ? { sourceHandle: port.inner.portId } : {}) }
        : { source: regionId, sourceHandle: port.id, target: port.inner.nodeId, ...(port.inner.portId !== "" ? { targetHandle: port.inner.portId } : {}) }),
    } as SceneEdge<E>);
  }

  return {
    ok: true,
    scene: { ...scene, nodes, edges },
    regionId,
    ports,
    conflicts,
    hidden: report.edges.filter((hit) => hit.kind === "interior").length,
  };
}

/* ------------------------------------------------------------------ */
/* Dissolve — the inverse Zach asked for by name                       */
/* ------------------------------------------------------------------ */

export interface DissolveOptions {
  /**
   * What to do with an outer edge whose port has NO interior wire behind
   * it — a hand-authored container port, or one whose child was deleted.
   * There is no child to reconnect it to, so Zach's "new wires are drawn
   * that connect the children directly" has nothing to draw.
   *
   * `linking.ts`'s own `DeletedNodeEdgePolicy` verbatim, so a host that
   * already chose a delete policy applies the same word here. Default
   * `"drop"`.
   */
  remainder?: DeletedNodeEdgePolicy;
}

export interface DissolveResult<N extends SceneData, E extends SceneData> {
  scene: BlockScene<N, E>;
  /** Edges spliced back into a direct child→outside wire, by id. */
  rewired: string[];
  /** Interior stub edges removed. */
  removedStubs: string[];
  /** Outer edges with nothing behind their port, handled by `remainder`. */
  orphaned: string[];
  /** Child node ids re-parented out of the container. */
  released: string[];
}

/**
 * Delete a container and keep its cables wired — Zach, twice, in his own
 * words:
 *
 *   "If you delete a block, then the cables can remain wired if they go
 *    through the ports on the parent edge! This makes it super cheap to
 *    just draw black boxes around anything."
 *
 *   "Unwire helpers — if you delete a parent, new wires are drawn that
 *    connect the children directly to the things they were connected to
 *    before."
 *
 * Exactly `collapseToRegion`'s inverse when the container was produced by
 * it; total and sensible when it was not (a hand-authored container with
 * ports dissolves the same way, and `remainder` covers its unbacked ports).
 *
 * Unknown `nodeId` returns the SAME scene object — the referentially-honest
 * no-op contract `duplicateNode` and `reconcilePortLane` already set.
 */
export function dissolveRegion<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  options: DissolveOptions = {},
): DissolveResult<N, E> {
  const container = scene.nodes.find((node) => node.id === nodeId);
  if (!container) return { scene, rewired: [], removedStubs: [], orphaned: [], released: [] };
  const remainder = options.remainder ?? "drop";

  const report = classifyBoundary(scene, { containerId: nodeId });

  // Which inner endpoint does each container port stand for? Read straight
  // off the interior stubs — never remembered. A port with several stubs
  // keeps the FIRST in scene order; that only happens on a hand-authored
  // container, since a collapse writes exactly one stub per port.
  const behind = new Map<string, ScenePortRef>();
  const stubIds = new Set<string>();
  for (const hit of report.edges) {
    if (hit.kind !== "port-inner") continue;
    const portId = hit.edge.source === nodeId ? (hit.edge.sourceHandle ?? "") : (hit.edge.targetHandle ?? "");
    stubIds.add(hit.edge.id);
    if (!behind.has(portId)) behind.set(portId, hit.inner!);
  }

  const rewired: string[] = [];
  const orphaned: string[] = [];
  const dropped = new Set<string>(stubIds);

  const spliced: SceneEdge<E>[] = [];
  for (const edge of scene.edges) {
    if (dropped.has(edge.id)) continue;
    const hit = report.edges.find((candidate) => candidate.edge.id === edge.id)!;
    if (hit.kind !== "port-outer") {
      spliced.push(edge);
      continue;
    }
    const containerIsSource = edge.source === nodeId;
    const portId = containerIsSource ? (edge.sourceHandle ?? "") : (edge.targetHandle ?? "");
    const inner = behind.get(portId);
    if (!inner) {
      orphaned.push(edge.id);
      // `"drop"` removes it; `"dangle"`/`"park"` keep it pointing at a node
      // that is about to disappear — deliberately, and detectably, because
      // `findDanglingEdges` (scene.ts) is what makes that state safe rather
      // than silent corruption. This is linking.ts's own argument, reused.
      if (remainder !== "drop") spliced.push(edge);
      continue;
    }
    rewired.push(edge.id);
    // The container end becomes the inner endpoint: same edge record, same
    // id, same `data`, same array position. This is the restoration.
    spliced.push(
      containerIsSource
        ? { ...edge, source: inner.nodeId, ...(inner.portId !== "" ? { sourceHandle: inner.portId } : { sourceHandle: undefined }) }
        : { ...edge, target: inner.nodeId, ...(inner.portId !== "" ? { targetHandle: inner.portId } : { targetHandle: undefined }) },
    );
  }

  // Release the children into the container's own parent, undoing the
  // rebase exactly (see this file's header).
  const released: string[] = [];
  const nodes: SceneNode<N>[] = [];
  for (const node of scene.nodes) {
    if (node.id === nodeId) continue;
    if (node.parentId !== nodeId) {
      nodes.push(node);
      continue;
    }
    released.push(node.id);
    const restored: SceneNode<N> = {
      ...node,
      position: { x: node.position.x + container.position.x, y: node.position.y + container.position.y },
    };
    if (container.parentId === undefined) delete restored.parentId;
    else restored.parentId = container.parentId;
    nodes.push(restored);
  }

  return { scene: { ...scene, nodes, edges: spliced }, rewired, removedStubs: [...stubIds], orphaned, released };
}

/**
 * `deleteNodeRewiring` — the name the lane brief uses, and the operation
 * Zach described as deleting a parent. An alias rather than a second
 * implementation: "delete this container but keep the cables" and "ungroup
 * this region" are the same transformation, and giving them two bodies is
 * how they start disagreeing.
 *
 * Note what this is NOT: `linking.ts`'s `deleteNode`, which deletes a node
 * AND every `parentId` descendant ("containment is ownership"). That is the
 * right behaviour for deleting a block with its contents; this is the right
 * behaviour for deleting only the box someone drew around things.
 */
export const deleteNodeRewiring = dissolveRegion;

/* ------------------------------------------------------------------ */
/* Round trip — the assertion this lane is really about                */
/* ------------------------------------------------------------------ */

/** One edge as its identity-free connection fact. What "the same edge set"
 *  means when ids are allowed to differ. */
export function edgeSignature(edge: SceneEdge<SceneData>): string {
  return `${edge.source}/${edge.sourceHandle ?? ""} -> ${edge.target}/${edge.targetHandle ?? ""}`;
}

/** The scene's connection facts, sorted — comparable across a round trip
 *  without depending on array order or on minted ids. */
export function edgeSignatures<E extends SceneData>(scene: { edges: readonly SceneEdge<E>[] }): string[] {
  return scene.edges.map(edgeSignature).sort();
}
