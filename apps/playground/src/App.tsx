import { Tldraw, type Editor } from "tldraw";

import {
  BBoxBlockShapeUtil,
  BBoxBlockTool,
  BBoxPortShapeUtil,
  BBoxPortTool,
} from "@bbox-ui/adapter-tldraw";

import { PlaygroundToolbar } from "./toolbar/PlaygroundToolbar";
import { playgroundUiOverrides } from "./toolbar/overrides";

const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil];
const tools = [BBoxBlockTool, BBoxPortTool];
const components = { Toolbar: PlaygroundToolbar };

function handleMount(editor: Editor) {
  (window as { editor?: Editor }).editor = editor;
}

/**
 * The editable playground: stock tldraw plus toolbar access to the bbox-ui
 * primitives. Unlike demos/tldraw — which stays a deterministic read-only
 * pane for the compare harness — this canvas persists what you draw
 * (`persistenceKey`), so a sketch survives a reload.
 */
export function App() {
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
    </div>
  );
}
