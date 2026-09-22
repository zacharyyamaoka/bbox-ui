import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { BlockPort } from "./blockPort";
import { PAINT_TIER_ORDER, paintTier } from "./paintOrder";
import type { PortEdgeItem } from "./portEdge";
import { PortEdge } from "./portEdge";

/**
 * Components/Blocks/PaintOrder — Card 04's measured suite: paintOrder.ts's ladder,
 * the isolation invariant, and the nesting tier (Card 04) it exists to
 * make possible. Every claim here is measured
 * (`getComputedStyle`/`getBoundingClientRect`/`document.elementFromPoint`),
 * never inferred from an element merely existing (repo rule) — see
 * BlockPort.stories.tsx's own `expectRailPaintsAboveBlock` for the same
 * discipline this file borrows.
 *
 * Two things this file deliberately does NOT re-prove, because another
 * story already does and re-deriving it here would be the implementation
 * grading its own homework a second time: `BlockPort.stories.tsx`'s
 * `StackingAboveBlock` (a rail paints above its Block) and
 * `BlockPortLane.stories.tsx`'s lane-vs-member-drag suite. This file's
 * job is the TOKENS those behaviours now read from, the ISOLATION that
 * makes the tokens safe to reuse across files, and the ONE new tier
 * (`headerChrome`) neither of those files exercises.
 */
const meta = {
  title: "Components/Blocks/PaintOrder",
  tags: ["object:block", "lane:z-order"],
  component: Block,
} satisfies Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function zIndexOf(el: Element): string {
  return getComputedStyle(el).zIndex;
}

function isolationOf(el: Element): string {
  return getComputedStyle(el).isolation;
}

/** A real pointer drag session, paused mid-drag so a test can measure
 *  `isDragging` state before completing the gesture. `@dnd-kit`'s
 *  `PointerSensor` needs `pointerdown` → a move past its 4px activation
 *  distance → `pointerup`; a bare `pointerdown` alone never arms it
 *  (BlockPortLane.stories.tsx's own `pointerDrag` doc). */
function fire(el: Element, type: string, x: number, y: number): void {
  el.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
  );
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* TokensReproduceTodaysNumbers — the no-op half of the refactor,        */
/* measured on real mounted components rather than read back off        */
/* paintOrder.ts's own source. Also the isolation invariant.            */
/* ------------------------------------------------------------------ */

const RAIL_ITEMS: PortEdgeItem[] = [
  { id: "in-a", label: "a", state: "wired" },
  { id: "in-b", label: "b", state: "empty" },
];

function TokensDemo() {
  return (
    <div style={{ display: "flex", gap: 40, padding: 40 }}>
      <BlockPort id="tokens" view="port" edges={{ left: { items: RAIL_ITEMS } }} functionPort>
        <Block header="Planner" body="body" footer="ready" width={220} height={160} diagnostics={[{ id: "d1", severity: "error", message: "dangling edge", code: "dangling-edge" }]} />
      </BlockPort>
    </div>
  );
}

