// src/skin/regionVariants.ts — TEN DRAWINGS of the one Region component,
// as a typed spec and one attribute. The contract the dispatcher spelled
// out in docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md ("Contracts"),
// owned by lane `regions`:
//
//   • `REGION_VARIANTS: Record<RegionVariantId, RegionVariant>`, ids
//     `v1`..`v10`, `v1` the default so ignoring is free. `v1`-`v5` are the
//     original five; `v6`-`v8` are the three Zach picked out of the
//     2026-09-19 babble gallery; `v9`-`v10` are the two asks of 2026-09-20
//     00:45. Every one is ADDED, never substituted, because he is still
//     comparing them against each other (see each block).
//   • The variant in force is read from `data-bbox-region-variant` — on
//     `document.documentElement` for an app (`dataset.bboxRegionVariant`),
//     or on ANY nearer ancestor for a gallery that shows several at once.
//     No React context: the paint is CSS custom properties keyed on that
//     attribute (`regionVariants.css`, the same mechanism `skin.css` uses),
//     and the two numbers CSS cannot drive — the arm header's height,
//     which `regionLayout` needs, and the fold chevron's reveal, which is a
//     prop — come from THIS file, keyed on the same attribute
//     (`readRegionVariant`). So an app switch is three lines
//     (`setRegionVariant`), and a Storybook global is a wrapper stamped
//     with `regionVariantAttrs`.
//
// WHAT EVERY VARIANT KEEPS (Zach, 2026-09-19, measured by
// `RegionVariants.stories.tsx` per variant): the corner block flush with
// the frame's top-left; its port dots ON the frame edge, never clipped
// ("I want the port to be right on the edge. and it shouldn't be cut off
// by the frame"); arms stacked under the corner and folded by the chevron;
// the For Loop reading he liked (`Pasted image 20260919115424.png`); and
// the opaque card, which is the host's own `Block` and deliberately NOT a
// variant axis. What varies: the frame's stroke/fill/radius/open sides,
// how the corner block joins the frame, how an arm header is marked, the
// nested-region contrast, and the arm title's type.
//
// WHY the numbers live here and the paint lives in CSS, rather than
// everything in one place: `regionLayout` is a PURE twin that hosts read
// without rendering (a tldraw shape's geometry, an SVG export), so the
// header height has to be a plain number a host can pass in — a computed
// style is not available to a function that never touched the DOM. The
// paint, by contrast, wants to follow light/dark and skin without a
// re-render, which is what custom properties are for. The story's item 3
// (measured header height === `arms.headerPx`) is what keeps the two from
// drifting.
//
// NO DASHED FRAME: `frame.dash` exists in the contract's shape and is left
// undefined on all eight on purpose — the dashed `ss-region` placeholder in
// `Pasted image 20260919114919.png` is part of what Zach called "very
// unprofessional", so a dashed proposal would be proposing the complaint.

export const REGION_VARIANT_IDS = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10"] as const;
export type RegionVariantId = (typeof REGION_VARIANT_IDS)[number];

export const DEFAULT_REGION_VARIANT: RegionVariantId = "v1";

/** The attribute a host stamps — on `<html>` for an app, or on any
 *  ancestor for one board / one gallery row. */
export const REGION_VARIANT_ATTR = "data-bbox-region-variant";
/** The same attribute as `HTMLElement.dataset` spells it. */
export const REGION_VARIANT_DATASET_KEY = "bboxRegionVariant";

