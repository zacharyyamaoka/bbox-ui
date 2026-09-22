import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Block } from "./block";
import { Region } from "./region";
import { REGION_CORNER_WIDTH_PX } from "./region.layout";
import { LabeledGroup } from "./region.labeledGroup";

/**
 * Components/Blocks/Region/Labeled Group — Region's title-only preset
 * (`region.labeledGroup.tsx`), modelled on React Flow UI's Labeled Group Node.
 *
 * Zach, 2026-09-22: "labeled group is actually a subset (preset) of the
 * Region. its a region with only a title showing." So these stories render
 * the real Region with a label tab in its corner slot — and, in `SameFrame`,
 * beside the full Region with a Block in that slot, which is the whole
 * relationship in one picture.
 */
const meta = {
  title: "Components/Blocks/Region/Labeled Group",
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

async function expectLabeledGroup(canvas: HTMLElement, regionId: string) {
  // the first call awaits a REAL element — the tab — so nothing below can pass against an empty canvas
  const tab = await within(canvas).findByText(
    (_, el) => el?.getAttribute("data-slot") === "labeled-group-label" && el.closest(`[data-region-id="${regionId}"]`) !== null,
  );
  const region = tab.closest<HTMLElement>('[data-slot="region"]')!;
  const frame = region.querySelector<HTMLElement>('[data-slot="region-frame"]')!;
  const f = frame.getBoundingClientRect();
  const t = tab.getBoundingClientRect();
  // flush in the frame's top-left: the corner slot is pulled back by the 1px frame border
  await expect(Math.abs(t.left - f.left)).toBeLessThanOrEqual(1);
  await expect(Math.abs(t.top - f.top)).toBeLessThanOrEqual(1);
  // rounds with the FRAME's own token at top-left and bottom-right, square where it meets the frame
  const fs = getComputedStyle(frame);
  const ts = getComputedStyle(tab);
  await expect(px(fs.borderTopLeftRadius)).toBeGreaterThan(0);
  await expect(ts.borderTopLeftRadius).toBe(fs.borderTopLeftRadius);
  await expect(ts.borderBottomRightRadius).toBe(fs.borderTopLeftRadius);
  await expect(px(ts.borderTopRightRadius)).toBe(0);
  await expect(px(ts.borderBottomLeftRadius)).toBe(0);
  return { region, frame, tab };
}

/** React Flow's reference: a label, and two nodes inside the group. */
export const Default: Story = {
  args: { id: "group-1", label: "Label", width: 480, height: 300, members: MEMBERS },
  play: async ({ canvasElement }) => {
    const { frame, tab } = await expectLabeledGroup(canvasElement, "group-1");
    await expect(tab.textContent).toBe("Label");
    const f = frame.getBoundingClientRect();
    for (const block of Array.from(frame.querySelectorAll<HTMLElement>('[data-slot="block"]'))) {
      const b = block.getBoundingClientRect();
      await expect(b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom).toBe(true);
    }
    await expect(frame.querySelectorAll('[data-slot="block"]').length).toBe(2);
  },
};

/** "a region with only a title showing" — nothing inside yet. */
export const TitleOnly: Story = {
  args: { id: "group-2", label: "Sensors", width: 320, height: 180 },
  play: async ({ canvasElement }) => {
    const { frame } = await expectLabeledGroup(canvasElement, "group-2");
    await expect(frame.querySelectorAll('[data-slot="block"]').length).toBe(0);
  },
};

/** The label is rendered as authored — long, spaced, cased. */
export const LongLabel: Story = {
  args: { id: "group-3", label: "Perception  ·  Stage 2 (GPU)", width: 420, height: 200 },
  play: async ({ canvasElement }) => {
    const { tab, frame } = await expectLabeledGroup(canvasElement, "group-3");
    await expect(tab.textContent).toBe("Perception  ·  Stage 2 (GPU)");
    await expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(frame.getBoundingClientRect().right);
  },
};

/**
 * The relationship Zach drew: the same frame, a title in the corner on the
 * left and a Block in the corner on the right. Both are `Region`.
 */
export const SameFrame: Story = {
  args: { id: "group-4", label: "Label", width: 400, height: 240, members: MEMBERS.slice(0, 1) },
  render: (args) => (
    <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>Labeled Group — title in the corner</div>
        <LabeledGroup {...args} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>Region — a Block in the corner</div>
        <Region
          id="region-4"
          kind="group"
          width={args.width}
          height={args.height}
          members={args.members}
          corner={<Block header={<span style={{ fontSize: 13 }}>for x in xs</span>} width={REGION_CORNER_WIDTH_PX} />}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { frame: groupFrame } = await expectLabeledGroup(canvasElement, "group-4");
    const regionFrame = canvasElement.querySelector<HTMLElement>('[data-region-id="region-4"][data-slot="region-frame"]')!;
    const g = groupFrame.getBoundingClientRect();
    const r = regionFrame.getBoundingClientRect();
    // one frame renderer: the same width and radius, only the corner differs
    await expect(Math.round(g.width)).toBe(Math.round(r.width));
    await expect(getComputedStyle(groupFrame).borderTopLeftRadius).toBe(getComputedStyle(regionFrame).borderTopLeftRadius);
    await expect(regionFrame.querySelector('[data-slot="labeled-group-label"]')).toBeNull();
  },
};