export const TokensReproduceTodaysNumbers: Story = {
  render: () => <TokensDemo />,
  play: async ({ canvasElement }) => {
    const wrapper = required<HTMLElement>(canvasElement, '[data-slot="block-port"]', "the BlockPort wrapper");
    const block = required<HTMLElement>(wrapper, ':scope > [data-slot="block"]', "the Block");
    const header = required<HTMLElement>(block, ':scope > [data-slot="block-header"]', "the header");
    const footer = required<HTMLElement>(block, ':scope > [data-slot="block-footer"]', "the footer");
    const flag = required<HTMLElement>(block, ':scope > [data-slot="block-diagnostic-flag"]', "the diagnostic flag");
    const functionPort = required<HTMLElement>(wrapper, ':scope > [data-slot="block-port-function"]', "the function port");
    const rail = required<HTMLElement>(wrapper, ':scope > [data-slot="block-port-rail"][data-edge="left"]', "the left rail");

    // Every non-auto zIndex in the subtree equals a value paintOrder.ts
    // actually exports — walked generically (not just the five named
    // spots above) so a SIXTH raw literal introduced anywhere in this
    // subtree would also be caught here, not just by the grep guard.
    const exported = new Set(PAINT_TIER_ORDER.map((name) => String(paintTier(name))));
    const allNodes = wrapper.querySelectorAll<HTMLElement>("*");
    for (const node of [wrapper, ...Array.from(allNodes)]) {
      const z = zIndexOf(node);
      if (z === "auto") continue;
      await expect(exported.has(z)).toBe(true);
    }

    // The five pre-existing call sites, exactly:
    await expect(zIndexOf(functionPort)).toBe(String(paintTier("portDot")));
    await expect(zIndexOf(rail)).toBe(String(paintTier("portDot")));
    await expect(zIndexOf(flag)).toBe(String(paintTier("flagBadge")));

    // The NEW tier this lane adds:
    await expect(zIndexOf(header)).toBe(String(paintTier("headerChrome")));
    await expect(zIndexOf(footer)).toBe(String(paintTier("headerChrome")));

    // The isolation invariant: every root that emits a tier walls it off.
    await expect(isolationOf(wrapper)).toBe("isolate");
    await expect(isolationOf(block)).toBe("isolate");
  },
};

/* ------------------------------------------------------------------ */
/* PortEdgeTokens — the two portEdge.tsx call sites: the resting/        */
/* dragging card and the lane overlay, plus its own isolation root.     */
/* ------------------------------------------------------------------ */

const CUSTOM_ITEMS: PortEdgeItem[] = [
  { id: "p1", label: "alpha", state: "wired" },
  { id: "p2", label: "beta", state: "empty" },
];

const LANE_ITEMS: PortEdgeItem[] = [
  { id: "q1", label: "one", state: "wired" },
  { id: "q2", label: "two", state: "empty" },
];

function PortEdgeTokensDemo() {
  return (
    <div style={{ display: "flex", gap: 60, padding: 40 }}>
      {/* Custom mode: `FreeSlotCard`, the ONLY place the
          `memberContent`/`dragActive` pair applies — `laneAvailability`
          refuses Custom mode outright, so this track never opens a lane. */}
      <div data-testid="custom-track-stage">
        <PortEdge edge="left" items={CUSTOM_ITEMS} mode="custom" freeOffsets={{ p1: 0, p2: 60 }} size={{ width: 90, height: 220 }} />
      </div>
      {/* Auto mode, column edge, armed for multi-line editing: the ONE
          configuration `laneAvailability` actually allows the lane on. */}
      <div data-testid="lane-track-stage">
        <PortEdge edge="left" items={LANE_ITEMS} mode="auto" editing editMode="multi" size={{ width: 140, height: 220 }} />
      </div>
    </div>
  );
}

export const PortEdgeTokens: Story = {
  render: () => <PortEdgeTokensDemo />,
  play: async ({ canvasElement }) => {
    const customStage = required<HTMLElement>(canvasElement, '[data-testid="custom-track-stage"]', "the custom-mode stage");
    const laneStage = required<HTMLElement>(canvasElement, '[data-testid="lane-track-stage"]', "the auto-mode stage");
    const customTrack = required<HTMLElement>(customStage, '[data-slot="port-edge"]', "the custom-mode track");
    const laneTrack = required<HTMLElement>(laneStage, '[data-slot="port-edge"]', "the auto-mode track");
    await expect(isolationOf(customTrack)).toBe("isolate");
    await expect(isolationOf(laneTrack)).toBe("isolate");

    const cards = Array.from(customTrack.querySelectorAll<HTMLElement>('[data-slot="port-edge-card"]'));
    await expect(cards.length).toBe(2);
    // Resting: `memberContent` (was the literal `1` half of
    // `isDragging ? 10 : 1`).
    for (const card of cards) await expect(zIndexOf(card)).toBe(String(paintTier("memberContent")));

    // Drag the first card and measure the mid-drag bump before completing
    // the gesture.
    const dragged = cards[0];
    const rect = dragged.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    fire(dragged, "pointerdown", startX, startY);
    await wait(30);
    fire(dragged, "pointermove", startX, startY + 20);
    await wait(30);
    await expect(dragged.getAttribute("data-dragging")).toBe("true");
    await expect(zIndexOf(dragged)).toBe(String(paintTier("dragActive")));
    fire(dragged, "pointerup", startX, startY + 20);
    await wait(60);
    await expect(zIndexOf(dragged)).toBe(String(paintTier("memberContent")));

    // Open the lane on the OTHER track (a click on a port item, armed by
    // editing+editMode "multi" on a column edge in Auto mode —
    // `laneAvailability`'s own rule) and measure its overlay's tier.
    const laneMember = required<HTMLElement>(laneTrack, '[data-slot="port-edge-member"]', "the lane track's first port");
    laneMember.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    // The click triggers a React state update (`setLaneOpen(true)`), which
    // does not flush synchronously — a bare querySelector immediately
    // after `dispatchEvent` can race the re-render.
    await waitFor(() => expect(laneTrack.querySelector('[data-slot="port-edge-lane"]')).not.toBeNull());
    const lane = required<HTMLElement>(laneTrack, '[data-slot="port-edge-lane"]', "the opened lane overlay");
    await expect(zIndexOf(lane)).toBe(String(paintTier("laneOverlay")));
  },
};

