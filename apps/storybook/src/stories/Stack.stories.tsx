import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { Stack, STACK_FIELDS, STACK_PRESETS, type StackInsetBackground, type StackMemberWidth } from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1: Stack, end to end. `argTypes`/`args` below are GENERATED from
 * `STACK_FIELDS` (packages/bbox-ui/src/stack.fields.ts) — the SAME array
 * the product inspector reads. Add a field there and both surfaces pick
 * it up; nothing here is kept in sync by hand.
 *
 * `STACK_PRESETS` is empty (see stack.fields.ts) — no `Presets` gallery
 * story for this component (docs/T1-SPEC.md §6 item 3: present only when
 * `<NAME>_PRESETS` is non-empty).
 */
const meta = {
  title: "Components/Stack",
  component: Stack,
  args: defaultArgs(STACK_FIELDS, STACK_PRESETS) as Partial<ComponentProps<typeof Stack>>,
  argTypes: toArgTypes(STACK_FIELDS),
} satisfies Meta<typeof Stack>;

export default meta;

type Story = StoryObj<typeof meta>;

const MEMBER_WIDTH_FIELD = STACK_FIELDS.find((f) => f.id === "memberWidth")!;
const INSET_BACKGROUND_FIELD = STACK_FIELDS.find((f) => f.id === "insetBackground")!;

/**
 * `Stack`'s real children are structural — almost always `<Block>`
 * (docs/T1-SPEC.md §4.5) — but a `<Block>` sets its own explicit numeric
 * `width`, which wins over Stack's cross-axis stretch and would hide the
 * `memberWidth` distinction these stories sweep. This placeholder has no
 * explicit width of its own, so "fill" vs "own" stays visible.
 */
function StackMember({ label }: { label: string }) {
  return (
    <div
      data-slot="stack-member"
      style={{
        border: "2px solid currentColor",
        padding: "8px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Stack has no natural
 * click-target interaction (docs/T1-SPEC.md §6 item 2 — `Glyph`,
 * `TextBox`, `Flex`, `Stack`), so this asserts the rendered DOM's
 * computed layout matches the args it was actually rendered with.
 */
export const Primary: Story = {
  render: (args) => (
    <Stack {...args}>
      <StackMember label="Member A" />
      <StackMember label="Member B" />
      <StackMember label="Member C" />
    </Stack>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const stack = canvasElement.querySelector('[data-slot="stack"]');
    if (!(stack instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="stack"] element in the DOM');
    }
    await expect(stack.style.gap).toBe(`${args.gap}px`);
    await expect(stack.style.padding).toBe(`${args.gutter}px`);
    await expect(stack.getAttribute("data-member-width")).toBe(args.memberWidth);
    await expect(stack.getAttribute("data-inset-background")).toBe(args.insetBackground);
    await expect(canvas.getByText("Member A")).toBeInTheDocument();
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from
 * `args`, so the Controls panel still drives it live. The swept field's
 * own control is disabled, because a story that paints every option at
 * once cannot honour a single value (Zach, 2026-09-10: "the controls
 * didn't work for the other things").
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(STACK_FIELDS, [fieldId]) },
});

/** Every real StackMemberWidth (fill/own), side by side. */
export const AllMemberWidths: Story = {
  parameters: sweep("memberWidth"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {MEMBER_WIDTH_FIELD.options!.map((option) => (
        <div key={option.value}>
          <p style={{ margin: "0 0 4px", fontSize: 12 }}>{option.label}</p>
          <div style={{ border: "1px dashed #999", width: 320 }}>
            <Stack {...args} memberWidth={option.value as StackMemberWidth}>
              <StackMember label="Short" />
              <StackMember label="A longer member label" />
            </Stack>
          </div>
        </div>
      ))}
    </div>
  ),
};

/** Every real StackInsetBackground (white/soft-gray), side by side. */
export const AllInsetBackgrounds: Story = {
  parameters: sweep("insetBackground"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      {INSET_BACKGROUND_FIELD.options!.map((option) => (
        <div key={option.value}>
          <p style={{ margin: "0 0 4px", fontSize: 12 }}>{option.label}</p>
          <Stack {...args} insetBackground={option.value as StackInsetBackground}>
            <StackMember label="Member A" />
            <StackMember label="Member B" />
          </Stack>
        </div>
      ))}
    </div>
  ),
};

/** Zero children — the well renders empty, gutter padding still applied. */
export const Empty: Story = {
  render: (args) => <Stack {...args} />,
};
