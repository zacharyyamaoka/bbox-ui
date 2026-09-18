// src/scene/boundaryWiring.ts — the wire helpers: what happens when
// someone draws a cable that would have to leave the box it starts in.
//
// ── ZACH'S TWO CASES, AND THE TOGGLE HE ASKED FOR ──────────────────────
//
// Case 1, child → its own parent's edge: place a port on the parent, with
// the child's datatype where the scene can state one. This one is never
// refused — the cable is not escaping anything, it is declaring the
// parent's public interface, which is the thing a port IS.
//
// Case 2, child → something outside the parent entirely: either refuse, or
// punch the intermediate port through. He was explicit that this is a
// TOGGLE and explicit about why the OFF position is the good default:
//
//     "having it off is nice cause then you think in terms of public api
//      first"
//
// So `AUTO_PORT_OFF` is the default and it is not a limitation — refusing
// is the feature. `"create"` is the convenience for when you already know
// what you meant.
//
// When it does create, placement is Zach's: "auto-create the intermediate
// port, placed via the intersection function — best-effort from where the
// wire or a straight line crosses the edge." That is `portEdgeCrossing.ts`
// verbatim, fed the real route when the caller has one and the straight
// chord when it does not, with `PortEdgeLocation.by` reporting which.
//
// ── WHAT THIS COMPOSES RATHER THAN REWRITES ────────────────────────────
//
//   `validateConnection`  (edgeValidation.ts) — legality of each hop. This
//                         module decides ROUTE, never legality, and it
//                         re-uses the judge's ORIENTED ends (docs/peps/0002)
//                         rather than assuming the gesture's order.
//   `ancestorsOf`         (region.ts) — the containment chain to walk.
//   `portEdgeLocation`    (portEdgeCrossing.ts) — where each port lands.
//   `arePortTypesCompatible` (magnet/magnetPortTypes.ts) — the type gate,
//                         called through an injected `compatible` so this
//                         file takes no opinion on matching strictness.
//   `CROSS_SCOPE`         (edgeValidation.ts) — the refusal code for "these
//                         two sit in different scopes". The donor's own
//                         word (`no-shared-scope`), not a new one.
//
// PROVENANCE: class (c) "ours, ad hoc". The lowest-common-ancestor walk is
// the textbook one over an explicit parent chain (two short lists, a set
// membership test — no algorithm is claimed and none was read). Everything
// with real math behind it is cited at the composition above.
//
// Pure: no React, no DOM, no canvas engine.

import type { ElbowRect } from "../components/elbow";
import type { BlockSide } from "../components/port.layout";
import { dagPolarityPolicy, type PromotedPort, type PromotionPolicy } from "./boundary";
import { CROSS_SCOPE, type ConnectionMessage } from "./edgeValidation";
import type { PortDirection, PortDirectionOf, PortTypeOf, TypeCompatible } from "./lint";
import { portEdgeLocation, type TraceGeometry } from "./portEdgeCrossing";
import { absolutePosition, ancestorsOf, type BoxOf } from "./region";
import { portKey, type BlockScene, type SceneData, type SceneEdge, type ScenePortRef } from "./scene";

/* ------------------------------------------------------------------ */
/* The toggle                                                          */
/* ------------------------------------------------------------------ */

/**
 * `"refuse"` — a cable that would cross a container boundary is refused,
 * with the boundary named. Zach's default, for his stated reason.
 * `"create"` — the intermediate ports are punched through automatically.
 */
export type AutoPortPolicy = "refuse" | "create";

/** His default, named so a caller reads the intent and not a string. */
export const AUTO_PORT_OFF: AutoPortPolicy = "refuse";

export interface BoundaryWiringOptions<N extends SceneData = SceneData, E extends SceneData = SceneData> {
  /** Default `AUTO_PORT_OFF`. */
  autoPort?: AutoPortPolicy;
  /** Mints edge ids, and the region-side port ids when `mintPortId` is
   *  omitted. Caller-owned (D9). */
  mintId: () => string;
  /** Names an auto-created port on `containerId`. Default derives from the
   *  originating endpoint, so the same wire always punches the same port. */
  mintPortId?: (input: { containerId: string; origin: ScenePortRef; side: BlockSide }) => string;
  /** Where a punched port lands. Default `dagPolarityPolicy` — Zach's v1. */
  policy?: PromotionPolicy;
  directionOf?: PortDirectionOf;
  typeOf?: PortTypeOf;
  /** The type gate. Omitted, no type judgement is made — the kit-wide
   *  "undefined = unknown" convention. Pass
   *  `magnet/magnetPortTypes.arePortTypesCompatible`-derived logic here. */
  compatible?: TypeCompatible;
  /** Container sizes, for placing punched ports by geometry. */
  boxOf?: BoxOf;
  /** The cable's own route, when the caller has one. Absent → the straight
   *  chord between the two endpoints stands in, which is exactly what Zach
   *  asked for ("or a straight line"). */
  geometry?: TraceGeometry;
  /** `data` for every edge this creates. */
  edgeData?: E;
}

