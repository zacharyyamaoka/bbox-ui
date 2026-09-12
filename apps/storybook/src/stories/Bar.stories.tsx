import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { Bar, BAR_FIELDS, BAR_PRESETS, Glyph, Pill, TextBox, type BarSize } from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * Bar — a Block's header and footer, one component. `argTypes`/`args` are
 * generated from `BAR_FIELDS`; the line's paint comes from `BAR_PRESETS`,
 * Pill's state ladder narrowed to the line fields.
 */
const meta = {
  title: "Components/Bar",
  component: Bar,
  args: defaultArgs(BAR_FIELDS, BAR_PRESETS) as Partial<ComponentProps<typeof Bar>>,
  argTypes: toArgTypes(BAR_FIELDS),
  render: (args) => (
    <div style={{ width: 420, border: "1px dashed currentColor" }}>
      <Bar {...args} left={<Glyph size={args.size}>◆</Glyph>} center={<TextBox size={args.size}>Title</TextBox>} right={<Pill state="wired">Wired</Pill>} />
    </div>
  ),
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** THE STORY THAT CARRIES THE PLAY FUNCTION: the DOM reflects the args. */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const el = canvasElement.querySelector('[data-slot="bar"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="bar"]');
    await expect(el.getAttribute("data-size")).toBe(args.size);
    await expect(el.getAttribute("data-line")).toBe(String(args.line));
    await expect(el.querySelectorAll('[data-slot="bar-cell"]')).toHaveLength(3);
  },
};

/** As a footer: the line sits at the top. */
export const Footer: Story = { args: { edge: "top" } as Partial<ComponentProps<typeof Bar>> };

/** No dividing line. */
export const NoLine: Story = { args: { line: false } };

/** The four rungs, the same members inside each. */
export const AllSizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 420 }}>
      {(["sm", "md", "lg", "xl"] as BarSize[]).map((size) => (
        <div key={size} style={{ border: "1px dashed currentColor" }}>
          <Bar {...args} size={size} left={<Glyph size={size}>◆</Glyph>} center={<TextBox size={size}>{size}</TextBox>} right={<Pill state="wired">Wired</Pill>} />
        </div>
      ))}
    </div>
  ),
};

/** Hidden: nothing is drawn. */
export const Hidden: Story = { args: { hidden: true } };
