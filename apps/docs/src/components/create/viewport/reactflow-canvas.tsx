"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo } from "react";
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
import type { FieldValue } from "@bbox-ui/schema";
import type { GlyphSize } from "@bbox-ui/core";
import {
  BBoxGlyphNode,
  GlyphNodeProvider,
  sizeChangeFromDimensions,
  type BBoxGlyphNodeData,
  type BBoxGlyphNodeType,
} from "@bbox-ui/adapter-reactflow";
import type { CanvasPosition, CanvasTransform } from "../contract";

type BenchNodeData = { entry: ComponentEntry; instance: Instance };
type BenchNode = Node<BenchNodeData, "bench">;
type AnyNode = BenchNode | BBoxGlyphNodeType;

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

const nodeTypes = { bench: BenchFlowNode, bboxGlyph: BBoxGlyphNode };

/** The `bboxGlyph` node's own data, built from an instance's props plus its
 *  host-owned rotation — the one place this shape of object is assembled,
 *  so the node-list builder and the resize-clamp below can't disagree
 *  about what a Glyph node's data looks like. */
function glyphDataFor(instance: Instance, transforms: Record<string, CanvasTransform>): BBoxGlyphNodeData {
  const props = instance.props;
  return {
    content: (props.content as string | undefined) ?? "",
    sizePreset: (props.sizePreset as GlyphSize | undefined) ?? "sm",
    size: props.size === undefined ? null : (props.size as number),
    padding: (props.padding as number | undefined) ?? 0,
    rotation: transforms[instance.id]?.rotation ?? 0,
  };
}

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  transforms: Record<string, CanvasTransform>;
  onTransformsChange: (next: Record<string, CanvasTransform>) => void;
  onInstancePropsChange: (id: string, patch: Record<string, FieldValue | undefined>) => void;
}

/**
 * React Flow is a CONTROLLED canvas here: `nodes` is derived from the page's
 * instances, selection and positions on every render, and every change React
 * Flow reports is forwarded up rather than kept. That is what makes a drag
 * here show up in tldraw — the page holds the only copy of the position.
 *
 * A `Glyph` instance rides the real `bboxGlyph` node (`@bbox-ui/adapter-
 * reactflow`) instead of the generic `bench` node every other component
 * still uses — same "route through the real adapter" rule the tldraw tab
 * follows for the same reason (docs/GLYPH-PLAN.md phase 5).
 */
function Canvas(p: Props) {
  const { resolvedTheme } = useTheme();
  const entryFor = useCallback((t: string) => p.entries.find((e) => e.name === t)!, [p.entries]);

  const nodes: AnyNode[] = useMemo(
    () =>
      p.instances.map((instance) => {
        const position = p.positions[instance.id] ?? { x: 0, y: 0 };
        const selected = p.selectedIds.includes(instance.id);
        if (instance.type === "Glyph") {
          return {
            id: instance.id,
            type: "bboxGlyph",
            position,
            selected,
            data: glyphDataFor(instance, p.transforms),
            draggable: true,
          } satisfies BBoxGlyphNodeType;
        }
        return {
          id: instance.id,
          type: "bench",
          position,
          selected,
          data: { entry: entryFor(instance.type), instance },
          draggable: true,
        } satisfies BenchNode;
      }),
    [p.instances, p.positions, p.selectedIds, p.transforms, entryFor],
  );

  // Test hook only — mirrors `tldraw-canvas.tsx`'s own
  // `__bboxCreateTldrawEditor`. Lets a CDP journey read React Flow's raw
  // node array (position, data) directly, rather than parsing a computed
  // CSS transform matrix across the pane's own zoom/pan, to check its
  // painted centre against tldraw's for the same instance.
  useEffect(() => {
    (window as unknown as { __bboxCreateReactFlowNodes?: AnyNode[] }).__bboxCreateReactFlowNodes = nodes;
  }, [nodes]);

  // WHY selection is read from `select` changes and NOT from
  // onSelectionChange: React Flow fires onSelectionChange on mount with an
  // empty set, before it has applied the `selected` flags on the nodes it was
  // given. Forwarding that cleared the page's selection, which rebuilt the
  // nodes, which made React Flow report the flags it had just been handed,
  // which set the page's selection back — "Maximum update depth exceeded".
  // `select` changes in onNodesChange are emitted only for what the USER did
  // (click, shift-click, marquee), so they cannot echo the page's own state.
  const onNodesChange = useCallback(
    (changes: NodeChange<AnyNode>[]) => {
      const moved: Record<string, CanvasPosition> = {};
      let selection: Set<string> | null = null;
      for (const c of changes) {
        if (c.type === "position" && c.position) moved[c.id] = { x: c.position.x, y: c.position.y };
        if (c.type === "select") {
          selection ??= new Set(p.selectedIds);
          if (c.selected) selection.add(c.id);
          else selection.delete(c.id);
        }
        // `NodeResizer`'s drag reaches the page as a `"dimensions"` change,
        // same as an ordinary DOM remeasure — `sizeChangeFromDimensions`
        // (the adapter's own helper) is what tells a completed resize apart
        // from that remeasure (`resizing !== false`) so mounting a node
        // never pins it off its preset (see the helper's own doc comment).
        if (c.type === "dimensions") {
          const inst = p.instances.find((i) => i.id === c.id);
          if (inst && inst.type === "Glyph") {
            const size = sizeChangeFromDimensions(c, glyphDataFor(inst, p.transforms));
            if (size !== null) p.onInstancePropsChange(c.id, { size });
          }
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
    <GlyphNodeProvider value={{ onContentChange: (id, next) => p.onInstancePropsChange(id, { content: next }) }}>
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
    </GlyphNodeProvider>
  );
}

export function ReactFlowCanvas(p: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...p} />
    </ReactFlowProvider>
  );
}
