/**
 * src/components/PortEdge.AnchorLayouts.stories.tsx — W1's own acceptance
 * story (docs/WORK-ORDER-2026-09-18.md; ported 2026-09-30 from
 * `claude/w1-anchor-layout` f00fb2b, where it lived under the since-renamed
 * `src/stories/`): a genuinely NON-LINEAR layout,
 * registered from OUTSIDE `portEdge.layout.ts`, proving the anchor
 * registry (`registerPortLayout`/`portLayout`, `PortEdgeProps.anchorLayout`)
 * is a real seam and not merely an internal wrapper around the three
 * built-in schemes — those stay proven byte-identical by every UNEDITED
 * story in `PortEdge.stories.tsx` (this folder), which this file never
 * touches.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { useState } from "react";

import { PortEdge, type PortEdgeItem } from "./portEdge";
import { registerPortLayout, type Anchor, type PortLayoutFn } from "./portEdge.layout";

/**
 * A closed ellipse, ordered by ANGLE around it rather than along either
 * screen axis — the one property that makes it "genuinely non-linear":
 * no `SpacingScheme`/`aligned` config can express a member whose
 * neighbour on the rail is behind or below it rather than beside it.
 * `rail.mainSize` is read as the ellipse's own width (so the demo still
 * answers to the box `PortEdge` gives it); `radiusY` — the one number a
 * single-axis `rail` has no field for — comes from `args`, exactly the
 * escape hatch `PortLayoutFn`'s own `args?: unknown` exists for.
 */
const ellipseLayout: PortLayoutFn = (items, rail, args) => {
  const { radiusY } = (args as { radiusY?: number } | undefined) ?? {};
  const ry = radiusY ?? rail.mainSize / 4;
  const rx = rail.mainSize / 2;
  const n = items.length;
  const anchors: Anchor[] = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2; // start at 12 o'clock, clockwise
    anchors.push({ x: rx + rx * Math.cos(angle), y: ry + ry * Math.sin(angle), angle });
  }
  return anchors;
};

// Registered once, at module scope, before any story asks `<PortEdge>`
// for it by name — `registerPortLayout`'s own contract (see that
// function's doc in portEdge.layout.ts).
registerPortLayout("ellipse", ellipseLayout);

const ELLIPSE_ITEMS: PortEdgeItem[] = [
  { id: "n0", label: "n0", state: "wired" },
  { id: "n1", label: "n1", state: "empty" },
  { id: "n2", label: "n2", state: "empty" },
  { id: "n3", label: "n3", state: "empty" },
  { id: "n4", label: "n4", state: "received" },
];

function EllipseDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(ELLIPSE_ITEMS);
  return (
    <PortEdge
      edge="top"
      items={items}
      onItemsChange={setItems}
      mode="auto"
      anchorLayout={{ name: "ellipse", args: { radiusY: 90 } }}
      size={{ width: 320, height: 220 }}
      showContainer
    />
  );
}

/**
 * Same technique `PortEdge.stories.tsx`'s own `dragCard` uses (that
 * file's doc explains each part) — duplicated locally rather than
 * imported, since this file must not edit that one (W1's own rule: the
 * 16 existing stories prove the built-ins unedited).
 */
async function dragCard(from: Element, to: Element) {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
}

function labelOf(card: Element): string | null {
  return card.querySelector('[data-slot="port-label-display"]')?.textContent ?? null;
}

