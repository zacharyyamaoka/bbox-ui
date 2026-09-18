// src/scene/batchWire.ts — wiring N ports in one gesture, as pure
// functions over a scene.
//
// PROVENANCE (class (a), ported — see docs/ALGORITHM-PROVENANCE.md).
// Donor: SystemSketch `src/blocks/connections/batchWiring.ts` (473 lines)
// and `wireIntoState.ts` (164 lines), read at
//   /home/bam/systemsketch/.claude/worktrees/vision-consolidated/
//     src/blocks/connections/batchWiring.ts
// Those files are UNTRACKED working-tree files in one systemsketch
// worktree on branch `claude/vision-consolidated` — `git log` for that
// path is empty, so the donor exists nowhere in systemsketch's history.
// Line citations below are against that on-disk file, which was opened in
// full; they are not quotable from any commit.
//
// What is ported verbatim in SHAPE (the decisions, not the code — the
// donor is tldraw `Editor`-bound throughout and none of it compiles here):
//   - `resolvePair`          donor :156-215  → `resolveWirePair`
//   - `planWireInto`         donor :430-447  → `planBatchWire`
//   - `wireIntoTargetKeys`   donor :407-425  → `batchWireTargets`
//   - `getWireIntoSources`   donor :350-366  → `batchWireSources`
//   - `REFUSAL_PRECEDENCE`   donor :80-90    → `DEFAULT_REFUSAL_PRECEDENCE`
//   - `REFUSAL_WORDS`        donor :92-102   → `REFUSAL_WORDS`
//   - `dominantBatchRefusal` donor :105-110  → `dominantRefusal`
//   - `tallyRefusals`        donor :248-254  → `tallyRefusals`
//   - `describeBatchWireOutcome` donor :257-271 → same name
//
// What is OURS (class (c), ad hoc — no prior art claimed): `batchWireEdges`
// and `applyBatchWire`. The donor's equivalent (`createBatchConnections`,
// :281-338) is 57 lines of tldraw binding creation, history marking and
// type adoption, none of which has a meaning here; what survives is only
// its ordering guarantee (plan, then re-judge at commit, then build).
//
// ── The feature, in the donor's own words (its header, :1-30) ──────────
// Two commands, one mechanism, differing in exactly ONE thing — where a
// landing click is allowed to land:
//   1. "Wire into…"   pick the sources, invoke, click ONE target dot
//                     ANYWHERE a source could legally reach, including
//                     outside the selection entirely.
//   2. "Wire together" pick the whole group as sources, invoke, click one
//                     of THEIR OWN ports to elect it the hub — the rest
//                     of the group wires into it.
// Zach recalls these as "wire to" and "wire within" (PROJECT - Black Box
// UI.md:2748, "I think two things"); the code's names are the two above.
// See `BatchWireIntent`.
import { childrenOf, portKey, type BlockScene, type SceneData, type SceneEdge } from "./scene";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a landing click may land — the donor's entire difference between
 * its two commands, made a parameter instead of two entry points.
 *
 * WHY one axis rather than two functions: the donor arrived here by
 * deletion. `wireIntoState.ts:100-121` has `startWireInto` and
 * `startWireTogether` calling the SAME `arm()` with the same sources and
 * differing only in whether `candidateHosts` is passed — `together` passes
 * the source list as its own candidate hosts. So "together" is not a
 * second algorithm, it is `into` with the candidate set narrowed to the
 * selection. Keeping that as one parameter is what makes the two provably
 * incapable of drifting apart.
 */
export type BatchWireIntent = "into" | "together";

/** A port, named the way the whole kit names one: (node id, port id). */
export interface PortRef {
  nodeId: string;
  portId: string;
}

/** One cable a batch intends to create, with BOTH ports already chosen. */
export interface BatchWirePair {
  source: PortRef;
  target: PortRef;
}

/**
 * Why one candidate cable was refused. An opaque string on purpose.
 *
 * WHY not a closed union: the availability rules are a SIBLING lane's
 * product (`validateConnection` in `edgeValidation.ts`), and a union
 * declared here would either duplicate their taxonomy or force them to
 * match the donor's eight words. The only thing this module needs from a
 * reason is that equal reasons compare equal and that a caller can rank
 * them — `DEFAULT_REFUSAL_PRECEDENCE` is a default, not a constraint.
 */
