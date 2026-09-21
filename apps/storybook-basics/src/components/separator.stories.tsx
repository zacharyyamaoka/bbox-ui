import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Separator } from "./separator";

/**
 * The plain-CSS hairline over Base UI's Separator (components/separator.tsx)
 * — bar dividers and grouped rows. A toolbar's own hairline is
 * `toolbar.tsx`'s `ToolbarSeparator` instead, which wraps this same
 * primitive inside the toolbar's roving-focus structure.
 *
 * WHY both stories measure the box instead of asserting a class name: the
 * whole point of separator.tsx's correction is that the geometry lives
 * behind `data-[orientation=…]:` selectors, and the stock copy's
 * `data-horizontal:`/`data-vertical:` form silently matches NOTHING against
 * the `data-orientation="horizontal"|"vertical"` Base UI actually emits. A
 * class-presence assertion passes under either spelling; only the rendered
 * 1px tells them apart.
 */
const meta = {
  title: "Basics/Separator",
  tags: ["area:basics", "lane:baseline"],
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default orientation — a full-width hairline between two stacked rows. */
export const Horizontal: Story = {
  render: (args) => (
    <div style={{ width: 220 }}>
      <div style={{ padding: "6px 0" }}>Board</div>
      <Separator {...args} />
      <div style={{ padding: "6px 0" }}>Settings</div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rule = canvas.getByRole("separator");
    await expect(rule).toHaveAttribute("data-orientation", "horizontal");
    await expect(rule).toHaveAttribute("aria-orientation", "horizontal");
    // `h-px` + `w-full` resolved: one physical pixel tall, the parent's full width.
    const box = rule.getBoundingClientRect();
    await expect(getComputedStyle(rule).height).toBe("1px");
    await expect(Math.round(box.width)).toBe(220);
  },
};

/** `orientation="vertical"` — the divider between inline controls. It carries
 *  no height of its own; `self-stretch` takes the row's. */
export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div style={{ display: "flex", alignItems: "stretch", gap: 8, height: 24 }}>
      <span>Cut</span>
      <Separator {...args} />
      <span>Copy</span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rule = canvas.getByRole("separator");
    await expect(rule).toHaveAttribute("data-orientation", "vertical");
    await expect(rule).toHaveAttribute("aria-orientation", "vertical");
    const box = rule.getBoundingClientRect();
    await expect(getComputedStyle(rule).width).toBe("1px");
    // self-stretch: the hairline is as tall as the row it divides, not 0.
    await expect(Math.round(box.height)).toBe(24);
  },
};
