/**
 * Control Flow/Loop — the loop PRESET (docs/CONTROL-FLOW-PLAN.md lane B),
 * built entirely out of `presets/loop/loop.ts`'s factories over the generic
 * Region lane A shipped. There is no Loop component in this repo and these
 * stories are the proof: every board below is `forLoopNode` /
 * `whileLoopNode` / `carriedValueEdge` handing data to the SAME
 * `SceneNodeView` a plain block goes through.
 *
 * The two load-bearing ideas, as things these stories MEASURE:
 *
 *   • **Everything is a block.** A loop's header is not a band, a title or
 *     a decoration — it is a real `BlockPort` in the frame's corner, and
 *     `expectCornerPorts` reads `Iterable`/`Iter` off its rails through the
 *     identical `[data-block-id]` → `[data-port-id]` walk `merge()`'s own
 *     ports resolve through. `WhileLoopRecheck` sharpens it into a
 *     negative: a `while` header has NO right rail in the DOM, because the
 *     construct genuinely has no item outlet.
 *   • **Never mix data and control lines.** Not one cable on these boards
 *     is control flow. The cable that comes back (`e-carry`) is an ordinary
 *     data cable that is merely one turn late — dotted, with a pill naming
 *     the seed — and `LoopWithBreak`'s exit is a MARK, which
 *     `expectControlMark` proves by enumerating every painted wire and
 *     finding none that originates at it.
 *
 * The assertions live in `controlFlow.acceptance.ts`, committed before this
 * file existed and off-limits to it.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import {
  FOR_LOOP_CARRIED,
  FOR_LOOP_EMPTY,
  LOOP_WITH_BREAK,
  LOOP_WITH_TURN,
  WHILE_LOOP_RECHECK,
} from "./loop/loop.fixtures";
import {
  expectControlMark,
  expectCornerPorts,
  expectMemberInside,
  expectRegionExpanded,
  expectWireAvoids,
  expectWireBadge,
  expectWirePainted,
} from "./controlFlow.acceptance";

const meta = {
  title: "Control Flow/Loop",
  tags: ["area:control-flow", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** Every board is read-write: a member is draggable and a port rail is
 *  reorderable, so the bench holds the scene the same way
 *  `SceneHosts.stories.tsx` does rather than freezing a literal. */
function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/**
 * The bypass claim on the line that is actually PAINTED — the same local
 * check `ControlFlowWires.stories.tsx` (lane D) carries, for the same
 * measured reason, repeated here rather than imported because it belongs to
 * a story file that is not this lane's to edit.
 *
 * `expectWireAvoids` is called unchanged on every story below and IS the
 * acceptance; its selector is `[data-wire-id] path`, and `querySelector`
 * takes the first match in document order — which is the arrowhead marker
 * inside `<defs>`, not the route (`trace.tsx` renders defs first). So the
 * helper passes without looking at the cable. This one selects
 * `path[data-slot="trace-line"]`, the real routed line, so "the carried
 * value goes AROUND merge instead of across it" is proved rather than
 * assumed. The fix belongs in `controlFlow.acceptance.ts`, which this lane
 * may not edit either; it is one selector, and it is reported.
 */
function expectRoutedLineAvoids(root: ParentNode, wireId: string, obstacleSelector: string): void {
  const obstacle = required<HTMLElement>(root, obstacleSelector, `obstacle \`${obstacleSelector}\``);
  const line = required<SVGPathElement>(
    root,
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
    `wire \`${wireId}\`'s painted line`,
  );
  const ctm = line.getScreenCTM();
  if (!ctm) throw new Error(`wire \`${wireId}\`'s line is not rendered — no screen CTM`);
  const box = obstacle.getBoundingClientRect();
  const total = line.getTotalLength();
  const inside: { x: number; y: number }[] = [];
  for (let d = 0; d <= total; d += 4) {
    const local = line.getPointAtLength(d);
    const point = new DOMPoint(local.x, local.y).matrixTransform(ctm);
    if (point.x > box.left + 1 && point.x < box.right - 1 && point.y > box.top + 1 && point.y < box.bottom - 1) inside.push(point);
  }
  expect(inside, `wire ${wireId}'s PAINTED line enters ${obstacleSelector} at ${inside.length} sampled points`).toHaveLength(0);
}

/* ==================================================================== */
/* ForLoopEmpty                                                          */
/* ==================================================================== */

export const ForLoopEmpty: Story = {
  name: "for — the typed, unnamed header on an empty frame",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_EMPTY} width={540} height={360} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // The header contract, measured: `Iterable` in on the left wall,
    // `Iter` out on the right, and nothing else anywhere on the card. The
    // ids ARE the type labels (donor loopModel.ts:55-70) — there is no
    // name to check because a header port deliberately has none.
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
  },
};

/* ==================================================================== */
/* ForLoopCarried                                                        */
/* ==================================================================== */

