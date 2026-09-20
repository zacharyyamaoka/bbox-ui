// src/chrome/dock.tsx — the toolbar, mounted as `components.Toolbar`.
//
// This is `@trunk/components/toolDock` — the trunk's own FigJam-style dock —
// with tldraw wired into its four seams: which tool is live, which geo variant
// it is showing, what a press should arm, and where the remembered member is
// stored. The dock imports no engine; this file is the whole adapter. The
// archive mounted its own toolbar in the same slot
// (tests/test_stock_boundary.py:38, `Toolbar: SystemSketchFigmaToolbar`), so
// replacing the Toolbar is a seam tldraw documents, not a fork of its chrome.
import { useCallback, useMemo } from "react";
import {
  ArrowShapeKindStyle,
  GeoShapeGeoStyle,
  useEditor,
  useValue,
  type Editor,
  type TLArrowShape,
  type TLUiToolsContextType,
} from "tldraw";

import { ToolDock, type FamilyDeclaration, type SimpleToolItem } from "@trunk/components/toolDock";
import {
  arrowPresetForActivation,
  arrowPresetFromToolId,
  arrowPresetToolId,
  type ArrowPreset,
} from "@trunk/components/toolPreferences";

import { SYSTEM_FAMILY_ITEMS } from "../shapes/registry";
import { ARROW_PRESET_SECTION, DRAW_TOOLS, GEO_VARIANTS, GEO_VARIANT_IDS, LINE_TOOLS, SIMPLE_TOOLS } from "./families";
import {
  arrowPresetOf,
  getDockPreferences,
  rehydrateDockPreferences,
  updateDockPreferences,
  useDockPreferences,
} from "./preferences";

/**
 * THE headline of this rebuild. Zach, 2026-09-18, looking at
 * `Pasted image 20260918201649.png` (which showed two rows of tool icons — the
 * original SystemSketch family and the older bbox family): "Get rid of both of
 * those and instead lets just have the 1 icon."
 *
 * So there is exactly ONE family for everything this app adds to tldraw, and
 * no second `bbox` family — src/document/stockBoundary.test.ts greps this file
 * for both so the split cannot quietly come back.
 *
 * Its rows are `SYSTEM_FAMILY_ITEMS`, flat-mapped from the kits, which is what
 * lets L1/L2/L3/L5 add Code, Port, Loop and Branch by shipping their own
 * directory without touching the dock, the registry or App.tsx.
 */
const SYSTEM_FAMILY: FamilyDeclaration = {
  id: "system",
  label: "System design",
  sections: [{ items: SYSTEM_FAMILY_ITEMS }],
  prefKey: "lastSystemTool",
  isMember: (toolId) => SYSTEM_FAMILY_ITEMS.some((item) => item.id === toolId),
};

/**
 * The shape family, rebuilt whenever the remembered arrow preset changes.
 *
 * `line` names one shape; `geo` and `arrow` never do — exactly the split
 * `resolveCurrentTool`'s cases 1 and 2 exist for. Geo's live member is a real
 * tldraw style (`GeoShapeGeoStyle`); the arrow's is NOT (Straight and Curved
 * are both `kind: "arc"` in tldraw), so `variantOf` closes over the
 * REMEMBERED preset instead — the case toolDock.tsx's own `variantOf` WHY
 * describes, and the donor's `current = arrow-${lastArrowPreset}`
 * (SystemSketchToolbar.tsx:307).
 */
function shapeFamily(lastArrowPreset: ArrowPreset): FamilyDeclaration {
  return {
    id: "shape",
    label: "Shape",
    sections: [{ heading: "Shapes", items: GEO_VARIANTS }, { heading: "Lines", items: LINE_TOOLS }, ARROW_PRESET_SECTION],
    prefKey: "lastShapeTool",
    isMember: (toolId) => LINE_TOOLS.some((tool) => tool.id === toolId),
    variantOf: (activeToolId, activeVariant) => {
      if (activeToolId === "geo") return activeVariant;
      if (activeToolId === "arrow") return arrowPresetToolId(lastArrowPreset);
      return undefined;
    },
  };
}

