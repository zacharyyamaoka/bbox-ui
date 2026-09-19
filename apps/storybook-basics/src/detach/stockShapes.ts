/**
 * src/detach/stockShapes.ts — measure the LIVE DOM and build the stock
 * tldraw shapes that reproduce it.
 *
 * WHY measurement, not a ported layout function (the architectural call this
 * file makes, reported to Zach rather than assumed silently): the donor
 * adapter's primitives (`packages/adapter-tldraw/src/detach/blockPrimitives.ts`
 * etc.) are built from a PURE layout function (`layoutSimpleBlock`) that
 * takes props and returns boxes with no DOM involved — `@bbox-ui/core` is a
 * closed-form layout engine. This app's own Block/Port layout is NOT
 * closed-form the same way: `../components/blockPort.layout.ts`'s own header
 * says so explicitly — "a Block hugs its content, so any closed form over
 * props lies the moment a header wraps... the measuring is the component's,
 * app-level and legal here." Reimplementing that whole measured layout
 * engine a second time, in a different pure form, inside the detach kit
 * would be exactly the kind of duplicate-truth this repo's CLAUDE.md warns
 * against, and would drift the moment either copy changes. So this kit reads
 * the ACTUAL rendered boxes off the DOM at the moment of detach — which is
 * also the most literal way to satisfy Zach's own acceptance bar ("kinda
 * pixel perfect... build the measurement harness first").
 *
 * PORTED FROM THE DONOR (packages/adapter-tldraw/src/detach/stockPartials.ts,
 * read in full 2026-09-18) because these are pure text/geometry utilities
 * with no dependency on the donor's layout engine, and reimplementing them
 * would just be a second, driftable copy of the same arithmetic:
 *   - `TLDRAW_TEXT_LINE`, `STOCK_TEXT_BASES`, `stockTextStyle` — stockPartials.ts:34,72-87
 *   - `renderedLineMeasureFor` — stockPartials.ts:112-123
 *   - the text-box centering formula in `textAt` — stockPartials.ts:311-324
 *   - `geoAt` — stockPartials.ts:348-368
 * NOT ported: `measureText`/`truncateToWidth`/`splitGraphemes` (DOM-font
 * measurement + grapheme-safe ellipsis) — this kit never needs to GUESS a
 * text box's width, because it measures the ACTUAL rendered label's ink box
 * off the DOM (`textBoxFromElement` below) and only asks tldraw's own
 * measurer for a safety floor (see that function's own doc). None of the
 * current demo's labels (single short words) are long enough to need
 * ellipsis; a truncating label is documented, explicit owed wiring, not a
 * silent regression.
 */
import { createShapeId, getFontFamily, toRichText } from "tldraw";
import type { Editor, TLDefaultColorStyle, TLDefaultSizeStyle, TLShapePartial } from "tldraw";

/** A box in the DETACHING shape's own local coordinates (parent-relative,
 *  MODEL px — camera zoom already divided out, see `boxRelativeTo`). */
export interface LocalBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `el`'s border box, in `origin`'s local coordinate frame — the one DOM
 * read this whole kit is built on. `origin` and `el` must share the same
 * camera transform (true for every element inside one `bbox-node`'s
 * wrapper, since tldraw scales the whole HTML layer uniformly).
 *
 * FIXED 2026-09-18 (CONFIRMED BUG, found by an independent Fable audit and
 * verified directly): `getBoundingClientRect` returns SCREEN px, which
 * already bake in the camera zoom, but this function used to take
 * `scale = 1` and every one of its four call sites (`definitions/block.ts`,
 * `definitions/port.ts`) omitted the argument — nothing anywhere in this
 * kit ever read `editor.getZoomLevel()`. Measured: at
 * `editor.setCamera({x:0,y:0,z:2})`, a 220×140 card detached to a 440×280
 * model box, exactly 2×. Reading the zoom HERE, from the same `editor`
 * every caller already has in scope, is the actual fix — it makes a future
 * fifth call site correct by construction instead of by a call site
 * remembering to pass a `scale` number by hand, which is exactly the
 * mistake that produced this bug.
 */
