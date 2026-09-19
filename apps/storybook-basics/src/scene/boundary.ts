// src/scene/boundary.ts — which edges cross a container's boundary, and
// where each one lands on it once the container is collapsed.
//
// ── ZACH'S RULE, QUOTED, THEN ENCODED ───────────────────────────────────
//
// 2026-09-18, asked what shows on a collapsed container, he answered it
// himself and completely:
//
//   "What edges should go there? Well of course any traces going to ports
//    on the parent block itself, AS WELL AS any traces going from outside
//    members to inside members. From inside member to inside member those
//    can all be hidden."
//
// `BoundaryClass` below is that sentence with one member per clause, and
// `surfaces` is the sentence as a single boolean. The two extra members
// (`exterior`, `port-inner`) are not additions to his rule — they are the
// cases his sentence does not mention because they are not candidates:
// an edge touching neither the container nor anything inside it, and the
// interior stub that binds a container port to the child it stands for
// (which only exists AFTER a collapse, see collapse.ts).
//
// ── AND WHERE A CROSSING EDGE LANDS — HIS v1, KEPT AS A POLICY ──────────
//
//   "How to know if outside member to inside member is an output or input?
//    Like if it's coming out the left or the right side? As a v1 we can
//    just assume that if it's connecting to an input port of an outside
//    member then it should go out the right side of the header! (this
//    assumes functional DAG, which is most of our cases!!!)"
//
// He called it "v1" himself, so it is a NAMED, SWAPPABLE policy
// (`dagPolarityPolicy`), not a branch. `crossingGeometryPolicy` is the
// second one, and it exists for a reason beyond symmetry: it is the
// FALSIFIER. It derives the side from where the cable actually meets the
// wall (`portEdgeCrossing.ts`), so the two policies can be run on one scene
// and made to disagree — which is how "where does v1 first break" becomes a
// measured fact instead of an opinion. See `DAG_HEURISTIC_LIMIT` below for
// the case, and Grouping.stories.tsx for it rendered.
//
// ── THE MECHANISM HE CHOSE ──────────────────────────────────────────────
//
//   "we can now support a port on the right side of the header. I like this
//    option actually. Instead of kind of overloading the port edge — we
//    already have sorted out putting ports on the headers so we can just
//    use that idea here."
//
// `PromotedPort.seat` carries that choice. `"header"` means the header
// band's own centre line — the RIGHT-wall twin of `blockPort.layout.ts`'s
// `functionPortCenterPx` (:456), which today computes only the LEFT one
// (`{x: bands.blockLeft, y: (headerTop + bodyTop) / 2}`). That right-wall
// twin DOES NOT EXIST YET and is the rendering lane's to add; this module
// states the seat, it does not paint it. `"rail"` means an ordinary
// `PortEdge` slot on that wall, which works today with `RailBand: "block"`
// (the band that spans the header; `"body"` cannot reach header height —
// blockPort.layout.ts:155, `railBoxFor`'s column-axis case).
//
// ── PROVENANCE ──────────────────────────────────────────────────────────
// Class (c) "ours, ad hoc" per docs/ALGORITHM-PROVENANCE.md. The
// classification is a set-membership partition and the v1 heuristic is
// Zach's own stated rule — neither is a published algorithm and none is
// claimed. What is NOT ours and IS cited: the Liang–Barsky clipper under
// `crossingGeometryPolicy` (via portEdgeCrossing.ts → elbow/, class (a),
// Excalidraw/SystemSketch), and the `source`/`sink` polarity vocabulary,
// which is `lint.ts`'s `PortDirectionOf` reused verbatim rather than a
// second spelling.
//
// Pure: no React, no DOM, no canvas engine.

import type { ElbowRect } from "../components/elbow";
import type { BlockSide } from "../components/port.layout";
import type { RailBand } from "../components/blockPort.layout";
import type { PortDirection, PortDirectionOf, PortTypeOf } from "./lint";
import { portEdgeLocation, type TraceGeometry } from "./portEdgeCrossing";
import { descendantsOf } from "./region";
import { childrenOf, portKey, type SceneData, type SceneEdge, type SceneEdgeEnds, type SceneNode, type ScenePortRef } from "./scene";

