/**
 * src/magnet/magnetProposals.ts — "magnetic wire proposals", as one pure
 * function: which stationary port could the port I am dragging connect to
 * right now?
 *
 * Zach, `PROJECT - Black Box UI.md` §"Magnetic wire proposals": *"if you
 * turn it on… different ports basically could have like magnet radius. if
 * those radius are in range, and then a data validation thing bases. then it
 * can make a trace proposals so it just automatically draws it (dotted
 * line)… if you move out of range then it disappears… if many possible
 * connections then just go to the nearest one."*
 *
 * The shape: geometry PROPOSES, an injected judge DISPOSES, and the two are
 * evaluated **interleaved in distance order** so an illegal near candidate
 * can never shadow a legal far one. Output is a ranked LIST plus a list of
 * explained refusals — never a scalar winner (R5's tie-breaker *is* a
 * ranking, so the ranking has to be the data).
 *
 * Pure: no React, no DOM, no canvas engine, and the host measures — this
 * module never self-measures. `src/scene/scene.ts`'s own rule, and the
 * contract SystemSketch's `src/behaviorTree/liveDragWires.ts:1-31`
 * independently establishes for exactly this ("the anchor tracks the live
 * shape continuously; the terminal resolves against the model only once the
 * shape stops moving") — which is also why a `MagnetProposal` is never
 * written into a scene here. The caller commits, on release.
 *
 * ── Provenance, per `.claude/feedback.md` ──────────────────────────────
 * (a) PORTED   — the radius form (`{sceneUnits} | {screenPx}`, capped):
 *                SystemSketch `src/blocks/connections/connectionHit.ts`
 *                `targetPageUnits` :133-137 (`pageUnits ?? screenPx /
 *                safeZoom`, then `Math.min(raw, MAX_HIT_TARGET_PAGE)`,
 *                `MAX_HIT_TARGET_PAGE = 24` at :102) and the scene-radius-
 *                with-a-screen-floor shape at
 *                `src/blocks/connections/blockPorts.ts:516-527`
 *                (`getBlockPortDotsNear`, `CONNECTION_PORT_MAGNET_RADIUS =
 *                13` at :39).
 *              — the NEAREST-LEGAL ordering: SystemSketch
 *                `src/blocks/connections/connectionRules.ts:337-360`
 *                (`findConnectionTarget` — "An illegal dot never shadows a
 *                legal one behind it: refusal is judged per candidate, in
 *                distance order").
 *              — the per-candidate bounds±radius reject before any distance
 *                math: `blockPorts.ts:538-541`.
 *              — skipping a hidden dot without deleting it:
 *                `blockPorts.ts:551` (`if (port.hidden) continue`) → `inert`.
 * (b) A REAL TECHNIQUE, four verified implementations — fixed-radius
 *     near-neighbour search by linear scan with an axis-aligned early
 *     reject and a squared-distance test. See `scanMagnets`' WHY block for
 *     the four citations and the measurement that says not to index.
 * (c) OURS, ad hoc — the tie-break ladder (`portKey` lexicographic, a
 *     deliberate divergence from every library studied; see `compareMagnet`),
 *     `MAGNET_DEFAULT_RADIUS`, `MAGNET_RADIUS_MAX_SCENE`, the
 *     `ConnectionJudge`/`composeJudges` seam, and PER-PORT radius itself:
 *     JointJS's `SnapLinksOptions` is a single global-per-paper `radius`
 *     (`types/dia.d.ts:1728-1730`) and maxGraph's `graph.tolerance` is one
 *     graph-global scalar — neither is prior art for a per-port magnet.
 */

