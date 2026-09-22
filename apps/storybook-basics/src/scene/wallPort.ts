// src/scene/wallPort.ts — what happens where a cable crosses a container's
// WALL: detect the crossings (always), and — when a host asks — turn a
// crossing into a real port on that wall, splitting the cable into two
// cables that share it, as ONE linked set.
//
// Zach, 2026-09-22 ("Getting the auto port edges"):
//
//   "on any of those sides we can detect the intersection and add a port
//    there ... in branching regions, when you collapse to port view I want
//    to be able to show the ports... so you need to be able to like detect
//    those ports, even if you don't choose to draw them... When you auto
//    add a port on the edge, I want to introduce this idea of 'linked
//    objects'"
//
// ── PORTED FROM 52a1b92 (branch claude/region-wall-intersection-1bd334) ──
// `src/scene/wallPort.ts` on that unmerged commit is the donor; it was
// extracted for this lane and read in full. What travelled, by line:
//   • `wallCrossings` — donor :159-170, verbatim in shape: `frames` became
//     `boxes` (the box may be a frame OR an expanded block — any container
//     with `data.ports` walls) and `regionId` became `containerId`.
//   • `wallPoint` — donor :111-122, verbatim.
//   • `OPPOSITE_SIDE` — donor :108.
//   • the two-faces idea — donor header :21-37 ("A WALL PORT HAS TWO FACES")
//     and `arrivalFace`/`departureFace` :176-184. The donor addressed the
//     faces as two ports on a PSEUDO-BLOCK (`wall:<id>` + `outer`/`inner`);
//     here the port is a REAL port on the container node (Zach's direction
//     today: the frame owns its port edges), so the outer face is the port's
//     own id and the inner face is `innerFaceHandle(portId)` on the same
//     node. One node, two handles, same DOM owner box.
//   • `splitEdgeAtWalls`'s chain — donor :206-243: source → port₁ → … →
//     target, every intermediate segment `markerEnd: "none"`, derived ids
//     (`<edgeId>~<i>`). Kept; the port record and its id are now MINTED BY
//     THE HOST through `ops` (the D9 rule: this module never invents an id
//     and never touches host data — a port is `HostNodeData.ports`, which
//     the scene kit never learns).
// NOT ported: `slideWallPort`/`wallSlideRange` (the drag along the wall is
// now `PortEdge`'s own Custom mode — Zach: "The port edge already supports
// custom vs auto positioning so that should solve that toggle"), and the
// pseudo-block addressing (`wallPortNodeId`/`withWallPortThrough`), which a
// real port on a real node no longer needs.
//
// ── WHY DETECTION IS ALWAYS COMPUTED, DRAWING IS THE HOST'S CHOICE ──────
// `wallCrossings` is a pure function of a polyline and some boxes. Whether
// a host paints a ring there, inserts a port, or paints nothing is a
// separate decision a host makes AFTER asking — the branch-in-port-view
// case is exactly a host that wants the answer without the drawing.
//
// ── PROVENANCE ──────────────────────────────────────────────────────────
// Class (c) over (a), docs/ALGORITHM-PROVENANCE.md: splitting an edge list
// into a chain, ordering by `t` and clamping are bookkeeping. The one piece
// of real geometry — where a polyline meets a box — is NOT written here: it
// is `portEdgeCrossings` (`./portEdgeCrossing.ts` → `elbow/boundaryCrossing.
// ts`, Liang–Barsky, class (a), the SystemSketch/Excalidraw donor), called
// unchanged, so a ring, an inserted port and a promoted port all read ONE
// number.
//
// Pure: no React, no DOM, no canvas engine.

import type { ElbowPoint, ElbowRect } from "../components/elbow";
import { innerFaceHandle, isInnerFaceHandle, outerPortIdOf } from "../components/frame.layout";
import type { BlockSide } from "../components/port.layout";
import { addLink, edgeRef, portRef, removeLink, type SceneLink } from "./links";
import type { PortDirection, PortDirectionOf, PortsOf, PortTypeOf } from "./model";
import { portEdgeCrossings, type PortEdgeLocation } from "./portEdgeCrossing";
import type { BlockScene, SceneData, SceneEdge } from "./scene";

/* ------------------------------------------------------------------ */
/* Faces — a wall port has two, and they point opposite ways           */
/* ------------------------------------------------------------------ */

