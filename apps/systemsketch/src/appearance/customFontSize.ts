// src/appearance/customFontSize.ts — an exact pixel size over stock tldraw's
// four rungs.
//
// THE MECHANISM. Every stock text-bearing record carries a plain numeric
// `scale` prop ALONGSIDE its `size` rung, and tldraw multiplies the rung's
// rendered font size by it — a text shape wraps its label in
// `transform: scale(...)` (tldraw 5.3.2 `lib/shapes/text/TextShapeUtil.mjs:135`)
// and a geo shape does the same to its `RichTextLabel`
// (`lib/shapes/geo/GeoShapeUtil.mjs:294-299`). So any effective size is
// `rungPx × scale`: no fork, no custom paint, and a board saved here still
// renders at the exact size in plain tldraw.
//
// WHY `pinStrokeWidth` HAS TO RUN FIRST, and this is the whole reason this
// file lives beside `./strokeMeta.ts`: `scale` multiplies the shape's STROKE
// WIDTH too (`lib/shapes/geo/GeoShapeBody.mjs:14-15`). Reaching an exact px by
// moving `scale` would therefore move the outline as a side effect — the same
// coupling Zach objected to in the `size` rung, one level down, and this time
// invisible because nothing in the UI said "line width". Pinning the painted
// width into meta first is what makes a size change visibly ONLY a size
// change.
//
// WHY the rung tables are not mirrored here (the one departure from the
// donor): tldraw marks `FONT_SIZES` / `LABEL_FONT_SIZES` `@internal` and does
// not export them, so the archive copied the numbers and pinned them with a
// browser journey. `getDisplayValues` is public, so this file instead asks the
// shape's own util what px a given rung produces, against the live theme. One
// implementation, tldraw's.
//
// Provenance (docs/ALGORITHM-PROVENANCE.md): ported from the archived app,
// /home/bam/systemsketch/src/appearance/customFontSize.ts — the nearest-rung-
// in-log-ratio anchor (:79-97), `applyCustomFontPx`'s rung + residual scale
// write and its `pinStrokeWidth` call (:177-212), `resetCustomFontScale`
// (:214-228), `selectionOnPresetRungs` (:163-175) and the per-selection rung
// px (:136-161). The `ss-code` branch of the donor is deliberately absent:
// this app's Code shape has no font props at all
// (`src/shapes/code/CodeShapeUtil.tsx:72-78`).
import { DefaultSizeStyle, getDisplayValues, type Editor, type TLShape } from "tldraw";

import { pinStrokeWidth, selectedShapesDeep } from "./strokeMeta";

/** Wide enough for posters, tight enough that a fat-fingered 1600 cannot
 *  produce an unrecoverable shape. Archive customFontSize.ts:35-38. */
export const CUSTOM_FONT_PX_MIN = 4;
export const CUSTOM_FONT_PX_MAX = 400;

const RUNGS = ["s", "m", "l", "xl"] as const;
type SizeRung = (typeof RUNGS)[number];

/**
 * Which display value carries the rendered text size, per shape type.
 *
 * WHY an allowlist rather than "anything with a `scale` prop": draw, line and
 * arrow shapes carry the same stock `scale`, but there it records a
 * whole-artwork resize gesture — steering it from a FONT control would
 * silently rescale drawings. Only shapes whose text IS the shape participate.
 * Archive customFontSize.ts:45-60.
 */
const FONT_DISPLAY_FIELD: Readonly<Record<string, "fontSize" | "labelFontSize">> = {
  text: "fontSize",
  geo: "labelFontSize",
  note: "labelFontSize",
};