import { effectiveHitValue } from "../hitRegions/hitPolicy";
import { portKey, type SceneEdgeEnds, type ScenePortRef } from "../scene/scene";
// TYPES ONLY, never the function. `scene/edgeValidation.ts` belongs to the
// linter lane and may move or be renamed under us; a structural judge
// callback costs one line at the call site when it does, where an import of
// `validateConnection` would cost a rebuild. `Diagnostic` is deliberately
// NOT named here at all — post-rename it lives in `components/highlighter.tsx`
// (edgeValidation.ts:49), and `src/components/**` is another lane's write set.
import type { ConnectionMessage, ConnectionVerdict } from "../scene/edgeValidation";
import { arePortTypesCompatible, type PortTypeMatching } from "./magnetPortTypes";

export interface Point {
  x: number;
  y: number;
}

/** Structurally `TraceDir` (components/trace.layout.ts), deliberately NOT
 *  imported: this module is the pure model half and imports no component,
 *  not even a type. The layer maps it straight through. */
export type MagnetDir = "top" | "right" | "bottom" | "left";

/* ------------------------------------------------------------------ */
/* R1 — the radius, per port, and the zoom question                    */
/* ------------------------------------------------------------------ */

/**
 * WHY a union rather than one number, and WHY scene units are the base:
 * the two conventions in the wild split exactly along this union, one
 * library each, and picking one silently would be picking a side.
 *
 *   scene units — React Flow's `connectionRadius` (default 20) is compared
 *     in FLOW space, after `pointToRendererPoint` has divided pan/zoom out
 *     (`@xyflow/system@0.0.82/dist/esm/index.mjs:2537`; default at
 *     `@xyflow/react@12.11.6`). JointJS compares in already-local paper
 *     coordinates via `clientToLocalPoint`. maxGraph's `graph.tolerance` is
 *     graph space.
 *   screen px  — tldraw declares screen-constant values and DIVIDES by zoom
 *     (`Editor.getHitTestMargin: margin / this.getZoomLevel()`).
 *
 * So: scene units is the base (three libraries agree), with a screen-px form
 * available per port for the ports that want tldraw's feel. The resolution
 * is the donor's own expression — `pageUnits ?? screenPx / safeZoom`, capped
 * (`connectionHit.ts:133-137`) — and the division is delegated to
 * `effectiveHitValue(px, zoom, "screen")` (hitRegions/hitPolicy.ts:51),
 * which IS `px / zoom`. Delegated rather than re-typed so there is one
 * spelling of the zoom rule in this app; `magnetProposals.test.ts` A1 calls
 * both functions and compares, which is what makes that reuse mechanical
 * instead of decorative.
 */
export type MagnetRadius = { sceneUnits: number } | { screenPx: number };

/**
 * OURS, ad hoc. Sanity-checked against React Flow's `connectionRadius` (20
 * flow units) and SystemSketch's 13-screen-px port magnet — a magnet is
 * deliberately LARGER than a hit target, because it fires while you are
 * still moving rather than where you finally let go.
 */
export const MAGNET_DEFAULT_RADIUS: MagnetRadius = { sceneUnits: 48 };

/**
 * The cap. The IDEA is ported with the donor's verbatim reason — "A screen-px
 * target grows without limit as you zoom out. This caps it, so the corridor
 * cannot swallow the board at zoom 0.05" (`connectionHit.ts:98-102`). The
 * NUMBER is ours and cannot be cited: the donor's `MAX_HIT_TARGET_PAGE` is
 * 24 because it caps a hit target, and a magnet is deliberately an order
 * larger. Saying so is the point.
 */
export const MAGNET_RADIUS_MAX_SCENE = 240;

export function effectiveMagnetRadius(radius: MagnetRadius, zoom = 1): number {
  const raw = "sceneUnits" in radius ? radius.sceneUnits : effectiveHitValue(radius.screenPx, zoom, "screen");
  return Math.min(raw, MAGNET_RADIUS_MAX_SCENE);
}

/**
 * WHOSE radius counts when both ends declare one: `max`.
 *
 * WHY max and not min or sum: symmetry. R3 says the proposal "disappears"
 * when you move out of range, and that has to fire at the same distance
 * whichever end is the one moving — `max` is the only one of the three that
 * is commutative AND lets a port declaring a big magnet actually get it.
 * `min` lets the shyer port veto the eager one; `sum` reaches 80u for two
 * 40u ports, which nobody asked for. A1 property-tests the commutativity.
 */
