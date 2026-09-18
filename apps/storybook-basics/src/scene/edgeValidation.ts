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
import { LINT_RULES, type LintScene, type PortsOf, type PortTypeOf, type TypeCompatible } from "./lint";
import { portKey, type SceneEdgeEnds } from "./scene";

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
 * Two outcomes, not three. `allowed: false` ALWAYS carries `refusal` — the
 * TypeScript discriminant makes the old silent case (`allowed: false`,
 * `refusal` absent) impossible to construct, not merely unused. See this
 * file's header for why that is a deliberate override of maxGraph's own
 * three-valued contract, not an oversight.
 */
export type ConnectionVerdict = { readonly allowed: true } | { readonly allowed: false; readonly refusal: ConnectionMessage };

const ALLOWED: ConnectionVerdict = { allowed: true };

/** Options a caller may supply to shape validation — the same context a
 *  `lint.ts` rule reads (`LintRuleContext`), because `validateConnection`
 *  is running those SAME rules early rather than a parallel copy of them. */
export interface ValidateConnectionOptions {
  portsOf?: PortsOf;
  typeOf?: PortTypeOf;
  compatible?: TypeCompatible;
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
  // dangling-edge — EXPLAINED (ruling 1: every gate explains itself, this
  // one included — the previous version of this file returned the silent
  // case here specifically; see the header for why that changed). The
  // rule's own message is already precise ("...names node \"ghost\",
  // which is not in the scene"); reuse the first hit's message/severity
  // exactly like self-connection and many-to-one already do below.
  const danglingHits = LINT_RULES["dangling-edge"].run({ nodes: scene.nodes, edges: [candidate] }, { portsOf: options.portsOf });
  if (danglingHits.length > 0) {
    return { allowed: false, refusal: { severity: LINT_RULES["dangling-edge"].severity, message: danglingHits[0].message, code: "dangling-edge" } };
  }

  // self-connection — EXPLAINED.
  const selfHits = LINT_RULES["self-connection"].run({ nodes: scene.nodes, edges: [candidate] });
  if (selfHits.length > 0) {
    return { allowed: false, refusal: { severity: LINT_RULES["self-connection"].severity, message: selfHits[0].message, code: "self-connection" } };
  }

  // many-to-one — EXPLAINED. Checked against the HYPOTHETICAL scene (the
  // candidate provisionally added) so the check reads "would this port end
  // up with 2+ producers", not "does it already have them" — a first wire
  // into an empty port must never be refused.
  if (candidate.targetHandle != null) {
    const hypothetical: LintScene = { nodes: scene.nodes, edges: [...scene.edges, candidate] };
    const targetKey = portKey(candidate.target, candidate.targetHandle);
    const manyToOneHits = LINT_RULES["many-to-one"].run(hypothetical).filter((hit) => hit.subject.id === targetKey);
    if (manyToOneHits.length > 0) {
      return { allowed: false, refusal: { severity: LINT_RULES["many-to-one"].severity, message: manyToOneHits[0].message, code: "many-to-one" } };
    }
  }

  // type-mismatch — EXPLAINED, LAST. Only fires when `options.typeOf`
  // resolves a vocabulary for BOTH ends (see lint.ts's own rule) — with no
  // resolver supplied this contributes nothing, so every existing caller
  // of this function is unaffected.
  const typeHits = LINT_RULES["type-mismatch"].run(
    { nodes: scene.nodes, edges: [candidate] },
    { typeOf: options.typeOf, compatible: options.compatible },
  );
  if (typeHits.length > 0) {
    return { allowed: false, refusal: { severity: LINT_RULES["type-mismatch"].severity, message: typeHits[0].message, code: "type-mismatch" } };
  }

  return ALLOWED;
}
