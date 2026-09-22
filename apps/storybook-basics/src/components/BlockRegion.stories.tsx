/**
 * Components/Blocks/BlockRegion — the region KIT, on its own, before any loop or
 * branch preset exists (docs/CONTROL-FLOW-PLAN.md lane A).
 *
 * What these stories are actually claiming, in Zach's own two sentences:
 *
 *   • **Everything is a block.** A region is ONE scene node, and its
 *     interface is a REAL `BlockPort` sitting in the frame's top-left
 *     corner — `WithMembers` measures the loop's `Iterable`/`Iter` dots on
 *     that card, through the identical `[data-block-id]` → `[data-port-id]`
 *     walk any other block's ports resolve through. The frame owns none.
 *   • **Never mix data and control lines.** Not one story here draws a
 *     control cable, because there is nothing to draw one with: the
 *     control flow IS the containment (a member lives in an arm) and the
 *     arm rows (`WithArms`, `ActiveArm`). `break`/`continue` are marks on
 *     a block, never a wire (B5, `nodeViews.tsx`'s `ControlMark`).
 *
 * The assertions live in `controlFlow.acceptance.ts` and were committed
 * BEFORE this file existed; every one of them MEASURES (`getBoundingClient
 * Rect`, `getComputedStyle`) rather than asserting DOM presence.
 * `LayoutTwin` is the sharpest: it re-runs the pure `regionLayout` against
 * the corner box the browser actually laid out and demands the painted rows
 * agree — the reason a pure layout twin exists at all (a tldraw shape or an
 * SVG export reads those numbers WITHOUT rendering).
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { regionLayout } from "./blockRegion.layout";
import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { ARM_NODE_TYPE } from "../scene/controlFlow";
import { REGION_VARIANTS, readRegionVariant } from "../skin/regionVariants";
import { REGION_NODE_TYPE } from "../scene/region";
import {
  expectArmsStacked,
  expectControlMark,
  expectCornerPorts,
  expectMemberInside,
  expectRegionExpanded,
  expectRegionOpaque,
} from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion",
  tags: ["object:region", "host:dom", "host:react-flow", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/* ------------------------------------------------------------------ */
/* Fixtures — this lane's own, deliberately NOT added to HOST_SCENE     */
/* ------------------------------------------------------------------ */

/** A plain scope frame: no ports, no children. The P1 shape at its most
 *  minimal — a frame plus the real Block in its corner. */
const EMPTY_SCENE: HostScene = {
  nodes: [
    {
      id: "group",
      type: REGION_NODE_TYPE,
      position: { x: 32, y: 24 },
      data: { name: "Group", region: { kind: "group" }, w: 400, h: 260 },
    },
  ],
  edges: [],
};

/** The same node, flipped to the P5 card by ONE field — `data.region.view`.
 *  Nothing else in the record differs, which is the whole point of the
 *  toggle lane E builds on top of this. */
const EMPTY_OPAQUE_SCENE: HostScene = {
  nodes: [{ ...EMPTY_SCENE.nodes[0], data: { ...EMPTY_SCENE.nodes[0].data, region: { kind: "group", view: "opaque", presentation: "expanded" } } }],
  edges: [],
};

/**
 * `for other in others:` — the loop's interface is typed and unnamed (DP -
 * Loop): `Iterable` in on the left wall, `Iter` out on the right, both on
 * the CORNER block. `merge` and `smooth` are ordinary blocks whose
 * `parentId` is the region, so their `position` is loop-body-relative
 * (scene.ts:60-72).
 */