export function pairMagnetRadius(a: MagnetPort, b: MagnetPort, zoom = 1): number {
  return Math.max(effectiveMagnetRadius(a.radius ?? MAGNET_DEFAULT_RADIUS, zoom), effectiveMagnetRadius(b.radius ?? MAGNET_DEFAULT_RADIUS, zoom));
}

/* ------------------------------------------------------------------ */
/* R2 — the validation seam                                            */
/* ------------------------------------------------------------------ */

/**
 * The whole validation seam: one candidate in, one verdict out.
 *
 * Deliberately declared STRUCTURALLY and not as `typeof validateConnection`
 * — see this file's import block. `scene/edgeValidation.ts`'s
 * `validateConnection(scene, candidate, {portsOf})` adapts in with one
 * arrow function, and so does the batch-wiring lane's availability
 * predicate:
 *
 *   (c) => pred(portKey(c.target, c.targetHandle!)) ? { allowed: true } : { allowed: false }
 */
export type ConnectionJudge = (candidate: SceneEdgeEnds & { id: string }) => ConnectionVerdict;

const ALLOWED: ConnectionVerdict = { allowed: true };

/**
 * Run judges in order; the FIRST refusal wins and short-circuits — which is
 * `validateConnection`'s own documented order ("returns on the first
 * refusal, so a caller with several problems still gets one clear verdict
 * rather than a list to triage", edgeValidation.ts:96-101), applied one
 * level up so composing does not change the contract.
 */
export function composeJudges(...judges: readonly ConnectionJudge[]): ConnectionJudge {
  return (candidate) => {
    for (const judge of judges) {
      const verdict = judge(candidate);
      if (!verdict.allowed) return verdict;
    }
    return ALLOWED;
  };
}

/**
 * A `ConnectionJudge` that refuses on declared data types — R4's engine,
 * which nothing in `src/scene/` provides (`validateConnection` has no type
 * rule at all).
 *
 * `typeOf` returning `undefined` means "no type on that port". A candidate
 * whose handle is `null`/`undefined` names the NODE, not a port, so there is
 * nothing to judge and it is ALLOWED here — the same
 * "no-handle-wires-the-node" reading `wiredPorts` already uses (scene.ts).
 *
 * TWO refusal codes, not one: the donor's refusal vocabulary distinguishes
 * `type-mismatch` from `untyped-port` (`connectionRules.ts:40-51`, read on
 * disk). Collapsing them would quietly diverge from the donor on the one
 * axis this judge exists to carry.
 */
export function magnetTypeJudge(options: { typeOf(ref: ScenePortRef): string | undefined; mode?: PortTypeMatching }): ConnectionJudge {
  const { typeOf, mode = "lenient" } = options;
  return (candidate) => {
    if (candidate.sourceHandle == null || candidate.targetHandle == null) return ALLOWED;
    const sourceType = typeOf({ nodeId: candidate.source, portId: candidate.sourceHandle }) ?? "";
    const sinkType = typeOf({ nodeId: candidate.target, portId: candidate.targetHandle }) ?? "";
    const verdict = arePortTypesCompatible(sourceType, sinkType, mode);
    if (verdict === "ok") return ALLOWED;
    if (verdict === "mismatch") {
      return { allowed: false, refusal: { severity: "error", code: "type-mismatch", message: `${sourceType || "(untyped)"} does not match ${sinkType || "(untyped)"}` } };
    }
    return { allowed: false, refusal: { severity: "warning", code: "untyped-port", message: "one end has no declared type" } };
  };
}

/* ------------------------------------------------------------------ */
/* The ports                                                           */
/* ------------------------------------------------------------------ */

