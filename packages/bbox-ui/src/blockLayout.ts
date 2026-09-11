/**
 * Block (Simple View) box layout — the flex arrangement of `block.tsx`,
 * restated as pure geometry.
 *
 * WHY this exists: detach-to-primitives needs the position of every part of
 * a Block (header band, glyph, title, chip, description, type) as numbers,
 * and those positions must come from the same authority as the live
 * renderer — never from re-measured DOM and never from hand-typed offsets.
 * The live renderer's authority is `block.tsx`'s CSS (flex column, centered,
 * `gap-1`) plus the constants in `layout.ts`; this module is that CSS
 * written as arithmetic, importing the same constants. If `block.tsx`
 * changes a class, this file is the other place that class lives.
 *
 * Pure by the same rule as `layout.ts`: no React, no canvas engine, no DOM.
 * Text widths are the one thing only an environment can know, so they come
 * in through a `measure` function the caller supplies (a DOM measurer in a
 * browser, a deterministic approximation in tests).
 */

import {
  BLOCK_BORDER_PX,
  BLOCK_PADDING_X,
  CHIP,
  CHIP_RIGHT_IN_HEADER_PX,
  HEADER_CHIP_RESERVED_PX,
  META_FONT_PX,
  TEXT_SIZES,
  glyphPx,
  type TextSize,
} from "./layout";
// INTEGRATION (docs/T1-SPEC.md §0): `portLabelOut`/`PortTextLayout` moved
// to the rebuilt `port.layout.ts` with Lane P's Port rebuild — narrowed
// from six text-layout members to four (the "-offset" variants were a
// deliberate redesign, not carried forward; see `port.layout.ts`'s own
// PORT_TEXT_LAYOUTS and `test/port.layout.test.ts`'s note). Nothing in
// the rebuilt Port can ever produce "right-offset"/"left-offset" anymore
// (no field, preset, or story sets it), so `portLabelBox` below drops
// those two case labels rather than keep an unreachable, untestable
// branch alive under a second, hand-widened type.
import { portLabelOut, type PortTextLayout } from "./port.layout";

/** A rectangle in block-local coordinates (0,0 = container top-left). */
export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `leading-tight` on BlockTitle and PortLabel. */
export const LEADING_TIGHT = 1.25;
/** The inherited body line-height (Tailwind preflight) — description, type, chip text. */
export const LEADING_BASE = 1.5;
/** `gap-1` between the container's in-flow children (header, description). */
export const BLOCK_STACK_GAP = 4;
/** `gap-2` between glyph and title in a horizontal header. */
export const HEADER_ITEM_GAP = 8;
/** `gap-1` between glyph and title in a vertical header. */
export const HEADER_ITEM_GAP_VERTICAL = 4;
/** `px-3` inside the chip oval. */
export const CHIP_PADDING_X = 12;
/** `border-2` on the chip oval. */
export const CHIP_BORDER_PX = 2;
/** `bottom-3` — the type label's inset from the padding-box bottom. */
export const BLOCK_TYPE_BOTTOM = 12;

/** Measured width of `text` at `fontPx` with CSS weight `weight`. */
export type TextMeasure = (text: string, fontPx: number, weight: number) => number;

/**
 * `text` with CSS `white-space: normal` collapsing applied: runs of
 * document white space (space, tab, LF, CR, FF) become one space, and
 * leading/trailing runs vanish (the browser removes them at line edges).
 *
 * WHY not `\s` or `trim()`: JS `\s` (and `String.trim`) also match NBSP,
 * which CSS never collapses — an NBSP is glue between words, not a
 * separator, so it must survive normalisation untouched.
 *
 * WHY exported: this is the ONE normalisation shared by layout (the line
 * counting in `wrapTextLines`) and by emission (the detach builders that
 * turn a prop into a stock text primitive). A live `<p>` shows the
 * collapsed text — a raw `\n` handed to a rich-text builder becomes a
 * second paragraph the live DOM never painted — so anything standing in
 * for the live paint must run the same function, never its own copy.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
}

const SOFT_HYPHEN = "\u00ad";
const NBSP_RUN = /^\u00a0+$/;

/**
 * Characters the live renderer allows a break AFTER inside a space-free
 * run: hyphen-minus, the typographic hyphens/dashes, the horizontal
 * ellipsis (U+2026) and the question mark.
 *
 * WHY this exact set: it is MEASURED Chrome behaviour (headless Chrome,
 * `overflow-wrap: normal`, 2026-09), not UAX #14 read off the page \u2014 the
 * live `<p>` paints whatever the engine decides, so the wrap model copies
 * the engine. Chrome breaks after "\u2026" and "?" ("wait\u2026|super", "no?|break")
 * but deliberately NOT after "/", ".", ":", ";", ",", "!", ")", "#", "_",
 * "@", quotes or a "..." run of full stops \u2014 a URL, a dotted domain or a
 * snake_case identifier stays one unbreakable run, which is why long URLs
 * famously overflow their containers. Backward-gluing punctuation onto the
 * run before it must therefore also KEEP these break-after opportunities:
 * an earlier version glued "wait\u2026supercalifragilistic" into one atom and a
 * narrow detached description overflowed its card where the live one
 * wrapped.
 */
