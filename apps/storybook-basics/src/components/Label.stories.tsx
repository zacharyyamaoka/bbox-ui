import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Input } from "./input";
import { Label } from "./label";

/**
 * Stock shadcn `base-nova` Label (components/label.tsx) — paired with a
 * control via `htmlFor`/`id` so a screen reader reads the setting as one
 * thing, per docs/CHROME-FILES-SETTINGS-PLAN.md §3. `field.tsx`'s
 * `FieldLabel` wraps this same part for the Field kit below.
 */
const meta = {
  title: "Basics/Label",
  tags: ["area:basics", "lane:baseline"],
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PairedWithInput: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Label htmlFor="board-name">Board name</Label>
      <Input id="board-name" defaultValue="Untitled board" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Sorting cell layout");
    await expect(input).toHaveValue("Sorting cell layout");
  },
};
