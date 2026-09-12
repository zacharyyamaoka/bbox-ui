"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Dimensions,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { CanvasPosition } from "../contract";
import { renderInstance, type EditBundle } from "../render-instance";

// WHY this exact string and nothing fancier: it is the SAME class
// `TextBoxControl` already puts on its `<input>`/`<textarea>`
// (packages/bbox-ui/src/textBox.tsx) — the host-neutral marker
// docs/TEXTBOX-EDITING-SPEC.md §1 asks the core to emit once and every host
// to gate on in its own vocabulary. React Flow gates DRAG and WHEEL by class
// name via a `hasSelector` walk that is scoped to each node's own subtree
// (installed @xyflow/system 0.0.82 index.js:2038-2048), so naming it here for
// those two is the whole integration; no per-host CSS. PAN is different —
// see `noPanClassName` below, deliberately left at React Flow's own default.
const BBOX_INTERACTIVE = "bbox-interactive";

type BenchNodeData = { entries: ComponentEntry[]; byId: Map<string, Instance>; instance: Instance; selectedIds: string[]; onSelectInstance: (id: string, additive: boolean) => void; edit: EditBundle };
type BenchNode = Node<BenchNodeData, "bench">;

/** The node body is the component itself, nothing else: the point of the
 *  tab is "the same instances, now on a canvas", not a card around them.
 *  Members are drawn inside it by `renderInstance`; a pointer-down on one
 *  selects the member and is stopped before React Flow selects the node. */
function BenchFlowNode({ data, selected }: NodeProps<BenchNode>) {
  return (
    <div
      data-slot="rf-instance"
      data-instance-id={data.instance.id}
      data-selected={selected}
      className="rounded-md p-2 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-ring"
    >
      {renderInstance(data.entries, data.byId, data.instance, data.selectedIds, data.onSelectInstance, data.edit)}
    </div>
  );
}

const nodeTypes = { bench: BenchFlowNode };

interface Props {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  onSelectInstance: (id: string, additive: boolean) => void;
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  edit: EditBundle;
}

/**
 * React Flow is a CONTROLLED canvas here: `nodes` is derived from the page's
 * instances, selection and positions on every render, and every change React
 * Flow reports is forwarded up rather than kept. That is what makes a drag
 * here show up in tldraw — the page holds the only copy of the position.
 */
