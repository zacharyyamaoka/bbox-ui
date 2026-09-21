/**
 * Blocks/Fit To Content Hosts — Zach's second success criterion: "a non
 * buggy example of me being able to drag around a child member in
 * reactflow/tldraw and having the parent frame redraw itself
 * automatically." The first criterion (a plain-DOM before/after gallery)
 * already shipped as `FitToContent.stories.tsx`; this file is the host
 * half that lane's own "owed wiring" pointed at (its `ParentFitsChildren`
 * story drives the fit from a button click — this drives it from a real
 * pointer gesture, inside a real canvas engine, on both engines that ship
 * here).
 *
 * ───────────────────────────────────────────────────────────────────────
 * THE WIRING — everything lives in `src/hosts/**`, nothing in
 * `src/components/**`
 *
 *   • `hosts/hostScene.ts` — `HostNodeData.membersLayout`/`.autoFit`
 *     (additive; every prior fixture leaves them unset) and the
 *     `DRAG_MEMBER_SCENE` fixture below reads from.
 *   • `hosts/memberDrag.ts` — `useFreeMemberDrag`: plain pointer capture,
 *     bounded to the member's own box, ONE boundary per members region
 *     (mirrors `blockMembers.tsx`'s own `MemberDndBoundary` for `stack`).
 *   • `hosts/blockAutoFit.ts` — `useAutoFitHeight`: measures chrome +
 *     member rects, calls `fitToContent.ts`'s `blockExpandedFitHeight`,
 *     and carries the reentrancy latch (see that file's own doc for the
 *     mutation-verified claim about it).
 *   • `hosts/nodeViews.tsx` — `BlockNodeView` wires the three together and
 *     `moveMember` writes a settled drag back into the scene's own
 *     `SceneNode.position` (already documented as free layout's contract,
 *     scene.ts:60-72 — never read or written before this lane).
 *
 * `ReactFlowHost`/`TldrawHost` themselves are UNCHANGED — a free/autoFit
 * node is still just a `type: "block"` node to both; the fit-and-drag
 * machinery is entirely inside the shared `SceneNodeView` translation
 * layer, so it renders under EITHER engine for free. That is the concrete
 * shape of "the host owns the box, the box drives the wiring": neither
 * host file needed a single line changed.
 *
 * WHY member dragging is `nodrag`, not a THIRD per-host mechanism: React
 * Flow's own `dragHandle` filter and tldraw's `contentOwnsPress` (this
 * app's existing `POINTER_OWNED_CLASS` marker, nodeViews.tsx) already both
 * key off that one class — putting it on the drag wrapper below means
 * neither host's own node-drag/pan/select gesture can ever start from a
 * member press, with zero engine-specific code written for it here.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { dragFrom, dragSteps } from "../hosts/hostGestures";
import { DRAG_MEMBER_SCENE, type HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { BLOCK_MEMBER_INSET_PX } from "../components/blockMembers";

const meta = {
  title: "Blocks/Fit To Content Hosts",
  tags: ["area:blocks", "lane:fit-to-content-hosts"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** How far "classify" is dragged down, in screen px — both hosts sit at
 *  zoom 1 (`defaultViewport`/`setCamera` below), so this equals the
 *  member-local px the drag should settle at. */
const DRAG_DOWN_PX = 120;

/** Filled in by the play function via `textContent` once it has measured
 *  something — a capture-time readout, not a React-driven one, since the
 *  numbers it prints (before/after box heights) only exist once the play
 *  function's own gesture has run. Empty by default, exactly like the
 *  render-only path every other story on this file exercises. */
