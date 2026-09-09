import { createShapeId, Tldraw, type Editor } from "tldraw";

import {
  BBoxBlockShapeUtil,
  BBoxPortShapeUtil,
  registerReceivedPortCleanup,
  setPortReceived,
} from "@bbox-ui/adapter-tldraw";
import { sceneToTldrawShapes } from "@bbox-ui/demo-scene/tldraw";

import { CodeFieldDemo } from "./CodeFieldDemo";
import { CodeFieldHostShapeUtil } from "./CodeFieldHostShapeUtil";

const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil, CodeFieldHostShapeUtil];

// The one shared scene — see demos/scene. Both hosts (and the compare
// harness) render exactly this content, so a visual difference is always
// adapter drift, never content drift.
const { shapes, receivedPorts } = sceneToTldrawShapes();

function handleMount(editor: Editor) {
  (window as { editor?: Editor }).editor = editor;
  // Deleting a shape must drop its runtime `received` flags with it.
  const unregisterCleanup = registerReceivedPortCleanup(editor);
  editor.createShapes(shapes);
  // Runtime-only: light ports up as "Data Recived" without ever writing
  // it into the document.
  for (const { shapeId, portId } of receivedPorts) {
    setPortReceived(editor, shapeId, portId, true);
  }
  // A real in-host mount (finding 6): `code-field-host` carries a
  // `CodeField`, and the geo rectangle right after it is a LATER,
  // overlapping shape — proving the completion popup paints above it.
  // `.tl-container` opts every CodeField under it into tldraw-aware
  // tooltip parenting (the documented pattern — see codeField.tsx's
  // `tooltipParent`/`[data-tooltip-host]`), outside the canvas's own
  // transformed layer so the z-index in codeField.css can actually win.
  editor.getContainer().setAttribute("data-tooltip-host", "true");
  editor.createShapes([
    { id: createShapeId("code-field-host"), type: "code-field-host", x: 0, y: 900 },
    {
      id: createShapeId("code-field-cover"),
      type: "geo",
      x: 40,
      y: 940,
      props: { geo: "rectangle", w: 220, h: 80, fill: "solid", color: "grey" },
    },
  ]);
  editor.zoomToFit({ immediate: true });
  editor.updateInstanceState({ isReadonly: false });
  // WHY the teardown is returned: onMount can run twice on one editor
  // (React StrictMode in dev); without the unsubscribe each pass stacks
  // another delete handler.
  return () => unregisterCleanup();
}

export function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw shapeUtils={shapeUtils} onMount={handleMount} />
      <CodeFieldDemo />
    </div>
  );
}
