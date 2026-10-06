// src/appearance/strokeMeta.ts — an outline thickness that text size cannot move.
//
// THE PROBLEM. Stock tldraw derives a geo shape's stroke width AND its label
// font size from the ONE `size` rung: `STROKE_SIZES` and `LABEL_FONT_SIZES`
// share the keys `s|m|l|xl`
// (tldraw 5.3.2, `lib/shapes/shared/default-shape-constants.mjs:6-26`), so the
// font-size control was silently the line-thickness control too — pick Extra
// large for a title and a rectangle's outline jumps from 3.5px to 10px.
// Zach: "I don't like how setting the size of the text also sets the size of
// the line width (thats tldraws convention) but I want thoose to be seperate
// things here."
//
// WHY the width lives in `meta` and NOT in a `StyleProp`. A StyleProp only
// reaches shapes whose util DECLARES it, and `geo`/`draw`/`line`/`arrow` are
// tldraw's OWN shapes. Adding a prop to one would change the on-disk schema of
// a stock record, so a `.tldr` written here would stop opening in plain
// tldraw — the exact property this app exists to keep (see
// `src/document/stockBoundary.test.ts`, "tldraw stays stock"). `meta` is
// tldraw's sanctioned escape hatch and `getCustomDisplayValues` is the
// matching paint seam; a reader that knows nothing about us simply ignores
// both and paints the stock outline.
//
// WHY the STORED number is the PAINTED width, and the division by `scale`
// happens only at the paint seam: tldraw multiplies a shape's display
// `strokeWidth` by `shape.props.scale` when it draws
// (`lib/shapes/geo/GeoShapeBody.mjs:14-15`), and `customFontSize.ts` moves
// `scale` to reach an exact px. Storing the painted width and dividing by
// `scale` in `strokeWidthDisplay` is what makes a chosen thickness survive a
// text-size change — which is the whole point. Storing the DISPLAY value
// instead would re-couple the two the moment a custom size moved `scale`.
//
// Provenance (this repo requires it — docs/ALGORITHM-PROVENANCE.md): ported
// from the archived app, /home/bam/systemsketch/src/appearance/strokeMeta.ts
// — the meta key and rung ladder (:47-91), `strokeWidthPxOf` (:234-241),
// `strokeWidthDisplayValue` (:267-270) and `pinStrokeWidth` (:412-427). Two
// deliberate departures from that donor, both noted at their seams below:
// this file asks tldraw for the stock width instead of mirroring its
// `@internal` `STROKE_SIZES` table, and it descends into groups the way
// `Editor.setStyleForSelectedShapes` does.
import { getDisplayValues, type Editor, type JsonObject, type TLShape } from "tldraw";

/** Where the painted width rides on a shape. One flat number, in scene units. */
export const STROKE_WIDTH_META_KEY = "bboxStrokeWidth";

export const STROKE_WIDTH_RUNGS: readonly ["thin", "medium", "thick"] = ["thin", "medium", "thick"];

export type StrokeWidthRung = "thin" | "medium" | "thick";

/**
 * The thickness each rung paints, in scene units.
 *
 * The ladder is ANCHORED, not invented: `thin` is tldraw's own `s` width and
 * `medium` is exactly what every shape is already drawn at (`m`), so nothing
 * on an existing board moves when the control appears and an untouched
 * rectangle reads truthfully as Medium rather than blank. `thick` is double
 * medium, because a three-rung ladder is only useful if the top rung is
 * visibly the top — tldraw's own `s`/`m`/`l` span just 2.5x end to end, which
 * is why Excalidraw's three (1 : 2 : 4) read as a ladder and those would not.
 * (Archive strokeMeta.ts:76-91, values unchanged so boards written by either
 * app agree.)
 */
export const STROKE_WIDTH_PX: Readonly<Record<StrokeWidthRung, number>> = {
  thin: 2,
  medium: 3.5,
  thick: 7,
};

/**
 * The shapes a thickness override is actually painted on.
 *
 * WHY a type list rather than "anything with a `dash` prop": the override
 * rides `getCustomDisplayValues`, and only these four utils are configured to
 * read it (`./stockPaintOverrides.ts`). A wider predicate would offer a
 * control whose paint some shapes silently ignore — a row that lies. Archive
 * strokeMeta.ts:221.
 */
export const STROKE_WIDTH_SHAPE_TYPES: ReadonlySet<string> = new Set(["geo", "draw", "line", "arrow"]);

