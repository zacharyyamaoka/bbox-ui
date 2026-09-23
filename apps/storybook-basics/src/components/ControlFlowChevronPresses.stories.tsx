/**
 * Components/Blocks/BlockRegion/Chevron Presses — a region's own controls own
 * their press. No drag gesture may claim it, whether the region is a member
 * (its own drag surface is the claimant) or a top-level node in tldraw (the
 * host's select tool is).
 *
 * WHY this file no longer presses a COLLAPSE CHEVRON on the corner card
 * (merge, 2026-09-22): there isn't one. Zach — "Please do not put chevron
 * drop downs on the regions" — and the control that replaced it is the
 * Blackbox toggle in the frame's top-right
 * (`[data-slot="region-blackbox-toggle"]`). The claim is unchanged and the
 * bug it pins is unchanged: a member's drag surface must not swallow a
 * press on a button inside it. Only the button moved. The ARM chevrons are
 * untouched — they fold one arm, and Zach kept them.
 *
 * The bugs these stories pin were found while answering Zach, 2026-09-21:
 * "Currently in regions — I seem to be able to drag the children inside but
 * not the things on the outside? why?" The outside half is by design: the
 * DOM Canvas owns no canvas-spanning drag, and the (ReactFlow) twins drag
 * every node. Checking the inside half turned up two claimants on the
 * chevrons, both measured with a real mouse. First, a member's drag surface
 * took pointer capture on any press, so every chevron of a region that is
 * itself a member was dead in all three hosts (nodeViews.tsx
 * `MEMBER_DRAG_VETO`). Second, tldraw's select tool took a top-level
 * region's arm chevron and dragged the whole region with it (tldrawHost.tsx
 * `contentOwnsPress`).
 *
 * WHY every "stayed put" check is paired with a "moved" check on the SAME
 * box: a box that could not be dragged at all would pass every "did not
 * move" assertion. Its own header dragging it by the exact delta is what
 * makes the negative claims mean ownership, not a dead surface.
 *
 * WHY the press-and-glide is the discriminating gesture and the click is
 * not: a play function's click is synthetic and dispatched straight at the
 * chevron, so pointer-capture retargeting never happens to it. It folds
 * with or without the fixes. What the fixes change is whether a drag
 * CLAIMS the press, and a claimed press moves the box under the pointer.
 * That is measurable here. The dead clicks themselves were measured
 * separately, with Playwright's real mouse.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { dragSteps } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { BRANCH_NESTED, BRANCH_ONE_INPUT } from "../scene/region.branch.fixtures";
import { expectArmsStacked, expectRegionExpanded, expectRegionOpaque } from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion/Chevron Presses",
  tags: ["object:region", "host:dom", "host:react-flow", "host:tldraw", "lane:region-outer-drag"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const TOLERANCE_PX = 1;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={760} height={680} />;
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={760} height={680} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <TldrawHost scene={scene} onSceneChange={setScene} width={1100} height={620} />;
}

/** Re-queried every time: React may hand back a different element after a
 *  scene write. */
const boxOf = (root: HTMLElement, selector: string) => required<HTMLElement>(root, selector, selector).getBoundingClientRect();

const regionOf = (id: string) => `[data-slot="region"][data-region-id="${id}"]`;
const armChevronOf = (armId: string) => `[data-arm-id="${armId}"] [data-slot="region-arm-header"] [data-slot="folding-chevron"]`;
/** The Blackbox toggle of THIS region and not a nested one's: a child of the
 *  region root's own frame, never a descendant reached through an arm body. */
const blackboxToggleOf = (regionId: string) => `${regionOf(regionId)} > [data-slot="region-frame"] > [data-slot="region-blackbox-toggle"]`;
/** The corner card's header. Not `[data-slot="bar-center"]`: BlockRegion
 *  draws a `Bar` there only when the card carries chips, and these fixtures
 *  carry none — the header is the bare title. */
