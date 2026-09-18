// src/scene/edgeValidation.ts — the PREVENTION engine: f(scene, a candidate
// edge not yet committed) → verdict. Pure, no React, no DOM, no canvas
// engine — the same rule `lint.ts` and the rest of the scene kit follow.
//
// This is `lint.ts`'s twin, not a duplicate of it. Per
// docs/INVALID-STATES-PLAN.md's Appendix B: "all three libraries [maxGraph,
// JointJS, Vyuh] spend their budget on PREVENTION [validate at drag time,
// then show nothing at rest]; this plan spends its budget on ANNOTATION
// [report on state that already exists]... they are complements, not
// alternatives... adopting the prevention layer converts most would-be
// diagnostics into non-events, which is strictly better than rendering them
// well." `lintScene` is the annotation half; `validateConnection` below is
// the prevention half, and it reuses `lint.ts`'s OWN rules rather than
// re-implementing them — a candidate this rejects is, by construction,
// exactly a candidate that `lintScene` would otherwise have to report once
// committed. The two engines share one rule vocabulary; only the moment
// they run differs.
//
// WHICH rules gate a connection, and which don't:
//   - dangling-edge: gates. A candidate naming a node/port that does not
//     exist cannot be committed at all.
//   - self-connection: gates. Same rule, same message.
//   - many-to-one: gates. Committing this candidate must not push its
//     target port to 2+ producers — this is the concrete case
//     docs/INVALID-STATES-PLAN.md's Appendix B means by "converts most
//     would-be diagnostics into non-events": today a many-to-one is only
//     ever caught after the fact by `lintScene`; a host that wires THIS
//     function into its drag/drop interaction never lets the second wire
//     land, so the at-rest lint finding never has a reason to fire.
//   - type-mismatch: gates LAST, and only when a `typeOf` vocabulary is
//     supplied (see `LintRuleContext` in lint.ts) — the same rule
//     `lintScene`'s `type-mismatch` finding is built from, run here
//     before commit instead of after.
//   - duplicate-edge: does NOT gate, deliberately. `wiring.ts`'s own header
//     states the app's permission-free stance verbatim — "draw as many
//     wires as you want... even multiple wires between the same two
//     ports... nothing here validates" (wiring.ts:20-22). Blocking a
//     duplicate at connect time would contradict a decision this repo has
//     already made; `lintScene`'s duplicate-edge rule stays a WARNING a
//     host can surface, never a refusal this function issues.
//   - cycle: does NOT gate. Nothing in scene.ts states cycles are illegal —
//     `topologicalOrder`'s own header treats a cycle as "the linter's real
//     input" (something to REPORT), and a feedback loop is a legitimate
//     graph in plenty of dataflow domains (control loops, audio feedback).
//     Blocking every cycle at connect time is a product call this file has
//     no authority to make unilaterally; `cycle` stays lint-only.
//
// WHY EVERY GATE IS EXPLAINED — this overrides what shipped before
// (2026-09-18, "final spec" lane, ruling 1). The previous version of this
// file had a SILENT refusal case (`allowed: false` with no message) for
// dangling-edge, modeled directly on maxGraph's own three-valued contract:
// `getEdgeValidationError` can return `null` (allowed), `''` (invalid but
// silent — "the event is silently dropped"), or a message (invalid,
// explained) — fetched `ValidationMixin.ts:59-70`. Running maxGraph's OWN
// `validateGraph` against that contract shows the `''` case is not even a
// deliberate UX choice so much as an architectural trap: `validateGraph`
// does `getEdgeValidationError(...) || ''` when folding a child's result
// into its parent's (`ValidationMixin.ts:182-187`) — reproduced live: a
// dangling edge with `allowDanglingEdges=false` made `validateGraph()`
// return `null`, zero overlays, the SAME outcome as a perfectly valid
// graph. A silent refusal is invisible even to the library's own whole-
// graph audit. Zach, 2026-09-17, overriding this on purpose: "I actually
// don't like the idea of a silent message. by default I think everything
// should connect and everything after that should have a reason...
// Whether we choose to display that reason, allow it in an error state or
// not allow it at all, is a later decision that can be made." So: the
// silent case is now UNREPRESENTABLE (see `ConnectionVerdict` below), not
// merely unused. This is not a fight against maxGraph's grain — its own
// DEFAULTS already lean permissive (`allowDanglingEdges: true`,
// `multigraph: true`; only `allowLoops: false`, confirmed on a fresh
// `Graph`) — removing the one silent path it left is the whole change.
//
// A refusal is a JUDGEMENT, not an ENFORCEMENT: whether a caller blocks
// the gesture, allows it and marks the result an at-rest error, or hides
// the reason from the person dragging is a separate, higher-level decision
// this function has no opinion on (ruling 2's layering: severity + text
// are produced HERE, low; what to DO about them is decided by whoever
// calls this). The refusal being `Diagnostic`-shaped (`ConnectionMessage`)
// is exactly what lets a caller commit anyway and mint the at-rest mark —
// give it an `id` and it IS one.
//
// "Do not build the paint": nothing here is wired into any interaction —
// no drag handler, no drop target, no host. It is a pure function a future
// interaction layer can call; wiring it up is out of this lane's scope
// (CLAUDE.md's write-set boundary: `src/interaction/**` is untouched).

