import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Badge } from "../components/badge";

const meta = {
  title: "Basics/Badge",
  component: Badge,
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default/secondary/outline/destructive variants, side by side. */
export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </div>
  ),
};

/** "Draft 1" — the exact label the sketch's "w/ Title Badge" header uses,
 *  reused directly in Bar.stories.tsx's HeaderLayouts gallery. */
export const DraftLabel: Story = {
  args: { children: "Draft 1", variant: "secondary" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Draft 1")).toBeInTheDocument();
  },
};
