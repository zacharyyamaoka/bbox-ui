// src/scene/availability.test.ts — drag-time validity preview, tested in
// the node project (no DOM): `pnpm exec vitest --project=unit run`.
import { describe, expect, test } from "vitest";

import { connectionAvailability } from "./availability";
import { gestureOrientation, validateConnection } from "./edgeValidation";
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
        return { allowed: true, oriented: gestureOrientation(candidate) };
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
        return { allowed: true, oriented: gestureOrientation(candidate) };
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

/* ------------------------------------------------------------------ */
/* directionOf — the output→output correctness bug, fixed              */
/* ------------------------------------------------------------------ */

// REGRESSION (docs/peps/0002-the-judge-owns-edge-orientation.md). Probed
// against `ValidityPreview.stories.tsx`'s real fixture before `directionOf`
// existed on `AvailabilityOptions`: dragging from `num1/out` painted
// `num2/out` (another OUTPUT) "available", because nothing here ever told
// `validateConnection` which end emits. `a`/`b` both speak `out` only,
// mirroring that fixture's two same-polarity source nodes; `sink` speaks
// `in` only, the one legitimate opposite-polarity target.
describe("connectionAvailability — directionOf (output→output refused)", () => {
  const polarityScene: LintScene = { nodes: [n("a"), n("b"), n("sink")], edges: [] };
  const polarityPortsOf = (nodeId: string): readonly string[] | undefined => {
    if (nodeId === "a" || nodeId === "b") return ["out"];
    if (nodeId === "sink") return ["in"];
    return undefined;
  };
  const directionOf = ({ nodeId }: { nodeId: string; portId: string }) => (nodeId === "sink" ? ("sink" as const) : ("source" as const));

  test("two SOURCE ports are refused for polarity — both by validateConnection directly and by connectionAvailability's map, same code", () => {
    const direct = validateConnection(polarityScene, { id: "cand", source: "a", sourceHandle: "out", target: "b", targetHandle: "out" }, { directionOf });
    expect(direct.allowed).toBe(false);
    expect(direct.allowed === false && direct.refusal.code).toBe("polarity");

    const map = connectionAvailability(polarityScene, { nodeId: "a", portId: "out" }, { portsOf: polarityPortsOf, directionOf });
    const viaAvailability = map.get(portKey("b", "out"))!.verdict;
    expect(viaAvailability.allowed).toBe(false);
    expect(viaAvailability.allowed === false && viaAvailability.refusal.code).toBe("polarity");
  });

  test("a SOURCE dragged to the one SINK stays available — the fix does not refuse everything", () => {
    const map = connectionAvailability(polarityScene, { nodeId: "a", portId: "out" }, { portsOf: polarityPortsOf, directionOf });
    expect(map.get(portKey("sink", "in"))!.verdict.allowed).toBe(true);
  });

  test("without directionOf (the prior behaviour), the same output→output pair reads available — proving the bug existed and `directionOf` is what fixes it", () => {
    const map = connectionAvailability(polarityScene, { nodeId: "a", portId: "out" }, { portsOf: polarityPortsOf });
    expect(map.get(portKey("b", "out"))!.verdict.allowed).toBe(true);
  });

  // The task's SECOND probe: "from the already-broken sink/in it painted
  // BOTH num1/out and num2/out available" — dragging from an INPUT that is
  // already at 2 producers must still refuse a THIRD, but only once the
  // many-to-one gate reads the ORIENTED wire (source = the new producer,
  // target = sink/in) rather than the gesture's own naive order (which
  // would check num3/out's own producer count — always zero, so always
  // "available", regardless of how oversubscribed sink/in already is).
  test("dragging FROM an already-oversubscribed sink refuses a fresh source too — many-to-one reads the ORIENTED wire, not the gesture's order", () => {
    const fanScene: LintScene = {
      nodes: [n("num1"), n("num2"), n("num3"), n("sink")],
      edges: [e("e1", "num1", "sink", "out", "in"), e("e2", "num2", "sink", "out", "in")],
    };
    const fanPortsOf = (nodeId: string): readonly string[] | undefined => {
      if (nodeId === "sink") return ["in"];
      if (nodeId === "num1" || nodeId === "num2" || nodeId === "num3") return ["out"];
      return undefined;
    };
    const fanDirectionOf = ({ nodeId }: { nodeId: string; portId: string }) => (nodeId === "sink" ? ("sink" as const) : ("source" as const));

    const map = connectionAvailability(fanScene, { nodeId: "sink", portId: "in" }, { portsOf: fanPortsOf, directionOf: fanDirectionOf });
    const verdict = map.get(portKey("num3", "out"))!.verdict;
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.refusal.code).toBe("many-to-one");

    // And WITHOUT directionOf, the same drag reads available — the exact
    // symptom the probe found, pinned so it cannot come back silently.
    const naive = connectionAvailability(fanScene, { nodeId: "sink", portId: "in" }, { portsOf: fanPortsOf });
    expect(naive.get(portKey("num3", "out"))!.verdict.allowed).toBe(true);
  });
});
