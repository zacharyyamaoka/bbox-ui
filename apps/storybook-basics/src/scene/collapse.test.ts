// src/scene/collapse.test.ts — the round trip is the point.
//
// Zach asked for collapse AND its inverse in the same breath ("if you
// delete a parent, new wires are drawn that connect the children directly
// to the things they were connected to before"), so the load-bearing
// assertion in this lane is that the two compose to the identity. Every
// other test here exists to explain a way it could fail.

import { describe, expect, it } from "vitest";

import { crossingGeometryPolicy, classifyBoundary, promotedDirectionOf } from "./boundary";
import { collapseToRegion, dissolveRegion, deleteNodeRewiring, edgeSignatures, EMPTY_SELECTION } from "./collapse";
import { CROSS_SCOPE } from "./edgeValidation";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import { isRegion, REGION_NODE_TYPE } from "./region";
import type { BlockScene } from "./scene";

/* ------------------------------------------------------------------ */
/* Fixture — every edge class present at once                          */
/* ------------------------------------------------------------------ */

/**
 *   src ──e1──► [ a ──e2──► b ──e3──► c ]                  (selection)
 *                          └──e4──────────────► sink
 *   other ──e5──► other2                                   (exterior)
 *
 * e1 inbound, e2/e3 interior, e4 outbound, e5 exterior — Zach's three
 * classes plus the one his sentence does not mention because it is not a
 * candidate.
 */
function fixture(): BlockScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 100 }, data: { name: "Source" } },
      { id: "a", position: { x: 200, y: 40 }, data: { name: "A" } },
      { id: "b", position: { x: 340, y: 120 }, data: { name: "B" } },
      { id: "c", position: { x: 300, y: 260 }, data: { name: "C" } },
      { id: "sink", position: { x: 600, y: 120 }, data: { name: "Sink" } },
      { id: "other", position: { x: 0, y: 600 }, data: { name: "Other" } },
      { id: "other2", position: { x: 200, y: 600 }, data: { name: "Other2" } },
    ],
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in", data: { colour: "teal" } },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

const SELECTION = ["a", "b", "c"];

/** Every `out` port emits, every `in` port receives. `lint.ts`'s own
 *  `source`/`sink` vocabulary, not a third spelling. */
const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);

