/**
 * Scene → React Flow. Type-only imports from the adapter and engine keep
 * this converter from dragging React Flow into a bundle that only wants the
 * neutral scene or the tldraw side.
 */
import type { Edge } from "@xyflow/react";
import type { BBoxBlockNodeType } from "@bbox-ui/adapter-reactflow";

import { SCENE } from "./scene";

export function sceneToReactFlowNodes(): BBoxBlockNodeType[] {
  return SCENE.blocks.map((block) => ({
    id: block.id,
    type: "bboxBlock" as const,
    position: { x: block.x, y: block.y },
    data: {
      title: block.title,
      titleSize: block.titleSize,
      blockType: block.blockType,
      description: block.description,
      icon: block.icon,
      tag: block.tag,
      orientation: block.orientation,
      ports: block.ports.map((port) => ({
        id: port.id,
        direction: port.direction,
        // WHY: node data is React state, not a document — the runtime-only
        // "received" paint may live here without ever being persisted.
        state: port.receivedAtRuntime ? ("received" as const) : port.state,
        size: port.size,
        label: port.label === "" ? undefined : port.label,
        textLayout: port.textLayout,
        t: port.t,
      })),
    },
  }));
}

export function sceneToReactFlowEdges(): Edge[] {
  return SCENE.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
  }));
}
