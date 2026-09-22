/**
 * Components/Blocks/Region/Gallery — the whole visual language on ONE board, in all
 * three hosts (docs/CONTROL-FLOW-PLAN.md lane F, §8's last row).
 *
 * Every other `Control Flow/*` file proves one claim in isolation: lane A
 * the frame and its arms, B the loop header, C the branch arms, D the
 * bypass and the pills, E the opaque toggle, G the member edges. Isolation
 * is what makes each of those honest — and it is also the one thing that
 * cannot show whether the pieces compose. This file is the composition, and
 * it is built by IMPORTING the shipped fixtures (`FOR_LOOP_CARRIED`,
 * `BRANCH_ONE_INPUT`) rather than retyping them, so the board Zach looks at
 * here is provably the same board the lane stories assert on — a retyped
 * copy is exactly how a gallery starts drawing its own private truth.
 *
 * ── THE TWO LOAD-BEARING IDEAS, AS THINGS THIS BOARD MEASURES ─────────
 *
 * **Everything is a block.** The loop's `Iterable`/`Iter` header and the
 * branch's `fast` condition are `BlockPort` rails on real cards in their
 * frames' corners — `expectRegionExpanded` walks `[data-slot="region-corner"]
 * [data-block-id="<region>"]` for both, the same walk `merge()`'s own dots
 * resolve through, and it also asserts the negative: the FRAMES own no port
 * dot at all. A region's interface is a block; the frame is only its scope.
 *
 * **Never mix data and control lines.** Control on this board is exactly
 * three things and none of them is a cable: the loop's containment, the
 * branch's two arm rows, and (on `CollapsedBranchInLoop`) the fold. The
 * cables are all data — including `e-carry`, which is merely one turn late
 * (dotted, pilled `z⁻¹ = prior()`), and `e-mut`, whose effect is what it
 * CARRIES rather than a second kind of line. `expectNoCableCrossesArms`
 * turns that into a mechanical check computed off the scene with `armOf`:
 * if any wire ever ran from one arm to a sibling arm it would be control
 * flow drawn as data, and the board would fail here rather than in review.
 *
 * ── WHAT IS ON THE BOARD ──────────────────────────────────────────────
 *
 *   for other in others:              # the loop region (FOR_LOOP_CARRIED)
 *       pose  = merge(prior_pose, other)
 *       fused = smooth(pose)
 *       if fast:                      # the branch region (BRANCH_ONE_INPUT),
 *           out = estimate(fused, gain)   # a MEMBER of the loop's body
 *       else:
 *           out = fallback(frame)
 *   encode(out)
 *
 * plus two cables that exist only here: `e-bypass`, which flows through
 * NEITHER region and therefore has to go around both frames, and `e-mut`,
 * an effect leaving `merge`'s top wall for a block outside the loop.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostNodeData, HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { BRANCH_ONE_INPUT } from "../scene/region.branch.fixtures";
import { carriedValueEdge } from "../scene/region.loop";
import { FOR_LOOP_CARRIED } from "../scene/region.loop.fixtures";
import { armOf } from "../scene/controlFlow";
import type { SceneEdge, SceneNode } from "../scene/scene";
import type { WireStyleData } from "../scene/sceneWires";
import {
  expectArmsStacked,
  expectMemberInside,
  expectRegionExpanded,
  expectRegionOpaque,
  expectWireAvoids,
  expectWireBadge,
  expectWirePainted,
} from "./region.acceptance";

const meta = {
  title: "Components/Blocks/Region/Gallery",
  tags: ["object:region", "host:dom", "host:react-flow", "host:tldraw", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

type Node = SceneNode<HostNodeData>;
type Edge = SceneEdge<WireStyleData>;

/** Elbow routing — the fixtures' own constant, restated because a keep-out
 *  is only consulted for an orthogonal route (a default curve is drawn with
 *  no obstacles at all, `loop.fixtures.ts`'s own `ELBOW` note). */
const ELBOW = { routing: "elbow" } as const;

/* ==================================================================== */
/* Composing the two shipped fixtures                                    */
/* ==================================================================== */

function nodeOf(scene: HostScene, id: string): Node {
  const found = scene.nodes.find((node) => node.id === id);
  if (!found) throw new Error(`fixture has no node \`${id}\``);
  return found;
}

