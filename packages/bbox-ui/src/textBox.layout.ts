/**
 * bbox-ui TextBox layout — the portable geometry of the text-leaf.
 *
 * TextBox's own size ladder, deliberately NOT `layout.ts`'s `TEXT_SIZES`
 * (frozen for T1) and NOT `Glyph`'s or `Port`'s own independent ladders —
 * see docs/T1-SPEC.md §0 on why three components each get their own 18px
 * "small" rung rather than one shared file. React-free, engine-free, same
 * discipline as `layout.ts`.
 */

/** TextBox's own ladder. Values match the board's own Text Size row. */
export const TEXT_BOX_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
export type TextBoxSize = keyof typeof TEXT_BOX_SIZES;

// WHY the array is the source and the type is derived: annotating the field
// table stopped the SCHEMA advertising a value the component cannot render,
// but not the reverse — widening the union and adding its stack left the
// panel silently offering three of four fonts with the suite green. With one
// runtime array behind both, a test can pin the field's options to it and
// catch growth in either direction. Same shape as BLOCK_ORIENTATIONS.
export const TEXT_BOX_FONTS = ["sans", "sketch", "mono"] as const;
export type TextBoxFont = (typeof TEXT_BOX_FONTS)[number];
export const TEXT_BOX_FONT_STACKS: Record<TextBoxFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  sketch: '"Segoe Print", "Bradley Hand", cursive',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export const TEXT_BOX_VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type TextBoxVerticalAlign = (typeof TEXT_BOX_VERTICAL_ALIGNS)[number];
export function textBoxAlignItems(
  align: TextBoxVerticalAlign,
): "flex-start" | "center" | "flex-end" {
  return align === "top" ? "flex-start" : align === "bottom" ? "flex-end" : "center";
}

export const TEXT_BOX_HORIZONTAL_ALIGNS = ["left", "middle", "right"] as const;
export type TextBoxHorizontalAlign = (typeof TEXT_BOX_HORIZONTAL_ALIGNS)[number];
export function textBoxJustifyContent(
  justify: TextBoxHorizontalAlign,
): "flex-start" | "center" | "flex-end" {
  return justify === "left" ? "flex-start" : justify === "right" ? "flex-end" : "center";
}