const cornerTitleOf = (regionId: string) => `[data-block-id="${regionId}"] [data-slot="block-header"]`;

interface Glide {
  /** Where the box ended up, after release. */
  dx: number;
  dy: number;
  /** The furthest the box got from its start WHILE the pointer was down. */
  midMax: number;
}

/**
 * Press `selector`'s centre, glide by `by`, release — measuring the box at
 * `measured` after EVERY move as well as after release. Both event
 * families, the browser's own order (`hostGestures.ts`), so the host's own
 * gesture (React Flow's d3-drag, tldraw's select tool) sees the press too.
 *
 * WHY mid-glide and not only after release: a claimed press moves the box
 * UNDER the pointer, and that is what the user sees. A second claimant that
 * writes the scene at release can put the box back where it started, so an
 * after-release reading alone can hide a claim (measured on a port rail:
 * 40px mid-glide, 0px after release).
 */
async function pressAndGlide(root: HTMLElement, selector: string, by: { x: number; y: number }, measured: string): Promise<Glide> {
  const from = required<HTMLElement>(root, selector, selector);
  const start = from.getBoundingClientRect();
  const pressAt = { x: start.left + start.width / 2, y: start.top + start.height / 2 };
  const before = boxOf(root, measured);
  let midMax = 0;
  await dragSteps(from, { x: pressAt.x + by.x, y: pressAt.y + by.y }, {
    pressAt,
    steps: 4,
    onStep: () => {
      const now = boxOf(root, measured);
      midMax = Math.max(midMax, Math.hypot(now.left - before.left, now.top - before.top));
    },
  });
  const after = boxOf(root, measured);
  return { dx: after.left - before.left, dy: after.top - before.top, midMax };
}

function expectStayed(glide: Glide, why: string) {
  expect(glide.midMax, `${why} (while the pointer was down)`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(glide.dx), `${why} (x, after release)`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(glide.dy), `${why} (y, after release)`).toBeLessThanOrEqual(TOLERANCE_PX);
}

function expectMovedBy(glide: Glide, by: { x: number; y: number }, why: string) {
  expect(Math.abs(glide.dx - by.x), `${why} (x): moved ${glide.dx}px`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(glide.dy - by.y), `${why} (y): moved ${glide.dy}px`).toBeLessThanOrEqual(TOLERANCE_PX);
}

const GLIDE = { x: 40, y: 30 };
/** Short enough in y that `refine` stays inside its own arm body. */
const SMALL_GLIDE = { x: 40, y: 10 };

/** The measured fold: the row loses its body's height, not just a flag. */
async function clickFolds(root: HTMLElement, armId: string) {
  const rowHeight = () => boxOf(root, `[data-slot="region-arm"][data-arm-id="${armId}"]`).height;
  const openRow = rowHeight();
  await userEvent.click(required<HTMLElement>(root, armChevronOf(armId), `${armId}'s chevron`));
  await waitFor(() => expect(required<HTMLElement>(root, `[data-arm-id="${armId}"]`, armId).getAttribute("data-open")).toBe("false"));
  expect(openRow - rowHeight(), `the folded ${armId} row lost its body's height`).toBeGreaterThan(60);
}

/* ------------------------------------------------------------------ */
/* A region that is a MEMBER (a branch inside an arm)                  */
/* ------------------------------------------------------------------ */

