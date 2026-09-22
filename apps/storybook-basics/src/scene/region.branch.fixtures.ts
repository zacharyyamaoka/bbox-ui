// src/scene/region.branch.fixtures.ts — the boards Zach drew, as scene
// records. Each one is a whole `HostScene` a story mounts unchanged, so the
// DOM canvas, React Flow and tldraw all read the SAME literal (the device
// `hosts/hostScene.ts` established: a copy per host is how two benches start
// rendering their own truth).
//
// The reference boards, opened and copied rather than recalled:
//   `Pasted image 20260918143241.png`  BRANCH_ONE_INPUT — one condition, two
//                                      arms, both results landing on ONE dot
//   `Pasted image 20260918144504.png`  BRANCH_MANY_INPUTS — three conditions,
//                                      three arms
//   `Pasted image 20260918144705.png`  BRANCH_NESTED — arm 1 holds a whole
//                                      second branch with its own arms
//   `Pasted image 20260918145419.png`  BRANCH_FOLDED / BRANCH_ACTIVE — the
//                                      shipped SystemSketch board
//
// Every member is an ordinary `type: "block"` node with `view: "port"` and an
// explicit `w`/`h`, positioned in ITS ARM's space (scene.ts:60-72) — never in
// the region's and never in the canvas's.

import type { HostScene } from "../hosts/hostScene";
import { branchNode, ifElifElseArms, matchCaseArms } from "./region.branch";

/**
 * `if fast: estimate() / else: fallback()` (143241).
 *
 * WHY the two `Pose → pose` cables are the whole point of this fixture: the
 * branch has NO output port (Q1/V1), so the join lives at the CONSUMER —
 * `encode`'s single `pose` dot receives one cable per arm, and exactly one of
 * them carries a value on any given run. Fan-in at one ordinary port IS the
 * φ; a yield dot on the region would be a second way to say the same thing.
 */
export const BRANCH_ONE_INPUT: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 150, h: 116, ports: { right: ["fast", "frame", "gain"] } } },
    ...branchNode({
      id: "br",
      position: { x: 250, y: 24 },
      conditions: ["fast"],
      arms: ifElifElseArms(["fast"]).map((arm) => ({ ...arm, h: arm.id === "if" ? 160 : 140 })),
    }),
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 16 }, data: { name: "estimate()", view: "port", w: 200, h: 112, ports: { left: ["frame", "gain"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "else", position: { x: 180, y: 16 }, data: { name: "fallback()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 850, y: 250 }, data: { name: "encode()", view: "port", w: 160, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    // The condition is an ordinary data cable into an ordinary port — the
    // ONE thing that makes this region a branch rather than a group, and it
    // is not a control line (plan §5): nothing here is drawn as containment
    // except the containment itself.
    { id: "e-cond", source: "src", sourceHandle: "fast", target: "br", targetHandle: "fast" },
    // Straight into the arms' members, crossing the frame (V1): a region can
    // READ what was defined before it, so the input border needs no ports.
    { id: "e-frame1", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame2", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-gain", source: "src", sourceHandle: "gain", target: "estimate", targetHandle: "gain" },
    { id: "e-out1", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out2", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
};

/** Three conditions, three arms (144504) — the corner block's left wall is
 *  the whole interface, however many values the branch decides on. */
export const BRANCH_MANY_INPUTS: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 32, y: 24 },
      w: 460,
      conditions: ["input_1", "input_2", "input_3"],
      arms: [
        { id: "arm-1", title: "arm 1", h: 110 },
        { id: "arm-2", title: "arm 2", h: 110 },
        { id: "arm-3", title: "arm N", h: 110 },
      ],
    }),
    { id: "step-1", type: "block", parentId: "arm-1", position: { x: 170, y: 14 }, data: { name: "first()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
    { id: "step-2", type: "block", parentId: "arm-2", position: { x: 170, y: 14 }, data: { name: "second()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
    { id: "step-3", type: "block", parentId: "arm-3", position: { x: 170, y: 14 }, data: { name: "last()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
  ],
  edges: [],
};

/** `match cmd:` — the same region, the same arm rows, different titles. The
 *  subject rides the corner block as a condition port exactly as an `if`'s
 *  does; `case _:` is just the last arm. */
export const MATCH_CASE: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 32, y: 24 },
      w: 460,
      conditions: ["cmd"],
      arms: matchCaseArms(['"go"', '"stop"']).map((arm) => ({ ...arm, h: 110 })),
    }),
    { id: "start", type: "block", parentId: "case-1", position: { x: 170, y: 14 }, data: { name: "start()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
    { id: "halt", type: "block", parentId: "case-2", position: { x: 170, y: 14 }, data: { name: "halt()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
    { id: "ignore", type: "block", parentId: "case-_", position: { x: 170, y: 14 }, data: { name: "ignore()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
  ],
  edges: [],
};

/* ------------------------------------------------------------------ */
/* The shipped board (145419), twice: one field apart                   */
/* ------------------------------------------------------------------ */

/** `if mode == "fast": / elif mode == "safe": / else:` — the arms the
 *  SystemSketch board ships, minus its nested inner branch (that one is
 *  `BRANCH_NESTED`). */
const THREE_ARM_CONDITIONS = ['mode == "fast"', 'mode == "safe"'];

/** The blocks and cables `BRANCH_FOLDED` and `BRANCH_ACTIVE` share verbatim —
 *  restated here ONCE so the two fixtures differ only in the single field
 *  each is named for (`arm.open`; `region.activeArm`). That is the claim
 *  worth being able to see: a fold and a fade are one field, not a redraw. */
const THREE_ARM_REST = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 180 }, data: { name: "src", view: "port", w: 150, h: 92, ports: { right: ["mode", "frame"] } } },
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 16 }, data: { name: "estimate()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "elif", position: { x: 180, y: 16 }, data: { name: "fallback()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "identity", type: "block", parentId: "else", position: { x: 180, y: 16 }, data: { name: "identity()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 850, y: 250 }, data: { name: "encode()", view: "port", w: 160, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-cond", source: "src", sourceHandle: "mode", target: "br", targetHandle: "mode" },
    { id: "e-frame-if", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame-elif", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-frame-else", source: "src", sourceHandle: "frame", target: "identity", targetHandle: "frame" },
    // Three arms, three cables, ONE dot on `encode` — the join scales with
    // the arms and stays an ordinary port.
    { id: "e-out-if", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-elif", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-else", source: "identity", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
} satisfies Pick<HostScene, "nodes" | "edges">;

/** The `elif` arm folded: `data.arm.open === false` on that ONE node. A
 *  folded arm's body leaves the DOM, so its member's dots are gone and the
 *  cables that ended there report themselves unresolved rather than guessing
 *  an anchor — computed fold tunnels (DP - Branch) are a follow-up, not a
 *  silent invention here. */
export const BRANCH_FOLDED: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 250, y: 24 },
      conditions: ["mode"],
      arms: ifElifElseArms(THREE_ARM_CONDITIONS).map((arm) => ({ ...arm, h: 120, ...(arm.id === "elif" ? { open: false } : null) })),
    }),
    ...THREE_ARM_REST.nodes,
  ],
  edges: THREE_ARM_REST.edges,
};