const BREAK_AFTER_CHAR = /[-\u2010\u2012\u2013\u2014\u2026?]$/;

/**
 * One character CSS treats as its own line-break unit (UAX #14 class ID
 * and Hangul): a break is allowed between any two of them, dictionary
 * words or not — which is why a CJK run wraps with no spaces at all.
 */
const CJK_BREAK_CHAR =
  /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]$/u;

/**
 * Scripts written without spaces whose line breaks come from dictionary
 * word boundaries (CSS/ICU "South East Asian" line breaking). Unlike CJK
 * there is no break between arbitrary characters — the segmenter's word
 * boundary IS the break opportunity, so a boundary touching one of these
 * characters keeps its break.
 */
const SEA_BREAK_CHAR = /^[\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]$/u;

let wordSegmenter: Intl.Segmenter | null = null;

/** Availability is re-checked per call so tests can stub the segmenter away. */
function getWordSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return null;
  }
  if (!wordSegmenter) {
    wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  }
  return wordSegmenter;
}

/** Per-character atoms for a CJK segment, the segment itself otherwise. */
function splitCjkCharacters(segment: string): string[] {
  const characters = [...segment];
  return characters.length > 1 && characters.every((c) => CJK_BREAK_CHAR.test(c))
    ? characters
    : [segment];
}

/**
 * Split one space-free, soft-hyphen-free piece into the atoms between
 * which CSS allows a line break.
 *
 * Segmenter path: `Intl.Segmenter` word boundaries are the candidate
 * opportunities, adjusted four ways to match line breaking rather than
 * word counting — a non-word-like segment (punctuation) glues backward so
 * "hello," never sheds its comma to the next line, an NBSP glues BOTH of
 * its neighbours (it exists to forbid the break), a CJK word is re-split
 * per character because CSS breaks between ideographs the dictionary
 * would keep together, and a word-like segment glues backward too unless
 * the run behind it actually ends at a real break opportunity (a
 * `BREAK_AFTER_CHAR` — hyphen, ellipsis, "?" — or a CJK character) or the
 * segment itself begins with one. That last rule is what keeps
 * "https://internal.example.com/pipelines" one atom: the segmenter sees
 * word boundaries at every "/" and ".", but Chrome under
 * `overflow-wrap: normal` breaks only after the `BREAK_AFTER_CHAR` set,
 * not after URL punctuation — which is exactly why long URLs overflow
 * their boxes in browsers.
 *
 * Fallback (no Segmenter — documented and tested): break around each CJK
 * character and after each `BREAK_AFTER_CHAR`, nowhere else. Spaces and
 * soft hyphens were already handled by the caller, and an NBSP simply
 * stays inside its run, so it can never break. Coarser than the segmenter
 * for long Latin words, identical for the space-separated and CJK text
 * this layout actually meets.
 */
function atomizePiece(piece: string): string[] {
  const segmenter = getWordSegmenter();
  if (!segmenter) {
    const atoms: string[] = [];
    let run = "";
    for (const character of piece) {
      if (CJK_BREAK_CHAR.test(character)) {
        if (run !== "") atoms.push(run);
        run = "";
        atoms.push(character);
      } else if (BREAK_AFTER_CHAR.test(character)) {
        // The break-after characters (hyphens, ellipsis, "?") end their
        // run and open a break opportunity, same as the segmenter path.
        atoms.push(run + character);
        run = "";
      } else {
        run += character;
      }
    }
    if (run !== "") atoms.push(run);
    return atoms;
  }
  const atoms: string[] = [];
  let glueNext = false;
  for (const part of segmenter.segment(piece)) {
    const isNbsp = NBSP_RUN.test(part.segment);
    const previous = atoms[atoms.length - 1];
    // A word boundary is only a LINE-break opportunity when the text on
    // either side of it says so: the run behind ends breakably (hyphen,
    // CJK, or a dictionary-broken SEA script) or the incoming segment
    // starts with a CJK/SEA character.
    const previousEnd = previous === undefined ? "" : ([...previous].at(-1) ?? "");
    const segmentStart = [...part.segment][0] ?? "";
    const boundaryBreaks =
      previous !== undefined &&
      (BREAK_AFTER_CHAR.test(previous) ||
        CJK_BREAK_CHAR.test(previousEnd) ||
        SEA_BREAK_CHAR.test(previousEnd) ||
        CJK_BREAK_CHAR.test(segmentStart) ||
        SEA_BREAK_CHAR.test(segmentStart));
    const glue = glueNext || isNbsp || !part.isWordLike || !boundaryBreaks;
    const units = splitCjkCharacters(part.segment);
    if (glue && atoms.length > 0) {
      atoms[atoms.length - 1] += units[0];
      atoms.push(...units.slice(1));
    } else {
      atoms.push(...units);
    }
    glueNext = isNbsp;
  }
  return atoms;
}