export interface MagnetPort {
  ref: ScenePortRef;
  /** Scene-space centre of the dot. The HOST measures this; the model never
   *  self-measures (ARCHITECTURE.md's core rule, and `liveDragWires.ts`'s
   *  own contract). */
  at: Point;
  /**
   * Which end of an edge this port is. REQUIRED, not optional: the scan has
   * to ORIENT the candidate edge before any judge can see it (a judge reads
   * `source`/`target`), and an out→out pair is not a connection to refuse —
   * it is not a candidate at all, so it never reaches `refused` either.
   * Donor for treating same-polarity as non-candidacy rather than refusal:
   * SystemSketch's `same-polarity` is a policy PERMISSION
   * (`connectionRules.ts:39`, `REFUSAL_PERMISSION`), and this module's
   * policy is "never".
   */
  role: "source" | "target";
  /** Defaults to `MAGNET_DEFAULT_RADIUS`. */
  radius?: MagnetRadius;
  /** Out of candidacy without being deleted — a hidden or collapsed dot.
   *  Donor: `blockPorts.ts:551`, `if (port.hidden) continue`. */
  inert?: boolean;
  /** Declared data type, for `magnetTypeJudge`'s `typeOf`. Carried here so a
   *  bench has ONE place to author it. */
  type?: string;
  /** Which way a wire leaves/arrives at this dot, for the paint layer.
   *  Defaults to `"right"` — the same specialization `Lint.stories.tsx`
   *  makes for a bench whose `out` ports sit on right walls and `in` ports
   *  on left walls. */
  dir?: MagnetDir;
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

export interface MagnetScanInput {
  /** Ports on the thing being dragged, already at their LIVE position —
   *  `translatePorts(frame.moving, dragDelta(state))`. */
  moving: readonly MagnetPort[];
  /** Stationary candidates, measured once at drag start. */
  resting: readonly MagnetPort[];
  zoom?: number;
  /** Omitted = geometry only, and never a throw. Same optional-resolver
   *  contract `findDanglingEdges` set (scene.ts) and `diffScene` reused. */
  judge?: ConnectionJudge;
  /** The edge id the judge sees. Default: the proposal's own id. */
  edgeIdFor?(source: ScenePortRef, target: ScenePortRef): string;
}

export interface MagnetProposal {
  /** Deterministic, never minted:
   *  `magnet:${portKey(from)}->${portKey(to)}`. A proposal that leaves range
   *  and comes back is the SAME proposal, which A8 asserts. */
  id: string;
  /** The MOVING port. */
  from: ScenePortRef;
  /** The RESTING candidate. */
  to: ScenePortRef;
  /** `from`/`to` re-labelled by `role`, so a caller can build the edge
   *  without re-deriving which end is which. */
  source: ScenePortRef;
  target: ScenePortRef;
  /** Scene units, dot centre to dot centre. */
  distance: number;
  /** The effective PAIR magnet that admitted it. */
  radius: number;
  /** Resolved endpoints, carried so the paint layer can stamp them and a
   *  play function can measure the tracking claim at the right granularity
   *  — a `Trace`'s own bounding rect spans BOTH ends and only one end
   *  moves, so its rect delta is about HALF the dragged node's and asserting
   *  on it would pass for the wrong reason. */
  fromAt: Point;
  toAt: Point;
  fromDir: MagnetDir;
  toDir: MagnetDir;
}

export interface MagnetRefusal {
  id: string;
  from: ScenePortRef;
  to: ScenePortRef;
  distance: number;
  /**
   * PRESENT = maxGraph's `"message"` case; ABSENT = its `''` "invalid but
   * silent" case — the two-valued distinction `ConnectionVerdict` already
   * carries (scene/edgeValidation.ts:79-84), passed through verbatim rather
   * than flattened. Mint an `id` and a `MagnetRefusal.refusal` IS an at-rest
   * `Diagnostic`.
   */
  refusal?: ConnectionMessage;
}

export interface MagnetScan {
  /** Legal, nearest first, total order. `[]` is a real answer — "Null is a
   *  real answer, not a failure to compute" (`behaviorTreeDrag.ts:99-101`). */
  proposals: MagnetProposal[];
  /** In range, judged illegal. Same order. */
  refused: MagnetRefusal[];
}

export const EMPTY_MAGNET_SCAN: MagnetScan = { proposals: [], refused: [] };

export function magnetProposalId(from: ScenePortRef, to: ScenePortRef): string {
  return `magnet:${portKey(from.nodeId, from.portId)}->${portKey(to.nodeId, to.portId)}`;
}

/** Pure. The binding's whole per-frame geometry step: the resting set was
 *  measured once, so the moving set is TRANSLATED rather than re-measured. */
export function translatePorts(ports: readonly MagnetPort[], by: Point): MagnetPort[] {
  return ports.map((port) => ({ ...port, at: { x: port.at.x + by.x, y: port.at.y + by.y } }));
}

/** One in-range pair, before the judge has seen it. */
interface Candidate {
  id: string;
  from: MagnetPort;
  to: MagnetPort;
  distance: number;
  radius: number;
}

/**
 * The total order. THREE rungs, so a test can never flake on a tie:
 *
 *   1. smaller `distance`
 *   2. then `portKey(to)`   ascending, lexicographic
 *   3. then `portKey(from)` ascending, lexicographic
 *
 * WHY rungs 2-3 are identity-keyed, which is a DELIBERATE divergence from
 * every library studied rather than neutral ground:
 *   - SystemSketch breaks an exact tie by Z-ORDER — "Topmost first, so an
 *     exact tie resolves to the shape on top" (`blockPorts.ts:530-531`).
 *     Z-order is a host-owned render fact and CLAUDE.md forbids the core
 *     reading interaction geometry, so it cannot travel.
 *   - JointJS breaks it by ENUMERATION ORDER: its `isBetterCandidate` uses a
 *     strict `<`, so first-enumerated wins, and that order is
 *     `graph.getCells()` order plus `querySelectorAll` document order.
 *   - React Flow breaks it by OPPOSITE HANDLE TYPE then iteration order:
 *     `closestHandles.find(h => h.type === oppositeHandleType) ??
 *     closestHandles[0]` (`@xyflow/system@0.0.82/dist/esm/index.mjs:2417-2419`,
 *     read on disk).
 * All three change their answer when the candidate collection is rebuilt —
 * and it is rebuilt every frame here. Identity-keyed sorting is the only
 * rung stable under reorder, duplication and re-render, which is exactly
 * what `magnetProposals.test.ts` A3 proves by shuffling the input 100 times
 * and demanding a byte-identical result.
 */
function compareMagnet(a: Candidate, b: Candidate): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const toA = portKey(a.to.ref.nodeId, a.to.ref.portId);
  const toB = portKey(b.to.ref.nodeId, b.to.ref.portId);
  if (toA !== toB) return toA < toB ? -1 : 1;
  const fromA = portKey(a.from.ref.nodeId, a.from.ref.portId);
  const fromB = portKey(b.from.ref.nodeId, b.from.ref.portId);
  if (fromA === fromB) return 0;
  return fromA < fromB ? -1 : 1;
}

