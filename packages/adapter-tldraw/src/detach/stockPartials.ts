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
import { createShapeId, toRichText } from "tldraw";
import type { TLDefaultColorStyle, TLDefaultSizeStyle, TLShapePartial } from "tldraw";

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
 * `text` shortened with a trailing ellipsis until it measures within
 * `maxW` — the stock-primitive equivalent of CSS `text-overflow: ellipsis`.
 * Splits on code points (`[...text]`), never through a surrogate pair, so
 * an emoji is dropped whole or kept whole.
 */
export function truncateToWidth(
  text: string,
  px: number,
  maxW: number,
  weight = 400,
): string {
  if (measureText(text, px, weight) <= maxW) return text;
  const ELLIPSIS = "…";
  const chars = [...text];
  // Binary search the longest prefix whose "prefix…" still fits.
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureText(chars.slice(0, mid).join("") + ELLIPSIS, px, weight) <= maxW) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return chars.slice(0, low).join("") + ELLIPSIS;
}

export interface TextAtOptions {
  text: string;
  px: number;
  /** The line box the live DOM gave this string, in the caller's frame. */
  box: LayoutBox;
  origin: { x: number; y: number };
  color: TLDefaultColorStyle;
  align: "start" | "middle" | "end";
}

/** A stock text primitive centered in the live line box. */
export function textAt(options: TextAtOptions): TLShapePartial {
  const stock = stockTextStyle(options.px);
  // TextShapeUtil floors a fixed width before measuring; reserve the same
  // +1 tldraw itself uses for auto-sized labels, plus DOM tolerance, so the
  // final glyph never wraps out of the box.
  const width = Math.max(1, Math.ceil(options.box.w) + 8);
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
      (options.box.h - options.px * TLDRAW_TEXT_LINE) / 2,
    props: {
      richText: toRichText(options.text),
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
