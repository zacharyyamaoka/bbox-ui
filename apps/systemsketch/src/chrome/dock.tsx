// src/chrome/dock.tsx — the toolbar, mounted as `components.Toolbar`.
//
// This is `@trunk/components/toolDock` — the trunk's own FigJam-style dock —
// with tldraw wired into its four seams: which tool is live, which geo variant
// it is showing, what a press should arm, and where the remembered member is
// stored. The dock imports no engine; this file is the whole adapter. The
// archive mounted its own toolbar in the same slot
// (tests/test_stock_boundary.py:38, `Toolbar: SystemSketchFigmaToolbar`), so
// replacing the Toolbar is a seam tldraw documents, not a fork of its chrome.
import { useCallback, useState } from "react";
import { GeoShapeGeoStyle, useEditor, useValue } from "tldraw";

import { ToolDock, type FamilyDeclaration, type SimpleToolItem } from "@trunk/components/toolDock";

import { SYSTEM_FAMILY_ITEMS } from "../shapes/registry";
import { DRAW_TOOLS, GEO_VARIANTS, GEO_VARIANT_IDS, LINE_TOOLS, SIMPLE_TOOLS } from "./families";
import { loadPreferences, savePreferences, type DockPreferences } from "./preferences";

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

const SHAPE_FAMILY: FamilyDeclaration = {
  id: "shape",
  label: "Shape",
  sections: [
    { heading: "Shapes", items: GEO_VARIANTS },
    { heading: "Lines", items: LINE_TOOLS },
  ],
  prefKey: "lastShapeTool",
  // `line` and `arrow` each name one shape; `geo` never does — exactly the
  // split `resolveCurrentTool`'s cases 1 and 2 exist for.
  isMember: (toolId) => LINE_TOOLS.some((tool) => tool.id === toolId),
  variantOf: (activeToolId, activeVariant) => (activeToolId === "geo" ? activeVariant : undefined),
};

const DRAW_FAMILY: FamilyDeclaration = {
  id: "draw",
  label: "Draw",
  sections: [{ items: DRAW_TOOLS }],
  prefKey: "lastDrawTool",
  isMember: (toolId) => DRAW_TOOLS.some((tool) => tool.id === toolId),
};

const FAMILIES: readonly FamilyDeclaration[] = [SYSTEM_FAMILY, SHAPE_FAMILY, DRAW_FAMILY];

export function SystemSketchDock() {
  const editor = useEditor();
  const [preferences, setPreferences] = useState<DockPreferences>(loadPreferences);

  const activeToolId = useValue("ss current tool", () => editor.getCurrentToolId(), [editor]);
  // The LIVE sub-variant of the geo family; every other family ignores it.
  const activeVariant = useValue("ss geo style", () => editor.getStyleForNextShape(GeoShapeGeoStyle), [editor]);

  const selectTool = useCallback(
    (toolId: string) => {
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
        families={FAMILIES}
        simpleTools={simpleTools}
        preferences={preferences}
        onPreferencesChange={(next) => {
          setPreferences(next);
          savePreferences(next);
        }}
        // Press-arms-then-menu-keeps-focus: the face fires `onArm` with the tool
        // it is currently SHOWING, off the same press that opens its popout.
        onArm={selectTool}
        onSelectItem={selectTool}
        testIdPrefix="ss-dock"
      />
    </div>
  );
}