function endsOf(from: MagnetPort, to: MagnetPort): { source: ScenePortRef; target: ScenePortRef } {
  return from.role === "source" ? { source: from.ref, target: to.ref } : { source: to.ref, target: from.ref };
}

/**
 * The scan. One loop over `resting` per moving port, with the cheap
 * rejections every donor actually performs, then a judge pass in distance
 * order.
 *
 * WHY THERE IS NO SPATIAL INDEX — and why a future reader should not "fix"
 * this into a grid. Zach guessed two things: "break it up into regions" and
 * "likely this is a generic solved CS problem". The second is right; the
 * first is wrong at our n, and this was MEASURED rather than reasoned about.
 *
 * Measurement (Node v22.18.0, 2026-09-17; uniform and clustered port
 * layouts, radius 60 scene units, 300-frame simulated drag, a uniform grid's
 * output deep-equal-checked against a linear-scan oracle at every n, 0/300
 * mismatches):
 *
 *   n=50        grid vs linear is a WASH (0.4x-2.1x, either direction)
 *   n=200       still a wash; linear ~0.3 µs/frame
 *   n=500-1000  grid first pulls ahead (3-12x)
 *   n=5,000     grid 15-30x — and linear is STILL ~6-8 µs/frame, i.e.
 *               0.05% of a 16.6 ms frame, at 10x our regime
 *
 * bbox-ui's regime is tens to low hundreds of ports: entirely inside the
 * noise band. The prior art agrees, four times over, all read on disk or
 * fetched 2026-09-17:
 *
 *   JointJS (MIT core @ 881e49d) — `findClosestMagnetToPoint` →
 *     `findCellViewsInArea` → `Graph._filterInArea`, which bottoms out in
 *     `cells.filter(el => rect.intersect(el.getBBox()))`: a linear scan over
 *     EVERY cell, then a second scan over every `[magnet]` node on each
 *     survivor (`Graph.mjs:1400-1407`, `Paper.mjs:3020-3026`,
 *     `:3055-3138`). `_markAvailableMagnets` does not even bbox-prefilter.
 *   maxGraph (Apache-2.0 @ 1559b37) — ZERO region-partitioning structures
 *     anywhere; a full-tree grep of all 1189 paths for
 *     quad/rtree/spatialindex/kdtree/hash-grid returned no hits.
 *     `getCellAt`/`getCells` are recursive rectangle-intersection scans
 *     (`CellsMixin.ts:1606-1712`).
 *   React Flow (`@xyflow/system@0.0.82`, installed in this worktree) —
 *     `getNodesWithinDistance` is a `for...of` over `nodeLookup.values()`
 *     with an AABB pre-filter inflated by a hardcoded `ADDITIONAL_DISTANCE
 *     = 250` (`dist/esm/index.mjs:2367-2378`, `:2386`).
 *   SystemSketch — linear scan over `getCurrentPageShapesSorted()` with a
 *     per-shape bounds±radius reject (`blockPorts.ts:527-560`).
 *
 * `rbush` (an MIT R-tree ALREADY present transitively via tldraw, whose own
 * `SpatialIndexManager` uses it) was the strongest off-the-shelf candidate
 * and is rejected on ACCESS PATTERN, independently of scale: its value is
 * cheap online mutation, and our resting set is frozen for the whole
 * gesture. If an index is ever genuinely needed the upgrade is a UNIFORM
 * GRID, not a tree — repeated small-delta queries from one moving point is
 * the case grids are specifically good at.
 *
 * WHAT DOES PAY, and it is not the arithmetic: `getBoundingClientRect` per
 * port. So `useMagnetDrag` measures the resting geometry from the DOM
 * exactly ONCE per gesture and derives the moving ports from `dragDelta`.
 * A scanning frame performs ZERO DOM reads — which is also why there is no
 * rAF throttle and therefore no racy timing under a play function's
 * post-pointermove assertion.
 */
