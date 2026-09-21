// src/scene/interactions/magnet/magnetProposals.test.ts — A1, A2, A3, A5: the pure model.
//
// These are the acceptance assertions for R1, R2 and R5. Every one of them
// is arithmetic over a few numbers, which is why they live in the `unit`
// project (node, no browser) rather than inside a play function:
//   pnpm exec vitest --project=unit run src/scene/interactions/magnet/magnetProposals.test.ts
//
// A5 is the load-bearing one: it is React Flow's candidate ordering failing
// as a unit test, before any story runs.

import { describe, expect, it, vi } from "vitest";

import { effectiveHitValue, ZOOM_LEVELS } from "../../hitPolicy";
import { portKey, type ScenePortRef } from "../../scene";
import { gestureOrientation, type ConnectionMessage, type ConnectionVerdict } from "../../edgeValidation";
import {
  composeJudges,
  effectiveMagnetRadius,
  magnetProposalId,
  magnetTypeJudge,
  MAGNET_DEFAULT_RADIUS,
  MAGNET_RADIUS_MAX_SCENE,
  pairMagnetRadius,
  sameMagnetScan,
  scanMagnets,
  topProposal,
  translatePorts,
  type ConnectionJudge,
  type MagnetPort,
} from "./magnetProposals";

/* ------------------------------------------------------------------ */
/* Fixture helpers                                                     */
/* ------------------------------------------------------------------ */

const ref = (nodeId: string, portId: string): ScenePortRef => ({ nodeId, portId });

function port(nodeId: string, portId: string, x: number, y: number, extra: Partial<MagnetPort> = {}): MagnetPort {
  return { ref: ref(nodeId, portId), at: { x, y }, role: "target", ...extra };
}

const source = (nodeId: string, portId: string, x: number, y: number, extra: Partial<MagnetPort> = {}) => port(nodeId, portId, x, y, { role: "source", ...extra });

/** A 32-bit xorshift, so "100 seeded pairs" and "shuffled 100 times" are
 *  reproducible rather than flaky-by-design. */
function seeded(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}


/** Narrow a verdict to its refusal. Ruling 1 made `ConnectionVerdict` a
 *  discriminated union, so `.refusal` is unreachable without proving the
 *  verdict actually refused — which is the point. A cast would silence the
 *  compiler and lose exactly the guarantee the union exists to give. */
function refusalOf(verdict: ConnectionVerdict): ConnectionMessage {
  if (verdict.allowed) throw new Error("expected a refusal, got an allowed verdict");
  return verdict.refusal;
}

/* ================================================================== */
/* A1 — the radius (R1)                                                */
/* ================================================================== */

