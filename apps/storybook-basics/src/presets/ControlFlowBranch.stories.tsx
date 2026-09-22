/**
 * Control Flow/Branch — `if`/`elif`/`else` and `match`/`case`, drawn as the
 * generic Region (lane A) carrying branch DATA (docs/CONTROL-FLOW-PLAN.md
 * lane C). There is no branch component: every story below mounts a scene
 * literal from `presets/branch/branch.fixtures.ts` into the ordinary hosts.
 *
 * What these stories claim, in Zach's own two sentences:
 *
 *   • **Everything is a block.** The branch's interface is a REAL `BlockPort`
 *     in the frame's corner carrying the CONDITIONS — `OneInput` measures
 *     `fast` on that card through the identical `[data-block-id]` →
 *     `[data-port-id]` walk any other block's ports resolve through, and
 *     asserts the card has no right rail at all (Q1/V1: a branch yields
 *     nothing, so it has no output port to yield through).
 *   • **Never mix data and control lines.** Not one cable here is a control
 *     line. The control flow IS the containment: a call lives in an arm, an
 *     arm is a row, a nested branch is a row inside a row (`Nested`). The
 *     arms' results meet at `encode`'s ONE ordinary port — two sibling-arm
 *     cables landing on one dot ARE the join, and `OneInput` measures that
 *     there is exactly one dot there to land on.
 *
 * The assertions live in `controlFlow.acceptance.ts`, committed before this
 * file existed and off-limits to it; every one MEASURES
 * (`getBoundingClientRect`, `getComputedStyle`, sampled SVG paths) rather
 * than asserting DOM presence. `FoldedArm` is the sharpest: it unfolds a
 * MIDDLE arm and re-measures the LAST arm's member against its own arm body
 * — arm-relative positions are the entire reason an arm is a node, and a
 * story that only checked `data-open` would pass a build that silently
 * rewrote every position below the fold.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import {
  BRANCH_ACTIVE,
  BRANCH_FOLDED,
  BRANCH_MANY_INPUTS,
  BRANCH_NESTED,
  BRANCH_ONE_INPUT,
  MATCH_CASE,
} from "./branch/branch.fixtures";
import {
  expectArmsStacked,
  expectCornerPorts,
  expectMemberInside,
  expectRegionExpanded,
  expectWirePainted,
} from "./controlFlow.acceptance";

const meta = {
  title: "Presets/ControlFlow/Branch",
  tags: ["object:region", "host:dom", "host:react-flow", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** The fold is a SCENE write (`data.arm.open` on the arm node), so every
 *  bench that can be clicked owns the scene and writes it back — a read-only
 *  `DomCanvas` would render a chevron that does nothing. */
function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

const ONE_INPUT_WIRES = ["e-cond", "e-frame1", "e-frame2", "e-gain", "e-out1", "e-out2"];

export const OneInput: Story = {
  name: "One input (if fast: / else:)",
  render: () => <StatefulDomCanvas initial={BRANCH_ONE_INPUT} width={1040} height={560} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "br");
    // The interface, on the corner block: the condition and nothing else.
    expectCornerPorts(canvasElement, "br", { left: ["fast"] });
    const corner = required<HTMLElement>(canvasElement, '[data-slot="region-corner"]', "the corner block");
    expect(
      corner.querySelector('[data-slot="block-port-rail"][data-edge="right"]'),
      "Q1/V1: a branch yields nothing, so its corner block has NO output wall",
    ).toBeNull();
    expect(
      Array.from(corner.querySelectorAll('[data-slot="block-port-rail"]')).map((rail) => rail.getAttribute("data-edge")),
      "one wall, the conditions'",
    ).toEqual(["left"]);

    await expectArmsStacked(canvasElement, "br", ["if", "else"]);
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate");
    expectMemberInside(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "fallback");

    for (const wireId of ONE_INPUT_WIRES) await expectWirePainted(canvasElement, wireId);

    // The join, measured: both arms' `Pose` cables end at ONE dot, because
    // `encode`'s `pose` IS one dot. If a yield port had been minted on the
    // region instead (the V2 this design rejected), these two wires would
    // end somewhere else entirely and this assertion would still pass on
    // presence alone — so it counts the dots rather than the wires.
    expect(
      canvasElement.querySelectorAll('[data-block-id="encode"] [data-port-id="pose"]'),
      "the fan-in lands on exactly one port dot",
    ).toHaveLength(1);
  },
};

export const ManyInputs: Story = {
  name: "Many inputs (three conditions, three arms)",
  render: () => <StatefulDomCanvas initial={BRANCH_MANY_INPUTS} width={560} height={660} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "br");
    // However many values the branch decides on, they are ports on the ONE
    // corner block — the interface never moves onto the arms.
    expectCornerPorts(canvasElement, "br", { left: ["input_1", "input_2", "input_3"] });
    await expectArmsStacked(canvasElement, "br", ["arm-1", "arm-2", "arm-3"]);
    expectMemberInside(canvasElement, '[data-arm-id="arm-2"] [data-slot="region-arm-body"]', "step-2");
  },
};

