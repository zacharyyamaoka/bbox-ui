import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Block } from "./block";
import { BlockRegion } from "./blockRegion";
import { REGION_CORNER_WIDTH_PX } from "./blockRegion.layout";
import { LabeledGroup, type LabeledGroupProps } from "./blockRegion.labeledGroup";

/**
 * Components/Blocks/BlockRegion/Labeled Group — BlockRegion's title-only
 * preset (`blockRegion.labeledGroup.tsx`), modelled on React Flow UI's Labeled
 * Group Node.
 *
 * Zach, 2026-09-22: "labeled group should be a preset of Block Region", "its a
 * region with only a title showing." So the label is the same corner Block a
 * loop wears, header only, and `SameFrame` shows it beside a BlockRegion whose
 * corner Block has a header and a body. That is the whole relationship in one
 * picture.
 */
const meta = {
  title: "Components/Blocks/BlockRegion/Labeled Group",
  tags: ["object:region", "lane:storybook-org"],
  component: LabeledGroup,
} satisfies Meta<typeof LabeledGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function Node({ label }: { label: string }) {
  return <Block header={<span style={{ fontSize: 13 }}>{label}</span>} width={150} />;
}

const MEMBERS = [
  { id: "a", x: 220, y: 44, content: <Node label="Node" /> },
  { id: "b", x: 36, y: 128, content: <Node label="Node" /> },
];

const px = (value: string) => Number.parseFloat(value) || 0;

/**
 * The corner card of region `regionId`, measured against its frame: flush in
 * the frame's top-left, rounded with the FRAME's own radius at the top-left
 * and bottom-right, and square at the two junctions with the frame (Zach,
 * 2026-09-22: "the block in the corner should have the bottom left and top
 * right corners straight"). Found by its title, so the first call awaits a
 * REAL element and nothing below can pass against an empty canvas.
 */
async function expectCornerCard(canvas: HTMLElement, regionId: string, title: string) {
  const text = await within(canvas).findByText(
    (content, el) => content === title && el?.closest(`[data-region-id="${regionId}"] [data-slot="region-corner"]`) !== null,
    // identity, not the default trim-and-collapse: a label is rendered as
    // authored, so it is matched as authored, double spaces and all
    { normalizer: (content) => content },
  );
  const card = text.closest<HTMLElement>('[data-slot="block"]')!;
  const region = card.closest<HTMLElement>('[data-slot="region"]')!;
  const frame = region.querySelector<HTMLElement>('[data-slot="region-frame"]')!;
  await expect(card.dataset.blockShape).toBe("region-corner");
  const f = frame.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  // flush: the corner slot is pulled back by the 1px frame border
  await expect(Math.abs(c.left - f.left)).toBeLessThanOrEqual(1);
  await expect(Math.abs(c.top - f.top)).toBeLessThanOrEqual(1);
  const fs = getComputedStyle(frame);
  const cs = getComputedStyle(card);
  await expect(px(fs.borderTopLeftRadius)).toBeGreaterThan(0);
  await expect(cs.borderTopLeftRadius).toBe(fs.borderTopLeftRadius);
  await expect(cs.borderBottomRightRadius).toBe(fs.borderTopLeftRadius);
  await expect(cs.borderTopRightRadius).toBe("0px");
  await expect(cs.borderBottomLeftRadius).toBe("0px");
  return { region, frame, card };
}

/** `region-4`'s corner card, as rendered: REGION_CORNER_WIDTH_PX wide, and
 *  the height of its header plus its one-line body. */
const REGION_4_CORNER = { w: REGION_CORNER_WIDTH_PX, h: 72 };

/** React Flow's reference: a label, and two nodes inside the group. */
export const Default: Story = {
  args: { id: "group-1", label: "Label", width: 480, height: 300, members: MEMBERS },
  play: async ({ canvasElement }) => {
    const { frame, card } = await expectCornerCard(canvasElement, "group-1", "Label");
    // the label is a header-only Block: no body, no footer, no divider under the title
    await expect(card.querySelector('[data-slot="block-body"]')).toBeNull();
    await expect(card.querySelector('[data-slot="block-footer"]')).toBeNull();
    await expect(px(getComputedStyle(card.querySelector('[data-slot="block-header"]')!).borderBottomWidth)).toBe(0);
    const f = frame.getBoundingClientRect();
    const members = Array.from(frame.querySelectorAll<HTMLElement>('[data-slot="region-body"] [data-slot="block"]'));
    await expect(members.length).toBe(2);
    for (const block of members) {
      const b = block.getBoundingClientRect();
      await expect(b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom).toBe(true);
    }
  },
};