export type WireRefusal = string;

/**
 * The one reason a batch can produce that a drag never can.
 *
 * Donor :72 — "a drag names both its ends by being pressed on one and
 * released on the other, and a batch has to CHOOSE which pair of ports
 * the cable joins." This is the choice failing, and it belongs to this
 * module rather than to any judge.
 */
export const AMBIGUOUS: WireRefusal = "ambiguous";

/**
 * A judge's answer about one candidate cable.
 *
 * `silent` is BATCH-WIRING'S OWN device, not a mirror of a sibling
 * contract: `ConnectionVerdict` (`edgeValidation.ts`) is two-outcome now —
 * ruling 1 abolished its silent refusal case, so "allowed: false" always
 * carries a `refusal` there. This module keeps its own `silent` regardless,
 * because the reason to have one is local to a BATCH: a dot's ring is
 * binary (a port either produces cables or it does not) but the SENTENCE a
 * batch ends with is a summary a caller may reasonably want to keep quiet
 * about some refusals without hiding the dot itself — `validateConnectionJudge`
 * (`batchWireJudge.ts`) never sets it, so nothing produced by the real
 * engine is silent today; a caller with its own judge is free to.
 */
export type WireVerdict =
  | {
    ok: true;
    /**
     * The pair re-ordered so `source` is the dataflow SOURCE — the end an
     * edge's `source`/`sourceHandle` must name. Omitted means "as asked".
     *
     * WHY the verdict owns the orientation rather than the batch: a gesture
     * names its ends in the order the user touched them, and that order is
     * not the dataflow direction. Select a block and land on a port that
     * turns out to be an OUTPUT and the cable runs backwards — its
     * arrowhead points the wrong way, and `producersOf`, `consumersOf` and
     * `topologicalOrder` all read it inverted. Only whoever knows polarity
     * can fix that, and that is the judge.
     *
     * This was a real bug here, and a faithful-looking port is exactly how
     * it got in: the donor ends `createBatchConnections` with
     * `normalizeConnectionDirection(editor, connectionId)` — "exactly what
     * a released drag does, so a batched cable and a drawn one are the same
     * object afterwards" (donor :330-332) — which reads like tldraw
     * binding plumbing and is in fact this rule. It surfaced when a name
     * match paired one block's `logs` INPUT with another's `logs` OUTPUT
     * and the edge came out reversed.
     *
     * The donor's own judge reports the same thing the same way: its
     * `ConnectionVerdict` ok-case carries explicit `source` and `sink`
     * endpoints (`connectionRules.ts:53-63`, opened), not just `ok`.
     */
    oriented?: BatchWirePair;
  }
  | { ok: false; reason: WireRefusal; silent?: boolean };

/**
 * Is this cable allowed? THE injected seam of this module.
 *
 * Deliberately `(candidate) => verdict` and NOT `(scene, candidate) =>
 * verdict`: the caller closes over its own scene, so this module never
 * learns a scene type it would then constrain. The sibling validation
 * lane's producer adapts through `validateConnectionJudge`
 * (`batchWireJudge.ts`) — not literally the one-liner earlier drafts of
 * this comment promised (`WireVerdict`/`ConnectionVerdict` disagree on
 * shape), but the same idea: a closure over the scene, in the same
 * position `findDanglingEdges`' `portsOf` occupies (`scene.ts:424`) and
 * for the same reason — the scene does not own port polarity, types, or
 * cycle policy, so a function that asks it must be handed the answer
 * rather than guess one.
 */
export type WireJudge = (candidate: BatchWirePair) => WireVerdict;

/**
 * A node's LIVE port vocabulary, or `undefined` for "unknown".
 *
 * Same contract as `findDanglingEdges`' `portsOf` (`scene.ts:424`), and
 * "live" is load-bearing: the donor filters hidden ports out before
 * reasoning (`livePorts`, donor :150-152). Rather than carry a second
 * hidden-ness concept, a host that hides a port simply omits it here —
 * one place decides what exists.
 */
export type PortsOf = (nodeId: string) => readonly string[] | undefined;

