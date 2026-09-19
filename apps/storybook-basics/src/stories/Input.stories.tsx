import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Input } from "../components/input";

/**
 * Stock shadcn `base-nova` Input (components/input.tsx) — the navigator's
 * text fields (Filter, File name, New folder) are this part, per
 * docs/CHROME-FILES-SETTINGS-PLAN.md §3; fileNavigator.tsx (files-kit) owns
 * the Escape-resets-draft / Enter-submits behaviour, this story only proves
 * the stock part itself types and disables.
 */
const meta = {
  title: "Basics/Input",
  tags: ["area:basics", "lane:baseline"],
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Filter", "aria-label": "Filter" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Filter" });
    await userEvent.type(input, "board");
    await expect(input).toHaveValue("board");
  },
};

export const Disabled: Story = {
  args: { defaultValue: "Locked", disabled: true },
};