function edgeOf(scene: HostScene, id: string): Edge {
  const found = scene.edges.find((edge) => edge.id === id);
  if (!found) throw new Error(`fixture has no edge \`${id}\``);
  return found;
}

/** The same cable, drawn orthogonally. Every other field — id, both ends,
 *  colour, variant, badge — survives untouched. */
function elbow(edge: Edge): Edge {
  return { ...edge, data: { ...edge.data, ...ELBOW } };
}

/** One fixture node, with the gallery's own placement/size patch applied.
 *  Every difference from the shipped literal goes through HERE, so the diff
 *  is readable as a patch rather than hidden inside a retyped copy. */
function place(node: Node, over: Partial<Node>, data?: Partial<HostNodeData>): Node {
  return { ...node, ...over, data: { ...node.data, ...data } };
}

/**
 * WHY `FOR_LOOP_CARRIED`'s `estimate()` is renamed and `BRANCH_ONE_INPUT`'s
 * is not: a scene node id is GLOBAL (`branch.fixtures.ts`'s `BRANCH_NESTED`
 * states it, and `childrenOf` would otherwise hand one region's row another
 * region's members), and the two fixtures both ship one. The branch's
 * `estimate()`/`fallback()` pair is Zach's own sketch (`Pasted image
 * 20260918143241.png`, `if fast:`) and is the recognisable half, so the
 * loop's outside seed producer is the one that moves — and `prior()` is a
 * truer name for "what the pose was before turn one" than `estimate()` was.
 *
 * The rename has to reach the CARRIED-VALUE PILL too. `carriedValueEdge`'s
 * `seed` is spelled into the badge verbatim (`z⁻¹ = estimate()`), so a
 * renamed producer with the fixture's edge reused unchanged would put a
 * block name on the wire that no longer appears anywhere on the board —
 * a caption naming something the reader cannot find. `e-carry` is therefore
 * re-minted from the same factory with the new name, never hand-edited.
 */
const LOOP_SEED_ID = "prior";

/** The body height one arm row costs: `REGION_ARM_HEADER_PX` (32) plus the
 *  open body. 130 clears `estimate()`'s own 112px card at its authored y of
 *  16 with 2px to spare; `REGION_ARM_MIN_BODY_PX` is 48. */
const ARM_BODY_PX = 130;

/**
 * The loop frame, in canvas space, sized so the branch fits BESIDE
 * `merge`/`smooth` in the loop's free body rather than under them — a
 * region is an ordinary member of another region's body, and side-by-side
 * is what makes that legible at a glance.
 *
 * WHY the height is written out of a measured arithmetic rather than
 * eyeballed: `region.tsx` sets `overflow: visible` on the frame, so a body
 * too short for its members does not clip them — it lets them hang OUT of
 * the border, which reads as a rendering bug rather than as a sizing one.
 * Measured on this very board (`getBoundingClientRect`, 2026-09-18): the
 * corner card is **80px** tall, not the ~44 a one-rail card looks like, so
 * the branch's own frame is 80 + 2×(32 + 130) + `REGION_PAD_BOTTOM_PX` =
 * 416, and the loop needs 80 (its own corner) + 10 (the branch's body y) +
 * 416 + slack. The first pass guessed 460 and the branch hung 45px below
 * the loop's border in the capture.
 */
const LOOP_FRAME = { position: { x: 200, y: 110 }, w: 1000, h: 540 } as const;

/**
 * The composed board.
 *
 * WHY the branch's `parentId` is the LOOP and not one of the loop's own
 * members: a loop has no arms, so `bodyChildrenOf` is its free body and a
 * region dropped there is laid out by `BlockMembers layout="free"` exactly
 * like `merge()` is (`nodeViews.tsx`'s `RegionNodeView`). Parenting it at
 * `merge` instead would put a scope inside a call, which is not a program.
 * Its `position` is therefore in the LOOP'S BODY space (`scene.ts:60-72`),
 * which is why the y values below are small while the frame has a
 * corner-block-high band above them.
 */
