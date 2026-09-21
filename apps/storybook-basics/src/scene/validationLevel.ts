// src/scene/validationLevel.ts — how much of the linter and the connection
// judge apply, as ONE named choice. Pure, no React, no DOM, no engine, not
// even their types — the rule the whole scene kit follows.
//
// Zach, ruling 3: "have the connection validation setting in the settings panel
// so you can switch between what level of linting you want from whiteboard,
// where anything goes to like evalid code, etc."
//
// This file is the LEVELS and the logic; the settings panel only carries the
// control. That split is the ruling's own second sentence, and it is why this
// lives in `scene/` rather than beside the persisted record in `components/`:
// what a level MEANS is a fact about the scene vocabulary (which of
// `lint.ts`'s seven rules run, which of `edgeValidation.ts`'s six gates gate),
// and it has to be answerable by a Node test in milliseconds with no browser
// anywhere near it.
//
// WHAT WAS ALREADY THERE, and is deliberately not rebuilt: the four levels
// already existed as `EDGE_POLICY_PRESETS` in `../components/edgePolicy.ts`
// (ported from the archive's `src/settings/edgePolicy.ts`), the settings panel
// already renders them, and `systemsketch.edgePolicy.v1` already persists the
// nine switches underneath. What did NOT exist is any connection between that
// choice and the two engines: grepped 2026-09-21, neither `lint.ts` nor
// `edgeValidation.ts` was mentioned anywhere in `components/` or in
// `apps/systemsketch/src`. The level was a name with nothing behind it.
//
// The four ids are the archive's, unchanged, so the persisted record and this
// file cannot drift — and `./validationLevel.test.ts` pins that agreement
// field by field rather than trusting this sentence. It is a TEST that reaches
// across, never an import: `components/layering.test.ts`'s wall means
// `components/` may not import `scene/`, so the dependency can only ever run
// the other way, and here it runs neither way at runtime.

import {
  LINT_RULE_IDS,
  lintScene,
  type LintFinding,
  type LintOptions,
  type LintRuleId,
  type LintScene,
  type PortDirectionOf,
  type PortTypeOf,
  type PortsOf,
  type TypeCompatible,
} from "./lint";
import {
  validateConnection,
  type ConnectionPolicy,
  type ConnectionVerdict,
  type ValidateConnectionOptions,
} from "./edgeValidation";
import { portKey, type SceneEdgeEnds } from "./scene";

/* ------------------------------------------------------------------ */
/* The scale                                                           */
/* ------------------------------------------------------------------ */

/**
 * The scale, by Zach's own two endpoints: "from whiteboard, where anything
 * goes to like evalid code".
 *
 * - `whiteboard` — a line between two things means whatever you meant.
 * - `guided`     — direction and containment are real; types stay free text.
 * - `typed`      — guided, plus declared types must agree, one producer per input.
 * - `strict`     — only edges that could exist in the running program.
 */
export type ValidationLevel = "whiteboard" | "guided" | "typed" | "strict";

/**
 * Loosest first — and the order is LOAD-BEARING, not display sugar: it is the
 * order `./validationLevel.test.ts` walks to prove each level is a superset of
 * the one before it. A UI that prints a scale prints this array; a UI that
 * prints it backwards is showing a different scale from the one tested.
 */
export const VALIDATION_LEVELS: readonly ValidationLevel[] = ["whiteboard", "guided", "typed", "strict"];

/** How hard the two ends' declared types must agree at a given level. */
export type TypeStrictness = "off" | "lenient" | "strict";

export interface ValidationLevelSpec {
  id: ValidationLevel;
  /** The control's own row label. */
  label: string;
  /** One sentence, what this level refuses that the looser one did not. */
  summary: string;
  /** Which of `lint.ts`'s rules report AT REST. */
  rules: readonly LintRuleId[];
  /** Which of `edgeValidation.ts`'s gates refuse BEFORE COMMIT. */
  policy: ConnectionPolicy;
  /** `off` — `type-mismatch` contributes nothing. `lenient` — an undeclared
   *  type is a wildcard. `strict` — an undeclared type is itself the error. */
  types: TypeStrictness;
}

/**
 * `dangling-edge` runs at EVERY level, `whiteboard` included.
 *
 * WHY the one exception to "anything goes": every other rule reports a
 * disputed MEANING — whether a cycle, a duplicate or a backwards cable is
 * wrong is a product taste, and at `whiteboard` the product's taste is that it
 * is not. A dangling edge is not a meaning; it is an edge naming a node or a
 * port the scene does not contain, which paints nothing and round-trips as a
 * broken record. No level makes that fine. `edgeValidation.ts` already takes
 * the same position at the other end — its dangling gate is the one gate with
 * no permission in `ConnectionPolicy` to switch off.
 */
