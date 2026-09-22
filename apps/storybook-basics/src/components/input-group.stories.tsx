import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { CheckIcon, SearchIcon, XIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";

/**
 * Stock shadcn `base-nova` InputGroup (components/input-group.tsx) — the
 * bordered shell that puts icons, text and small buttons INSIDE a field's
 * frame. `command.tsx`'s `CommandInput` is built out of it, which is how the
 * quick switcher's search field gets its leading magnifier.
 */
const meta = {
  title: "Components/Stock/InputGroup",
  tags: ["object:stock", "lane:baseline"],
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The search field — the shape `CommandInput` wraps, with a trailing
 *  clear button. Both branches of the addon's click-to-focus rule are here:
 *  the plain icon addon forwards a click to the control, the one holding a
 *  button deliberately does not. */
export const SearchField: Story = {
  render: () => (
    <InputGroup className="w-72">
      <InputGroupInput placeholder="Filter boards" aria-label="Filter boards" />
      <InputGroupAddon data-testid="search-addon">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end" data-testid="clear-addon">
        <InputGroupButton size="icon-xs" aria-label="Clear filter">
          <XIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Filter boards" });
    // The group's focus/invalid rings key off this slot, not off the element type.
    await expect(input).toHaveAttribute("data-slot", "input-group-control");

    const addon = canvas.getByTestId("search-addon");
    await expect(addon).toHaveAttribute("data-align", "inline-start");
    // The addon is part of the field's click target: clicking the magnifier
    // focuses the input beside it rather than swallowing the click.
    await userEvent.click(addon);
    await expect(input).toHaveFocus();

    await userEvent.type(input, "arm");
    await expect(input).toHaveValue("arm");

    // ...but the forwarding stops at a button, or the clear button could
    // never take focus (or fire a click) at all.
    await userEvent.click(canvas.getByRole("button", { name: "Clear filter" }));
    await expect(input).not.toHaveFocus();
  },
};

/**
 * All four `align` rungs of `inputGroupAddonVariants`.
 *
 * WHY each addon is written on the WRONG side in the markup — the
 * `inline-start`/`block-start` cases put the addon LAST in the DOM and the
 * `-end` cases put it FIRST: source order alone would satisfy a test that
 * only looked at the rendered sequence, so the assertion would pass even if
 * the cva's `order-first`/`order-last` classes were dropped. Rendering each
 * one against its own source order is what makes the measurement mean
 * something.
 */
const ALIGNMENTS = ["inline-start", "inline-end", "block-start", "block-end"] as const;

function AlignedGroup({ align }: { align: (typeof ALIGNMENTS)[number] }) {
  const addonFirst = align === "inline-end" || align === "block-end";
  const addon = (
    <InputGroupAddon key="addon" align={align} data-testid={`addon-${align}`}>
      <InputGroupText>{align}</InputGroupText>
    </InputGroupAddon>
  );
  const input = (
    <InputGroupInput
      key="input"
      aria-label={align}
      data-testid={`input-${align}`}
      placeholder="Board name"
    />
  );
  return <InputGroup className="w-72">{addonFirst ? [addon, input] : [input, addon]}</InputGroup>;
}

export const AddonAlignments: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {ALIGNMENTS.map((align) => (
        <AlignedGroup key={align} align={align} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const boxOf = (testId: string) => canvas.getByTestId(testId).getBoundingClientRect();

    for (const align of ALIGNMENTS) {
      await expect(canvas.getByTestId(`addon-${align}`)).toHaveAttribute("data-align", align);
    }

    // inline-*: the addon sits on its own side of the input, against DOM order.
    await expect(boxOf("addon-inline-start").left).toBeLessThan(boxOf("input-inline-start").left);
    await expect(boxOf("addon-inline-end").left).toBeGreaterThan(boxOf("input-inline-end").left);
    // block-*: the group turns into a column and the addon takes a row of its own.
    await expect(boxOf("addon-block-start").top).toBeLessThan(boxOf("input-block-start").top);
    await expect(boxOf("addon-block-end").top).toBeGreaterThan(boxOf("input-block-end").top);
  },
};

/** The composer shape: a textarea control with a block-end action bar. */
export const TextareaWithActions: Story = {
  render: () => (
    <InputGroup className="w-80">
      <InputGroupTextarea aria-label="Note" placeholder="Leave a note…" />
      <InputGroupAddon align="block-end" data-testid="actions">
        <InputGroupText>Markdown</InputGroupText>
        <InputGroupButton size="icon-xs" aria-label="Save note" data-testid="save">
          <CheckIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole("textbox", { name: "Note" });
    await expect(field).toHaveAttribute("data-slot", "input-group-control");
    await userEvent.type(field, "check the gripper");
    await expect(field).toHaveValue("check the gripper");

    const save = canvas.getByRole("button", { name: "Save note" });
    // Stock default: a group button is type="button", so dropping this group
    // into a form never submits it by accident.
    await expect(save).toHaveAttribute("type", "button");

    // `size="icon-xs"` is the cva's `size-6` rung. Measured against a live
    // `size-6` box rather than a hardcoded 24px, so the assertion survives
    // whatever root font size this app is rendered at.
    const reference = document.createElement("div");
    reference.className = "size-6";
    canvasElement.appendChild(reference);
    const expected = reference.getBoundingClientRect().height;
    reference.remove();
    await expect(Math.round(save.getBoundingClientRect().height)).toBe(Math.round(expected));
  },
};