export function scanMagnets(input: MagnetScanInput): MagnetScan {
  const { moving, resting, zoom = 1, judge, edgeIdFor } = input;
  const candidates: Candidate[] = [];

  for (const from of moving) {
    if (from.inert) continue;
    for (const to of resting) {
      // Not a candidate at all — see `MagnetPort.role`.
      if (to.inert || to.role === from.role) continue;
      const radius = pairMagnetRadius(from, to, zoom);
      const dx = to.at.x - from.at.x;
      const dy = to.at.y - from.at.y;
      // Axis reject BEFORE any multiply — the donor's own broad phase
      // (`blockPorts.ts:538-541`), and React Flow's AABB pre-filter.
      if (dx > radius || dx < -radius || dy > radius || dy < -radius) continue;
      const squared = dx * dx + dy * dy;
      // Squared comparison, no `sqrt` in the hot path. `Math.sqrt` runs once
      // per SURVIVING candidate only, to fill the reported distance — the
      // same shape `dragIntent.travelled`/`move` already use.
      if (squared > radius * radius) continue;
      candidates.push({ id: magnetProposalId(from.ref, to.ref), from, to, distance: Math.sqrt(squared), radius });
    }
  }

  candidates.sort(compareMagnet);

  const proposals: MagnetProposal[] = [];
  const refused: MagnetRefusal[] = [];

  // Judged IN DISTANCE ORDER, one at a time — SystemSketch's
  // `findConnectionTarget` order (`connectionRules.ts:337-360`), and
  // architecturally JointJS's too (its distance scan takes a `filter`
  // callback, `Paper.mjs:3120-3124`, so an illegal nearer magnet is skipped
  // rather than chosen-then-rejected).
  //
  // WHY NOT React Flow's order (nearest first, THEN validate — verified at
  // `@xyflow/system@0.0.82/dist/esm/index.mjs:2387-2419` then `:2537-2542`,
  // where validity only flips a flag on the ALREADY-chosen candidate): under
  // it, Zach's own worked example — "it would only connect to the port with
  // the correct datatype" — FAILS whenever the wrong-type port is nearer.
  // The `TypeDecides` story puts the wrong-type port strictly nearer and
  // measures that it is, so a builder reaching for the more familiar
  // library's order fails a test instead of shipping a fixture that silently
  // tests the easy case.
  for (const candidate of candidates) {
    const { source, target } = endsOf(candidate.from, candidate.to);
    if (judge) {
      const id = edgeIdFor ? edgeIdFor(source, target) : candidate.id;
      const verdict = judge({ id, source: source.nodeId, sourceHandle: source.portId, target: target.nodeId, targetHandle: target.portId });
      if (!verdict.allowed) {
        refused.push({ id: candidate.id, from: candidate.from.ref, to: candidate.to.ref, distance: candidate.distance, refusal: verdict.refusal });
        continue;
      }
    }
    proposals.push({
      id: candidate.id,
      from: candidate.from.ref,
      to: candidate.to.ref,
      source,
      target,
      distance: candidate.distance,
      radius: candidate.radius,
      fromAt: candidate.from.at,
      toAt: candidate.to.at,
      fromDir: candidate.from.dir ?? "right",
      toDir: candidate.to.dir ?? "right",
    });
  }

  return { proposals, refused };
}

