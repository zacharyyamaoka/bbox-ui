// src/scene/producers.ts — how many cables meet each port: the number the
// producer badge on a port dot reports.
//
// Zach, 2026-09-19, on three cables leaving one `pose` dot at three stacked
// offsets: "very bad. edges should always leave from the center of the
// port… The port only should have 1 connection point in the center. Instead
// you should show the producer circle that has the number for the number of
// arrows intersecting at that port." Lane `fix-edges` made every cable land
// on the dot's centre; that makes N cables at one dot LOOK like one, so the
// count is now the only thing that says how many there are. One centre
// attach point + this number is the whole language for fan-in and fan-out.
//
// Pure scene kit: imports nothing but `./scene`, reads only edge ENDS, so it
// runs unchanged on a `BlockScene`, a React Flow store's `edges`, or the
// app's derived `DocumentScene` (the same structural-slice rule every
// function in `scene.ts` follows). The view kit never sees this file — a
// host calls it once per render and hands each port item its number
// (`PortEdgeItem.producers`), and `Port` draws what it is handed.

import { portKey, type SceneEdgeEnds } from "./scene";

/**
 * `portKey(nodeId, handle)` → how many edge ENDS name that port. Only ports
 * with at least one end appear (a port nobody wires is simply absent, which
 * reads as 0 — the same "unknown port has none" totality as `producersOf`),
 * so the key set is exactly `wiredPorts(scene)`.
 *
 * WHY "producers" counts consumers too — in AND out, not just the edges
 * writing INTO a port (`producersOf`' narrower dataflow sense): Zach's own
 * words define the number as "the number of arrows intersecting at that
 * port", and his two screenshots were one of each — three cables LEAVING
 * `pose` (fan-out, `115137`) and two ENTERING a port (fan-in, `115156`). The
 * reader's question at a dot is "how many lines meet here", which a
 * direction filter would answer wrongly for every output port.
 *
 * WHY every edge KIND counts — data, async, delayed (z⁻¹), an effect cable
 * with its `mut` pill — and this function never reads `edge.data`: each one
 * is a drawn arrow ending on the same centre point, so each one is exactly
 * what the eye cannot separate without the number. A count that skipped a
 * kind would disagree with the picture it exists to explain, and it would be
 * a second, silent opinion about which cables matter. Control flow is not
 * excluded here because it never gets here: it is structure (arms,
 * containment) and marks, never a `SceneEdge` ("never mix data and control
 * lines"), so there is no control cable to leave out.
 *
 * Counting rules, each pinned by `producers.test.ts`:
 *   - an end with no handle wires the NODE, not a port — it counts nowhere
 *     (`wiredPorts`' own rule; React Flow's `null` reads the same);
 *   - duplicates between the same two ports are separate cables and each
 *     counts — they are the case the old per-cable fan drew apart, and the
 *     per-port sum of `wiring.ts`'s `fanWires` pair counts reproduces this
 *     number, so the badge and that grouping share one idea of a duplicate;
 *   - a cable from a port back to that SAME port counts twice: both of its
 *     line ends meet that dot, and the count is of what meets the dot.
 *
 * Returns a fresh `Map` per call and never mutates its input.
 */
export function producerCounts(scene: { edges: readonly SceneEdgeEnds[] }): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (nodeId: string, handle: string | null | undefined) => {
    if (handle == null) return;
    const key = portKey(nodeId, handle);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const edge of scene.edges) {
    bump(edge.source, edge.sourceHandle);
    bump(edge.target, edge.targetHandle);
  }
  return counts;
}
