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
//
// `region.branch.test.ts` (this lane's own unit suite) pins the exact shape
// of the six fixtures below — do not rename or restructure them; every
// consumer outside this lane (`ControlFlowChevronPresses.stories.tsx`,
// `ControlFlowGallery.stories.tsx`, `TraceDefaults.stories.tsx`, and that
// test file) imports them by these names. New scenarios below the divider
// are ADDITIONS, not replacements — the truthful-branching viz work
// (`reports/media/truthful-branching-2026-09-22.html`) needed boards these
// six do not cover (a genuinely wired predicate with no inline default, the
// five-arm ladder Zach named, `match`'s captures and guard), not a redraw of
// what already ships.

import type { HostScene } from "../hosts/hostScene";
import { armNode, branchNode, ifElifElseArms, matchCaseArms, matchNode, type BranchArmSpec } from "./region.branch";

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
 *  and no operand of their own; `case _:` is just the last arm. `src`'s
 *  `cmd` port wires straight onto the region's own corner dot — the subject
 *  the truthful-branching viz work asked every `match` scenario to show
 *  live, not just declared in `region.data.ports`. */
export const MATCH_CASE: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 130, h: 64, ports: { right: ["cmd"] } } },
    ...matchNode({
      id: "br",
      position: { x: 220, y: 24 },
      w: 460,
      subject: "cmd",
      arms: matchCaseArms(['"go"', '"stop"']).map((arm) => ({ ...arm, h: 110 })),
    }),
    { id: "start", type: "block", parentId: "case-1", position: { x: 170, y: 14 }, data: { name: "start()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
    { id: "halt", type: "block", parentId: "case-2", position: { x: 170, y: 14 }, data: { name: "halt()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
    { id: "ignore", type: "block", parentId: "case-_", position: { x: 170, y: 14 }, data: { name: "ignore()", view: "port", w: 170, h: 64, ports: { left: ["cmd"], right: ["ok"] } } },
  ],
  edges: [{ id: "e-subject", source: "src", sourceHandle: "cmd", target: "br", targetHandle: "cmd" }],
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

/* ==================================================================== */
/* Below this line: new boards for the truthful-branching viz work       */
/* (reports/media/truthful-branching-2026-09-22.html) — none of the six  */
/* fixtures above are touched by anything past this point.               */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/* Branch: the SUPPLIED/UNSUPPLIED pair, and the five-arm ladder        */
/* ------------------------------------------------------------------ */

/**
 * `if mode == "fast": estimate() / else: fallback()` — the test SUPPLIED by
 * a real `==` block, not a string (report §3.2, "SUPPLIED"). `cmp`'s own
 * two inputs (`src`'s `mode`, the literal `"fast"`) feed its `bool` output,
 * which is what actually lands on the `if` arm's dot — nothing here writes
 * `test.default`, so the arm shows an empty dot with a real cable landing
 * on it, never inline text pretending to be live.
 */
export const BRANCH_IF_ELSE_WIRED: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 210 }, data: { name: "src", view: "port", w: 130, h: 92, ports: { right: ["mode", "frame"] } } },
    { id: "lit-fast", type: "block", position: { x: 190, y: 330 }, data: { name: '"fast"', view: "port", w: 100, h: 56, ports: { right: ["value"] } } },
    { id: "cmp", type: "block", position: { x: 190, y: 150 }, data: { name: "==", view: "port", w: 110, h: 96, ports: { left: ["a", "b"], right: ["bool"] } } },
    ...branchNode({
      id: "br",
      position: { x: 380, y: 24 },
      arms: [
        { id: "if", title: "if:", test: { id: "if" } },
        { id: "else", title: "else:" },
      ],
    }),
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 16 }, data: { name: "estimate()", view: "port", w: 200, h: 112, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "else", position: { x: 180, y: 16 }, data: { name: "fallback()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 980, y: 260 }, data: { name: "encode()", view: "port", w: 160, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-mode", source: "src", sourceHandle: "mode", target: "cmp", targetHandle: "a" },
    { id: "e-lit", source: "lit-fast", sourceHandle: "value", target: "cmp", targetHandle: "b" },
    { id: "e-cond", source: "cmp", sourceHandle: "bool", target: "if", targetHandle: "if" },
    { id: "e-frame1", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame2", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-out1", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out2", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
};

/**
 * The same board, UNSUPPLIED (report §3.2): nothing wired, so `mode ==
 * "fast"` rides the `if` arm's own dot as its `PortState "valueSet"` inline
 * default — Zach's "default variables in the title". Truthful rendering
 * keeps the spaces and the quotes verbatim; `armProjection.test.ts` pins
 * the same string surviving the scene→host trip, this fixture is what a
 * reader actually sees.
 */
export const BRANCH_IF_ELSE_DEFAULT: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 130, h: 64, ports: { right: ["frame"] } } },
    ...branchNode({ id: "br", position: { x: 250, y: 24 }, arms: ifElifElseArms(['mode == "fast"']) }),
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 16 }, data: { name: "estimate()", view: "port", w: 200, h: 96, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "else", position: { x: 180, y: 16 }, data: { name: "fallback()", view: "port", w: 200, h: 86, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 850, y: 250 }, data: { name: "encode()", view: "port", w: 160, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-frame1", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame2", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-out1", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out2", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
};

/** The four conditions shared by every five-arm-ladder fixture below, so
 *  DEFAULT / WIRED / MIXED differ only in HOW each becomes true, never in
 *  what they say — the same discipline `THREE_ARM_REST` above uses to keep
 *  a fold and a fade comparable to one field. */
const LADDER_CONDITIONS = ['mode == "fast"', 'mode == "safe"', "count > 10", "retries == 0"];

/** The members and fan-in every ladder fixture shares — five arms, five
 *  bodies, one join at `encode`, exactly `BRANCH_ONE_INPUT`'s φ scaled up
 *  (Q1/V1: still no yield port, still one ordinary consumer dot). */
const LADDER_REST = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 360 }, data: { name: "src", view: "port", w: 150, h: 150, ports: { right: ["mode", "count", "retries", "frame"] } } },
    { id: "estimate", type: "block", parentId: "if", position: { x: 180, y: 14 }, data: { name: "estimate()", view: "port", w: 200, h: 78, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "fallback", type: "block", parentId: "elif", position: { x: 180, y: 14 }, data: { name: "fallback()", view: "port", w: 200, h: 78, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "retry", type: "block", parentId: "elif-2", position: { x: 180, y: 14 }, data: { name: "retry()", view: "port", w: 200, h: 78, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "reset", type: "block", parentId: "elif-3", position: { x: 180, y: 14 }, data: { name: "reset()", view: "port", w: 200, h: 78, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "identity", type: "block", parentId: "else", position: { x: 180, y: 14 }, data: { name: "identity()", view: "port", w: 200, h: 78, ports: { left: ["frame"], right: ["Pose"] } } },
    { id: "encode", type: "block", position: { x: 1000, y: 440 }, data: { name: "encode()", view: "port", w: 170, h: 86, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-frame-if", source: "src", sourceHandle: "frame", target: "estimate", targetHandle: "frame" },
    { id: "e-frame-elif", source: "src", sourceHandle: "frame", target: "fallback", targetHandle: "frame" },
    { id: "e-frame-elif2", source: "src", sourceHandle: "frame", target: "retry", targetHandle: "frame" },
    { id: "e-frame-elif3", source: "src", sourceHandle: "frame", target: "reset", targetHandle: "frame" },
    { id: "e-frame-else", source: "src", sourceHandle: "frame", target: "identity", targetHandle: "frame" },
    { id: "e-out-if", source: "estimate", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-elif", source: "fallback", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-elif2", source: "retry", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-elif3", source: "reset", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
    { id: "e-out-else", source: "identity", sourceHandle: "Pose", target: "encode", targetHandle: "pose" },
  ],
} satisfies Pick<HostScene, "nodes" | "edges">;

/** `if` / `elif` / `elif` / `elif` / `else` (Zach named this ladder
 *  explicitly) — every test its own inline default, none wired. Ids come
 *  from `ifElifElseArms` itself: `if`, `elif`, `elif-2`, `elif-3`, `else`. */
export const BRANCH_LADDER_DEFAULT: HostScene = {
  nodes: [
    ...branchNode({ id: "br", position: { x: 250, y: 24 }, w: 560, arms: ifElifElseArms(LADDER_CONDITIONS).map((arm) => ({ ...arm, h: 120 })) }),
    ...LADDER_REST.nodes,
  ],
  edges: LADDER_REST.edges,
};

/** The same five arms, every test WIRED — one small predicate block per
 *  arm, each named for the boolean it computes (report §3.2's own device:
 *  the SAME expression, only whether a cable lands differs) and fed from
 *  `src`'s raw signals. No arm here carries a `default` — an empty dot
 *  with a real cable landing on it is the truthful form. Also the fixture
 *  the "through a host" stories mount, to prove `hosts/nodeViews.tsx`
 *  projects both `arm.data.arm.test` AND its wire onto every canvas host. */
export const BRANCH_LADDER_WIRED: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 460, y: 24 },
      w: 560,
      arms: [
        { id: "if", title: "if:", test: { id: "if" }, h: 120 },
        { id: "elif", title: "elif:", test: { id: "elif" }, h: 120 },
        { id: "elif-2", title: "elif:", test: { id: "elif-2" }, h: 120 },
        { id: "elif-3", title: "elif:", test: { id: "elif-3" }, h: 120 },
        { id: "else", title: "else:", h: 120 },
      ],
    }),
    { id: "is-fast", type: "block", position: { x: 190, y: 20 }, data: { name: 'mode == "fast"', view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    { id: "is-safe", type: "block", position: { x: 190, y: 120 }, data: { name: 'mode == "safe"', view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    { id: "many-retries", type: "block", position: { x: 190, y: 220 }, data: { name: "count > 10", view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    { id: "no-retries", type: "block", position: { x: 190, y: 320 }, data: { name: "retries == 0", view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    ...LADDER_REST.nodes,
  ],
  edges: [
    { id: "e-mode-1", source: "src", sourceHandle: "mode", target: "is-fast", targetHandle: "in" },
    { id: "e-mode-2", source: "src", sourceHandle: "mode", target: "is-safe", targetHandle: "in" },
    { id: "e-count", source: "src", sourceHandle: "count", target: "many-retries", targetHandle: "in" },
    { id: "e-retries", source: "src", sourceHandle: "retries", target: "no-retries", targetHandle: "in" },
    { id: "e-cond-if", source: "is-fast", sourceHandle: "bool", target: "if", targetHandle: "if" },
    { id: "e-cond-elif", source: "is-safe", sourceHandle: "bool", target: "elif", targetHandle: "elif" },
    { id: "e-cond-elif2", source: "many-retries", sourceHandle: "bool", target: "elif-2", targetHandle: "elif-2" },
    { id: "e-cond-elif3", source: "no-retries", sourceHandle: "bool", target: "elif-3", targetHandle: "elif-3" },
    ...LADDER_REST.edges,
  ],
};

/** MIXED: `if`/`elif` wired from real blocks, `elif-2`/`elif-3` inline
 *  defaults, `else` neither — proving the two forms coexist arm by arm on
 *  ONE ladder, not just across two separate boards. */
export const BRANCH_LADDER_MIXED: HostScene = {
  nodes: [
    ...branchNode({
      id: "br",
      position: { x: 460, y: 24 },
      w: 560,
      arms: [
        { id: "if", title: "if:", test: { id: "if" }, h: 120 },
        { id: "elif", title: "elif:", test: { id: "elif" }, h: 120 },
        { id: "elif-2", title: "elif:", test: { id: "elif-2", default: LADDER_CONDITIONS[2] }, h: 120 },
        { id: "elif-3", title: "elif:", test: { id: "elif-3", default: LADDER_CONDITIONS[3] }, h: 120 },
        { id: "else", title: "else:", h: 120 },
      ],
    }),
    { id: "is-fast", type: "block", position: { x: 190, y: 20 }, data: { name: 'mode == "fast"', view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    { id: "is-safe", type: "block", position: { x: 190, y: 120 }, data: { name: 'mode == "safe"', view: "port", w: 190, h: 64, ports: { left: ["in"], right: ["bool"] } } },
    ...LADDER_REST.nodes,
  ],
  edges: [
    { id: "e-mode-1", source: "src", sourceHandle: "mode", target: "is-fast", targetHandle: "in" },
    { id: "e-mode-2", source: "src", sourceHandle: "mode", target: "is-safe", targetHandle: "in" },
    { id: "e-cond-if", source: "is-fast", sourceHandle: "bool", target: "if", targetHandle: "if" },
    { id: "e-cond-elif", source: "is-safe", sourceHandle: "bool", target: "elif", targetHandle: "elif" },
    ...LADDER_REST.edges,
  ],
};

/* ------------------------------------------------------------------ */
/* Match: captures and the guard                                       */
/* ------------------------------------------------------------------ */

/**
 * `match pt: case Point(x=0, y=y): north(y) case Point(): other() case _:
 * ignore()` (report §3.3) — a pattern that BINDS as well as tests. `y` is a
 * value the HEADER produces INTO the arm, so it rides the arm's own RIGHT
 * wall (an output, the tab's own "facing right, facing out") — never the
 * subject's wall, and never a test: `case-1` carries `captures`, nothing
 * else.
 */
export const MATCH_CAPTURE: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 130, h: 64, ports: { right: ["pt"] } } },
    ...matchNode({
      id: "match",
      position: { x: 220, y: 24 },
      w: 460,
      subject: "pt",
      arms: [
        { id: "case-1", title: "case Point(x=0, y=y):", captures: ["y"], h: 120 },
        { id: "case-2", title: "case Point():", h: 90 },
        { id: "case-_", title: "case _:", h: 90 },
      ],
    }),
    { id: "north", type: "block", parentId: "case-1", position: { x: 200, y: 20 }, data: { name: "north()", view: "port", w: 170, h: 72, ports: { left: ["y"], right: ["ok"] } } },
    { id: "other", type: "block", parentId: "case-2", position: { x: 170, y: 12 }, data: { name: "other()", view: "port", w: 150, h: 56, ports: { right: ["ok"] } } },
    { id: "ignore", type: "block", parentId: "case-_", position: { x: 170, y: 12 }, data: { name: "ignore()", view: "port", w: 150, h: 56, ports: { right: ["ok"] } } },
  ],
  edges: [
    { id: "e-subject", source: "src", sourceHandle: "pt", target: "match", targetHandle: "pt" },
    // The capture actually consumed downstream: `y`'s dot on the arm's tab
    // feeds `north()`'s own `y` input, the same wire mechanics any ordinary
    // port uses — a capture is a value, not decoration.
    { id: "e-capture", source: "case-1", sourceHandle: "y", target: "north", targetHandle: "y" },
  ],
};

/**
 * `match pt: case Point(x=0, y=y) if y > 0: north(y) case Point(): other()
 * case _: ignore()` (report §3.3, "a real guard, which then comes back in
 * as an ordinary operand") — the ONE arm that owns both walls: `y` binds
 * OUT on the right (the pattern), `y > 0` reads back IN on the left (the
 * guard), exactly like an `if` arm's own test.
 *
 * `region.branch.ts`'s `matchNode` rejects a `test` on ANY of its `arms` —
 * that guard exists to catch a match arm wrongly claiming the SUBJECT's own
 * job (a second head port hiding on an arm), not this: the guard here is
 * the arm's OWN operand, the same as an `if` arm's. So `case-1` is built
 * with `armNode` directly — the exact function `matchNode` itself calls for
 * every other arm — rather than through `matchNode`'s stricter convenience
 * wrapper, which only ever validates the arms passed to IT.
 */
const MATCH_GUARD_BASE = matchNode({
  id: "match",
  position: { x: 260, y: 24 },
  w: 480,
  subject: "pt",
  arms: [
    { id: "case-1", title: "case Point(x=0, y=y):", captures: ["y"], h: 130 },
    { id: "case-2", title: "case Point():", h: 90 },
    { id: "case-_", title: "case _:", h: 90 },
  ],
});
const MATCH_GUARD_CASE_1: BranchArmSpec = {
  id: "case-1",
  title: "case Point(x=0, y=y):",
  captures: ["y"],
  test: { id: "guard", default: "y > 0" },
  h: 130,
};
export const MATCH_GUARD: HostScene = {
  nodes: [
    MATCH_GUARD_BASE[0], // the region itself, unchanged
    armNode(MATCH_GUARD_CASE_1, "match"), // case-1, now carrying BOTH walls
    ...MATCH_GUARD_BASE.slice(2), // case-2, case-_
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 130, h: 64, ports: { right: ["pt"] } } },
    { id: "north", type: "block", parentId: "case-1", position: { x: 200, y: 20 }, data: { name: "north()", view: "port", w: 170, h: 72, ports: { left: ["y"], right: ["ok"] } } },
    { id: "other", type: "block", parentId: "case-2", position: { x: 170, y: 12 }, data: { name: "other()", view: "port", w: 150, h: 56, ports: { right: ["ok"] } } },
    { id: "ignore", type: "block", parentId: "case-_", position: { x: 170, y: 12 }, data: { name: "ignore()", view: "port", w: 150, h: 56, ports: { right: ["ok"] } } },
  ],
  edges: [
    { id: "e-subject", source: "src", sourceHandle: "pt", target: "match", targetHandle: "pt" },
    { id: "e-capture", source: "case-1", sourceHandle: "y", target: "north", targetHandle: "y" },
  ],
};

/**
 * A `match` inside a `case`'s own arm — the match analogue of
 * `BRANCH_NESTED`. The inner region's `parentId` is `case-point`, the OUTER
 * arm, never the outer region.
 */
export const MATCH_NESTED: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 130, h: 64, ports: { right: ["pt"] } } },
    ...matchNode({
      id: "outer",
      position: { x: 220, y: 24 },
      w: 620,
      subject: "pt",
      arms: [
        // Tall enough to actually CONTAIN the inner match (subject card +
        // three ~90px arm rows) — measured too short once (300px) and the
        // outer `case _:` row started before the inner region's last arm
        // ended, so `ignore()` (outer) painted through `other()` (inner).
        { id: "case-point", title: "case Point():", h: 480 },
        { id: "case-_", title: "case _:", h: 100 },
      ],
    }),
    ...matchNode({
      id: "inner",
      parentId: "case-point",
      position: { x: 190, y: 16 },
      w: 380,
      subject: "quadrant",
      // Prefixed the same way `BRANCH_NESTED`'s inner arms are: a scene
      // node id is GLOBAL, so the inner match's own auto-generated
      // `case-1`/`case-2`/`case-_` would otherwise collide with the outer
      // match's OWN `case-_` below — two different nodes, same id.
      arms: matchCaseArms(['"NE"', '"NW"']).map((arm) => ({ ...arm, id: `inner-${arm.id}`, h: 90 })),
    }),
    { id: "ne", type: "block", parentId: "inner-case-1", position: { x: 150, y: 14 }, data: { name: "ne()", view: "port", w: 170, h: 56, ports: { right: ["ok"] } } },
    { id: "nw", type: "block", parentId: "inner-case-2", position: { x: 150, y: 14 }, data: { name: "nw()", view: "port", w: 170, h: 56, ports: { right: ["ok"] } } },
    { id: "other-quadrant", type: "block", parentId: "inner-case-_", position: { x: 150, y: 14 }, data: { name: "other()", view: "port", w: 170, h: 56, ports: { right: ["ok"] } } },
    { id: "not-point", type: "block", parentId: "case-_", position: { x: 190, y: 16 }, data: { name: "ignore()", view: "port", w: 170, h: 56, ports: { right: ["ok"] } } },
  ],
  edges: [{ id: "e-subject", source: "src", sourceHandle: "pt", target: "outer", targetHandle: "pt" }],
};