/* ------------------------------------------------------------------ */
/* Classification — his sentence, one member per clause                */
/* ------------------------------------------------------------------ */

/**
 * Where one edge stands relative to a container.
 *
 *   `interior`    both ends strictly inside. "From inside member to inside
 *                 member those can all be hidden."
 *   `inbound`     outside → inside. Half of "traces going from outside
 *                 members to inside members".
 *   `outbound`    inside → outside. The other half — his sentence names
 *                 one direction, but a functional block emits as well as
 *                 reads, and hiding the emitting half would black-hole
 *                 every output. Kept as its own member rather than folded
 *                 in, because promotion decides a DIFFERENT side for each.
 *   `port-outer`  one end is the container node itself, the other outside.
 *                 "any traces going to ports on the parent block itself".
 *   `port-inner`  one end is the container node itself, the other inside —
 *                 the interior stub a collapse creates (collapse.ts). Not
 *                 in his sentence because it cannot exist until there IS a
 *                 container. Hidden: it is the port's private wiring.
 *   `exterior`    neither end inside nor the container. Not a candidate.
 */
export type BoundaryClass = "interior" | "inbound" | "outbound" | "port-outer" | "port-inner" | "exterior";

/** His rule as one boolean: exactly the two clauses that say "show". */
const SURFACES: Readonly<Record<BoundaryClass, boolean>> = Object.freeze({
  interior: false,
  inbound: true,
  outbound: true,
  "port-outer": true,
  "port-inner": false,
  exterior: false,
});

/**
 * An endpoint as `{nodeId, portId}`. An edge end with NO handle wires the
 * NODE, not a port, and becomes `portId: ""` — `sceneWires.ts`'s own
 * established spelling for exactly that case ("An end with NO handle maps
 * to `portId: \"\"`"), reused rather than a second convention invented.
 */
function endRef(nodeId: string, handle: string | null | undefined): ScenePortRef {
  return { nodeId, portId: handle ?? "" };
}

export interface BoundaryEdge<E> {
  edge: E;
  kind: BoundaryClass;
  /** Zach's show/hide answer, precomputed. */
  surfaces: boolean;
  /** The endpoint on the inside — present for `inbound`, `outbound`,
   *  `port-inner` and (both ends) never for `interior`, which has two. */
  inner?: ScenePortRef;
  /** The endpoint outside — present for `inbound`, `outbound`,
   *  `port-outer`. */
  outer?: ScenePortRef;
}

export interface BoundaryReport<E> {
  /** Every edge, classified, in scene order. Total: the classes partition
   *  the edge list, so `edges.length` always equals the scene's. */
  edges: BoundaryEdge<E>[];
  /** The transitively-expanded inside set actually used. */
  inside: ReadonlySet<string>;
  /** The container node id, when there is one. */
  containerId?: string;
}

export interface ClassifyBoundaryOptions {
  /**
   * The node ids treated as inside. Expanded TRANSITIVELY (`descendantsOf`)
   * — selecting a block selects what it contains, because "containment is
   * ownership" is already this kit's rule (linking.ts's `deleteNode`).
   *
   * Omitted when `containerId` is given: the container's own children are
   * the inside set.
   */
  inside?: Iterable<string>;
  /**
   * An existing container. Absent while a LOOSE SELECTION is being judged
   * before it becomes a region — which is the case `collapseToRegion` runs
   * first, and the reason this function does not require one.
   */
  containerId?: string;
}

/**
 * Classify every edge against a boundary. Pure, total, order-preserving.
 *
 * Deliberately NOT filtered: the caller gets all six classes and decides.
 * Returning only the crossers would throw away the `interior` count, which
 * is the number that tells a person how much a collapse actually hid — and
 * that number is the whole visual payoff of the operation.
 */