const LOOP_SCENE: HostScene = {
  nodes: [
    {
      id: "loop",
      type: REGION_NODE_TYPE,
      position: { x: 32, y: 24 },
      data: {
        name: "For Loop",
        region: { kind: "loop", loop: "for" },
        ports: { left: ["Iterable"], right: ["Iter"] },
        w: 440,
        h: 250,
      },
    },
    { id: "merge", type: "block", parentId: "loop", position: { x: 40, y: 20 }, data: { name: "merge", view: "port", w: 120, h: 106, ports: { left: ["other", "pose"], right: ["Pose"] } } },
    { id: "smooth", type: "block", parentId: "loop", position: { x: 250, y: 20 }, data: { name: "smooth", view: "port", w: 120, h: 64, ports: { left: ["in"], right: ["out"] } } },
  ],
  edges: [],
};

/**
 * Zach's `if fast: estimate() / else: fallback()` (`Pasted image
 * 20260918143241.png`), plus a folded `elif` so a fold is on the bench.
 * Each arm is a NODE (`type: "arm"`), and each block's `parentId` is its
 * ARM — which is exactly what makes `est`'s authored position survive a
 * sibling arm folding (plan §2.C).
 */
const BRANCH_SCENE: HostScene = {
  nodes: [
    {
      id: "br",
      type: REGION_NODE_TYPE,
      position: { x: 32, y: 24 },
      // No `h`: a branch HUGS its arms (`regionLayout`'s hug rule).
      data: { name: "Branch", region: { kind: "branch" }, ports: { left: ["fast"] }, w: 440 },
    },
    { id: "if", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: { name: "if fast:", arm: { open: true, h: 120 } } },
    { id: "elif", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: { name: "elif cached:", arm: { open: false, h: 120 } } },
    { id: "else", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: { name: "else:", arm: { open: true, h: 120 } } },
    { id: "est", type: "block", parentId: "if", position: { x: 28, y: 18 }, data: { name: "estimate", view: "port", w: 132, h: 64, ports: { left: ["frame"], right: ["pose"] } } },
    { id: "fb", type: "block", parentId: "else", position: { x: 28, y: 18 }, data: { name: "fallback", view: "port", w: 132, h: 64, ports: { left: ["frame"], right: ["pose"] } } },
  ],
  edges: [],
};

/** One field again: `activeArm` names the live arm; every other row fades
 *  to `REGION_ARM_FADE_OPACITY` (donor branchModel.ts:38-39). */
const ACTIVE_ARM_SCENE: HostScene = {
  nodes: BRANCH_SCENE.nodes.map((node) =>
    node.id === "br" ? { ...node, data: { ...node.data, region: { kind: "branch" as const, activeArm: "if" } } } : node,
  ),
  edges: [],
};

/**
 * The two things that are NOT cables: a header chip (`data.badge`, the
 * donor's `turn`) and a control-exit MARK on a member (`data.marks`, B5 —
 * "break is not data flow"). Both ride the corner/member card's own header
 * `Bar`; neither mints a port, so neither can ever be a wire's endpoint.
 */
const MARKS_SCENE: HostScene = {
  nodes: [
    {
      id: "loop",
      type: REGION_NODE_TYPE,
      position: { x: 32, y: 24 },
      data: {
        name: "For Loop",
        region: { kind: "loop", loop: "for" },
        ports: { left: ["Iterable"], right: ["Iter"] },
        badge: "iteration 3 of 7",
        w: 440,
        h: 220,
      },
    },
    { id: "check", type: "block", parentId: "loop", position: { x: 40, y: 20 }, data: { name: "check", view: "port", w: 190, h: 64, ports: { left: ["item"] }, marks: ["break"] } },
  ],
  edges: [],
};

/** The arm inputs `regionLayout` is given for `BRANCH_SCENE`, restated for
 *  `LayoutTwin` to re-derive from. */
const BRANCH_ARM_INPUTS = [
  { id: "if", open: true, bodyHeight: 120 },
  { id: "elif", open: false, bodyHeight: 120 },
  { id: "else", open: true, bodyHeight: 120 },
];

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

export const EmptyExpanded: Story = {
  name: "Empty (expanded)",
  render: () => <StatefulDomCanvas initial={EMPTY_SCENE} width={520} height={340} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "group");
  },
};

