/**
 * src/magnet/magnetPortTypes.ts — the data-type gate a magnet proposal is
 * judged against (Zach's R4: "it has like a particular data type. so then it
 * would only connect to the port with the correct datatype").
 *
 * PORTED, near-verbatim, from SystemSketch:
 *   /home/bam/systemsketch/src/blocks/connections/connectionModel.ts
 *     :138-153  `arePortTypesCompatible`  (the three-mode comparison)
 *     :155      `PortTypeVerdict`         ('ok' | 'mismatch' | 'untyped')
 *     :158      `WILDCARD_PORT_TYPES`     ({'any','*','object'})
 *     :160-162  `isWildcardPortType`
 *     :164-166  `normalizePortType`       (trim + lowercase)
 * Read on disk 2026-09-17 (donor tree is READ-ONLY; nothing was written
 * there). The donor's own `TypeMatching` union is spelled
 * `PortTypeMatching` here only because this file has no `Edge*Policy`
 * namespace around it to disambiguate.
 *
 * WHY the comparison is case- and whitespace-insensitive rather than exact —
 * the donor's own stated reason, kept because it is a product decision and
 * not an implementation detail: "a port's type is text a person typed on a
 * whiteboard, and refusing `pose` to `Pose` would read as a bug, not as
 * rigour." Truthful rendering (every authored character stays on screen) is
 * a DISPLAY rule; it does not oblige the judge to be pedantic.
 *
 * WHY this lives here and not in `src/scene/lint.ts`: `validateConnection`
 * (scene/edgeValidation.ts:102) runs dangling → self-connection →
 * many-to-one and has NO type rule, and `src/scene/lint.ts` belongs to a
 * concurrent lane. `magnetTypeJudge` in ./magnetProposals.ts is exported so
 * that lane can absorb this verbatim if it wants an at-rest `type-mismatch`
 * rule too — see docs/MAGNET-WIRES-SPEC.md §8.5 for the owed merge.
 *
 * Pure: no React, no DOM, no canvas engine. `src/scene/scene.ts`'s rule,
 * applied to a sibling directory.
 */

/** Donor: `TypeMatching`, connectionModel.ts (the policy field the donor's
 *  `judgeConnection` reads). `off` is the donor's own default and stays the
 *  default here — see `arePortTypesCompatible`. */
export type PortTypeMatching = "off" | "lenient" | "strict";

/** Donor: `PortTypeVerdict`, connectionModel.ts:155. Three-valued on
 *  purpose: "I disagree with you" and "one of us never said" are different
 *  refusals, and the donor mints two different refusal codes for them
 *  (`type-mismatch` / `untyped-port`, connectionRules.ts:40-51). */
export type PortTypeVerdict = "ok" | "mismatch" | "untyped";

/** Donor: `WILDCARD_PORT_TYPES`, connectionModel.ts:158. Types that
 *  deliberately accept anything, so they never refuse a landing. */
export const WILDCARD_PORT_TYPES: ReadonlySet<string> = new Set(["any", "*", "object"]);

/** Donor: `normalizePortType`, connectionModel.ts:164-166. */
export function normalizePortType(type: string): string {
  return type.trim().toLowerCase();
}

function isWildcardPortType(normalized: string): boolean {
  return WILDCARD_PORT_TYPES.has(normalized);
}

/**
 * Donor: `arePortTypesCompatible`, connectionModel.ts:138-153 — branch for
 * branch, including the order of the checks.
 *
 * `off` is the default because the donor made it the default and said why:
 * ports carry free-text types, so there is no lattice to check against yet
 * and "a veto on a guess would refuse cables people mean." The check is OFF
 * rather than ABSENT so that the one place it lives is already written when
 * real types arrive.
 */
export function arePortTypesCompatible(sourceType: string, sinkType: string, mode: PortTypeMatching = "off"): PortTypeVerdict {
  if (mode === "off") return "ok";
  const source = normalizePortType(sourceType);
  const sink = normalizePortType(sinkType);
  if (source === "" || sink === "") {
    // Donor's comment, kept: "Lenient reads an undeclared type as 'not
    // saying', which is the only way a half-annotated board stays workable;
    // strict reads it as a gap to fill."
    return mode === "strict" ? "untyped" : "ok";
  }
  if (isWildcardPortType(source) || isWildcardPortType(sink)) return "ok";
  return source === sink ? "ok" : "mismatch";
}