/** "a region with only a title showing" — nothing inside yet. */
export const TitleOnly: Story = {
  args: { id: "group-2", label: "Sensors", width: 320, height: 180 },
  play: async ({ canvasElement }) => {
    const { frame } = await expectCornerCard(canvasElement, "group-2", "Sensors");
    await expect(frame.querySelectorAll('[data-slot="region-body"] [data-slot="block"]').length).toBe(0);
  },
};

/** The label is rendered as authored — long, spaced, cased — and the card hugs it. */
export const LongLabel: Story = {
  args: { id: "group-3", label: "Perception  ·  Stage 2 (GPU)", width: 420, height: 200 },
  play: async ({ canvasElement }) => {
    const { card, frame } = await expectCornerCard(canvasElement, "group-3", "Perception  ·  Stage 2 (GPU)");
    await expect(card.textContent).toBe("Perception  ·  Stage 2 (GPU)");
    await expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(frame.getBoundingClientRect().right);
  },
};

/**
 * The relationship Zach drew: the same frame, a title-only card in the corner
 * on the left, and a card with a body on the right. Both are `BlockRegion`, and
 * both corner cards are `Block` with `shape="region-corner"`.
 */
export const SameFrame: Story = {
  args: { id: "group-4", label: "Label", width: 400, height: 240, members: MEMBERS.slice(0, 1) },
  render: (args) => (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>Labeled Group — only a title</div>
        <LabeledGroup {...args} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>BlockRegion — a full Block in the corner</div>
        <BlockRegion
          id="region-4"
          kind="group"
          width={args.width}
          height={args.height}
          members={args.members}
          // A caller-rendered `corner` is never measured by a hidden copy
          // (`RegionCornerProps`), so its size is stated — and the play
          // function checks the statement against the rendered card.
          cornerSize={REGION_4_CORNER}
          corner={
            <Block
              shape="region-corner"
              header={<span style={{ fontSize: 13 }}>for x in xs</span>}
              body={<span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Iterable → Iter</span>}
              width={REGION_CORNER_WIDTH_PX}
            />
          }
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { frame: groupFrame } = await expectCornerCard(canvasElement, "group-4", "Label");
    const { frame: regionFrame, card: regionCard } = await expectCornerCard(canvasElement, "region-4", "for x in xs");
    // The stated `cornerSize` is the card's real box.
    const cardBox = regionCard.getBoundingClientRect();
    await expect(Math.abs(cardBox.width - REGION_4_CORNER.w), "cornerSize width").toBeLessThanOrEqual(1);
    await expect(Math.abs(cardBox.height - REGION_4_CORNER.h), `cornerSize height (card is ${cardBox.height})`).toBeLessThanOrEqual(1);
    const g = groupFrame.getBoundingClientRect();
    const r = regionFrame.getBoundingClientRect();
    // one frame renderer: the same width and radius, only the corner card differs
    await expect(Math.round(g.width)).toBe(Math.round(r.width));
    await expect(getComputedStyle(groupFrame).borderTopLeftRadius).toBe(getComputedStyle(regionFrame).borderTopLeftRadius);
  },
};

/**
 * Codex re-judge 4: `Omit` does not stop an object SPREAD from carrying an
 * omitted prop back in. The types now refuse it (`blockRegion.types.test.ts`
 * pins that); this is the runtime half — a spread that reaches past the types
 * (plain JS, an `any`) is stripped before BlockRegion sees it, so the label
 * this preset exists to draw is still the one rendered.
 */
const INJECTED = { cornerCard: { header: "Replacement" }, corner: <span>Replacement corner</span>, type: "Injected type" };

export const SpreadCannotReplaceTheLabel: Story = {
  args: { id: "group-spread", label: "Authored label", width: 320, height: 180 },
  render: (args) => <LabeledGroup {...args} {...(INJECTED as unknown as Partial<LabeledGroupProps>)} />,
  play: async ({ canvasElement }) => {
    await expectCornerCard(canvasElement, "group-spread", "Authored label");
    expect(canvasElement.textContent, "no injected corner content").not.toContain("Replacement");
    expect(canvasElement.textContent, "no injected type").not.toContain("Injected type");
  },
};