function Readout() {
  return (
    <div data-testid="readout" style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, maxWidth: 480 }} />
  );
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <div>
      <ReactFlowHost scene={scene} onSceneChange={setScene} width={480} height={360} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      <Readout />
    </div>
  );
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <div>
      <TldrawHost scene={scene} onSceneChange={setScene} width={480} height={360} />
      <Readout />
    </div>
  );
}

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** `sorter`'s own rendered `Block` box, in EITHER host — `data-scene-node`
 *  (the host's own top-level element) down to `data-slot="block"`, exactly
 *  the same descendant chain `SceneHosts.stories.tsx`'s own helpers use, so
 *  this reads correctly through the extra wrapper div a `membersLayout:
 *  "free"` node now renders (`nodeViews.tsx`'s own comment on that div). */
function sorterBox(host: HTMLElement) {
  const block = required<HTMLElement>(host, '[data-scene-node="sorter"] [data-block-id="sorter"] [data-slot="block"]', "sorter's Block");
  return block.getBoundingClientRect();
}

/** "classify"'s own drag surface — the wrapper `nodeViews.tsx` renders
 *  around a free member's content, marked `data-slot="block-member-drag-
 *  handle"`. Pressing anywhere on this box starts the gesture. */
function classifyHandle(host: HTMLElement): HTMLElement {
  return required<HTMLElement>(
    host,
    '[data-scene-node="sorter"] [data-member-id="classify"] [data-slot="block-member-drag-handle"]',
    "classify's drag handle",
  );
}

/** `classify`'s own SLOT — `BlockMembers`' `[data-slot="block-member"]`,
 *  positioned at the member's live (x, y) and sized to its content, which
 *  is what "does classify stay inside sorter" actually has to measure. */
function classifySlot(host: HTMLElement): HTMLElement {
  return required<HTMLElement>(host, '[data-scene-node="sorter"] [data-member-id="classify"]', "classify's own slot");
}

function readout(host: HTMLElement): HTMLElement {
  // The readout is a SIBLING of the host, not inside it — walk up one level
  // from the host's own root to find it, same shape every other story's
  // `data-testid="readout"` next to (not inside) its host uses.
  return required<HTMLElement>(host.parentElement ?? host, '[data-testid="readout"]', "the readout");
}

/**
 * Drag "classify" down by `DRAG_DOWN_PX` and assert the parent tracked it
 * CONTINUOUSLY (not just at release), then assert containment and
 * convergence at rest. Returns the before/after heights so a caller can
 * either stop here (the two `...Settled` capture stories) or drag back up
 * (the two round-trip stories below).
 */
async function dragMemberDown(host: HTMLElement): Promise<{ startHeight: number; endHeight: number }> {
  await waitFor(() => {
    required(host, '[data-scene-node="sorter"] [data-block-id="ingest"]', "ingest rendered inside sorter");
    required(host, '[data-scene-node="sorter"] [data-block-id="classify"]', "classify rendered inside sorter");
  });

  const startHeight = sorterBox(host).height;
  const startSlotTop = classifySlot(host).getBoundingClientRect().top;

  const handleBefore = classifyHandle(host).getBoundingClientRect();
  const pressAt = { x: handleBefore.left + handleBefore.width / 2, y: handleBefore.top + handleBefore.height / 2 };
  const downTarget = { x: pressAt.x, y: pressAt.y + DRAG_DOWN_PX };

  /* -- Drag: the parent must track the child WHILE the gesture is still
   * in flight, not only once it settles — "having the parent frame
   * redraw itself automatically" is a claim about the whole gesture. */
  let sawGrowthDuringDrag = false;
  await dragSteps(classifyHandle(host), downTarget, {
    pressAt,
    steps: 5,
    onStep: () => {
      const slot = classifySlot(host).getBoundingClientRect();
      const box = sorterBox(host);
      // Containment holds at EVERY sampled point, not just at the end —
      // the class of bug this lane's fixed-height demo (FitToContent
      // .stories.tsx's `ParentFitsChildren`) showed as a member silently
      // vanishing past `overflow: clip` never gets a chance to occur.
      expect(slot.bottom).toBeLessThanOrEqual(box.bottom + 1);
      if (box.height > startHeight + 1) sawGrowthDuringDrag = true;
    },
  });
  expect(sawGrowthDuringDrag).toBe(true);

  /* -- At rest: classify is fully contained, with the region's own
   * gutter beneath it — a fit, not merely "big enough". */
  await waitFor(() => {
    const slot = classifySlot(host).getBoundingClientRect();
    const box = sorterBox(host);
    expect(slot.bottom).toBeLessThanOrEqual(box.bottom + 1);
    expect(box.bottom - slot.bottom).toBeCloseTo(BLOCK_MEMBER_INSET_PX, 0);
  });

  /* -- Convergence: the SAME box, sampled twice a frame apart. This is
   * the reentrancy latch's own acceptance test (blockAutoFit.ts's own
   * doc) — a loop that merely happens to settle would still show SOME
   * jitter between these two reads; a fixed point does not. */
  const settledOnce = sorterBox(host).height;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const settledTwice = sorterBox(host).height;
  expect(settledTwice).toBeCloseTo(settledOnce, 0);

  /* -- The member actually moved DOWN by the drag distance — not just
   * "the box got bigger for some reason". */
  const endSlotTop = classifySlot(host).getBoundingClientRect().top;
  expect(endSlotTop - startSlotTop).toBeCloseTo(DRAG_DOWN_PX, 0);

  /* -- The parent GREW — the headline claim, as a number. */
  expect(settledTwice).toBeGreaterThan(startHeight + DRAG_DOWN_PX - 10);

  readout(host).textContent =
    `sorter: ${Math.round(startHeight)}px → ${Math.round(settledTwice)}px ` +
    `(classify dragged down ${DRAG_DOWN_PX}px, gutter kept: ${BLOCK_MEMBER_INSET_PX}px)`;

  return { startHeight, endHeight: settledTwice };
}

/** Drag "classify" back to its authored position and assert the box gives
 *  the space back — floored, but also not stuck expanded. */
async function dragMemberBackUp(host: HTMLElement, startHeight: number): Promise<void> {
  const handleAtRest = classifyHandle(host).getBoundingClientRect();
  const restCentre = { x: handleAtRest.left + handleAtRest.width / 2, y: handleAtRest.top + handleAtRest.height / 2 };
  await dragFrom(classifyHandle(host), { x: restCentre.x, y: restCentre.y - DRAG_DOWN_PX }, { pressAt: restCentre });
  await waitFor(() => {
    expect(sorterBox(host).height).toBeCloseTo(startHeight, 0);
  });
  readout(host).textContent = `sorter: back to ${Math.round(sorterBox(host).height)}px — the floor gives the space back too`;
}

export const DragMemberReactFlow: Story = {
  name: "Drag A Member (React Flow)",
  render: () => <StatefulReactFlow initial={DRAG_MEMBER_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const { startHeight } = await dragMemberDown(host);
    await dragMemberBackUp(host, startHeight);
  },
};

export const DragMemberTldraw: Story = {
  name: "Drag A Member (tldraw)",
  render: () => <StatefulTldraw initial={DRAG_MEMBER_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    const { startHeight } = await dragMemberDown(host);
    await dragMemberBackUp(host, startHeight);
  },
};

/**
 * The report's own captures: drag down and STOP (no round trip), so the
 * screenshot shows the grown box rather than the fully-reset end state the
 * two stories above settle on. Same assertions as the first half of the
 * round trip — this is not a weaker demo, it just doesn't undo itself.
 */
export const DragMemberReactFlowSettled: Story = {
  name: "Drag A Member — Settled (React Flow)",
  render: () => <StatefulReactFlow initial={DRAG_MEMBER_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    await dragMemberDown(host);
  },
};

export const DragMemberTldrawSettled: Story = {
  name: "Drag A Member — Settled (tldraw)",
  render: () => <StatefulTldraw initial={DRAG_MEMBER_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await dragMemberDown(host);
  },
};
