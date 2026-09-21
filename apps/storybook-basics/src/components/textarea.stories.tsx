import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Textarea } from "./textarea";

/**
 * Stock shadcn `base-nova` Textarea (components/textarea.tsx). Nothing in the
 * app renders a bare one — it exists because the stock `InputGroup` ships an
 * `InputGroupTextarea` built out of it (see textarea.tsx's own WHY), so these
 * stories are the multi-line field on its own, before a group wraps it.
 */
const meta = {
  title: "Basics/Textarea",
  tags: ["area:basics", "lane:baseline"],
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Leave a note…", "aria-label": "Note", className: "w-80" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Note" });
    await expect(field).toHaveAttribute("data-slot", "textarea");

    await userEvent.type(field, "Gripper stalls on can #4");
    await expect(field).toHaveValue("Gripper stalls on can #4");
  },
};

/** `field-sizing-content` — the box grows with the text instead of scrolling
 *  it, which is the one behaviour this file has over a bare `<textarea>`. */
export const GrowsWithContent: Story = {
  args: { "aria-label": "Note", className: "w-80" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Note" });
    const before = field.getBoundingClientRect().height;

    await userEvent.type(field, "one{Enter}two{Enter}three{Enter}four{Enter}five{Enter}six");
    await expect(field).toHaveValue("one\ntwo\nthree\nfour\nfive\nsix");
    // Six lines cannot fit in `min-h-16` (4rem), so a growing box is taller
    // than it started and never scrolls; a fixed box would be neither.
    const after = field.getBoundingClientRect().height;
    await expect(after).toBeGreaterThan(before);
    await expect(field.scrollHeight).toBeLessThanOrEqual(Math.ceil(after) + 1);
  },
};

/** `disabled` — the stock disabled skin, and a value that cannot be typed over. */
export const Disabled: Story = {
  args: { defaultValue: "Locked by a peer", disabled: true, "aria-label": "Note", className: "w-80" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Note" });
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue("Locked by a peer");
  },
};

/** `aria-invalid` — the destructive border/ring pair. Rendered beside a valid
 *  field because the assertion that matters is that the two differ; a class
 *  name in the DOM proves nothing about whether the variant selector matched. */
export const Invalid: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
      <Textarea aria-label="Valid note" defaultValue="Sorted 41 items" />
      <Textarea aria-invalid aria-label="Invalid note" defaultValue="" placeholder="Required" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const valid = canvas.getByRole("textbox", { name: "Valid note" });
    const invalid = canvas.getByRole("textbox", { name: "Invalid note" });
    await expect(invalid).toHaveAttribute("aria-invalid", "true");
    await expect(getComputedStyle(invalid).borderTopColor).not.toBe(
      getComputedStyle(valid).borderTopColor,
    );
  },
};