export function classifyBoundary<N extends SceneData, E extends SceneEdgeEnds & { id: string }>(
  scene: { nodes: readonly SceneNode<N>[]; edges: readonly E[] },
  options: ClassifyBoundaryOptions,
): BoundaryReport<E> {
  const { containerId } = options;
  const seeds = options.inside ?? (containerId !== undefined ? childrenOf(scene, containerId).map((node) => node.id) : []);
  const inside = descendantsOf(scene, seeds);
  // The container is never "inside itself" — its own ports are the
  // boundary, which is exactly what `port-outer` / `port-inner` separate.
  if (containerId !== undefined) inside.delete(containerId);

  const edges = scene.edges.map((edge): BoundaryEdge<E> => {
    const sourceIn = inside.has(edge.source);
    const targetIn = inside.has(edge.target);
    const sourceIsContainer = containerId !== undefined && edge.source === containerId;
    const targetIsContainer = containerId !== undefined && edge.target === containerId;
    const from = endRef(edge.source, edge.sourceHandle);
    const to = endRef(edge.target, edge.targetHandle);

    if (sourceIsContainer || targetIsContainer) {
      const other = sourceIsContainer ? to : from;
      const otherInside = sourceIsContainer ? targetIn : sourceIn;
      const kind: BoundaryClass = otherInside ? "port-inner" : "port-outer";
      return {
        edge,
        kind,
        surfaces: SURFACES[kind],
        ...(otherInside ? { inner: other } : { outer: other }),
      };
    }
    if (sourceIn && targetIn) return { edge, kind: "interior", surfaces: SURFACES.interior };
    if (!sourceIn && !targetIn) return { edge, kind: "exterior", surfaces: SURFACES.exterior };
    const kind: BoundaryClass = sourceIn ? "outbound" : "inbound";
    return {
      edge,
      kind,
      surfaces: SURFACES[kind],
      inner: sourceIn ? from : to,
      outer: sourceIn ? to : from,
    };
  });

  return { edges, inside, ...(containerId !== undefined ? { containerId } : {}) };
}

/** The crossing edges only — `inbound` + `outbound`, scene order. The set
 *  promotion turns into ports. */
export function crossingEdges<E>(report: BoundaryReport<E>): BoundaryEdge<E>[] {
  return report.edges.filter((hit) => hit.kind === "inbound" || hit.kind === "outbound");
}

/** Every edge Zach's rule says a collapsed container shows. */
export function surfacingEdges<E>(report: BoundaryReport<E>): BoundaryEdge<E>[] {
  return report.edges.filter((hit) => hit.surfaces);
}

/* ------------------------------------------------------------------ */
/* Promotion — where a crossing edge lands on the collapsed container   */
/* ------------------------------------------------------------------ */

/** Which seat on the wall. See this file's header for why `"header"` names
 *  something the view kit cannot draw yet. */
export type PromotedSeat = "header" | "rail";

export interface PromotionInput {
  /** From the container's point of view. */
  kind: "inbound" | "outbound";
  inner: ScenePortRef;
  outer: ScenePortRef;
  edge: SceneEdgeEnds & { id: string };
  /** `lint.ts`'s resolver — `undefined` for a port means "no direction, no
   *  judgement", the kit-wide convention. */
  directionOf?: PortDirectionOf;
  /** The container's box, in scene space. Only a geometry policy reads it. */
  box?: ElbowRect;
  /** The cable's route or chord. Only a geometry policy reads it. */
  geometry?: TraceGeometry;
}

export interface PromotionDecision {
  side: BlockSide;
  /**
   * The container port's own polarity, in `lint.ts`'s vocabulary
   * (`"source"` emits, `"sink"` receives) — NOT `port.layout.ts`'s
   * `"input" | "output"`. Two spellings already exist in this repo and this
   * module refuses to be the third: the scene layer speaks source/sink
   * because that is what `PortDirectionOf` returns. The view boundary maps
   * `source → output → right` and `sink → input → left` with
   * `port.layout.ts`'s own `portSideForDirection`; `side` below is that
   * same answer, already resolved, so a host need not run the mapping at
   * all.
   */
  direction: PortDirection;
  seat: PromotedSeat;
  /** Rail slot position along the wall, 0..1 — present ONLY when a policy
   *  actually measured one. Absent means "the rail distributes it", which
   *  is `PortEdge`'s existing job, not a number to invent here. */
  t?: number;
  /** Which band a `"rail"` seat needs. `"block"` spans the header;
   *  `"body"` cannot reach header height (blockPort.layout.ts:155). */
  band: RailBand;
  /**
   * How the side was decided. `"polarity"` and `"gesture"` are
   * `ConnectionOrientation.by`'s own two words (edgeValidation.ts), reused
   * deliberately: they mean the same thing here — a real polarity read, or
   * the order the edge happens to be written in. `"geometry"` is this
   * module's third, for a side measured off the cable.
   */
  by: "polarity" | "geometry" | "gesture";
}

