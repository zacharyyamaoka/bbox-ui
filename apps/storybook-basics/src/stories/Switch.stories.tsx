import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Switch } from "../components/switch";

/**
 * Stock shadcn `base-nova` Switch (components/switch.tsx) — Settings'
 * (settings-kit) stock replacement for the old app's hand-rolled
 * `role="switch"` button rows (see docs/CHROME-FILES-SETTINGS-PLAN.md §3).
 * Same `role="switch"`/`aria-checked` semantics, now a stock part.
 */
const meta = {
  title: "Basics/Switch",
  tags: ["area:basics", "lane:baseline"],
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { "aria-label": "Autosave" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch", { name: "Autosave" });
    await expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    await expect(toggle.getAttribute("aria-checked")).toBe("true");
  },
};

export const CheckedByDefault: Story = {
  args: { "aria-label": "Native file dialogs", defaultChecked: true },
};

export const Disabled: Story = {
  args: { "aria-label": "Unavailable setting", disabled: true },
};
