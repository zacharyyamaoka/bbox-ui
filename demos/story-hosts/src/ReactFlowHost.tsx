import "@xyflow/react/dist/style.css";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
} from "@xyflow/react";

/**
 * T0 SPIKE node: unlike the real `bboxBlock` node (packages/adapter-reactflow),
 * this one carries no bbox-ui knowledge at all — its whole body is whatever
 * `data.content` holds. That is deliberate: the question this spike answers
 * is "can an arbitrary story mount inside a real custom node", not "does the
 * Port node look right in React Flow" (proven already, see demos/reactflow).
 */
type StoryNodeData = { content: ReactNode };
type StoryNode = Node<StoryNodeData, "storySpike">;

function StoryFlowNode({ data }: NodeProps<StoryNode>) {
  return (
    <div
      data-slot="story-flow-node"
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--border, #999)",
        background: "var(--card, white)",
      }}
    >
      {data.content}
    </div>
  );
}

const nodeTypes = { storySpike: StoryFlowNode };

/**
 * The React Flow host — mounts a real <ReactFlow> canvas with ONE custom
 * node whose body is the story. Copies the mounting shape of
 * demos/reactflow/src/App.tsx, minus the shared SCENE (there is no scene
 * here, only the one story node).
 */
export function ReactFlowHost({ children }: { children: ReactNode }) {
  const nodes: StoryNode[] = useMemo(
    () => [
      {
        id: "story-node",
        type: "storySpike",
        position: { x: 0, y: 0 },
        data: { content: children },
        draggable: true,
      },
    ],
    [children],
  );

  return (
    <div data-host="reactflow" style={{ width: "100%", height: 420 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.4 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