import type { Diagnostic } from "../components/highlighter";
import { LINT_RULES, type LintScene, type PortDirectionOf, type PortsOf, type PortTypeOf, type TypeCompatible } from "./lint";
import { duplicateEdges, findCycles, portKey, type SceneEdgeEnds } from "./scene";

/* ------------------------------------------------------------------ */
/* The verdict — the silent case made unrepresentable (ruling 1)       */
/* ------------------------------------------------------------------ */

/**
 * The refusal's own explanation, carried in the SAME field names
 * `Diagnostic` uses (minus `id` — this function never mints one; nothing
 * here is persisted, matching `diagnostics`' own never-persisted contract,
 * diagnostic.tsx:71-73). A caller that decides to commit the candidate
 * anyway has, in this one value, everything it needs to turn the refusal
 * into an at-rest `Diagnostic` — mint an id and it IS one.
 */
export type ConnectionMessage = Omit<Diagnostic, "id">;

/**
 * Which way the allowed cable actually points, and how that was decided.
 *
 * WHY: docs/peps/0002-the-judge-owns-edge-orientation.md. The short version:
 * a gesture names its ends in the order a person touched them, and that
 * order is not the dataflow direction. Deciding legality under a polarity
 * rule REQUIRES working out which end emits — so the judge already knows,
 * and the only question was whether it returns that or throws it away and
 * lets the caller guess. It guessed wrong twice, in two independent lanes.
 */
export interface ConnectionOrientation {
  /** Spread-ready: `{ id, ...verdict.oriented.ends }` IS the edge to commit. */
  readonly ends: SceneEdgeEnds;
  /** `"polarity"` — both ends resolved a direction and it decided.
   *  `"gesture"` — direction was unknown on at least one end, so the order
   *  the candidate was written in stands. Never silent about which. */
  readonly by: "polarity" | "gesture";
  /** Did orienting FLIP the candidate? The backwards-edge signal. */
  readonly reversed: boolean;
}

/**
 * Two outcomes, not three. `allowed: false` ALWAYS carries `refusal` — the
 * TypeScript discriminant makes the old silent case (`allowed: false`,
 * `refusal` absent) impossible to construct, not merely unused. See this
 * file's header for why that is a deliberate override of maxGraph's own
 * three-valued contract, not an oversight.
 *
 * `allowed: true` ALWAYS carries `oriented`, by the same discriminant
 * trick and for the same reason: there is no way to read "yes" out of this
 * function without also being handed the direction to commit it in, so a
 * caller cannot write a backwards edge by forgetting a step. That is why
 * there is no shared `ALLOWED` singleton any more — an allowed verdict is
 * per-candidate data now, not a constant.
 */