/** How a token may separate from the one before it on the same line. */
type WrapBreak = "space" | "opportunity" | "soft-hyphen";

interface WrapToken {
  text: string;
  breakBefore: WrapBreak;
}

/**
 * `text` broken into the lines CSS normal wrapping produces in a `maxW`
 * box: whitespace collapsed (via `collapseWhitespace`), greedy fill,
 * breaks at real line-break opportunities. Those are spaces (consumed at
 * the break), the boundaries `atomizePiece` finds — between CJK
 * characters, after hyphens/ellipses/question marks, at SEA dictionary
 * words — and soft hyphens, which are
 * invisible until used and render a "-" at the line end when the break is
 * taken. An NBSP never breaks. A single unbreakable run wider than the box
 * overflows on its own line rather than splitting, exactly as
 * `overflow-wrap: normal` behaves.
 *
 * WHY the opportunity model and not `split(/\s+/)`: the split saw a 40-
 * ideograph description as one unbreakable word and counted one 27px line
 * where the live `<p>` painted two or more — and every line miscounted
 * moves the whole centred stack. It also broke at NBSP (JS `\s` matches
 * it; CSS does not) and ignored soft hyphens entirely.
 */
export function wrapTextLines(
  text: string,
  maxW: number,
  fontPx: number,
  weight: number,
  measure: TextMeasure,
): string[] {
  const collapsed = collapseWhitespace(text);
  if (collapsed === "") return [];
  const tokens: WrapToken[] = [];
  for (const chunk of collapsed.split(" ")) {
    for (const [pieceIndex, piece] of chunk.split(SOFT_HYPHEN).entries()) {
      // The soft hyphens themselves are delimiters: invisible when the
      // line runs through them, so they never reach a token's text.
      const atoms = atomizePiece(piece);
      for (const [atomIndex, atom] of atoms.entries()) {
        tokens.push({
          text: atom,
          breakBefore:
            atomIndex > 0
              ? "opportunity"
              : pieceIndex > 0
                ? "soft-hyphen"
                : "space",
        });
      }
    }
  }
  if (tokens.length === 0) return [];
  const lines: string[] = [];
  let line = tokens[0].text;
  for (const token of tokens.slice(1)) {
    const joiner = token.breakBefore === "space" ? " " : "";
    const candidate = line + joiner + token.text;
    if (measure(candidate, fontPx, weight) <= maxW) {
      line = candidate;
    } else {
      lines.push(token.breakBefore === "soft-hyphen" ? `${line}-` : line);
      line = token.text;
    }
  }
  lines.push(line);
  return lines;
}

export interface SimpleBlockLayoutInput {
  width: number;
  height: number;
  title: string;
  titleSize: TextSize;
  /** Empty string means "no glyph", matching the adapters. */
  icon: string;
  /** Empty string means "no chip". */
  tag: string;
  description: string;
  blockType: string;
  orientation: "horizontal" | "vertical";
  measure: TextMeasure;
}