export interface RegionVariant {
  id: RegionVariantId;
  title: string;
  /** One line for a picker or a gallery caption. */
  blurb: string;
  frame: {
    /** CSS colour (a theme token, never a literal — skin and dark follow). */
    stroke: string;
    fill: string;
    /** The shared top-left radius — the corner card's too. LOAD-BEARING, not
     *  documentation: `"0px"` is how a drawing declares itself SQUARE, and the
     *  two junction tests read it as their oracle (`RegionVariants.stories.tsx`'s
     *  `CornerMeetsFrameSquare`, `variants.smoke.test.tsx`'s (e)). A value here
     *  that disagrees with `regionVariants.css` is a failure, which is what
     *  keeps the spec and the paint from drifting. */
    radius: string;
    /** Never set on the five shipped (see this file's header). */
    dash?: "dashed";
    /** The bracket: no right and no bottom line. */
    open?: "right-bottom";
  };
  corner: {
    /** `flush`: the card's border sits on the frame's line (the Labeled
     *  Group Node look, `blockRegion.tsx`'s header). `ruled`: flush, AND the
     *  card's bottom edge continues as a full-width rule under it — the
     *  line Zach pointed at in `Pasted image 20260919115353.png` and again
     *  in `…20260920004250.png`'s DESIRED half. `band`: ruled, AND the card
     *  is meant to span the region's whole width with its title centred in
     *  it (`…20260920004529.png`) — the header IS the band.
     *
     *  WHY `band` still says `ruled`'s rule rather than replacing the card:
     *  Zach, 2026-09-20 — "its just the block is stretch accross the entire
     *  width of the region". The corner card is not removed and no port
     *  moves; its dots are already on its own left edge, which at full width
     *  IS the region's left edge. What a DRAWING can reach is the rule, the
     *  square corners and the centred title; the card's WIDTH is the host's
     *  in both hosts (a `width` prop in `hosts/nodeViews.tsx`, a persisted
     *  `props.w` in the app's `shapes/region/cornerBlock.ts`) and is never
     *  CSS — see `block.tsx`'s `BlockShape`. */
    integration: "flush" | "ruled" | "band";
    /** The card's ONE free corner, bottom-right. Absent = the frame's shared
     *  radius, which is what the drawing Zach approved does. `"square"` is
     *  `v2`'s own trick — a full-width rule leaves a square corner cleanly
     *  instead of departing from a curve. NOT implied by `ruled`: `v9` is
     *  ruled and keeps the curve, because that is what he drew. */
    freeCorner?: "square";
  };
  arms: {
    /** How an arm's header row is marked. The contract named
     *  `rule | band | none`; `indent` (a code-style guide) and `card` (an
     *  inset card) are this lane's two additions, each a whole drawing.
     *  `outline` and `edge` came out of the 2026-09-19 babble gallery
     *  (`reports/media/branch-arm-drawings-2026-09-19.html`), where Zach
     *  picked three of five: `outline` is `card` with the fill taken out,
     *  `edge` is that outline run to the frame's own side lines, and his
     *  third pick needs no new kind at all — it is `none` (see `v8`). */
    header: "none" | "rule" | "band" | "indent" | "card" | "outline" | "edge";
    /** A hairline between consecutive rows (never above the first). */
    divider: boolean;
    /** The header row's height, px — fed to `regionLayout`. */
    headerPx: number;
    /** `FoldingChevron`'s own `reveal` prop. `hover` still shows a FOLDED
     *  arm's chevron always (that rule is the component's, not ours). */
    chevron: "always" | "hover";
  };
  nested: {
    /** `deepen`: a region inside a region fills one tone deeper. */
    contrast: "none" | "deepen";
  };
  opaque: {
    /** Always `stock`: the P5 card is the host's `Block`, unchanged. */
    card: "stock";
  };
}

