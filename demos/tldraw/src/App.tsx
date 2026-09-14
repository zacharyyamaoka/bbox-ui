import { useState } from "react";
import { Tldraw, type Editor } from "tldraw";

import {
  applyBlockShapeView,
  BBoxBlockShapeUtil,
  BBoxPortShapeUtil,
  registerReceivedPortCleanup,
  setPortReceived,
  type BBoxBlockShape,
} from "@bbox-ui/adapter-tldraw";
import { BLOCK_VIEWS, BLOCK_VIEW_LABELS, type BlockView } from "@bbox-ui/core";
import { sceneToTldrawShapes } from "@bbox-ui/demo-scene/tldraw";

const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil];

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
  editor.zoomToFit({ immediate: true });
  editor.updateInstanceState({ isReadonly: false });
  // WHY the teardown is returned: onMount can run twice on one editor
  // (React StrictMode in dev); without the unsubscribe each pass stacks
  // another delete handler.
  return () => unregisterCleanup();
}

/**
 * Dev-only view switcher: applies a Block view to every bbox block through
 * `applyBlockShapeView`.
 *
 * WHY it exists here: parkViewSize is host wiring — nothing else in this
 * demo would ever exercise "resize in one view, switch away and back, the
 * exact box returns" in a real browser. The scene itself stays legacy
 * (view: null) until a button is pressed, so the compare harness and
 * demos/drive.mjs see today's pixels untouched.
 */
function ViewToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const apply = (view: BlockView) => {
    const blocks = editor
      .getCurrentPageShapes()
      .filter((shape): shape is BBoxBlockShape => shape.type === "bbox-block");
    editor.updateShapes(
      blocks.map((shape) => ({
        id: shape.id,
        type: shape.type,
        props: applyBlockShapeView(shape.props, view),
      })),
    );
  };
  return (
    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 300, display: "flex", gap: 4 }}>
      {BLOCK_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          data-view-button={view}
          onClick={() => apply(view)}
          style={{ padding: "4px 10px", border: "1px solid #999", borderRadius: 4, background: "white", cursor: "pointer" }}
        >
          {BLOCK_VIEW_LABELS[view]}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(mounted) => {
          setEditor(mounted);
          return handleMount(mounted);
        }}
      />
      <ViewToolbar editor={editor} />
    </div>
  );
}