/** The one a host paints by default. `null` is a real answer. */
export function topProposal(scan: MagnetScan): MagnetProposal | null {
  return scan.proposals[0] ?? null;
}

/**
 * Structural equality to 3dp on the distances, for the binding's render
 * guard.
 *
 * WHY a guard at all rather than trusting React: SystemSketch's
 * `getEligiblePorts` added exactly this after MEASURING "11 ms of judging
 * per second of cable drag on 48 Blocks"
 * (`/home/bam/systemsketch/src/blocks/ports/portState.ts`). Our scan is
 * sub-microsecond, so the cost being avoided here is the React COMMIT and
 * the `Trace` re-layout behind it, not the scan.
 */
export function sameMagnetScan(a: MagnetScan, b: MagnetScan): boolean {
  if (a === b) return true;
  if (a.proposals.length !== b.proposals.length || a.refused.length !== b.refused.length) return false;
  const near = (x: number, y: number) => Math.abs(x - y) < 5e-4;
  for (let i = 0; i < a.proposals.length; i += 1) {
    const p = a.proposals[i];
    const q = b.proposals[i];
    if (p.id !== q.id || !near(p.distance, q.distance) || !near(p.fromAt.x, q.fromAt.x) || !near(p.fromAt.y, q.fromAt.y) || !near(p.toAt.x, q.toAt.x) || !near(p.toAt.y, q.toAt.y)) return false;
  }
  for (let i = 0; i < a.refused.length; i += 1) {
    const p = a.refused[i];
    const q = b.refused[i];
    if (p.id !== q.id || p.refusal?.code !== q.refusal?.code || !near(p.distance, q.distance)) return false;
  }
  return true;
}
