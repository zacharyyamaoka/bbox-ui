// src/components/edgePolicy.test.ts — ported from
// /home/bam/systemsketch/src/settings/edgePolicy.test.ts (112 lines), plus
// the storage-adapter cases the donor's module-level store made impossible
// (a null storage, and throwing getItem/setItem — this port takes the
// adapter as a parameter instead of defaulting to `window.localStorage`).
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_POLICY,
  EDGE_POLICY_PRESETS,
  EDGE_POLICY_RULE_COUNT,
  EDGE_POLICY_STORAGE_KEY,
  edgePoliciesEqual,
  edgePolicyPreset,
  enforcedRuleCount,
  matchingEdgePolicyPreset,
  parseStoredEdgePolicy,
  readEdgePolicy,
  writeEdgePolicy,
  type EdgePolicy,
} from "./edgePolicy";

/** A `Map`-backed fake `Storage`, matching `appSettings.test.ts`'s shape. */
function mapStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  };
}

describe("edge policy presets", () => {
  it("ships the whole ladder, permissive end first", () => {
    expect(EDGE_POLICY_PRESETS.map((preset) => preset.id)).toEqual(["whiteboard", "guided", "typed", "strict"]);
  });

  it("whiteboard enforces nothing at all", () => {
    expect(enforcedRuleCount(edgePolicyPreset("whiteboard").policy)).toBe(0);
  });

  it("guided IS the default — a fresh install behaves as SystemSketch always has", () => {
    expect(edgePolicyPreset("guided").policy).toEqual(DEFAULT_EDGE_POLICY);
    expect(matchingEdgePolicyPreset(DEFAULT_EDGE_POLICY)).toBe("guided");
  });

  it("typed already refuses fan-in, two rungs before strict", () => {
    const typed = edgePolicyPreset("typed").policy;
    expect(typed.allowFanIn).toBe(false);
  });

  it("strict enforces every rule but fan-out", () => {
    const strict = edgePolicyPreset("strict").policy;
    expect(strict.allowFanOut).toBe(true);
    expect(enforcedRuleCount(strict)).toBe(EDGE_POLICY_RULE_COUNT - 1);
  });

  it("each preset is strictly tighter (monotonic) than the one before it", () => {
    const counts = EDGE_POLICY_PRESETS.map((preset) => enforcedRuleCount(preset.policy));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(counts.length);
  });

  it("names a policy that matches no preset as Custom (null)", () => {
    const custom: EdgePolicy = { ...DEFAULT_EDGE_POLICY, allowCrossBoundary: true };
    expect(matchingEdgePolicyPreset(custom)).toBeNull();
  });

  it("finds each preset exactly by its own policy", () => {
    for (const preset of EDGE_POLICY_PRESETS) {
      expect(matchingEdgePolicyPreset(preset.policy)).toBe(preset.id);
    }
  });

  it("counts type matching as exactly one of the nine rules, however strict it is", () => {
    const off = enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: "off" });
    expect(enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: "lenient" })).toBe(off + 1);
    expect(enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: "strict" })).toBe(off + 1);
  });

  it("edgePoliciesEqual compares typeMatching, not only the boolean switches", () => {
    expect(
      edgePoliciesEqual(
        { ...DEFAULT_EDGE_POLICY, typeMatching: "lenient" },
        { ...DEFAULT_EDGE_POLICY, typeMatching: "strict" },
      ),
    ).toBe(false);
  });
});

describe("edge policy parsing", () => {
  it("keeps every other choice when a record predates a field", () => {
    // A record written before `allowFanOut` existed: the missing field takes
    // its own default, and the other choices around it survive.
    const parsed = parseStoredEdgePolicy({
      version: 1,
      allowHiddenPorts: true,
      allowCrossBoundary: true,
      typeMatching: "strict",
    });
    expect(parsed.allowHiddenPorts).toBe(true);
    expect(parsed.allowCrossBoundary).toBe(true);
    expect(parsed.typeMatching).toBe("strict");
    expect(parsed.allowFanOut).toBe(DEFAULT_EDGE_POLICY.allowFanOut);
  });

  it("resets wholesale when a stored field has the wrong type", () => {
    expect(parseStoredEdgePolicy({ version: 1, allowFanIn: "yes" })).toEqual(DEFAULT_EDGE_POLICY);
    expect(parseStoredEdgePolicy({ version: 1, typeMatching: "pedantic" })).toEqual(DEFAULT_EDGE_POLICY);
  });

  it("ignores a record from a version it does not know", () => {
    expect(parseStoredEdgePolicy({ version: 2, allowFanIn: false })).toEqual(DEFAULT_EDGE_POLICY);
  });

  it("resets on a non-record or other junk value", () => {
    for (const junk of [null, undefined, 3, "guided", [], ["guided"], true]) {
      expect(parseStoredEdgePolicy(junk)).toEqual(DEFAULT_EDGE_POLICY);
    }
  });

  it("never hands back the frozen default object for a caller to mutate", () => {
    const parsed = parseStoredEdgePolicy(null);
    expect(parsed).toEqual(DEFAULT_EDGE_POLICY);
    expect(Object.isFrozen(parsed)).toBe(false);

    const fromVersion1 = parseStoredEdgePolicy({ version: 1 });
    expect(Object.isFrozen(fromVersion1)).toBe(false);
  });
});

describe("edge policy persistence", () => {
  it("round-trips through a Map-backed fake storage", () => {
    const storage = mapStorage();
    const policy = edgePolicyPreset("strict").policy;
    writeEdgePolicy(storage, policy);
    expect(JSON.parse(storage.store.get(EDGE_POLICY_STORAGE_KEY)!)).toEqual({ version: 1, ...policy });
    expect(readEdgePolicy(storage)).toEqual(policy);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readEdgePolicy(mapStorage())).toEqual(DEFAULT_EDGE_POLICY);
  });

  it("survives corrupt JSON rather than throwing at startup", () => {
    expect(readEdgePolicy(mapStorage({ [EDGE_POLICY_STORAGE_KEY]: "{not json" }))).toEqual(DEFAULT_EDGE_POLICY);
  });

  it("treats a null storage as absent, on both read and write", () => {
    expect(readEdgePolicy(null)).toEqual(DEFAULT_EDGE_POLICY);
    expect(() => writeEdgePolicy(null, DEFAULT_EDGE_POLICY)).not.toThrow();
  });

  it("swallows a throwing getItem/setItem rather than throwing at the call site", () => {
    const throwing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readEdgePolicy(throwing)).toEqual(DEFAULT_EDGE_POLICY);
    expect(() => writeEdgePolicy(throwing, DEFAULT_EDGE_POLICY)).not.toThrow();
  });
});
