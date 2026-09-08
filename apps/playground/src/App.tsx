import { useCallback, useMemo, useRef, useState } from "react";
import { Tldraw, type Editor, type TLUiStylePanelProps } from "tldraw";

import {
  BBoxBlockShapeUtil,
  BBoxBlockTool,
  BBoxPortShapeUtil,
  BBoxPortTool,
} from "@bbox-ui/adapter-tldraw";
import { CompareView } from "@bbox-ui/compare-view";
import {
  CONFIGURED_SHAPE_UTILS,
  HelperButtonsWithTuning,
  Inspector,
  MenuPanelWithName,
  NATIVE_PANEL_CHROME,
  SettingsDialogVariant,
  readStoredThemes,
  useGestures,
} from "@bbox-ui/inspector";
import {
  sceneFromEditor,
  type SceneExtraction,
} from "@bbox-ui/demo-scene/fromEditor";

import { PlaygroundContextMenu } from "./toolbar/DetachContextMenu";
import { PlaygroundToolbar } from "./toolbar/PlaygroundToolbar";
import { playgroundUiOverrides } from "./toolbar/overrides";

// CONFIGURED_SHAPE_UTILS first: it carries the styling lab's configured stock
// utils (the `meta.primitiveOverride` paint seam plus the rounded-rect
// geometry) and the untouched remainder of tldraw's defaults; the bbox-ui
// primitives join the same list. tldraw resolves duplicates by type with the
// custom util winning, so the configured stock utils replace the defaults.
const shapeUtils = [
  ...CONFIGURED_SHAPE_UTILS,
  BBoxBlockShapeUtil,
  BBoxPortShapeUtil,
];
const tools = [BBoxBlockTool, BBoxPortTool];

declare global {
  interface Window {
    /**
     * The authoring editor, under its own name. `window.editor` is the
     * compare harness's contract and the compare pane claims it on mount, so
     * a driver that needs the board it can draw on must not race for it.
     */
    playgroundEditor?: Editor;
  }
}

/**
 * The ⇄ Compare entry, styled with the inspector cluster's own chrome so the
 * trio (Compare · Stock check · drawer tab) reads as one native unit.
 *
 * WHY this no longer lives in `components.SharePanel`: the lab's own
 * adversarial-judge round found that anything mounted there is a real flow
 * SIBLING stacked above `DefaultStylePanel` in tldraw's top-right column — it
 * pushed the stock panel from y:8 to y:34. The button now rides the
 * Inspector's `position: fixed` control cluster (`extraControls`), which
 * tldraw never lays out, so the style panel keeps the exact position a bare
 * mount puts it in.
 */
function CompareButton({ onCompare }: { onCompare(): void }) {
  return (
    <button
      type="button"
      data-testid="playground-compare"
      title="Compare this board across React Flow and tldraw"
      onClick={onCompare}
      className={`pointer-events-auto flex h-6 shrink-0 cursor-pointer items-center px-2 font-semibold hover:bg-[var(--tl-color-hint)] ${NATIVE_PANEL_CHROME}`}
    >
      ⇄ Compare
    </button>
  );
}

/**
 * The editable playground: stock tldraw plus toolbar access to the bbox-ui
 * primitives, wearing the styling lab's chrome — the Figma-shaped right
 * inspector (`StylePanel`), the V3 main menu (File + a real Settings dialog),
 * the board name beside the hamburger, and the wheel-gesture bindings those
 * settings tune. Unlike demos/tldraw — which stays a deterministic read-only
 * pane for the compare harness — this canvas persists what you draw
 * (`persistenceKey`), so a sketch survives a reload.
 *
 * The Compare button (top right, in the inspector's control cluster) runs the
 * React Flow ⟷ tldraw comparison over whatever is on the board right now: the
 * live shapes are projected into the host-neutral Scene (`sceneFromEditor`)
 * and handed to the same CompareView the fixed harness uses.
 *
 * WHY the compare panes get a SECOND, read-only tldraw seeded from the
 * derived scene instead of this authoring editor: the authoring board must
 * not be disturbed, and the camera bridge was calibrated against a
 * read-only pane — reusing the live editor would put interaction and
 * culling into the comparison.
 */
export function App() {
  const editorRef = useRef<Editor | null>(null);
  const [extraction, setExtraction] = useState<SceneExtraction | null>(null);
  // Held in state, not just the ref: `useGestures` is a hook and must re-run
  // when the editor actually exists, which a ref cannot signal.
  const [editor, setEditor] = useState<Editor | null>(null);
  useGestures(editor);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setEditor(editor);
    window.playgroundEditor = editor;
    (window as { editor?: Editor }).editor = editor;
  }, []);

  const enterCompare = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // A snapshot at entry: compare mode reads the board, never follows it.
    setExtraction(sceneFromEditor(editor));
  }, []);

  const exitCompare = useCallback(() => {
    setExtraction(null);
    // The compare pane took window.editor on mount; hand it back.
    if (editorRef.current) {
      (window as { editor?: Editor }).editor = editorRef.current;
    }
  }, []);

  // The Theme tab's persisted palette, read once — a fresh object identity
  // every render would re-register themes on each paint.
  const themes = useMemo(() => readStoredThemes(), []);

  // WHY useMemo: tldraw remounts its UI when the components object's
  // identity changes; a fresh object every render would reset open menus.
  const components = useMemo(
    () => ({
      Toolbar: PlaygroundToolbar,
      ContextMenu: PlaygroundContextMenu,
      StylePanel: function PlaygroundStylePanel(props: TLUiStylePanelProps) {
        return (
          <Inspector
            {...props}
            extraControls={<CompareButton onCompare={enterCompare} />}
          />
        );
      },
      MainMenu: SettingsDialogVariant,
      // The board name rides in the MENU zone, beside the hamburger — see
      // MenuPanelWithName's own WHY for why TopPanel was the wrong slot.
      MenuPanel: MenuPanelWithName,
      // The live-tuning HUD rides in a slot that is always mounted and never
      // blocks the canvas — see TuningPanel's own WHY.
      HelperButtons: HelperButtonsWithTuning,
    }),
    [enterCompare],
  );

  return (
    <div className="bbox-playground-app" style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        persistenceKey="bbox-playground"
        shapeUtils={shapeUtils}
        tools={tools}
        overrides={playgroundUiOverrides}
        components={components}
        themes={themes}
        onMount={handleMount}
      />
      {extraction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
          <CompareView
            scene={extraction.scene}
            provenance={extraction}
            onExit={exitCompare}
          />
        </div>
      )}
    </div>
  );
}
