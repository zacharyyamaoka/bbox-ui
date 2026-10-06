// src/skin/skin.ts — ported by value from
// packages/bbox-ui/src/skin.ts (frozen v1, read-only donor), revision
// `c83c8b2` in this repo:
//
//   • The whole file — vocabulary (`BBOX_SKINS`/`BboxSkin`), labels,
//     blurbs, the closed `BBOX_SKIN_TOKENS` table, `BBOX_SKIN_ATTR`, and
//     `bboxSkinAttrs`. The token names (13 of the donor's 15 — see point
//     3 below) and every module-doc WHY (the third orthogonal axis, the
//     inherited-attribute mechanism, the no-rotate/no-width invariant)
//     travel unchanged — this app's job was never to redesign the
//     language, only to bring it to components that never had it.
//
// THE SKIN SET IS NO LONGER THE DONOR'S. Zach, 2026-09-17, renamed and
// grew it from three (`default`/`plain`/`sketch`) to ten — see
// `BBOX_SKINS` below for the order he specified and skin.css for each
// skin's own reasoning. The VOCABULARY (the closed token set) is
// untouched: every one of the seven new styles is made of nothing but
// values for tokens that already existed, which is the whole claim being
// tested — "how much room is there inside shadcn's token vocabulary".
// packages/bbox-ui is frozen v1 and still carries the original three;
// nothing here edits it. (Ported onto this file's M8 revision on
// 2026-09-30 from claude/orthogonal-design-styles-8d71d7, which predates
// M8 — so the new skins declare the 13 tokens, never the retired
// `crisp`/`outline` pair.)
//
// WHAT CHANGED in the port, exhaustively:
//
//   1. `SkinToken.fallback` no longer means "the one fallback string every
//      call site of this token must use, byte for byte". The donor
//      package already had a single consistent look across every
//      component before skins existed (Block, Region, Pill, Bar, Port all
//      already painted `--foreground`/`--card`), so one global default per
//      token was simply true. THIS app's components are ported/rebuilt
//      independently (block.tsx: `border-border` + `shadow-sm` +
//      `rounded-lg`; badge.tsx: cva variants with per-variant colours) —
//      their pre-skin looks genuinely differ from each other. So the
//      per-call-site literal recorded here documents what THAT component
//      rendered before this port, not a cross-file invariant — the
//      per-component "no skin set -> byte-identical" guarantee (S1) is
//      what `skin.test.ts` and the Styles stories actually enforce, not a
//      shared string. `fallback` below is therefore advisory/documentation
//      only in this port; see skin.test.ts for what actually gets checked.
//   2. Otherwise unchanged: same 13 remaining names, same "paints" column,
//      same `null`-means-computed convention for the suppression token.
//   3. TWO tokens the donor still carries, `bbox-skin-crisp` and
//      `bbox-skin-outline`, are DELETED here — the one deliberate
//      divergence from "travels unchanged" above, and it is deliberate:
//      docs/peps/0001-sketch-skin-at-the-boundary.md (migration M8). Both
//      existed only to switch between a core-rendered crisp element and a
//      core-rendered hand-drawn twin; this app's core renders no twin at
//      all any more (`src/skin/SketchAtEdge.tsx` draws from outside
//      instead), so there is nothing left for either token to switch
//      between. `packages/bbox-ui` is frozen v1 and still needs them —
//      this is exactly the kind of divergence CLAUDE.md's "trunk" section
//      anticipates: new design work happens here, not there.
//
// WHY this still lives in its own file rather than folding into
// globals.css or a component: the vocabulary is the CONTRACT between this
// package's components and any consumer's CSS — `bbox-skin-{radius,...}`
// is a public spelling, and a single typed source is what lets
// `skin.test.ts` catch a token that exists in the CSS but not here (or
// vice versa) instead of it quietly rendering as "the default".