// The face NAMING (`p` / `p@inner`, `OPPOSITE_SIDE`) is declared on the
// component side (`components/frame.layout.ts`) because `Frame` stamps the
// inner face into the DOM and `src/components` may not import this kit
// (`layering.test.ts`'s wall). Re-exported here so the scene side has one
// import path for the whole wall-port vocabulary.
export { INNER_FACE_SUFFIX, innerFaceHandle, isInnerFaceHandle, OPPOSITE_SIDE, outerPortIdOf } from "../components/frame.layout";

/** The face on the wall's OWN side — the one an outside cable meets. Its
 *  handle is the port's own id, so everything outside the container wires
 *  the port exactly as it wires any block's port. */
export type WallFace = "outer" | "inner";

/**
 * Both faces' directions, explicitly. WHY explicit rather than "the inner
 * is always the opposite of the outer" left implicit: Zach's validation
 * rule is stated in terms of the faces ("A frame INPUT port's inner face
 * is a source for the children, so a child OUTPUT must not connect to a
 * frame input port"), so the model should be able to SAY what each face
 * is, and a host that ever wants an asymmetric port (a bidirectional bus)
 * has a field to say so in. `wallFacesFor` is the default derivation.
 */
export interface WallPortFaces {
  outer: PortDirection;
  inner: PortDirection;
}

const OPPOSITE_DIRECTION: Record<PortDirection, PortDirection> = { source: "sink", sink: "source" };

/** The default faces of a wall port whose OUTER face is `outer`: the inner
 *  face is the opposite — what enters the container as an input leaves the
 *  wall, on the inside, as a source for the members. */
export function wallFacesFor(outer: PortDirection): WallPortFaces {
  return { outer, inner: OPPOSITE_DIRECTION[outer] };
}

/**
 * The port vocabulary with inner faces added: for every port of a node
 * `isContainer` says has walls, the `p@inner` handle is a port too. Every
 * other node answers exactly as `base` did. `undefined` stays `undefined`
 * (the kit-wide "unknown vocabulary, no judgement").
 */
export function withInnerFaces(base: PortsOf, isContainer: (nodeId: string) => boolean): PortsOf {
  return (nodeId) => {
    const ports = base(nodeId);
    if (ports === undefined || !isContainer(nodeId)) return ports;
    return [...ports, ...ports.map(innerFaceHandle)];
  };
}

/**
 * Direction with faces: an inner-face handle resolves to `facesOf(port).
 * inner`; an outer handle on a container to `facesOf(port).outer`; anything
 * else to `base`. `facesOf` returning `undefined` means "not a wall port" —
 * fall through to `base`, which keeps every non-container port's answer
 * byte-identical to before.
 */
export function withWallFaces(
  base: PortDirectionOf,
  facesOf: (ref: { nodeId: string; portId: string }) => WallPortFaces | undefined,
): PortDirectionOf {
  return (ref) => {
    const outerId = outerPortIdOf(ref.portId);
    const faces = facesOf({ nodeId: ref.nodeId, portId: outerId });
    if (faces === undefined) return base(ref);
    return isInnerFaceHandle(ref.portId) ? faces.inner : faces.outer;
  };
}

/** Both faces carry the port's ONE type: the inner-face handle resolves
 *  its type through the outer port id. */
export function withFaceTypes(base: PortTypeOf): PortTypeOf {
  return (ref) => base({ nodeId: ref.nodeId, portId: outerPortIdOf(ref.portId) });
}

/* ------------------------------------------------------------------ */
/* Option 1 — where a routed cable crosses the walls it passes through   */
/* ------------------------------------------------------------------ */

/** A `PortEdgeLocation` that knows WHOSE wall it is on. */
export interface WallCrossing extends PortEdgeLocation {
  containerId: string;
}

export interface WallCrossingsInput {
  /** The routed polyline, `from` → `to` — the points a host's
   *  `onWireGeometry` reports (or a chord, when the route has none). */
  points: readonly ElbowPoint[];
  /** Every container box on the board, in the same space as `points`,
   *  keyed by node id. */
  boxes: ReadonlyMap<string, ElbowRect>;
  /** The containers this wire is genuinely inside (`Wire.through`). */
  through: readonly string[];
  /** The wire's two end nodes. A container that IS an end is skipped. */
  ends?: readonly string[];
}

/**
 * Every wall the cable crosses, in path order. Donor 52a1b92 :159-170.
 *
 * WHY only containers in `through`: a wall crossing means the cable ENTERS
 * or LEAVES a scope, and `through` is precisely "the containers my ends
 * live in". A cable that bypasses a frame is not entering it — and if a
 * curved cable clipped a corner of a frame it has no business in, a ring
 * there would claim a scope change that does not exist.
 *
 * WHY a container that is one of the wire's own ends is skipped: a cable
 * INTO a frame's own wall port starts or ends ON that wall (ring-flush) —
 * the frame's own interface, not a crossing. That is also what keeps a
 * split stable: the two halves of a split cable end on the wall and never
 * read as crossings again.
 */
