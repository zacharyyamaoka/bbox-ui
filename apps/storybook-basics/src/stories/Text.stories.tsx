import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Text } from "../components/text";

const meta = {
  title: "Basics/Text",
  component: Text,
  args: { children: "Plain information" },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Just normal text, default tone. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Plain information")).toBeInTheDocument();
  },
};

/** Default vs muted, side by side — the dimmer "Type" label next to a
 *  bolder "Title" is exactly this pairing. */
export const Tones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <Text>Title</Text>
      <Text tone="muted">Type</Text>
    </div>
  ),
};
