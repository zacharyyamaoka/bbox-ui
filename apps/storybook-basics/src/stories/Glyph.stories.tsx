import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { GLYPH_SIZES, type GlyphSize } from "../components/glyph.layout";
import { Glyph } from "../components/glyph";

const meta = {
  title: "Basics/Glyph",
  component: Glyph,
  args: {
    content: "lucide:rocket",
  },
} satisfies Meta<typeof Glyph>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A resolved Lucide icon — `content="lucide:rocket"` through the preview
 *  decorator's `GlyphResolverProvider`. */
export const LucideIcon: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="glyph"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="glyph"]');
    await expect(el.getAttribute("data-content-kind")).toBe("lucide");
    await expect(el.querySelector("svg")).not.toBeNull();
  },
};

/** An emoji glyph. */
export const Emoji: Story = { args: { content: "emoji:🚀" } };

/** A plain-text glyph — a single character/short run rendered as text, not
 *  resolved through any icon set. */
export const Text: Story = { args: { content: "text:B" } };

/** A `data:` image glyph — a tiny inline SVG so the story stays
 *  self-contained (no network fetch in a play function). */
const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#888"/></svg>';
export const Image: Story = {
  args: { content: `data:image/svg+xml;utf8,${encodeURIComponent(DOT_SVG)}` },
};

/** No content and no children — the dashed-square empty-slot placeholder. */
export const Empty: Story = {
  args: { content: "" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="glyph"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="glyph"]');
    await expect(el.getAttribute("data-empty")).toBe("true");
  },
};

/** The sm/md/lg/xl size rungs, stacked, same Lucide content in each. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
      {(Object.keys(GLYPH_SIZES) as GlyphSize[]).map((sizePreset) => (
        <div key={sizePreset} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <Glyph content="lucide:anchor" sizePreset={sizePreset} />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            {sizePreset} ({GLYPH_SIZES[sizePreset]}px)
          </span>
        </div>
      ))}
    </div>
  ),
};