export type ConnectionVerdict =
  | { readonly allowed: true; readonly oriented: ConnectionOrientation }
  | { readonly allowed: false; readonly refusal: ConnectionMessage };

/**
 * Which rules gate. Every field is a PERMISSION the caller may withdraw or
 * grant, shaped after the donor's own `EdgePolicy`
 * (SystemSketch `src/settings/edgePolicy.ts`, reached from
 * `connectionRules.ts:102-147`, opened) and its `REFUSAL_PERMISSION` map:
 * one judge, one vocabulary, and a caller that wants different rules turns
 * them off rather than forking a second engine. Forking a second engine is
 * exactly what `batchWire.standIn.ts` was, and why it is now deleted.
 *
 * The DEFAULTS are today's shipped behaviour, unchanged, so no existing
 * caller moves: `allowDuplicates` and `allowCycles` stay TRUE because this
 * file's header already argues at length that neither may gate
 * (`wiring.ts:20-22`'s permission-free stance; a feedback loop is a
 * legitimate graph). `allowSamePolarity` is FALSE — the one behaviour
 * change — but it is inert unless the caller supplies `directionOf`, which
 * nothing did before 2026-09-18.
 */
export interface ConnectionPolicy {
  /** Two sources, or two sinks. Needs `directionOf`; donor `same-polarity`. */
  allowSamePolarity: boolean;
  /** An edge whose two ends are the same node. */
  allowSelfConnection: boolean;
  /** 2+ producers into one sink port. `lint.ts`'s `many-to-one`. */
  allowFanIn: boolean;
  /** A second edge over an already-wired port pair. */
  allowDuplicates: boolean;
  /** A cable that closes a dependency loop. */
  allowCycles: boolean;
  /** Ends whose nodes sit under different parents. */
  allowCrossScope: boolean;
}

/** Today's shipped behaviour, field by field. See `ConnectionPolicy`. */
export const DEFAULT_CONNECTION_POLICY: ConnectionPolicy = Object.freeze({
  allowSamePolarity: false,
  allowSelfConnection: false,
  allowFanIn: false,
  allowDuplicates: true,
  allowCycles: true,
  allowCrossScope: true,
});

/** Options a caller may supply to shape validation — the same context a
 *  `lint.ts` rule reads (`LintRuleContext`), because `validateConnection`
 *  is running those SAME rules early rather than a parallel copy of them. */
export interface ValidateConnectionOptions {
  portsOf?: PortsOf;
  typeOf?: PortTypeOf;
  compatible?: TypeCompatible;
  /** Port direction. Omitted, polarity contributes nothing and orientation
   *  falls back to the gesture — the kit-wide "undefined = unknown, no
   *  judgement" convention (`lint.ts`'s `PortsOf`). */
  directionOf?: PortDirectionOf;
  /** Which rules gate. Merged over `DEFAULT_CONNECTION_POLICY`. */
  policy?: Partial<ConnectionPolicy>;
}

function refuse(ruleId: keyof typeof LINT_RULES, message: string): ConnectionVerdict {
  return { allowed: false, refusal: { severity: LINT_RULES[ruleId].severity, message, code: ruleId } };
}

/**
 * The candidate's own order, as an orientation — "nobody knew better, so
 * the way it was written stands." The honest answer for any judge that
 * cannot see port direction (a type-only judge, a host's extra policy),
 * and the fallback `validateConnection` itself uses when `directionOf`
 * resolves nothing. `by: "gesture"` is what makes that visible rather than
 * letting an unknowing judge's guess pass for a decision.
 */
