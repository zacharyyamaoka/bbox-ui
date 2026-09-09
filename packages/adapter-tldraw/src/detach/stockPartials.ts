/**
 * Small builders for the stock tldraw shapes a detach produces, plus the
 * text measurer they share.
 *
 * The resulting records deliberately use only stock props — a detached
 * shape must remain meaningful when its metadata is ignored and no bbox-ui
 * shape utility is registered — and every visual choice here is the closest
 * stock approximation of a core component's CSS:
 *
 *   border-foreground / text-foreground          → color "black"
 *   border-muted-foreground / text-muted-…       → color "grey"
 *   bg-primary (the wired accent, orange)        → color "orange", fill "fill"
 *   bg-muted (the default-state wash)            → fill "solid"
 *   border-2                                     → size "s" (2px stroke)
 */
import { createShapeId, getFontFamily, toRichText } from "tldraw";
import type {
  Editor,
  TLDefaultColorStyle,
  TLDefaultSizeStyle,
  TLShapePartial,
} from "tldraw";

import type { LayoutBox } from "@bbox-ui/core";

/** Tailwind's default sans stack — what the live core components render in. */
const SANS_FONT =
  'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

/**
 * tldraw's own text line height (TEXT_PROPS.lineHeight). Used to center a
 * text primitive inside the line box the live DOM gave the same string.
 */
export const TLDRAW_TEXT_LINE = 1.35;

let measureContext: CanvasRenderingContext2D | null | undefined;
const measuredWidths = new Map<string, number>();

/**
 * Width of `text` at `px`/`weight` in the app font. DOM-measured when a
 * document exists; a deterministic approximation otherwise (unit tests),
 * matching SystemSketch's fallback ratio.
 */
export function measureText(text: string, px: number, weight = 400): number {
  const key = `${weight}:${px}:${text}`;
  const cached = measuredWidths.get(key);
  if (cached !== undefined) return cached;
  if (measureContext === undefined) {
    measureContext =
      typeof document === "undefined"
        ? null
        : (document.createElement("canvas").getContext("2d") ?? null);
  }
  if (measureContext) {
    measureContext.font = `${weight} ${px}px ${SANS_FONT}`;
    const width = measureContext.measureText(text).width;
    if (width > 0) {
      measuredWidths.set(key, width);
      return width;
    }
  }
  return text.length * px * 0.55;
}

/**
 * The four stock text sizes are 18, 24, 36 and 44 canvas px in this pinned
 * tldraw build — conveniently, exactly bbox-ui's `META_FONT_PX` and its
 * three `TEXT_SIZES` rungs, so those map at scale 1. `scale` is a stock,
 * serialised prop, so any other px (a glyph at 0.9 × title) keeps its
 * authored size rather than snapping to a preset.
 */
const STOCK_TEXT_BASES: ReadonlyArray<{ size: TLDefaultSizeStyle; px: number }> = [
  { size: "s", px: 18 },
  { size: "m", px: 24 },
  { size: "l", px: 36 },
  { size: "xl", px: 44 },
];

export function stockTextStyle(px: number): {
  size: TLDefaultSizeStyle;
  scale: number;
} {
  const base =
    STOCK_TEXT_BASES.find((candidate) => px <= candidate.px) ??
    STOCK_TEXT_BASES[STOCK_TEXT_BASES.length - 1];
  return { size: base.size, scale: px / base.px };
}

/**
 * Width of one line measured by the renderer that will PAINT it — for the
 * detach emission, tldraw's own text engine. `fontPx` is the shape's
 * unscaled font size (a stock rung: 18/24/36/44).
 *
 * WHY this type exists at all: `measureText` above measures in the live
 * DOM font (the system sans stack), but tldraw renders `font: "sans"` in
 * its OWN bundled font — IBM Plex Sans via 'tldraw_sans' — and the two
 * fonts' advance widths differ per glyph ("JJJ" at 18px: 14.74px system,
 * 28.35px Plex, measured in Chrome). The two must never be conflated: any
 * guarantee about what tldraw will or will not re-wrap has to be DERIVED
 * from tldraw's measurement, never estimated from the live font plus a
 * fudge factor.
 */
export type RenderedLineMeasure = (line: string, fontPx: number) => number;