/** The same board with `region.activeArm: "if"`: every other row fades to
 *  `REGION_ARM_FADE_OPACITY`. The reading burden V1 moved off the ports and
 *  onto a lens — this is that lens, and it is one field. */
export const BRANCH_ACTIVE: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 250, y: 24 },
      conditions: ["mode"],
      activeArm: "if",
      arms: ifElifElseArms(THREE_ARM_CONDITIONS).map((arm) => ({ ...arm, h: 120 })),
    }),
    ...THREE_ARM_REST.nodes,
  ],
  edges: THREE_ARM_REST.edges,
};

/**
 * A branch inside a branch's arm (144705, and the shipped board's `elif`).
 *
 * WHY the inner region's `parentId` is the ARM (`if`) and never the region
 * (`br`): a member of a region and a member of an ARM are different
 * containments, and only the second one folds, fades and re-stacks with its
 * row. Parenting the inner branch at `br` would draw it in the region's free
 * body — outside every arm — which is a scope the program does not have.
 * Its `position` is therefore in the arm's space too, like any other member.
 *
 * The inner arm ids are prefixed because a scene node id is GLOBAL: two
 * branches both minting `if`/`else` would be one id twice, and `childrenOf`
 * would hand the outer region's row the inner region's members.
 */
export const BRANCH_NESTED: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 32, y: 24 },
      w: 620,
      conditions: ["mode"],
      arms: ifElifElseArms(['mode == "fast"']).map((arm) => ({ ...arm, h: arm.id === "if" ? 360 : 130 })),
    }),
    ...branchNode({
      id: "inner",
      parentId: "if",
      position: { x: 190, y: 16 },
      w: 380,
      conditions: ["gain"],
      arms: ifElifElseArms(["gain > 1.0"]).map((arm) => ({ ...arm, id: `inner-${arm.id}`, h: 96 })),
    }),
    { id: "refine", type: "block", parentId: "inner-if", position: { x: 150, y: 14 }, data: { name: "refine()", view: "port", w: 190, h: 64, ports: { left: ["pose"], right: ["Pose"] } } },
    { id: "keep", type: "block", parentId: "inner-else", position: { x: 150, y: 14 }, data: { name: "keep()", view: "port", w: 190, h: 64, ports: { left: ["pose"], right: ["Pose"] } } },
    { id: "identity", type: "block", parentId: "else", position: { x: 190, y: 16 }, data: { name: "identity()", view: "port", w: 190, h: 64, ports: { left: ["frame"], right: ["Pose"] } } },
  ],
  edges: [],
};
