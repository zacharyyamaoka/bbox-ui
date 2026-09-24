// src/appearance/stockPaintOverrides.ts — the seam that makes the canvas
// actually paint what `./strokeMeta.ts` and `./paintLink.ts` store.
//
// Both models keep their value in shape `meta` rather than in a `StyleProp`,
// so that a `.tldr` written here still opens in plain tldraw (the reasoning
// lives in those two headers). The price of that choice is that tldraw does
// not read `meta` when it paints — `getCustomDisplayValues` is the sanctioned
// place to tell it to. Its result is merged OVER the util's own
// `getDefaultDisplayValues` (tldraw 5.3.2
// `lib/shapes/shared/getDisplayValues.mjs:10-13`), so returning nothing leaves
// the shape exactly stock, which is what every untouched shape does here.
//
// These utils keep their stock `type` ids on purpose: `<Tldraw shapeUtils>`
// merges through `mergeArraysAndReplaceDefaults("type", custom, defaults)`
// (@tldraw/utils 5.3.2 `lib/array.mjs:70-81`), so a util named `geo` REPLACES
// tldraw's geo rather than sitting beside it. Nothing else about the shape —
// schema, tool, migrations, geometry, editing — changes.
//
// WHY the edge colour is emitted only when the link is BROKEN: while a shape's
// edge follows its fill, tldraw's own default already paints exactly the right
// colour from `props.color`. Re-emitting it would be a second implementation
// of a value the engine already computes, and would quietly override any
// variant choice a stock util makes for its own outline. Silence is the
// stronger statement: "we have nothing to add here."
//
// Provenance (docs/ALGORITHM-PROVENANCE.md): modelled on the archived app's
// /home/bam/systemsketch/src/stockPrimitiveVisuals.ts — the configure-and-
// register pattern (:213-279), the geo resolution order and the
// `strokeRoundness` rule that rides with the width (:180-211) — and on
// /home/bam/systemsketch/src/systemSketchArrow.tsx:900-906, which is where the
// arrow gets the same one-line thickness override.
import {
  ArrowShapeUtil,
  DrawShapeUtil,
  GeoShapeUtil,
  LineShapeUtil,
  getColorValue,
  type TLAnyShapeUtilConstructor,
  type TLShape,
  type TLTheme,
} from "tldraw";

import { edgeColorFor, edgeFollowsFill } from "./paintLink";
import { strokeWidthDisplay } from "./strokeMeta";

/** The resolved outline colour an UNLINKED shape asks for, or nothing. */
function edgeColorDisplay(
  shape: TLShape,
  theme: TLTheme,
  colorMode: "dark" | "light",
): { strokeColor: string } | undefined {
  if (edgeFollowsFill(shape)) return undefined;
  const name = edgeColorFor(shape);
  if (name === undefined) return undefined;
  // `getColorValue` is tldraw's own palette resolver and returns the input
  // untouched when it is already a literal colour, so a custom hex survives.
  return { strokeColor: getColorValue(theme.colors[colorMode], name, "solid") };
}

/**
 * `strokeRoundness` rides with the width because tldraw defines it as
 * `strokeWidth * 2` (`lib/shapes/geo/GeoShapeUtil.mjs:110`). Left behind, a
 * `draw`-dashed outline would round its corners for a width it is no longer
 * drawn at. Archive stockPrimitiveVisuals.ts:201-210.
 */
const PaintedGeoShapeUtil = GeoShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape, theme, colorMode) => {
    const width = strokeWidthDisplay(shape);
    return {
      ...(width === undefined ? {} : { strokeWidth: width.strokeWidth, strokeRoundness: width.strokeWidth * 2 }),
      ...edgeColorDisplay(shape, theme, colorMode),
    };
  },
});

const PaintedDrawShapeUtil = DrawShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape, theme, colorMode) => ({
    ...strokeWidthDisplay(shape),
    ...edgeColorDisplay(shape, theme, colorMode),
  }),
});

const PaintedLineShapeUtil = LineShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape, theme, colorMode) => ({
    ...strokeWidthDisplay(shape),
    ...edgeColorDisplay(shape, theme, colorMode),
  }),
});

/**
 * The arrow's arrowheads are sized from its own `strokeWidth`, so overriding
 * it here scales the heads with the line rather than leaving them behind.
 * Archive systemSketchArrow.tsx:904.
 */
const PaintedArrowShapeUtil = ArrowShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape, theme, colorMode) => ({
    ...strokeWidthDisplay(shape),
    ...edgeColorDisplay(shape, theme, colorMode),
  }),
});

/**
 * Registered by `src/shapes/registry.ts`. Each entry replaces the stock util
 * of the same `type`; a board that never touched either control is painted
 * byte-identically to stock tldraw.
 */
export const STOCK_PAINT_SHAPE_UTILS: readonly TLAnyShapeUtilConstructor[] = [
  PaintedGeoShapeUtil,
  PaintedDrawShapeUtil,
  PaintedLineShapeUtil,
  PaintedArrowShapeUtil,
];