export interface BoundaryWiringSuccess<N extends SceneData, E extends SceneData> {
  ok: true;
  scene: BlockScene<N, E>;
  /** The ports punched through, outermost-last along the cable's path.
   *  Empty when both ends already shared a scope. */
  created: PromotedPort[];
  /** Every edge id created, in path order from `from` to `to`. */
  edgeIds: string[];
  /** The containers crossed, in path order. */
  crossed: string[];
}

export type BoundaryWiringResult<N extends SceneData, E extends SceneData> =
  | BoundaryWiringSuccess<N, E>
  | { ok: false; refusal: ConnectionMessage };

/** A punched port carries no declared type because the origin had none. */
export const UNTYPED_PORT: string = "untyped-port";

/* ------------------------------------------------------------------ */
/* The containment walk                                                */
/* ------------------------------------------------------------------ */

export interface BoundaryPath {
  /** Containers `from` must leave, nearest first. */
  out: string[];
  /** Containers `to` must be entered, outermost first. */
  in: string[];
  /** The shared scope, or `undefined` for the top level. */
  commonAncestor?: string;
}

/**
 * Which boundaries a cable from `a` to `b` has to cross. Pure list surgery
 * over `ancestorsOf`; no geometry, no judgement.
 *
 * An id that is not in the scene contributes an empty chain, so a cable
 * naming a missing node crosses nothing here and is refused later by
 * `validateConnection`'s dangling gate — which is the rule that owns that
 * failure, and duplicating it here is how the two start disagreeing.
 */
