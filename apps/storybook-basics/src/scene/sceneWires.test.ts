// src/scene/sceneWires.test.ts — lane D of docs/CONTROL-FLOW-PLAN.md: the
// two fields `sceneWires` now DERIVES rather than copies, `through` and
// `badge`. `wiring.test.ts` (the acceptance) pins what `keepOutsFor` does
// with `through`; this file pins where `through` comes from, which is the
// half that lives on the scene side of the adapter.
//
// A node test, not a story: this is pure scene→props derivation with no
// DOM in it at all — the same reason `region.test.ts` beside it is one.

import { describe, expect, it } from "vitest";

import { sceneWires, withWiredState, type WireStyleData } from "./sceneWires";
import type { BlockScene } from "./scene";

/** loop ⊃ arm-if ⊃ merge, with `src` and `bystander` outside — the exact
 *  containment `keepOutsFor`'s own fixture measures boxes for. */
const NESTED: BlockScene<Record<string, unknown>, WireStyleData> = {
  nodes: [
    { id: "src", position: { x: 0, y: 0 }, data: {} },
    { id: "loop", type: "region", position: { x: 200, y: -40 }, data: {} },
    { id: "arm-if", type: "arm", parentId: "loop", position: { x: 0, y: 0 }, data: {} },
    { id: "merge", parentId: "arm-if", position: { x: 60, y: 80 }, data: {} },
    { id: "bystander", position: { x: 300, y: -200 }, data: {} },
  ],
  edges: [
    { id: "e-in", source: "src", sourceHandle: "out", target: "merge", targetHandle: "pose" },
    { id: "e-carry", source: "merge", sourceHandle: "Pose", target: "merge", targetHandle: "pose", data: { variant: "delayed", routing: "elbow" } },
    { id: "e-flat", source: "src", sourceHandle: "out", target: "bystander", targetHandle: "in" },
  ],
};

describe("sceneWires derives `through` from containment", () => {
  it("names both ends' ancestors, nearest first, and nothing else", () => {
    const [into] = sceneWires(NESTED);
    // `src` is top level and contributes none; `merge` contributes its arm
    // then its region — so the cable may enter the frame and THAT arm.
    expect(into.through).toEqual(["arm-if", "loop"]);
  });

  it("dedupes a self-loop's one chain instead of naming it twice", () => {
    const carry = sceneWires(NESTED)[1];
    expect(carry.through).toEqual(["arm-if", "loop"]);
  });

  it("is empty when neither end is contained", () => {
    expect(sceneWires(NESTED)[2].through).toEqual([]);
  });

  it("an edges-only caller still compiles and gets `through: []`", () => {
    // The async gallery's own call shape (`sceneWires({ edges })`) — a flat
    // bench has no containment to read, and saying so beats inventing one.
    const wires = sceneWires({ edges: NESTED.edges });
    expect(wires.map((wire) => wire.through)).toEqual([[], [], []]);
  });

  it("never returns the scene's own arrays", () => {
    const wires = sceneWires(NESTED);
    expect(wires[0].through).not.toBe(wires[1].through);
  });
});

describe("sceneWires derives `badge` (plan Q7 — always draw the pill)", () => {
  it("a delayed cable that names no badge still reads z⁻¹", () => {
    expect(sceneWires(NESTED)[1].badge).toBe("z⁻¹");
  });

  it("an authored badge wins over the derived default, verbatim", () => {
    const wires = sceneWires({
      edges: [{ id: "e", source: "a", target: "b", data: { variant: "delayed", badge: "z⁻¹ = estimate()" } }],
    });
    expect(wires[0].badge).toBe("z⁻¹ = estimate()");
  });

  it("an effect cable's `mut` rides on a plain data variant", () => {
    const wires = sceneWires({ edges: [{ id: "e", source: "a", target: "b", data: { badge: "mut", color: "#d97706" } }] });
    expect(wires[0].badge).toBe("mut");
    expect(wires[0].color).toBe("#d97706");
  });

  it("an ordinary cable has no badge at all", () => {
    expect(sceneWires(NESTED)[0].badge).toBeUndefined();
  });
});

describe("everything sceneWires already did is unchanged", () => {
  it("still maps source/target and the style fields one to one, in order", () => {
    const wires = sceneWires(NESTED);
    expect(wires.map((wire) => wire.id)).toEqual(["e-in", "e-carry", "e-flat"]);
    expect(wires[1].from).toEqual({ blockId: "merge", portId: "Pose" });
    expect(wires[1].to).toEqual({ blockId: "merge", portId: "pose" });
    expect(wires[1].variant).toBe("delayed");
    expect(wires[1].routing).toBe("elbow");
  });

  it("a handle-less end still maps to the empty port id WireLayer reports as unresolved", () => {
    expect(sceneWires({ edges: [{ id: "e", source: "a", target: "b" }] })[0].from.portId).toBe("");
  });

  it("withWiredState is untouched", () => {
    const items = withWiredState([{ id: "in", label: "in" }], "merge", new Set(["merge/in"]));
    expect(items[0].state).toBe("wired");
  });
});
