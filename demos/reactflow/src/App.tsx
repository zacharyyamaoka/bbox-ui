import { Background, Panel, ReactFlow, useReactFlow } from "@xyflow/react";

import {
  applyBlockNodeView,
  BBoxBlockNode,
  BBoxPortNode,
  type BBoxBlockData,
} from "@bbox-ui/adapter-reactflow";
import { BLOCK_VIEWS, BLOCK_VIEW_LABELS, type BlockView } from "@bbox-ui/core";
import {
  sceneToReactFlowEdges,
  sceneToReactFlowNodes,
} from "@bbox-ui/demo-scene/reactflow";
import { SkinPicker } from "@bbox-ui/demo-scene/SkinPicker";
import { TraceEdge } from "@bbox-ui/demo-scene/TraceEdge";

const nodeTypes = { bboxBlock: BBoxBlockNode, bboxStandalonePort: BBoxPortNode };
const edgeTypes = { bboxTrace: TraceEdge };

// The one shared scene — see demos/scene. Both hosts (and the compare
// harness) render exactly this content, so a visual difference is always
// adapter drift, never content drift.
//
// This is the INTERACTIVE React Flow surface, so blocks opt into the
// adapter's NodeResizer — parity with stock tldraw resizing a bbox-block.
// The compare panes never set `resizable`: they are read-only by design
// (linked cameras + divergence measurement assume no interaction).
const nodes = sceneToReactFlowNodes().map((node) =>
  node.type === "bboxBlock"
    ? { ...node, data: { ...node.data, resizable: true } }
    : node,
);
const edges = sceneToReactFlowEdges();

/**
 * Dev-only view switcher: applies a Block view to every bbox block on the
 * canvas through `applyBlockNodeView`, mirroring w/h into node style per
 * the adapter's explicit-size contract.
 *
 * WHY it exists here: parkViewSize is host wiring — nothing else in this
 * demo would ever exercise "resize in one view, switch away and back, the
 * exact box returns" in a real browser. The scene itself stays legacy
 * (no `view`) until a button is pressed, so the compare harness and
 * demos/drive.mjs see today's pixels untouched.
 */
function ViewToolbar() {
  const { setNodes } = useReactFlow();
  const apply = (view: BlockView) =>
    setNodes((current) =>
      current.map((node) => {
        if (node.type !== "bboxBlock") return node;
        const data = applyBlockNodeView(node.data as BBoxBlockData, view);
        return {
          ...node,
          data,
          // WHY width/height are ALSO set top-level: a NodeResizer drag
          // writes the node's explicit `width`/`height` (v12's node-level
          // dimensions), which outrank `style` when both exist — mirroring
          // only into style left the dragged box painted after a switch.
          width: data.w,
          height: data.h,
          style: { ...node.style, width: data.w, height: data.h },
        };
      }),
    );
  return (
    <Panel position="top-left" style={{ display: "flex", gap: 4 }}>
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
    </Panel>
  );
}

export function App() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <ViewToolbar />
      </ReactFlow>
      {/* Outside <ReactFlow>, and that is the point: it stamps one
          attribute on <html>, so every bbox node inside the flow re-skins
          without this demo, the node components, or
          @bbox-ui/adapter-reactflow changing a single line. */}
      <SkinPicker />
    </div>
  );
}
