import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/select";

/**
 * Stock shadcn `base-nova` Select (components/select.tsx) — reserved by the
 * plan (docs/CHROME-FILES-SETTINGS-PLAN.md §3) for the first list-shaped
 * setting, so no lane ever hand-rolls one. No settings row consumes it yet.
 */
const meta = {
  title: "Basics/Select",
  tags: ["area:basics", "lane:baseline"],
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// Base UI's Select resolves SelectValue's initial label from this `items`
// map (its own documented API) rather than from mounting the popup — the
// popup's items aren't in the DOM until first opened, so without this map
// the trigger would show nothing until a selection is made.
const THEME_ITEMS = { light: "Light", dark: "Dark", system: "System" };

export const Default: Story = {
  render: () => (
    <Select defaultValue="system" items={THEME_ITEMS}>
      <SelectTrigger aria-label="Theme">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="system">System</SelectItem>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Theme" });
    await expect(trigger.textContent).toContain("System");

    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="select-content"]')).not.toBeNull();
    });
    await userEvent.click(within(document.body).getByRole("option", { name: "Dark" }));
    await waitFor(() => {
      expect(trigger.textContent).toContain("Dark");
    });
  },
};
