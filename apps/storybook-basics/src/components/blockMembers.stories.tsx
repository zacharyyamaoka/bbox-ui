import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  BLOCK_MEMBER_GAP_PX,
  BLOCK_MEMBER_INSET_PX,
  BlockMembers,
  EMPTY_CARD_MIN_PX,
  type BlockMember,
} from "./blockMembers";

/**
 * src/components/blockMembers.stories.tsx — `BlockMembers` on its own, the
 * one place it renders without a `Block` or a `Region` around it.
 *
 * WHY standalone at all, when Block.stories.tsx / Region / FitToContent all
 * already show members in situ: those stories are about their own hosts,
 * and a host supplies `gap`/`gutter`/`insetBackground` itself — so the
 * region's OWN geometry contract (one uniform gap, a gutter only an
 * `"inset"` member pays, an overlay that never moves what it describes) is
 * only ever observed through whatever the host chose. Here the region is
 * the subject, fed the module's own `BLOCK_MEMBER_GAP_PX` /
 * `BLOCK_MEMBER_INSET_PX` / `EMPTY_CARD_MIN_PX`, and every assertion below
 * reads those exports rather than repeating their numbers.
 *
 * Every story is static (`onMembersChange` omitted) except where noted:
 * passing it is what switches the region into dnd-kit's sortable mode, and
 * drag-to-reorder is `Block.stories.tsx`'s subject, not this file's.
 */

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</span>
      <div style={{ width: 320, border: "1px dashed var(--border)", borderRadius: 8 }}>{children}</div>
    </div>
  );
}

/** Member content with a measurable box of its own — `data-testid` so a play
 *  function can compare the CONTENT rect, not the slot's. */