function scaleOf(shape: TLShape): number {
  const scale = (shape.props as { scale?: unknown }).scale;
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function sizeRungOf(shape: TLShape): SizeRung | null {
  const size = (shape.props as { size?: unknown }).size;
  return typeof size === "string" && (RUNGS as readonly string[]).includes(size) ? (size as SizeRung) : null;
}

/**
 * The unscaled px the shape's own util reports for a given rung.
 *
 * The probe is a throwaway copy of the record with `size` swapped and `scale`
 * pinned to 1, because `getDefaultDisplayValues` is a pure function of the
 * props and the theme (tldraw 5.3.2 `lib/shapes/shared/getDisplayValues.mjs`)
 * — that is what lets one public call stand in for the two `@internal` tables.
 */
function rungPxFor(editor: Editor, shape: TLShape, rung: SizeRung): number | null {
  const field = FONT_DISPLAY_FIELD[shape.type];
  if (!field) return null;
  const probe = { ...shape, props: { ...shape.props, size: rung, scale: 1 } } as TLShape;
  // Cast: `getDisplayValues` is generic over one shape type paired with its own
  // display-value interface; a runtime-narrowed `TLShape` cannot satisfy that
  // pair statically. Both fields are declared — TextShapeUtilDisplayValues
  // carries `fontSize`, Geo/Note carry `labelFontSize`.
  const util = editor.getShapeUtil(probe) as unknown as Parameters<
    typeof getDisplayValues<TLShape, Record<string, number>>
  >[0];
  const px = getDisplayValues<TLShape, Record<string, number>>(util, probe)[field];
  return typeof px === "number" && Number.isFinite(px) ? px : null;
}

function fontTargets(editor: Editor): TLShape[] {
  return selectedShapesDeep(editor).filter((shape) => Boolean(FONT_DISPLAY_FIELD[shape.type]));
}

/** The effective label/text px one shape renders at right now, or null when it has no text. */
export function fontPxFor(editor: Editor, shape: TLShape): number | null {
  const rung = sizeRungOf(shape);
  if (!rung) return null;
  const base = rungPxFor(editor, shape, rung);
  return base === null ? null : base * scaleOf(shape);
}

/** One shared px across the selection, `"mixed"`, or `null` when the row does not apply. */
export function sharedFontPx(editor: Editor): number | "mixed" | null {
  const sizes = fontTargets(editor)
    .map((shape) => fontPxFor(editor, shape))
    .filter((px): px is number => px !== null);
  if (sizes.length === 0) return null;
  return sizes.every((px) => Math.abs(px - sizes[0]) < 0.01) ? sizes[0] : "mixed";
}

/**
 * rung -> px FOR THIS SELECTION, for the size list's right-hand numerals.
 *
 * WHY this is not a constant: stock tldraw has SEVERAL type scales behind one
 * set of rung names — a Text shape's `xl` and a geo label's `xl` are different
 * pixel sizes — because `size` is a type ROLE, not a size. A menu printing
 * only "Extra large" therefore lies by omission whenever the selection mixes
 * kinds, so a rung whose participants disagree reports `null` and the row
 * shows no number rather than one shape's. Archive customFontSize.ts:136-161.
 */
export function rungPxByValue(editor: Editor): Readonly<Record<string, number | null>> {
  const shapes = fontTargets(editor);
  const out: Record<string, number | null> = {};
  for (const rung of RUNGS) {
    const values = shapes.map((shape) => rungPxFor(editor, shape, rung));
    out[rung] =
      values.length > 0 && values.every((px): px is number => px !== null && Math.abs(px - (values[0] ?? NaN)) < 0.01)
        ? values[0]
        : null;
  }
  return out;
}

/**
 * True when the preset rows tell the truth about what is on screen: every
 * participant sits exactly on its rung (no residual scale) AND the selection
 * agrees on what each rung means. A Text shape and a sticky both at `xl` are
 * both "on their rung" and still render at different sizes, so check-marking
 * Extra large for that pair would claim a shared size the canvas does not
 * have. Archive customFontSize.ts:163-175.
 */
export function selectionOnPresetRungs(editor: Editor): boolean {
  const shapes = fontTargets(editor);
  if (shapes.length === 0) return true;
  if (!shapes.every((shape) => scaleOf(shape) === 1)) return false;
  return Object.values(rungPxByValue(editor)).every((px) => px !== null);
}

export function clampCustomFontPx(px: number): number {
  if (!Number.isFinite(px)) return NaN;
  return Math.min(CUSTOM_FONT_PX_MAX, Math.max(CUSTOM_FONT_PX_MIN, px));
}

/**
 * The rung a target px anchors to: nearest in RATIO (log distance), so 30px on
 * a text shape prefers `l` (36, x0.83) over `m` (24, x1.25).
 *
 * WHY nearest-rung rather than one fixed anchor: `size` also drives the rest
 * of the shape's presentation and `scale` multiplies all of it, so keeping the
 * multiplier near 1 keeps the shape closest to how stock tldraw would draw it
 * at the asked size. Archive customFontSize.ts:79-97.
 */
function nearestRung(editor: Editor, shape: TLShape, px: number): { rung: SizeRung; base: number } | null {
  let best: { rung: SizeRung; base: number } | null = null;
  let bestDistance = Infinity;
  for (const rung of RUNGS) {
    const base = rungPxFor(editor, shape, rung);
    if (base === null || base <= 0) continue;
    const distance = Math.abs(Math.log(px / base));
    if (distance < bestDistance) {
      best = { rung, base };
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Apply an exact px to every text-bearing shape in the selection: nearest rung
 * plus the residual as the shape's `scale`.
 *
 * A plain-prop write, not a style write — `scale` is not a StyleProp, so
 * `setStyleForSelectedShapes` cannot carry it, and (deliberately) the next
 * shape drawn does NOT inherit a custom px; only the rung joins tldraw's
 * next-shape memory. Archive customFontSize.ts:177-212.
 */
export function applyCustomFontPx(editor: Editor, px: number): void {
  const target = clampCustomFontPx(px);
  if (!Number.isFinite(target)) return;
  const shapes = fontTargets(editor);
  if (shapes.length === 0) return;
  const updates = shapes.flatMap((shape) => {
    const anchor = nearestRung(editor, shape, target);
    if (!anchor) return [];
    return [{ id: shape.id, type: shape.type, props: { size: anchor.rung, scale: target / anchor.base } }];
  });
  if (updates.length === 0) return;
  editor.markHistoryStoppingPoint("custom font size");
  editor.run(() => {
    // MUST be first. An exact px moves `scale`, which multiplies stroke width
    // too — see this file's header. Pinning the painted thickness before the
    // write is what keeps the outline where it was.
    pinStrokeWidth(editor);
    // Cast: `TLShapePartial` is a discriminated union keyed on a literal
    // `type`; a runtime-widened `shape.type` cannot index it.
    editor.updateShapes(updates as never);
    // Keep tldraw's next-shape memory on the rung the custom size anchored to,
    // so the next text drawn lands near the chosen size.
    const rungs = new Set(updates.map((update) => update.props.size));
    if (rungs.size === 1) editor.setStyleForNextShapes(DefaultSizeStyle, [...rungs][0]);
  });
}

/**
 * Snap the selection back onto its rungs (`scale` -> 1).
 *
 * WHY the preset rows need this: after a custom size, clicking `Medium` must
 * actually render Medium; leaving a residual x1.3 scale would make the
 * check-marked row a lie. Archive customFontSize.ts:214-228.
 *
 * WHY it pins the stroke width first, where the donor did not: dropping
 * `scale` back to 1 moves the painted outline of any shape that has no width
 * override yet, which is the same silent coupling in reverse. `pinStrokeWidth`
 * is idempotent and only ever freezes what is already on screen, so calling it
 * here costs a caller that already pinned nothing at all.
 */
export function resetCustomFontScale(editor: Editor): void {
  const updates = fontTargets(editor)
    .filter((shape) => scaleOf(shape) !== 1)
    .map((shape) => ({ id: shape.id, type: shape.type, props: { scale: 1 } }));
  if (updates.length === 0) return;
  editor.run(() => {
    pinStrokeWidth(editor);
    editor.updateShapes(updates as never);
  });
}
