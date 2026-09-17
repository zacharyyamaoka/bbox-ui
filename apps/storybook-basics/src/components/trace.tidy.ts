// src/components/trace.tidy.ts — the Tidy pass, restated as a PURE function
// over fixture data.
//
// PROVENANCE. The pipeline below is SystemSketch's
// `src/blocks/connections/tidyEdges.ts:159-233` (read-only donor, read
// 2026-09-17). `TidyEdgesOutcome`, `EMPTY_TIDY_EDGES_OUTCOME`,
// `describeTidyEdgesOutcome` and `plural` are ported VERBATIM from
// `:51-96` — that human sentence ("Tidied 3 edges, kept 1 hand-routed…") is
// the status line these stories print, and it is the donor's wording, not a
// paraphrase. Everything the pipeline CALLS — `planOrthogonalRoute`,
// `stabilizeOrthogonalRoute`, `routeClearsInput`,
// `nudgeRoutesWithoutObstacleCollisions`, `routesHaveSamePoints`,
// `softClearanceCost` — is itself a verbatim port living in `./elbow/`.
//
// WHAT COULD NOT TRAVEL, named rather than hidden. The donor is "orchestration
// only" by its own header, and three things in it are `Editor`-bound:
//
//   1. selection scope     `getTidyEdgesSelection` — which edges the command
//                          even looks at. Here the CALLER passes the list.
//   2. page transforms     `routeInPage` / `automaticRouteModel` — tldraw
//                          shape-local <-> page coordinates. Fixtures are
//                          already in one space, so there is nothing to map.
//   3. persistence         `editor.updateShapes` + the history stopping point.
//                          Here the caller owns the new routes; in a story
//                          that is `setState`.
//
// `routingObstacles.ts` (live Blocks/Branches -> rects) does not travel either:
// in a story the fixture IS the rect list. That is the same core/adapter line
// `ARCHITECTURE.md` draws — the planner is portable, the scene collector is
// the host's.
//
// WHAT IS LEFT is genuinely pure: same inputs, same routes, no clock, no DOM.
//
// ---------------------------------------------------------------------------
// WHERE THE CHANNEL-ASSIGNMENT MATH COMES FROM
//
// Step 5 below (`nudgeRoutesWithoutObstacleCollisions`) is the only step that
// reasons about several cables AT ONCE, so it is the one with a real algorithms
// literature behind it — and reading this file you cannot see that, because the
// algorithm lives one import away. Stated here so you do not have to go looking.
//
// WHAT IT DOES. After steps 1-4 every cable has been routed in ignorance of
// every other cable, so parallel cables between the same two Blocks land on the
// SAME midline and draw as one visible line. Step 5 finds interior segments
// that are collinear and overlapping, groups them into a "bundle" (one shared
// channel), orders the bundle, and spreads its members at `spacing` px apart —
// rejecting any shift that pushes a cable back into a keep-out rect. The
// ordering is a constraint problem, not a sort: pairwise "A must sit left of B"
// constraints are collected from the geometry and resolved by Kahn's algorithm,
// and a CYCLE in those constraints is the honest answer "no assignment can
// remove this crossing" — which is exactly what `outcome.forcedCrossings`
// reports up to the caller.
//
// ITS PROVENANCE IS DOCUMENTED AT ITS OWN SEAM, not restated here: see
// `./elbow/nudge.ts:60-110`, a ~50-line PROVENANCE section naming the lineage
// (the vertical-constraint graph of VLSI channel routing — Hashimoto & Stevens'
// left-edge algorithm, 1971) and comparing the implementation against ELK,
// MSAGL-js and Mermaid. That file is a BYTE-FOR-BYTE port, so those are the
// donor's comparisons, carried intact rather than re-derived; they have not
// been independently re-verified from the upstream sources by this file's
// author. `elbow/provenance.test.ts` is what keeps the attribution from being
// deleted by a tidy-up.
//
// ABOUT libavoid, THE OBVIOUS COMPARATOR. libavoid (Adaptagrams; the router
// draw.io uses) is the reference implementation anyone would reach for here,
// and it does have a directly corresponding stage. Its documentation, read
// 2026-09-17 at https://www.adaptagrams.org/documentation/namespaceAvoid.html,
// defines `idealNudgingDistance` as "the spacing distance that will be used for
// nudging apart overlapping corners and line segments of connectors. By
// default, this distance is set to a value of 4" — the same role `spacing`
// (default 14) plays here. Its algorithms are published in M. Wybrow, K.
// Marriott and P.J. Stuckey, "Orthogonal connector routing", GD '09, LNCS 5849,
// pages 219-231 (citation read the same day at
// https://www.adaptagrams.org/documentation/libavoid.html).
//
// The papers are fair game. THE SOURCE DELIBERATELY WAS NOT READ, and that is a
// decision rather than an omission: libavoid and its TypeScript port
// `obstacle-router` are LGPL, which is not an attribution licence — a credit in
// a comment would not discharge it — so the donor derived the ordering rule
// from the geometry and checked it against MIT/Apache-2.0/EPL-2.0 implementations
// instead. The argument is stated in full at `./elbow/nudge.ts:63-68`. So there
// is no libavoid code in this pipeline and no libavoid line number to cite; the
// resemblance is convergence on the same well-known problem, not lineage.

