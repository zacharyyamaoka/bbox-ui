// src/scene/codeOrigin.test.ts — ACCEPTANCE for lane `scv-origin-and-actions`
// (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §3). Committed BEFORE the lane
// exists and OFF-LIMITS to its builder: these assertions define done.

import { describe, expect, it } from "vitest";

import { CODE_ORIGIN_STATES, codeOriginState, isCodeOrigin, ORIGIN_BADGE, type CodeOrigin } from "./codeOrigin";

const HEX64 = "a".repeat(64);
const ORIGIN: CodeOrigin = { uri: "stereo.py", anchor: "Pipeline.run", contentHash: `sha256:${HEX64}` };

describe("codeOriginState — the four states, all computed, never stored", () => {
  it("null origin is pseudo — the board owns the bytes, whatever the host resolved", () => {
    expect(codeOriginState(null, undefined)).toBe("pseudo");
    expect(codeOriginState(undefined, undefined)).toBe("pseudo");
    // A host that resolved anyway is answering a question nobody asked.
    expect(codeOriginState(null, { fileFound: true, anchorFound: true, spanHash: ORIGIN.contentHash })).toBe("pseudo");
  });

  it("hash verifies → synced", () => {
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: true, spanHash: ORIGIN.contentHash })).toBe("synced");
  });

  it("hash differs → drifted (re-read, never merge)", () => {
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: true, spanHash: `sha256:${"b".repeat(64)}` })).toBe("drifted");
  });

  it("file missing, anchor missing, or nothing resolved at all → orphaned", () => {
    expect(codeOriginState(ORIGIN, { fileFound: false, anchorFound: false })).toBe("orphaned");
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: false })).toBe("orphaned");
    expect(codeOriginState(ORIGIN, undefined)).toBe("orphaned");
  });

  it("anchorFound without a spanHash is orphaned, not silently synced — a missing hash is a missing fact", () => {
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: true })).toBe("orphaned");
  });

  it("the hash comparison is an exact string compare — no case folding, no prefix stripping", () => {
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: true, spanHash: `sha256:${HEX64.toUpperCase()}` })).toBe("drifted");
    expect(codeOriginState(ORIGIN, { fileFound: true, anchorFound: true, spanHash: HEX64 })).toBe("drifted");
  });

  it("never throws on garbage resolutions", () => {
    expect(() => codeOriginState(ORIGIN, {} as never)).not.toThrow();
    expect(codeOriginState(ORIGIN, {} as never)).toBe("orphaned");
  });
});

describe("isCodeOrigin — exact-keys validator (pyblocks' _is_exact_v1 discipline)", () => {
  it("accepts exactly the three keys with well-formed values", () => {
    expect(isCodeOrigin(ORIGIN)).toBe(true);
  });

  it("rejects extra keys, missing keys, empty strings, and a malformed hash", () => {
    expect(isCodeOrigin({ ...ORIGIN, extra: 1 })).toBe(false);
    expect(isCodeOrigin({ uri: "a.py", anchor: "f" })).toBe(false);
    expect(isCodeOrigin({ ...ORIGIN, uri: "" })).toBe(false);
    expect(isCodeOrigin({ ...ORIGIN, anchor: "" })).toBe(false);
    expect(isCodeOrigin({ ...ORIGIN, contentHash: HEX64 })).toBe(false);
    expect(isCodeOrigin({ ...ORIGIN, contentHash: "sha256:xyz" })).toBe(false);
    expect(isCodeOrigin({ ...ORIGIN, contentHash: `sha256:${"A".repeat(64)}` })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isCodeOrigin(null)).toBe(false);
    expect(isCodeOrigin(undefined)).toBe(false);
    expect(isCodeOrigin("stereo.py")).toBe(false);
    expect(isCodeOrigin([])).toBe(false);
  });
});

describe("ORIGIN_BADGE — the frozen four-state badge data", () => {
  it("has exactly one entry per state, with distinct labels", () => {
    expect(Object.keys(ORIGIN_BADGE).sort()).toEqual([...CODE_ORIGIN_STATES].sort());
    const labels = CODE_ORIGIN_STATES.map((state) => ORIGIN_BADGE[state].label);
    expect(new Set(labels).size).toBe(4);
  });

  it("drift is amber and orphaned is red; the two calm states are quiet", () => {
    expect(ORIGIN_BADGE.drifted.variant).toBe("warning");
    expect(ORIGIN_BADGE.orphaned.variant).toBe("destructive");
    expect(["secondary", "outline"]).toContain(ORIGIN_BADGE.pseudo.variant);
    expect(["secondary", "outline"]).toContain(ORIGIN_BADGE.synced.variant);
  });

  it("is frozen — design data, not something a host mutates at runtime", () => {
    expect(Object.isFrozen(ORIGIN_BADGE)).toBe(true);
    expect(Object.isFrozen(ORIGIN_BADGE.pseudo)).toBe(true);
  });
});