const typeOf: PortTypeOf = ({ portId }) => (portId === "out" || portId === "in" ? ["pose"] : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

/* ------------------------------------------------------------------ */
/* THE ROUND TRIP                                                      */
/* ------------------------------------------------------------------ */

describe("collapse → dissolve is the identity", () => {
  it("restores the scene EXACTLY — ids, ends, data, order and positions", () => {
    const before = fixture();
    const collapsed = collapseToRegion(before, SELECTION, { mintId: counter("m"), directionOf, typeOf });
    expect(collapsed.ok).toBe(true);
    if (!collapsed.ok) return;

    const after = dissolveRegion(collapsed.scene, collapsed.regionId).scene;

    // Not "the same edges" — the SAME SCENE. Array order included, because
    // collapse only ever appends and dissolve only ever removes what it
    // appended (see collapse.ts's header on why the outer half keeps its
    // id, `data` and index).
    expect(after).toEqual(before);
    // And the input was never mutated on the way through.
    expect(before).toEqual(fixture());
  });

  it("round-trips a scene whose members are ALREADY nested", () => {
    const before = fixture();
    // Make `c` a child of `b`: collapsing [a, b] must take `c` along by
    // containment without flattening it into a sibling.
    before.nodes = before.nodes.map((node) => (node.id === "c" ? { ...node, parentId: "b", position: { x: 20, y: 30 } } : node));
    const collapsed = collapseToRegion(before, ["a", "b"], { mintId: counter("m"), directionOf });
    expect(collapsed.ok).toBe(true);
    if (!collapsed.ok) return;
    // `c` stayed under `b`; only the selection ROOTS moved.
    expect(collapsed.scene.nodes.find((node) => node.id === "c")!.parentId).toBe("b");
    expect(collapsed.scene.nodes.find((node) => node.id === "b")!.parentId).toBe(collapsed.regionId);

    expect(dissolveRegion(collapsed.scene, collapsed.regionId).scene).toEqual(before);
  });

  it("round-trips a region nested inside another container", () => {
    const before: BlockScene = {
      nodes: [
        { id: "frame", position: { x: 1000, y: 500 }, data: {} },
        { id: "a", parentId: "frame", position: { x: 10, y: 20 }, data: {} },
        { id: "b", parentId: "frame", position: { x: 90, y: 20 }, data: {} },
        { id: "out", position: { x: 2000, y: 500 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
        { id: "e2", source: "b", sourceHandle: "out", target: "out", targetHandle: "in" },
      ],
    };
    const collapsed = collapseToRegion(before, ["a", "b"], { mintId: counter("m"), directionOf });
    expect(collapsed.ok).toBe(true);
    if (!collapsed.ok) return;
    expect(collapsed.scene.nodes.find((node) => node.id === collapsed.regionId)!.parentId).toBe("frame");
    expect(dissolveRegion(collapsed.scene, collapsed.regionId).scene).toEqual(before);
  });

  it("survives a SECOND round trip unchanged", () => {
    const before = fixture();
    const once = collapseToRegion(before, SELECTION, { mintId: counter("m"), directionOf });
    if (!once.ok) throw new Error("collapse refused");
    const back = dissolveRegion(once.scene, once.regionId).scene;
    const twice = collapseToRegion(back, SELECTION, { mintId: counter("n"), directionOf });
    if (!twice.ok) throw new Error("second collapse refused");
    expect(dissolveRegion(twice.scene, twice.regionId).scene).toEqual(before);
  });

  it("is LOSSY by ~1 ulp on fractional positions — measured, not asserted away", () => {
    // `(a − r) + r` is not always `a` in IEEE-754, where `r` is the region
    // origin. Found by search rather than assumed: over 3.3M random and
    // gridded pairs, 16% of values fail to return exactly, with the worst
    // absolute error tracking magnitude (5.8e-11 at ~3.7e5) — i.e. ~1 ulp
    // relative, never more. `-1.8` against an origin of `-5` is the
    // smallest readable case.
    const before: BlockScene = {
      nodes: [
        { id: "a", position: { x: -1.8, y: -1.8 }, data: {} },
        { id: "b", position: { x: -5, y: -5 }, data: {} },
      ],
      edges: [],
    };
    const collapsed = collapseToRegion(before, ["a", "b"], { mintId: counter("m") });
    if (!collapsed.ok) throw new Error("collapse refused");
    const after = dissolveRegion(collapsed.scene, collapsed.regionId).scene;
    const restored = after.nodes.find((node) => node.id === "a")!.position;
    // Not exact...
    expect(restored.x).not.toBe(-1.8);
    expect(restored.x).toBe(-1.7999999999999998);
    // ...but wrong only in the last bit. The bound is RELATIVE:
    // `Number.EPSILON` is the gap between representable doubles near 1.0,
    // so the absolute error at magnitude 1.8 is allowed to be ~1.8× that
    // and stating it as an absolute bound would be wrong (and was — this
    // assertion failed at exactly `Number.EPSILON` before being corrected).
    expect(Math.abs(restored.x - -1.8)).toBeLessThanOrEqual(Math.abs(-1.8) * Number.EPSILON);
    // And it does not COMPOUND: a second round trip from the already-
    // drifted value returns that same value, because the origin is
    // unchanged and the operation is idempotent from there on.
    const again = collapseToRegion(after, ["a", "b"], { mintId: counter("n") });
    if (!again.ok) throw new Error("collapse refused");
    const twice = dissolveRegion(again.scene, again.regionId).scene;
    expect(twice.nodes.find((node) => node.id === "a")!.position.x).toBe(restored.x);
    // Integers, the normal case, are exact — proved by the tests above.
  });

  it("keeps the edge SET identical even when ids are ignored", () => {
    const before = fixture();
    const collapsed = collapseToRegion(before, SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    // While collapsed, nothing outside names anything inside: that is the
    // isolation invariant, and it is visible in the signatures.
    const while_ = edgeSignatures(collapsed.scene);
    expect(while_.some((sig) => sig.includes("src/out -> a/in"))).toBe(false);
    expect(edgeSignatures(dissolveRegion(collapsed.scene, collapsed.regionId).scene)).toEqual(edgeSignatures(before));
  });
});

/* ------------------------------------------------------------------ */
/* What the collapse produced                                          */
/* ------------------------------------------------------------------ */

describe("collapseToRegion", () => {
  it("mints a REGION node — a node kind, not a Block preset", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const region = collapsed.scene.nodes.find((node) => node.id === collapsed.regionId)!;
    expect(region.type).toBe(REGION_NODE_TYPE);
    expect(isRegion(region)).toBe(true);
    // "100% region is isolated. Regions in code are not linked, so our
    // regions shouldn't be either!"
    expect(region.definitionId).toBeUndefined();
  });

  it("places the region at the min corner and rebases its members", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const at = (id: string) => collapsed.scene.nodes.find((node) => node.id === id)!.position;
    // a(200,40) b(340,120) c(300,260) → origin (200, 40)
    expect(at(collapsed.regionId)).toEqual({ x: 200, y: 40 });
    expect(at("a")).toEqual({ x: 0, y: 0 });
    expect(at("b")).toEqual({ x: 140, y: 80 });
    expect(at("c")).toEqual({ x: 100, y: 220 });
  });

  it("creates one port per INSIDE endpoint, not one per crossing edge", () => {
    const scene = fixture();
    // A second outside consumer of the SAME inner output.
    scene.nodes.push({ id: "sink2", position: { x: 600, y: 300 }, data: {} });
    scene.edges.push({ id: "e6", source: "b", sourceHandle: "out", target: "sink2", targetHandle: "in" });
    const collapsed = collapseToRegion(scene, SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    // Two ports: one for a/in (inbound), one for b/out (outbound) — not
    // three, even though three edges cross.
    expect(collapsed.ports).toHaveLength(2);
    const out = collapsed.ports.find((port) => port.direction === "source")!;
    expect(out.edgeIds).toEqual(["e4", "e6"]);
    expect(out.outer).toEqual([
      { nodeId: "sink", portId: "in" },
      { nodeId: "sink2", portId: "in" },
    ]);
  });

  it("applies Zach's v1: a cable into an outside INPUT leaves on the right", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const out = collapsed.ports.find((port) => port.inner.nodeId === "b")!;
    expect(out).toMatchObject({ side: "right", direction: "source", seat: "header", by: "polarity" });
    const inn = collapsed.ports.find((port) => port.inner.nodeId === "a")!;
    expect(inn).toMatchObject({ side: "left", direction: "sink", seat: "header", by: "polarity" });
    // The datatype travels, so the port can still be judged after collapse.
    expect(out.portType).toBe("pose");
  });

  it("counts what it hid", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    expect(collapsed.hidden).toBe(2); // e2, e3
  });

  it("refuses a selection whose roots sit under different parents", () => {
    const scene = fixture();
    scene.nodes = scene.nodes.map((node) => (node.id === "a" ? { ...node, parentId: "src" } : node));
    const refused = collapseToRegion(scene, ["a", "b"], { mintId: counter("m") });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.code).toBe(CROSS_SCOPE);
    expect(refused.refusal.message).toContain("different parents");
  });

  it("refuses an empty selection rather than minting an empty region", () => {
    const refused = collapseToRegion(fixture(), ["nope"], { mintId: counter("m") });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.code).toBe(EMPTY_SELECTION);
  });
});