export function gestureOrientation(candidate: SceneEdgeEnds): ConnectionOrientation {
  return {
    ends: { source: candidate.source, sourceHandle: candidate.sourceHandle, target: candidate.target, targetHandle: candidate.targetHandle },
    by: "gesture",
    reversed: false,
  };
}

/** The one refusal code with no `lint.ts` rule behind it — see the
 *  `cross-scope` gate below for why it has no at-rest twin. Donor's own
 *  word (`ConnectionRefusal`, connectionRules.ts:41). */
export const CROSS_SCOPE: string = "no-shared-scope";

/** Do `a` and `b` sit in one strongly connected component? */
function mutuallyReachable(scene: LintScene, a: string, b: string): boolean {
  return findCycles(scene).some((component) => component.includes(a) && component.includes(b));
}

/* ------------------------------------------------------------------ */
/* validateConnection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Would committing `candidate` into `scene` be legal? Total: every branch
 * returns a verdict, none throws. Runs the gating rules in a fixed order —
 * dangling first (a malformed candidate is checked before anything else
 * bothers to reason about it), then self-connection, then many-to-one,
 * then type-mismatch LAST (it is the most expensive judgement to have an
 * opinion about, and the only one that does nothing at all unless a
 * `typeOf` vocabulary is supplied) — and returns on the first refusal, so
 * a caller with several problems still gets one clear verdict rather than
 * a list to triage.
 */
