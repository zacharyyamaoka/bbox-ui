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
// WHY `TextBoxSize` widens by union rather than `TEXT_BOX_SIZES` growing a
// fifth rung: "custom" has no single px value — it is the ESCAPE from the
// named ladder into `sizePx`, so it cannot live in a `Record<name, px>` the
// way sm/md/lg/xl do. `textBoxFontPx` below is the one place that resolves
// either shape back to a number. See docs/TEXTBOX-EDITING-SPEC.md §1.
export type TextBoxSize = keyof typeof TEXT_BOX_SIZES | "custom";

/** The font-size in px for a given `size`/`sizePx` pair — the one function
 * that knows "custom" escapes the named ladder. `sizePx` is ignored for the
 * four named rungs, exactly like `font`/`align` ignore props that don't
 * apply to them. */
export function textBoxFontPx(size: TextBoxSize, sizePx: number): number {
  return size === "custom" ? sizePx : TEXT_BOX_SIZES[size];
}

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

type FlexPlacement = "flex-start" | "center" | "flex-end";

// WHY total Records rather than the ternaries these replace: deriving the
// union from the array made widening it reach the panel automatically, which
// is what we wanted — but a ternary has a fall-through, so a new member
// arrived as a live segment that silently rendered `center`, typecheck clean
// and every test green. A total Record is what makes the array the real
// source: adding a member is a compile error until someone says where it
// lays out. The same shape as TEXT_BOX_FONT_STACKS, which is why `font`
// already failed loudly and these two did not.
export const TEXT_BOX_VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type TextBoxVerticalAlign = (typeof TEXT_BOX_VERTICAL_ALIGNS)[number];
export const TEXT_BOX_ALIGN_ITEMS: Record<TextBoxVerticalAlign, FlexPlacement> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};
export function textBoxAlignItems(align: TextBoxVerticalAlign): FlexPlacement {
  return TEXT_BOX_ALIGN_ITEMS[align];
}

export const TEXT_BOX_HORIZONTAL_ALIGNS = ["left", "middle", "right"] as const;
export type TextBoxHorizontalAlign = (typeof TEXT_BOX_HORIZONTAL_ALIGNS)[number];
export const TEXT_BOX_JUSTIFY_CONTENT: Record<TextBoxHorizontalAlign, FlexPlacement> = {
  left: "flex-start",
  middle: "center",
  right: "flex-end",
};
export function textBoxJustifyContent(justify: TextBoxHorizontalAlign): FlexPlacement {
  return TEXT_BOX_JUSTIFY_CONTENT[justify];
}
