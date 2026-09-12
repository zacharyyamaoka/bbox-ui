import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { decodeGlyphContent } from "@bbox-ui/glyph-content";
import { Glyph, glyphFootprint, GLYPH_FIELDS, GLYPH_PRESETS, type GlyphSize } from "@bbox-ui/core";
import type { ComponentProps } from "react";

/**
 * Glyph v2, end to end (docs/GLYPH-PLAN.md's contract). `argTypes`/`args`
 * below are GENERATED from `GLYPH_FIELDS` (packages/bbox-ui/src/glyph.fields.ts)
 * — the SAME array the generic product inspector (`@bbox-ui/panel`) reads.
 * Add a field there and both surfaces pick it up; nothing here is kept in
 * sync by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every schema-driven component shares
 * — one degree looser than `Glyph`'s own literal-union prop types.
 * `glyph.fields.test.ts` is what actually proves the values line up.
 *
 * No `Presets` story: `GLYPH_PRESETS`'s four entries only govern `size`
 * from `sizePreset`, and `AllSizes` below already sweeps that same axis
 * with a rendered comparison — a second story would just repaint it.
 */
const meta = {
  title: "Components/Glyph",
  component: Glyph,
  args: defaultArgs(GLYPH_FIELDS, GLYPH_PRESETS) as Partial<ComponentProps<typeof Glyph>>,
  argTypes: toArgTypes(GLYPH_FIELDS),
} satisfies Meta<typeof Glyph>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZE_PRESET_FIELD = GLYPH_FIELDS.find((f) => f.id === "sizePreset")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. Glyph has no natural
 * "click the dot" interaction outside a mounted picker (phase 3 — see the
 * plan), so this asserts the rendered DOM matches `args` instead: the
 * painted square's side length is `glyphFootprint`'s own resolution of
 * `args` — the SAME function the tldraw/React Flow adapters call, so this
 * story can never quietly drift from what a canvas would paint — and any
 * `content` that decodes to plain text shows up as real DOM text.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const slot = canvasElement.querySelector('[data-slot="glyph"]');
    if (!(slot instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="glyph"] element in the DOM');
    }
    const footprint = glyphFootprint({
      sizePreset: args.sizePreset as GlyphSize | undefined,
      size: args.size as number | undefined,
      padding: args.padding as number | undefined,
    });
    await expect(Number(slot.getAttribute("data-size"))).toBe(footprint.size);
    await expect(slot.style.padding).toBe(`${args.padding}px`);
    const decoded = decodeGlyphContent(args.content as string | undefined);
    if (decoded.kind === "text" && decoded.text !== "") {
      await expect(canvas.getByText(decoded.text)).toBeInTheDocument();
    }
  },
};

/**
 * A gallery story sweeps a set of fields and takes every other field from
 * `args`, so the Controls panel still drives it live. The swept fields'
 * own controls are disabled, because a story that paints all four sizes at
 * once cannot honour a single `sizePreset`/`size` and a control that
 * silently does nothing reads as broken (Zach, 2026-09-10: "the controls
 * didn't work for the other things").
 */
const sweep = (fieldIds: string | string[]) => ({
  controls: { exclude: controlNames(GLYPH_FIELDS, Array.isArray(fieldIds) ? fieldIds : [fieldIds]) },
});

/** Every real size preset (18 / 24 / 36 / 44px). `size` is excluded from
 *  the swept controls too — an explicit override would paint all four
 *  instances at one size, defeating the point of the comparison. */
export const AllSizes: Story = {
  parameters: sweep(["sizePreset", "size"]),
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_PRESET_FIELD.options!.map((option) => (
        <Glyph {...args} key={option.value} sizePreset={option.value as GlyphSize} size={undefined} />
      ))}
    </div>
  ),
};

/**
 * The bare, empty square — `content: ""` is Glyph's real default (no
 * placeholder deviation any more; see this file's own header and
 * `glyph.fields.test.ts`'s `data-empty` assertion). Kept as its own story
 * because "what does nothing look like" is worth a dedicated frame even
 * though it now matches the meta's own default args.
 */
export const Empty: Story = {
  args: { content: "" },
};
