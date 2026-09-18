// src/components/codeEditorLayout.ts — the columns → pixel-width maths,
// recovered from claude/code-block-primitive's packages/bbox-ui/src/
// codeBlock.layout.ts (`CODE_BLOCK_GUTTER_PX`, `CODE_BLOCK_CHAR_RATIO`,
// `codeBlockCharPx`, `codeBlockWidthPx`) after main's 368a524 dropped the
// whole `look`/preset ladder that file also carried. Trimmed to just the
// width maths — no size ladder, no look/overflow enum, no `grow`/
// `grow-truncated` (this app has no FieldSpec/preset machinery to hang
// those on). Pure numbers, no React, no CodeMirror.
//
// DONOR LINES (branch `claude/code-block-primitive`, tip dc30352, read
// 2026-09-17 — the branch is unmerged but present, so `git show
// claude/code-block-primitive:packages/bbox-ui/src/codeBlock.layout.ts`
// resolves these offline):
//   • `:111` `CODE_BLOCK_GUTTER_PX = 36`  -> `CODE_EDITOR_GUTTER_PX`
//   • `:112` `CODE_BLOCK_CHAR_RATIO = 0.61` -> `CODE_EDITOR_CHAR_RATIO`
//   • `:116` `codeBlockCharPx` body        -> `codeEditorCharPx`
//   • `:135` `codeBlockWidthPx` body       -> `codeEditorWidthPx`
// Renames only; the arithmetic is byte-identical. main's 368a524 is the
// commit that dropped the rest of that file.
//
// NO PRIOR ART IS CLAIMED. `0.61` is an EMPIRICAL constant — a measured
// glyph-advance ratio for one specific font stack, not a derived or
// published figure — and the width formula is plain addition. The honest
// caveat that goes with an empirical constant: it is only right for the
// `ui-monospace` stack it was measured on, and a host that swaps the font
// silently gets a wrong width. That is a known limitation, not a bug being
// reported here.

/** The line-number gutter's reserved width, and the mono-cell approximation
 * (glyph advance ≈ 0.61 × font-size for the ui-monospace stack) — both
 * SystemSketch's own measured constants, ported via codeBlock.layout.ts. */
export const CODE_EDITOR_GUTTER_PX = 36;
export const CODE_EDITOR_CHAR_RATIO = 0.61;

/** Width in px of one character cell at `fontPx`. */
export function codeEditorCharPx(fontPx: number): number {
  return Math.max(1, fontPx * CODE_EDITOR_CHAR_RATIO);
}

/**
 * The box width a CodeEditor takes to show `columns` characters — padding,
 * plus the gutter when line numbers are on, plus the cells. `columns` is
 * the AUTHORED fact ("100 ch"), pixels derive from it, never the other way
 * round. Returns `undefined` for `columns <= 0`, the "fill whatever the
 * host gives me" default.
 */
export function codeEditorWidthPx(
  columns: number,
  fontPx: number,
  lineNumbers: boolean,
  paddingLeft: number,
  paddingRight: number,
): number | undefined {
  if (!Number.isFinite(columns) || columns <= 0) return undefined;
  return Math.round(
    paddingLeft +
      paddingRight +
      (lineNumbers ? CODE_EDITOR_GUTTER_PX : 0) +
      Math.round(columns) * codeEditorCharPx(fontPx),
  );
}