export type PromotionPolicy = (input: PromotionInput) => PromotionDecision;

/**
 * ZACH'S v1, LITERALLY. The container's port polarity is the OPPOSITE of
 * the outside end's: if the cable lands on "an input port of an outside
 * member" then the container is FEEDING it, so the container's own port
 * emits — a source — and a source goes out the right.
 *
 * When `directionOf` cannot state the outside end's polarity, the edge's
 * own stored orientation stands in (`source` end emits, `target` end
 * receives) — which is exactly the DAG assumption he flagged, and `by:
 * "gesture"` is what makes that visible rather than passing a guess off as
 * a reading. Note `docs/peps/0002` made the judge return an ORIENTED pair,
 * so an edge committed through `validateConnection` with a `directionOf`
 * does satisfy the assumption; one committed `by: "gesture"` does not.
 */
export const dagPolarityPolicy: PromotionPolicy = (input) => {
  const stated = input.outer.portId === "" ? undefined : input.directionOf?.(input.outer);
  // The DAG fallback: `target` end receives, `source` end emits.
  const outerIsSink = stated !== undefined ? stated === "sink" : input.edge.target === input.outer.nodeId;
  const direction: PortDirection = outerIsSink ? "source" : "sink";
  return {
    side: outerIsSink ? "right" : "left",
    direction,
    // His chosen mechanism, in his words: "a port on the right side of the
    // header". The left twin is the symmetric reading of the same choice.
    seat: "header",
    band: "block",
    by: stated !== undefined ? "polarity" : "gesture",
  };
};

/**
 * THE FALSIFIER. Side measured from where the cable actually meets the
 * container's wall — `portEdgeLocation` over the donor's Liang–Barsky
 * clipper. Needs `box` and `geometry`; without both it FALLS BACK to
 * `dagPolarityPolicy` rather than guessing, and says so via `by`.
 *
 * Not the default, and not because it is worse: the scene record carries no
 * sizes and no routes (`SceneNode` has `position` and deliberately no
 * extent), so a caller must supply both from whatever measured them. v1
 * works with nothing but the graph, which is why v1 is the default.
 */
export const crossingGeometryPolicy: PromotionPolicy = (input) => {
  const fallback = dagPolarityPolicy(input);
  if (!input.box || !input.geometry) return fallback;
  // "exit" for an outbound cable (it leaves the container), "enter" for an
  // inbound one (it arrives) — the direction is the container's, not the
  // edge's stored order.
  const hit = portEdgeLocation(input.geometry, input.box, {
    direction: input.kind === "outbound" ? "exit" : "enter",
  });
  if (!hit) return fallback;
  return {
    side: hit.side,
    // Polarity is NOT a geometric fact — a cable leaving the left wall is
    // still a source. Geometry decides the SIDE only; the polarity stays
    // whatever v1 read. Conflating the two is how a measured port ends up
    // refusing its own cable on the next `validateConnection`.
    direction: fallback.direction,
    seat: "rail",
    t: hit.t,
    band: "block",
    by: "geometry",
  };
};

/**
 * The first case v1 is KNOWABLY wrong, named rather than left to be
 * discovered. Rendered in Grouping.stories.tsx and asserted in
 * boundary.test.ts, so this string is checkable, not a disclaimer.
 */