/**
 * WHY the array is the source and the type is derived: a hand-written
 * union lets the vocabulary and the thing that renders it drift, and every
 * total `Record<BboxSkin, …>` below becomes a compile error until a new
 * skin says what it paints.
 *
 * THE ORDER IS THE PRODUCT. This array is what `.storybook/preview.tsx`
 * maps over to build the toolbar picker and what `Styles.stories.tsx`
 * maps over to build its columns, so the order here is the order Zach
 * reads them in — which he specified directly (2026-09-17):
 *
 *   1. No skin (today)   <- not a member: the absence of the attribute
 *   2. Unstyled          3. Sketch            4. Shadcn
 *   5. No. 1 · Vellum    6. No. 2 · Blueprint 7. No. 3 · Brutal
 *   8. No. 4 · Terminal  9. No. 5 · Porcelain  10. No. 6 · Notion
 *   11. No. 7 · Obsidian
 *
 * His list starts at 2 because rung 1 is the picker's "No skin (today)"
 * — the state where no `data-bbox-skin` attribute exists anywhere in
 * scope. That rung is deliberately NOT a member of this array: it is the
 * absence of a skin, not an eleventh one, and modelling it as a member is
 * what would make "switch back to nothing" unexpressible. skin.test.ts
 * pins this exact order so a reordering edit has to be deliberate.
 *
 * WHAT CHANGED from the donor's three (`default`/`plain`/`sketch`):
 * `default` became `shadcn` (it was always the shadcn/ui look, and
 * "default" hid that behind a word meaning "whatever is on"); `plain` was
 * dropped here and survives untouched in the frozen packages/bbox-ui;
 * `unstyled` and the seven numbered styles are new. skin.css carries the
 * per-skin reasoning.
 */
export const BBOX_SKINS = [
  "unstyled",
  "sketch",
  "shadcn",
  "vellum",
  "blueprint",
  "brutal",
  "terminal",
  "porcelain",
  "notion",
  "obsidian",
] as const;
export type BboxSkin = (typeof BBOX_SKINS)[number];

/**
 * The picker label. The numbered styles carry Zach's own numbering in their
 * label, not just their position — a picker shows one item at a time, and
 * "No. 3" is the name he will use to ask for one of them.
 */
export const BBOX_SKIN_LABELS: Record<BboxSkin, string> = {
  unstyled: "Unstyled",
  sketch: "Sketch",
  shadcn: "Shadcn",
  vellum: "No. 1 · Vellum",
  blueprint: "No. 2 · Blueprint",
  brutal: "No. 3 · Brutal",
  terminal: "No. 4 · Terminal",
  porcelain: "No. 5 · Porcelain",
  notion: "No. 6 · Notion",
  obsidian: "No. 7 · Obsidian",
};

export const BBOX_SKIN_BLURBS: Record<BboxSkin, string> = {
  unstyled:
    "Undecorated, not invisible — the Base UI reading. No fill, no shadow, no corner, the browser's own serif, and the browser's own `ButtonBorder` on every line. The ports and wires keep their colour, because that belongs to state and not to the skin.",
  sketch:
    "Hand-drawn: an informal font and corners that are not quite the same on any two sides. The border keeps its 2px and paints nothing; an SVG path draws on top of it.",
  shadcn:
    "The stock design system, unmodified — shadcn/ui's own radius, border and card, resolved through globals.css. This is the rung to switch back to.",
  vellum:
    "Soft and friendly: a 14px corner, a rounded letterform, a warm paper tint and a line quiet enough to stop shouting. Ambient shadow instead of a hard edge.",
  blueprint:
    "Drafting paper. Square everything — pills included — a cyan line on a blue wash, no depth at all, and a condensed technical face.",
  brutal:
    "Neo-brutalist: square, a full-strength foreground line, and a 5px hard offset shadow with zero blur. The silhouette changes; the geometry does not.",
  terminal:
    "A modern terminal window rather than a CRT — warm charcoal, a 6px corner, an amber-leaning hairline and a real drop shadow. Monospace in every slot, including the ones that ask for sans.",
  porcelain:
    "Soft depth and almost no line — a translucent surface with two stacked shadows doing the work the border used to do. Names no hue, so it follows light/dark for free.",
  notion:
    "The document, not the app. A 4px corner, a fill one step off the page, a line you have to look for, and no depth at all. Tags are rounded rectangles, not pills.",
  obsidian:
    "The vault. One violet accent on an almost-neutral ground, an 8px corner, 4px tags, and elevation done with Obsidian's own three-stop shadow rather than a line.",
};