export interface SimpleBlockLayout {
  /** The header band (the flex row/column of glyph + title). */
  header: LayoutBox;
  glyph: LayoutBox | null;
  /** The title's line box; `w` is already clamped to the room the chip leaves. */
  title: LayoutBox | null;
  chip: LayoutBox | null;
  /** The chip's text line box, centered inside the oval. */
  chipText: LayoutBox | null;
  description: LayoutBox | null;
  /**
   * How many lines the description wraps onto inside `description.w` — the
   * live `<p>` has no nowrap/truncate, so a long description wraps and the
   * whole flex stack re-centres around the wrapped height. Callers emitting
   * a text primitive need the count to centre their own line grid inside
   * the box. 0 when there is no description.
   */
  descriptionLines: number;
  /**
   * The wrapped lines themselves, exactly as the live `<p>` paints them
   * (soft-hyphen breaks already rendered as "-"). Emitters that hand the
   * description to a renderer with a DIFFERENT wrapping model (tldraw's
   * rich text uses `overflow-wrap: break-word`, the live `<p>` uses
   * `normal`) must emit these lines verbatim rather than letting that
   * renderer re-wrap — re-wrapping split a long URL the live component
   * painted as one overflowing line. Empty when there is no description.
   */
  descriptionTextLines: string[];
  blockType: LayoutBox | null;
}

/**
 * The Simple View, laid out. Mirrors `block.tsx` rule for rule:
 * - container: flex column, centered both ways, `gap-1`, `border-2`, `px-4`
 * - header: flex row (or column when vertical), centered, `gap-2`
 * - chip: out of flow, right `CHIP_RIGHT_IN_HEADER_PX` in the header frame,
 *   reserving `HEADER_CHIP_RESERVED_PX` so the title's room ends before it
 * - blockType: absolute, `bottom-3`, centered on the padding box
 */
export function layoutSimpleBlock(input: SimpleBlockLayoutInput): SimpleBlockLayout {
  const { width, height, measure } = input;
  const contentX = BLOCK_BORDER_PX + BLOCK_PADDING_X;
  const contentW = width - 2 * contentX;
  const hasChip = input.tag !== "";
  const hasIcon = input.icon !== "";

  // Measure what the DOM renders: every text slot collapses white space
  // (`white-space: normal` and `nowrap` both do), so a raw `\n` or tab in a
  // prop is a single space on screen — never a measurement unit.
  const titleText = collapseWhitespace(input.title);
  const tagText = collapseWhitespace(input.tag);
  const blockTypeText = collapseWhitespace(input.blockType);

  const titleFontPx = TEXT_SIZES[input.titleSize];
  const titleLineH = titleText === "" ? 0 : Math.round(titleFontPx * LEADING_TIGHT);
  const glyphSize = hasIcon ? glyphPx(input.titleSize) : 0;

  // The room the header's in-flow content actually has (the chip reserves
  // its span as right padding — see BlockHeader).
  const headerAvailW = contentW - (hasChip ? HEADER_CHIP_RESERVED_PX : 0);

  const vertical = input.orientation === "vertical";
  const headerH = vertical
    ? glyphSize + (hasIcon && titleLineH > 0 ? HEADER_ITEM_GAP_VERTICAL : 0) + titleLineH
    : Math.max(glyphSize, titleLineH);

  // The live description is a plain wrapping <p>: a long description takes
  // several 27px lines and the flex stack re-centres around the wrapped
  // height, so the layout must count the lines, not assume one.
  const descLineH = Math.round(META_FONT_PX * LEADING_BASE);
  const descLines =
    input.description === ""
      ? []
      : wrapTextLines(input.description, contentW, META_FONT_PX, 400, measure);
  const descH = descLines.length * descLineH;

  // The container's vertical centering: in-flow children are the header and
  // the description; the type label is out of flow.
  const flowHeights = [headerH, descH].filter((h) => h > 0);
  const stackH =
    flowHeights.reduce((sum, h) => sum + h, 0) +
    BLOCK_STACK_GAP * Math.max(0, flowHeights.length - 1);
  const stackTop = (height - stackH) / 2;

  const header: LayoutBox = { x: contentX, y: stackTop, w: contentW, h: headerH };

  let glyph: LayoutBox | null = null;
  let title: LayoutBox | null = null;
  if (vertical) {
    if (hasIcon) {
      glyph = {
        x: contentX + (headerAvailW - glyphSize) / 2,
        y: header.y,
        w: glyphSize,
        h: glyphSize,
      };
    }
    if (titleLineH > 0) {
      const titleW = Math.min(measure(titleText, titleFontPx, 500), headerAvailW);
      title = {
        x: contentX + (headerAvailW - titleW) / 2,
        y: header.y + headerH - titleLineH,
        w: titleW,
        h: titleLineH,
      };
    }
  } else {
    // An empty title is still a flex item, so the glyph↔title gap applies
    // whenever the glyph exists — matching the DOM, not intuition.
    const gap = hasIcon ? HEADER_ITEM_GAP : 0;
    const titleMaxW = Math.max(0, headerAvailW - (hasIcon ? glyphSize + gap : 0));
    const titleW =
      titleLineH > 0 ? Math.min(measure(titleText, titleFontPx, 500), titleMaxW) : 0;
    const rowW = (hasIcon ? glyphSize + gap : 0) + titleW;
    const rowX = contentX + (headerAvailW - rowW) / 2;
    if (hasIcon) {
      glyph = {
        x: rowX,
        y: header.y + (headerH - glyphSize) / 2,
        w: glyphSize,
        h: glyphSize,
      };
    }
    if (titleLineH > 0) {
      title = {
        x: rowX + (hasIcon ? glyphSize + gap : 0),
        y: header.y + (headerH - titleLineH) / 2,
        w: titleW,
        h: titleLineH,
      };
    }
  }

  let chip: LayoutBox | null = null;
  let chipText: LayoutBox | null = null;
  if (hasChip) {
    const textW = measure(tagText, META_FONT_PX, 400);
    const chipW = Math.max(
      CHIP.minWidth,
      textW + 2 * CHIP_PADDING_X + 2 * CHIP_BORDER_PX,
    );
    chip = {
      x: contentX + contentW - CHIP_RIGHT_IN_HEADER_PX - chipW,
      y: header.y + headerH / 2 - CHIP.height / 2,
      w: chipW,
      h: CHIP.height,
    };
    const chipTextH = Math.round(META_FONT_PX * LEADING_BASE);
    chipText = {
      x: chip.x + (chipW - textW) / 2,
      y: chip.y + (CHIP.height - chipTextH) / 2,
      w: textW,
      h: chipTextH,
    };
  }

  let description: LayoutBox | null = null;
  if (descLines.length > 0) {
    // One line keeps its measured width (a shrink-to-fit flex item); a
    // wrapped description fills the content width — that width is what
    // decided the line breaks, so it is the box the lines centre in.
    const descW =
      descLines.length === 1
        ? Math.min(measure(descLines[0], META_FONT_PX, 400), contentW)
        : contentW;
    description = {
      x: contentX + (contentW - descW) / 2,
      y: stackTop + (headerH > 0 ? headerH + BLOCK_STACK_GAP : 0),
      w: descW,
      h: descH,
    };
  }

  let blockType: LayoutBox | null = null;
  if (input.blockType !== "") {
    const typeH = Math.round(META_FONT_PX * LEADING_BASE);
    const typeW = measure(blockTypeText, META_FONT_PX, 400);
    blockType = {
      // left-1/2 -translate-x-1/2 in the padding box lands on width/2 exactly
      // (the border insets cancel).
      x: width / 2 - typeW / 2,
      y: height - BLOCK_BORDER_PX - BLOCK_TYPE_BOTTOM - typeH,
      w: typeW,
      h: typeH,
    };
  }

  return {
    header,
    glyph,
    title,
    chip,
    chipText,
    description,
    descriptionLines: descLines.length,
    descriptionTextLines: descLines,
    blockType,
  };
}

