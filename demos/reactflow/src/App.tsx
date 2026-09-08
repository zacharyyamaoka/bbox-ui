import { Background, ReactFlow, type Edge } from "@xyflow/react";

import {
  BBoxBlockNode,
  type BBoxBlockNodeType,
} from "@bbox-ui/adapter-reactflow";

const nodeTypes = { bboxBlock: BBoxBlockNode };

/* An inline SVG filling the Glyph text slot — the slot takes any node. */
const cameraIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M16 10l6-3v10l-6-3" />
  </svg>
);

const nodes: BBoxBlockNodeType[] = [
  {
    id: "camera",
    type: "bboxBlock",
    position: { x: 0, y: 40 },
    data: {
      title: "Camera",
      blockType: "Source",
      description: "async computation",
      icon: cameraIcon,
      ports: [
        {
          id: "frame",
          direction: "output",
          state: "wired",
          label: "frame",
          textLayout: "left",
          t: 0.72,
        },
      ],
    },
  },
  {
    id: "detect",
    type: "bboxBlock",
    position: { x: 560, y: 0 },
    data: {
      title: "Detect",
      blockType: "dataflow",
      description: "blackbox modelling",
      icon: "🔍",
      tag: "Draft 1",
      ports: [
        {
          id: "image",
          direction: "input",
          state: "wired",
          label: "image",
          textLayout: "right",
          t: 0.35,
        },
        {
          id: "threshold",
          direction: "input",
          state: "default",
          label: "threshold",
          textLayout: "right-offset",
          t: 0.7,
        },
        {
          id: "boxes",
          direction: "output",
          state: "wired",
          label: "boxes",
          textLayout: "left",
          t: 0.62,
        },
      ],
    },
  },
  {
    id: "track",
    type: "bboxBlock",
    position: { x: 1120, y: 40 },
    data: {
      title: "Track",
      ports: [
        {
          id: "detections",
          direction: "input",
          state: "received",
          label: "detections",
          textLayout: "right",
          t: 0.35,
        },
        {
          id: "config",
          direction: "input",
          state: "empty",
          label: "config",
          textLayout: "right",
          t: 0.7,
        },
        { id: "tracks", direction: "output", state: "empty" },
      ],
    },
  },
  {
    id: "clock",
    type: "bboxBlock",
    position: { x: 560, y: 420 },
    data: {
      title: "cm_clock",
      blockType: "Clock",
      icon: "⏱",
      orientation: "vertical",
      titleSize: "lg",
      ports: [
        { id: "tick", direction: "output", state: "empty", label: "tick", textLayout: "left" },
      ],
    },
  },
];

const edges: Edge[] = [
  {
    id: "camera-detect",
    source: "camera",
    sourceHandle: "frame",
    target: "detect",
    targetHandle: "image",
  },
  {
    id: "detect-track",
    source: "detect",
    sourceHandle: "boxes",
    target: "track",
    targetHandle: "detections",
  },
];

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