export function wallCrossings({ points, boxes, through, ends = [] }: WallCrossingsInput): WallCrossing[] {
  if (points.length < 2) return [];
  const skip = new Set(ends);
  const found: WallCrossing[] = [];
  for (const containerId of through) {
    if (skip.has(containerId)) continue;
    const box = boxes.get(containerId);
    if (!box) continue;
    for (const hit of portEdgeCrossings(points, box)) found.push({ ...hit, containerId });
  }
  return found.sort((a, b) => a.distance - b.distance);
}

/** The point on `box`'s `side` at `t`. The inverse of `alongSide`. Donor
 *  52a1b92 :111-122. */
export function wallPoint(box: ElbowRect, side: BlockSide, t: number): ElbowPoint {
  switch (side) {
    case "left":
      return { x: box.x, y: box.y + t * box.h };
    case "right":
      return { x: box.x + box.w, y: box.y + t * box.h };
    case "top":
      return { x: box.x + t * box.w, y: box.y };
    case "bottom":
      return { x: box.x + t * box.w, y: box.y + box.h };
  }
}

/* ------------------------------------------------------------------ */
/* Order on a wall — where a new port slots in among the existing ones  */
/* ------------------------------------------------------------------ */

/**
 * The index at which a port at `t` belongs among ports already at
 * `existingTs` (in wall order, 0..1 in the wall's reading direction):
 * before the first existing port that sits FURTHER along the wall. Ties go
 * after — a port dropped exactly on another lands next to it, never
 * before it. Ours, ad hoc.
 *
 * WHY order and not position is what an auto-spaced edge stores: in Auto
 * mode a `PortEdge` derives every position from the order and its
 * distribution, so "the port lands at the intersection, then the edge
 * re-spaces it" (Zach) is, mechanically, "insert at the index the
 * intersection implies, then let the distribution place it".
 */
export function insertionIndex(existingTs: readonly number[], t: number): number {
  const index = existingTs.findIndex((existing) => existing > t);
  return index === -1 ? existingTs.length : index;
}

/* ------------------------------------------------------------------ */
/* Option 2 — the crossing becomes a port, the cable becomes a chain     */
/* ------------------------------------------------------------------ */

/** Which face a cable ARRIVES at, travelling along the path. Entering the
 *  container, it meets the wall from outside; leaving, from inside. Donor
 *  52a1b92 :176-184. */
function arrivalHandle(portId: string, direction: WallCrossing["direction"]): string {
  return direction === "enter" ? portId : innerFaceHandle(portId);
}

function departureHandle(portId: string, direction: WallCrossing["direction"]): string {
  return direction === "enter" ? innerFaceHandle(portId) : portId;
}

/** One port this split minted, and where. */
export interface MintedWallPort {
  containerId: string;
  portId: string;
  crossing: WallCrossing;
}

export interface SplitAtWallsOps<N extends SceneData, E extends SceneData> {
  /** The port id for the `index`-th crossing of this edge. Host-owned (D9). */
  mintPortId(crossing: WallCrossing, index: number): string;
  /**
   * Put the port on the container's wall — host vocabulary (`data.ports`,
   * labels, types, faces, custom offsets). Called once per crossing, in
   * path order, before the edges are rewritten.
   */
  addPort(scene: BlockScene<N, E>, port: MintedWallPort): BlockScene<N, E>;
  /** The link set's id. Default `link:<edgeId>`. */
  mintLinkId?(edgeId: string): string;
}

export interface SplitAtWallsResult<N extends SceneData, E extends SceneData> {
  scene: BlockScene<N, E>;
  /** In path order. Empty when nothing was split (the scene is then the
   *  SAME object). */
  ports: MintedWallPort[];
  /** The link set that binds the segments and ports; `undefined` when
   *  nothing was split. */
  link?: SceneLink;
}

/**
 * Replace edge `edgeId` with a chain through one new wall port per
 * crossing, and link every piece into one set (`links.ts`).
 *
 * Direction is preserved: the chain runs source → port₁ → … → target, so
 * an arrowhead still points at the ORIGINAL target. Every intermediate
 * segment is written `markerEnd: "none"` — the cable does not END at a
 * wall port, it passes through one (donor 52a1b92 :193-204). Ids are
 * derived, not random, so the same split of the same edge always mints the
 * same segments: `<edgeId>~<i>`.
 *
 * WHY the link set holds the SEGMENTS and the PORTS and nothing else:
 * those are the pieces one cable was cut into. The end blocks are not
 * members — deleting a cable never deletes what it connected.
 */
