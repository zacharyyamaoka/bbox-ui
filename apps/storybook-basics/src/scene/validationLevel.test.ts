// src/scene/validationLevel.test.ts — the scale, proved to BE a scale, and
// proved to agree with the record the settings panel actually persists.
import { describe, expect, it } from "vitest";

// Reaching into `components/` from a TEST is allowed and is the point: the
// import wall (`components/layering.test.ts`) forbids `components/` source from
// importing `scene/`, never the reverse, and never a test. This is the only
// thing that stops the persisted nine switches and this file's four levels
// drifting apart, since neither may import the other at runtime.
import { EDGE_POLICY_PRESETS, edgePolicyPreset, type EdgePolicyPresetId } from "../components/edgePolicy";

import { LINT_RULE_IDS, type LintScene } from "./lint";
import type { ConnectionPolicy } from "./edgeValidation";
import {
  DEFAULT_VALIDATION_LEVEL,
  LINT_RULE_TOTAL,
  UNDECLARED_TYPE_PREFIX,
  VALIDATION_LEVELS,
  VALIDATION_LEVEL_SPECS,
  connectionPolicyForLevel,
  enabledRuleCount,
  isValidationLevel,
  lintRulesForLevel,
  lintSceneAtLevel,
  typeStrictnessForLevel,
  validateConnectionAtLevel,
  type ValidationLevel,
} from "./validationLevel";

const PERMISSIONS = [
  "allowSamePolarity",
  "allowSelfConnection",
  "allowFanIn",
  "allowDuplicates",
  "allowCycles",
  "allowCrossScope",
] as const satisfies readonly (keyof ConnectionPolicy)[];

describe("the scale is a scale — each rung is the one below it plus more", () => {
  it("runs loosest to strictest, whiteboard first and strict last", () => {
    expect([...VALIDATION_LEVELS]).toEqual(["whiteboard", "guided", "typed", "strict"]);
  });

  it("every level's lint rules are a SUPERSET of the looser level's", () => {
    for (let i = 1; i < VALIDATION_LEVELS.length; i += 1) {
      const looser = new Set(lintRulesForLevel(VALIDATION_LEVELS[i - 1]));
      for (const rule of looser) {
        expect(lintRulesForLevel(VALIDATION_LEVELS[i]), `${VALIDATION_LEVELS[i]} drops ${rule}`).toContain(rule);
      }
    }
  });

  it("every level's connection policy permits NOTHING the looser level refused", () => {
    for (let i = 1; i < VALIDATION_LEVELS.length; i += 1) {
      const looser = connectionPolicyForLevel(VALIDATION_LEVELS[i - 1]);
      const tighter = connectionPolicyForLevel(VALIDATION_LEVELS[i]);
      for (const permission of PERMISSIONS) {
        if (!looser[permission]) {
          expect(tighter[permission], `${VALIDATION_LEVELS[i]} re-permits ${permission}`).toBe(false);
        }
      }
    }
  });

  it("the rule COUNT strictly increases — no rung is a relabel of its neighbour", () => {
    const counts = VALIDATION_LEVELS.map(enabledRuleCount);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    expect(counts[counts.length - 1]).toBe(LINT_RULE_TOTAL);
    expect(LINT_RULE_TOTAL).toBe(LINT_RULE_IDS.length);
  });

  it("whiteboard means anything goes — every gate stood down, and the ONE rule that survives is the broken-record one", () => {
    expect(connectionPolicyForLevel("whiteboard")).toEqual(
      Object.fromEntries(PERMISSIONS.map((p) => [p, true])),
    );
    expect([...lintRulesForLevel("whiteboard")]).toEqual(["dangling-edge"]);
  });

  it("the default is the level the persisted record already defaulted to, so nothing silently relaxes", () => {
    expect(DEFAULT_VALIDATION_LEVEL).toBe("guided");
    expect(isValidationLevel(DEFAULT_VALIDATION_LEVEL)).toBe(true);
    expect(isValidationLevel("anything-goes")).toBe(false);
    expect(isValidationLevel(3)).toBe(false);
  });
});