function composedBoard(): HostScene {
  const loopFixture = FOR_LOOP_CARRIED;
  const branchFixture = BRANCH_ONE_INPUT;

  const nodes: Node[] = [
    /* -- outside the loop ------------------------------------------- */
    // WHY the right-hand column sits LOW and the left-hand one is spread:
    // both canvas hosts paint their own chrome over this board, and a
    // fixture that ignores it produces a capture nobody can read. Measured
    // at zoom 1, 1520x840, 2026-09-18: tldraw's style panel occupies the
    // top-right (CSS ~1322-1471 x 23-308) and its toolbar the bottom
    // centre; React Flow's `Controls` sit bottom-left. `encode()` at y=180
    // rendered UNDER tldraw's panel in the first capture. Same discipline
    // as `ControlFlowHostEdges.stories.tsx`'s own `src` placement note.
    // The effect cable's landing block. Above the loop on purpose: `e-mut`
    // leaves `merge`'s TOP wall, and a target below would draw an effect
    // that visually re-enters the body it is escaping.
    { id: "world", type: "block", position: { x: 560, y: 8 }, data: { name: "world", view: "port", w: 140, h: 64, ports: { left: ["pose"] } } },
    place(nodeOf(loopFixture, "run"), { position: { x: 0, y: 120 } }),
    place(nodeOf(loopFixture, "estimate"), { id: LOOP_SEED_ID, position: { x: 0, y: 230 } }, { name: "prior()" }),
    // The bypass pair. Deliberately ordinary blocks with one port each:
    // what makes `e-bypass` interesting is not the blocks, it is that the
    // cable flows through NEITHER region and so both frames are keep-outs
    // (`keepOutsFor` subtracts a wire's endpoints and its `through`
    // ancestors, and this wire has neither region in either set).
    { id: "cfg", type: "block", position: { x: 0, y: 380 }, data: { name: "cfg", view: "port", w: 140, h: 64, ports: { right: ["out"] } } },
    place(nodeOf(branchFixture, "src"), { position: { x: 0, y: 480 } }),
    place(nodeOf(branchFixture, "encode"), { position: { x: 1280, y: 520 } }),
    { id: "report", type: "block", position: { x: 1280, y: 380 }, data: { name: "report", view: "port", w: 140, h: 64, ports: { left: ["in"] } } },

    /* -- the loop, and its body ------------------------------------- */
    place(nodeOf(loopFixture, "loop"), { position: LOOP_FRAME.position }, { w: LOOP_FRAME.w, h: LOOP_FRAME.h }),
    // The top wall is the ONLY thing added to `merge`: `effect:<input>`
    // is the whole mutation vocabulary (plan §4's "Mutation effect cable"
    // row — a port name, a colour and a pill, zero new components). It is
    // authored here as a fixture because the DERIVATION (`mutates` on an
    // input → this port) is plan §11 item 7, unbuilt; authoring it is
    // honest, inventing a derived-looking helper for it would not be.
    place(nodeOf(loopFixture, "merge"), { position: { x: 190, y: 20 } }, { ports: { left: ["pose", "other"], right: ["Pose"], top: ["effect:pose"] } }),
    place(nodeOf(loopFixture, "smooth"), { position: { x: 390, y: 20 } }),

    /* -- the branch, INSIDE the loop's body ------------------------- */
    place(nodeOf(branchFixture, "br"), { parentId: "loop", position: { x: 570, y: 10 } }, { w: 400 }),
    // The arms come across unchanged except for their body height, which
    // is trimmed so the branch fits beside `merge`/`smooth` without the
    // loop frame growing past what a reviewer can see at once.
    ...["if", "else"].map((armId) => {
      const arm = nodeOf(branchFixture, armId);
      return place(arm, {}, { arm: { ...arm.data.arm, h: ARM_BODY_PX } });
    }),
    nodeOf(branchFixture, "estimate"),
    nodeOf(branchFixture, "fallback"),
  ];

  const edges: Edge[] = [
    /* -- the loop's own cables, verbatim ---------------------------- */
    edgeOf(loopFixture, "e-iterable"),
    edgeOf(loopFixture, "e-iter"),
    // `e-seed` follows the rename: the seed now arrives from `prior()`.
    { ...edgeOf(loopFixture, "e-seed"), source: LOOP_SEED_ID },
    edgeOf(loopFixture, "e-ms"),
    // Re-minted, not hand-edited — see LOOP_SEED_ID's note.
    carriedValueEdge({ id: "e-carry", nodeId: "merge", from: "Pose", to: "pose", seed: "prior()" }),

    /* -- the branch's own cables ------------------------------------ */
    // WHY every branch cable is re-routed ELBOW here while
    // `BRANCH_ONE_INPUT` itself ships them as default curves: routing is
    // format, not semantics (DP - Loop's own words about the back cable),
    // and the two fixtures were drawn at different scales. On the branch's
    // own board every span is a few hundred px and a curve reads as
    // "straight dataflow"; composed, the same cables run 1,200px diagonally
    // through two frames and three cards, and a default curve is drawn with
    // NO obstacles at all (`keepOutsFor` is only consulted for an
    // orthogonal route). Elbow is also what Zach's sketches draw. The
    // meaning is untouched — same ids, same ends, same fixture objects
    // spread — so `Components/Blocks/Region/Branch` keeps asserting the curves it
    // shipped and this board keeps being legible.
    elbow(edgeOf(branchFixture, "e-cond")),
    // The ONE retarget, and the thing that makes this a program rather than
    // two fixtures sharing a canvas: the `if` arm estimates from the pose
    // the loop body just SMOOTHED, so `e-frame1` sources from `smooth`
    // instead of `src`. It is still a direct crossing cable into a member
    // three levels down (loop → branch → arm) — V1, plan §3.1: the expanded
    // document has no tunnels, so a region's frame needs no port for a
    // value that merely passes through it.
    elbow({ ...edgeOf(branchFixture, "e-frame1"), source: "smooth", sourceHandle: "Pose" }),
    // `e-frame2` keeps its ends, and the asymmetry is the point: the `else`
    // arm falls back to the RAW frame defined outside the loop, which is
    // the same V1 claim from the other direction — a scope reads what was
    // defined before it.
    elbow(edgeOf(branchFixture, "e-frame2")),
    elbow(edgeOf(branchFixture, "e-gain")),
    // Both arms' results land on `encode`'s ONE `pose` dot. Fan-in at an
    // ordinary consumer port IS the join (Q1/V1) — the branch has no yield
    // port, and `expectNoCableCrossesArms` below is what keeps that from
    // quietly becoming an arm-to-arm cable instead.
    elbow(edgeOf(branchFixture, "e-out1")),
    elbow(edgeOf(branchFixture, "e-out2")),

    /* -- this board's own two cables -------------------------------- */
    // Flows through neither region, so both frames are obstacles.
    { id: "e-bypass", source: "cfg", sourceHandle: "out", target: "report", targetHandle: "in", data: { ...ELBOW } },
    // An effect, drawn with zero new components.
    {
      id: "e-mut",
      source: "merge",
      sourceHandle: "effect:pose",
      target: "world",
      targetHandle: "pose",
      data: { color: "var(--color-amber-600, #d97706)", badge: "mut", ...ELBOW },
    },
  ];

  return { nodes, edges };
}

