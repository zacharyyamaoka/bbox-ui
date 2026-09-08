import { Background, ReactFlow } from "@xyflow/react";

import { BBoxBlockNode } from "@bbox-ui/adapter-reactflow";
import {
  sceneToReactFlowEdges,
  sceneToReactFlowNodes,
} from "@bbox-ui/demo-scene/reactflow";

const nodeTypes = { bboxBlock: BBoxBlockNode };

// The one shared scene — see demos/scene. Both hosts (and the compare
// harness) render exactly this content, so a visual difference is always
// adapter drift, never content drift.
const nodes = sceneToReactFlowNodes();
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