function Canvas(p: Props) {
  const { resolvedTheme } = useTheme();
  const byId = useMemo(() => new Map(p.instances.map((i) => [i.id, i])), [p.instances]);

  // WHY a ref, fed by `dimensions` changes, rather than trusting React
  // Flow's own internal measurement to persist on its own: this canvas is
  // CONTROLLED (see the doc comment below) — `nodes` is a FRESH array of
  // FRESH objects every render, built from the page's own state. Installed
  // @xyflow/system 0.0.82's `adoptUserNodes` (index.js:1692-1731) only
  // carries a node's measured size forward when the incoming node object is
  // REFERENCE-EQUAL to the one it measured last time; a new object every
  // render fails that check, so it re-derives `measured` from OUR node
  // (which never had one) and gets `{width: undefined, height: undefined}`
  // — back to unmeasured. `nodeHasDimensions` then reads false and
  // `NodeWrapper` paints `visibility: hidden` on the very node whose control
  // is trying to `autoFocus` (docs/TEXTBOX-EDITING-SPEC.md DoD steps 3-6;
  // visibility:hidden makes a subtree unfocusable, so the focus silently no-
  // ops). Feeding the last known size back in as `measured` on our OWN node
  // object breaks that reset: `parseHandles` (index.js:1639-1641) then stops
  // returning `undefined` for `handleBounds` too, so
  // `getNodeInlineStyleDimensions` (index.js:2044-2054) stays on its
  // "already measured" branch and never locks the box to a guessed width —
  // the node keeps sizing to its own content, unchanged from before.
  const measuredRef = useRef<Record<string, Dimensions>>({});
  const [, forceMeasuredTick] = useState(0);

  const nodes: BenchNode[] = useMemo(
    () =>
      p.roots.map((instance) => ({
        id: instance.id,
        type: "bench",
        position: p.positions[instance.id] ?? { x: 0, y: 0 },
        selected: p.selectedIds.includes(instance.id),
        data: { entries: p.entries, byId, instance, selectedIds: p.selectedIds, onSelectInstance: p.onSelectInstance, edit: p.edit },
        draggable: true,
        measured: measuredRef.current[instance.id],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredRef is
    // a ref (stable identity); `forceMeasuredTick` is read only to re-run
    // this memo the one time a node's first-ever measurement arrives.
    [p.roots, p.positions, p.selectedIds, p.entries, byId, p.onSelectInstance, p.edit, forceMeasuredTick],
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
      let firstMeasurement = false;
      for (const c of changes) {
        if (c.type === "position" && c.position) moved[c.id] = { x: c.position.x, y: c.position.y };
        if (c.type === "select") {
          selection ??= new Set(p.selectedIds);
          if (c.selected) selection.add(c.id);
          else selection.delete(c.id);
        }
        // WHY captured here instead of ignored: React Flow reports every
        // ResizeObserver measurement as a `dimensions` change on
        // `onNodesChange` — this is the documented way a CONTROLLED flow is
        // meant to receive them (there is no other callback for it). See the
        // long comment on `measuredRef` above for why simply letting these
        // pass unread breaks focus on the very frame it matters.
        if (c.type === "dimensions" && c.dimensions) {
          const had = measuredRef.current[c.id];
          measuredRef.current = { ...measuredRef.current, [c.id]: c.dimensions };
          if (!had) firstMeasurement = true;
        }
      }
      if (Object.keys(moved).length) p.onPositionsChange({ ...p.positions, ...moved });
      if (selection) {
        const next = Array.from(selection).sort();
        if (next.join("|") !== [...p.selectedIds].sort().join("|")) p.onSelectionChange(next);
      }
      // Only re-render for a node's FIRST measurement (unblocks
      // `nodeHasDimensions` once); every later resize already flows through
      // `measuredRef` the next time something else re-renders this canvas,
      // and re-rendering on every subsequent pixel of resize would fight
      // React Flow's own internal measurement loop for no visible gain.
      if (firstMeasurement) forceMeasuredTick((n) => n + 1);
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
        // WHY noDragClassName/noWheelClassName but deliberately NOT
        // noPanClassName: a drag that starts on an editing TextBox's
        // <input> must move the caret, not the node (noDragClassName), and
        // its wheel-zoom must not eat a textarea's scroll either
        // (noWheelClassName) — docs/TEXTBOX-EDITING-SPEC.md §3.
        //
        // `noPanClassName` looks like the natural third member of that list
        // (the spec names all three), but it is NOT scoped to "elements
        // inside a node" the way the other two are — installed
        // `@xyflow/react` 12.11.6's `NodeWrapper` (index.js:2348-2349)
        // paints `noPanClassName` onto every draggable node's OWN root
        // element, unconditionally, as part of how it tells its pan/zoom
        // pane "don't pan out from under a node". Passing the SAME string
        // for `noDragClassName` and `noPanClassName` means every node root
        // carries `.bbox-interactive` too — and `@xyflow/system` 0.0.82's
        // drag filter (index.js:2038-2048, used at :2352) walks from the
        // press's target UP TO AND INCLUDING that root looking for the
        // class, so it always finds it on the root itself and refuses to
        // start ANY drag, even one that starts on a node's own bare
        // padding with no member underneath it at all. Leaving
        // `noPanClassName` unset (React Flow's own default, `"nopan"`) is
        // the fix: it still gates the pan/marquee pane the same way stock
        // React Flow always has, decoupled from our own interactive
        // marker, so `noDragClassName`'s walk no longer finds a false
        // match on the node root. Measured: with both props set to the
        // same string, dragging a node's own padding moved it 0px;
        // unsetting `noPanClassName` alone restored normal node dragging
        // with no change to how the editing control is protected.
        noDragClassName={BBOX_INTERACTIVE}
        noWheelClassName={BBOX_INTERACTIVE}
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