async function nestedControlsKeepTheirPress(root: HTMLElement) {
  await expectRegionExpanded(root, "inner");
  await expectArmsStacked(root, "inner", ["inner-if", "inner-else"]);

  expectStayed(await pressAndGlide(root, armChevronOf("inner-else"), GLIDE, regionOf("inner")), "a press on a nested arm's chevron does not drag the region it sits in");
  expectStayed(await pressAndGlide(root, blackboxToggleOf("inner"), GLIDE, regionOf("inner")), "a press on a nested region's Blackbox toggle does not drag it");

  // Non-vacuity: the SAME boxes move when pressed on their own face. That
  // is the nested region by its corner title, and a member inside it by
  // its header (a member two surfaces deep still owns its own drag).
  expectMovedBy(await pressAndGlide(root, cornerTitleOf("inner"), GLIDE, regionOf("inner")), GLIDE, "inner's own header drags the nested region");
  expectMovedBy(
    await pressAndGlide(root, '[data-block-id="refine"] [data-slot="block-header"]', SMALL_GLIDE, '[data-block-id="refine"]'),
    SMALL_GLIDE,
    "refine's header drags refine",
  );

  await clickFolds(root, "inner-else");
  const expandedFrame = boxOf(root, `${regionOf("inner")} > [data-slot="region-frame"]`);
  await userEvent.click(required<HTMLElement>(root, blackboxToggleOf("inner"), "inner's Blackbox toggle"));
  await expectRegionOpaque(root, "inner");
  // WHY the claim is "same box" and not "shorter" (merge, 2026-09-22): the
  // toggle now draws Expanded OPAQUE — the frame at its own size with the
  // inside hidden — where the retired chevron drew the small P5 card. A
  // height that CHANGED would be the bug now. `expectRegionOpaque` above has
  // already measured that the arms and the frame are gone, so this is not a
  // claim that nothing happened.
  const opaqueFace = boxOf(root, `${regionOf("inner")} [data-slot="region-opaque-face"]`);
  expect(Math.abs(opaqueFace.width - expandedFrame.width), "Expanded Opaque keeps the frame's width").toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(opaqueFace.height - expandedFrame.height), "Expanded Opaque keeps the frame's height").toBeLessThanOrEqual(TOLERANCE_PX);
}

export const NestedRegionDomCanvas: Story = {
  name: "Nested region: its controls keep their press, its header drags (DOM Canvas)",
  render: () => <StatefulDomCanvas initial={BRANCH_NESTED} />,
  play: async ({ canvasElement }) => {
    await nestedControlsKeepTheirPress(canvasElement);
  },
};

export const NestedRegionReactFlow: Story = {
  name: "Nested region: its controls keep their press, its header drags (ReactFlow)",
  render: () => <StatefulReactFlow initial={BRANCH_NESTED} />,
  play: async ({ canvasElement }) => {
    // The top-level node the nested region lives in: React Flow's own node
    // drag must not start from any of the presses below either.
    await expectRegionExpanded(canvasElement, "br");
    const outerBefore = boxOf(canvasElement, regionOf("br"));
    await nestedControlsKeepTheirPress(canvasElement);
    const outerAfter = boxOf(canvasElement, regionOf("br"));
    expect(Math.abs(outerAfter.left - outerBefore.left), "no press inside a member reached React Flow's node drag (x)").toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(outerAfter.top - outerBefore.top), "no press inside a member reached React Flow's node drag (y)").toBeLessThanOrEqual(TOLERANCE_PX);
  },
};

/* ------------------------------------------------------------------ */
/* A TOP-LEVEL region in tldraw                                        */
/* ------------------------------------------------------------------ */

export const TopLevelRegionTldraw: Story = {
  name: "Top-level region: its arm chevrons keep their press, its header drags (tldraw)",
  render: () => <StatefulTldraw initial={BRANCH_ONE_INPUT} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "br");
    await expectArmsStacked(canvasElement, "br", ["if", "else"]);

    // tldraw's select tool must not take an arm chevron's press: it would
    // translate the whole region, and capture swallows the click.
    expectStayed(await pressAndGlide(canvasElement, armChevronOf("else"), GLIDE, regionOf("br")), "a press on a top-level arm's chevron does not drag the region");
    // Non-vacuity: the region's own header is still tldraw's drag surface.
    expectMovedBy(await pressAndGlide(canvasElement, cornerTitleOf("br"), GLIDE, regionOf("br")), GLIDE, "br's own header drags the region");

    await clickFolds(canvasElement, "else");
  },
};