/**
 * The renderer-truth measurer for a live tldraw editor: the same
 * `editor.textMeasure` + font resolution the text shape's own layout uses
 * (TextShapeUtil measures with `getFontFamily(theme, font)` at the
 * unscaled font size), so a width returned here is exactly the width
 * tldraw's `break-word` decision will see.
 */
export function renderedLineMeasureFor(editor: Editor): RenderedLineMeasure {
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

let graphemeSegmenter: Intl.Segmenter | null = null;

/** Availability is re-checked per call so tests can stub the segmenter away. */
function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return null;
  }
  if (!graphemeSegmenter) {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  }
  return graphemeSegmenter;
}

const ZWJ = "\u200d";

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

/** Code points that always extend the cluster before them. */
function extendsPreviousCluster(codePoint: number, point: string): boolean {
  return (
    /^\p{M}$/u.test(point) || // combining marks
    codePoint === 0x200d || // zero-width joiner
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || // variation selectors
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) || // VS supplement
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) // emoji skin tones
  );
}

/**
 * `text` split on grapheme-cluster boundaries via `Intl.Segmenter`, so a
 * ZWJ emoji family, a flag pair or a base-plus-combining-mark is one unit.
 *
 * The fallback (no Segmenter — tested with the global stubbed away)
 * clusters code points by the joins a truncation cut must never land
 * inside: combining marks, ZWJ sequences, variation selectors, skin-tone
 * modifiers and regional-indicator pairs. Not full UAX #29 (it skips e.g.
 * Hangul jamo composition), but `[...text]` — the previous fallback — cut
 * emoji families mid-join and stripped marks off their base, which was
 * exactly the defect the segmenter path had just removed.
 */
export function splitGraphemes(text: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  const clusters: string[] = [];
  let pendingRegionalIndicator = false;
  for (const point of text) {
    const codePoint = point.codePointAt(0)!;
    const previous = clusters[clusters.length - 1];
    const regional = isRegionalIndicator(codePoint);
    const joins =
      previous !== undefined &&
      (extendsPreviousCluster(codePoint, point) ||
        previous.endsWith(ZWJ) ||
        (regional && pendingRegionalIndicator));
    if (joins) {
      clusters[clusters.length - 1] = previous + point;
      pendingRegionalIndicator = false;
    } else {
      clusters.push(point);
      pendingRegionalIndicator = regional;
    }
  }
  return clusters;
}

/**
 * `text` shortened with a trailing ellipsis until it measures within
 * `maxW` — the stock-primitive equivalent of CSS `text-overflow: ellipsis`.
 * The cut lands on a GRAPHEME boundary, never inside one: splitting on code
 * points kept surrogate pairs whole but could still leave a dangling ZWJ
 * from an emoji family or strip a combining mark off its base letter.
 */
export function truncateToWidth(
  text: string,
  px: number,
  maxW: number,
  weight = 400,
): string {
  if (measureText(text, px, weight) <= maxW) return text;
  const ELLIPSIS = "…";
  const graphemes = splitGraphemes(text);
  // Binary search the longest prefix whose "prefix…" still fits.
  let low = 0;
  let high = graphemes.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (
      measureText(graphemes.slice(0, mid).join("") + ELLIPSIS, px, weight) <= maxW
    ) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return graphemes.slice(0, low).join("") + ELLIPSIS;
}

export interface TextAtOptions {
  text: string;
  px: number;
  /** The line box the live DOM gave this string, in the caller's frame. */
  box: LayoutBox;
  origin: { x: number; y: number };
  color: TLDefaultColorStyle;
  align: "start" | "middle" | "end";
  /**
   * How many lines the live DOM wrapped this string onto inside `box`
   * (default 1). The primitive re-wraps at the same width, so centering
   * its line grid inside the box needs the count — one line's worth of
   * compensation applied to a wrapped paragraph would pin it to the top.
   */
  lines?: number;
  /**
   * The exact painted lines, when the live DOM wrapped this string. When
   * given, they are emitted as hard line breaks and the shape is made wide
   * enough that tldraw can never re-wrap them.
   *
   * WHY: the live slot wraps with `overflow-wrap: normal` — an unbreakable
   * run (a URL, a snake_case identifier) overflows on ONE line — but
   * tldraw renders rich text with `overflow-wrap: break-word`, which
   * splits that same run mid-token into extra lines the live component
   * never painted. Handing tldraw the pre-wrapped lines and a box that
   * fits the widest one takes its wrapping model out of the picture, so
   * the two renderers cannot disagree.
   */
  hardLines?: string[];
  /** CSS font weight the string is measured at (default 400). */
  weight?: number;
  /**
   * Measures a line in the font the emitting renderer paints — see
   * `RenderedLineMeasure`. When given, the `hardLines` box width is
   * DERIVED from it, making the no-rewrap guarantee exact; without it the
   * box falls back to a live-font estimate (headless/no-editor callers).
   */
  measureRendered?: RenderedLineMeasure;
}

