import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { Glyph, GLYPH_FIELDS, type GlyphSize } from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * T1 Lane G: Glyph, end to end. `argTypes`/`args` below are GENERATED from
 * `GLYPH_FIELDS` (packages/bbox-ui/src/glyph.fields.ts) — the SAME array
 * the generic product inspector (demos/inspector) reads. Add a field there
 * and both surfaces pick it up; nothing here is kept in sync by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every schema-driven component shares
 * — one degree looser than `Glyph`'s own literal-union prop types.
 * `glyph.fields.test.ts` is what actually proves the values line up.
 *
 * No `Presets` story: `GLYPH_PRESETS` is empty — nothing on the board or
 * in any donor gives Glyph a state axis (docs/T1-SPEC.md §4.1).
 */
const meta = {
  title: "Components/Glyph",
  component: Glyph,
  args: defaultArgs(GLYPH_FIELDS) as Partial<ComponentProps<typeof Glyph>>,
  argTypes: toArgTypes(GLYPH_FIELDS),
} satisfies Meta<typeof Glyph>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZE_FIELD = GLYPH_FIELDS.find((f) => f.id === "size")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Glyph has no natural
 * "click the dot" interaction (it is an inert slot, docs/T1-SPEC.md §6
 * point 2), so this asserts the rendered DOM matches `args` instead: the
 * painted square's side length and inner padding both equal what this
 * story was actually rendered with, in whichever host is active.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const slot = canvasElement.querySelector('[data-slot="glyph"]');
    if (!(slot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="glyph"] element in the DOM');
    }
    await expect(slot.getAttribute("data-size")).toBe(args.size);
    await expect(slot.style.padding).toBe(`${args.padding}px`);
    if (args.children != null) {
      await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    }
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live. The swept field's own control
 * is disabled, because a story that paints all four sizes at once cannot
 * honour a single `size` and a control that silently does nothing reads as
 * broken (Zach, 2026-09-10: "the controls didn't work for the other
 * things").
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: [fieldId] },
});

/** Every real GlyphSize (18 / 24 / 36 / 44px). */
export const AllSizes: Story = {
  parameters: sweep("size"),
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <Glyph {...args} key={option.value} size={option.value as GlyphSize}>
          {args.children}
        </Glyph>
      ))}
    </div>
  ),
};

/**
 * The one real way to get the bare, empty square: omit `children` entirely
 * — `GLYPH_FIELDS`'s own `"🔍"` default is a demoable placeholder, never a
 * fact about the component (see `glyph.fields.ts`'s comment on that field
 * and `glyph.fields.test.ts`'s explicit assertion of this deviation).
 */
export const Empty: Story = {
  args: { children: undefined },
};
