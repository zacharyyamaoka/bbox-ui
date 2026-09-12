import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { Flex, FLEX_FIELDS, FLEX_PRESETS, type FlexAlign, type FlexJustify } from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * Flex, end to end. `argTypes`/`args` are GENERATED from `FLEX_FIELDS`
 * (packages/bbox-ui/src/flex.fields.ts) — the same array the product
 * inspector reads. Flex paints nothing of its own, so `FLEX_PRESETS` is
 * the empty array and there is no Presets gallery. Flex replaced
 * RowContainer on 2026-09-11: one component, both directions.
 */
function swatch(label: string, size = 56) {
  return (
    <div
      key={label}
      style={{
        width: size,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px solid currentColor",
        fontFamily: "monospace",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {label}
    </div>
  );
}

const meta = {
  title: "Components/Flex",
  component: Flex,
  args: defaultArgs(FLEX_FIELDS, FLEX_PRESETS) as Partial<ComponentProps<typeof Flex>>,
  argTypes: toArgTypes(FLEX_FIELDS),
  render: (args) => (
    <Flex {...args}>
      {swatch("A")}
      {swatch("B")}
      {swatch("C")}
    </Flex>
  ),
} satisfies Meta<typeof Flex>;

export default meta;

type Story = StoryObj<typeof meta>;

const JUSTIFY_FIELD = FLEX_FIELDS.find((f) => f.id === "justify")!;
const ALIGN_FIELD = FLEX_FIELDS.find((f) => f.id === "align")!;

/** THE STORY THAT CARRIES THE PLAY FUNCTION: the rendered DOM's data
 *  attributes and computed style match the args it was rendered with. */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const el = canvasElement.querySelector('[data-slot="flex"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="flex"] element in the DOM');
    await expect(el.getAttribute("data-direction")).toBe(args.direction);
    await expect(el.getAttribute("data-justify")).toBe(args.justify);
    await expect(el.getAttribute("data-align")).toBe(args.align);
    await expect(el.style.gap).toBe(`${args.gap}px`);
    await expect(canvas.getAllByText(/^[ABC]$/)).toHaveLength(3);
  },
};

const sweep = (fieldId: string) => ({ controls: { exclude: controlNames(FLEX_FIELDS, [fieldId]) } });

/** Every justify value, one row per option — CSS's three spacing schemes included. */
export const AllJustify: Story = {
  parameters: sweep("justify"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {JUSTIFY_FIELD.options!.map((option) => (
        <Flex {...args} key={option.value} justify={option.value as FlexJustify}>
          {swatch("A", 40)}
          {swatch("B", 40)}
        </Flex>
      ))}
    </div>
  ),
};

/** Every align value; a tall padding makes the cross-axis difference read. */
export const AllAlign: Story = {
  args: { padding: 16 },
  parameters: sweep("align"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ALIGN_FIELD.options!.map((option) => (
        <Flex {...args} key={option.value} align={option.value as FlexAlign} style={{ minHeight: 80, border: "1px dashed currentColor" }}>
          {swatch("A", 32)}
          {swatch("B", 32)}
        </Flex>
      ))}
    </div>
  ),
};

/** The column direction — what a Block's body slot uses. */
export const Column: Story = {
  args: { direction: "column", align: "stretch" },
};

/** Enough children to show wrapping when `wrap` is on. */
export const ManyChildrenWrapped: Story = {
  args: { wrap: true },
  render: (args) => (
    <div style={{ width: 260 }}>
      <Flex {...args}>{Array.from({ length: 8 }, (_, i) => swatch(String(i + 1), 40))}</Flex>
    </div>
  ),
};