export const EmptyOpaque: Story = {
  name: "Empty (opaque)",
  render: () => <StatefulDomCanvas initial={EMPTY_OPAQUE_SCENE} width={520} height={260} />,
  play: async ({ canvasElement }) => {
    await expectRegionOpaque(canvasElement, "group");
    // Measured, not narrated: an empty region hides nothing, and the footer
    // has to say exactly that rather than "0 blocks hidden".
    const footer = required<HTMLElement>(canvasElement, '[data-slot="region-hidden"]', "the hidden footer");
    expect(footer.textContent?.trim()).toBe("nothing hidden");
  },
};

export const WithMembers: Story = {
  name: "With members (a loop body)",
  render: () => <StatefulDomCanvas initial={LOOP_SCENE} width={560} height={340} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // "Everything is a block", measured: the region's OWN ports live on the
    // corner card's rails, on the walls the scene named.
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "merge");
    expectMemberInside(canvasElement, '[data-slot="region-body"]', "smooth");
  },
};

export const WithArms: Story = {
  name: "With arms (if / elif folded / else)",
  render: () => <StatefulDomCanvas initial={BRANCH_SCENE} width={560} height={480} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    const elif = required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "the folded arm");
    expect(elif.getAttribute("data-open")).toBe("false");
    // The nesting the scene declares is the nesting the DOM shows: `est`'s
    // parent is the ARM, so it renders inside that arm's body and nowhere
    // else — never as a host node of its own.
    expectMemberInside(canvasElement, '[data-arm-id="if"] [data-slot="region-arm-body"]', "est");
    expectMemberInside(canvasElement, '[data-arm-id="else"] [data-slot="region-arm-body"]', "fb");

    // The fold is a SCENE write (`data.arm.open` on the arm node), not
    // component state: unfolding `elif` must push `else` down and leave
    // `fb`'s own authored position untouched — which is the whole reason an
    // arm is a node and its children's positions are arm-relative.
    const fbBefore = required<HTMLElement>(canvasElement, '[data-block-id="fb"]', "fallback").getBoundingClientRect();
    const elseBefore = required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "the else row").getBoundingClientRect();
    required<HTMLElement>(elif, '[data-slot="folding-chevron"]', "the elif chevron").click();
    await waitFor(() => {
      expect(required<HTMLElement>(canvasElement, '[data-arm-id="elif"]', "elif").getAttribute("data-open")).toBe("true");
    });
    const elseAfter = required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "the else row").getBoundingClientRect();
    const fbAfter = required<HTMLElement>(canvasElement, '[data-block-id="fb"]', "fallback").getBoundingClientRect();
    expect(elseAfter.top - elseBefore.top, "unfolding elif pushes the else row down by its body").toBeGreaterThan(100);
    // `fb` moved with its arm and by exactly the same amount — its own
    // position inside that arm never changed.
    expect(Math.abs(fbAfter.top - fbBefore.top - (elseAfter.top - elseBefore.top))).toBeLessThanOrEqual(1);
  },
};

export const ActiveArm: Story = {
  name: "Active arm (the rest fade)",
  render: () => <StatefulDomCanvas initial={ACTIVE_ARM_SCENE} width={560} height={480} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    const active = required<HTMLElement>(canvasElement, '[data-arm-id="if"]', "the active arm");
    const faded = required<HTMLElement>(canvasElement, '[data-arm-id="else"]', "a non-active arm");
    expect(active.getAttribute("data-active")).toBe("true");
    expect(faded.getAttribute("data-active")).toBe("false");
    // The donor's ONE token, read back off the browser rather than off our
    // own constant — a fade that never reached the paint would still pass a
    // DOM-presence check.
    expect(getComputedStyle(faded).opacity).toBe("0.18");
    expect(getComputedStyle(active).opacity).toBe("1");
  },
};

