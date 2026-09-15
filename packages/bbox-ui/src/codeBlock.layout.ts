/**
 * bbox-ui CodeBlock layout — the portable geometry of the code leaf.
 *
 * CodeBlock's own size ladder, deliberately NOT `TextBox`'s (18/24/36/44 —
 * board display text) and NOT `layout.ts`'s frozen `TEXT_SIZES`: code is
 * read at editor sizes, so the rungs are SystemSketch's own Code block
 * ladder (12/16/20/24, `codeModel.ts`'s `CODE_FONT_SIZES`; Medium = 16px was
 * fixed by the V5 babble direction as the reference specimen's default).
 * React-free, engine-free, same discipline as `layout.ts`.
 */

/** CodeBlock's own ladder. Values match SystemSketch's Code block. */
export const CODE_BLOCK_SIZES = { sm: 12, md: 16, lg: 20, xl: 24 } as const;
// WHY `CodeBlockSize` widens by union rather than the table growing a fifth
// rung: "custom" has no single px value — it is the ESCAPE from the named
// ladder into `sizePx` (Port's label passes its own 11px this way), exactly
// TextBox's shape (`textBox.layout.ts`).
export type CodeBlockSize = keyof typeof CODE_BLOCK_SIZES | "custom";

/** The font-size in px for a `size`/`sizePx` pair — the one function that
 * knows "custom" escapes the named ladder. */
export function codeBlockFontPx(size: CodeBlockSize, sizePx: number): number {
  return size === "custom" ? sizePx : CODE_BLOCK_SIZES[size];
}

/**
 * The two looks one CodeBlock can wear — Zach, 2026-09-14: "the code field
 * is basically just like a codeblock without line numbers ... I feel it's
 * the exact same thing." It is. A `look` is a PRESET (`codeBlock.presets.ts`)
 * over the same fields, never a second component: `block` is the canvas
 * Code block (gutter, many lines, a surface's padding); `field` is the
 * compact one-line box that sits in a Port's label slot or an inspector row.
 */
export const CODE_BLOCK_LOOKS = ["block", "field"] as const;
export type CodeBlockLook = (typeof CODE_BLOCK_LOOKS)[number];
export const CODE_BLOCK_LOOK_LABELS: Record<CodeBlockLook, string> = {
  block: "Block",
  field: "Field",
};

/** One line (a typed or pasted newline is dropped) or a real document. */
export const CODE_BLOCK_LINES = ["single", "multi"] as const;
export type CodeBlockLines = (typeof CODE_BLOCK_LINES)[number];

/**
 * What a line that is wider than the box does — Zach, 2026-09-15: "if text
 * wrapping then it goes onto a new line; if not then you get the scroll
 * bar; if overflow, then it should resize the width to match the text."
 * Plus `clip`, the input-like behaviour a Port label already had (cut at
 * the edge, no bar, no growth), which stays the field look's default.
 * Governed by `look` (`codeBlock.presets.ts`), overridable per instance.
 */
export const CODE_BLOCK_OVERFLOWS = ["clip", "wrap", "scroll", "grow"] as const;
export type CodeBlockOverflow = (typeof CODE_BLOCK_OVERFLOWS)[number];
export const CODE_BLOCK_OVERFLOW_LABELS: Record<CodeBlockOverflow, string> = {
  clip: "Clip",
  wrap: "Wrap",
  scroll: "Scroll",
  grow: "Grow",
};

/**
 * The languages the `language` menu offers. Same nine as SystemSketch's
 * Code block (`CODE_LANGUAGES`); `codeBlockLanguages.ts` maps each to its
 * CodeMirror package. The labels are a total Record (not a bare array) so
 * adding a tenth here is a compile error until it has a label AND a parser.
 */
export const CODE_BLOCK_LANGUAGES = [
  "plaintext",
  "python",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "sql",
  "markdown",
] as const;
export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number];
export const CODE_BLOCK_LANGUAGE_LABELS: Record<CodeBlockLanguage, string> = {
  plaintext: "Plain text",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  markdown: "Markdown",
};

/** The line-number gutter's reserved width, and the mono-cell approximation
 * (glyph advance ≈ 0.61 × font-size for the ui-monospace stack) — both
 * SystemSketch's own measured constants (`CODE_GUTTER_WIDTH`,
 * `codeCharacterPixels`). */
export const CODE_BLOCK_GUTTER_PX = 36;
export const CODE_BLOCK_CHAR_RATIO = 0.61;

/** Width in px of one character cell at `fontPx`. */
export function codeBlockCharPx(fontPx: number): number {
  return Math.max(1, fontPx * CODE_BLOCK_CHAR_RATIO);
}

/**
 * The box width a CodeBlock takes to show `columns` characters — padding,
 * plus the gutter when line numbers are on, plus the cells. `columns` is
 * the AUTHORED fact ("40 ch" in the toolbar readout); pixels derive from
 * it, never the other way round. Returns `undefined` for `columns <= 0`,
 * the "fill whatever the host gives me" default.
 */
export function codeBlockWidthPx(
  columns: number,
  fontPx: number,
  lineNumbers: boolean,
  paddingLeft: number,
  paddingRight: number,
): number | undefined {
  if (!Number.isFinite(columns) || columns <= 0) return undefined;
  return Math.round(
    paddingLeft + paddingRight + (lineNumbers ? CODE_BLOCK_GUTTER_PX : 0) + Math.round(columns) * codeBlockCharPx(fontPx),
  );
}