/** The expanded board. `FOR_LOOP_CARRIED`'s `e-out` (`smooth → encode`) is
 *  deliberately absent: the branch is the loop's terminal path now, and
 *  keeping the old cable would put a third line on `encode`'s single dot
 *  that has nothing to do with the join the branch is here to show. */
const GALLERY: HostScene = composedBoard();

/** The same document with ONE field flipped — `data.region.view` on the
 *  branch (plan §2.B: the toggle is a projection, not an edit). Written
 *  with the same `place` patch the composition uses, so it is visibly one
 *  field and not a second board. */
const GALLERY_COLLAPSED: HostScene = {
  nodes: GALLERY.nodes.map((node) =>
    node.id === "br" ? place(node, {}, { region: { ...node.data.region, kind: "branch", view: "opaque" } }) : node,
  ),
  edges: GALLERY.edges,
};

/** The board's viewport. The height carries a deliberate ~130px band BELOW
 *  the loop's bottom border: that band is the only corridor `e-bypass` can
 *  legally take (it flows through neither region, so both frames are
 *  keep-outs), and a canvas that ends at the frame would make the story
 *  assert a route the router had no room to draw. */
const CANVAS = { width: 1460, height: 780 } as const;

/* ==================================================================== */
/* Benches                                                               */
/* ==================================================================== */

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={CANVAS.width} height={CANVAS.height} />;
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <ReactFlowHost
      scene={scene}
      onSceneChange={setScene}
      width={CANVAS.width}
      height={CANVAS.height}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
    />
  );
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <TldrawHost scene={scene} onSceneChange={setScene} width={CANVAS.width} height={CANVAS.height} />;
}

