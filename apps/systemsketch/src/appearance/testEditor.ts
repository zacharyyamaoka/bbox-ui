// src/appearance/testEditor.ts — a real tldraw `Editor`, in node, for the
// appearance model's unit tests. TEST-ONLY: nothing in the running app imports
// it (it is not a `*.test.ts`, so the `unit` project does not collect it as a
// suite either).
//
// WHY a real Editor rather than a fixture: every claim these tests make is
// about what STOCK tldraw does — that one `size` rung moves both the outline
// and the label, that `scale` multiplies stroke width, that `props.color`
// paints the edge. A hand-rolled fake would be a second implementation of the
// thing under test, and it would agree with the implementation by
// construction. `feedback_independent_oracle`: the oracle has to be
// independent, and here the engine IS the oracle.
//
// WHY the utils are merged the way they are: `<Tldraw>` composes its own
// props with `mergeArraysAndReplaceDefaults("type", custom, defaults)`
// (@tldraw/utils 5.3.2 `lib/array.mjs:70-81`), and the `Editor` constructor
// does NOT — it takes the final list. So this helper reproduces that merge
// exactly, which is what makes a test that exercises `SHAPE_UTILS` a test of
// the app's real registration rather than of a list that only exists here.
import {
  Editor,
  createTLStore,
  defaultBindingUtils,
  defaultShapeTools,
  defaultShapeUtils,
  defaultTools,
  type TLAnyBindingUtilConstructor,
  type TLAnyShapeUtilConstructor,
} from "tldraw";

import { BINDING_UTILS, SHAPE_UTILS, TOOLS } from "../shapes/registry";

function mergeByType<T extends { type: string }>(custom: readonly T[], defaults: readonly T[]): T[] {
  const overridden = new Set(custom.map((entry) => entry.type));
  return [...defaults.filter((entry) => !overridden.has(entry.type)), ...custom];
}

/** Exactly the shape utils `<Tldraw shapeUtils={SHAPE_UTILS}>` ends up running. */
export const MERGED_SHAPE_UTILS: TLAnyShapeUtilConstructor[] = mergeByType(
  SHAPE_UTILS as readonly (TLAnyShapeUtilConstructor & { type: string })[],
  defaultShapeUtils as readonly (TLAnyShapeUtilConstructor & { type: string })[],
);

const MERGED_BINDING_UTILS: TLAnyBindingUtilConstructor[] = mergeByType(
  BINDING_UTILS as readonly (TLAnyBindingUtilConstructor & { type: string })[],
  defaultBindingUtils as readonly (TLAnyBindingUtilConstructor & { type: string })[],
);

/** A live editor over an empty board. Every test gets its own. */
export function makeTestEditor(): Editor {
  const store = createTLStore({ shapeUtils: MERGED_SHAPE_UTILS, bindingUtils: MERGED_BINDING_UTILS });
  return new Editor({
    store,
    shapeUtils: MERGED_SHAPE_UTILS,
    bindingUtils: MERGED_BINDING_UTILS,
    tools: [...defaultTools, ...defaultShapeTools, ...TOOLS],
    getContainer: () => document.body,
  });
}

/**
 * The display values the REGISTERED util produces for this shape — i.e. what
 * the canvas is about to paint with. Read through `editor.getShapeUtil` on
 * purpose: a test that called `./stockPaintOverrides.ts` directly would pass
 * even if `src/shapes/registry.ts` never registered it.
 */
export function paintedDisplayValues(editor: Editor, shapeId: Parameters<Editor["getShape"]>[0]): Record<string, unknown> {
  const shape = editor.getShape(shapeId);
  if (!shape) throw new Error(`no shape ${String(shapeId)}`);
  const util = editor.getShapeUtil(shape) as unknown as {
    options: {
      getDefaultDisplayValues(...args: never[]): Record<string, unknown>;
      getCustomDisplayValues(...args: never[]): Record<string, unknown>;
    };
  };
  const theme = editor.getCurrentTheme();
  const colorMode = editor.getColorMode();
  const args = [editor, shape, theme, colorMode] as unknown as never[];
  return {
    ...util.options.getDefaultDisplayValues(...args),
    ...util.options.getCustomDisplayValues(...args),
  };
}