const ALWAYS: readonly LintRuleId[] = ["dangling-edge"];

/** Everything permitted: the judge stood fully down. */
const PERMIT_EVERYTHING: ConnectionPolicy = {
  allowSamePolarity: true,
  allowSelfConnection: true,
  allowFanIn: true,
  allowDuplicates: true,
  allowCycles: true,
  allowCrossScope: true,
};

/** The rules the archive shipped with: direction and containment are real. */
const GUIDED_POLICY: ConnectionPolicy = {
  allowSamePolarity: false,
  allowSelfConnection: true,
  allowFanIn: true,
  allowDuplicates: false,
  allowCycles: false,
  allowCrossScope: false,
};

const TYPED_POLICY: ConnectionPolicy = { ...GUIDED_POLICY, allowFanIn: false };

const STRICT_POLICY: ConnectionPolicy = { ...TYPED_POLICY, allowSelfConnection: false };

/**
 * The four levels, whole. Frozen at both levels so a consumer cannot quietly
 * mutate the shared spec the way `LINT_RULES` is frozen for the same reason.
 *
 * Each level's rule list is the LOOSER level's plus what that rung adds — the
 * relationship is stated in the code, not just asserted in the test, so a rung
 * cannot be edited into non-monotonicity by accident.
 */
const WHITEBOARD: ValidationLevelSpec = {
  id: "whiteboard",
  label: "Whiteboard",
  summary: "Anything goes. A line between two things means whatever you meant.",
  rules: ALWAYS,
  policy: PERMIT_EVERYTHING,
  types: "off",
};

const GUIDED: ValidationLevelSpec = {
  id: "guided",
  label: "Guided",
  summary: "Direction, containment, loops and duplicates are real. Data types stay free text.",
  rules: [...WHITEBOARD.rules, "polarity", "cycle", "duplicate-edge"],
  policy: GUIDED_POLICY,
  types: "off",
};

const TYPED: ValidationLevelSpec = {
  id: "typed",
  label: "Typed",
  summary: "Guided, plus declared types must agree and each input takes one producer.",
  rules: [...GUIDED.rules, "many-to-one", "type-mismatch"],
  policy: TYPED_POLICY,
  types: "lenient",
};

const STRICT: ValidationLevelSpec = {
  id: "strict",
  label: "Strict",
  summary: "Only edges that could exist in the running program. Both ends must declare a matching type.",
  rules: [...TYPED.rules, "self-connection"],
  policy: STRICT_POLICY,
  types: "strict",
};

export const VALIDATION_LEVEL_SPECS: Readonly<Record<ValidationLevel, ValidationLevelSpec>> = Object.freeze({
  whiteboard: Object.freeze({ ...WHITEBOARD, rules: Object.freeze(WHITEBOARD.rules), policy: Object.freeze(WHITEBOARD.policy) }),
  guided: Object.freeze({ ...GUIDED, rules: Object.freeze(GUIDED.rules), policy: Object.freeze(GUIDED.policy) }),
  typed: Object.freeze({ ...TYPED, rules: Object.freeze(TYPED.rules), policy: Object.freeze(TYPED.policy) }),
  strict: Object.freeze({ ...STRICT, rules: Object.freeze(STRICT.rules), policy: Object.freeze(STRICT.policy) }),
});

/**
 * The shipped default.
 *
 * WHY `guided` and not `whiteboard`: it is what the archive already defaulted
 * to (`DEFAULT_EDGE_POLICY = GUIDED`, `components/edgePolicy.ts`), so a browser
 * that has never opened Settings keeps the behaviour it already had. Picking
 * the looser end here would have silently relaxed every existing board.
 */
export const DEFAULT_VALIDATION_LEVEL: ValidationLevel = "guided";

/** A stored or user-supplied string, narrowed. Total; never throws. */
export function isValidationLevel(value: unknown): value is ValidationLevel {
  return typeof value === "string" && (VALIDATION_LEVELS as readonly string[]).includes(value);
}

/** The spec for `level`, falling back to the default rather than throwing —
 *  the same malformed-input policy `lintScene` uses for an unknown rule id. */