export const InReactFlow: Story = {
  name: "In a host (ReactFlow)",
  render: () => {
    function Bench() {
      const [scene, setScene] = useState(LOOP_SCENE);
      return (
        <ReactFlowHost scene={scene} onSceneChange={setScene} width={600} height={380} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      );
    }
    return <Bench />;
  },
  play: async ({ canvasElement }) => {
    // C3: one renderer, three hosts. React Flow needed ZERO region-specific
    // code — a region node falls through `NODE_TYPES` to the same `BboxNode`
    // every other kind uses, and `SceneNodeView` owns the switch.
    await expectRegionExpanded(canvasElement, "loop");
    expectCornerPorts(canvasElement, "loop", { left: ["Iterable"], right: ["Iter"] });
  },
};

export const HeaderChipAndMarks: Story = {
  name: "Header chip + a break MARK (never a cable)",
  render: () => <StatefulDomCanvas initial={MARKS_SCENE} width={560} height={320} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    // The chip: the corner's header becomes a `Bar` ONLY because `badge` is
    // set — every node without one keeps the plain-string header, which is
    // what keeps every pre-existing story's markup byte-identical.
    const chip = required<HTMLElement>(
      canvasElement,
      '[data-slot="region-corner"] [data-slot="bar-right"] [data-slot="badge"]',
      "the header chip",
    );
    expect(chip.textContent?.trim()).toBe("iteration 3 of 7");
    // B5, measured: the mark is a badge ON the block, and no wire may
    // originate at it (`expectControlMark` sweeps the wire layer for one).
    expectControlMark(canvasElement, "check", "break");
    // And it minted no port — a mark that quietly became a handle is
    // exactly the "data and control mixed" failure this rule exists to
    // prevent.
    const check = required<HTMLElement>(canvasElement, '[data-block-id="check"]', "the marked block");
    expect(Array.from(check.querySelectorAll("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"))).toEqual(["item"]);
  },
};

export const LayoutTwin: Story = {
  name: "Layout twin (paint agrees with the pure function)",
  render: () => <StatefulDomCanvas initial={BRANCH_SCENE} width={560} height={480} />,
  play: async ({ canvasElement }) => {
    await expectArmsStacked(canvasElement, "br", ["if", "elif", "else"]);
    const region = required<HTMLElement>(canvasElement, '[data-region-id="br"][data-slot="region"]', "the region");
    const frame = required<HTMLElement>(region, '[data-slot="region-frame"]', "the frame").getBoundingClientRect();
    const corner = required<HTMLElement>(region, '[data-slot="region-corner"]', "the corner").getBoundingClientRect();

    // The pure twin, fed the corner box the BROWSER laid out — the same
    // input the component measured for itself.
    // ...and the drawing's own arm-header height, exactly as `region.tsx`
    // passes it: since 2026-09-22 the toolbar opens on v9 (Zach: "for
    // regions make v9 the default one"), whose header is not v1's.
    const armHeaderPx = REGION_VARIANTS[readRegionVariant(region)].arms.headerPx;
    const twin = regionLayout({ width: frame.width, corner: { w: corner.width, h: corner.height }, armHeaderPx, arms: BRANCH_ARM_INPUTS });
    for (const [index, row] of twin.arms.entries()) {
      const painted = required<HTMLElement>(region, `[data-slot="region-arm"][data-arm-id="${row.id}"]`, `arm ${row.id}`).getBoundingClientRect();
      // The 1px slack is the frame's own border: an absolutely positioned
      // row is placed against the frame's PADDING box, `getBoundingClient
      // Rect` reports its border box.
      expect(Math.abs(painted.top - frame.top - row.rowTop), `arm ${row.id} (index ${index}) rowTop`).toBeLessThanOrEqual(1);
      expect(Math.abs(painted.height - (row.bottom - row.rowTop)), `arm ${row.id} row height`).toBeLessThanOrEqual(1);
    }
  },
};