/**
 * A port's NAME, for the name-match tiebreak. Defaults to the port id.
 *
 * Names are identity-free data in this kit (`scene.ts:74`'s identity
 * note), which is exactly why they can carry intent: see
 * `resolveWirePair`.
 */
export type PortNameOf = (ref: PortRef) => string | undefined;

/* ------------------------------------------------------------------ */
/* Refusal ranking and words — donor :80-110, :92-102                  */
/* ------------------------------------------------------------------ */

/**
 * The order refusals are reported in when one source's ports disagree —
 * most specific first, "so 'you already wired this' beats 'and also the
 * other eight ports point the wrong way'" (donor :77-79).
 *
 * Ported as the DEFAULT only. A caller whose judge speaks a different
 * taxonomy passes its own ranking; an unranked reason sorts last.
 */
export const DEFAULT_REFUSAL_PRECEDENCE: readonly WireRefusal[] = [
  "ambiguous",
  "duplicate",
  "input-occupied",
  "cycle",
  "type-mismatch",
  "no-shared-scope",
  "same-polarity",
  "hidden-port",
  "missing-port",
];

/** Donor :92-102, verbatim wording. */
export const REFUSAL_WORDS: Readonly<Record<string, string>> = {
  ambiguous: "no single obvious port",
  duplicate: "already wired",
  "input-occupied": "input already fed",
  cycle: "would loop",
  "type-mismatch": "type mismatch",
  "no-shared-scope": "not in the same scope",
  "same-polarity": "same direction",
  "hidden-port": "port hidden",
  "missing-port": "no port",
};

/** A refusal in words. An unknown reason prints itself — never blank. */
export function describeWireRefusal(reason: WireRefusal): string {
  return REFUSAL_WORDS[reason] ?? reason;
}

/**
 * The one reason worth showing when a source's ports refused for several.
 * Donor :105-110, including its empty-list default.
 */
export function dominantRefusal(
  refusals: readonly WireRefusal[],
  precedence: readonly WireRefusal[] = DEFAULT_REFUSAL_PRECEDENCE,
): WireRefusal {
  for (const reason of precedence) {
    if (refusals.includes(reason)) return reason;
  }
  return refusals[0] ?? "missing-port";
}

/* ------------------------------------------------------------------ */
/* Choosing WHICH pair of ports — donor :156-215                       */
/* ------------------------------------------------------------------ */

export type WirePairChoice =
  | { ok: true; pair: BatchWirePair; matchedByName: boolean }
  | { ok: false; reason: WireRefusal };

export interface ResolveWirePairInput {
  /** The node a cable should leave from. Which of its ports is the question. */
  sourceNodeId: string;
  /** The landing(s) under consideration — one, in every caller so far. */
  targets: readonly PortRef[];
  portsOf: PortsOf;
  judge: WireJudge;
  nameOf?: PortNameOf;
  precedence?: readonly WireRefusal[];
}

/**
 * Which pair of ports a cable from `sourceNodeId` to one of `targets`
 * joins — or a refusal.
 *
 * WHY a name match outranks everything, and why MORE THAN ONE legal
 * pairing is a refusal rather than a pick (donor :127-147, condensed —
 * this is the single most load-bearing decision in the feature):
 *
 *   The obvious rule, "take the first pair that fits", is what a tap
 *   already does and it is fine when a cable's far end is one block the
 *   user can see. It is not fine for a batch. A block carrying nine
 *   standard inputs, every one legal against an untyped port, would
 *   "quietly wire `config` five times when the user meant `logs`". A
 *   batch's whole value is that you do NOT inspect the forty cables it
 *   made, which is exactly why it may not guess.
 *
 * So: names ARE the spec for a standard vocabulary, a name match is read
 * as intent, a single legal pairing is unambiguous, and everything else
 * is `AMBIGUOUS` rather than picked. Two DIFFERENT names both matching is
 * two channels, not one cable — also refused.
 */
