// src/scene/availability.test.ts — drag-time validity preview, tested in
// the node project (no DOM): `pnpm exec vitest --project=unit run`.
import { describe, expect, test } from "vitest";

import { connectionAvailability } from "./availability";
import type { LintScene } from "./lint";
import { portKey } from "./scene";

function n(id: string) {
  return { id };
}

function e(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string) {
  return { id, source, target, sourceHandle, targetHandle };
}

// a: ["out", "aux"], b: ["in", "cfg"], c: no known vocabulary at all.
const scene: LintScene = {
  nodes: [n("a"), n("b"), n("c")],
  edges: [],
};

function portsOf(nodeId: string): readonly string[] | undefined {
  if (nodeId === "a") return ["out", "aux"];
  if (nodeId === "b") return ["in", "cfg"];
  return undefined; // "c" — unknown vocabulary
}

describe("connectionAvailability — enumeration", () => {
  test("one entry per enumerable port, excluding the from-port itself; nodes with undefined vocabulary contribute zero entries", () => {
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, { portsOf });
    expect([...map.keys()].sort()).toEqual([portKey("a", "aux"), portKey("b", "cfg"), portKey("b", "in")].sort());
    expect(map.has(portKey("a", "out"))).toBe(false); // the from-port itself
    expect([...map.keys()].some((k) => k.startsWith("c/"))).toBe(false); // c contributes nothing
  });

  test("every returned entry carries the ref it is about", () => {
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, { portsOf });
    const entry = map.get(portKey("b", "in"));
    expect(entry?.ref).toEqual({ nodeId: "b", portId: "in" });
  });
});

describe("connectionAvailability — default judge (wraps validateConnection)", () => {
  test("a cross-node candidate with no conflicts is allowed", () => {
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, { portsOf });
    expect(map.get(portKey("b", "in"))!.verdict.allowed).toBe(true);
    expect(map.get(portKey("b", "cfg"))!.verdict.allowed).toBe(true);
  });

  test("a same-node candidate (a's own OTHER port) is refused for self-connection — the existing rule blocks any same-node edge, not just the same port", () => {
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, { portsOf });
    const verdict = map.get(portKey("a", "aux"))!.verdict;
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe("self-connection");
  });

  test("a candidate that would create a self-connection is refused (fromRole source, targeting a's own OTHER port stays cross-node here, so use a same-node scene to trigger it)", () => {
    const selfScene: LintScene = { nodes: [n("solo")], edges: [] };
    const map = connectionAvailability(selfScene, { nodeId: "solo", portId: "out" }, { portsOf: () => ["out", "in"] });
    const verdict = map.get(portKey("solo", "in"))!.verdict;
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe("self-connection");
  });

  test("with a typeOf vocabulary, an incompatible target is refused for type-mismatch; compatible targets stay allowed", () => {
    const typeOf = (ref: { nodeId: string; portId: string }) => {
      if (ref.nodeId === "a" && ref.portId === "out") return ["number"];
      if (ref.nodeId === "a" && ref.portId === "aux") return ["number"];
      if (ref.nodeId === "b" && ref.portId === "in") return ["number"];
      if (ref.nodeId === "b" && ref.portId === "cfg") return ["string"];
      return undefined;
    };
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, { portsOf, typeOf });

    const mismatched = map.get(portKey("b", "cfg"))!.verdict;
    expect(mismatched.allowed).toBe(false);
    expect(mismatched.allowed === false && mismatched.refusal.code).toBe("type-mismatch");

    const compatible = map.get(portKey("b", "in"))!.verdict;
    expect(compatible.allowed).toBe(true);
  });
});

describe("connectionAvailability — fromRole", () => {
  test("default fromRole (source): `from` supplies the source end of every candidate", () => {
    const seen: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }[] = [];
    connectionAvailability(scene, { nodeId: "a", portId: "out" }, {
      portsOf,
      validate: (_s, candidate) => {
        seen.push(candidate);
        return { allowed: true };
      },
    });
    expect(seen.every((c) => c.source === "a" && c.sourceHandle === "out")).toBe(true);
  });

  test('fromRole "target": `from` supplies the TARGET end, every enumerated port becomes a candidate source', () => {
    const seen: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }[] = [];
    connectionAvailability(scene, { nodeId: "b", portId: "in" }, {
      portsOf,
      fromRole: "target",
      validate: (_s, candidate) => {
        seen.push(candidate);
        return { allowed: true };
      },
    });
    expect(seen.every((c) => c.target === "b" && c.targetHandle === "in")).toBe(true);
    expect(seen.some((c) => c.source === "a" && c.sourceHandle === "out")).toBe(true);
  });
});

describe("connectionAvailability — override", () => {
  test("a custom `validate` replaces the default judge entirely", () => {
    const map = connectionAvailability(scene, { nodeId: "a", portId: "out" }, {
      portsOf,
      validate: () => ({ allowed: false, refusal: { severity: "error", message: "nope", code: "custom" } }),
    });
    for (const { verdict } of map.values()) {
      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.refusal.code).toBe("custom");
    }
  });
});