export function validationLevelSpec(level: ValidationLevel): ValidationLevelSpec {
  return VALIDATION_LEVEL_SPECS[level] ?? VALIDATION_LEVEL_SPECS[DEFAULT_VALIDATION_LEVEL];
}

/** Which `lint.ts` rules report at rest at this level. */
export function lintRulesForLevel(level: ValidationLevel): readonly LintRuleId[] {
  return validationLevelSpec(level).rules;
}

/** Which `edgeValidation.ts` gates refuse before commit at this level. */
export function connectionPolicyForLevel(level: ValidationLevel): ConnectionPolicy {
  return validationLevelSpec(level).policy;
}

/** How hard types must agree at this level. */
export function typeStrictnessForLevel(level: ValidationLevel): TypeStrictness {
  return validationLevelSpec(level).types;
}

/** How many of the linter's rules this level actually runs, for an
 *  "N of 7" readout. `LINT_RULE_IDS.length` is the denominator; never 7
 *  typed out, so adding an eighth rule moves both numbers at once. */
export function enabledRuleCount(level: ValidationLevel): number {
  return lintRulesForLevel(level).length;
}

/** The denominator of that readout. */
export const LINT_RULE_TOTAL: number = LINT_RULE_IDS.length;

/* ------------------------------------------------------------------ */
/* Running the engines at a level                                      */
/* ------------------------------------------------------------------ */

/**
 * The caller-supplied vocabulary — identical to `LintOptions` minus `rules`,
 * because WHICH rules run is exactly what the level decides and a caller that
 * could also pass `rules` would have two answers to one question.
 */
export interface ValidationVocabulary {
  portsOf?: PortsOf;
  typeOf?: PortTypeOf;
  compatible?: TypeCompatible;
  directionOf?: PortDirectionOf;
}

/**
 * The prefix a port with no declared type is given under `strict`.
 *
 * WHY a per-port synthetic tag rather than an empty list or a shared
 * placeholder: `strict` means "both ends must declare a type AT ALL"
 * (`components/edgePolicy.ts`'s own wording), and `lint.ts`'s `type-mismatch`
 * deliberately declines to judge when either end is `undefined` — its
 * "undefined = unknown, no judgement" convention, which is the RIGHT reading
 * at `typed` and the wrong one at `strict`. Substituting a tag that is unique
 * to the port makes the rule refuse two untyped ends as well as one, which a
 * shared placeholder would not (it would intersect with itself), while keeping
 * the resulting message readable: `carries "(untyped) a/out" into "number"`.
 */
export const UNDECLARED_TYPE_PREFIX = "(untyped) ";

function strictTypeOf(typeOf: PortTypeOf | undefined): PortTypeOf {
  return (ref) => typeOf?.(ref) ?? [UNDECLARED_TYPE_PREFIX + portKey(ref.nodeId, ref.portId)];
}

/**
 * The vocabulary as the level wants it read. `off` withholds `typeOf`
 * entirely, so `type-mismatch` contributes nothing even if some future level
 * listed it; `strict` substitutes the wrapper above; `lenient` passes the
 * caller's resolver straight through.
 */
function vocabularyForLevel(level: ValidationLevel, vocabulary: ValidationVocabulary): ValidationVocabulary {
  const strictness = typeStrictnessForLevel(level);
  if (strictness === "off") return { ...vocabulary, typeOf: undefined };
  if (strictness === "strict") return { ...vocabulary, typeOf: strictTypeOf(vocabulary.typeOf) };
  return vocabulary;
}

/** `lintScene`, with the level choosing the rules and the type strictness. */
export function lintSceneAtLevel(
  scene: LintScene,
  level: ValidationLevel,
  vocabulary: ValidationVocabulary = {},
): LintFinding[] {
  const options: LintOptions = { ...vocabularyForLevel(level, vocabulary), rules: lintRulesForLevel(level) };
  return lintScene(scene, options);
}

/** `validateConnection`, with the level choosing the gates and the type
 *  strictness. The verdict shape is unchanged — a level never adds a third
 *  outcome, it only decides how many questions get asked. */
export function validateConnectionAtLevel(
  scene: LintScene,
  candidate: SceneEdgeEnds & { id: string },
  level: ValidationLevel,
  vocabulary: ValidationVocabulary = {},
): ConnectionVerdict {
  const options: ValidateConnectionOptions = {
    ...vocabularyForLevel(level, vocabulary),
    policy: connectionPolicyForLevel(level),
  };
  return validateConnection(scene, candidate, options);
}