export function resolveWirePair(input: ResolveWirePairInput): WirePairChoice {
  const { sourceNodeId, targets, portsOf, judge, nameOf, precedence } = input;
  const named: BatchWirePair[] = [];
  const legal: BatchWirePair[] = [];
  const refusals: WireRefusal[] = [];

  const sourcePorts = portsOf(sourceNodeId);
  if (sourcePorts === undefined || sourcePorts.length === 0) {
    return { ok: false, reason: "missing-port" };
  }

  for (const sourcePortId of sourcePorts) {
    const source: PortRef = { nodeId: sourceNodeId, portId: sourcePortId };
    for (const target of targets) {
      // A target naming a port its node does not speak is `missing-port`,
      // the same reason `findDanglingEdges` gives for the same fact.
      const targetPorts = portsOf(target.nodeId);
      if (targetPorts !== undefined && !targetPorts.includes(target.portId)) {
        refusals.push("missing-port");
        continue;
      }
      const verdict = judge({ source, target });
      if (!verdict.ok) {
        refusals.push(verdict.reason);
        continue;
      }
      const pair: BatchWirePair = { source, target };
      legal.push(pair);
      const sourceName = (nameOf?.(source) ?? source.portId).trim();
      const targetName = (nameOf?.(target) ?? target.portId).trim();
      if (sourceName !== "" && sourceName === targetName) named.push(pair);
    }
  }

  if (named.length === 1) return { ok: true, pair: named[0], matchedByName: true };
  if (named.length > 1) return { ok: false, reason: AMBIGUOUS };
  if (legal.length === 1) return { ok: true, pair: legal[0], matchedByName: false };
  if (legal.length > 1) return { ok: false, reason: AMBIGUOUS };
  return { ok: false, reason: dominantRefusal(refusals, precedence) };
}

/* ------------------------------------------------------------------ */
/* The plan — donor :430-447                                           */
/* ------------------------------------------------------------------ */

export interface BatchWirePlan {
  pairs: BatchWirePair[];
  /** One entry per source that got no cable, in source order. */
  refusals: WireRefusal[];
}

export interface PlanBatchWireInput {
  /** Node ids, in selection order — the sources. */
  sources: readonly string[];
  /** The landing a click chose. */
  target: PortRef;
  portsOf: PortsOf;
  judge: WireJudge;
  nameOf?: PortNameOf;
  precedence?: readonly WireRefusal[];
}

/**
 * What a click on `target` would create.
 *
 * A source that IS the target's own node is skipped rather than refused
 * (donor :427-429): "wire these five into one of themselves" is four
 * cables and a no-op, not four cables and a complaint. That skip is also
 * the entire implementation of the hub in `"together"` — see
 * `batchWireTargets`.
 */
export function planBatchWire(input: PlanBatchWireInput): BatchWirePlan {
  const { sources, target, portsOf, judge, nameOf, precedence } = input;
  const pairs: BatchWirePair[] = [];
  const refusals: WireRefusal[] = [];
  for (const sourceNodeId of sources) {
    if (sourceNodeId === target.nodeId) continue;
    const choice = resolveWirePair({ sourceNodeId, targets: [target], portsOf, judge, nameOf, precedence });
    if (choice.ok) pairs.push(choice.pair);
    else refusals.push(choice.reason);
  }
  return { pairs, refusals };
}

/* ------------------------------------------------------------------ */
/* Availability — the "smart detection". Donor :407-425                */
/* ------------------------------------------------------------------ */

export interface BatchWireTargetsInput {
  sources: readonly string[];
  intent: BatchWireIntent;
  /** Every node a landing could sit on — the board, for `"into"`. */
  candidateNodeIds: readonly string[];
  portsOf: PortsOf;
  judge: WireJudge;
  nameOf?: PortNameOf;
}

/**
 * Every dot this armed batch could land on, as `portKey` strings.
 *
 * THIS is the function Zach describes as "smart detection to show the
 * available ports and then hide the ones that weren't available"
 * (PROJECT - Black Box UI.md:2750).
 *
 * WHY a dot earns its ring only when at least one SOURCE — not merely one
 * port — would get a cable (donor :400-403): a landing that every source
 * resolves ambiguously against is perfectly legal and still wires
 * nothing, so judging per port would make the ring promise landings that
 * then did nothing. The question is a RESOLUTION ("would clicking here
 * produce cables"), not a judgement ("is some port legal here") — the
 * donor's `EligibleLanding` union carries exactly that distinction in its
 * own comment (`src/blocks/ports/portState.ts:40-56`).
 *
 * `intent` is the whole difference between the two commands:
 *   - `"into"`     — candidates are the board; a click may land anywhere.
 *   - `"together"` — candidates are narrowed to the SOURCES themselves.
 *     `planBatchWire` already skips a source equal to the target's node,
 *     so passing the selection as its own candidates is exactly "wire the
 *     rest of the group into whichever member this dot belongs to". No
 *     separate hub concept exists, here or in the donor (:449-465).
 *
 * Static for the length of an armed gesture: the donor computes it once
 * on arming rather than per dot per repaint (donor :403-406), and the
 * click re-judges every pair anyway (`batchWireEdges`).
 */