describe("A1 · radius semantics (R1)", () => {
  it("scene units pass through unchanged at every zoom", () => {
    for (const zoom of ZOOM_LEVELS) expect(effectiveMagnetRadius({ sceneUnits: 40 }, zoom)).toBe(40);
  });

  // THE POINT of this test: it makes the `effectiveHitValue` reuse
  // MECHANICAL. `magnetProposals.ts` delegates the screen-px division to
  // `hitRegions/hitPolicy.ts:51`; if someone re-types `px / zoom` locally,
  // or hitPolicy's rule changes, this fails rather than drifting.
  it("screen px EQUALS effectiveHitValue(px, zoom, 'screen') at every zoom", () => {
    for (const zoom of ZOOM_LEVELS) {
      expect(effectiveMagnetRadius({ screenPx: 24 }, zoom)).toBe(effectiveHitValue(24, zoom, "screen"));
    }
  });

  it("caps at MAGNET_RADIUS_MAX_SCENE where a screen-px target would grow without limit", () => {
    // 24 screen px at zoom 0.05 is 480 scene units, which would swallow the
    // board — the donor's own stated reason for capping at all.
    expect(effectiveHitValue(24, 0.05, "screen")).toBe(480);
    expect(effectiveMagnetRadius({ screenPx: 24 }, 0.05)).toBe(MAGNET_RADIUS_MAX_SCENE);
    // And the cap binds a scene-unit declaration too, not only a screen one.
    expect(effectiveMagnetRadius({ sceneUnits: 10_000 })).toBe(MAGNET_RADIUS_MAX_SCENE);
  });

  it("pairMagnetRadius is `max`, and commutative over 100 seeded pairs", () => {
    const random = seeded(0xc0ffee);
    for (let i = 0; i < 100; i += 1) {
      const ra = Math.round(random() * 300);
      const rb = Math.round(random() * 300);
      const a = source("a", "out", 0, 0, { radius: { sceneUnits: ra } });
      const b = port("b", "in", 0, 0, { radius: { sceneUnits: rb } });
      const forward = pairMagnetRadius(a, b);
      expect(forward).toBe(pairMagnetRadius(b, a));
      expect(forward).toBe(Math.max(effectiveMagnetRadius({ sceneUnits: ra }), effectiveMagnetRadius({ sceneUnits: rb })));
    }
  });

  it("an undeclared radius is MAGNET_DEFAULT_RADIUS", () => {
    const a = source("a", "out", 0, 0);
    const b = port("b", "in", 0, 0);
    expect(pairMagnetRadius(a, b)).toBe(effectiveMagnetRadius(MAGNET_DEFAULT_RADIUS));
  });

  it("the radius actually gates candidacy, symmetrically", () => {
    const moving = [source("a", "out", 0, 0, { radius: { sceneUnits: 10 } })];
    const inRange = [port("b", "in", 100, 0, { radius: { sceneUnits: 120 } })];
    const outOfRange = [port("b", "in", 130, 0, { radius: { sceneUnits: 120 } })];
    expect(scanMagnets({ moving, resting: inRange }).proposals).toHaveLength(1);
    expect(scanMagnets({ moving, resting: outOfRange }).proposals).toHaveLength(0);
    // Swap which end declares the big magnet — same answer (this is what
    // `max` buys, and what R3's "out of range -> it disappears" needs).
    const movingBig = [source("a", "out", 0, 0, { radius: { sceneUnits: 120 } })];
    const restingSmall = [port("b", "in", 100, 0, { radius: { sceneUnits: 10 } })];
    expect(scanMagnets({ moving: movingBig, resting: restingSmall }).proposals).toHaveLength(1);
  });
});

/* ================================================================== */
/* A2 — BOTH gates, and proximity gates FIRST (R2)                     */
/* ================================================================== */

