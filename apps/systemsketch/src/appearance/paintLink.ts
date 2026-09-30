// src/appearance/paintLink.ts — the edge colour follows the fill until you
// set it.
//
// Zach: "By default the stroke color should follow the fill color, unless you
// specifically set the stroke color, then it now indepently moves. that makes
// it easy to like quickly make it green. but thten also allows you to fully
// customize if you want..."
//
// Stock tldraw geo/draw/line/arrow shapes have ONE `color` style, and it
// drives the outline AND the fill together
// (tldraw 5.3.2 `lib/shapes/geo/GeoShapeUtil.mjs:109-112`: `strokeColor` and
// `fillColor` are both derived from `props.color`). So an independent edge
// colour is shape `meta`, painted through `getCustomDisplayValues` — the same
// seam and the same schema reasoning as `./strokeMeta.ts`, which the header
// there spells out: a new `StyleProp` on a STOCK shape would change its
// on-disk schema and a `.tldr` written here would stop opening in plain
// tldraw.
//
// WHY THE LINK BREAKS ON THE EDGE AND NEVER ON THE FILL. This is the
// load-bearing rule and it is easy to get backwards. Setting the FILL while
// linked carries the edge along, so "make it green" stays one click and the
// shape still reads as one colour. Setting the EDGE is the act of asking for
// two colours, so that — and only that — unlinks. Break on fill instead and
// the first fill change after any edge tweak silently orphans the edge; break
// on neither and the edge can never be customised at all.
//
// Provenance (docs/ALGORITHM-PROVENANCE.md): the meta-override-plus-fallback
// read is ported from the archived app,
// /home/bam/systemsketch/src/appearance/strokeMeta.ts:170-180
// (`strokeColorOf`: "the override, or — with none — the shape's own colour,
// because that is what tldraw paints the outline with"). The explicit
// FOLLOWS flag and the break-on-edge rule are new here: the archive had no
// relink affordance, so "has an override" was its only notion of unlinked,
// and it could not express "linked and currently the same colour".
import { DefaultColorStyle, type Editor, type JsonObject, type StyleProp, type TLShape } from "tldraw";

import { selectedShapesDeep, STROKE_WIDTH_SHAPE_TYPES } from "./strokeMeta";

export const EDGE_FOLLOWS_FILL_META_KEY = "bboxEdgeFollowsFill";
export const EDGE_COLOR_META_KEY = "bboxEdgeColor";

/**
 * The shapes this model applies to.
 *
 * WHY it reuses `STROKE_WIDTH_SHAPE_TYPES` instead of declaring a second list:
 * the two rules share one enforcement seam — `./stockPaintOverrides.ts` is the
 * set of utils configured to read this meta — so a shape that can take a width
 * override is exactly a shape that can take an edge colour. Two lists would be
 * two chances for a control to offer paint the canvas ignores.
 */
const PAINTED_EDGE_SHAPE_TYPES = STROKE_WIDTH_SHAPE_TYPES;

function edgeTargets(editor: Editor): TLShape[] {
  return selectedShapesDeep(editor).filter((shape) => PAINTED_EDGE_SHAPE_TYPES.has(shape.type));
}

function fillColorOf(shape: TLShape): string | undefined {
  const color = (shape.props as { color?: unknown }).color;
  return typeof color === "string" ? color : undefined;
}

function edgeOverrideOf(shape: TLShape): string | undefined {
  const value = shape.meta?.[EDGE_COLOR_META_KEY];
  return typeof value === "string" ? value : undefined;
}

/**
 * Whether this shape's edge still follows its fill.
 *
 * Defaults to TRUE for a shape carrying no flag — which is every shape on
 * every board written before this existed, and every shape a person has not
 * touched. Absence therefore means "untouched, follows the fill", and a stock
 * `.tldr` opened here behaves the way Zach asked for without a migration.
 */
export function edgeFollowsFill(shape: TLShape): boolean {
  return shape.meta?.[EDGE_FOLLOWS_FILL_META_KEY] !== false;
}

/** One value across the selection, `"mixed"`, or `null` when the row does not apply. */
export function sharedEdgeFollowsFill(editor: Editor): boolean | "mixed" | null {
  const flags = edgeTargets(editor).map(edgeFollowsFill);
  if (flags.length === 0) return null;
  return flags.every((flag) => flag === flags[0]) ? flags[0] : "mixed";
}

