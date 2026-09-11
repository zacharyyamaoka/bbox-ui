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

export type TextBoxFont = "sans" | "sketch" | "mono";
export const TEXT_BOX_FONT_STACKS: Record<TextBoxFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  sketch: '"Segoe Print", "Bradley Hand", cursive',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export type TextBoxVerticalAlign = "top" | "middle" | "bottom";
export function textBoxAlignItems(
  align: TextBoxVerticalAlign,
): "flex-start" | "center" | "flex-end" {
  return align === "top" ? "flex-start" : align === "bottom" ? "flex-end" : "center";
}

export type TextBoxHorizontalAlign = "left" | "middle" | "right";
export function textBoxJustifyContent(
  justify: TextBoxHorizontalAlign,
): "flex-start" | "center" | "flex-end" {
  return justify === "left" ? "flex-start" : justify === "right" ? "flex-end" : "center";
}