export function batchWireTargets(input: BatchWireTargetsInput): Set<string> {
  const { sources, intent, candidateNodeIds, portsOf, judge, nameOf } = input;
  const hosts = intent === "together" ? sources : candidateNodeIds;
  const keys = new Set<string>();
  for (const nodeId of hosts) {
    for (const portId of portsOf(nodeId) ?? []) {
      const target: PortRef = { nodeId, portId };
      if (planBatchWire({ sources, target, portsOf, judge, nameOf }).pairs.length > 0) {
        keys.add(portKey(nodeId, portId));
      }
    }
  }
  return keys;
}

/**
 * Is a batch worth arming at all?
 *
 * Donor `wireIntoState.ts:78-82` refuses to ENTER the pending state when
 * the ring would be empty: "an invisible mode with no affordance is a
 * failure a caller should report, not a mode to sit in." Same pre-check,
 * same computation as the ring itself, so the two cannot disagree.
 */
export function canArmBatchWire(input: BatchWireTargetsInput): boolean {
  return batchWireTargets(input).size > 0;
}

/* ------------------------------------------------------------------ */
/* Reading a selection — donor :340-366                                */
/* ------------------------------------------------------------------ */

export interface BatchWireSources {
  /** `"container"` is the scope shorthand: one node stands for its members. */
  kind: "list" | "container";
  /** Node ids, in scene order for a container, selection order for a list. */
  sources: string[];
  /** The node the sources share as parent, when they share one. */
  containerId: string | null;
}

/**
 * The sources for BOTH commands, read off a selection.
 *
 * Donor :344-349: "two or more port hosts are a literal list, and one
 * container is the deliberate shorthand for everything inside it."
 * Re-expressed through this kit's own nesting fact — a container is a
 * node with members (`childrenOf`, `scene.ts:523`) — rather than the
 * donor's `isExpandedBlockShape || isExpandedSystemShape` shape test,
 * which names tldraw shape types that do not exist here.
 *
 * WHY the container shorthand is worth keeping even though it is not the
 * `"together"` intent: selecting one block and wiring inside it is the
 * most literal possible reading of Zach's remembered name "wire within",
 * and it is a SELECTION read, orthogonal to where the click may land. Both
 * axes are in the donor; collapsing them would lose one.
 *
 * Returns `null` when nothing can be armed — fewer than two sources.
 */
export function batchWireSources<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  selectedNodeIds: readonly string[],
): BatchWireSources | null {
  if (selectedNodeIds.length === 1) {
    const containerId = selectedNodeIds[0];
    const members = childrenOf(scene, containerId).map((node) => node.id);
    return members.length >= 2 ? { kind: "container", sources: members, containerId } : null;
  }
  const known = new Set(scene.nodes.map((node) => node.id));
  const sources = selectedNodeIds.filter((id) => known.has(id));
  if (sources.length < 2) return null;
  return { kind: "list", sources, containerId: sharedParentId(scene, sources) };
}

/** The one parent every named node sits directly inside, if they share one. */
export function sharedParentId<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeIds: readonly string[],
): string | null {
  if (nodeIds.length === 0) return null;
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const parents = new Set<string | undefined>(nodeIds.map((id) => byId.get(id)?.parentId));
  if (parents.size !== 1) return null;
  const [parentId] = [...parents];
  return parentId ?? null;
}

/* ------------------------------------------------------------------ */
/* The commit — OURS (class (c)). Donor :281-338 is tldraw bindings.   */
/* ------------------------------------------------------------------ */

export interface BatchWireOutcome {
  created: number;
  /** How many sources were asked. */
  sources: number;
  /** Refusal counts, most common first, ties alphabetical. */
  refused: readonly { reason: WireRefusal; count: number }[];
  /** Named in the sentence for `"together"`, which CHOSE this end. */
  hubLabel?: string;
}