describe("A2 · proximity AND validation, in that order (R2)", () => {
  const moving = [source("a", "out", 0, 0, { radius: { sceneUnits: 50 } })];
  const resting = [
    port("near", "in", 10, 0),
    port("mid", "in", 30, 0),
    port("far", "in", 500, 0), // way outside every radius
  ];

  it("no judge = geometry-only proposals, never a throw", () => {
    const scan = scanMagnets({ moving, resting });
    expect(scan.proposals.map((p) => p.to.nodeId)).toEqual(["near", "mid"]);
    expect(scan.refused).toEqual([]);
  });

  it("a judge refusing everything yields zero proposals and one refusal per IN-RANGE candidate", () => {
    const refuseAll: ConnectionJudge = () => ({ allowed: false, refusal: { severity: "error", code: "nope", message: "no" } });
    const scan = scanMagnets({ moving, resting, judge: refuseAll });
    expect(scan.proposals).toEqual([]);
    expect(scan.refused.map((r) => r.to.nodeId)).toEqual(["near", "mid"]);
    expect(scan.refused[0].refusal?.code).toBe("nope");
  });

  it("an out-of-range candidate NEVER reaches validation (spy call count == in-range count)", () => {
    const spy = vi.fn<ConnectionJudge>((c) => ({ allowed: true, oriented: gestureOrientation(c) }));
    scanMagnets({ moving, resting, judge: spy });
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) expect(call[0].target).not.toBe("far");
  });

  // WHY this test inverted: it used to pin maxGraph's silent `''` refusal
  // (`{allowed: false}` with no reason). Zach's ruling 1 abolished that —
  // "by default everything should connect and everything after that should
  // have a reason" — and `ConnectionVerdict` is now a discriminated union,
  // so the old fixture is not merely wrong, it does not compile. The
  // coverage it was protecting (a refusal still reaches `scan.refused`) is
  // kept; what changed is that the refusal must now explain itself.
  it("carries every refusal through with its reason attached — no silent case exists", () => {
    const refusing: ConnectionJudge = () => ({
      allowed: false,
      refusal: { severity: "error", code: "test-refusal", message: "refused for a stated reason" },
    });
    const scan = scanMagnets({ moving, resting: [port("near", "in", 10, 0)], judge: refusing });
    expect(scan.refused).toHaveLength(1);
    expect(scan.refused[0].refusal.code).toBe("test-refusal");
    expect(scan.refused[0].refusal.message).toBeTruthy();
  });

  it("composeJudges returns the FIRST refusal and short-circuits", () => {
    const calls: string[] = [];
    const first: ConnectionJudge = () => {
      calls.push("first");
      return { allowed: false, refusal: { severity: "error", code: "first" } };
    };
    const second: ConnectionJudge = () => {
      calls.push("second");
      return { allowed: false, refusal: { severity: "error", code: "second" } };
    };
    const verdict = composeJudges(first, second)({ id: "e", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" });
    expect(refusalOf(verdict).code).toBe("first");
    expect(calls).toEqual(["first"]);
    expect(composeJudges()({ id: "e", source: "a", target: "b" }).allowed).toBe(true);
  });

  it("an `inert` port on either end is not a candidate and not a refusal", () => {
    const scan = scanMagnets({ moving, resting: [port("hidden", "in", 10, 0, { inert: true })] });
    expect(scan.proposals).toEqual([]);
    expect(scan.refused).toEqual([]);
  });

  it("a same-role pair is not a candidate at all (an out->out is not a refusal)", () => {
    const spy = vi.fn<ConnectionJudge>((c) => ({ allowed: true, oriented: gestureOrientation(c) }));
    const scan = scanMagnets({ moving, resting: [source("other", "out", 10, 0)], judge: spy });
    expect(scan.proposals).toEqual([]);
    expect(scan.refused).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("orients the candidate edge by `role` before the judge sees it", () => {
    const seen: { source: string; target: string }[] = [];
    const spy: ConnectionJudge = (c) => {
      seen.push({ source: `${c.source}/${c.sourceHandle}`, target: `${c.target}/${c.targetHandle}` });
      return { allowed: true, oriented: gestureOrientation(c) };
    };
    // The MOVING port is the target end here, so the resting one must be the
    // edge's source.
    scanMagnets({ moving: [port("sink", "in", 0, 0)], resting: [source("src", "out", 10, 0)], judge: spy });
    expect(seen).toEqual([{ source: "src/out", target: "sink/in" }]);
  });
});

/* ================================================================== */
/* A3 — determinism (R5)                                               */
/* ================================================================== */

describe("A3 · deterministic ranking and tie-breaking (R5)", () => {
  const moving = [source("a", "out", 0, 0, { radius: { sceneUnits: 200 } })];

  it("nearest first", () => {
    const resting = [port("c", "in", 90, 0), port("b", "in", 30, 0), port("d", "in", 60, 0)];
    expect(scanMagnets({ moving, resting }).proposals.map((p) => p.to.nodeId)).toEqual(["b", "d", "c"]);
    expect(topProposal(scanMagnets({ moving, resting }))?.to.nodeId).toBe("b");
  });

  it("an EXACT tie resolves to the smaller portKey(to)", () => {
    // Both at distance 50, on opposite sides.
    const resting = [port("zeta", "in", 50, 0), port("alpha", "in", -50, 0)];
    const scan = scanMagnets({ moving, resting });
    expect(scan.proposals.map((p) => portKey(p.to.nodeId, p.to.portId))).toEqual(["alpha/in", "zeta/in"]);
  });

  it("a tie on `to` falls through to portKey(from)", () => {
    const twoMoving = [source("z", "out", 0, 0, { radius: { sceneUnits: 200 } }), source("a", "out", 0, 0, { radius: { sceneUnits: 200 } })];
    const scan = scanMagnets({ moving: twoMoving, resting: [port("sink", "in", 50, 0)] });
    expect(scan.proposals.map((p) => portKey(p.from.nodeId, p.from.portId))).toEqual(["a/out", "z/out"]);
  });

  // THE test that pins the divergence from every library studied: JointJS's
  // enumeration-order tie-break and React Flow's `closestHandles[0]` both
  // change their answer when the candidate collection is rebuilt, and it is
  // rebuilt every frame here.
  it("is byte-identical under 100 shuffles of the candidate array", () => {
    const resting: MagnetPort[] = [];
    const random = seeded(0xbeef);
    for (let i = 0; i < 24; i += 1) {
      // Deliberately includes exact distance collisions (the ring at r=40).
      const angle = (i / 24) * Math.PI * 2;
      const r = i % 3 === 0 ? 40 : 40 + (i % 7) * 6;
      resting.push(port(`n${String(i).padStart(2, "0")}`, "in", Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)));
    }
    const expected = JSON.stringify(scanMagnets({ moving, resting }));
    for (let round = 0; round < 100; round += 1) {
      const shuffled = [...resting];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(JSON.stringify(scanMagnets({ moving, resting: shuffled }))).toBe(expected);
    }
  });

  it("magnetProposalId is derived, never minted — same pair, same id", () => {
    const id = magnetProposalId(ref("a", "out"), ref("b", "in"));
    expect(id).toBe("magnet:a/out->b/in");
    expect(magnetProposalId(ref("a", "out"), ref("b", "in"))).toBe(id);
  });

  it("translatePorts is pure and shifts every port by the same vector", () => {
    const ports = [source("a", "out", 10, 20), source("a", "in", 0, 20)];
    const moved = translatePorts(ports, { x: 5, y: -3 });
    expect(moved.map((p) => p.at)).toEqual([
      { x: 15, y: 17 },
      { x: 5, y: 17 },
    ]);
    expect(ports[0].at).toEqual({ x: 10, y: 20 }); // input untouched
  });

  it("sameMagnetScan is reference-stable for an unchanged scan and false on a real move", () => {
    const a = scanMagnets({ moving, resting: [port("b", "in", 30, 0)] });
    const same = scanMagnets({ moving, resting: [port("b", "in", 30, 0)] });
    const moved = scanMagnets({ moving, resting: [port("b", "in", 31, 0)] });
    expect(sameMagnetScan(a, same)).toBe(true);
    expect(sameMagnetScan(a, moved)).toBe(false);
  });
});

/* ================================================================== */
/* A4 (judge half) — the type gate as a ConnectionJudge (R4)           */
/* ================================================================== */

describe("A4 · magnetTypeJudge maps verdicts to the donor's two refusal codes (R4)", () => {
  const types: Record<string, string> = { "src/out": "Pose", "poseSink/in": "Pose", "bytesSink/in": "bytes", "blank/in": "" };
  const typeOf = (r: ScenePortRef) => types[portKey(r.nodeId, r.portId)];

  const judge = (mode: "off" | "lenient" | "strict") => magnetTypeJudge({ typeOf, mode });
  const candidate = (target: string) => ({ id: "e", source: "src", sourceHandle: "out", target, targetHandle: "in" });

  it("off never refuses", () => {
    expect(judge("off")(candidate("bytesSink")).allowed).toBe(true);
  });

  it("mismatch -> `type-mismatch`", () => {
    const verdict = judge("lenient")(candidate("bytesSink"));
    expect(verdict.allowed).toBe(false);
    expect(refusalOf(verdict).code).toBe("type-mismatch");
    expect(refusalOf(verdict).message).toContain("Pose");
  });

  it("matching types are allowed", () => {
    expect(judge("strict")(candidate("poseSink")).allowed).toBe(true);
  });

  it("undeclared: allowed under lenient, `untyped-port` under strict", () => {
    expect(judge("lenient")(candidate("blank")).allowed).toBe(true);
    const strict = judge("strict")(candidate("blank"));
    expect(strict.allowed).toBe(false);
    expect(refusalOf(strict).code).toBe("untyped-port");
  });

  it("a null handle names the NODE, so there is nothing to judge -> allowed", () => {
    expect(judge("strict")({ id: "e", source: "src", sourceHandle: null, target: "bytesSink", targetHandle: "in" }).allowed).toBe(true);
    expect(judge("strict")({ id: "e", source: "src", sourceHandle: "out", target: "bytesSink" }).allowed).toBe(true);
  });

  it("an unknown port reads as undeclared, not as a crash", () => {
    expect(judge("lenient")(candidate("nobody")).allowed).toBe(true);
    expect(refusalOf(judge("strict")(candidate("nobody"))).code).toBe("untyped-port");
  });
});

/* ================================================================== */
/* A5 — NEAREST-LEGAL, not nearest (the ordering decision)             */
/* ================================================================== */

describe("A5 · an illegal near candidate never shadows a legal far one (R2 + R4)", () => {
  // This is React Flow's ordering failing as a unit test. Under
  // `getClosestHandle` -> `isValidHandle`
  // (@xyflow/system@0.0.82/dist/esm/index.mjs:2387-2419 then :2537-2542)
  // the nearest candidate is chosen first and validity can only flip a flag
  // on it — so this scan would yield NO proposal at all.
  const moving = [source("src", "out", 0, 0, { radius: { sceneUnits: 200 }, type: "Pose" })];
  const resting = [
    port("bytesSink", "in", 30, 0, { type: "bytes" }), // strictly NEARER
    port("poseSink", "in", 90, 0, { type: "Pose" }), // strictly FARTHER
  ];
  const all = [...moving, ...resting];
  const typeOf = (r: ScenePortRef) => all.find((p) => p.ref.nodeId === r.nodeId && p.ref.portId === r.portId)?.type;

  it("returns the FARTHER legal candidate as the top proposal", () => {
    const scan = scanMagnets({ moving, resting, judge: magnetTypeJudge({ typeOf, mode: "lenient" }) });
    expect(scan.proposals).toHaveLength(1);
    expect(topProposal(scan)?.to.nodeId).toBe("poseSink");
    // And the nearer one is REFUSED, with the donor's own code — the
    // refusal is explained, not swallowed.
    expect(scan.refused.map((r) => `${r.to.nodeId}:${r.refusal.code}`)).toEqual(["bytesSink:type-mismatch"]);
  });

  it("the fixture is genuinely the hard case: the illegal candidate is strictly nearer", () => {
    const scan = scanMagnets({ moving, resting });
    // With no judge, geometry alone ranks bytesSink first.
    expect(scan.proposals.map((p) => p.to.nodeId)).toEqual(["bytesSink", "poseSink"]);
    expect(scan.proposals[0].distance).toBeLessThan(scan.proposals[1].distance);
  });

  it("composes the type gate with an arbitrary second judge, first refusal winning", () => {
    const noPoseSink: ConnectionJudge = (c) => (c.target === "poseSink" ? { allowed: false, refusal: { severity: "error", code: "banned" } } : { allowed: true, oriented: gestureOrientation(c) });
    const scan = scanMagnets({ moving, resting, judge: composeJudges(magnetTypeJudge({ typeOf, mode: "lenient" }), noPoseSink) });
    expect(scan.proposals).toEqual([]);
    expect(scan.refused.map((r) => r.refusal.code)).toEqual(["type-mismatch", "banned"]);
  });
});