const DRAW_FAMILY: FamilyDeclaration = {
  id: "draw",
  label: "Draw",
  sections: [{ items: DRAW_TOOLS }],
  prefKey: "lastDrawTool",
  isMember: (toolId) => DRAW_TOOLS.some((tool) => tool.id === toolId),
};

/* ------------------------------------------------------------------ */
/* The arrow preset — multi-press A                                    */
/* ------------------------------------------------------------------ */

/** Donor toolbarIntegration.ts:46 — the bend a Curve preset draws with. */
export const CURVE_ARROW_BEND = 32;

/**
 * A preset, expressed in stock tldraw — the arrow half of the donor's
 * `applyArrowPreset` (toolbarIntegration.ts:98-103). tldraw stores Straight
 * and Curved both as `kind: "arc"` (Straight is `bend: 0`, the default), and
 * Elbow as its own kind, so the next-shape STYLE carries elbow-vs-arc and the
 * create handler in `installArrowPresets` carries Curved's bend.
 *
 * Deliberately NOT ported: the donor's second half, which set the same
 * routing on the next data edge through its own `ConnectionRoutingStyle`.
 * This app's `ss-wire` keeps `routing` as a plain prop with no StyleProp
 * (shapes/wire/WireShapeUtil.tsx) and defaults it to elbow, so a fresh
 * install already agrees; making A steer wires too is a wire-kit change.
 */
function applyArrowPreset(editor: Editor, preset: ArrowPreset): void {
  editor.setStyleForNextShapes(ArrowShapeKindStyle, preset === "elbow" ? "elbow" : "arc");
}

/** Remember and apply in one step — A, a face press and a popout row all
 *  pick a preset through here, so the face, the key and the next arrow can
 *  never disagree. `lastShapeTool` follows too, so the face keeps showing the
 *  arrow after the tool lets go (donor toolbarIntegration.ts:254-257). */
function armArrowPreset(editor: Editor, preset: ArrowPreset): void {
  updateDockPreferences({ lastArrowPreset: preset, lastShapeTool: arrowPresetToolId(preset) });
  applyArrowPreset(editor, preset);
}

/**
 * The `A` binding: tldraw's OWN arrow tool entry, kbd and all, with one step
 * in front of its `onSelect` — mounted through `TLUiOverrides.tools` in
 * src/App.tsx, the seam the donor used (toolbarIntegration.ts:249-261).
 *
 * WHY wrap the stock entry rather than bind a second `a`: Zach, 2026-09-19 —
 * "Please add the excalidraw interaction of multi pressing A to cycle through
 * arrow types. Please refer to the old system sketch to see how this was
 * implemented." The old app wrapped it, and a wrapped entry keeps everything
 * tldraw hangs off it (the kbd, drag-from-toolbar, the menus that list
 * tools) while a second binding would race the first.
 *
 * WHY "advance only while the arrow tool is live, otherwise re-arm": drawing
 * an arrow hands tldraw back to the select tool, and the next A should give
 * you the SAME arrow again — cycling is for choosing, re-arming is for
 * drawing another. A plain "every A advances" would change the arrow under
 * you after every one you drew. `arrowPresetForActivation` is the trunk's
 * port of exactly that rule, and a fresh app lands on elbow ("by default
 * elbow arrows should always be used", same day).
 */