export const REGION_VARIANTS: Record<RegionVariantId, RegionVariant> = {
  v1: {
    id: "v1",
    title: "Labeled group",
    blurb: "Today's look, tightened: a hairline frame, the card on its corner, rows divided by hairlines.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "none", divider: true, headerPx: 32, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
  v2: {
    id: "v2",
    title: "Ruled",
    blurb: "The corner card's bottom edge runs the full width as a header rule; every arm header sits between two rules.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--radius-md)" },
    corner: { integration: "ruled", freeCorner: "square" },
    arms: { header: "rule", divider: true, headerPx: 32, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
  v3: {
    id: "v3",
    title: "Zone",
    blurb: "No frame line — a faint tinted zone; each arm header is a tinted band with the condition in it, no rules.",
    frame: { stroke: "transparent", fill: "color-mix(in oklch, var(--foreground) 3%, transparent)", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "band", divider: false, headerPx: 28, chevron: "always" },
    nested: { contrast: "deepen" },
    opaque: { card: "stock" },
  },
  v4: {
    id: "v4",
    title: "Bracket",
    blurb: "A left bracket and a top rule only, open right and bottom; arms read like code — an indent guide hangs under the chevron, monospace headers.",
    frame: { stroke: "var(--muted-foreground)", fill: "transparent", radius: "var(--radius-md)", open: "right-bottom" },
    corner: { integration: "flush" },
    arms: { header: "indent", divider: false, headerPx: 26, chevron: "hover" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
  v5: {
    id: "v5",
    title: "Card",
    blurb: "The frame is filled a tone off the canvas; each arm is an inset card; a nested region goes one tone deeper.",
    frame: { stroke: "var(--border)", fill: "var(--muted)", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "card", divider: false, headerPx: 30, chevron: "always" },
    nested: { contrast: "deepen" },
    opaque: { card: "stock" },
  },

  // ── THE THREE DRAWINGS ZACH PICKED, 2026-09-19 ────────────────────────
  // He named them "v1 v2 v3", meaning the BABBLE GALLERY's numbering
  // (`reports/media/branch-arm-drawings-2026-09-19.html`), not this table's.
  // They land here as v6/v7/v8 so v1-v5 stay exactly as he has been
  // comparing them, and each carries the gallery's own NAME as its title so
  // the two numberings can never be confused again:
  //
  //     gallery V1 "Transparent Card" → v6      gallery V3 "Top Rule" → v8
  //     gallery V2 "Edge Card"        → v7
  //
  // THE PRINCIPLE ALL THREE SERVE (Zach, 2026-09-19): "control flow is not
  // a card!" Every value below is subtractive — each drawing spends LESS
  // ink on the arm than v5 does, and none of them gives an arm a background.
  //
  // WHY all three share v5's 30px header, its frame and its type rather
  // than each carrying the gallery mock's own 26px: the point of shipping
  // three at once is that he can flip the pill and see ONLY the arm
  // drawing change. A different header height per drawing moves every row
  // and every frame's hug on each flip, which reads as three different
  // layouts rather than three different drawings of one layout.
  //
  // WHY the title tokens stay `initial` on all three: none of the three
  // theses is about type, and an unset inherited token means "the Bar's own
  // text" (this file's note on `initial`). A drawing changes what it claims
  // to change.
  v6: {
    id: "v6",
    title: "Transparent card",
    blurb: "Gallery V1. v5's inset card with the fill taken out — a Block-shaped outline you can see the board straight through.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "outline", divider: false, headerPx: 30, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
  v7: {
    id: "v7",
    title: "Edge card",
    blurb: "Gallery V2. The same outline run edge to edge: top and bottom strokes only, so no side line ever doubles against the frame's.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "edge", divider: false, headerPx: 30, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
  v8: {
    id: "v8",
    title: "Top rule",
    blurb: "Gallery V3. One line above each arm after the first and nothing else — no body outline, no header rule. The least ink that still says \u201ctwo arms\u201d.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--radius-lg)" },
    corner: { integration: "flush" },
    arms: { header: "none", divider: true, headerPx: 30, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },

  // ── 2026-09-20, the two asks of the 00:45 round ───────────────────────
  // Both land as NEW ids. v1-v8 are untouched, value for value, because he
  // is still comparing them and a drawing that changes under him is not a
  // comparison (the same reason v6-v8 were added rather than substituted).
  //
  // v9 — "Top rule is my favorite one but add the top line on the top arm."
  // v8 draws a hairline BETWEEN rows and nothing above the first, so the
  // first arm hangs in open space beside the corner card
  // (`…20260920004250.png`, CURRENT BAD). DESIRED puts a full-width rule
  // directly under the card's row, at every nesting level.
  //
  // WHY this needed no change to `blockRegion.tsx` at all: that rule already
  // exists as `region-header-rule`, turned on by `corner.integration:
  // "ruled"`, which is `v2`'s. The first-arm divider (`index > 0`, the
  // donor's `dividerY: index === 0 ? null : rowTop`) stays exactly as it
  // was — the line above arm 0 is the CORNER's rule, not the arm's, which
  // is why it lands on the card's own bottom edge (`corner.h - 2px`) rather
  // than 2px lower at the row's top, and why it needs no per-level
  // special-casing: every region paints its own.
  //
  // WHY v9 and not a correction to v8: this is a NEW COMBINATION — v8's arm
  // treatment with v2's corner integration — and neither of its parents
  // should move. If he wants v8 itself to be this, it is one token in
  // `regionVariants.css` (`--bbox-region-header-rule-display: block`).
  v9: {
    id: "v9",
    title: "Top rule, ruled header",
    blurb:
      "v8 with the corner card's bottom edge continued as a full-width rule, so the FIRST arm has a line above it too — at every nesting level.",
    frame: { stroke: "var(--border)", fill: "transparent", radius: "var(--bbox-skin-radius, var(--radius-lg))" },
    // No `freeCorner`: the card keeps the frame's curve at its one free
    // corner, which is what DESIRED draws (`…004250.png`, right half — the
    // rule departs from a rounded bottom-right). `v2` squares it; he did not.
    corner: { integration: "ruled" },
    arms: { header: "none", divider: true, headerPx: 30, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },

  // v10 — "please also create a variant that looks like this"
  // (`…20260920004529.png`, then clarified 2026-09-20: "its just the block
  // is stretch accross the entire width of the region"). A plain rectangle:
  // square everywhere, the header card spanning the full width as a filled
  // band with its title centred, its ports still straddling its own left
  // edge — which at full width is the region's left edge — a full-width
  // rule under the band, and every arm with a rule above it.
  //
  // WHAT IS A DRAWING AND WHAT IS THE HOST'S, measured rather than assumed:
  // the rule, the square corners and the centred title are all tokens here.
  // The card's WIDTH is not, in either host — see `corner.integration`'s
  // note. So v10 draws the band correctly over a card the host made wide,
  // and over a 160px card it is v9 with square corners.
  v10: {
    id: "v10",
    title: "Header band",
    blurb:
      "The sketch: a plain square rectangle whose top band IS the header card, run the full width with its title centred, ruled off from the arms below.",
    // "0px" is the declaration that this drawing is SQUARE — the junction
    // tests read it (see `frame.radius`).
    frame: { stroke: "var(--border)", fill: "transparent", radius: "0px" },
    corner: { integration: "band", freeCorner: "square" },
    arms: { header: "none", divider: true, headerPx: 30, chevron: "always" },
    nested: { contrast: "none" },
    opaque: { card: "stock" },
  },
};

/**
 * Does this drawing continue the corner card's bottom edge as a full-width
 * rule (`blockRegion.tsx`'s `region-header-rule`)? One name for the rule, because
 * three acceptance suites ask it and `=== "ruled"` was already wrong the
 * moment `band` existed — `band` is `ruled` plus a stretched, centred card.
 */
export function drawsHeaderRule(spec: RegionVariant): boolean {
  return spec.corner.integration !== "flush";
}

export function isRegionVariantId(value: unknown): value is RegionVariantId {
  return typeof value === "string" && (REGION_VARIANT_IDS as readonly string[]).includes(value);
}

/**
 * `{ "data-bbox-region-variant": id }`, ready to spread onto any element —
 * a gallery row, a board, `<html>`. One import, one typo-proof spelling
 * (`bboxSkinAttrs`'s own reason).
 */
export function regionVariantAttrs(id: RegionVariantId): Record<string, string> {
  return { [REGION_VARIANT_ATTR]: id };
}

/**
 * The variant in force for `from`: the NEAREST ancestor carrying the
 * attribute wins (a gallery row beats the page), then `<html>`'s
 * `dataset.bboxRegionVariant`, then `v1`. An unknown value reads as `v1`
 * rather than throwing — a stale attribute must not blank a board.
 * SSR-safe: with no `document` there is only the default.
 */
export function readRegionVariant(from?: Element | null): RegionVariantId {
  const nearest = from?.closest(`[${REGION_VARIANT_ATTR}]`)?.getAttribute(REGION_VARIANT_ATTR);
  if (isRegionVariantId(nearest)) return nearest;
  if (typeof document === "undefined") return DEFAULT_REGION_VARIANT;
  const onHtml = document.documentElement.dataset[REGION_VARIANT_DATASET_KEY];
  return isRegionVariantId(onHtml) ? onHtml : DEFAULT_REGION_VARIANT;
}

/**
 * The app's switch: write (or clear) the attribute on `<html>`. Every
 * mounted Region observes this attribute on `<html>` AND on every nearer
 * ancestor, and re-resolves before the next paint without the caller
 * re-rendering anything (`blockRegion.tsx`'s `useRegionVariant`).
 */
export function setRegionVariant(id: RegionVariantId | null): void {
  if (typeof document === "undefined") return;
  if (id === null || id === DEFAULT_REGION_VARIANT) delete document.documentElement.dataset[REGION_VARIANT_DATASET_KEY];
  else document.documentElement.dataset[REGION_VARIANT_DATASET_KEY] = id;
}

/**
 * The custom properties `regionVariants.css` may set and `blockRegion.tsx`
 * reads. Documentation-grade data (the same role `BBOX_SKIN_TOKENS`
 * plays): the component carries `v1`'s value as each token's `var()`
 * fallback, so a consumer who never imports the CSS renders today's
 * pixels. Inherited-text tokens (`*-title-*`) deliberately have NO
 * fallback — an unset one is invalid at computed-value time, which for an
 * inherited property means `inherit`, i.e. the Bar's own text. That is
 * how `v1` says "leave the title alone" without naming a font.
 */
export interface RegionVariantToken {
  name: string;
  paints: string;
}

export const REGION_VARIANT_TOKENS: readonly RegionVariantToken[] = [
  { name: "bbox-region-frame-stroke", paints: "border-color (frame)" },
  { name: "bbox-region-frame-stroke-widths", paints: "border-width (frame, four sides — the bracket opens two)" },
  { name: "bbox-region-frame-dash", paints: "border-style (frame)" },
  { name: "bbox-region-frame-fill", paints: "background (frame; a nested frame reads the parent's nested-fill instead)" },
  { name: "bbox-region-nested-fill", paints: "background (a frame inside another frame)" },
  { name: "bbox-region-frame-radius", paints: "border-top-left-radius (frame AND corner card — the shared corner)" },
  { name: "bbox-region-frame-radii", paints: "border-radius (frame, four corners)" },
  { name: "bbox-region-corner-radius", paints: "border-bottom-right-radius (corner card — its one free corner)" },
  { name: "bbox-region-corner-title-align", paints: "text-align (corner card — inherited into its header slot; `v10` centres the band's title)" },
  { name: "bbox-region-header-rule-display", paints: "display (the full-width rule under the corner card)" },
  { name: "bbox-region-header-rule-stroke", paints: "background (that rule)" },
  { name: "bbox-region-arm-divider-width", paints: "border-top-width (arm header, rows after the first)" },
  { name: "bbox-region-arm-divider-stroke", paints: "border-top-color (arm header, rows after the first)" },
  { name: "bbox-region-arm-header-rule-width", paints: "border-bottom-width (arm header)" },
  { name: "bbox-region-arm-header-rule-stroke", paints: "border-bottom-color (arm header)" },
  { name: "bbox-region-arm-header-fill", paints: "background (arm header — the band)" },
  { name: "bbox-region-arm-header-inset", paints: "padding-left (arm header, ahead of the Bar's own)" },
  { name: "bbox-region-arm-title-size", paints: "font-size (arm title; unset = inherit)" },
  { name: "bbox-region-arm-title-weight", paints: "font-weight (arm title; unset = inherit)" },
  { name: "bbox-region-arm-title-font", paints: "font-family (arm title; unset = inherit)" },
  { name: "bbox-region-arm-title-color", paints: "color (arm title; unset = inherit)" },
  { name: "bbox-region-arm-decor-display", paints: "display (the arm's decor box: an inset card or an indent guide)" },
  { name: "bbox-region-arm-decor-inset", paints: "inset (decor box)" },
  { name: "bbox-region-arm-decor-width", paints: "width (decor box; 0 for a guide)" },
  { name: "bbox-region-arm-decor-stroke-widths", paints: "border-width (decor box)" },
  { name: "bbox-region-arm-decor-stroke", paints: "border-color (decor box)" },
  { name: "bbox-region-arm-decor-radius", paints: "border-radius (decor box)" },
  { name: "bbox-region-arm-decor-fill", paints: "background (decor box)" },
] as const;