/* ==================================================================== */
/* Measured helpers                                                      */
/* ==================================================================== */

/**
 * "Never mix data and control lines," as an assertion a board can fail.
 *
 * Computed off the SCENE with `armOf` rather than read out of the DOM: the
 * question is whether the document ever wires one arm's block to a sibling
 * arm's, and the document is where that fact lives. Two nodes in the same
 * arm are fine (ordinary intra-arm dataflow); one or both outside every arm
 * is fine (that is every crossing cable on this board); two nodes in
 * DIFFERENT arms is the failure — it would mean a value flowing between two
 * branches of a decision, which is control flow wearing a cable's clothes.
 *
 * Enumerated over the wires actually PAINTED, not over `scene.edges`: an
 * edge that never rendered cannot mislead anyone, and this way the check
 * also fails if the host invents a wire the scene never declared.
 */
function expectNoCableCrossesArms(root: ParentNode, scene: HostScene): void {
  const byId = new Map(scene.edges.map((edge) => [edge.id, edge]));
  const painted = Array.from(root.querySelectorAll<SVGGElement>('[data-slot="wire-layer"] [data-wire-id]'));
  expect(painted.length, "the board paints wires at all").toBeGreaterThan(0);
  for (const group of painted) {
    const wireId = group.getAttribute("data-wire-id") ?? "";
    const edge = byId.get(wireId);
    expect(edge, `painted wire \`${wireId}\` is one this scene declares`).toBeDefined();
    const fromArm = armOf(scene, edge!.source)?.id;
    const toArm = armOf(scene, edge!.target)?.id;
    if (fromArm !== undefined && toArm !== undefined) {
      expect(fromArm, `wire ${wireId} runs from arm \`${fromArm}\` to arm \`${toArm}\` — no cable may cross arms`).toBe(toArm);
    }
  }
  // The check would be vacuous on a board with no arm members at all, so
  // prove the board actually exercises it: both arms hold a block, and both
  // blocks source a cable that leaves their arm.
  expect(armOf(scene, "estimate")?.id).toBe("if");
  expect(armOf(scene, "fallback")?.id).toBe("else");
}

/**
 * The bypass, measured on the line that is actually PAINTED.
 *
 * Sits beside `expectWireAvoids` (which IS called, unchanged, on every
 * story below) for the reason `ControlFlowWires.stories.tsx` measured and
 * recorded in lane D: the helper's `[data-wire-id] path` selector takes the
 * FIRST path in document order, which is the arrowhead marker inside
 * `TraceBody`'s `<defs>` — a ~18px chevron in its own user space, not the
 * route. The finding belongs in `controlFlow.acceptance.ts` (one selector:
 * `path[data-slot="trace-line"]`), which this lane may not edit, so the
 * sharper check is repeated here rather than imported from a story file
 * that is also not this lane's to edit.
 */
function expectRoutedLineAvoids(root: ParentNode, wireId: string, obstacleSelector: string): void {
  const obstacle = root.querySelector<HTMLElement>(obstacleSelector);
  if (!obstacle) throw new Error(`expected obstacle \`${obstacleSelector}\``);
  const line = root.querySelector<SVGPathElement>(
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
  );
  if (!line) throw new Error(`expected wire \`${wireId}\`'s painted line`);
  const ctm = line.getScreenCTM();
  if (!ctm) throw new Error(`wire \`${wireId}\`'s line is not rendered — no screen CTM`);
  const box = obstacle.getBoundingClientRect();
  const inside: { x: number; y: number }[] = [];
  const total = line.getTotalLength();
  for (let d = 0; d <= total; d += 4) {
    const local = line.getPointAtLength(d);
    const point = new DOMPoint(local.x, local.y).matrixTransform(ctm);
    if (point.x > box.left + 1 && point.x < box.right - 1 && point.y > box.top + 1 && point.y < box.bottom - 1) inside.push(point);
  }
  expect(inside, `wire ${wireId}'s PAINTED line enters ${obstacleSelector} at ${inside.length} sampled points`).toHaveLength(0);
}