import {
  DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS,
  channelSpacingDefects,
  hasElbowSoftClearancePreference,
  resolveElbowSoftClearanceOptions,
  softClearanceCost,
  type ElbowRoute,
  type ElbowRouteInput,
  type ChannelSpacingDefect,
  type ElbowSoftClearanceOptions,
  type ElbowSoftRoute,
} from "./elbow/index";
import {
  nudgeRoutesWithoutObstacleCollisions,
  planOrthogonalRoute,
  routeClearsInput,
  routesHaveSamePoints,
  stabilizeOrthogonalRoute,
} from "./elbow/collisionRouting";

/* ----------------------------- ported verbatim ---------------------------- */
/* From tidyEdges.ts:51-96. Wording included — the status line is the donor's. */

export interface TidyEdgesOutcome {
  tidied: number;
  locked: number;
  ignored: number;
  bundles: number;
  forcedCrossings: number;
  unresolved: number;
  revertedNudges: number;
}

export const EMPTY_TIDY_EDGES_OUTCOME: TidyEdgesOutcome = {
  tidied: 0,
  locked: 0,
  ignored: 0,
  bundles: 0,
  forcedCrossings: 0,
  unresolved: 0,
  revertedNudges: 0,
};

export function describeTidyEdgesOutcome(outcome: TidyEdgesOutcome): string {
  if (outcome.tidied === 0 && outcome.locked === 0 && outcome.unresolved === 0) {
    return outcome.ignored > 0
      ? `Nothing to tidy — ${outcome.ignored} edge${plural(outcome.ignored)} ${
        outcome.ignored === 1 ? "is" : "are"
      } curved or straight`
      : "Edges are already tidy";
  }
  const parts = [`Tidied ${outcome.tidied} edge${plural(outcome.tidied)}`];
  if (outcome.locked > 0) parts.push(`kept ${outcome.locked} hand-routed`);
  if (outcome.ignored > 0) parts.push(`skipped ${outcome.ignored} non-elbow`);
  if (outcome.forcedCrossings > 0) {
    parts.push(`${outcome.forcedCrossings} crossing${plural(outcome.forcedCrossings)} cannot be removed`);
  }
  if (outcome.unresolved > 0) {
    parts.push(`${outcome.unresolved} route${plural(outcome.unresolved)} could not clear every obstacle`);
  }
  if (outcome.revertedNudges > 0) {
    parts.push(`kept ${outcome.revertedNudges} channel${plural(outcome.revertedNudges)} clear of Blocks`);
  }
  return parts.join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

/** Default preference used only by Tidy; ordinary live routing is unchanged.
 * Donor name and value (`tidyEdges.ts:128`). */
export const DEFAULT_TIDY_SOFT_CLEARANCE_OPTIONS = DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS;

/* ------------------------------- the seam --------------------------------- */

/**
 * One edge, as Tidy needs to see it.
 *
 * Frozen by docs/TRACE-PLAN.md (P5) so the story fixtures and the pipeline
 * never negotiate. `input` is the routing problem (endpoints, sides, obstacle
 * rects); `current` is what is drawn RIGHT NOW — Tidy is allowed to keep it
 * (that is what makes the pass non-jittery); `locked` marks an edge a person
 * hand-routed, which Tidy treats as an immovable constraint rather than
 * something to fix.
 */
export interface TidyTraceInput {
  input: ElbowRouteInput;
  current: ElbowRoute;
  locked: boolean;
}

export interface TidyTracesOptions {
  /** Ideal gap between two parallel channels. Donor default lives in
   * `DEFAULT_NUDGE_OPTIONS.spacing` (14). */
  spacing?: number;
  /** Local, non-blocking cable separation. Both weights are zeroable, which
   * restores the prior hard-obstacle-only planner exactly (donor wording). */
  softClearance?: Partial<ElbowSoftClearanceOptions>;
}

export interface TidyTracesResult {
  /** New routes, in input order. A locked or unresolved edge gets its
   * `current` route back — byte-identical, never half-moved. */
  routes: ElbowRoute[];
  outcome: TidyEdgesOutcome;
  /** Per-edge: did this edge end up immovable? Includes edges that started
   * `locked` AND edges the pass locked itself because no candidate could
   * clear every obstacle. The stories caption from this. */
  lockedFlags: boolean[];
  /**
   * Local channel-cadence failures that survive the pass: two rails that
   * still share a channel at a gap other than `spacing`.
   *
   * ADDED here, and DELIBERATELY measured against a different baseline than
   * the donor's. Two findings, both reproduced on the five-cable fixture
   * (2026-09-17, `nudge.test.ts`'s own scene):
   *
   *  1. `TidyEdgesOutcome` drops `NudgeReport.spacingDefects` on the floor,
   *     so `describeTidyEdgesOutcome` can say "Tidied 4 edges" about a board
   *     that ended with two rails 7px apart on a 14px cadence.
   *  2. Plumbing the nudger's own field through would not have helped: at
   *     the default soft-clearance weights that field comes back EMPTY for
   *     that scene, because `channelSpacingDefects` only compares rails that
   *     were channel-mates in the routes handed to the nudger — and the soft
   *     re-plan has already scattered them before the nudger runs. The rails
   *     land on 460/555/576/583/597, gaps 95/21/7 against an expected 14,
   *     and nothing in the pipeline says a word.
   *
   * So this is computed against the routes the CALLER had when they pressed
   * Tidy, which is the question a person actually asks ("these were sharing
   * a channel; how are they spaced now?"). With both soft weights zeroed the
   * same scene lands on a textbook 432/446/460/474/488 and reports none.
   */
  spacingDefects: ChannelSpacingDefect[];
}

/**
 * The Tidy pipeline, in the donor's own order (`tidyEdges.ts:159-233`):
 *
 *  1. `planOrthogonalRoute` — unweighted baseline, A* around hard keep-outs.
 *  2. Soft clearance with a DETERMINISTIC priority: locked routes are anchors,
 *     then automatic edges yield in stable input order, and an edge only
 *     re-plans against references it is actually inside the desired gap of.
 *     That tie-break is what makes the pass repeatable rather than a mutual
 *     rewrite whose answer depends on iteration order.
 *  3. `stabilizeOrthogonalRoute` — keep a still-clear previous corridor, so a
 *     distant board change is a no-op for this edge.
 *  4. `routeClearsInput` — an edge that cannot clear every obstacle is LOCKED
 *     and counted `unresolved`. Never half-moved into a Block.
 *  5. `nudgeRoutesWithoutObstacleCollisions` — spread coincident channels,
 *     rejecting any shift that re-enters a keep-out.
 *  6. Reject nudges that undo a soft-clearance win.
 *
 * Pure: same edges in, same routes out.
 */
export function tidyTraces(
  edges: readonly TidyTraceInput[],
  options: TidyTracesOptions = {},
): TidyTracesResult {
  if (edges.length === 0) {
    return { routes: [], outcome: EMPTY_TIDY_EDGES_OUTCOME, lockedFlags: [], spacingDefects: [] };
  }

  const currentRoutes = edges.map((edge) => edge.current);
  // WHY `undefined` for a locked edge rather than its input: that is exactly
  // how the donor marks "do not validate a nudge for this one" — the nudger
  // never proposes a shift for a locked route in the first place, and passing
  // an input would invite a future refactor to start checking one.
  const inputsByRoute: (ElbowRouteInput | undefined)[] = edges.map((edge) =>
    edge.locked ? undefined : edge.input);
  const lockedFlags = edges.map((edge) => edge.locked);
  const lockedAtInput = lockedFlags.filter(Boolean).length;
  let unresolved = 0;

  // Establish an unweighted baseline first. The soft pass then compares only
  // routes that actually enter the desired gap, keeping the local grid compact
  // on dense boards and keeping the policy deterministic.
  const baselineRoutes = edges.map((edge, index) => (
    lockedFlags[index] ? currentRoutes[index] : planOrthogonalRoute(edge.input)
  ));
  const softOptions = resolveElbowSoftClearanceOptions(options.softClearance);
  const softEnabled = hasElbowSoftClearancePreference(softOptions);
  const plannedRoutes = baselineRoutes.map((route) => route);

  // Soft avoidance has a deterministic priority rather than a mutual rewrite:
  // locked routes are anchors, then automatic participants yield in stable
  // order. That gives the local solve a repeatable tie-break.
  for (let index = 0; index < edges.length; index += 1) {
    if (lockedFlags[index]) continue;
    const references: ElbowSoftRoute[] = softEnabled
      ? plannedRoutes
        .filter((_, referenceIndex) => referenceIndex !== index && (
          lockedFlags[referenceIndex] || referenceIndex < index
        ))
        .filter((route) => softClearanceCost(
          baselineRoutes[index].points,
          [route],
          softOptions,
        ) > 1e-6 || softClearanceCost(
          currentRoutes[index].points,
          [route],
          softOptions,
        ) > 1e-6)
        .map((route) => ({ points: route.points }))
      : [];
    const input = references.length > 0
      ? { ...edges[index].input, softClearance: { routes: references, options: softOptions } }
      : edges[index].input;
    const planned = references.length > 0 ? planOrthogonalRoute(input) : baselineRoutes[index];
    const stable = stabilizeOrthogonalRoute(currentRoutes[index], planned, input);
    if (!routeClearsInput(stable, edges[index].input)) {
      lockedFlags[index] = true;
      unresolved += 1;
      plannedRoutes[index] = currentRoutes[index];
      continue;
    }
    plannedRoutes[index] = stable;
  }

  const report = nudgeRoutesWithoutObstacleCollisions(
    plannedRoutes,
    inputsByRoute,
    lockedFlags,
    options.spacing === undefined ? {} : { spacing: options.spacing },
  );

  // Channel spreading is deliberately independent from path planning. Keep
  // that useful parallel-rail pass, but reject any nudge that would undo the
  // selected route's soft-clearance win against its deterministic predecessors.
  const routes = report.routes.map((route, index) => {
    if (!softEnabled || lockedFlags[index] || routesHaveSamePoints(route, plannedRoutes[index])) return route;
    const references = plannedRoutes
      .filter((_, referenceIndex) => referenceIndex !== index && (
        lockedFlags[referenceIndex] || referenceIndex < index
      ))
      .map((reference) => ({ points: reference.points }));
    const beforeCost = softClearanceCost(plannedRoutes[index].points, references, softOptions);
    const afterCost = softClearanceCost(route.points, references, softOptions);
    return afterCost > beforeCost + 1e-6 ? plannedRoutes[index] : route;
  });

  // An edge the pass could not move keeps its ORIGINAL route object, not a
  // reconstruction — `TidyLockedRespected` asserts byte-identity, so handing
  // back a fresh-but-equal array would quietly weaken that story's claim.
  const finalRoutes = routes.map((route, index) => (
    lockedFlags[index] ? currentRoutes[index] : route
  ));

  const tidied = finalRoutes.filter((route, index) => (
    !lockedFlags[index] && !routesHaveSamePoints(currentRoutes[index], route)
  )).length;

  return {
    routes: finalRoutes,
    lockedFlags,
    spacingDefects: channelSpacingDefects(
      currentRoutes,
      finalRoutes,
      lockedFlags,
      options.spacing === undefined ? {} : { spacing: options.spacing },
    ),
    outcome: {
      tidied,
      locked: lockedAtInput,
      // WHY always 0 here, and why the field stays: the donor counts
      // connections whose `routing` is curved or straight — edges Tidy is not
      // allowed to touch at all. A `TidyTraceInput` is an elbow route by
      // construction, so nothing can land in this bucket. The field survives
      // because `describeTidyEdgesOutcome` is ported verbatim and a real host
      // (which does have curved edges) fills it in.
      ignored: 0,
      bundles: report.bundles.length,
      forcedCrossings: report.forcedCrossings.length,
      unresolved,
      revertedNudges: report.reverted.length,
    },
  };
}
