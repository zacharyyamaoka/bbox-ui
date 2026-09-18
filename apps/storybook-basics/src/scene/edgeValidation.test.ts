// src/scene/edgeValidation.test.ts — the prevention engine, tested in the
// node project (no DOM): `pnpm exec vitest --project=unit run`.
import { describe, expect, test } from "vitest";

import { validateConnection } from "./edgeValidation";
import type { LintScene } from "./lint";

function n(id: string) {
  return { id };
}

function e(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string) {
  return { id, source, target, sourceHandle, targetHandle };
}

const scene: LintScene = {
  nodes: [n("a"), n("b"), n("sink")],
  edges: [e("existing", "a", "sink", "out", "in")],
};

describe("validateConnection — allowed", () => {
  test("a fresh wire into an unwired port is allowed", () => {
    const verdict = validateConnection(scene, e("cand", "b", "sink", "out", "cfg"));
    expect(verdict).toEqual({ allowed: true });
  });

  test("a node-level candidate (no targetHandle) skips the many-to-one check entirely", () => {
    const verdict = validateConnection(scene, e("cand", "b", "sink"));
    expect(verdict.allowed).toBe(true);
  });

  test("an exact duplicate of an existing wire (same source AND target port) is ALLOWED — a re-wire from the same source carries the identical value, so it is duplicate-edge's concern (a warning), never many-to-one's", () => {
    const verdict = validateConnection(scene, e("cand", "a", "sink", "out", "in"));
    expect(verdict).toEqual({ allowed: true });
  });

  test("a candidate that would close a cycle is ALLOWED — cycle does not gate", () => {
    const verdict = validateConnection(scene, e("cand", "sink", "a", "out", "in"));
    expect(verdict).toEqual({ allowed: true });
  });
});

describe("validateConnection — refused silently (dangling)", () => {
  test("a candidate naming a node not in the scene is refused with NO message", () => {
    const verdict = validateConnection(scene, e("cand", "ghost", "sink", "out", "cfg"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBeUndefined();
  });

  test("a candidate naming a port outside the node's known vocabulary is refused with NO message", () => {
    const verdict = validateConnection(scene, e("cand", "a", "sink", "out", "cfg"), { portsOf: (id) => (id === "sink" ? ["in"] : undefined) });
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBeUndefined();
  });
});

describe("validateConnection — refused with an explanation", () => {
  test("a self-connection is refused, and the refusal carries the same message a lint finding would", () => {
    const verdict = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toEqual({ severity: "error", message: 'Edge "cand" connects "a" to itself', code: "self-connection" });
  });

  test("a second producer into an already-wired port is refused, message names the port and the count it WOULD reach", () => {
    const verdict = validateConnection(scene, e("cand", "b", "sink", "out", "in"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toEqual({
      severity: "error",
      message: 'Port "sink/in" has 2 producers wired in (no region makes them exclusive)',
      code: "many-to-one",
    });
  });

  test("dangling is checked BEFORE self-connection/many-to-one — a candidate that is both dangling and self-referential stays silent", () => {
    const verdict = validateConnection(scene, e("cand", "ghost", "ghost", "out", "in"));
    expect(verdict).toEqual({ allowed: false });
  });
});

describe("validateConnection — closes the maxGraph/Vyuh loop", () => {
  test("the refusal is Diagnostic-shaped (severity + message + code, no id) — usable as-is if the caller commits anyway", () => {
    const verdict = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expect(verdict.refusal).toBeDefined();
    expect(Object.keys(verdict.refusal!).sort()).toEqual(["code", "message", "severity"]);
  });

  test("three genuinely distinct outcomes are reachable: allowed, silently refused, explained refusal", () => {
    const allowed = validateConnection(scene, e("cand", "b", "sink", "out", "cfg"));
    const silent = validateConnection(scene, e("cand", "ghost", "sink", "out", "cfg"));
    const explained = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expect(allowed.allowed).toBe(true);
    expect(silent.allowed).toBe(false);
    expect(silent.refusal).toBeUndefined();
    expect(explained.allowed).toBe(false);
    expect(explained.refusal?.message).toBeDefined();
  });
});