export const ForLoopCarried: Story = {
  name: "for — merge() / smooth(), the seed from outside, the z⁻¹ back cable",
  render: () => <StatefulDomCanvas initial={FOR_LOOP_CARRIED} width={1100} height={420} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
    // The nesting the scene declares is the nesting the DOM shows: `merge`
    // renders inside the loop's own body, never as a host node of its own.
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "smooth");

    // Three cables, three different relationships to the frame, all
    // resolved against real dots: the header handing out this turn's
    // element (private, inside), the seed crossing the frame straight into
    // a member (V1's direct crossing cable), and the body's result leaving
    // for a block outside.
    await expectWirePainted(canvasElement, "e-iter");
    await expectWirePainted(canvasElement, "e-seed");
    await expectWirePainted(canvasElement, "e-out");

    // The carried value: the pill names the seed, character for character,
    // and the cable goes AROUND the block it belongs to rather than across
    // it ("go to the end first, then loop back" — format, not semantics).
    await expectWireBadge(canvasElement, "e-carry", "z⁻¹ = estimate()");
    await expectWireAvoids(canvasElement, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
    expectRoutedLineAvoids(canvasElement, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
  },
};

/* ==================================================================== */
/* WhileLoopRecheck                                                      */
/* ==================================================================== */

export const WhileLoopRecheck: Story = {
  name: "while — a Bool inlet, no item outlet, and a visible re-check",
  render: () => <StatefulDomCanvas initial={WHILE_LOOP_RECHECK} width={900} height={400} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Bool"] });

    // The negative half of the header contract, and the reason a `while` is
    // not a renamed `for`: there is no right RAIL at all, not an empty one.
    // `edgeSpecsOf` mints one rail per KEY of `data.ports`, so this fails
    // the moment someone "completes the symmetry" with `right: []`.
    const corner = required<HTMLElement>(
      canvasElement,
      '[data-slot="region"][data-region-id="loop"] [data-slot="region-corner"] [data-block-id="loop"]',
      "the corner block",
    );
    expect(corner.querySelector('[data-slot="block-port-rail"][data-edge="right"]')).toBeNull();

    // The condition is re-evaluated after every pass, so it is WIRED back to
    // the header rather than hidden in a title — and it is a data cable that
    // is merely one turn late, not a control line.
    await expectWirePainted(canvasElement, "e-recheck");
    await expectWireBadge(canvasElement, "e-recheck", "z⁻¹");
  },
};

/* ==================================================================== */
/* LoopWithTurn                                                          */
/* ==================================================================== */

export const LoopWithTurn: Story = {
  name: "for — the turn chip in the corner block's header",
  render: () => <StatefulDomCanvas initial={LOOP_WITH_TURN} width={620} height={340} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // The chip is a stock `Badge` in the corner header's `Bar` right slot —
    // reached ONLY because `data.badge` is set, which is what keeps every
    // pre-existing story's header markup a plain string.
    const chip = required<HTMLElement>(
      canvasElement,
      '[data-slot="region-corner"] [data-slot="bar-right"] [data-slot="badge"]',
      "the turn chip",
    );
    expect(chip.textContent?.trim()).toBe("iteration 3 of 7");
    // It minted no port: a turn count is a reading, never something to wire.
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
  },
};

/* ==================================================================== */
/* LoopWithBreak                                                         */
/* ==================================================================== */

export const LoopWithBreak: Story = {
  name: "while — break is a mark beside the call, never a cable",
  render: () => <StatefulDomCanvas initial={LOOP_WITH_BREAK} width={860} height={360} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // B5, measured twice over: the mark is a badge ON `check()`, and no wire
    // in the whole layer originates at `check/break` — the only honest way
    // to assert an absence is to enumerate what IS painted.
    expectControlMark(canvasElement, "check", "break");
    // And it minted no handle. A mark that quietly became a port is exactly
    // the "data and control mixed" failure the rule exists to prevent.
    const check = required<HTMLElement>(canvasElement, '[data-block-id="check"]', "the marked block");
    expect(Array.from(check.querySelectorAll("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"))).toEqual(["next"]);
  },
};

/* ==================================================================== */
/* ForLoopReactFlow                                                      */
/* ==================================================================== */

export const ForLoopReactFlow: Story = {
  name: "for — the same board in a canvas host (React Flow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(FOR_LOOP_CARRIED);
      return (
        <ReactFlowHost
          scene={scene}
          onSceneChange={setScene}
          width={1100}
          height={420}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        />
      );
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    // C3, on the preset: React Flow needed zero loop-specific code. The
    // region falls through `NODE_TYPES` to the same `BboxNode` every other
    // kind uses, `SceneNodeView` owns the switch, and a member stays a
    // member — drawn inside the loop's body, never promoted to an RF node
    // (which is what `expectMemberInside`'s second half asserts).
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "merge");
  },
};
