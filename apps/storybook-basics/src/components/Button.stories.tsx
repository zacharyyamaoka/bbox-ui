import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Play } from "lucide-react";

import { Button } from "../components/button";

const meta = {
  title: "Basics/Button",
  tags: ["area:basics", "lane:baseline"],
  component: Button,
  args: { children: "Button", onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default variant/size, clicked — proves the click actually fires. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Button" });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

/**
 * Icon-only "play" button — the far-right control in the sketch's "w/ play
 * button + text" header layout.
 */
export const IconPlay: Story = {
  args: { children: <Play />, size: "icon", "aria-label": "Play" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Play" })).toBeInTheDocument();
  },
};