export function boxRelativeTo(origin: Element, el: Element, editor: Editor): LocalBox {
  const scale = editor.getZoomLevel();
  const originRect = origin.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left - originRect.left) / scale,
    y: (rect.top - originRect.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

/** The exact painted ink box of `el`'s OWN text content (excludes padding —
 *  `getBoundingClientRect` on an element includes it), via a `Range` over
 *  its child nodes. This is what a label's tldraw text shape should center
 *  on, not the padded container around it. Same zoom division as
 *  `boxRelativeTo` above, for the same reason — see that function's doc. */
export function textBoxRelativeTo(origin: Element, el: Element, editor: Editor): LocalBox {
  const scale = editor.getZoomLevel();
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  const originRect = origin.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return boxRelativeTo(origin, el, editor);
  return {
    x: (rect.left - originRect.left) / scale,
    y: (rect.top - originRect.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
  };
}

/** Ported from stockPartials.ts:34. */
export const TLDRAW_TEXT_LINE = 1.35;

/** Ported from stockPartials.ts:72-87 — the four stock text size rungs this
 *  pinned tldraw build uses, so a measured font-px snaps to the nearest
 *  stock rung and any remainder rides `scale`. */
const STOCK_TEXT_BASES: ReadonlyArray<{ size: TLDefaultSizeStyle; px: number }> = [
  { size: "s", px: 18 },
  { size: "m", px: 24 },
  { size: "l", px: 36 },
  { size: "xl", px: 44 },
];

export function stockTextStyle(px: number): { size: TLDefaultSizeStyle; scale: number } {
  const base = STOCK_TEXT_BASES.find((candidate) => px <= candidate.px) ?? STOCK_TEXT_BASES[STOCK_TEXT_BASES.length - 1];
  return { size: base.size, scale: px / base.px };
}

/** Ported from stockPartials.ts:103-123 — tldraw renders `font: "sans"` in
 *  its OWN bundled font (IBM Plex Sans), not the live DOM's system sans
 *  stack, so a text box sized from the DOM alone could still under-measure
 *  what tldraw will paint. This is the renderer-truth measurer: the exact
 *  width tldraw's own `break-word` decision will see. */
export function renderedLineMeasureFor(editor: Editor): (line: string, fontPx: number) => number {
  return (line, fontPx) =>
    editor.textMeasure.measureText(line, {
      fontStyle: "normal",
      fontWeight: "normal",
      fontFamily: getFontFamily(editor.getCurrentTheme(), "sans"),
      fontSize: fontPx,
      lineHeight: TLDRAW_TEXT_LINE,
      maxWidth: null,
      padding: "0px",
    }).w;
}

export interface TextAtDomOptions {
  text: string;
  /** Unscaled font px — one of the stock rungs' nearest match. */
  px: number;
  /** The live DOM's own ink box for this string, in the shape's local frame
   *  (see `textBoxRelativeTo`). */
  box: LocalBox;
  color: TLDefaultColorStyle;
  /** tldraw's own measurer (`renderedLineMeasureFor(editor)`) — used as a
   *  SAFETY FLOOR under the DOM-measured width so tldraw's different font
   *  metrics can never wrap a string the live DOM painted on one line. */
  measureRendered: (line: string, fontPx: number) => number;
}

/**
 * A stock text primitive, centered on the DOM's own measured ink box on
 * BOTH axes. Centering (rather than anchoring one edge, as the donor's
 * `align` parameter does) is a deliberate simplification for this kit: the
 * donor could anchor confidently because its box came from the SAME layout
 * math on both sides of the detach; here the DOM box and tldraw's painted
 * box are measured by two different text engines (system sans vs. tldraw's
 * bundled Plex Sans) and can differ by a few px, so centering keeps that
 * residual error split evenly instead of concentrating it on one edge.
 *
 * WRAPPING, fixed 2026-09-18 (CONFIRMED BUG): `options.box.h` — the live
 * DOM's own measured ink box, from `textBoxRelativeTo`'s `Range` — grows
 * past one line's height exactly when the live label wrapped. The line
 * count derived from it (`measuredLines` below) decides whether this
 * primitive should be allowed to wrap too. Before this fix, `width` was
 * ALWAYS floored at `tldrawWidth` (tldraw's own SINGLE-LINE measure of the
 * whole string) — a floor that is the right safety net for a one-line
 * label (tldraw's font metrics must never wrap a string the live DOM
 * painted on one line) but is exactly backwards for a label that already
 * wraps: it forces the entire string onto one line no matter how it was
 * measured. Measured repro: a 3-line live header (ink 162.6×59 on a 220px
 * block) detached to one 393px-wide line, overhanging the card by ~115px
 * on the left alone. A wrapping label instead gets the DOM's own measured
 * width (so tldraw re-wraps at roughly the same width the live DOM did)
 * and a height scaled to the measured line count — the single-line branch
 * below is unchanged.
 */
export function textAtDom(options: TextAtDomOptions): TLShapePartial {
  const stock = stockTextStyle(options.px);
  const singleLineHeight = options.px * TLDRAW_TEXT_LINE;
  const measuredLines = Math.max(1, Math.round(options.box.h / singleLineHeight));
  let width: number;
  let height: number;
  if (measuredLines > 1) {
    // Wraps in the live DOM — hand tldraw the DOM's own measured width so
    // it wraps too, instead of the single-line safety floor below (which
    // would force the whole string onto one line). +4px slack matches the
    // single-line branch (DOM sub-pixel rounding + tldraw's own internal
    // padding on an `autoSize:false` label).
    width = options.box.w + 4;
    height = measuredLines * singleLineHeight;
  } else {
    const tldrawWidth = options.measureRendered(options.text, options.px);
    // +4px slack: DOM sub-pixel rounding plus tldraw's own internal padding
    // on an `autoSize:false` label (see stockPartials.ts's own "+1" note).
    width = Math.max(options.box.w, tldrawWidth) + 4;
    height = singleLineHeight;
  }
  return {
    id: createShapeId(),
    type: "text",
    x: options.box.x + (options.box.w - width) / 2,
    y: options.box.y + (options.box.h - height) / 2,
    props: {
      richText: toRichText(options.text),
      color: options.color,
      size: stock.size,
      font: "sans",
      scale: stock.scale,
      autoSize: false,
      w: width / stock.scale,
      textAlign: "middle",
    },
  };
}

export interface GeoAtOptions {
  geo: "rectangle" | "ellipse" | "oval";
  color: TLDefaultColorStyle;
  fill: "none" | "semi" | "solid" | "fill";
}

/** A stock geo primitive at a measured box. Ported from stockPartials.ts:348-368. */
export function geoAtBox(box: LocalBox, options: GeoAtOptions): TLShapePartial {
  return {
    id: createShapeId(),
    type: "geo",
    x: box.x,
    y: box.y,
    props: {
      geo: options.geo,
      w: Math.max(1, box.w),
      h: Math.max(1, box.h),
      color: options.color,
      fill: options.fill,
      dash: "solid",
      size: "s",
    },
  };
}

/** Grow a box outward by `px` on every side — used to add a CSS box-shadow
 *  ring's overhang back onto a dot's layout box before emitting its stock
 *  ellipse (see `definitions/port.ts`). */
export function inflateBox(box: LocalBox, px: number): LocalBox {
  return { x: box.x - px, y: box.y - px, w: box.w + px * 2, h: box.h + px * 2 };
}