export function validateConnection(
  scene: LintScene,
  candidate: SceneEdgeEnds & { id: string },
  options: ValidateConnectionOptions = {},
): ConnectionVerdict {
  const policy: ConnectionPolicy = { ...DEFAULT_CONNECTION_POLICY, ...options.policy };
  const { directionOf } = options;

  // dangling-edge — EXPLAINED (ruling 1: every gate explains itself, this
  // one included; see the header for why that changed). Judged on the
  // candidate AS WRITTEN: whether a port exists cannot depend on which way
  // the cable ends up pointing.
  const danglingHits = LINT_RULES["dangling-edge"].run({ nodes: scene.nodes, edges: [candidate] }, { portsOf: options.portsOf });
  if (danglingHits.length > 0) return refuse("dangling-edge", danglingHits[0].message);

  // self-connection — EXPLAINED. Also orientation-independent.
  if (!policy.allowSelfConnection) {
    const selfHits = LINT_RULES["self-connection"].run({ nodes: scene.nodes, edges: [candidate] });
    if (selfHits.length > 0) return refuse("self-connection", selfHits[0].message);
  }

  // polarity — EXPLAINED, and the gate that did not exist before
  // 2026-09-18. Only the SAME-direction case refuses; a legal pair written
  // backwards is oriented below rather than refused, which is the donor's
  // own behaviour (`decideDirection`, connectionRules.ts:222-234).
  const from = candidate.sourceHandle == null ? undefined : directionOf?.({ nodeId: candidate.source, portId: candidate.sourceHandle });
  const to = candidate.targetHandle == null ? undefined : directionOf?.({ nodeId: candidate.target, portId: candidate.targetHandle });
  if (!policy.allowSamePolarity && from !== undefined && from === to) {
    const polarityHits = LINT_RULES.polarity.run({ nodes: scene.nodes, edges: [candidate] }, { directionOf });
    return refuse("polarity", polarityHits[0].message);
  }

  // ORIENT. Everything below asks about the cable that would actually be
  // committed, not the order it happened to be drawn in — which is the
  // whole point of the pep: `many-to-one` in particular was asking about
  // `candidate.targetHandle`, so a backwards drag checked fan-in on the
  // wrong end entirely.
  const reversed = from !== undefined && to !== undefined && from === "sink" && to === "source";
  const ends: SceneEdgeEnds = reversed
    ? { source: candidate.target, sourceHandle: candidate.targetHandle, target: candidate.source, targetHandle: candidate.sourceHandle }
    : { source: candidate.source, sourceHandle: candidate.sourceHandle, target: candidate.target, targetHandle: candidate.targetHandle };
  const oriented: ConnectionOrientation = {
    ends,
    by: from !== undefined && to !== undefined && from !== to ? "polarity" : "gesture",
    reversed,
  };
  const wire: SceneEdgeEnds & { id: string } = { id: candidate.id, ...ends };
  const hypothetical: LintScene = { nodes: scene.nodes, edges: [...scene.edges, wire] };

  // many-to-one — EXPLAINED. Checked against the HYPOTHETICAL scene (the
  // candidate provisionally added) so the check reads "would this port end
  // up with 2+ producers", not "does it already have them" — a first wire
  // into an empty port must never be refused.
  if (!policy.allowFanIn && wire.targetHandle != null) {
    const targetKey = portKey(wire.target, wire.targetHandle);
    const manyToOneHits = LINT_RULES["many-to-one"].run(hypothetical).filter((hit) => hit.subject.id === targetKey);
    if (manyToOneHits.length > 0) return refuse("many-to-one", manyToOneHits[0].message);
  }

  // duplicate-edge — OFF by default (this file's header argues why:
  // wiring.ts:20-22's permission-free stance). Reuses `duplicateEdges`,
  // the same scene.ts function the lint rule wraps.
  if (!policy.allowDuplicates) {
    const shares = duplicateEdges(hypothetical).some((group) => group.some((edge) => edge.id === wire.id));
    if (shares) return refuse("duplicate-edge", `Edge "${wire.id}" duplicates a wire already joining "${portKey(wire.source, wire.sourceHandle ?? "")}" and "${portKey(wire.target, wire.targetHandle ?? "")}"`);
  }

  // cycle — OFF by default (header: a feedback loop is a legitimate graph).
  // EXACT, not approximate: adding source->target creates mutual
  // reachability between those two nodes iff target could already reach
  // source, so "same SCC after, not before" is precisely "this cable closed
  // a loop". Reuses `findCycles` (Tarjan, scene.ts:288) verbatim.
  if (!policy.allowCycles && wire.source !== wire.target) {
    if (mutuallyReachable(hypothetical, wire.source, wire.target) && !mutuallyReachable(scene, wire.source, wire.target)) {
      return refuse("cycle", `Edge "${wire.id}" closes a dependency loop between "${wire.source}" and "${wire.target}"`);
    }
  }

  // cross-scope — OFF by default, and the ONE gate with no `lint.ts` twin.
  // WHY it is prevention-only: at rest, whether a cable between two
  // differently-parented nodes is an ERROR depends on a boundary-FACE
  // concept this kit does not have. The donor's `no-shared-scope` falls out
  // of `pairBlockFaces` (connectionRules.ts:164-169), which decides which
  // face each end shows; with no faces there is nothing to say at rest, so
  // this stays a permission a caller opts into rather than a finding the
  // linter mints. Stated here rather than left silent, because every other
  // gate in this function deliberately HAS an at-rest twin.
  if (!policy.allowCrossScope) {
    const parentOf = new Map(scene.nodes.map((node) => [node.id, node.parentId]));
    if (parentOf.get(wire.source) !== parentOf.get(wire.target)) {
      return { allowed: false, refusal: { severity: "error", message: `Edge "${wire.id}" joins "${wire.source}" and "${wire.target}", which sit in different scopes`, code: CROSS_SCOPE } };
    }
  }

  // type-mismatch — EXPLAINED, LAST, and on the ORIENTED ends: "carries X
  // into Y" is a directional sentence, so a backwards candidate would
  // otherwise report its types the wrong way round.
  const typeHits = LINT_RULES["type-mismatch"].run(
    { nodes: scene.nodes, edges: [wire] },
    { typeOf: options.typeOf, compatible: options.compatible },
  );
  if (typeHits.length > 0) return refuse("type-mismatch", typeHits[0].message);

  return { allowed: true, oriented };
}
