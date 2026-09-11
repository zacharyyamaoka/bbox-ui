import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  TextBox,
  TEXT_BOX_FIELDS,
  type TextBoxFont,
  type TextBoxHorizontalAlign,
  type TextBoxSize,
  type TextBoxVerticalAlign,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1 Lane X: TextBox, end to end. `argTypes`/`args` below are GENERATED
 * from `TEXT_BOX_FIELDS` (packages/bbox-ui/src/textBox.fields.ts) — the
 * SAME array the generic product inspector (demos/inspector) reads. Add a
 * field there and both surfaces pick it up; nothing here is kept in sync
 * by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every schema-driven component shares
 * — one degree looser than `TextBox`'s own literal-union prop types.
 * `textBox.fields.test.ts` is what actually proves the values line up.
 *
 * No `Presets` story: `TEXT_BOX_PRESETS` is empty — no board evidence
 * gives TextBox a state axis, it is pure typography (docs/T1-SPEC.md §4.2).
 */
const meta = {
  title: "Components/TextBox",
  component: TextBox,
  args: defaultArgs(TEXT_BOX_FIELDS) as Partial<ComponentProps<typeof TextBox>>,
  argTypes: toArgTypes(TEXT_BOX_FIELDS),
} satisfies Meta<typeof TextBox>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZE_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "size")!;
const FONT_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "font")!;
const ALIGN_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "align")!;
const JUSTIFY_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "justify")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. TextBox has no natural
 * "click the dot" interaction (docs/T1-SPEC.md §6 point 2), so this
 * asserts the rendered DOM matches `args` instead: the painted text, its
 * font size and family, and its padding on all four sides all equal what
 * this story was actually rendered with, in whichever host is active.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const box = canvasElement.querySelector('[data-slot="text-box"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="text-box"] element in the DOM');
    }
    await expect(box.getAttribute("data-size")).toBe(args.size);
    await expect(box.getAttribute("data-font")).toBe(args.font);
    await expect(box.getAttribute("data-align")).toBe(args.align);
    await expect(box.getAttribute("data-justify")).toBe(args.justify);
    await expect(box.style.paddingTop).toBe(`${args.paddingTop}px`);
    await expect(box.style.paddingBottom).toBe(`${args.paddingBot}px`);
    await expect(box.style.paddingLeft).toBe(`${args.paddingLeft}px`);
    await expect(box.style.paddingRight).toBe(`${args.paddingRight}px`);
    if (args.children != null) {
      await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    }
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live. The swept field's own control
 * is disabled, because a story that paints every option at once cannot
 * honour a single value and a control that silently does nothing reads as
 * broken (Zach, 2026-09-10: "the controls didn't work for the other
 * things").
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: [fieldId] },
});

/** Every real TextBoxSize, board's own descending order (44/36/24/18px). */
export const AllSizes: Story = {
  parameters: sweep("size"),
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <TextBox {...args} key={option.value} size={option.value as TextBoxSize}>
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/** Every real TextBoxFont (sans/sketch/mono). */
export const AllFonts: Story = {
  parameters: sweep("font"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {FONT_FIELD.options!.map((option) => (
        <TextBox {...args} key={option.value} font={option.value as TextBoxFont}>
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * Vertical align only becomes visible once the box has an explicit height
 * — this gallery gives every cell one so the sweep is honest, not a no-op.
 */
export const AllAligns: Story = {
  parameters: sweep("align"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      {ALIGN_FIELD.options!.map((option) => (
        <TextBox
          {...args}
          key={option.value}
          align={option.value as TextBoxVerticalAlign}
          style={{ height: 96, outline: "1px dashed var(--tl-color-muted-1, #ccc)" }}
        >
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * Horizontal justify only becomes visible once the box has an explicit
 * width — same honest-sweep reasoning as `AllAligns`.
 */
export const AllJustifies: Story = {
  parameters: sweep("justify"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {JUSTIFY_FIELD.options!.map((option) => (
        <TextBox
          {...args}
          key={option.value}
          justify={option.value as TextBoxHorizontalAlign}
          style={{ width: 240, outline: "1px dashed var(--tl-color-muted-1, #ccc)" }}
        >
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * The one real way to get a truly empty box: omit `children` entirely —
 * `TEXT_BOX_FIELDS`'s own `"Text Box"` default is a demoable placeholder,
 * never a fact about the component (see `textBox.fields.ts`'s comment on
 * that field and `textBox.fields.test.ts`'s explicit assertion of this
 * deviation).
 */
export const Empty: Story = {
  args: { children: undefined },
};
