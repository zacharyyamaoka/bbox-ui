// src/chrome/ShareMenu/validationLevelHost.test.ts — the gap ruling 3 shipped
// with, closed and pinned.
//
// WHAT WAS BROKEN, measured before this file existed: `validationLevelOf`
// asked `matchingEdgePolicyPreset` which of the FOUR rungs the nine stored
// switches are, and when the answer was "none of them" it handed back
// `DEFAULT_VALIDATION_LEVEL`. So the four preset buttons governed the board
// and the nine individual switches did not: flip one switch off `strict` and
// the settings row honestly said "Custom" while every cable on the board was
// being judged at `guided` — looser on SIX of the nine questions than the
// person had asked for, and stricter on none.
//
// Ruling 3's own code said so out loud ("KNOWN GAP, stated rather than
// hidden") and named the fix: a fifth, caller-supplied rung. This file is that
// fix's acceptance at the model level; `src/validationLevel.smoke.test.tsx`'s
// "one switch" case is the same claim proved against the real board through
// the real Settings dialog.
//
// EVERY CASE ASSERTS A CONNECTION OUTCOME, never a level string. A level whose
// NAME changed and whose VERDICTS did not is exactly the failure being closed.
import { describe, expect, it } from "vitest";

import { edgePolicyPreset, type EdgePolicy, type EdgePolicyPresetId } from "@trunk/components/edgePolicy";
import type { LintScene } from "@trunk/scene/lint";
import {
  isCustomValidationLevel,
  lintSceneAtLevel,
  validateConnectionAtLevel,
  type ValidationLevel,
  type ValidationVocabulary,
} from "@trunk/scene/validationLevel";

import { customValidationLevelFor, validationLevelOf } from "./validationLevelHost";

const PRESET_IDS: readonly EdgePolicyPresetId[] = ["whiteboard", "guided", "typed", "strict"];

/** `a --out→in--> b`, plus a third node that is wired to nothing. Every
 *  candidate below is judged against exactly this board. */
const BOARD: LintScene = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: [{ id: "a-b", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }],
};

/** Both ends declare the same type and a direction, so NOTHING below is
 *  refused for a reason the case did not ask about — `strict` substitutes a
 *  per-port synthetic tag for an undeclared type, which would otherwise refuse
 *  every candidate on `type-mismatch` before any other gate could speak. */
const VOCABULARY: ValidationVocabulary = {
  typeOf: () => ["number"],
  directionOf: ({ portId }) => (portId === "out" ? "source" : "sink"),
};

function verdictFor(level: ValidationLevel, candidate: { source: string; sourceHandle: string; target: string; targetHandle: string }) {
  return validateConnectionAtLevel(BOARD, { id: "candidate", ...candidate }, level, VOCABULARY);
}

/** The refusal's rule code, or `null` when the cable was allowed — one value
 *  that says both WHETHER and WHY, so a case cannot pass because something
 *  else refused. */
function refusalCode(level: ValidationLevel, candidate: { source: string; sourceHandle: string; target: string; targetHandle: string }): string | null {
  const verdict = verdictFor(level, candidate);
  return verdict.allowed ? null : (verdict.refusal.code ?? "refused");
}

/** The candidate that CLOSES a loop: b already receives from a, so b → a is
 *  the cable `allowCycles` is about, and nothing else. */
