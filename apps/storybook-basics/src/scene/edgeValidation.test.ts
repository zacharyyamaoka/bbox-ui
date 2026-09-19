// src/scene/edgeValidation.test.ts — the prevention engine, tested in the
// node project (no DOM): `pnpm exec vitest --project=unit run`.
import { describe, expect, test } from "vitest";

import { gestureOrientation, validateConnection, type ConnectionVerdict } from "./edgeValidation";
import type { LintScene } from "./lint";
import type { ScenePortRef } from "./scene";

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

/** Every refusal is explained (ruling 1) — this is the ONE assertion every
 *  gated fixture below must satisfy, so it is factored out rather than
 *  repeated per case. */
function expectExplainedRefusal(verdict: ConnectionVerdict, code: string) {
  expect(verdict.allowed).toBe(false);
  if (verdict.allowed) return; // unreachable, narrows for TS below
  expect((verdict.refusal.message ?? "").length).toBeGreaterThan(0);
  expect(typeof verdict.refusal.code).toBe("string");
  expect(verdict.refusal.code).toBe(code);
}

describe("validateConnection — allowed", () => {
  test("a fresh wire into an unwired port is allowed", () => {
    const candidate = e("cand", "b", "sink", "out", "cfg");
    const verdict = validateConnection(scene, candidate);
    expect(verdict).toEqual({ allowed: true, oriented: gestureOrientation(candidate) });
  });

  test("a node-level candidate (no targetHandle) skips the many-to-one check entirely", () => {
    const verdict = validateConnection(scene, e("cand", "b", "sink"));
    expect(verdict.allowed).toBe(true);
  });

  test("an exact duplicate of an existing wire (same source AND target port) is ALLOWED — a re-wire from the same source carries the identical value, so it is duplicate-edge's concern (a warning), never many-to-one's", () => {
    const candidate = e("cand", "a", "sink", "out", "in");
    const verdict = validateConnection(scene, candidate);
    expect(verdict).toEqual({ allowed: true, oriented: gestureOrientation(candidate) });
  });

  test("a candidate that would close a cycle is ALLOWED — cycle does not gate", () => {
    const candidate = e("cand", "sink", "a", "out", "in");
    const verdict = validateConnection(scene, candidate);
    expect(verdict).toEqual({ allowed: true, oriented: gestureOrientation(candidate) });
  });

  test("with a typeOf vocabulary supplied, a COMPATIBLE candidate is allowed", () => {
    const typeOf = (ref: ScenePortRef) => (ref.nodeId === "b" && ref.portId === "out" ? ["number"] : ref.nodeId === "sink" && ref.portId === "cfg" ? ["number"] : undefined);
    const candidate = e("cand", "b", "sink", "out", "cfg");
    const verdict = validateConnection(scene, candidate, { typeOf });
    expect(verdict).toEqual({ allowed: true, oriented: gestureOrientation(candidate) });
  });
});