export function splitEdgeAtWalls<N extends SceneData, E extends SceneData & { markerEnd?: string }>(
  scene: BlockScene<N, E>,
  edgeId: string,
  crossings: readonly WallCrossing[],
  ops: SplitAtWallsOps<N, E>,
): SplitAtWallsResult<N, E> {
  const index = scene.edges.findIndex((edge) => edge.id === edgeId);
  if (index < 0 || crossings.length === 0) return { scene, ports: [] };
  const edge = scene.edges[index];

  const ports: MintedWallPort[] = crossings.map((crossing, i) => ({ containerId: crossing.containerId, portId: ops.mintPortId(crossing, i), crossing }));
  let next = scene;
  for (const port of ports) next = ops.addPort(next, port);

  const segments: SceneEdge<E>[] = [];
  let source = edge.source;
  let sourceHandle = edge.sourceHandle;
  ports.forEach((port, i) => {
    segments.push({
      ...edge,
      id: `${edge.id}~${i}`,
      source,
      sourceHandle,
      target: port.containerId,
      targetHandle: arrivalHandle(port.portId, port.crossing.direction),
      data: { ...(edge.data ?? {}), markerEnd: "none" } as E,
    });
    source = port.containerId;
    sourceHandle = departureHandle(port.portId, port.crossing.direction);
  });
  segments.push({ ...edge, id: `${edge.id}~${ports.length}`, source, sourceHandle });

  const edges = [...next.edges.slice(0, index), ...segments, ...next.edges.slice(index + 1)];
  const members: string[] = [];
  segments.forEach((segment, i) => {
    members.push(edgeRef(segment.id));
    if (i < ports.length) members.push(portRef(ports[i].containerId, ports[i].portId));
  });
  const link: SceneLink = { id: ops.mintLinkId?.(edge.id) ?? `link:${edge.id}`, members };
  return { scene: addLink({ ...next, edges }, link), ports, link };
}

export interface UnsplitOps<N extends SceneData, E extends SceneData> {
  /** Take the port off the container's wall — the inverse of `addPort`. */
  removePort(scene: BlockScene<N, E>, port: { containerId: string; portId: string }): BlockScene<N, E>;
}

/**
 * The inverse of one split: the edge INTO the port's arrival face and the
 * edge OUT OF its departure face are spliced into one direct cable (the
 * first segment's id, `data` and array position survive — `collapse.ts`'s
 * own round-trip rule, so a split-then-unsplit is byte-identical), the
 * port leaves the wall, and the link set that bound them is removed.
 *
 * Total: an unknown port, or a port that is not the shared end of exactly
 * one arriving and one departing segment, returns the SAME scene — that
 * is not a split, and guessing which two of N cables to splice would
 * invent a connection.
 */
export function unsplitWallPort<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  port: { containerId: string; portId: string },
  ops: UnsplitOps<N, E>,
): BlockScene<N, E> {
  const outer = port.portId;
  const inner = innerFaceHandle(port.portId);
  const touching = scene.edges.filter(
    (edge) =>
      (edge.source === port.containerId && (edge.sourceHandle === outer || edge.sourceHandle === inner)) ||
      (edge.target === port.containerId && (edge.targetHandle === outer || edge.targetHandle === inner)),
  );
  if (touching.length !== 2) return scene;
  const arriving = touching.find((edge) => edge.target === port.containerId);
  const departing = touching.find((edge) => edge.source === port.containerId);
  if (!arriving || !departing || arriving === departing) return scene;

  const spliced: SceneEdge<E> = {
    ...arriving,
    target: departing.target,
    targetHandle: departing.targetHandle,
    // The departing half carried the original arrowhead (only intermediate
    // segments were forced to `"none"`), so its `data` is the one to keep.
    ...(departing.data === undefined ? {} : { data: departing.data }),
  };
  const edges = scene.edges.filter((edge) => edge !== departing).map((edge) => (edge === arriving ? spliced : edge));
  let next: BlockScene<N, E> = { ...scene, edges };
  next = ops.removePort(next, port);
  for (const link of next.links ?? []) {
    if (link.members.includes(portRef(port.containerId, port.portId))) next = removeLink(next, link.id);
  }
  return next;
}