/** A stock text primitive centered in the live line box. */
export function textAt(options: TextAtOptions): TLShapePartial {
  const stock = stockTextStyle(options.px);
  const hardLines =
    options.hardLines != null && options.hardLines.length > 0
      ? options.hardLines
      : null;
  const lines = hardLines ? hardLines.length : (options.lines ?? 1);
  // TextShapeUtil floors a fixed width before measuring; reserve the same
  // +1 tldraw itself uses for auto-sized labels, plus DOM tolerance, so the
  // final glyph never wraps out of the box.
  let width = Math.max(1, Math.ceil(options.box.w) + 8);
  if (hardLines) {
    // The box must out-measure the widest painted line IN THE RENDERER'S
    // OWN METRICS, or tldraw's `break-word` splits a line the live
    // component never wrapped. Extra width is invisible — the text has no
    // fill and every line stays centered on the same axis.
    //
    // WHY two measurement paths: the live DOM font (the system sans stack
    // `measureText` uses) and tldraw's `font: "sans"` (its bundled IBM
    // Plex Sans) are DIFFERENT fonts with different advance widths —
    // "JJJ" at 18px is 14.74px in one and 28.35px in the other — and they
    // must never be conflated. With an editor in hand the width is derived
    // from tldraw's own measurement, at the shape's unscaled font size and
    // against the unscaled `w` (which is where TextShapeUtil applies
    // `maxWidth: floor(w)`), so the guarantee is exact. Without one
    // (headless tests, editor-less callers) the live-font estimate plus
    // 10% headroom remains as a documented approximation only.
    if (options.measureRendered) {
      const basePx = options.px / stock.scale;
      const widestRendered = Math.max(
        ...hardLines.map((line) => options.measureRendered!(line, basePx)),
      );
      // floor(w/scale) is what tldraw compares against; ceil + 8 keeps the
      // same DOM-tolerance slack as the non-hard-lines path.
      width = Math.max(width, (Math.ceil(widestRendered) + 8) * stock.scale);
    } else {
      const widest = Math.max(
        ...hardLines.map((line) =>
          measureText(line, options.px, options.weight ?? 400),
        ),
      );
      width = Math.max(width, Math.ceil(widest * 1.1) + 8);
    }
  }
  const x =
    options.align === "end"
      ? options.box.x + options.box.w - width
      : options.align === "middle"
        ? options.box.x + (options.box.w - width) / 2
        : options.box.x;
  return {
    id: createShapeId(),
    type: "text",
    x: options.origin.x + x,
    y:
      options.origin.y +
      options.box.y +
      (options.box.h - lines * options.px * TLDRAW_TEXT_LINE) / 2,
    props: {
      // `toRichText` turns each "\n" into its own paragraph — one painted
      // line per entry, margin-free, exactly `lines` of them.
      richText: toRichText(hardLines ? hardLines.join("\n") : options.text),
      color: options.color,
      size: stock.size,
      font: "sans",
      scale: stock.scale,
      autoSize: false,
      // Width lives in the text shape's unscaled coordinate system.
      w: width / stock.scale,
      textAlign: options.align,
    },
  };
}

export interface GeoAtOptions {
  geo: "rectangle" | "ellipse" | "oval";
  color: TLDefaultColorStyle;
  fill: "none" | "semi" | "solid" | "fill";
}

/** A stock geo primitive at a box. */
export function geoAt(
  origin: { x: number; y: number },
  box: LayoutBox,
  options: GeoAtOptions,
): TLShapePartial {
  return {
    id: createShapeId(),
    type: "geo",
    x: origin.x + box.x,
    y: origin.y + box.y,
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
