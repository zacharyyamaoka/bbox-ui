"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { CanvasPosition } from "../contract";

type BenchNodeData = { entry: ComponentEntry; instance: Instance };
type BenchNode = Node<BenchNodeData, "bench">;

/** The node body is the component itself, nothing else: the point of the
 *  tab is "the same instances, now on a canvas", not a card around them. */
function BenchFlowNode({ data, selected }: NodeProps<BenchNode>) {
  return (
    <div
      data-slot="rf-instance"
      data-instance-id={data.instance.id}
      data-selected={selected}
      className="rounded-md p-2 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-ring"
    >
      {data.entry.render(data.instance.props)}
    </div>
  );
}

const nodeTypes = { bench: BenchFlowNode };

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
}

/**
 * React Flow is a CONTROLLED canvas here: `nodes` is derived from the page's
 * instances, selection and positions on every render, and every change React
 * Flow reports is forwarded up rather than kept. That is what makes a drag
 * here show up in tldraw — the page holds the only copy of the position.
 */
function Canvas(p: Props) {
  const { resolvedTheme } = useTheme();
  const entryFor = useCallback((t: string) => p.entries.find((e) => e.name === t)!, [p.entries]);

  const nodes: BenchNode[] = useMemo(
    () =>
      p.instances.map((instance) => ({
        id: instance.id,
        type: "bench",
        position: p.positions[instance.id] ?? { x: 0, y: 0 },
        selected: p.selectedIds.includes(instance.id),
        data: { entry: entryFor(instance.type), instance },
        draggable: true,
      })),
    [p.instances, p.positions, p.selectedIds, entryFor],
  );

  // WHY selection is read from `select` changes and NOT from
  // onSelectionChange: React Flow fires onSelectionChange on mount with an
  // empty set, before it has applied the `selected` flags on the nodes it was
  // given. Forwarding that cleared the page's selection, which rebuilt the
  // nodes, which made React Flow report the flags it had just been handed,
  // which set the page's selection back — "Maximum update depth exceeded".
  // `select` changes in onNodesChange are emitted only for what the USER did
  // (click, shift-click, marquee), so they cannot echo the page's own state.
  const onNodesChange = useCallback(
    (changes: NodeChange<BenchNode>[]) => {
      const moved: Record<string, CanvasPosition> = {};
      let selection: Set<string> | null = null;
      for (const c of changes) {
        if (c.type === "position" && c.position) moved[c.id] = { x: c.position.x, y: c.position.y };
        if (c.type === "select") {
          selection ??= new Set(p.selectedIds);
          if (c.selected) selection.add(c.id);
          else selection.delete(c.id);
        }
      }
      if (Object.keys(moved).length) p.onPositionsChange({ ...p.positions, ...moved });
      if (selection) {
        const next = Array.from(selection).sort();
        if (next.join("|") !== [...p.selectedIds].sort().join("|")) p.onSelectionChange(next);
      }
    },
    [p],
  );

  return (
    <div data-slot="reactflow-canvas" className="relative h-full min-h-0 w-full">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView={false}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectNodesOnDrag
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">React Flow</span>
    </div>
  );
}

export function ReactFlowCanvas(p: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...p} />
    </ReactFlowProvider>
  );
}
