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
import { branchNode, ifElifElseArms, matchCaseArms, matchNode } from "./region.branch";

/**
 * `if fast: estimate() / else: fallback()` (143241).
 *
 * WHY the two `Pose → pose` cables are the whole point of this fixture: the
 * branch has NO output port (Q1/V1), so the join lives at the CONSUMER —
 * `encode`'s single `pose` dot receives one cable per arm, and exactly one of
 * them carries a value on any given run. Fan-in at one ordinary port IS the
 * φ; a yield dot on the region would be a second way to say the same thing.
 *
 * WHY the `fast` cable now lands on the `if` ARM, not on the region (the
 * split, `region.branch.ts`'s header): `ifElifElseArms(["fast"])` puts the
 * boolean on the arm's own `test`, so `src`'s `fast` port feeds the ONE arm
 * that reads it — there is no longer a head card port to feed instead.
 */
export const BRANCH_ONE_INPUT: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 150, h: 116, ports: { right: ["fast", "frame", "gain"] } } },
    ...branchNode({
      id: "br",
      position: { x: 250, y: 24 },
      arms: ifElifElseArms(["fast"]).map((arm) => ({ ...arm, h: arm.id === "if" ? 160 : 140 })),
    }),
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 16 }, data: { name: "estimate()", view: "port", w: 200, h: 112, ports: { left: ["frame", "gain"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "else", position: { x: 180, y: 16 }, data: { name: "fallback()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 850, y: 250 }, data: { name: "encode()", view: "port", w: 160, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    // The condition is an ordinary data cable into the `if` ARM's own
    // operand — the ONE thing that makes this region a branch rather than a
    // group, and it is not a control line (plan §5): nothing here is drawn
    // as containment except the containment itself.
    { id: "e-cond", source: "src", sourceHandle: "fast", target: "if", targetHandle: "if" },
    // Straight into the arms' members, crossing the frame (V1): a region can
    // READ what was defined before it, so the input border needs no ports.
    { id: "e-frame1", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame2", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-gain", source: "src", sourceHandle: "gain", target: "estimate", targetHandle: "gain" },
    { id: "e-out1", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out2", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
};

/**
 * Three conditions, three arms (144504) — REWRITTEN for the split. This is
 * the fixture the report's whole case rests on: three head ports bound to
 * three arms only by VERTICAL COINCIDENCE was the ambiguity ("nothing in
 * the drawing says which port belongs to which arm"). There is no shared
 * subject here — three unrelated booleans, one per arm — so each becomes
 * that arm's OWN `test`, on that arm's own header. The three-way ambiguity
 * is now unrepresentable: a reader (or a test) can see which value belongs
 * to which arm because it is the SAME node.
 */
export const BRANCH_MANY_INPUTS: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 32, y: 24 },
      w: 460,
      arms: [
        { id: "arm-1", title: "arm 1", test: { id: "input_1" }, h: 110 },
        { id: "arm-2", title: "arm 2", test: { id: "input_2" }, h: 110 },
        { id: "arm-3", title: "arm N", test: { id: "input_3" }, h: 110 },
      ],
    }),
    { id: "step-1", type: "block", parentId: "arm-1", position: { x: 170, y: 14 }, data: { name: "first()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
    { id: "step-2", type: "block", parentId: "arm-2", position: { x: 170, y: 14 }, data: { name: "second()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
    { id: "step-3", type: "block", parentId: "arm-3", position: { x: 170, y: 14 }, data: { name: "last()", view: "port", w: 170, h: 64, ports: { left: ["in"], right: ["out"] } } },
  ],
  // Unwired, as drawn (144504: "connected to nothing") — the point of this
  // fixture was always the dots themselves, not a producer for them. What
  // the split fixes is WHOSE dots they are: `input_1`/`input_2`/`input_3`
  // now live on `arm-1`/`arm-2`/`arm-3` respectively, so a wiring edge
  // targeting `{ target: "arm-2", targetHandle: "input_2" }` reads as
  // unambiguous the moment one is drawn — no vertical coincidence left to
  // misread.
  edges: [],
};

/** `match cmd:` — a LabVIEW Case Structure (the split, `region.branch.ts`'s
 *  header): ONE subject on the corner block, arms carrying static PATTERNS
 *  and no operand of their own; `case _:` is just the last arm. */
export const MATCH_CASE: HostScene = {
  nodes: [
    ...matchNode({
      id: "br",
      position: { x: 32, y: 24 },
      w: 460,
      subject: "cmd",
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
    // `mode` feeds BOTH arms that test it — there is no shared head port to
    // land on any more (the split), so `src`'s one `mode` output fans OUT to
    // each arm's own operand, the mirror image of the encode fan-IN below.
    { id: "e-cond-if", source: "src", sourceHandle: "mode", target: "if", targetHandle: "if" },
    { id: "e-cond-elif", source: "src", sourceHandle: "mode", target: "elif", targetHandle: "elif" },
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
      arms: ifElifElseArms(['mode == "fast"']).map((arm) => ({ ...arm, h: arm.id === "if" ? 360 : 130 })),
    }),
    ...branchNode({
      id: "inner",
      parentId: "if",
      position: { x: 190, y: 16 },
      w: 380,
      // WHY the inner arm's `test.id` is left as `ifElifElseArms`'s own
      // "if"/"else" rather than re-prefixed alongside the arm's `id`: a
      // port id only has to be unique WITHIN the node that carries it
      // (`wireLayer.tsx`'s `[data-port-id]` lookup is scoped inside
      // `[data-block-id]`), and each arm is its own node — "inner-if"'s
      // own port being spelled "if" collides with nothing, including the
      // outer `if` arm's identically-spelled "if" port on ITS OWN node.
      arms: ifElifElseArms(["gain > 1.0"]).map((arm) => ({ ...arm, id: `inner-${arm.id}`, h: 96 })),
    }),
    { id: "refine", type: "block", parentId: "inner-if", position: { x: 150, y: 14 }, data: { name: "refine()", view: "port", w: 190, h: 64, ports: { left: ["pose"], right: ["Pose"] } } },
    { id: "keep", type: "block", parentId: "inner-else", position: { x: 150, y: 14 }, data: { name: "keep()", view: "port", w: 190, h: 64, ports: { left: ["pose"], right: ["Pose"] } } },
    { id: "identity", type: "block", parentId: "else", position: { x: 190, y: 16 }, data: { name: "identity()", view: "port", w: 190, h: 64, ports: { left: ["frame"], right: ["Pose"] } } },
  ],
  edges: [],
};