const CLOSES_A_LOOP = { source: "b", sourceHandle: "out", target: "a", targetHandle: "in" };
/** A block wired to itself — `allowSelfConnection`. */
const ONTO_ITSELF = { source: "c", sourceHandle: "out", target: "c", targetHandle: "in" };
/** A SECOND producer into `b.in`, which already has one — `allowFanIn`. */
const SECOND_PRODUCER = { source: "c", sourceHandle: "out", target: "b", targetHandle: "in" };
/** A second copy of the cable already on the board — `allowDuplicates`. */
const THE_SAME_CABLE_TWICE = { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" };
/** Two emitters — `allowSamePolarity`. */
const OUT_TO_OUT = { source: "a", sourceHandle: "out", target: "c", targetHandle: "out" };

const STRICT_POLICY: EdgePolicy = edgePolicyPreset("strict").policy;
/** Strict, with EXACTLY ONE switch flipped. This is the acceptance's subject. */
const STRICT_BUT_LOOPS: EdgePolicy = { ...STRICT_POLICY, allowCycles: true };

describe("the four presets are untouched — they are verified and a person relies on them", () => {
  it("each preset's stored switches still resolve to that preset's own rung, by name", () => {
    for (const id of PRESET_IDS) {
      expect(validationLevelOf(edgePolicyPreset(id).policy), id).toBe(id);
    }
  });

  it("no preset produces the custom rung", () => {
    for (const id of PRESET_IDS) {
      expect(isCustomValidationLevel(validationLevelOf(edgePolicyPreset(id).policy)), id).toBe(false);
    }
  });

  it("the custom rung read off a PRESET's switches judges every candidate identically to the preset", () => {
    // The generalization check: the fifth rung is not a fifth OPINION, it is
    // the same reading applied to switches no preset happens to name. If these
    // two ever disagreed, the custom rung would be a second source of truth.
    for (const id of PRESET_IDS) {
      const asPreset: ValidationLevel = id;
      const asCustom: ValidationLevel = customValidationLevelFor(edgePolicyPreset(id).policy);
      for (const candidate of [CLOSES_A_LOOP, ONTO_ITSELF, SECOND_PRODUCER, THE_SAME_CABLE_TWICE, OUT_TO_OUT]) {
        expect(refusalCode(asCustom, candidate), `${id} / ${JSON.stringify(candidate)}`).toBe(refusalCode(asPreset, candidate));
      }
      expect(lintSceneAtLevel(BOARD, asCustom, VOCABULARY).map((finding) => finding.id).sort(), `${id} at rest`).toEqual(
        lintSceneAtLevel(BOARD, asPreset, VOCABULARY).map((finding) => finding.id).sort(),
      );
    }
  });
});

describe("strict, with exactly ONE switch flipped — the board changes in that one way and no other", () => {
  const level = validationLevelOf(STRICT_BUT_LOOPS);

  it("is the custom rung, not a preset snapped to the nearest name", () => {
    expect(isCustomValidationLevel(level)).toBe(true);
  });

  it("the ONE flipped switch changes its own verdict: strict refuses the loop, this permits it", () => {
    expect(refusalCode("strict", CLOSES_A_LOOP), "strict must refuse a cable that closes a loop").toBe("cycle");
    expect(refusalCode(level, CLOSES_A_LOOP), "allowCycles is ON, so the loop must land").toBe(null);
  });

  it("the other eight still behave exactly as strict does", () => {
    for (const candidate of [ONTO_ITSELF, SECOND_PRODUCER, THE_SAME_CABLE_TWICE, OUT_TO_OUT]) {
      expect(refusalCode(level, candidate), JSON.stringify(candidate)).toBe(refusalCode("strict", candidate));
    }
    // Named individually as well, so a regression says WHICH permission moved
    // rather than only that something did.
    expect(refusalCode(level, ONTO_ITSELF), "allowSelfConnection is still off").toBe("self-connection");
    expect(refusalCode(level, SECOND_PRODUCER), "allowFanIn is still off").toBe("many-to-one");
    expect(refusalCode(level, THE_SAME_CABLE_TWICE), "allowDuplicates is still off").toBe("duplicate-edge");
    expect(refusalCode(level, OUT_TO_OUT), "allowSamePolarity is still off").toBe("polarity");
  });

  it("type matching is still STRICT, not the default's `off` — the regression that proves the snap is gone", () => {
    // Under `guided` (the level the old code silently fell back to) an
    // undeclared type is not judged at all. Under strict it is the error
    // itself. One untyped end, therefore, is the cheapest possible probe of
    // WHICH level is really running.
    const untyped: ValidationVocabulary = { ...VOCABULARY, typeOf: ({ nodeId }) => (nodeId === "c" ? undefined : ["number"]) };
    // `c.out → a.in` on purpose: `a.in` has no producer yet, so fan-in cannot
    // answer first and the verdict can only be about the undeclared type.
    const verdict = validateConnectionAtLevel(BOARD, { id: "candidate", source: "c", sourceHandle: "out", target: "a", targetHandle: "in" }, level, untyped);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed ? null : verdict.refusal.code, "an undeclared end is the error itself at strict").toBe("type-mismatch");
  });

  it("at rest, the linter runs strict's rules — every one of the seven", () => {
    const messy: LintScene = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { id: "self", source: "a", sourceHandle: "out", target: "a", targetHandle: "in" },
        { id: "dup1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
        { id: "dup2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      ],
    };
    const rules = new Set(lintSceneAtLevel(messy, level, VOCABULARY).map((finding) => finding.ruleId));
    expect(rules, "self-connection is a STRICT rule; `guided` does not run it").toContain("self-connection");
    expect(rules).toContain("duplicate-edge");
  });
});
