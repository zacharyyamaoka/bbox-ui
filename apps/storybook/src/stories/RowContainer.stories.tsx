import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  RowContainer,
  ROW_CONTAINER_FIELDS,
  type RowAlign,
  type RowJustify,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1: RowContainer, end to end. `argTypes`/`args` below are GENERATED
 * from `ROW_CONTAINER_FIELDS` (packages/bbox-ui/src/rowContainer.fields.ts)
 * — the same array a product inspector reads. RowContainer paints nothing
 * of its own (T1-SPEC.md §4.4), so `ROW_CONTAINER_PRESETS` is the empty
 * array every component exports and there is no `Presets` gallery here.
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
  title: "Components/RowContainer",
  component: RowContainer,
  args: defaultArgs(ROW_CONTAINER_FIELDS) as Partial<ComponentProps<typeof RowContainer>>,
  argTypes: toArgTypes(ROW_CONTAINER_FIELDS),
  render: (args) => (
    <RowContainer {...args}>
      {swatch("A")}
      {swatch("B")}
      {swatch("C")}
    </RowContainer>
  ),
} satisfies Meta<typeof RowContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

const JUSTIFY_FIELD = ROW_CONTAINER_FIELDS.find((f) => f.id === "justify")!;
const ALIGN_FIELD = ROW_CONTAINER_FIELDS.find((f) => f.id === "align")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. RowContainer has no natural
 * click target (T1-SPEC.md §6 item 2 — same class as Glyph/TextBox/Stack):
 * assert the rendered DOM's computed layout matches the args this story
 * was actually rendered with instead.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvasElement.querySelector('[data-slot="row-container"]');
    if (!(row instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="row-container"] element in the DOM');
    }
    await expect(row.getAttribute("data-reading-direction")).toBe(args.readingDirection);
    await expect(row.getAttribute("data-justify")).toBe(args.justify);
    await expect(row.getAttribute("data-align")).toBe(args.align);
    await expect(row.style.gap).toBe(`${args.gap}px`);
    await expect(canvas.getAllByText(/^[ABC]$/)).toHaveLength(3);
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from
 * `args`, so the Controls panel still drives it live. The swept field's
 * own control is disabled — a story that paints every value at once
 * cannot honour a single `justify`/`align` and a control that silently
 * does nothing reads as broken (T1-SPEC.md §6, T0's own precedent).
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(ROW_CONTAINER_FIELDS, [fieldId]) },
});

/** Every real RowJustify value, one row per option. */
export const AllJustify: Story = {
  parameters: sweep("justify"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {JUSTIFY_FIELD.options!.map((option) => (
        <RowContainer
          {...args}
          key={option.value}
          justify={option.value as RowJustify}
          height={64}
        >
          {swatch("A", 40)}
          {swatch("B", 40)}
        </RowContainer>
      ))}
    </div>
  ),
};

/** Every real RowAlign value — needs a tall row for the difference to read. */
export const AllAlign: Story = {
  parameters: sweep("align"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ALIGN_FIELD.options!.map((option) => (
        <RowContainer {...args} key={option.value} align={option.value as RowAlign} height={80}>
          {swatch("A", 32)}
          {swatch("B", 32)}
        </RowContainer>
      ))}
    </div>
  ),
};

/**
 * RTL flips CSS flex-direction only — DOM order (and reading order) never
 * changes (T1-SPEC.md §4.4).
 */
export const ReadingDirectionRtl: Story = {
  args: { readingDirection: "rtl" },
};

/** Enough children to show wrapping/overflow behaviour, if any. */
export const ManyChildren: Story = {
  render: (args) => (
    <RowContainer {...args}>
      {Array.from({ length: 8 }, (_, i) => swatch(String(i + 1), 40))}
    </RowContainer>
  ),
};