/* ==================================================================== */
/* BranchInLoop — the DOM canvas                                         */
/* ==================================================================== */

export const BranchInLoop: Story = {
  name: "a branch inside a loop, a bypass around both, and a mut cable",
  render: () => <StatefulDomCanvas initial={GALLERY} />,
  play: async ({ canvasElement }) => {
    // Both frames, with their real corner blocks and no dots of their own.
    await expectRegionExpanded(canvasElement, "loop");
    await expectRegionExpanded(canvasElement, "br");

    // The branch's rows stack under ITS corner block, inside the loop.
    await expectArmsStacked(canvasElement, "br", ["if", "else"]);
    expectMemberInside(canvasElement, '[data-region-id="loop"] [data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate");
    expectMemberInside(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "fallback");

    // The bypass flows through neither region, so it clears BOTH frames —
    // the acceptance helper on the loop, and the sharper painted-line check
    // on each of them.
    await expectWirePainted(canvasElement, "e-bypass");
    await expectWireAvoids(canvasElement, "e-bypass", '[data-region-id="loop"] [data-slot="region-frame"]');
    expectRoutedLineAvoids(canvasElement, "e-bypass", '[data-region-id="loop"] [data-slot="region-frame"]');
    expectRoutedLineAvoids(canvasElement, "e-bypass", '[data-region-id="br"] [data-slot="region-frame"]');

    // The two pills: the effect leaving `merge`'s top wall, and the carried
    // value naming the block that seeded it — which is on this board.
    await expectWireBadge(canvasElement, "e-mut", "mut");
    await expectWireBadge(canvasElement, "e-carry", "z⁻¹ = prior()");

    // And the rule that makes the arms control flow rather than dataflow.
    expectNoCableCrossesArms(canvasElement, GALLERY);
  },
};

/* ==================================================================== */
/* The same board, in the two canvas engines                             */
/* ==================================================================== */

export const BranchInLoopReactFlow: Story = {
  name: "the same board in React Flow",
  render: () => <StatefulReactFlow initial={GALLERY} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    await expectRegionExpanded(canvasElement, "br");
    // Nesting the SCENE declares is nesting the DOM shows, in an engine
    // that knows nothing about regions: neither the loop's member nor the
    // arm's is a React Flow node of its own (`expectMemberInside` asserts
    // the absence of `[data-scene-node]` as hard as the presence).
    expectMemberInside(canvasElement, '[data-region-id="loop"] [data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate");
  },
};

export const BranchInLoopTldraw: Story = {
  name: "the same board in tldraw",
  render: () => <StatefulTldraw initial={GALLERY} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    await expectRegionExpanded(canvasElement, "br");
    expectMemberInside(canvasElement, '[data-region-id="loop"] [data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate");
  },
};

/* ==================================================================== */
/* CollapsedBranchInLoop — one field, nested                             */
/* ==================================================================== */

export const CollapsedBranchInLoop: Story = {
  name: "the branch collapsed to a card, still inside the open loop",
  render: () => <StatefulDomCanvas initial={GALLERY_COLLAPSED} />,
  play: async ({ canvasElement }) => {
    // The loop is untouched: `data.region.view` moved on ONE node, and the
    // region that keeps its frame keeps every part of it.
    await expectRegionExpanded(canvasElement, "loop");
    await expectRegionOpaque(canvasElement, "br");

    // The card is a MEMBER of the loop's body, exactly where the frame was
    // — an opaque region is still an ordinary member of whatever contains
    // it, which is what makes "nothing moves" possible at all.
    expectMemberInside(canvasElement, '[data-region-id="loop"] [data-slot="region-body"]', "br");

    // Nothing under the collapsed branch reaches the DOM — not its arms,
    // not their members.
    expect(canvasElement.querySelector("[data-arm-id]"), "a collapsed branch renders no arm row").toBeNull();
    for (const memberId of ["estimate", "fallback"]) {
      expect(canvasElement.querySelector(`[data-block-id="${memberId}"]`), `member \`${memberId}\` is hidden`).toBeNull();
    }
  },
};
