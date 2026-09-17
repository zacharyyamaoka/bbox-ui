/**
 * bbox-ui skin — the SHAPE language, the third orthogonal appearance axis.
 *
 * WHY a third axis beside theme.css and appearance.ts, rather than more
 * rungs on either: the three answer different questions and compose
 * freely.
 *
 *   theme      (theme.css, `data-theme`)  — WHICH COLOURS. light / dark.
 *   appearance (appearance.ts, `state`)   — WHAT THIS THING IS. empty /
 *                                           valueSet / wired / received.
 *   skin       (this file, `data-bbox-skin`) — WHAT IT IS DRAWN LIKE.
 *                                           default / plain / sketch.
 *
 * A sketch-skinned board in dark mode with a wired Port is all three at
 * once, and no axis knows the others exist. Folding skin into `state`'s
 * preset family would have made them a single 3 x 2 x 4 enum and broken
 * `assertDisjointPresets` the moment two selectors both claimed
 * `lineColor` — see the module doc in `appearance.ts` on why `tone` is an
 * override rather than a second preset family, which is the same argument.
 *
 * WHY a CSS custom-property layer and not a prop, a preset family or a
 * cva variant (the three alternatives scored in
 * reports/component-skins-proposal-2026-09-17.html):
 *
 *   - It is INHERITED, so one attribute on any ancestor re-skins an entire
 *     board. A prop would have to be threaded through every component,
 *     every adapter and every shape record.
 *   - It costs the adapters NOTHING. A tldraw shape and a React Flow node
 *     are DOM inside a container the host already owns, so both inherit a
 *     skin with zero adapter edits — verified in demos/tldraw and
 *     demos/reactflow, neither of which changed a component call.
 *   - It stays OUT of the document. A skin is a view preference like
 *     light/dark, not a fact about the system being drawn. Modelling it as
 *     a field would persist it into every saved board.
 *   - `shadcn add` is untouched: skins are one optional stylesheet, not a
 *     per-component file that has to land as a sibling.
 *
 * The cost this buys, stated plainly: a skin does NOT appear in a
 * `FieldTrace`, so the inspector cannot say "the sketch skin supplied this
 * radius" the way it says "the wired preset supplied this colour". See the
 * report's "what this gives up" section.
 *
 * INVARIANT — a skin never moves anything. Every token below paints; none
 * of them is a length that layout.ts / blockLayout.ts / portPlacement.ts
 * reads. That is what makes a skin safe to switch under a live canvas:
 * port anchors, edge endpoints and hit-test boxes are byte-identical
 * across all three. `demos/capture-skins.mjs` measures the spatial half in
 * a real browser (every port-dot centre, both hosts); `test/skin.test.ts`
 * holds the half that can fail in CI — no skin varies the stroke width, no
 * skin introduces a transform. It is also why
 * there is deliberately no `rotate` token, tempting as one is for sketch:
 * rotating the DOM would desynchronise it from the host's own geometry,
 * which the core does not own (see CLAUDE.md's one rule).
 */

/**
 * WHY the array is the source and the type is derived: the same rule
 * `TEXT_BOX_FONTS` and `BLOCK_ORIENTATIONS` already follow here — a
 * hand-written union lets the vocabulary and the thing that renders it
 * drift, and every total `Record<Skin, …>` below becomes a compile error
 * until a new skin says what it paints.
 */
export const BBOX_SKINS = ["default", "plain", "sketch"] as const;
export type BboxSkin = (typeof BBOX_SKINS)[number];

export const BBOX_SKIN_LABELS: Record<BboxSkin, string> = {
  default: "Default",
  plain: "Plain",
  sketch: "Sketch",
};

export const BBOX_SKIN_BLURBS: Record<BboxSkin, string> = {
  default: "Today's wireframe: 2px foreground outline, 8px corners. Unchanged, and what you get when no skin is set.",
  plain: "Square corners, one hairline, no shadow. The austere reading — Base UI's docs, a schematic.",
  sketch: "Hand-drawn: an informal font and corners that are not quite the same on any two sides.",
};

/**
 * The attribute a host stamps. Any ancestor will do — `<html>` for a whole
 * app, a single `<Block>` for one card — because every token below
 * inherits.
 *
 * WHY an attribute and not a class: it is single-valued. A class set
 * (`skin-sketch skin-plain`) can hold two skins at once and the cascade
 * picks by source order, which is a bug you cannot see in the DOM. An
 * attribute makes "exactly one skin is active here" structural.
 */
export const BBOX_SKIN_ATTR = "data-bbox-skin";

/**
 * The closed token set a skin may define — real exported data, not a
 * comment, so `test/skin.test.ts` can assert that `skin.css` defines exactly
 * these for exactly the skins in `BBOX_SKINS` and no others, and that each
 * component's own `var()` fallback still matches what is advertised here. A
 * token that exists in the CSS but not here (or vice versa) is the
 * failure this list is here to catch: it renders as "the default" and
 * looks like a design decision rather than a typo.
 *
 * Each entry carries the fallback the COMPONENT hard-codes at its call
 * site, which is today's look. That is what makes `skin.css` optional: a
 * consumer who never imports it sees the pixels they have now.
 */
export interface SkinToken {
  /** Custom property name, without the leading `--`. */
  name: string;
  /** What the component falls back to when no skin stylesheet is loaded. */
  fallback: string;
  /** Which CSS property it ends up in, for the docs table. */
  paints: string;
}

export const BBOX_SKIN_TOKENS: readonly SkinToken[] = [
  { name: "bbox-skin-radius", fallback: "8px", paints: "border-radius (Block, Region)" },
  { name: "bbox-skin-radius-pill", fallback: "9999px", paints: "border-radius (Pill, BlockChip)" },
  { name: "bbox-skin-stroke-width", fallback: "2px", paints: "border-width" },
  { name: "bbox-skin-stroke", fallback: "var(--color-foreground)", paints: "border-color" },
  { name: "bbox-skin-surface", fallback: "var(--color-card)", paints: "background" },
  { name: "bbox-skin-shadow", fallback: "none", paints: "box-shadow" },
  { name: "bbox-skin-font", fallback: "inherit", paints: "font-family (inherited by every text slot)" },
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
