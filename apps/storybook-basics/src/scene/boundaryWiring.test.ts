// src/scene/boundaryWiring.test.ts — the toggle Zach asked for, and the
// placement rule he asked for.
//
// The OFF position is the interesting one: "having it off is nice cause
// then you think in terms of public api first." So the refusal is a
// FEATURE, tested as one — with the boundary named in the message, because
// a refusal that does not say what to declare is just a dead end.

import { describe, expect, it } from "vitest";

import { AUTO_PORT_OFF, boundaryPath, wireAcrossBoundary, wireChildToParent } from "./boundaryWiring";
import { CROSS_SCOPE } from "./edgeValidation";
import { typesIntersect, type PortDirectionOf, type PortTypeOf } from "./lint";
import { REGION_NODE_TYPE } from "./region";
import type { BlockScene } from "./scene";

/**
 *   frame ▸ region ▸ kid          and a loose `far` on the outside.
 */
function scene(): BlockScene {
  return {
    nodes: [
      { id: "frame", position: { x: 0, y: 0 }, data: {} },
      { id: "region", type: REGION_NODE_TYPE, parentId: "frame", position: { x: 100, y: 100 }, data: {} },
      { id: "kid", parentId: "region", position: { x: 20, y: 20 }, data: {} },
      { id: "far", position: { x: 900, y: 140 }, data: {} },
    ],
    edges: [],
  };
}