function Card({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      data-testid={`content-${id}`}
      style={{
        background: "var(--muted)",
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

const STACK_MEMBERS: BlockMember[] = [
  { id: "m1", content: <Card id="m1">inset · fill</Card> },
  { id: "m2", inset: "edge-to-edge", content: <Card id="m2">edge-to-edge · fill</Card> },
  { id: "m3", width: "own", content: <Card id="m3">inset · own</Card> },
];

const FREE_MEMBERS: BlockMember[] = [
  { id: "f1", x: 16, y: 12, content: <Card id="f1">x 16 · y 12</Card> },
  { id: "f2", x: 96, y: 72, content: <Card id="f2">x 96 · y 72</Card> },
];

// The region's own defaults, shared by every story below: the module's own
// spacing constants, a static (non-sortable) region, members shown, cards
// off. A story states only what it changes.
const meta = {
  title: "Components/Blocks/BlockMembers",
  tags: ["object:block", "lane:floating-toolbars-2026-09-20"],
  component: BlockMembers,
  args: {
    layout: "stack",
    members: STACK_MEMBERS,
    gap: BLOCK_MEMBER_GAP_PX,
    gutter: BLOCK_MEMBER_INSET_PX,
    insetBackground: "none",
    showMembers: true,
    showCards: false,
  },
  render: (args) => (
    <Panel label={`${args.layout} · gap ${args.gap} · gutter ${args.gutter}`}>
      <BlockMembers {...args} />
    </Panel>
  ),
} satisfies Meta<typeof BlockMembers>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stack's whole geometry contract in one render: first member one gap
 * below the top, one uniform gap between members, one gap before whatever
 * follows, and a gutter paid only by `"inset"` members.
 */
export const StackGeometry: Story = {
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector('[data-slot="block-members"]');
    if (!(region instanceof HTMLElement)) throw new Error('expected a [data-slot="block-members"]');
    await expect(region.getAttribute("data-layout")).toBe("stack");

    // The gap the module itself declares — never a literal.
    const gap = `${BLOCK_MEMBER_GAP_PX}px`;
    const regionStyle = getComputedStyle(region);
    await expect(regionStyle.rowGap).toBe(gap);
    await expect(regionStyle.paddingTop).toBe(gap);
    await expect(regionStyle.paddingBottom).toBe(gap);

    const slots = region.querySelectorAll('[data-slot="block-member"]');
    await expect(slots).toHaveLength(STACK_MEMBERS.length);

    // Defaults, published on the slot: "inset" + "fill" unless the member
    // says otherwise.
    await expect(slots[0].getAttribute("data-member-inset")).toBe("inset");
    await expect(slots[0].getAttribute("data-member-width")).toBe("fill");
    await expect(slots[1].getAttribute("data-member-inset")).toBe("edge-to-edge");
    await expect(slots[2].getAttribute("data-member-width")).toBe("own");

    // The gutter is what "inset" MEANS; edge-to-edge pays none.
    const gutter = `${BLOCK_MEMBER_INSET_PX}px`;
    await expect(getComputedStyle(slots[0]).marginLeft).toBe(gutter);
    await expect(getComputedStyle(slots[0]).marginRight).toBe(gutter);
    await expect(getComputedStyle(slots[1]).marginLeft).toBe("0px");
    await expect(getComputedStyle(slots[1]).marginRight).toBe("0px");

    // Measured, not style-deep: the drawn vertical distance between the
    // first two slots is exactly one gap, and the edge-to-edge slot really
    // is `2 * gutter` wider than the inset one beside it.
    const first = slots[0].getBoundingClientRect();
    const second = slots[1].getBoundingClientRect();
    await expect(Math.abs(second.top - first.bottom - BLOCK_MEMBER_GAP_PX)).toBeLessThan(0.5);
    await expect(Math.abs(second.width - first.width - 2 * BLOCK_MEMBER_INSET_PX)).toBeLessThan(0.5);

    // `width: "own"` hugs its content instead of filling the inner width.
    const own = slots[2].getBoundingClientRect();
    await expect(own.width).toBeLessThan(first.width);
  },
};

/**
 * "They should keep their membership but have their visibility turned off"
 * — `visible: false` renders nothing while staying in the list (and in any
 * future members panel), which is what makes a reorder of its siblings
 * lossless for it.
 */
export const HiddenMemberKeepsMembership: Story = {
  args: {
    members: [STACK_MEMBERS[0], { ...STACK_MEMBERS[1], visible: false }, STACK_MEMBERS[2]],
  },
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector('[data-slot="block-members"]');
    if (!(region instanceof HTMLElement)) throw new Error('expected a [data-slot="block-members"]');

    // Not "hidden" via opacity/visibility — the slot is gone from the DOM…
    await expect(region.querySelectorAll('[data-slot="block-member"]')).toHaveLength(2);
    await expect(region.querySelector('[data-member-id="m2"]')).toBeNull();
    // …while its visible siblings keep their own identity and order.
    const ids = [...region.querySelectorAll('[data-slot="block-member"]')].map((slot) =>
      slot.getAttribute("data-member-id"),
    );
    await expect(ids).toEqual(["m1", "m3"]);
  },
};

/**
 * The card overlay (`showCards`) is drawn OVER each member, never wrapped
 * around it — Zach's ruling, blockMembers.tsx's own WHY: "I don't like how
 * when you show the cards it kinda changes the shape of how the members
 * look". Both panels render the identical members; only `showCards` differs.
 */
export const CardsDoNotMoveContent: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      <Panel label="showCards: false">
        <BlockMembers {...args} showCards={false} />
      </Panel>
      <Panel label="showCards: true">
        <BlockMembers {...args} showCards />
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const regions = canvasElement.querySelectorAll('[data-slot="block-members"]');
    await expect(regions).toHaveLength(2);
    const [plain, carded] = [...regions] as HTMLElement[];

    await expect(plain.querySelectorAll('[data-slot="block-member-card"]')).toHaveLength(0);
    await expect(carded.querySelectorAll('[data-slot="block-member-card"]')).toHaveLength(
      STACK_MEMBERS.length,
    );

    // The load-bearing assertion: each member's own content box is the
    // SAME size with the overlay on as with it off. An overlay that padded
    // or wrapped would change these numbers.
    for (const member of STACK_MEMBERS) {
      const withoutCard = plain.querySelector(`[data-testid="content-${member.id}"]`);
      const withCard = carded.querySelector(`[data-testid="content-${member.id}"]`);
      if (!(withoutCard instanceof HTMLElement) || !(withCard instanceof HTMLElement)) {
        throw new Error(`expected both copies of member ${member.id}`);
      }
      const a = withoutCard.getBoundingClientRect();
      const b = withCard.getBoundingClientRect();
      await expect(Math.abs(a.width - b.width)).toBeLessThan(0.5);
      await expect(Math.abs(a.height - b.height)).toBeLessThan(0.5);
    }

    // The overlay is also out of the pointer's way, so it can never steal
    // the drag gesture that reorders members.
    const overlay = carded.querySelector('[data-slot="block-member-card"]');
    if (!(overlay instanceof HTMLElement)) throw new Error("expected a card overlay");
    await expect(getComputedStyle(overlay).pointerEvents).toBe("none");
  },
};