/* ------------------------------------------------------------------ */
/* NestedChildStaysBehindHeader — Card 04's own acceptance test.        */
/* Three Blocks deep: Root > Mid (a free member) > Leaf (a free member  */
/* of Mid). Leaf's body holds a `PortEdge` card — the ONE piece of       */
/* content in this fixture whose tier (`dragActive`, 10) is NUMERICALLY */
/* HIGHER than Root's own `headerChrome` (2). That is deliberate: a      */
/* diagnostic flag (`flagBadge`, 1) would stay below headerChrome        */
/* whether or not isolation existed at all, which would make this test  */
/* pass for the wrong reason (unable to tell "isolation capped it" from */
/* "the number was already smaller"). `dragActive` is the one call site */
/* that can actually exceed headerChrome, so it is the one that proves  */
/* the invariant rather than assuming it.                               */
/*                                                                       */
/* Mid is positioned with a negative `y` so the whole nested subtree's  */
/* box genuinely overlaps Root's header — measured, not assumed.        */
/* ------------------------------------------------------------------ */

const LEAF_PORT_ITEMS: PortEdgeItem[] = [{ id: "only", label: "x", state: "wired" }];

// Header-LESS on purpose: three Block levels already stack three
// headers' worth of vertical offset before reaching any body content,
// which pushes the thing actually under test (the draggable card) well
// past Root's header band. Omitting Leaf's own header (Block treats a
// `header={undefined}` slot as entirely absent, not merely empty — see
// block.tsx's own doc) keeps the card close enough to Leaf's own top
// edge for the fixture's offsets to place it inside Root's header band.
function LeafBlock() {
  return (
    <Block
      width={100}
      height={60}
      body={<PortEdge edge="left" items={LEAF_PORT_ITEMS} mode="custom" freeOffsets={{ only: 0 }} size={{ width: 40, height: 40 }} />}
    />
  );
}

function MidBlock() {
  const midMembers: BlockMember[] = [{ id: "leaf", x: 10, y: 10, width: "own", content: <LeafBlock /> }];
  return <Block header="Mid" width={180} height={140} members={midMembers} membersLayout="free" />;
}

// Pushed well above the members region's own top edge (a negative `y`)
// so the whole Mid/Leaf subtree's box reaches up INTO Root's header row
// — Root's own `overflow: clip` only clips at ROOT's border box, and
// this offset is chosen to stay well inside it (Root is 340px tall).
const ROOT_MEMBERS: BlockMember[] = [{ id: "mid", x: 30, y: -82, width: "own", content: <MidBlock /> }];

function NestingDemo() {
  return (
    <div style={{ padding: 60 }}>
      <Block header="Root" width={340} height={340} members={ROOT_MEMBERS} membersLayout="free" />
    </div>
  );
}