const meta = {
  // Section/family/tags per `src/storyOrganisation.test.ts` (proposal B):
  // the branch's `Ports/…` title and `area:ports` tag predate that rule.
  title: "Components/Ports/PortEdge Anchor Layouts",
  tags: ["object:port", "lane:w1-anchor-layout"],
  component: PortEdge,
  args: { edge: "top", items: [] },
} satisfies Meta<typeof PortEdge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ellipse: Story = {
  render: () => <EllipseDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    const cardsBefore = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    await expect(cardsBefore).toHaveLength(5);

    // The registry is real: every card sits on the ellipse, not a
    // straight line — measured, not merely "it rendered". A straight
    // line has one axis with (near-)zero spread; the ellipse must vary
    // on BOTH.
    const rectsBefore = cardsBefore.map((c) => c.getBoundingClientRect());
    const xs = rectsBefore.map((r) => r.left + r.width / 2);
    const ys = rectsBefore.map((r) => r.top + r.height / 2);
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    await expect(spread(xs)).toBeGreaterThan(50);
    await expect(spread(ys)).toBeGreaterThan(50);

    // n0 (12 o'clock) and n1 (its clockwise neighbour) are NOT
    // side-by-side on one axis — n1 sits both to the right of AND below
    // n0, which no single-axis rail layout could ever produce.
    const n0Before = rectsBefore[0];
    const n1Before = rectsBefore[1];
    await expect(n1Before.left).toBeGreaterThan(n0Before.left);
    await expect(n1Before.top).toBeGreaterThan(n0Before.top);

    // Dragging reorders the ARRAY (`arrayMove`, the only write a drag
    // ever makes — W1's own rule): drag n0 onto n3's anchor. Proved by
    // measurement, not DOM presence — n0's card now sits at
    // (approximately) n3's PRE-drag position, the anchor a
    // `nearestAnchor`-resolved drop actually lands on.
    const n3RectBefore = rectsBefore[3];
    await dragCard(cardsBefore[0], cardsBefore[3]);

    const cardsAfter = Array.from(track.querySelectorAll('[data-slot="port-edge-card"]'));
    await expect(cardsAfter).toHaveLength(5);
    const labelsAfter = cardsAfter.map(labelOf);
    await expect(labelsAfter).not.toEqual(["n0", "n1", "n2", "n3", "n4"]); // order actually changed

    const n0After = cardsAfter.find((c) => labelOf(c) === "n0");
    if (!n0After) throw new Error("expected n0's card to still exist after the drag");
    const n0RectAfter = n0After.getBoundingClientRect();
    // Within a few px of n3's OLD anchor — not "moved somewhere", but
    // moved to the specific point the drag targeted.
    await expect(Math.abs(n0RectAfter.left - n3RectBefore.left)).toBeLessThan(4);
    await expect(Math.abs(n0RectAfter.top - n3RectBefore.top)).toBeLessThan(4);
  },
};

/**
 * The `anchored` distribution (`AnchoredConfig`, ported 2026-09-30 from
 * `claude/notebook-lab-work-order-472c22` 27b4314): the host supplies one
 * leading-edge offset per slot id and the edge honours it — resolved
 * through the SAME registry as every other mode (the `"anchored"`
 * `PortLayoutFn`), not a second positioning path. Offsets deliberately
 * NON-monotonic in item order (b above c), because a notebook port's
 * position is the row that binds its name, not its index.
 */
const ANCHORED_ITEMS: PortEdgeItem[] = [
  { id: "a", label: "a", state: "wired" },
  { id: "b", label: "b", state: "empty" },
  { id: "c", label: "c", state: "empty" },
];
const ANCHORED_OFFSETS: Record<string, number> = { a: 0, b: 96, c: 40 };

function AnchoredDemo() {
  const [items, setItems] = useState<PortEdgeItem[]>(ANCHORED_ITEMS);
  return (
    <div data-testid="anchored-order" data-order={items.map((i) => i.id).join(",")}>
      <PortEdge
        edge="left"
        items={items}
        onItemsChange={setItems}
        mode="auto"
        distribution={{ mode: "anchored", offsets: ANCHORED_OFFSETS }}
        size={{ width: 44, height: 200 }}
        showContainer
      />
    </div>
  );
}

export const Anchored: Story = {
  render: () => <AnchoredDemo />,
  play: async ({ canvasElement }) => {
    const track = canvasElement.querySelector('[data-slot="port-edge"]');
    if (!(track instanceof HTMLElement)) throw new Error('expected a [data-slot="port-edge"]');
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-slot="port-edge-card"]'));
    await expect(cards).toHaveLength(3);
    const byLabel = new Map(cards.map((card) => [labelOf(card), card]));

    // Every card sits at ITS offset, measured: the leading edge (top, on a
    // left rail) of each card relative to `a`'s equals the offset
    // difference the host supplied — b 96 px below a, c 40 px below a,
    // so c sits BETWEEN a and b although it comes last in item order.
    const topOf = (label: string) => {
      const card = byLabel.get(label);
      if (!card) throw new Error(`expected a card labelled ${label}`);
      return card.getBoundingClientRect().top;
    };
    await expect(Math.abs(topOf("b") - topOf("a") - 96)).toBeLessThan(0.5);
    await expect(Math.abs(topOf("c") - topOf("a") - 40)).toBeLessThan(0.5);

    // No gesture on an anchored card: no dnd-kit `role="button"`/tab stop,
    // no grab cursor, and a drag of `a` onto `b` writes nothing — the
    // order the host holds is unchanged.
    for (const card of cards) {
      await expect(card.hasAttribute("data-anchored")).toBe(true);
      await expect(card.getAttribute("role")).toBeNull();
      await expect(card.style.cursor).toBe("");
    }
    const aTopBefore = topOf("a");
    await dragCard(byLabel.get("a")!, byLabel.get("b")!);
    const order = canvasElement.querySelector('[data-testid="anchored-order"]')?.getAttribute("data-order");
    await expect(order).toBe("a,b,c");
    await expect(Math.abs(topOf("a") - aTopBefore)).toBeLessThan(0.5);
  },
};