/* ------------------------------------------------------------------ */
/* Dissolve on its own terms                                           */
/* ------------------------------------------------------------------ */

describe("dissolveRegion", () => {
  it("is what `deleteNodeRewiring` names — one implementation, two names", () => {
    expect(deleteNodeRewiring).toBe(dissolveRegion);
  });

  it("returns the SAME scene object for an unknown node", () => {
    const scene = fixture();
    expect(dissolveRegion(scene, "nope").scene).toBe(scene);
  });

  it("reports what it did", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const result = dissolveRegion(collapsed.scene, collapsed.regionId);
    expect(result.rewired.sort()).toEqual(["e1", "e4"]);
    expect(result.removedStubs).toHaveLength(2);
    expect(result.released.sort()).toEqual(["a", "b", "c"]);
    expect(result.orphaned).toEqual([]);
  });

  it("drops an outer edge with nothing behind its port — by default", () => {
    // A hand-authored container port that never had an interior wire.
    const scene: BlockScene = {
      nodes: [
        { id: "box", type: REGION_NODE_TYPE, position: { x: 0, y: 0 }, data: {} },
        { id: "kid", parentId: "box", position: { x: 10, y: 10 }, data: {} },
        { id: "out", position: { x: 500, y: 0 }, data: {} },
      ],
      edges: [{ id: "dead", source: "box", sourceHandle: "ghost", target: "out", targetHandle: "in" }],
    };
    const dropped = dissolveRegion(scene, "box");
    expect(dropped.orphaned).toEqual(["dead"]);
    expect(dropped.scene.edges).toEqual([]);

    // `"park"` keeps it detectably dangling instead — linking.ts's own word.
    const parked = dissolveRegion(scene, "box", { remainder: "park" });
    expect(parked.scene.edges.map((edge) => edge.id)).toEqual(["dead"]);
  });

  it("dissolves a container it did NOT create, wiring children straight through", () => {
    // Zach's "super cheap to just draw black boxes around anything": the
    // box was authored by hand, and deleting it still keeps the cable.
    const scene: BlockScene = {
      nodes: [
        { id: "box", type: REGION_NODE_TYPE, position: { x: 100, y: 100 }, data: {} },
        { id: "kid", parentId: "box", position: { x: 10, y: 10 }, data: {} },
        { id: "out", position: { x: 900, y: 100 }, data: {} },
      ],
      edges: [
        { id: "stub", source: "kid", sourceHandle: "out", target: "box", targetHandle: "p" },
        { id: "wire", source: "box", sourceHandle: "p", target: "out", targetHandle: "in" },
      ],
    };
    const result = dissolveRegion(scene, "box");
    expect(result.scene.edges).toEqual([{ id: "wire", source: "kid", sourceHandle: "out", target: "out", targetHandle: "in" }]);
    expect(result.scene.nodes.find((node) => node.id === "kid")).toMatchObject({ position: { x: 110, y: 110 } });
    expect(result.scene.nodes.find((node) => node.id === "kid")!.parentId).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* The collapsed container, judged by the SAME engines                 */
/* ------------------------------------------------------------------ */

describe("a collapsed region is still a well-formed scene", () => {
  it("shows exactly Zach's edges once collapsed, and hides the rest", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const report = classifyBoundary(collapsed.scene, { containerId: collapsed.regionId });
    const kinds = report.edges.map((hit) => `${hit.edge.id}:${hit.kind}`).sort();
    expect(kinds).toEqual([
      "e1:port-outer", // "traces going to ports on the parent block itself"
      "e2:interior", //   "inside member to inside member... hidden"
      "e3:interior",
      "e4:port-outer",
      "e5:exterior",
      "m2:port-inner", // the interior stubs — the ports' private wiring
      "m3:port-inner",
    ]);
  });

  it("leaves no edge naming an inside node from outside — isolation", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const inside = new Set(SELECTION);
    const leaks = collapsed.scene.edges.filter((edge) => {
      const sourceIn = inside.has(edge.source);
      const targetIn = inside.has(edge.target);
      return sourceIn !== targetIn && edge.source !== collapsed.regionId && edge.target !== collapsed.regionId;
    });
    expect(leaks).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The geometry policy, and where v1 first breaks                      */
/* ------------------------------------------------------------------ */

describe("the swappable policy is really swappable", () => {
  const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
    a: { x: 200, y: 40, w: 120, h: 60 },
    b: { x: 340, y: 120, w: 120, h: 60 },
    c: { x: 300, y: 260, w: 120, h: 60 },
  };

  it("measures the side off the cable when given geometry", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, {
      mintId: counter("m"),
      directionOf,
      policy: crossingGeometryPolicy,
      boxOf: (id) => boxes[id],
      // e4 leaves B rightward toward `sink` at x=600.
      geometryOf: (id) => (id === "e4" ? { start: { x: 400, y: 150 }, end: { x: 600, y: 150 } } : undefined),
    });
    if (!collapsed.ok) throw new Error("collapse refused");
    const out = collapsed.ports.find((port) => port.inner.nodeId === "b")!;
    expect(out).toMatchObject({ side: "right", seat: "rail", by: "geometry" });
    expect(out.t).toBeGreaterThan(0);
    expect(out.t).toBeLessThan(1);
  });

  it("FALLS BACK to v1 rather than guessing when geometry is missing", () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, {
      mintId: counter("m"),
      directionOf,
      policy: crossingGeometryPolicy,
    });
    if (!collapsed.ok) throw new Error("collapse refused");
    expect(collapsed.ports.every((port) => port.by === "polarity")).toBe(true);
  });

  it("v1 and geometry DISAGREE on a feedback edge — the documented limit", () => {
    // `b` feeds back into `src`, which sits to the LEFT, from its own
    // `loop` port. v1 reads the polarity correctly (the region emits) and
    // therefore says "right"; the cable actually leaves through the LEFT
    // wall. Polarity right, side wrong — exactly `DAG_HEURISTIC_LIMIT`.
    const scene = fixture();
    scene.edges.push({ id: "fb", source: "b", sourceHandle: "loop", target: "src", targetHandle: "in" });
    const loopDirection: PortDirectionOf = (ref) => (ref.portId === "loop" ? "source" : directionOf(ref));
    const feedbackGeometry = { start: { x: 350, y: 150 }, end: { x: 20, y: 130 } };

    const v1 = collapseToRegion(scene, SELECTION, { mintId: counter("m"), directionOf: loopDirection });
    if (!v1.ok) throw new Error("collapse refused");
    const v1Feedback = v1.ports.find((port) => port.edgeIds.includes("fb"))!;
    expect(v1Feedback.side).toBe("right");
    expect(v1Feedback.direction).toBe("source"); // polarity IS right

    const measured = collapseToRegion(scene, SELECTION, {
      mintId: counter("g"),
      directionOf: loopDirection,
      policy: crossingGeometryPolicy,
      boxOf: (id) => boxes[id],
      geometryOf: (id) => (id === "fb" ? feedbackGeometry : undefined),
    });
    if (!measured.ok) throw new Error("collapse refused");
    const measuredFeedback = measured.ports.find((port) => port.edgeIds.includes("fb"))!;
    expect(measuredFeedback.side).toBe("left");
    // Polarity is NOT a geometric fact and must not move with the side.
    expect(measuredFeedback.direction).toBe("source");

    // The disagreement is the finding.
    expect(v1Feedback.side).not.toBe(measuredFeedback.side);
  });

  it("refuses to seat ONE inner port on two walls — and reports the conflict", () => {
    // The same inner output `b/out` feeds a consumer on the right AND one
    // on the left. One port cannot leave through two walls, so the first
    // decision stands and the disagreement is REPORTED rather than
    // silently averaged or silently duplicated.
    const scene = fixture();
    scene.edges.push({ id: "back", source: "b", sourceHandle: "out", target: "src", targetHandle: "in2" });
    const collapsed = collapseToRegion(scene, SELECTION, {
      mintId: counter("m"),
      directionOf: (ref) => (ref.portId === "in2" ? "sink" : directionOf(ref)),
      policy: crossingGeometryPolicy,
      boxOf: (id) => boxes[id],
      geometryOf: (id) =>
        id === "e4"
          ? { start: { x: 400, y: 150 }, end: { x: 600, y: 150 } }
          : id === "back"
            ? { start: { x: 350, y: 150 }, end: { x: 20, y: 130 } }
            : undefined,
    });
    if (!collapsed.ok) throw new Error("collapse refused");
    const port = collapsed.ports.find((entry) => entry.inner.nodeId === "b")!;
    expect(port.edgeIds).toEqual(["e4", "back"]);
    expect(port.side).toBe("right"); // the first decision stands
    expect(collapsed.conflicts).toEqual([
      { inner: { nodeId: "b", portId: "out" }, kept: "right", rejected: "left", edgeId: "back" },
    ]);
  });

  // A parallel lane, reading maxGraph's render-time resolver
  // (`GraphView.ts:1656-1679`), predicted that v1 "first fails when BOTH
  // ends of an edge are folded, or when folds NEST". Tested rather than
  // taken: under THIS scene contract both cases land correctly, for a
  // reason worth writing down — each container is classified
  // independently, and the endpoint rewrite preserves orientation, so the
  // second fold's DAG assumption is still reading a true fact.
  describe("the predicted v1 failures, measured", () => {
    it("BOTH ENDS FOLDED — each container reads the far end's REAL polarity", () => {
      const scene: BlockScene = {
        nodes: [
          { id: "a1", position: { x: 0, y: 0 }, data: {} },
          { id: "a2", position: { x: 100, y: 0 }, data: {} },
          { id: "b1", position: { x: 400, y: 0 }, data: {} },
          { id: "b2", position: { x: 500, y: 0 }, data: {} },
        ],
        edges: [
          { id: "ia", source: "a1", sourceHandle: "out", target: "a2", targetHandle: "in" },
          { id: "span", source: "a2", sourceHandle: "out", target: "b1", targetHandle: "in" },
          { id: "ib", source: "b1", sourceHandle: "out", target: "b2", targetHandle: "in" },
        ],
      };
      const foldA = collapseToRegion(scene, ["a1", "a2"], { mintId: counter("A"), directionOf });
      if (!foldA.ok) throw new Error("collapse refused");
      expect(foldA.ports[0]).toMatchObject({ side: "right", direction: "source", by: "polarity" });

      // Fold the SECOND group in the already-folded scene. Its far end is
      // now `regionA/<portId>`, which the caller's `directionOf` cannot
      // resolve — so it falls back to the edge's stored order...
      const foldB = collapseToRegion(foldA.scene, ["b1", "b2"], { mintId: counter("B"), directionOf });
      if (!foldB.ok) throw new Error("collapse refused");
      expect(foldB.ports[0]).toMatchObject({ side: "left", direction: "sink", by: "gesture" });

      // ...and the fallback is CORRECT here, because the rewrite preserved
      // orientation. Compose `promotedDirectionOf` and it becomes a real
      // reading rather than an assumption — same answer, honest provenance.
      const composed = collapseToRegion(foldA.scene, ["b1", "b2"], {
        mintId: counter("C"),
        directionOf: (ref) => directionOf(ref) ?? promotedDirectionOf(foldA.regionId, foldA.ports)(ref),
      });
      if (!composed.ok) throw new Error("collapse refused");
      expect(composed.ports[0]).toMatchObject({ side: "left", direction: "sink", by: "polarity" });
    });

    it("NESTED FOLDS — a region folded inside another round-trips both levels", () => {
      const before = fixture();
      const inner = collapseToRegion(before, ["b", "c"], { mintId: counter("I"), directionOf });
      if (!inner.ok) throw new Error("inner collapse refused");
      const outer = collapseToRegion(inner.scene, ["a", inner.regionId], {
        mintId: counter("O"),
        directionOf: (ref) => directionOf(ref) ?? promotedDirectionOf(inner.regionId, inner.ports)(ref),
      });
      if (!outer.ok) throw new Error("outer collapse refused");
      expect(outer.ports.map((port) => port.side).sort()).toEqual(["left", "right"]);
      expect(outer.ports.every((port) => port.by === "polarity")).toBe(true);

      // Unfold outermost-first and the original scene comes back whole.
      const half = dissolveRegion(outer.scene, outer.regionId).scene;
      expect(dissolveRegion(half, inner.regionId).scene).toEqual(before);
    });
  });

  it("reports `by: 'gesture'` when no polarity was ever read", () => {
    // No `directionOf`: the DAG assumption is doing all the work, and
    // `by` refuses to call that a polarity reading.
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m") });
    if (!collapsed.ok) throw new Error("collapse refused");
    expect(collapsed.ports.every((port) => port.by === "gesture")).toBe(true);
    // The fallback still gets the common case right, which is why it is a
    // usable default and not merely a placeholder.
    expect(collapsed.ports.find((port) => port.inner.nodeId === "b")!.side).toBe("right");
  });
});
