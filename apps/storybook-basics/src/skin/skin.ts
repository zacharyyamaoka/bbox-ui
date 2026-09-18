// src/skin/skin.ts — ported by value from
// packages/bbox-ui/src/skin.ts (frozen v1, read-only donor), revision
// `c83c8b2` in this repo:
//
//   • The whole file — vocabulary (`BBOX_SKINS`/`BboxSkin`), labels,
//     blurbs, the closed `BBOX_SKIN_TOKENS` table, `BBOX_SKIN_ATTR`, and
//     `bboxSkinAttrs`. The three skins (`default`/`plain`/`sketch`), the
//     15 token names, and every module-doc WHY (the third orthogonal
//     axis, the inherited-attribute mechanism, the no-rotate/no-width
//     invariant) travel unchanged — this app's job was never to redesign
//     the language, only to bring it to components that never had it.
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
//   2. Nothing else changed: same 15 names, same "paints" column, same
//      `null`-means-computed convention for the two suppression tokens.
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
 */
export const BBOX_SKINS = ["default", "plain", "sketch"] as const;
export type BboxSkin = (typeof BBOX_SKINS)[number];

export const BBOX_SKIN_LABELS: Record<BboxSkin, string> = {
  default: "Default",
  plain: "Plain",
  sketch: "Sketch",
};

export const BBOX_SKIN_BLURBS: Record<BboxSkin, string> = {
  default: "Today's look, unchanged — what you get when no skin is set.",
  plain: "Square corners, one hairline, no shadow. The austere reading — a schematic.",
  sketch: "Hand-drawn: an informal font and corners that are not quite the same on any two sides.",
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
  // The two that switch between a CSS border and a drawn one. `outline` is
  // a `display` value, not a colour: only the sketch skin sets it to
  // `block`, so every other skin renders `SketchOutline` and never paints
  // it.
  { name: "bbox-skin-outline", fallback: "none", paints: "display (SketchOutline's <svg>)" },
  { name: "bbox-skin-ink", fallback: "var(--color-foreground)", paints: "stroke (the drawn line)" },
  { name: "bbox-skin-fg", fallback: null, paints: "color (a component's own text, which a fill-less skin must re-point)" },
  // Lets a skin blank out a border whose COLOUR belongs to another axis
  // (Port's state rings, a semantic Badge variant). Undefined on every
  // skin but sketch, so the `var()` fallback is the real colour.
  { name: "bbox-skin-line-override", fallback: null, paints: "border-color on state-painted components" },
  { name: "bbox-skin-font-sans", fallback: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', paints: "font-family for a sans text slot, set inline and so beats inheritance" },
  { name: "bbox-skin-font-mono", fallback: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', paints: "font-family inside CodeEditor" },
  // The inverse of `--bbox-skin-outline`: an SVG path has no "transparent
  // but still there" the way a border does, so a sketch-drawn component
  // renders both the crisp path and the drawn one and CSS picks.
  { name: "bbox-skin-crisp", fallback: "inline", paints: "display (the un-sketched twin of a drawn element)" },
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
