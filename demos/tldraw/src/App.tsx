import { Tldraw, type Editor } from "tldraw";

import {
  BBoxBlockShapeUtil,
  BBoxPortShapeUtil,
  registerReceivedPortCleanup,
  setPortReceived,
} from "@bbox-ui/adapter-tldraw";
import { sceneToTldrawShapes } from "@bbox-ui/demo-scene/tldraw";

const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil];

// The one shared scene — see demos/scene. Both hosts (and the compare
// harness) render exactly this content, so a visual difference is always
// adapter drift, never content drift.
const { shapes, receivedPorts } = sceneToTldrawShapes();

function handleMount(editor: Editor) {
  (window as { editor?: Editor }).editor = editor;
  // Deleting a shape must drop its runtime `received` flags with it.
  registerReceivedPortCleanup(editor);
  editor.createShapes(shapes);
  // Runtime-only: light ports up as "Data Recived" without ever writing
  // it into the document.
  for (const { shapeId, portId } of receivedPorts) {
    setPortReceived(editor, shapeId, portId, true);
  }
  editor.zoomToFit({ immediate: true });
  editor.updateInstanceState({ isReadonly: false });
}

export function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
    </div>
  );
}