/**
 * The attribute a host stamps. Any ancestor will do — `<html>` for a whole
 * app, a single `<Block>` for one card — because every token below
 * inherits.
 */
export const BBOX_SKIN_ATTR = "data-bbox-skin";

/**
 * The closed token set a skin may define. Real exported data, not a
 * comment — `skin.test.ts` asserts `skin.css` defines exactly these for
 * exactly the skins in `BBOX_SKINS` and no others. A token that exists in
 * the CSS but not here (or vice versa) is the failure this list exists to
 * catch.
 */
export interface SkinToken {
  /** Custom property name, without the leading `--`. */
  name: string;
  /**
   * Documentation only in this port (see the file header's point 1) —
   * what a REPRESENTATIVE call site falls back to. `null` means the
   * fallback is COMPUTED by the component's own cascade rather than
   * written in the source (`--bbox-skin-line-override`, `--bbox-skin-dot-rings`).
   */
  fallback: string | null;
  /** Which CSS property it ends up in, for the docs table. */
  paints: string;
}

export const BBOX_SKIN_TOKENS: readonly SkinToken[] = [
  { name: "bbox-skin-radius", fallback: null, paints: "border-radius (Block, CodeEditor)" },
  { name: "bbox-skin-radius-pill", fallback: "9999px", paints: "border-radius (Badge pill shape)" },
  { name: "bbox-skin-stroke-width", fallback: "2px", paints: "border-width" },
  { name: "bbox-skin-stroke", fallback: null, paints: "border-color" },
  { name: "bbox-skin-surface", fallback: null, paints: "background" },
  { name: "bbox-skin-shadow", fallback: null, paints: "box-shadow" },
  { name: "bbox-skin-font", fallback: "inherit", paints: "font-family (inherited by every text slot)" },
  // WHY there is no `bbox-skin-outline` entry any more (migration M8):
  // it used to be a `display` switch between a core-rendered crisp
  // element and a core-rendered hand-drawn twin. The core renders no twin
  // at all now — `SketchAtEdge.tsx` draws from outside instead — so there
  // is nothing left for a display switch to pick between.
  { name: "bbox-skin-ink", fallback: "var(--color-foreground)", paints: "stroke (the drawn line, painted at the boundary — see --bbox-ink-state)" },
  { name: "bbox-skin-fg", fallback: null, paints: "color (a component's own text, which a fill-less skin must re-point)" },
  // Lets a skin blank out a border whose COLOUR belongs to another axis
  // (Port's state rings, a semantic Badge variant). Undefined (`initial`)
  // on every skin but sketch (`transparent`) and unstyled (`currentColor`,
  // the primitive's own text colour — still not a colour the skin chose),
  // so elsewhere the `var()` fallback is the real colour.
  { name: "bbox-skin-line-override", fallback: null, paints: "border-color on state-painted components" },
  { name: "bbox-skin-font-sans", fallback: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', paints: "font-family for a sans text slot, set inline and so beats inheritance" },
  { name: "bbox-skin-font-mono", fallback: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', paints: "font-family inside CodeEditor" },
  // WHY there is no `bbox-skin-crisp` entry any more (migration M8): the
  // inverse of `bbox-skin-outline` above, retired for the identical
  // reason — the core emits no twin for it to switch away from.
  // A Port's rings are box-shadow layers, not a border, so `transparent`
  // is not a way to blank them. Same contract as line-override: the skin
  // names no colour, only "do not paint the CSS one".
  { name: "bbox-skin-dot-rings", fallback: null, paints: "box-shadow (a Port dot's state rings)" },
] as const;

/**
 * `{ "data-bbox-skin": skin }`, ready to spread onto any element.
 *
 * WHY a helper for one key: the attribute name is the whole public
 * contract between this package and a host's CSS, and a host that types
 * `data-bbox-theme` by hand gets no error — just a board that never
 * changes. One import, one typo-proof spelling, and `BboxSkin` narrows
 * the value.
 */
export function bboxSkinAttrs(skin: BboxSkin): Record<string, string> {
  return { [BBOX_SKIN_ATTR]: skin };
}