export const DAG_HEURISTIC_LIMIT = Object.freeze({
  name: "feedback edge",
  why:
    "v1 reads polarity and calls a source 'right'. Under a DAG that is also " +
    "DOWNSTREAM, so right is where the cable goes. On a feedback edge the " +
    "consumer sits UPSTREAM — to the left on the canvas — so the polarity is " +
    "still correct and the SIDE is wrong: the cable is promoted to the right " +
    "wall and then has to travel back across the whole container. " +
    "`crossingGeometryPolicy` gets it right because it measures the wall the " +
    "cable actually meets.",
  whyItIsNotJustABug:
    "A cycle is a legitimate graph in this kit by explicit decision — " +
    "`DEFAULT_CONNECTION_POLICY.allowCycles` is true (edgeValidation.ts) and " +
    "`findCycles` treats a cycle as 'the linter's real input' (scene.ts). So " +
    "this case is reachable in a scene the judge will happily commit.",
  secondCase:
    "An edge whose orientation was decided `by: \"gesture\"` (docs/peps/0002) " +
    "never had a polarity read at all, so 'the target end is an input' is the " +
    "DAG assumption itself, not evidence for it. `PromotionDecision.by` " +
    "reports 'gesture' for exactly those.",
} as const);

/* ------------------------------------------------------------------ */
/* Promoted ports — the shape the rendering lane paints                 */
/* ------------------------------------------------------------------ */

/**
 * One port on the collapsed container.
 *
 * IDENTITY IS THE INSIDE ENDPOINT. Every crossing edge sharing one inner
 * `{nodeId, portId}` becomes ONE port with several `outer` ends, not
 * several identical seats: two outside members reading the same inner
 * output is one thing leaving the container, drawn once and fanned. That
 * grouping is also what makes dissolve total — the port re-fans to exactly
 * the ends it absorbed.
 */
export interface PromotedPort {
  /** Minted by the CALLER. This module never invents an id — the D9 rule
   *  `scene.ts`'s `duplicateNode` and `portLane.ts`'s `mintItem` already
   *  set for this codebase. */
  id: string;
  side: BlockSide;
  direction: PortDirection;
  seat: PromotedSeat;
  band: RailBand;
  t?: number;
  /** The endpoint inside the container this port stands for. */
  inner: ScenePortRef;
  /** Every endpoint outside now reaching the container through it, in
   *  scene order. */
  outer: ScenePortRef[];
  /** The edges that collapsed into this port, in scene order. */
  edgeIds: string[];
  /** The inner endpoint's declared type, when `typeOf` states one — so a
   *  promoted port carries the datatype through, which is what makes
   *  `arePortTypesCompatible` still able to judge a cable landing on it. */
  portType?: string;
  by: "polarity" | "geometry" | "gesture";
}

/** Two crossing edges on one inner endpoint that wanted different sides.
 *  Reported, never silently resolved — the FIRST decision stands, and the
 *  disagreement is a fact a linter or a person should see. */
export interface PromotionConflict {
  inner: ScenePortRef;
  kept: BlockSide;
  rejected: BlockSide;
  edgeId: string;
}

export interface PromoteBoundaryOptions {
  /** Default `dagPolarityPolicy` — his v1. */
  policy?: PromotionPolicy;
  directionOf?: PortDirectionOf;
  typeOf?: PortTypeOf;
  /** The container's box, for a geometry policy. */
  box?: ElbowRect;
  /** Per-edge route/chord, for a geometry policy. Keyed by edge id. */
  geometryOf?: (edgeId: string) => TraceGeometry | undefined;
  /** Mints the port id. Caller-owned (D9). */
  mintPortId: (input: { inner: ScenePortRef; index: number; decision: PromotionDecision }) => string;
}

export interface PromotionResult {
  ports: PromotedPort[];
  conflicts: PromotionConflict[];
}

/**
 * Turn a boundary report's crossing edges into the container's ports.
 *
 * Deterministic: ports come out in the scene order of the FIRST edge that
 * created each, so the same scene always promotes to the same list — which
 * is what lets a story assert on it and a round trip compare.
 */