export function boundaryPath<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  a: string,
  b: string,
): BoundaryPath {
  const fromChain = ancestorsOf(scene, a);
  const toChain = ancestorsOf(scene, b);
  const toSet = new Set(toChain);
  const commonAncestor = fromChain.find((id) => toSet.has(id));
  const stopAt = (chain: string[]) => {
    const cut = commonAncestor === undefined ? chain.length : chain.indexOf(commonAncestor);
    return chain.slice(0, cut === -1 ? chain.length : cut);
  };
  return {
    out: stopAt(fromChain),
    // Entered from the outside in, so the far end's chain reverses.
    in: stopAt(toChain).reverse(),
    ...(commonAncestor !== undefined ? { commonAncestor } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The helper                                                          */
/* ------------------------------------------------------------------ */

function chordBetween<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  a: string,
  b: string,
): TraceGeometry | undefined {
  const start = absolutePosition(scene, a);
  const end = absolutePosition(scene, b);
  if (!start || !end) return undefined;
  return { start, end };
}

/**
 * Wire `from` to `to`, punching a port through every container boundary in
 * between — or refusing, per `autoPort`.
 *
 * The chain it builds is `from → C1/p1`, `C1/p1 → C2/p2`, …, `Cn/pn → to`:
 * one edge per hop, so every container the cable passes through owns a real
 * port and nothing outside a container ever names anything inside it. That
 * is the same isolation invariant `collapse.ts` maintains, reached from the
 * other direction.
 */
export function wireAcrossBoundary<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  from: ScenePortRef,
  to: ScenePortRef,
  options: BoundaryWiringOptions<N, E>,
): BoundaryWiringResult<N, E> {
  const {
    autoPort = AUTO_PORT_OFF,
    mintId,
    mintPortId = ({ origin }) => portKey(origin.nodeId, origin.portId),
    policy = dagPolarityPolicy,
    directionOf,
    typeOf,
    compatible,
    boxOf,
    edgeData,
  } = options;

  const path = boundaryPath(scene, from.nodeId, to.nodeId);
  const crossed = [...path.out, ...path.in];

  // ---- the type gate, once, on the real endpoints ----
  const fromTypes = from.portId === "" ? undefined : typeOf?.(from);
  const toTypes = to.portId === "" ? undefined : typeOf?.(to);
  if (compatible && fromTypes && toTypes && !compatible(fromTypes, toTypes)) {
    return {
      ok: false,
      refusal: {
        severity: "error",
        code: "type-mismatch",
        message: `"${portKey(from.nodeId, from.portId)}" carries [${fromTypes.join(", ")}], which "${portKey(to.nodeId, to.portId)}" ([${toTypes.join(", ")}]) does not accept`,
      },
    };
  }

  if (crossed.length === 0) {
    // Same scope: one ordinary edge, no ports punched. Legality is
    // `validateConnection`'s call, not this module's.
    const id = mintId();
    const edge = { id, source: from.nodeId, target: to.nodeId, ...(from.portId !== "" ? { sourceHandle: from.portId } : {}), ...(to.portId !== "" ? { targetHandle: to.portId } : {}), ...(edgeData !== undefined ? { data: edgeData } : {}) } as SceneEdge<E>;
    return { ok: true, scene: { ...scene, edges: [...scene.edges, edge] }, created: [], edgeIds: [id], crossed: [] };
  }

  if (autoPort === "refuse") {
    return {
      ok: false,
      refusal: {
        severity: "error",
        code: CROSS_SCOPE,
        message: `"${portKey(from.nodeId, from.portId)}" cannot reach "${portKey(to.nodeId, to.portId)}" without a port on ${crossed.map((id) => `"${id}"`).join(" and ")} — declare the public interface first, or turn auto-port on`,
      },
    };
  }

  // ---- punch a port through each boundary ----
  const geometry = options.geometry ?? chordBetween(scene, from.nodeId, to.nodeId);
  const created: PromotedPort[] = [];
  const edges: SceneEdge<E>[] = [];
  const edgeIds: string[] = [];
  let cursor: ScenePortRef = from;

  const hops: { containerId: string; leaving: boolean }[] = [
    ...path.out.map((containerId) => ({ containerId, leaving: true })),
    ...path.in.map((containerId) => ({ containerId, leaving: false })),
  ];

  for (const { containerId, leaving } of hops) {
    const box: ElbowRect | undefined = boxOf?.(containerId);
    const decision = policy({
      // Leaving a container is `outbound` from that container's point of
      // view; entering one is `inbound`. Same words `boundary.ts` uses.
      kind: leaving ? "outbound" : "inbound",
      inner: leaving ? cursor : to,
      outer: leaving ? to : cursor,
      edge: { id: "", source: from.nodeId, sourceHandle: from.portId || undefined, target: to.nodeId, targetHandle: to.portId || undefined },
      directionOf,
      ...(box !== undefined ? { box } : {}),
      ...(geometry !== undefined ? { geometry } : {}),
    });
    // Zach's placement rule, applied: where the straight line (or the real
    // wire) crosses this container's own edge.
    const hit = box && geometry ? portEdgeLocation(geometry, box, { direction: leaving ? "exit" : "enter" }) : null;
    const side: BlockSide = hit?.side ?? decision.side;
    const portId = mintPortId({ containerId, origin: cursor, side });
    const direction: PortDirection = leaving ? "source" : "sink";
    const declared = fromTypes && fromTypes.length > 0 ? fromTypes[0] : undefined;
    created.push({
      id: portId,
      side,
      direction,
      seat: hit ? "rail" : decision.seat,
      band: decision.band,
      ...(hit ? { t: hit.t } : {}),
      inner: cursor,
      outer: [to],
      edgeIds: [],
      ...(declared !== undefined ? { portType: declared } : {}),
      by: hit ? "geometry" : decision.by,
    });
    const id = mintId();
    edgeIds.push(id);
    edges.push({
      id,
      source: cursor.nodeId,
      ...(cursor.portId !== "" ? { sourceHandle: cursor.portId } : {}),
      target: containerId,
      targetHandle: portId,
      ...(edgeData !== undefined ? { data: edgeData } : {}),
    } as SceneEdge<E>);
    created[created.length - 1].edgeIds.push(id);
    cursor = { nodeId: containerId, portId };
  }

  // The last hop may ALREADY have landed on `to` — that is exactly
  // `wireChildToParent`, whose far end IS the container the single boundary
  // belongs to. Emitting a closing edge there would wire the port to
  // itself, which `validateConnection`'s `self-connection` gate would then
  // have to refuse for a cable this module created on purpose.
  if (!(cursor.nodeId === to.nodeId && cursor.portId === to.portId)) {
    const lastId = mintId();
    edgeIds.push(lastId);
    edges.push({
      id: lastId,
      source: cursor.nodeId,
      ...(cursor.portId !== "" ? { sourceHandle: cursor.portId } : {}),
      target: to.nodeId,
      ...(to.portId !== "" ? { targetHandle: to.portId } : {}),
      ...(edgeData !== undefined ? { data: edgeData } : {}),
    } as SceneEdge<E>);
  }

  return { ok: true, scene: { ...scene, edges: [...scene.edges, ...edges] }, created, edgeIds, crossed };
}

/**
 * Zach's case 1: a child declaring a port on its own parent. Never refused
 * — a child reaching its parent's edge is the parent's public interface
 * being written, not a cable escaping anything, so `autoPort` does not
 * apply. The datatype comes across when `typeOf` states one.
 *
 * Implemented as `wireAcrossBoundary` with the parent as the far end and
 * auto-port forced on, rather than a second body: "child to parent" is the
 * one-boundary case of "child to anywhere", and two implementations of one
 * rule is how they stop agreeing.
 */
export function wireChildToParent<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  child: ScenePortRef,
  parentId: string,
  options: BoundaryWiringOptions<N, E>,
): BoundaryWiringResult<N, E> {
  const portId = (options.mintPortId ?? (({ origin }) => portKey(origin.nodeId, origin.portId)))({
    containerId: parentId,
    origin: child,
    side: "right",
  });
  return wireAcrossBoundary(scene, child, { nodeId: parentId, portId }, { ...options, autoPort: "create" });
}