/**
 * `showMembers: false` + `showCards: true` — "hide the members and just
 * focus on the card interactions". Content leaves the DOM entirely (not
 * opacity 0), and with no content box left to preserve, the SLOT reserves
 * `EMPTY_CARD_MIN_PX` so an empty card still reads as a card.
 */
export const EmptyCardsReserveTheirFootprint: Story = {
  args: { insetBackground: "soft-gray", showMembers: false, showCards: true },
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector('[data-slot="block-members"]');
    if (!(region instanceof HTMLElement)) throw new Error('expected a [data-slot="block-members"]');
    await expect(region.getAttribute("data-inset-background")).toBe("soft-gray");

    // The content is gone, not transparent.
    await expect(region.querySelector('[data-testid="content-m1"]')).toBeNull();

    const slots = region.querySelectorAll('[data-slot="block-member"]');
    await expect(slots).toHaveLength(STACK_MEMBERS.length);
    for (const slot of slots) {
      await expect(getComputedStyle(slot).minHeight).toBe(`${EMPTY_CARD_MIN_PX}px`);
      // Reserved, and actually drawn at (at least) that height.
      await expect(slot.getBoundingClientRect().height).toBeGreaterThanOrEqual(EMPTY_CARD_MIN_PX - 0.5);
      await expect(slot.querySelector('[data-slot="block-member-card"]')).not.toBeNull();
    }
  },
};

/**
 * `layout="free"` — authored `x`/`y`, own size, "like the canvas outside".
 * The same members' `x`/`y` are what a `stack` ignores, which is what makes
 * a free -> stack -> free round trip lossless.
 */
export const FreePositions: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>free · authored x/y</span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 320,
          height: 160,
          border: "1px dashed var(--border)",
          borderRadius: 8,
        }}
      >
        <BlockMembers {...args} layout="free" members={FREE_MEMBERS} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const region = canvasElement.querySelector('[data-slot="block-members"]');
    if (!(region instanceof HTMLElement)) throw new Error('expected a [data-slot="block-members"]');
    await expect(region.getAttribute("data-layout")).toBe("free");

    const origin = region.getBoundingClientRect();
    for (const member of FREE_MEMBERS) {
      const slot = region.querySelector(`[data-member-id="${member.id}"]`);
      if (!(slot instanceof HTMLElement)) throw new Error(`expected a slot for ${member.id}`);
      const box = slot.getBoundingClientRect();
      // Drawn exactly where the member says, relative to the region.
      await expect(Math.abs(box.left - origin.left - (member.x ?? 0))).toBeLessThan(0.5);
      await expect(Math.abs(box.top - origin.top - (member.y ?? 0))).toBeLessThan(0.5);
      // The gutter belongs to `stack`; a free member never pays it.
      await expect(getComputedStyle(slot).marginLeft).toBe("0px");
    }
  },
};