describe("validateConnection — every gate is EXPLAINED (ruling 1: no silent refusal)", () => {
  test("a candidate naming a node not in the scene is refused, WITH a reason", () => {
    const verdict = validateConnection(scene, e("cand", "ghost", "sink", "out", "cfg"));
    expectExplainedRefusal(verdict, "dangling-edge");
  });

  test("a candidate naming a port outside the node's known vocabulary is refused, WITH a reason", () => {
    const verdict = validateConnection(scene, e("cand", "a", "sink", "out", "cfg"), { portsOf: (id) => (id === "sink" ? ["in"] : undefined) });
    expectExplainedRefusal(verdict, "dangling-edge");
  });

  test("a self-connection is refused, and the refusal carries the same message a lint finding would", () => {
    const verdict = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expectExplainedRefusal(verdict, "self-connection");
    expect(verdict.allowed === false && verdict.refusal).toEqual({ severity: "error", message: 'Edge "cand" connects "a" to itself', code: "self-connection" });
  });

  test("a second producer into an already-wired port is refused, message names the port and the count it WOULD reach", () => {
    const verdict = validateConnection(scene, e("cand", "b", "sink", "out", "in"));
    expectExplainedRefusal(verdict, "many-to-one");
    expect(verdict.allowed === false && verdict.refusal).toEqual({
      severity: "error",
      message: 'Port "sink/in" has 2 producers wired in (no region makes them exclusive)',
      code: "many-to-one",
    });
  });

  test("dangling is checked BEFORE self-connection/many-to-one — a candidate that is both dangling and self-referential is refused for the dangling reason", () => {
    const verdict = validateConnection(scene, e("cand", "ghost", "ghost", "out", "in"));
    expectExplainedRefusal(verdict, "dangling-edge");
  });

  test("an incompatible candidate is refused for type-mismatch — the LAST gate, and only fires when typeOf is supplied", () => {
    const typeOf = (ref: ScenePortRef) => (ref.nodeId === "b" && ref.portId === "out" ? ["number"] : ref.nodeId === "sink" && ref.portId === "cfg" ? ["string"] : undefined);
    const verdict = validateConnection(scene, e("cand", "b", "sink", "out", "cfg"), { typeOf });
    expectExplainedRefusal(verdict, "type-mismatch");
  });

  test("the SAME candidate is allowed with no typeOf supplied at all — type-mismatch contributes nothing when unconfigured", () => {
    const candidate = e("cand", "b", "sink", "out", "cfg");
    const verdict = validateConnection(scene, candidate);
    expect(verdict).toEqual({ allowed: true, oriented: gestureOrientation(candidate) });
  });
});

describe("validateConnection — closes the maxGraph/Vyuh loop", () => {
  test("the refusal is Diagnostic-shaped (severity + message + code, no id) — usable as-is if the caller commits anyway", () => {
    const verdict = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(Object.keys(verdict.refusal).sort()).toEqual(["code", "message", "severity"]);
  });

  test("every gated fixture (dangling node, dangling port, self-connection, many-to-one, type-mismatch) is refused WITH a non-empty reason", () => {
    const typeOf = (ref: ScenePortRef) => (ref.nodeId === "b" && ref.portId === "out" ? ["number"] : ref.nodeId === "sink" && ref.portId === "cfg" ? ["string"] : undefined);
    const fixtures: { verdict: ConnectionVerdict; code: string }[] = [
      { verdict: validateConnection(scene, e("cand", "ghost", "sink", "out", "cfg")), code: "dangling-edge" },
      { verdict: validateConnection(scene, e("cand", "a", "sink", "out", "cfg"), { portsOf: (id) => (id === "sink" ? ["in"] : undefined) }), code: "dangling-edge" },
      { verdict: validateConnection(scene, e("cand", "a", "a", "out", "in")), code: "self-connection" },
      { verdict: validateConnection(scene, e("cand", "b", "sink", "out", "in")), code: "many-to-one" },
      { verdict: validateConnection(scene, e("cand", "b", "sink", "out", "cfg"), { typeOf }), code: "type-mismatch" },
    ];
    for (const { verdict, code } of fixtures) expectExplainedRefusal(verdict, code);
  });

  test("two genuinely distinct outcomes are reachable: allowed, explained refusal — the silent third is gone", () => {
    const allowed = validateConnection(scene, e("cand", "b", "sink", "out", "cfg"));
    const explained = validateConnection(scene, e("cand", "a", "a", "out", "in"));
    expect(allowed.allowed).toBe(true);
    expect(explained.allowed).toBe(false);
    expect(explained.allowed === false && (explained.refusal.message ?? "").length > 0).toBe(true);
  });
});

// Compile-level, module scope (not inside any test): the silent case is
// UNREPRESENTABLE, not merely unused. `pnpm exec vitest --project=unit run`
// type-checks via Vite/esbuild-typecheck plugins in this repo's config, so
// a `@ts-expect-error` that stops being an error fails the run.
// @ts-expect-error — `allowed: false` requires `refusal`; the old silent
// shape no longer type-checks.
const _neverCompiles: ConnectionVerdict = { allowed: false };
void _neverCompiles;
