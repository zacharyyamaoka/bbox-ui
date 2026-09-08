import { useCallback, useMemo, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";

import {
  BBoxBlockShapeUtil,
  BBoxBlockTool,
  BBoxPortShapeUtil,
  BBoxPortTool,
} from "@bbox-ui/adapter-tldraw";
import { CompareView } from "@bbox-ui/compare-view";
import {
  sceneFromEditor,
  type SceneExtraction,
} from "@bbox-ui/demo-scene/fromEditor";

import { PlaygroundContextMenu } from "./toolbar/DetachContextMenu";
import { PlaygroundToolbar } from "./toolbar/PlaygroundToolbar";
import { playgroundUiOverrides } from "./toolbar/overrides";

const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil];
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
 * The editable playground: stock tldraw plus toolbar access to the bbox-ui
 * primitives. Unlike demos/tldraw — which stays a deterministic read-only
 * pane for the compare harness — this canvas persists what you draw
 * (`persistenceKey`), so a sketch survives a reload.
 *
 * The Compare button (top right) runs the React Flow ⟷ tldraw comparison
 * over whatever is on the board right now: the live shapes are projected
 * into the host-neutral Scene (`sceneFromEditor`) and handed to the same
 * CompareView the fixed harness uses.
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

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
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

  // WHY useMemo: tldraw remounts its UI when the components object's
  // identity changes; a fresh object every render would reset open menus.
  const components = useMemo(
    () => ({
      Toolbar: PlaygroundToolbar,
      ContextMenu: PlaygroundContextMenu,
      SharePanel: () => (
        <div style={{ pointerEvents: "all", padding: 8 }}>
          <button
            data-testid="playground-compare"
            title="Compare this board across React Flow and tldraw"
            onClick={enterCompare}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⇄ Compare
          </button>
        </div>
      ),
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