export const EMPTY_BATCH_WIRE_OUTCOME: BatchWireOutcome = { created: 0, sources: 0, refused: [] };

/** Donor :248-254, including its count-then-alphabetical sort. */
export function tallyRefusals(reasons: readonly WireRefusal[]): BatchWireOutcome["refused"] {
  const counts = new Map<WireRefusal, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/**
 * The one sentence a batch says when it is done. Donor :257-271, wording
 * preserved exactly — including the em-dash and middot punctuation, which
 * is what makes the four shapes distinguishable at a glance.
 *
 * WHY a sentence at all (donor `batchWiringCommands.ts:9-14`): "silence is
 * what this whole feature exists to avoid — a command that runs and does
 * nothing is indistinguishable from a bug."
 */
export function describeBatchWireOutcome(outcome: BatchWireOutcome): string {
  const into = outcome.hubLabel ? ` into ${outcome.hubLabel}` : "";
  if (outcome.created === 0) {
    const only = outcome.refused[0];
    return only ? `Wired nothing${into} — ${describeWireRefusal(only.reason)}` : `Wired nothing${into}`;
  }
  const cables = `${outcome.created} cable${outcome.created === 1 ? "" : "s"}`;
  if (outcome.refused.length === 0) return `Wired ${cables}${into}`;
  const skipped = outcome.refused.map((entry) => `${entry.count} ${describeWireRefusal(entry.reason)}`).join(", ");
  return `Wired ${cables}${into} · skipped ${skipped}`;
}

/**
 * A judge rebuilt against a scene — the commit-time seam.
 *
 * WHY the commit needs a FACTORY where arming needs only a judge: a batch's
 * cables are judged against each other, not merely against the board it
 * started from. Wire five sensors into one input under a single-feed rule
 * and the first cable occupies it, so the other four must be refused — but
 * only if the second judging can SEE the first cable. The donor gets this
 * for free and invisibly: `judgeConnection(editor, …)` reads the live
 * `Editor`, which `editor.run()` is mutating as each shape is created
 * (donor :281-338). A pure function has no live anything, so the scene has
 * to be rebuilt between pairs and the judge re-derived from it.
 *
 * This was a real bug here first, caught by a story asserting the sentence:
 * a batch of three into one input reported "Wired 2 cables" with no
 * refusals, against rules that permit one. That is precisely the silent
 * failure the feature exists to prevent — "a batch's whole value is that
 * you do NOT inspect the forty cables it made" (donor :138-140) — so the
 * asymmetry is load-bearing, not ceremony.
 *
 * The sibling validation lane adapts the same way, real now:
 *     const sceneJudge: SceneJudge = (s) => validateConnectionJudge(s, options);
 * (`batchWireJudge.ts`'s `validateConnectionJudge`, options carrying the
 * host's `portsOf`/`directionOf` — see that file and `BatchWiring.stories.tsx`'s
 * own `judgeWith` for the shape a caller actually uses.)
 */
export type SceneJudge<N extends SceneData = SceneData, E extends SceneData = SceneData> = (
  scene: BlockScene<N, E>,
) => WireJudge;

export interface BatchWireEdgesInput<E extends SceneData = SceneData> {
  plan: BatchWirePlan;
  /**
   * The judge for the Nth cable, given the N-1 already committed. A caller
   * with static rules passes `() => judge`; one whose rules see other
   * cables rebuilds its scene from `committed`.
   */
  judgeAt: (committed: readonly SceneEdge<E>[]) => WireJudge;
  /** Host-owned id minting — the kit's D9 rule (`duplicateNode`,
   *  `scene.ts:472`): this module never invents an id. */
  mintEdgeId: (pair: BatchWirePair, index: number) => string;
  /** Per-edge `data`, if the host styles batched wires. */
  edgeData?: (pair: BatchWirePair, index: number) => SceneData | undefined;
}

export interface BatchWireCommit<E extends SceneData = SceneData> {
  edges: SceneEdge<E>[];
  /** Planned pairs the SECOND judging rejected, as refusals. */
  lateRefusals: WireRefusal[];
}

/**
 * The edges a commit would create — the plan, re-judged.
 *
 * WHY judge twice (donor :276-280): "the pairs were judged when they were
 * planned, and they are judged again here — planning and creating are
 * separated by a click, and the board can move in between." A pair that
 * passed planning and fails now "lost a race with the board; it is a
 * refusal like any other rather than a silent hole" (donor :468-470).
 *
 * `source`/`target` map onto the kit's own dataflow direction unchanged:
 * the batch's source port becomes the edge's `source`/`sourceHandle`, the
 * clicked landing its `target`/`targetHandle` — which is the direction
 * `sceneWires` then reads for the arrowhead (`sceneWires.ts`).
 */
export function batchWireEdges<E extends SceneData = SceneData>(
  input: BatchWireEdgesInput<E>,
): BatchWireCommit<E> {
  const { plan, judgeAt, mintEdgeId, edgeData } = input;
  const edges: SceneEdge<E>[] = [];
  const lateRefusals: WireRefusal[] = [];
  plan.pairs.forEach((pair, index) => {
    // Each pair is judged against the board PLUS the cables this batch has
    // already committed — see `SceneJudge`.
    const verdict = judgeAt(edges)(pair);
    if (!verdict.ok) {
      lateRefusals.push(verdict.reason);
      return;
    }
    const data = edgeData?.(pair, index);
    // The judge's orientation wins over the gesture's order — see
    // `WireVerdict.oriented`. The id and the `data` are still minted from
    // the pair AS CHOSEN, so a caller keying off the clicked landing is
    // unaffected by the flip.
    const wire = verdict.oriented ?? pair;
    edges.push({
      id: mintEdgeId(pair, index),
      source: wire.source.nodeId,
      sourceHandle: wire.source.portId,
      target: wire.target.nodeId,
      targetHandle: wire.target.portId,
      ...(data !== undefined ? { data: data as E } : {}),
    });
  });
  return { edges, lateRefusals };
}

/**
 * Run a whole batch: plan, re-judge, append the edges, report.
 *
 * Total and non-mutating — an empty plan returns the SAME scene object
 * (not a structurally-equal copy), the no-op contract `duplicateNode` and
 * `reconcilePortLane` already set for this codebase.
 *
 * The donor's `createBatchConnections` wraps this in one
 * `markHistoryStoppingPoint` + one `editor.run` so "a batch of forty
 * cables is one Ctrl+Z" (donor :22-25). There is no history here to mark:
 * one returned scene IS one undo step for any host that keeps a scene
 * stack, which is the same guarantee arrived at by having no mechanism
 * rather than by using one.
 */
export function applyBatchWire<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  input: {
    sources: readonly string[];
    target: PortRef;
    portsOf: PortsOf;
    /** Rebuilt per cable so a batch's cables are judged against each
     *  other, not only against the board — see `SceneJudge`. */
    judgeFor: SceneJudge<N, E>;
    mintEdgeId: (pair: BatchWirePair, index: number) => string;
    nameOf?: PortNameOf;
    edgeData?: (pair: BatchWirePair, index: number) => SceneData | undefined;
    /** Shown in the sentence when `"together"` elected a hub. */
    hubLabel?: string;
    precedence?: readonly WireRefusal[];
  },
): { scene: BlockScene<N, E>; outcome: BatchWireOutcome } {
  // Planning sees the board as it is — the same scene `batchWireTargets`
  // rang the dots against, so the plan cannot disagree with the ring.
  const plan = planBatchWire({ ...input, judge: input.judgeFor(scene) });
  const { edges, lateRefusals } = batchWireEdges<E>({
    plan,
    judgeAt: (committed) => input.judgeFor({ ...scene, edges: [...scene.edges, ...committed] }),
    mintEdgeId: input.mintEdgeId,
    edgeData: input.edgeData,
  });
  const outcome: BatchWireOutcome = {
    created: edges.length,
    sources: input.sources.length,
    refused: tallyRefusals([...plan.refusals, ...lateRefusals]),
    ...(input.hubLabel !== undefined ? { hubLabel: input.hubLabel } : {}),
  };
  if (edges.length === 0) return { scene, outcome };
  return { scene: { ...scene, nodes: scene.nodes, edges: [...scene.edges, ...edges] }, outcome };
}