export function withArrowPresetCycle(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType {
  const stock = tools.arrow;
  if (!stock) return tools;
  return {
    ...tools,
    arrow: {
      ...stock,
      onSelect(source) {
        const preset = arrowPresetForActivation(editor.getCurrentToolId(), arrowPresetOf(getDockPreferences()));
        armArrowPreset(editor, preset);
        return stock.onSelect(source);
      },
    },
  };
}

/**
 * Mount-time half of the preset, returned as its own stop function (the
 * same contract as a kit's `install`):
 *
 *   1. re-read the stored preferences, so a reload honours what was saved;
 *   2. seed tldraw's next-shape style from the remembered preset — without
 *      it the app would only agree with the dock after the first A, because
 *      `stylesForNextShape` rides tldraw's own persisted instance state
 *      (donor `applyStoredArrowPreset`, toolbarIntegration.ts:141-152);
 *   3. give an arrow the ARROW TOOL is drawing Curved's bend. Only that
 *      arrow: `arrow.pointing` is the stock state that creates it, so a
 *      pasted, duplicated or programmatic arrow is left exactly as it came
 *      (donor `prepareCreatedShapeForToolbarPreset`, :154-186).
 */
export function installArrowPresets(editor: Editor): () => void {
  rehydrateDockPreferences();
  applyArrowPreset(editor, arrowPresetOf(getDockPreferences()));
  return editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
    if (shape.type !== "arrow" || !editor.isIn("arrow.pointing")) return shape;
    if (arrowPresetOf(getDockPreferences()) !== "curve") return shape;
    const arrow = shape as TLArrowShape;
    return { ...arrow, props: { ...arrow.props, kind: "arc", bend: CURVE_ARROW_BEND } };
  });
}

/* ------------------------------------------------------------------ */
/* The dock                                                            */
/* ------------------------------------------------------------------ */

export function SystemSketchDock() {
  const editor = useEditor();
  const preferences = useDockPreferences();
  const lastArrowPreset = arrowPresetOf(preferences);
  const families = useMemo<readonly FamilyDeclaration[]>(
    () => [SYSTEM_FAMILY, shapeFamily(lastArrowPreset), DRAW_FAMILY],
    [lastArrowPreset],
  );

  const activeToolId = useValue("ss current tool", () => editor.getCurrentToolId(), [editor]);
  // The LIVE sub-variant of the geo family; every other family ignores it.
  const activeVariant = useValue("ss geo style", () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor]);

  const selectTool = useCallback(
    (toolId: string) => {
      // An arrow row is not a tool id either: it names a PRESET of the one
      // `arrow` tool. Arm it (remember + style) and switch — no cycling here;
      // only the A key advances.
      const preset = arrowPresetFromToolId(toolId);
      if (preset) {
        armArrowPreset(editor, preset);
        editor.setCurrentTool("arrow");
        return;
      }
      // A geo variant is not a tool id: set the style first, then arm `geo` —
      // which is how tldraw itself expresses "draw an ellipse next".
      if (GEO_VARIANT_IDS.has(toolId)) {
        editor.setStyleForNextShapes(GeoShapeGeoStyle, toolId as never);
        editor.setCurrentTool("geo");
        return;
      }
      editor.setCurrentTool(toolId);
    },
    [editor],
  );

  const simpleTools: SimpleToolItem[] = SIMPLE_TOOLS.map((tool) => ({
    ...tool,
    active: activeToolId === tool.id,
    onSelect: () => editor.setCurrentTool(tool.id),
  }));

  return (
    // WHY the wrapper: tldraw's UI layer is `.tlui-layout { pointer-events:
    // none }` and every stock panel opts back IN through its own class
    // (`.tlui-main-toolbar { pointer-events: all }`, tldraw.css:2946). Mounting
    // a custom `components.Toolbar` replaces `DefaultToolbar` wholesale, so
    // nothing opts this dock in and every press lands on the canvas behind it
    // — measured as Playwright refusing the click with "<div
    // class=tl-background> … intercepts pointer events". The centring and
    // the bottom gap mirror `.tlui-main-toolbar--horizontal` so the dock sits
    // where tldraw's own toolbar would.
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: "calc(var(--tl-space-3) + var(--tl-sab))",
        pointerEvents: "all",
      }}
    >
      <ToolDock
        activeToolId={activeToolId}
        activeVariant={activeVariant}
        families={families}
        simpleTools={simpleTools}
        preferences={preferences}
        onPreferencesChange={updateDockPreferences}
        // Press-arms-then-menu-keeps-focus: the face fires `onArm` with the tool
        // it is currently SHOWING, off the same press that opens its popout.
        onArm={selectTool}
        onSelectItem={selectTool}
        testIdPrefix="ss-dock"
      />
    </div>
  );
}
