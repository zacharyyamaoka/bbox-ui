// src/hosts/validationScene.ts — ONE fixture shared by the validation-
// stack's host stories (`ValidityPreview.stories.tsx`'s DOM Canvas bench,
// `ValidationHosts.stories.tsx`'s React Flow and tldraw benches) — ruling
// 8's own success criterion, Zach verbatim: "success looks like many
// different stories of DOM canvas for some of the static considerations,
// but then also the same examples in a host reactflow/tldraw so I can
// check that the gestures still transfer."
//
// A COPY per host is exactly what made that claim unfalsifiable before
// this file existed: `ValidityPreview.stories.tsx`'s `VP_SCENE` (4 nodes,
// `sink/in` pre-wired to 2 producers at rest — the at-rest many-to-one
// grammar's own fixture) and `ValidationHosts.stories.tsx`'s `VH_SCENE` (3
// nodes, `sink/in` wired to ZERO) disagreed on the one port both stories
// name. The SAME named port — `sink/in` — read `"unavailable"` in one host
// and `"available"` in the other for the identical gesture (dragging from
// `num1/out`), so "does the gesture transfer" proved nothing: the two
// benches were answering a different question. One literal, imported by
// both, is what makes the comparison provable again — the DOM Canvas
// bench keeps the richer fixture (four nodes, the at-rest grammar, the
// legal SECOND input `in2`) and the other hosts adopt it unchanged.
//
// Also exports `validationDirectionOf` — `hostPolarityOf` bound to this
// scene — so both stories can wire `connectionAvailability`'s
// `directionOf` option and demonstrate the polarity fix
// (docs/peps/0002-the-judge-owns-edge-orientation.md) live: `num1`/`num2`
// are both SOURCES (right wall), so dragging from one now correctly
// refuses the other, in every host.
import { hostPolarityOf, type HostScene } from "./hostScene";
import type { PortTypeOf, PortsOf } from "../scene/lint";

export const VALIDATION_SCENE: HostScene = {
  nodes: [
    { id: "num1", type: "block", position: { x: 16, y: 16 }, data: { name: "num1", view: "port", w: 132, h: 60, ports: { right: ["out"] } } },
    { id: "num2", type: "block", position: { x: 16, y: 232 }, data: { name: "num2", view: "port", w: 132, h: 60, ports: { right: ["out"] } } },
    { id: "str", type: "block", position: { x: 16, y: 124 }, data: { name: "str", view: "port", w: 132, h: 60, ports: { right: ["out"] } } },
    // Two input ports, deliberately: `in` is ALREADY over-subscribed (the
    // at-rest grammar's own fixture) and stays that way through every
    // gesture; `in2` is the empty, legal DRAG target — a port already
    // sitting at 2+ producers can never read "available" again (any
    // further candidate keeps `distinctSources.size >= 2`, `lint.ts`'s
    // own many-to-one rule, correctly), so testing the legal-target path
    // needs a port that isn't the one already broken.
    { id: "sink", type: "block", position: { x: 380, y: 124 }, data: { name: "sink", view: "port", w: 132, h: 80, ports: { left: ["in", "in2"] } } },
  ],
  edges: [
    // Both already wired into `in` — many-to-one from the first render, at
    // rest, and untouched by any gesture (`in2` is the drag target).
    { id: "e-num1-sink", source: "num1", sourceHandle: "out", target: "sink", targetHandle: "in" },
    { id: "e-num2-sink", source: "num2", sourceHandle: "out", target: "sink", targetHandle: "in" },
  ],
};

export const validationTypeOf: PortTypeOf = (ref) => {
  if (ref.nodeId === "num1" || ref.nodeId === "num2") return ["number"];
  if (ref.nodeId === "str") return ["string"];
  if (ref.nodeId === "sink") return ["number"];
  return undefined;
};

export const validationPortsOf: PortsOf = (nodeId) => {
  const node = VALIDATION_SCENE.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined;
  return Object.values(node.data.ports ?? {}).flat();
};

/** Wall-based polarity for this fixture — `num1`/`num2`/`str`'s `out` are
 *  SOURCES (right wall), `sink`'s `in`/`in2` are SINKS (left wall). Bound
 *  once, here, rather than re-derived per story: `hostPolarityOf` reads
 *  `VALIDATION_SCENE`'s node records, which never change shape (only
 *  `edges` grows as a gesture commits), so one instance is correct for
 *  every consumer. */
export const validationDirectionOf = hostPolarityOf(VALIDATION_SCENE);
