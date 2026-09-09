import { Background, ReactFlow } from "@xyflow/react";

import { BBoxBlockNode, BBoxPortNode } from "@bbox-ui/adapter-reactflow";
import {
  sceneToReactFlowEdges,
  sceneToReactFlowNodes,
} from "@bbox-ui/demo-scene/reactflow";

const nodeTypes = { bboxBlock: BBoxBlockNode, bboxStandalonePort: BBoxPortNode };

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

export function App() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
