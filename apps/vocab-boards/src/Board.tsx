/**
 * <Board spec={spec} /> — one board, drawn through React Flow.
 *
 * Interaction is off in every dimension: these are figures in a report, not a
 * canvas. Layout is absolute and already computed, so the viewport is pinned at
 * {x:0,y:0,zoom:1} and fitView never runs — the wrapper is exactly the board's
 * own size, so there is no dead canvas around it.
 */
import { ReactFlow, ViewportPortal, type Edge, type Node } from "@xyflow/react";
import { useMemo, type JSX } from "react";
import { EdgeDefs, edgeTypes, type VEdgeData } from "./edge";
import { frameRfId, layout, nodeRfId, nodeTypeOf, type Board as BoardModel } from "./layout";
import { nodeTypes, type VFrameData, type VNodeData } from "./nodes";
import type { Spec } from "./types";

/** Paint order, ported from vocab_board.svg(): frames, then wires, then nodes. */
const Z_FRAME = 0;
const Z_EDGE = 1;
const Z_NODE = 2;

export interface BoardGraph {
  board: BoardModel;
  nodes: Node[];
  edges: Edge[];
}

export function buildGraph(spec: Spec, boardId: string): BoardGraph {
  const board = layout(spec);
  const nodes: Node[] = [];

  // Frames first in the array AND lowest in z: a `subsystem` frame is an opaque
  // #0c1520 fill, so a frame painted over the edge layer would swallow every
  // wire inside it.
  for (const f of board.frames) {
    if (!f.box) continue;
    const [x, y, w, h] = f.box;
    const data: VFrameData = { f, handles: board.handles.get(frameRfId(f.id)) ?? [] };
    nodes.push({
      id: frameRfId(f.id),
      type: "vframe",
      position: { x, y },
      width: w,
      height: h,
      measured: { width: w, height: h },
      handles: (board.handles.get(frameRfId(f.id)) ?? []).map((q) => ({
        id: q.id,
        type: q.type,
        position: q.position as never,
        x: q.x,
        y: q.y,
        width: 0,
        height: 0,
      })),
      zIndex: Z_FRAME,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      data: data as unknown as Record<string, unknown>,
      style: { width: w, height: h },
      className: "vb-frame-node",
    });
  }

  for (const n of board.nodes) {
    const hs = board.handles.get(nodeRfId(n.id)) ?? [];
    const data: VNodeData = { n, handles: hs };
    nodes.push({
      id: nodeRfId(n.id),
      type: nodeTypeOf(n, board.flow),
      position: { x: n.x, y: n.y },
      width: n.w,
      height: n.h,
      measured: { width: n.w, height: n.h },
      // WHY the handles are declared as well as rendered: the declaration is
      // what lets an edge have correct geometry on the FIRST paint, before any
      // measurement. It is NOT the source of truth — measured 2026-09-23
      // against @xyflow/react 12.11.6, the ResizeObserver re-measures from the
      // DOM and the DOM wins (inflating these widths to 6 moved nothing;
      // moving the handle ELEMENT 6px moved every wire, and scripts/verify.mjs
      // caught it). That is fine precisely because every handle element is 0x0
      // at its anchor, so the measurement reproduces the declaration exactly —
      // but do not "simplify" board.css's zero-size rule on the belief that
      // this array is holding the geometry up.
      handles: hs.map((q) => ({
        id: q.id,
        type: q.type,
        position: q.position as never,
        x: q.x,
        y: q.y,
        width: 0,
        height: 0,
      })),
      zIndex: Z_NODE,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      data: data as unknown as Record<string, unknown>,
      style: { width: n.w, height: n.h },
    });
  }

  const defs = `vb-${boardId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const edges: Edge[] = board.wires.map((w) => {
    const data: VEdgeData = {
      kind: w.kind,
      label: w.t,
      dash: w.dash,
      tb: board.flow === "tb",
      defs,
    };
    return {
      id: w.id,
      type: "vedge",
      source: w.a1.owner,
      target: w.b1.owner,
      sourceHandle: w.a1.handle,
      targetHandle: w.b1.handle,
      zIndex: Z_EDGE,
      selectable: false,
      focusable: false,
      interactionWidth: 0,
      data: data as unknown as Record<string, unknown>,
    };
  });

  return { board, nodes, edges };
}

export function Board({
  spec,
  boardId,
  graph,
}: {
  spec: Spec;
  boardId: string;
  graph?: BoardGraph;
}): JSX.Element {
  const g = useMemo(() => graph ?? buildGraph(spec, boardId), [graph, spec, boardId]);
  const defs = `vb-${boardId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return (
    <div
      className="vb-board"
      data-board-id={boardId}
      style={{ width: g.board.W, height: g.board.H }}
    >
      <ReactFlow
        nodes={g.nodes}
        edges={g.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        fitView={false}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        autoPanOnConnect={false}
        autoPanOnNodeDrag={false}
        disableKeyboardA11y
        proOptions={{ hideAttribution: true }}
      >
        <ViewportPortal>
          <EdgeDefs prefix={defs} />
        </ViewportPortal>
      </ReactFlow>
    </div>
  );
}
