import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { RadioGroup, RadioGroupItem } from "./radio-group";

/**
 * Stock shadcn `base-nova` RadioGroup (components/radio-group.tsx) —
 * Settings' (settings-kit) stock part for a "pick one of N" setting, e.g.
 * file navigation (native | app) and settings presentation (dialog |
 * page). One choice at a time, keyboard-navigable.
 */
const meta = {
  title: "Basics/RadioGroup",
  tags: ["area:basics", "lane:baseline"],
  component: RadioGroup,
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileNavigation: Story = {
  render: () => (
    <RadioGroup defaultValue="app" aria-label="File navigation">
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="app" /> App navigator
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="native" /> Native OS dialogs
      </label>
    </RadioGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const app = canvas.getByRole("radio", { name: /app navigator/i });
    const native = canvas.getByRole("radio", { name: /native os dialogs/i });
    await expect(app.getAttribute("aria-checked")).toBe("true");
    await expect(native.getAttribute("aria-checked")).toBe("false");

    await userEvent.click(native);
    await expect(native.getAttribute("aria-checked")).toBe("true");
    await expect(app.getAttribute("aria-checked")).toBe("false");
  },
};