/**
 * The tldraw colour NAME the edge paints, per shape: its meta override when
 * unlinked, else the shape's own `color`.
 *
 * A linked shape reports the fill's name rather than nothing, so the edge
 * swatch is never blank on a shape that plainly has an outline — the same
 * reasoning as the archive's `strokeColorOf` (strokeMeta.ts:170-180).
 */
export function edgeColorFor(shape: TLShape): string | undefined {
  if (!PAINTED_EDGE_SHAPE_TYPES.has(shape.type)) return undefined;
  if (edgeFollowsFill(shape)) return fillColorOf(shape);
  return edgeOverrideOf(shape) ?? fillColorOf(shape);
}

/** One edge colour across the selection, `"mixed"`, or `null` when the row does not apply. */
export function sharedEdgeColor(editor: Editor): string | "mixed" | null {
  const colors = edgeTargets(editor)
    .map(edgeColorFor)
    .filter((color): color is string => color !== undefined);
  if (colors.length === 0) return null;
  return colors.every((color) => color === colors[0]) ? colors[0] : "mixed";
}

function writeMeta(editor: Editor, updates: readonly { shape: TLShape; meta: JsonObject }[]): void {
  if (updates.length === 0) return;
  // Cast: `TLShapePartial` is a discriminated union keyed on a literal `type`;
  // a runtime-widened `shape.type` cannot index it. Same seam and same reason
  // as the archive's src/store/looseShapeUpdates.ts.
  editor.updateShapes(updates.map(({ shape, meta }) => ({ id: shape.id, type: shape.type, meta })) as never);
}

/**
 * Set or clear the link on every selected shape.
 *
 * Relinking (`true`) also copies the current fill colour onto the edge so the
 * change is visible immediately rather than on the next fill edit.
 *
 * Unlinking (`false`) FREEZES the colour the edge is showing right now into
 * meta. WHY that is not optional: `edgeColorFor` falls back to the fill when
 * there is no override, so a shape unlinked with an empty override would
 * carry on following the fill — "unlinked" would be a flag with no effect,
 * which is exactly the silent-orphan failure this file exists to prevent.
 */
export function setEdgeFollowsFill(editor: Editor, follows: boolean): void {
  editor.markHistoryStoppingPoint("edge link");
  editor.run(() => {
    const updates = edgeTargets(editor).flatMap((shape) => {
      const color = follows ? fillColorOf(shape) : edgeColorFor(shape);
      const meta: JsonObject = {
        ...(shape.meta ?? {}),
        [EDGE_FOLLOWS_FILL_META_KEY]: follows,
        ...(color === undefined ? {} : { [EDGE_COLOR_META_KEY]: color }),
      } as JsonObject;
      return [{ shape, meta }];
    });
    writeMeta(editor, updates);
  });
}

/**
 * Write the fill colour, and carry the edge along on every LINKED selected
 * shape. Breaks no link — see the header: the fill is the cheap "make it
 * green" gesture and must never cost the person their edge.
 *
 * The edge meta is written (rather than left to `edgeColorFor`'s fallback) so
 * a later unlink freezes the colour the shape is actually wearing.
 */
export function applyFillColor(editor: Editor, color: string): void {
  editor.markHistoryStoppingPoint("fill colour");
  editor.run(() => {
    const linked = edgeTargets(editor).filter(edgeFollowsFill);
    editor.setStyleForSelectedShapes(DefaultColorStyle as StyleProp<string>, color);
    editor.setStyleForNextShapes(DefaultColorStyle as StyleProp<string>, color);
    writeMeta(
      editor,
      linked.map((shape) => ({
        // Re-read: `setStyleForSelectedShapes` has just replaced the record,
        // and writing `shape.meta` from the stale one would roll its `color`
        // back.
        shape: editor.getShape(shape.id) ?? shape,
        meta: { ...(editor.getShape(shape.id)?.meta ?? shape.meta ?? {}), [EDGE_COLOR_META_KEY]: color } as JsonObject,
      })),
    );
  });
}

/**
 * Write the edge colour and BREAK the link on every selected shape.
 *
 * Setting the edge IS the request for two colours; nothing else unlinks. One
 * history step, so an undo puts both the colour and the link back together.
 */
export function applyEdgeColor(editor: Editor, color: string): void {
  editor.markHistoryStoppingPoint("edge colour");
  editor.run(() => {
    writeMeta(
      editor,
      edgeTargets(editor).map((shape) => ({
        shape,
        meta: {
          ...(shape.meta ?? {}),
          [EDGE_COLOR_META_KEY]: color,
          [EDGE_FOLLOWS_FILL_META_KEY]: false,
        } as JsonObject,
      })),
    );
  });
}