export function promoteBoundary<E extends SceneEdgeEnds & { id: string }>(
  report: BoundaryReport<E>,
  options: PromoteBoundaryOptions,
): PromotionResult {
  const { policy = dagPolarityPolicy, directionOf, typeOf, box, geometryOf, mintPortId } = options;
  const byInner = new Map<string, PromotedPort>();
  const conflicts: PromotionConflict[] = [];

  for (const hit of crossingEdges(report)) {
    // `crossingEdges` only returns inbound/outbound, both of which always
    // carry inner+outer — the non-null reads below are that invariant, not
    // an assumption about input.
    const inner = hit.inner!;
    const outer = hit.outer!;
    const key = portKey(inner.nodeId, inner.portId);
    const decision = policy({
      kind: hit.kind as "inbound" | "outbound",
      inner,
      outer,
      edge: hit.edge,
      directionOf,
      box,
      geometry: geometryOf?.(hit.edge.id),
    });
    const existing = byInner.get(key);
    if (existing) {
      if (existing.side !== decision.side) {
        conflicts.push({ inner, kept: existing.side, rejected: decision.side, edgeId: hit.edge.id });
      }
      existing.outer.push(outer);
      existing.edgeIds.push(hit.edge.id);
      continue;
    }
    const declared = inner.portId === "" ? undefined : typeOf?.(inner);
    byInner.set(key, {
      id: mintPortId({ inner, index: byInner.size, decision }),
      side: decision.side,
      direction: decision.direction,
      seat: decision.seat,
      band: decision.band,
      ...(decision.t !== undefined ? { t: decision.t } : {}),
      inner,
      outer: [outer],
      edgeIds: [hit.edge.id],
      // `PortTypeOf` returns a LIST of tags (lint.ts) — a promoted port
      // carries the first as its single declared type, because
      // `arePortTypesCompatible` (magnet/magnetPortTypes.ts) compares one
      // string to one string. A multi-tag inner port is therefore narrowed
      // here, and that narrowing is stated rather than silent.
      ...(declared && declared.length > 0 ? { portType: declared[0] } : {}),
      by: decision.by,
    });
  }

  return { ports: [...byInner.values()], conflicts };
}

/** Every promoted port's id, in order — the container's port vocabulary,
 *  in exactly the shape `findDanglingEdges`/`lintScene` want for
 *  `portsOf`. */
export function promotedPortIds(ports: readonly PromotedPort[]): string[] {
  return ports.map((port) => port.id);
}

/** A `PortTypeOf` over promoted ports, so a freshly collapsed region can be
 *  type-checked by the SAME `lintScene`/`validateConnection` that judged the
 *  scene before it collapsed. */
export function promotedTypeOf(containerId: string, ports: readonly PromotedPort[]): PortTypeOf {
  const types = new Map(ports.filter((port) => port.portType !== undefined).map((port) => [port.id, [port.portType!]]));
  return (ref) => (ref.nodeId === containerId ? types.get(ref.portId) : undefined);
}

/** A `PortDirectionOf` over promoted ports, same reason. */
export function promotedDirectionOf(containerId: string, ports: readonly PromotedPort[]): PortDirectionOf {
  const directions = new Map(ports.map((port) => [port.id, port.direction]));
  return (ref) => (ref.nodeId === containerId ? directions.get(ref.portId) : undefined);
}

/** Convenience: the promoted ports a scene's existing container already
 *  has, re-derived from its stub edges. Used by dissolve, and by anything
 *  that wants to re-render a container it did not just collapse. */
export function containerPortEdges<N extends SceneData, E extends SceneData>(
  scene: { nodes: readonly SceneNode<N>[]; edges: readonly SceneEdge<E>[] },
  containerId: string,
): { inner: SceneEdge<E>[]; outer: SceneEdge<E>[] } {
  const report = classifyBoundary(scene, { containerId });
  return {
    inner: report.edges.filter((hit) => hit.kind === "port-inner").map((hit) => hit.edge),
    outer: report.edges.filter((hit) => hit.kind === "port-outer").map((hit) => hit.edge),
  };
}