/* ------------------------------------------------------------------ */
/* Port label box — the flex row of `port.tsx`, as arithmetic          */
/* ------------------------------------------------------------------ */

export interface PortLabelBoxInput {
  /** The dot's box: 0,0 = dot top-left, `w`/`h` its diameter. */
  dotW: number;
  dotH: number;
  label: string;
  layout: PortTextLayout;
  /** The label's font size in px (a `TextSize` rung resolved by the caller). */
  fontPx: number;
  measure: TextMeasure;
}

/**
 * Where the label's line box sits relative to the dot's box — the same
 * geometry `portLabelPlacement` produces in CSS, as a rectangle. The near
 * edge lands `portLabelGap(layout)` px clear of the dot; cross-axis
 * centered. The along-axis distance comes from the shared `portLabelOut`,
 * the one place that quantity is computed — see its WHY.
 */
export function portLabelBox(input: PortLabelBoxInput): LayoutBox {
  const { dotW, dotH, layout, fontPx } = input;
  const out = portLabelOut(layout, { w: dotW, h: dotH });
  const w = input.measure(input.label, fontPx, 400);
  const h = Math.round(fontPx * LEADING_TIGHT);
  switch (layout) {
    case "right":
      return { x: out, y: dotH / 2 - h / 2, w, h };
    case "left":
      return { x: dotW - out - w, y: dotH / 2 - h / 2, w, h };
    case "top":
      return { x: dotW / 2 - w / 2, y: dotH - out - h, w, h };
    case "bot":
      return { x: dotW / 2 - w / 2, y: out, w, h };
  }
}
