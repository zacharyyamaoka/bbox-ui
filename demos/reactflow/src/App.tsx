import { Background, ReactFlow } from "@xyflow/react";

import { BBoxBlockNode, BBoxPortNode } from "@bbox-ui/adapter-reactflow";
import {
  sceneToReactFlowEdges,
  sceneToReactFlowNodes,
} from "@bbox-ui/demo-scene/reactflow";

import { CodeFieldDemo } from "./CodeFieldDemo";
import { CodeFieldHostNode } from "./CodeFieldHostNode";

const nodeTypes = {
  bboxBlock: BBoxBlockNode,
  bboxStandalonePort: BBoxPortNode,
  codeFieldHost: CodeFieldHostNode,
};

// A real in-host mount (finding 6): the `codeFieldHost` node carries a
// `CodeField`, and `codeFieldCover` is a later, overlapping plain node —
// proving the completion popup paints above it (it's portalled outside the
// RF pane's own transformed layer, not fighting RF's node z-order at all).
const codeFieldHostNodes = [
  {
    id: "code-field-host",
    type: "codeFieldHost" as const,
    position: { x: 0, y: 620 },
    data: { value: "t: P" },
  },
  {
    id: "code-field-cover",
    type: "default" as const,
    position: { x: 40, y: 660 },
    data: { label: "" },
    style: { width: 220, height: 80, background: "var(--color-muted, #eee)", zIndex: 1000 },
    draggable: false,
    selectable: false,
  },
];

// The one shared scene — see demos/scene. Both hosts (and the compare
// harness) render exactly this content, so a visual difference is always
// adapter drift, never content drift.
//
// This is the INTERACTIVE React Flow surface, so blocks opt into the
// adapter's NodeResizer — parity with stock tldraw resizing a bbox-block.
// The compare panes never set `resizable`: they are read-only by design
// (linked cameras + divergence measurement assume no interaction).
const nodes = [
  ...sceneToReactFlowNodes().map((node) =>
    node.type === "bboxBlock"
      ? { ...node, data: { ...node.data, resizable: true } }
      : node,
  ),
  ...codeFieldHostNodes,
];
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
      <CodeFieldDemo />
    </div>
  );
}
