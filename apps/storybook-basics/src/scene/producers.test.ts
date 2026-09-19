// src/scene/producers.test.ts — `producerCounts`, the number the producer
// badge on a port reports: how many cable ends meet each port (Zach,
// 2026-09-19: "The port only should have 1 connection point in the center.
// Instead you should show the producer circle that has the number for the
// number of arrows intersecting at that port").
//
// Unit project, no DOM. ACCEPTANCE — committed before `producers.ts` exists
// and not to be weakened by the implementation that makes it pass.
import { describe, expect, test } from "vitest";

import { fanWires } from "../components/wiring";
import { producerCounts } from "./producers";
import { portKey, wiredPorts, type SceneEdge } from "./scene";
import { sceneWires, type WireStyleData } from "./sceneWires";

function edge(id: string, from: string, to: string, data?: WireStyleData): SceneEdge<WireStyleData> {
  const [source, sourceHandle] = from.split("/");
  const [target, targetHandle] = to.split("/");
  return { id, source, sourceHandle, target, targetHandle, ...(data ? { data } : {}) };
}

/** Zach's two screenshots in one scene: three cables into `merge/pose`
 *  (`115156`'s fan-in) and `est/pose` feeding three consumers (`115137`'s
 *  fan-out), plus an ordinary one-cable pair. */
const FAN = {
  edges: [
    edge("in-a", "a/out", "merge/pose"),
    edge("in-b", "b/out", "merge/pose"),
    edge("in-c", "c/out", "merge/pose"),
    edge("out-1", "est/pose", "x/in"),
    edge("out-2", "est/pose", "y/in"),
    edge("out-3", "est/pose", "z/in"),
    edge("solo", "merge/Pose", "sink/in"),
  ],
};

describe("producerCounts", () => {
  test("empty scene → empty map (no port is named, so none is counted)", () => {
    expect(producerCounts({ edges: [] })).toEqual(new Map());
  });

  test("fan-in: three cables INTO one port count 3; each producer's own end counts 1", () => {
    const counts = producerCounts(FAN);
    expect(counts.get(portKey("merge", "pose"))).toBe(3);
    expect(counts.get(portKey("a", "out"))).toBe(1);
    expect(counts.get(portKey("b", "out"))).toBe(1);
    expect(counts.get(portKey("c", "out"))).toBe(1);
  });

  test("fan-out: three cables OUT of one port count 3 too — the badge counts arrows at the dot, in and out", () => {
    const counts = producerCounts(FAN);
    expect(counts.get(portKey("est", "pose"))).toBe(3);
    for (const consumer of ["x", "y", "z"]) expect(counts.get(portKey(consumer, "in"))).toBe(1);
  });

  test("the whole map, exactly — no port is invented and none is dropped", () => {
    expect(producerCounts(FAN)).toEqual(
      new Map([
        ["a/out", 1],
        ["merge/pose", 3],
        ["b/out", 1],
        ["c/out", 1],
        ["est/pose", 3],
        ["x/in", 1],
        ["y/in", 1],
        ["z/in", 1],
        ["merge/Pose", 1],
        ["sink/in", 1],
      ]),
    );
  });

  test("keys are exactly `wiredPorts` — the badge and the wired state can never disagree about which ports are wired", () => {
    expect(new Set(producerCounts(FAN).keys())).toEqual(wiredPorts(FAN));
  });

  test("every edge kind counts — data, async, delayed, a coloured/pilled effect cable — the function never reads `data`", () => {
    const kinds = {
      edges: [
        edge("k-data", "a/out", "m/in", { variant: "data" }),
        edge("k-async", "b/out", "m/in", { variant: "async" }),
        edge("k-delayed", "c/out", "m/in", { variant: "delayed" }),
        edge("k-effect", "d/out", "m/in", { color: "#c2410c", badge: "mut" }),
        edge("k-plain", "e/out", "m/in"),
      ],
    };
    expect(producerCounts(kinds).get("m/in")).toBe(5);
  });

  test("duplicates between the same two ports are separate cables: both ends count 2", () => {
    const scene = { edges: [edge("d1", "a/out", "b/in"), edge("d2", "a/out", "b/in")] };
    expect(producerCounts(scene)).toEqual(new Map([["a/out", 2], ["b/in", 2]]));
  });

  test("an end with no handle wires the NODE, not a port — it counts nowhere (wiredPorts' own rule); React Flow's `null` reads the same", () => {
    const scene = {
      edges: [
        { id: "n1", source: "a", target: "b", targetHandle: "in" },
        { id: "n2", source: "a", sourceHandle: null, target: "b", targetHandle: null },
        { id: "n3", source: "c", sourceHandle: "out", target: "b", targetHandle: "in" },
      ],
    };
    expect(producerCounts(scene)).toEqual(new Map([["b/in", 2], ["c/out", 1]]));
  });

  test("ports are namespaced to their node: `in` on two nodes are two ports", () => {
    const scene = { edges: [edge("p1", "a/out", "b/in"), edge("p2", "a/out", "c/in")] };
    const counts = producerCounts(scene);
    expect(counts.get("b/in")).toBe(1);
    expect(counts.get("c/in")).toBe(1);
    expect(counts.get("a/out")).toBe(2);
  });

  test("a cable from a port back to the SAME port counts both of its ends (two line ends meet that dot)", () => {
    expect(producerCounts({ edges: [edge("loop", "m/p", "m/p")] })).toEqual(new Map([["m/p", 2]]));
  });

  test("a carried-value cable between two ports of one block counts once at each", () => {
    expect(producerCounts({ edges: [edge("carry", "merge/Pose", "merge/pose")] })).toEqual(new Map([["merge/Pose", 1], ["merge/pose", 1]]));
  });

  test("pure: the input is not mutated and a fresh map comes back per call", () => {
    const frozen = { edges: Object.freeze(FAN.edges.map((e) => Object.freeze({ ...e }))) };
    const first = producerCounts(frozen);
    const second = producerCounts(frozen);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  test("agrees with `fanWires`' grouping: summing each port's distinct-pair `count` gives the same number", () => {
    // `wiring.ts` keeps `fanWires` precisely so "how many cables meet here"
    // has one definition of a duplicate. Summed per port over the distinct
    // unordered pairs touching it, its `count` must reproduce the badge —
    // if the two ever disagree, a future "which duplicate am I" affordance
    // and the number on the dot would tell the reader different stories.
    const scene = {
      edges: [
        ...FAN.edges,
        edge("dup-1", "a/out", "q/in"),
        edge("dup-2", "a/out", "q/in"),
        edge("rev", "q/in", "a/out"),
      ],
    };
    const wires = sceneWires(scene);
    const fans = fanWires(wires);
    const summed = new Map<string, number>();
    const seenPair = new Set<string>();
    wires.forEach((wire, index) => {
      const ends = [`${wire.from.blockId}/${wire.from.portId}`, `${wire.to.blockId}/${wire.to.portId}`].sort();
      const pair = ends.join("|");
      if (seenPair.has(pair)) return;
      seenPair.add(pair);
      for (const end of new Set(ends)) summed.set(end, (summed.get(end) ?? 0) + fans[index].count);
    });
    expect(producerCounts(scene)).toEqual(summed);
    expect(producerCounts(scene).get("a/out")).toBe(4);
    expect(producerCounts(scene).get("q/in")).toBe(3);
  });
});