export const NestedChildStaysBehindHeader: Story = {
  render: () => <NestingDemo />,
  play: async ({ canvasElement }) => {
    const rootBlock = required<HTMLElement>(canvasElement, '[data-slot="block"]', "the root Block");
    const rootHeader = required<HTMLElement>(rootBlock, ':scope > [data-slot="block-header"]', "the root's header");
    const midBlock = required<HTMLElement>(canvasElement, '[data-slot="block-header"] ~ [data-slot="block-members"] [data-slot="block"]', "the Mid block");
    const leafBlock = required<HTMLElement>(midBlock, ':scope [data-slot="block-header"] ~ [data-slot="block-members"] [data-slot="block"]', "the Leaf block");
    const leafCard = required<HTMLElement>(leafBlock, '[data-slot="port-edge-card"]', "the leaf's port-edge card");

    // Setup sanity: the fixture actually produces a genuine overlap. If
    // this fails, the specimen's offsets need adjusting — it is not yet
    // testing the invariant at all.
    const headerRect = rootHeader.getBoundingClientRect();
    const cardRectAtRest = leafCard.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    await expect(overlaps(cardRectAtRest, headerRect)).toBe(true);

    // AT REST the card is `memberContent` (1) — safely below headerChrome
    // (2) regardless of isolation, so this alone would not distinguish
    // the two. Start a real drag (pointerdown, then a small move past the
    // 4px activation distance) to reach `dragActive` (10) — a tier that
    // NUMERICALLY EXCEEDS headerChrome, so the isolation invariant is
    // what has to do the actual work below, not raw magnitude.
    await expect(zIndexOf(leafCard)).toBe(String(paintTier("memberContent")));
    const startX = cardRectAtRest.left + cardRectAtRest.width / 2;
    const startY = cardRectAtRest.top + cardRectAtRest.height / 2;
    fire(leafCard, "pointerdown", startX, startY);
    await wait(30);
    fire(leafCard, "pointermove", startX + 6, startY + 6);
    await wait(30);
    await expect(leafCard.getAttribute("data-dragging")).toBe("true");
    await expect(zIndexOf(leafCard)).toBe(String(paintTier("dragActive")));

    // The measured claim, taken WHILE dragging: at a pixel genuinely
    // inside both the (now-transformed) card's rect and Root's header
    // rect, the topmost element is the ROOT's header (or a descendant of
    // it) — never the leaf's card or anything inside it — even though
    // the card's own tier (10) outranks the header's (2) numerically.
    // That gap is only closed by isolation: each Block/PortEdge root
    // between Leaf and Root traps its own interior maximum, so what Root
    // actually compares the header against is the whole nested
    // subtree's OWN stack level (auto/0), not its interior's max.
    const cardRectDragging = leafCard.getBoundingClientRect();
    await expect(overlaps(cardRectDragging, headerRect)).toBe(true);
    const overlapCenterX = Math.round((Math.max(cardRectDragging.left, headerRect.left) + Math.min(cardRectDragging.right, headerRect.right)) / 2);
    const overlapCenterY = Math.round((Math.max(cardRectDragging.top, headerRect.top) + Math.min(cardRectDragging.bottom, headerRect.bottom)) / 2);
    const hit = document.elementFromPoint(overlapCenterX, overlapCenterY);
    if (!hit) throw new Error(`nothing painted at (${overlapCenterX}, ${overlapCenterY}); the specimen is off-screen`);
    await expect(hit.closest('[data-slot="block-header"]')).toBe(rootHeader);
    await expect(hit.closest('[data-slot="port-edge-card"]')).toBeNull();

    fire(leafCard, "pointerup", startX + 6, startY + 6);
    await wait(60);

    // And the isolation invariant, named directly: every root between
    // the dragging card and Root's own header is isolated.
    const leafPortEdge = required<HTMLElement>(leafBlock, '[data-slot="port-edge"]', "the leaf's port-edge root");
    await expect(isolationOf(rootBlock)).toBe("isolate");
    await expect(isolationOf(midBlock)).toBe("isolate");
    await expect(isolationOf(leafBlock)).toBe("isolate");
    await expect(isolationOf(leafPortEdge)).toBe("isolate");
  },
};