export const MatchCase: Story = {
  name: "match / case (same shape, different titles)",
  render: () => <StatefulDomCanvas initial={MATCH_CASE} width={560} height={660} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["case-1", "case-2", "case-_"]);
    expectCornerPorts(canvasElement, "br", { left: ["cmd"] });
    // Truthful rendering: an arm header is the SOURCE header a reader
    // recognises, so the quotes, the spaces and the trailing colon all
    // survive to the screen character for character.
    expect(
      Array.from(canvasElement.querySelectorAll('[data-slot="region-arm-title"]')).map((title) => title.textContent),
    ).toEqual(['case "go":', 'case "stop":', "case _:"]);
  },
};

export const FoldedArm: Story = {
  name: "Folded arm (unfold, and nothing below moves in its own space)",
  render: () => <StatefulDomCanvas initial={BRANCH_FOLDED} width={1040} height={660} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    expect(required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "the folded arm").getAttribute("data-open")).toBe("false");

    // `identity()`'s offset inside ITS OWN arm body — the number that must
    // not change when a SIBLING arm above it unfolds. Re-read from the DOM
    // both times (React may hand back different elements across the write).
    const identityOffset = () => {
      const body = required<HTMLElement>(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "the else arm's body");
      const member = required<HTMLElement>(canvasElement, '[data-block-id="identity"]', "identity()");
      return member.getBoundingClientRect().top - body.getBoundingClientRect().top;
    };
    const rowTop = () => required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "the else row").getBoundingClientRect().top;
    const offsetBefore = identityOffset();
    const rowTopBefore = rowTop();

    await userEvent.click(required<HTMLElement>(canvasElement, '[data-arm-id="elif"] [data-slot="folding-chevron"]', "the elif chevron"));
    await waitFor(() => {
      expect(required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "elif").getAttribute("data-open")).toBe("true");
    });

    // Non-vacuous first: the row really did move, by the body that appeared
    // above it. Then the claim: its member did not move within it.
    expect(rowTop() - rowTopBefore, "unfolding elif pushes the else row down by its body").toBeGreaterThan(100);
    expect(Math.abs(identityOffset() - offsetBefore), "the member's arm-relative position is untouched").toBeLessThanOrEqual(1);
  },
};

export const ActiveArm: Story = {
  name: "Active arm (the rest fade to one token)",
  render: () => <StatefulDomCanvas initial={BRANCH_ACTIVE} width={1040} height={660} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    const active = required<HTMLElement>(canvasElement, '[data-arm-id="if"]', "the active arm");
    const faded = required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "a non-active arm");
    expect(active.getAttribute("data-active")).toBe("true");
    expect(faded.getAttribute("data-active")).toBe("false");
    // Read back off the browser, not off our own constant: a fade that never
    // reached the paint would still satisfy a DOM-presence check. This is
    // the lens V1 traded the yield ports for (DP - Branch), so it has to be
    // visible, not merely recorded.
    expect(getComputedStyle(faded).opacity).toBe("0.18");
    expect(getComputedStyle(active).opacity).toBe("1");
  },
};

export const Nested: Story = {
  name: "Nested (a branch inside an arm)",
  render: () => <StatefulDomCanvas initial={BRANCH_NESTED} width={760} height={680} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "inner");
    // The containment the scene declares is the containment the DOM shows:
    // the inner branch's `parentId` is the ARM, so it renders inside that
    // arm's body — not in the outer region's free body, which is a scope the
    // program does not have.
    required(
      canvasElement,
      '[data-arm-id="if"] [data-slot="region"][data-region-id="inner"]',
      "the inner branch inside the outer `if` arm",
    );
    await expectArmsStacked(canvasElement, "inner", ["inner-if", "inner-else"]);
    expectCornerPorts(canvasElement, "inner", { left: ["gain"] });
    expectMemberInside(canvasElement, '[data-arm-id="inner-if"] [data-slot="region-arm-body"]', "refine");
  },
};

export const OneInputReactFlow: Story = {
  name: "One input, in a host (ReactFlow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(BRANCH_ONE_INPUT);
      return (
        <ReactFlowHost scene={scene} onSceneChange={setScene} width={1040} height={560} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      );
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    // C3: one renderer, three hosts. The branch preset is DATA — React Flow
    // needed zero branch-specific code, the same way it needed zero
    // region-specific code in lane A.
    await expectRegionExpanded(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", ["if", "else"]);
    expectCornerPorts(canvasElement, "br", { left: ["fast"] });
  },
};