describe("the levels agree with the record the settings panel persists", () => {
  it("the four ids are the same four, in the same order", () => {
    expect(EDGE_POLICY_PRESETS.map((preset) => preset.id)).toEqual([...VALIDATION_LEVELS]);
  });

  it("every shared permission matches the preset's, field by field", () => {
    for (const level of VALIDATION_LEVELS) {
      const stored = edgePolicyPreset(level as EdgePolicyPresetId).policy;
      const here = connectionPolicyForLevel(level);
      expect(here.allowSamePolarity, `${level}.allowSamePolarity`).toBe(stored.allowSamePolarity);
      expect(here.allowSelfConnection, `${level}.allowSelfConnection`).toBe(stored.allowSelfConnection);
      expect(here.allowFanIn, `${level}.allowFanIn`).toBe(stored.allowFanIn);
      expect(here.allowDuplicates, `${level}.allowDuplicates`).toBe(stored.allowDuplicates);
      expect(here.allowCycles, `${level}.allowCycles`).toBe(stored.allowCycles);
      // The judge's `cross-scope` IS the stored `allowCrossBoundary` — the two
      // names are the donor's and this kit's for one question ("may a cable
      // leave its parent?"), which is precisely the kind of thing that drifts
      // when nothing pins it.
      expect(here.allowCrossScope, `${level}.allowCrossScope`).toBe(stored.allowCrossBoundary);
    }
  });

  it("type strictness matches the stored `typeMatching` at every level", () => {
    for (const level of VALIDATION_LEVELS) {
      expect(typeStrictnessForLevel(level)).toBe(edgePolicyPreset(level as EdgePolicyPresetId).policy.typeMatching);
    }
  });

  it("the specs are frozen, so a consumer cannot edit the shared scale in place", () => {
    expect(Object.isFrozen(VALIDATION_LEVEL_SPECS)).toBe(true);
    for (const level of VALIDATION_LEVELS) {
      expect(Object.isFrozen(VALIDATION_LEVEL_SPECS[level].policy)).toBe(true);
      expect(Object.isFrozen(VALIDATION_LEVEL_SPECS[level].rules)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* One scene, four levels                                              */
/* ------------------------------------------------------------------ */

/** A board with one of everything the linter can have an opinion about: a
 *  self-loop, a duplicate pair, a cycle, a fan-in, and a dangling end. */
const MESSY: LintScene = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: [
    { id: "self", source: "a", sourceHandle: "out", target: "a", targetHandle: "in" },
    { id: "dup1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
    { id: "dup2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
    { id: "loop", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
    { id: "back", source: "c", sourceHandle: "out", target: "b", targetHandle: "in" },
    { id: "ghost", source: "b", sourceHandle: "out", target: "nowhere", targetHandle: "in" },
  ],
};

const DIRECTION_OF = ({ portId }: { portId: string }) => (portId === "out" ? ("source" as const) : ("sink" as const));
const TYPE_OF = ({ nodeId }: { nodeId: string }) => (nodeId === "c" ? undefined : ["number"]);

describe("one scene, four levels — the level really does decide how much applies", () => {
  it("whiteboard reports ONLY the dangling edge, however messy the board is", () => {
    const findings = lintSceneAtLevel(MESSY, "whiteboard", { directionOf: DIRECTION_OF, typeOf: TYPE_OF });
    expect(findings.map((f) => f.ruleId)).toEqual(["dangling-edge"]);
    expect(findings[0].subject).toEqual({ kind: "edge", id: "ghost" });
  });

  it("each rung reports at least as much as the one below it, on the same scene", () => {
    const counts = VALIDATION_LEVELS.map(
      (level) => lintSceneAtLevel(MESSY, level, { directionOf: DIRECTION_OF, typeOf: TYPE_OF }).length,
    );
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
  });

  it("`self-connection` appears at strict and at NO looser level — the rung it was added on", () => {
    for (const level of VALIDATION_LEVELS) {
      const ruleIds = lintSceneAtLevel(MESSY, level, { directionOf: DIRECTION_OF }).map((f) => f.ruleId);
      expect(ruleIds.includes("self-connection"), `${level}`).toBe(level === "strict");
    }
  });

  it("an undeclared type is a wildcard at `typed` and the error itself at `strict`", () => {
    // Edge `loop` runs b/out -> c/in, and `c` declares no type at all.
    const typed = lintSceneAtLevel(MESSY, "typed", { typeOf: TYPE_OF }).filter((f) => f.subject.id === "loop");
    expect(typed.filter((f) => f.ruleId === "type-mismatch")).toEqual([]);

    const strict = lintSceneAtLevel(MESSY, "strict", { typeOf: TYPE_OF })
      .filter((f) => f.subject.id === "loop" && f.ruleId === "type-mismatch");
    expect(strict).toHaveLength(1);
    // The message names the port that failed to declare, rather than printing
    // an empty string the reader has to guess at.
    expect(strict[0].message).toContain(`${UNDECLARED_TYPE_PREFIX}c/in`);
  });

  it("two UNDECLARED ends still fail at strict — a shared placeholder would have matched itself", () => {
    const untypedBoard: LintScene = {
      nodes: [{ id: "x" }, { id: "y" }],
      edges: [{ id: "e", source: "x", sourceHandle: "out", target: "y", targetHandle: "in" }],
    };
    const findings = lintSceneAtLevel(untypedBoard, "strict", { typeOf: () => undefined });
    expect(findings.map((f) => f.ruleId)).toContain("type-mismatch");
  });
});

describe("the same level drives the prevention half", () => {
  const board: LintScene = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "first", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }],
  };
  const second = { id: "second", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" };

  it("whiteboard lets a duplicate cable land; every tighter level refuses it, with a reason", () => {
    expect(validateConnectionAtLevel(board, second, "whiteboard").allowed).toBe(true);
    for (const level of ["guided", "typed", "strict"] as ValidationLevel[]) {
      const verdict = validateConnectionAtLevel(board, second, level);
      expect(verdict.allowed, level).toBe(false);
      // Ruling 1's contract: a refusal is never silent.
      if (!verdict.allowed) expect((verdict.refusal.message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("a second producer into one input is fine at guided and refused from `typed` up", () => {
    const fanIn = { id: "fan", source: "c", sourceHandle: "out", target: "b", targetHandle: "in" };
    const withC: LintScene = { ...board, nodes: [...board.nodes, { id: "c" }] };
    expect(validateConnectionAtLevel(withC, fanIn, "guided").allowed).toBe(true);
    expect(validateConnectionAtLevel(withC, fanIn, "typed").allowed).toBe(false);
    expect(validateConnectionAtLevel(withC, fanIn, "strict").allowed).toBe(false);
  });

  it("a dangling candidate is refused at EVERY level, whiteboard included", () => {
    const ghost = { id: "g", source: "a", sourceHandle: "out", target: "nope", targetHandle: "in" };
    for (const level of VALIDATION_LEVELS) {
      expect(validateConnectionAtLevel(board, ghost, level).allowed, level).toBe(false);
    }
  });
});