const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);
const typeOf: PortTypeOf = ({ portId }) => (portId === "out" ? ["pose"] : portId === "in" ? ["pose"] : portId === "rgb" ? ["image"] : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

const KID = { nodeId: "kid", portId: "out" };
const FAR = { nodeId: "far", portId: "in" };

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

describe("boundaryPath", () => {
  it("names the containers to leave and the containers to enter", () => {
    expect(boundaryPath(scene(), "kid", "far")).toEqual({ out: ["region", "frame"], in: [] });
  });

  it("stops at the lowest common ancestor — shared scope crosses nothing", () => {
    const nested = scene();
    nested.nodes.push({ id: "sibling", parentId: "region", position: { x: 60, y: 20 }, data: {} });
    expect(boundaryPath(nested, "kid", "sibling")).toEqual({ out: [], in: [], commonAncestor: "region" });
  });

  it("reverses the far end's chain so it reads outside-in", () => {
    const two = scene();
    two.nodes.push(
      { id: "other", type: REGION_NODE_TYPE, parentId: "frame", position: { x: 500, y: 100 }, data: {} },
      { id: "kid2", parentId: "other", position: { x: 10, y: 10 }, data: {} },
    );
    expect(boundaryPath(two, "kid", "kid2")).toEqual({ out: ["region"], in: ["other"], commonAncestor: "frame" });
  });

  it("is empty for an unknown node rather than throwing", () => {
    expect(boundaryPath(scene(), "ghost", "far")).toEqual({ out: [], in: [] });
  });
});

/* ------------------------------------------------------------------ */
/* OFF — the default, and the feature                                  */
/* ------------------------------------------------------------------ */

describe("auto-port OFF: think in terms of public API first", () => {
  it("is the default", () => {
    expect(AUTO_PORT_OFF).toBe("refuse");
  });

  it("refuses, and NAMES every boundary that needs a port", () => {
    const refused = wireAcrossBoundary(scene(), KID, FAR, { mintId: counter("w"), directionOf });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.code).toBe(CROSS_SCOPE);
    expect(refused.refusal.message).toContain('"region"');
    expect(refused.refusal.message).toContain('"frame"');
    expect(refused.refusal.message).toContain("declare the public interface first");
  });

  it("still wires freely inside one scope — the refusal is about BOUNDARIES", () => {
    const nested = scene();
    nested.nodes.push({ id: "sibling", parentId: "region", position: { x: 60, y: 20 }, data: {} });
    const result = wireAcrossBoundary(nested, KID, { nodeId: "sibling", portId: "in" }, { mintId: counter("w"), directionOf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toEqual([]);
    expect(result.scene.edges).toEqual([
      { id: "w1", source: "kid", sourceHandle: "out", target: "sibling", targetHandle: "in" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* ON — punch the ports through                                        */
/* ------------------------------------------------------------------ */

describe("auto-port ON", () => {
  it("builds a hop per boundary, so nothing outside names anything inside", () => {
    const result = wireAcrossBoundary(scene(), KID, FAR, {
      mintId: counter("w"),
      autoPort: "create",
      directionOf,
      typeOf,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.crossed).toEqual(["region", "frame"]);
    expect(result.scene.edges.map((edge) => `${edge.source}/${edge.sourceHandle ?? ""} -> ${edge.target}/${edge.targetHandle ?? ""}`)).toEqual([
      "kid/out -> region/kid/out",
      "region/kid/out -> frame/region/kid/out",
      "frame/region/kid/out -> far/in",
    ]);
    // Isolation: no edge names `kid` from outside `region`.
    expect(result.scene.edges.filter((edge) => edge.target === "kid" || edge.source === "kid")).toHaveLength(1);
  });

  it("carries the datatype onto every intermediate port", () => {
    const result = wireAcrossBoundary(scene(), KID, FAR, { mintId: counter("w"), autoPort: "create", directionOf, typeOf });
    if (!result.ok) throw new Error("refused");
    expect(result.created.map((port) => port.portType)).toEqual(["pose", "pose"]);
    expect(result.created.map((port) => port.direction)).toEqual(["source", "source"]);
  });

  it("PLACES each port where the straight line crosses that container's edge", () => {
    // Zach: "auto-create the intermediate port, placed via the intersection
    // function — best-effort from where the wire or a straight line crosses
    // the edge." No `geometry` given, so the chord between the two
    // endpoints' ABSOLUTE positions stands in.
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
      region: { x: 100, y: 100, w: 200, h: 200 },
      frame: { x: 0, y: 0, w: 600, h: 600 },
    };
    const result = wireAcrossBoundary(scene(), KID, FAR, {
      mintId: counter("w"),
      autoPort: "create",
      directionOf,
      boxOf: (id) => boxes[id],
    });
    if (!result.ok) throw new Error("refused");
    // kid is absolutely at (120,120); far at (900,140). The chord leaves
    // `region` through its right wall and `frame` through its right wall.
    expect(result.created.map((port) => port.side)).toEqual(["right", "right"]);
    expect(result.created.every((port) => port.by === "geometry")).toBe(true);
    expect(result.created.every((port) => port.seat === "rail")).toBe(true);
    // Real, distinct positions along each wall — not a shared default.
    const [inner, outer] = result.created;
    expect(inner.t).toBeGreaterThan(0);
    expect(inner.t).toBeLessThan(1);
    expect(inner.t).not.toBe(outer.t);
  });

  it("falls back to the v1 side when no box is measurable", () => {
    const result = wireAcrossBoundary(scene(), KID, FAR, { mintId: counter("w"), autoPort: "create", directionOf });
    if (!result.ok) throw new Error("refused");
    expect(result.created.every((port) => port.by === "polarity")).toBe(true);
    expect(result.created.every((port) => port.seat === "header")).toBe(true);
    expect(result.created.every((port) => port.t === undefined)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The type gate, and child→parent                                     */
/* ------------------------------------------------------------------ */

describe("the type gate runs once, on the real endpoints", () => {
  it("refuses a mismatch before punching any port", () => {
    const refused = wireAcrossBoundary(scene(), { nodeId: "kid", portId: "rgb" }, FAR, {
      mintId: counter("w"),
      autoPort: "create",
      directionOf,
      typeOf,
      compatible: typesIntersect,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.refusal.code).toBe("type-mismatch");
    expect(refused.refusal.message).toContain("image");
    expect(refused.refusal.message).toContain("pose");
  });

  it("makes no judgement at all without a `compatible` — the kit's convention", () => {
    const result = wireAcrossBoundary(scene(), { nodeId: "kid", portId: "rgb" }, FAR, {
      mintId: counter("w"),
      autoPort: "create",
      directionOf,
      typeOf,
    });
    expect(result.ok).toBe(true);
  });
});

describe("wireChildToParent — never refused", () => {
  it("places a port on the parent and wires the child to it, once", () => {
    const result = wireChildToParent(scene(), KID, "region", { mintId: counter("w"), directionOf, typeOf });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ id: "kid/out", direction: "source", portType: "pose" });
    // ONE edge, not two: the far end IS the container the boundary belongs
    // to, so there is no closing hop to draw. A second edge here would be
    // a self-connection the judge would then have to refuse.
    expect(result.scene.edges).toEqual([
      { id: "w1", source: "kid", sourceHandle: "out", target: "region", targetHandle: "kid/out" },
    ]);
  });

  it("works even with auto-port off — declaring the parent's API is not escaping it", () => {
    const result = wireChildToParent(scene(), KID, "region", { mintId: counter("w"), autoPort: "refuse", directionOf });
    expect(result.ok).toBe(true);
  });
});
