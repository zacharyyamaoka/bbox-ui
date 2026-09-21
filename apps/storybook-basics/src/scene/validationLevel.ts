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
 *
 * These four are the NAMED rungs — the ones a person presses a button for and
 * the ones a stored record can spell. `ValidationLevel` below is wider than
 * this: it also admits a rung the caller builds.
 */
export type ValidationLevelId = "whiteboard" | "guided" | "typed" | "strict";

/**
 * The FIFTH rung, and the reason this type is a union rather than four strings.
 *
 * Ruling 3 shipped the four named rungs wired all the way to the board, and
 * said out loud what it had not closed: the settings panel's NINE individual
 * permission switches sit underneath the four buttons, and a combination that
 * matches no button had nowhere to go. Its host snapped it to the nearest
 * name, which in practice meant the shipped default — so flipping one switch
 * off `strict` quietly moved the whole board to `guided`, looser on six
 * questions than the person had just asked for. The settings row said
 * "Custom"; the board did not.
 *
 * So a level is now either a NAME (one of four, which is what a button presses
 * and what a record stores) or a SPEC the caller built (which is what nine
 * switches add up to). Everything downstream — `lintRulesForLevel`,
 * `connectionPolicyForLevel`, `typeStrictnessForLevel`, and therefore
 * `lintSceneAtLevel` and `validateConnectionAtLevel` — reads it through
 * `validationLevelSpec`, so the fifth rung needed no second code path.
 *
 * WHY the caller supplies the spec rather than this file growing a
 * `levelFromNineSwitches()`: the nine switches are `components/edgePolicy.ts`'s
 * vocabulary and this file is in `scene/`, which may not import a component.
 * More importantly they are ONE host's persisted record — a second host with a
 * different control surface should not have to speak it. The kit owns what a
 * rung MEANS; a host owns what its own controls add up to.
 */
export const CUSTOM_LEVEL_ID = "custom";

/** A rung the caller built: a full spec, carrying its own `id: "custom"` so a
 *  readout can tell it apart from the four without a second field. */
export interface CustomValidationLevel extends ValidationLevelSpec {
  readonly id: typeof CUSTOM_LEVEL_ID;
  readonly rules: readonly LintRuleId[];
  readonly policy: ConnectionPolicy;
}

/**
 * One of the four named rungs, or a rung the caller built. Every function in
 * this file takes this type; none of them asks which kind it got, because
 * `validationLevelSpec` is the one place that has to know.
 */
export type ValidationLevel = ValidationLevelId | CustomValidationLevel;

/**
 * Loosest first — and the order is LOAD-BEARING, not display sugar: it is the
 * order `./validationLevel.test.ts` walks to prove each level is a superset of
 * the one before it. A UI that prints a scale prints this array; a UI that
 * prints it backwards is showing a different scale from the one tested.
 */
export const VALIDATION_LEVELS: readonly ValidationLevelId[] = ["whiteboard", "guided", "typed", "strict"];

/** How hard the two ends' declared types must agree at a given level. */
export type TypeStrictness = "off" | "lenient" | "strict";

export interface ValidationLevelSpec {
  /** A named rung's own id, or `"custom"` for a rung the caller built. */
  id: ValidationLevelId | typeof CUSTOM_LEVEL_ID;
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

export const VALIDATION_LEVEL_SPECS: Readonly<Record<ValidationLevelId, ValidationLevelSpec>> = Object.freeze({
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
export const DEFAULT_VALIDATION_LEVEL: ValidationLevelId = "guided";

/** A stored or user-supplied string, narrowed to one of the four NAMED rungs.
 *  Total; never throws. A custom rung is not a string and never passes here —
 *  that is the point: this is what a persisted id is checked with. */
export function isValidationLevel(value: unknown): value is ValidationLevelId {
  return typeof value === "string" && (VALIDATION_LEVELS as readonly string[]).includes(value);
}

/** Is this the caller-supplied fifth rung? */
export function isCustomValidationLevel(level: ValidationLevel): level is CustomValidationLevel {
  return typeof level !== "string";
}

/** What to CALL this level — one of the four ids, or `"custom"`. For a readout
 *  or a `data-` attribute; never for a stored record, which spells only the
 *  four (a custom rung is stored as the switches it is made of). */
export function validationLevelId(level: ValidationLevel): ValidationLevelId | typeof CUSTOM_LEVEL_ID {
  return isCustomValidationLevel(level) ? CUSTOM_LEVEL_ID : level;
}

/** The spec for `level`, falling back to the default rather than throwing —
 *  the same malformed-input policy `lintScene` uses for an unknown rule id. A
 *  custom rung IS its own spec, so it is handed straight back. */
export function validationLevelSpec(level: ValidationLevel): ValidationLevelSpec {
  if (isCustomValidationLevel(level)) return level;
  return VALIDATION_LEVEL_SPECS[level] ?? VALIDATION_LEVEL_SPECS[DEFAULT_VALIDATION_LEVEL];
}

/**
 * Build the fifth rung.
 *
 * NORMALISES two things rather than trusting the caller, because a rung is
 * read by two engines and a caller assembling one from checkboxes has no
 * reason to know either convention:
 *
 *  - `dangling-edge` is forced in. It runs at EVERY named rung including
 *    `whiteboard` (see `ALWAYS` above for why an edge naming a node the scene
 *    does not contain is not a matter of taste), so a custom rung that could
 *    switch it off would be looser than the loosest button.
 *  - the rules are put in `LINT_RULE_IDS` order and de-duplicated, so two
 *    custom rungs built from the same switches in different orders are the
 *    same rung, and a board's findings come out in the registry's order the
 *    way every named rung's do.
 *
 * Frozen, at both levels, for the reason `VALIDATION_LEVEL_SPECS` is: a spec
 * is shared with whoever it is handed to, and a consumer editing one in place
 * would move the board under every other reader.
 */
export function customValidationLevel(input: {
  /** Which of `lint.ts`'s rules report at rest. `dangling-edge` is added if absent. */
  rules: Iterable<LintRuleId>;
  /** Which of `edgeValidation.ts`'s gates refuse before commit. */
  policy: ConnectionPolicy;
  /** How hard declared types must agree. */
  types: TypeStrictness;
  /** The control's own row label. Defaults to "Custom". */
  label?: string;
  /** One sentence for a readout. Defaults to a sentence about the counts. */
  summary?: string;
}): CustomValidationLevel {
  const asked = new Set<LintRuleId>(input.rules);
  for (const rule of ALWAYS) asked.add(rule);
  const rules = Object.freeze(LINT_RULE_IDS.filter((rule) => asked.has(rule)));
  const policy = Object.freeze({ ...input.policy });
  return Object.freeze({
    id: CUSTOM_LEVEL_ID,
    label: input.label ?? "Custom",
    summary:
      input.summary ??
      `A custom combination: ${rules.length} of ${LINT_RULE_IDS.length} checks mark up a board at rest, and the connection gates follow the same switches.`,
    rules,
    policy,
    types: input.types,
  });
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