/** Widths are floats; compare them the way the rung lookup has to. */
const WIDTH_EPSILON = 0.001;

function scaleOf(shape: TLShape): number {
  const scale = (shape.props as { scale?: unknown }).scale;
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** The override a shape carries, or undefined when it has never been pinned. */
function strokeWidthOverride(shape: TLShape): number | undefined {
  const value = shape.meta?.[STROKE_WIDTH_META_KEY];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Every shape a selection-wide write would touch, groups flattened.
 *
 * WHY flattened: `Editor.setStyleForSelectedShapes` recurses through groups
 * (tldraw 5.3.2 `Editor.mjs:6832-6837`), so a pin that only looked at the
 * top-level selection would miss exactly the children whose width the style
 * write is about to move. Shared with `./paintLink.ts` and
 * `./customFontSize.ts` so all three see the same set tldraw would.
 */
export function selectedShapesDeep(editor: Editor): TLShape[] {
  const collect = (shape: TLShape): TLShape[] => {
    if (shape.type !== "group") return [shape];
    return editor
      .getSortedChildIdsForParent(shape.id)
      .map((id) => editor.getShape(id))
      .filter((child): child is TLShape => Boolean(child))
      .flatMap(collect);
  };
  return editor.getSelectedShapes().flatMap(collect);
}

function strokeWidthTargets(editor: Editor): TLShape[] {
  return selectedShapesDeep(editor).filter((shape) => STROKE_WIDTH_SHAPE_TYPES.has(shape.type));
}

/**
 * The width tldraw itself would paint this shape at, before any override,
 * in scene units.
 *
 * WHY this asks the engine instead of mirroring `STROKE_SIZES × theme.strokeWidth`
 * (which is what the archive did, strokeMeta.ts:63-74): those tables are
 * `@internal` and unexported, so a mirror is a second implementation that can
 * drift silently — and it also hard-codes the default theme. `getDisplayValues`
 * is public (tldraw 5.3.2 `lib/shapes/shared/getDisplayValues.mjs`) and runs
 * the util's OWN `getDefaultDisplayValues` against the live theme, so the
 * answer is tldraw's, not ours. The `× scale` is the one piece the display
 * value does not carry — `GeoShapeBody.mjs:14-15` applies it at paint time.
 */
function stockStrokeWidthPx(editor: Editor, shape: TLShape): number | undefined {
  // Cast: `getDisplayValues` is generic over one shape type and its own
  // display-value interface; a runtime-narrowed `TLShape` cannot satisfy that
  // pair statically. All four utils in STROKE_WIDTH_SHAPE_TYPES declare
  // `strokeWidth` (GeoShapeUtilDisplayValues, DrawShapeUtilDisplayValues,
  // LineShapeUtilDisplayValues, ArrowShapeUtilDisplayValues).
  const util = editor.getShapeUtil(shape) as unknown as Parameters<
    typeof getDisplayValues<TLShape, { strokeWidth: number }>
  >[0];
  const width = getDisplayValues<TLShape, { strokeWidth: number }>(util, shape).strokeWidth;
  return typeof width === "number" && Number.isFinite(width) ? width * scaleOf(shape) : undefined;
}

/**
 * The width one shape paints RIGHT NOW, in scene units: its meta override if
 * it has one, else tldraw's size-derived width.
 *
 * The answer is deliberately SCALE-INVARIANT for an overridden shape — the
 * stored number IS the painted width, and `strokeWidthDisplay` divides by
 * `scale` on the way to the canvas — which is what makes a custom text size
 * (`./customFontSize.ts`, which moves `scale`) leave this reading alone.
 *
 * The override branch reads meta directly rather than going through
 * `getDisplayValues` on purpose: the answer must not depend on whether
 * `./stockPaintOverrides.ts` happens to be registered. Whether the canvas
 * actually paints it is a separate claim, and `strokeMeta.test.ts` asserts it
 * separately through the registry's own utils.
 */
export function strokeWidthPxFor(editor: Editor, shape: TLShape): number | undefined {
  if (!STROKE_WIDTH_SHAPE_TYPES.has(shape.type)) return undefined;
  return strokeWidthOverride(shape) ?? stockStrokeWidthPx(editor, shape);
}

function rungForPx(px: number): StrokeWidthRung | undefined {
  return STROKE_WIDTH_RUNGS.find((rung) => Math.abs(STROKE_WIDTH_PX[rung] - px) < WIDTH_EPSILON);
}

/**
 * The rung shared by every selected shape that supports one; `"mixed"`; or
 * `null` when the row does not apply because nothing selected has a painted
 * edge.
 *
 * WHY an off-ladder width also reads `"mixed"` rather than `null`: a shape
 * left on tldraw's own `l` (5px) or `xl` (10px) rung sits between our three,
 * and both states want the SAME rendering — the row applies, and no rung is
 * check-marked. `null` would hide the control on a shape that has an outline,
 * which is the one thing it must never do. (The archive returned the raw
 * number here, strokeMeta.ts:249-256; the frozen signature for this lane has
 * three outcomes, so the off-ladder case joins the one that renders right.)
 */
export function sharedStrokeWidth(editor: Editor): StrokeWidthRung | "mixed" | null {
  const widths = strokeWidthTargets(editor)
    .map((shape) => strokeWidthPxFor(editor, shape))
    .filter((px): px is number => px !== undefined);
  if (widths.length === 0) return null;
  const first = widths[0];
  if (!widths.every((px) => Math.abs(px - first) < WIDTH_EPSILON)) return "mixed";
  return rungForPx(first) ?? "mixed";
}

/** `shape.meta` with the width override set, leaving every other key alone. */
function metaWithWidth(shape: TLShape, px: number): JsonObject {
  return { ...(shape.meta ?? {}), [STROKE_WIDTH_META_KEY]: px } as JsonObject;
}

function writeWidths(editor: Editor, shapes: readonly TLShape[], pxFor: (shape: TLShape) => number | undefined): void {
  const updates = shapes.flatMap((shape) => {
    const px = pxFor(shape);
    return px === undefined ? [] : [{ id: shape.id, type: shape.type, meta: metaWithWidth(shape, px) }];
  });
  if (updates.length === 0) return;
  // Cast: `TLShapePartial` is a discriminated union keyed on a literal `type`,
  // and a runtime-widened `shape.type` cannot index it. Same seam and same
  // reason as the archive's src/store/looseShapeUpdates.ts.
  editor.updateShapes(updates as never);
}

/**
 * Apply a thickness rung to every width-bearing shape in the selection, in one
 * history step, so undo takes the whole row back at once.
 *
 * WHY not `setStyleForSelectedShapes`: thickness lives in `meta`, for the
 * schema reason at the top of this file. Archive strokeMeta.ts:377-394.
 */
export function applyStrokeWidth(editor: Editor, rung: StrokeWidthRung): void {
  const px = STROKE_WIDTH_PX[rung];
  if (px === undefined) return;
  editor.markHistoryStoppingPoint("stroke width");
  editor.run(() => {
    writeWidths(editor, strokeWidthTargets(editor), () => px);
  });
}

/**
 * Freeze the CURRENTLY PAINTED width into meta for every selected shape that
 * has no override yet — the move that actually decouples text size from line
 * width.
 *
 * MUST be called BEFORE writing `DefaultSizeStyle` or a text `scale`. Adding a
 * thickness control does not fix Zach's complaint on its own; the font-size
 * write has to stop dragging the outline with it, and pinning what is on
 * screen first is what makes the type change visibly a type change while the
 * thickness row still reads exactly what it read before.
 *
 * Shapes that already carry a rung are skipped, so this CONVERGES rather than
 * rewriting meta on every keystroke. Archive strokeMeta.ts:396-427.
 */
export function pinStrokeWidth(editor: Editor): void {
  const unpinned = strokeWidthTargets(editor).filter((shape) => strokeWidthOverride(shape) === undefined);
  writeWidths(editor, unpinned, (shape) => strokeWidthPxFor(editor, shape));
}

/**
 * The one display value a thickness override contributes, ready to spread into
 * a ShapeUtil's `getCustomDisplayValues` — geo, draw, line and arrow all name
 * the field the same way, which is what lets one control paint four shapes.
 * Returns `undefined` when the shape has no override, so stock tldraw's own
 * size-derived width is left completely alone.
 *
 * The division by `scale` is the counterpart of storing the painted width:
 * tldraw multiplies by `scale` at paint time, so display × scale === the
 * number the person chose, whatever the text size has done to `scale` since.
 * Archive strokeMeta.ts:258-280.
 */
export function strokeWidthDisplay(shape: TLShape): { strokeWidth: number } | undefined {
  const px = strokeWidthOverride(shape);
  return px === undefined ? undefined : { strokeWidth: px / scaleOf(shape) };
}
