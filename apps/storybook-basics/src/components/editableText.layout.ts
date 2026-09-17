/**
 * bbox-ui EditableText layout — the portable geometry of the text-leaf.
 *
 * EditableText's own size ladder, deliberately NOT `layout.ts`'s `TEXT_SIZES`
 * (frozen for T1) and NOT `Glyph`'s or `Port`'s own independent ladders —
 * see docs/T1-SPEC.md §0 on why three components each get their own 18px
 * "small" rung rather than one shared file. React-free, engine-free, same
 * discipline as `layout.ts`.
 *
 * PROVENANCE: OURS, AD HOC. NO PRIOR ART IS CLAIMED, and this file has no
 * donor — stated explicitly rather than left as an absence, because an
 * uncited file is ambiguous between "written here" and "nobody wrote down
 * where this came from", and only one of those is true.
 *
 * There is also no algorithm here to have prior art FOR. Every export is a
 * lookup table or a total `Record` over a string union: the size ladder, the
 * three font stacks, and the two align→flex maps. The one function with a
 * rule in it, `editableTextFontPx`, is a single ternary. The CSS values on
 * the right-hand side of those Records (`flex-start`/`center`/`flex-end`)
 * are of course the CSS Flexbox spec's, but this file does not implement
 * them — it names them and hands them to the browser, which is not a
 * citation-bearing act. The reason the tables are TOTAL Records rather than
 * ternaries is a real decision and it is documented at each seam below.
 */

/** EditableText's own ladder. Values match the board's own Text Size row. */
export const EDITABLE_TEXT_SIZES = { sm: 18, md: 24, lg: 36, xl: 44 } as const;
// WHY `EditableTextSize` widens by union rather than `EDITABLE_TEXT_SIZES` growing a
// fifth rung: "custom" has no single px value — it is the ESCAPE from the
// named ladder into `sizePx`, so it cannot live in a `Record<name, px>` the
// way sm/md/lg/xl do. `editableTextFontPx` below is the one place that resolves
// either shape back to a number. See docs/TEXTBOX-EDITING-SPEC.md §1.
export type EditableTextSize = keyof typeof EDITABLE_TEXT_SIZES | "custom";

/** The font-size in px for a given `size`/`sizePx` pair — the one function
 * that knows "custom" escapes the named ladder. `sizePx` is ignored for the
 * four named rungs, exactly like `font`/`align` ignore props that don't
 * apply to them. */
export function editableTextFontPx(size: EditableTextSize, sizePx: number): number {
  return size === "custom" ? sizePx : EDITABLE_TEXT_SIZES[size];
}

// WHY the array is the source and the type is derived: annotating the field
// table stopped the SCHEMA advertising a value the component cannot render,
// but not the reverse — widening the union and adding its stack left the
// panel silently offering three of four fonts with the suite green. With one
// runtime array behind both, a test can pin the field's options to it and
// catch growth in either direction. Same shape as BLOCK_ORIENTATIONS.
export const EDITABLE_TEXT_FONTS = ["sans", "sketch", "mono"] as const;
export type EditableTextFont = (typeof EDITABLE_TEXT_FONTS)[number];
export const EDITABLE_TEXT_FONT_STACKS: Record<EditableTextFont, string> = {
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
// lays out. The same shape as EDITABLE_TEXT_FONT_STACKS, which is why `font`
// already failed loudly and these two did not.
export const EDITABLE_TEXT_VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type EditableTextVerticalAlign = (typeof EDITABLE_TEXT_VERTICAL_ALIGNS)[number];
export const EDITABLE_TEXT_ALIGN_ITEMS: Record<EditableTextVerticalAlign, FlexPlacement> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};
export function editableTextAlignItems(align: EditableTextVerticalAlign): FlexPlacement {
  return EDITABLE_TEXT_ALIGN_ITEMS[align];
}

export const EDITABLE_TEXT_HORIZONTAL_ALIGNS = ["left", "middle", "right"] as const;
export type EditableTextHorizontalAlign = (typeof EDITABLE_TEXT_HORIZONTAL_ALIGNS)[number];
export const EDITABLE_TEXT_JUSTIFY_CONTENT: Record<EditableTextHorizontalAlign, FlexPlacement> = {
  left: "flex-start",
  middle: "center",
  right: "flex-end",
};
export function editableTextJustifyContent(justify: EditableTextHorizontalAlign): FlexPlacement {
  return EDITABLE_TEXT_JUSTIFY_CONTENT[justify];
}
