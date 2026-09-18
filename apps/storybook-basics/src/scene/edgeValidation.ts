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
// "Do not build the paint": nothing here is wired into any interaction —
// no drag handler, no drop target, no host. It is a pure function a future
// interaction layer can call; wiring it up is out of this lane's scope
// (CLAUDE.md's write-set boundary: `src/interaction/**` is untouched).

import type { Diagnostic } from "../components/diagnostic";
import { LINT_RULES, type LintScene, type PortsOf } from "./lint";
import { portKey, type SceneEdgeEnds } from "./scene";

/* ------------------------------------------------------------------ */
/* The verdict — maxGraph's three values and Vyuh's value object, combined */
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
 * `allowed: false` with `refusal` ABSENT is maxGraph's `''` — "invalid but
 * silent" (`getEdgeValidationError` returning empty string; "for empty
 * error messages, the event is silently dropped"). `allowed: false` with
 * `refusal` PRESENT is maxGraph's `"message"` case, and simultaneously
 * Vyuh's `deny(reason:, showMessage:)` value object actually consumed —
 * Vyuh shaped the verdict this way and then dropped `reason` on the floor
 * (verified in their source, per Appendix B); a caller of this function
 * cannot do that, because `refusal.message` is the only place the
 * explanation exists at all. `allowed: true` needs no refusal — there is
 * nothing to explain.
 */
export interface ConnectionVerdict {
  allowed: boolean;
  refusal?: ConnectionMessage;
}

const ALLOWED: ConnectionVerdict = { allowed: true };
/** Reused for every silent refusal — `refusal` absent is the whole
 *  signal, so one frozen instance is exactly as informative as a fresh
 *  object every time and avoids allocating one. */
const SILENTLY_REFUSED: ConnectionVerdict = { allowed: false };

/* ------------------------------------------------------------------ */
/* validateConnection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Would committing `candidate` into `scene` be legal? Total: every branch
 * returns a verdict, none throws. Runs the gating rules in a fixed order —
 * dangling first (a malformed candidate is checked before anything else
 * bothers to reason about it), then self-connection, then many-to-one —
 * and returns on the first refusal, so a caller with several problems
 * candidate still gets one clear verdict rather than a list to triage.
 */
export function validateConnection(scene: LintScene, candidate: SceneEdgeEnds & { id: string }, options: { portsOf?: PortsOf } = {}): ConnectionVerdict {
  // dangling-edge — SILENT. A drag surface should only ever offer a target
  // that actually exists; a candidate naming one that doesn't is malformed
  // input, not a product decision worth explaining to whoever is dragging
  // (maxGraph's own default stance for this class of rejection).
  const danglingHits = LINT_RULES["dangling-edge"].run({ nodes: scene.nodes, edges: [candidate] }, options.portsOf);
  if (danglingHits.length > 0) return SILENTLY_REFUSED;

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

  return ALLOWED;
}
