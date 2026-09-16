"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useUpdateNodeInternals,
  useViewport,
  type Dimensions,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import { priorSelectionForRootPress } from "@bbox-ui/panel";
import type { FieldValue } from "@bbox-ui/schema";
import type { GlyphSize, PortEdgeId } from "@bbox-ui/core";
import {
  BBoxGlyphNode,
  GlyphNodeProvider,
  sizeChangeFromDimensions,
  type BBoxGlyphNodeData,
  type BBoxGlyphNodeType,
} from "@bbox-ui/adapter-reactflow";
import type { CanvasPosition, CanvasTransform } from "../contract";
import { renderInstance, type EditBundle } from "../render-instance";
import { HostZoomContext } from "../port-dnd";

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

type MovePort = (blockId: string, portIds: string[], edge: PortEdgeId, target: { index: number } | { t: number }) => void;
type BenchNodeData = {
  entries: ComponentEntry[];
  byId: Map<string, Instance>;
  instance: Instance;
  selectedIds: string[];
  onSelectInstance: (id: string, additive: boolean) => void;
  edit: EditBundle;
  onMovePort?: MovePort;
  highlightSlots: boolean;
};
type BenchNode = Node<BenchNodeData, "bench">;
type AnyNode = BenchNode | BBoxGlyphNodeType;

/** The node body is the component itself, nothing else: the point of the
 *  tab is "the same instances, now on a canvas", not a card around them.
 *  Members are drawn inside it by `renderInstance`; a pointer-down on one
 *  selects the member and is stopped before React Flow selects the node.
 *
 *  `HostZoomContext` is provided here from React Flow's own live
 *  `useViewport().zoom` (Zach's 2026-09-12 model: dnd-kit owns every Port
 *  drag in every host) — `PortDndProvider` (mounted inside `renderInstance`,
 *  one per Block) portals its `DragOverlay` to `document.body` and scales
 *  the ghost by this zoom (`adjustScale`, see portDnd.tsx), so the dragged
 *  dot both tracks the pointer 1:1 and renders at the same apparent size
 *  as the Port it was grabbed from, at any zoom level. `useViewport`
 *  re-renders this node on every zoom/pan tick, same cost React Flow
 *  already pays for the node's own transform. */
function BenchFlowNode({ data, selected }: NodeProps<BenchNode>) {
  const { zoom } = useViewport();
  return (
    <div
      data-slot="rf-instance"
      data-instance-id={data.instance.id}
      data-selected={selected}
      // See dom-preview.tsx: no rounded-* under the selection outline, and
      // bbox-accent (this app's real blue) instead of the neutral ring token.
      className="p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-[color:var(--bbox-accent)]"
    >
      <HostZoomContext.Provider value={zoom}>
        {renderInstance(data.entries, data.byId, data.instance, data.selectedIds, data.onSelectInstance, data.edit, false, data.onMovePort, data.highlightSlots)}
      </HostZoomContext.Provider>
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
  roots: Instance[];
  onSelectInstance: (id: string, additive: boolean) => void;
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  transforms: Record<string, CanvasTransform>;
  onTransformsChange: (next: Record<string, CanvasTransform>) => void;
  onInstancePropsChange: (id: string, patch: Record<string, FieldValue | undefined>) => void;
  edit: EditBundle;
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  Absent means this render is not yet wired for it (matches
   *  `ViewportProps.onMovePort` and `dom-preview.tsx`'s own optional prop). */
  onMovePort?: MovePort;
  highlightSlots: boolean;
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
  const byId = useMemo(() => new Map(p.instances.map((i) => [i.id, i])), [p.instances]);
  // WHY: see bareAreaSelect.ts's own doc comment (verify-round-4, F2) — the
  // set of ids React Flow actually gave a NODE to, so a leftover MEMBER id
  // (added directly by render-instance.tsx's member wrapper, which bypasses
  // React Flow entirely — no host has a node for a member) can never
  // survive a union with a freshly root-clicked id below.
  const rootIdSet = useMemo(() => new Set(p.roots.map((r) => r.id)), [p.roots]);

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

  const updateNodeInternals = useUpdateNodeInternals();

  // Wraps the page's `onMovePort` so a drop also tells React Flow to
  // refresh this node's internals — `blockId` here IS the node id (one
  // root instance per node), so any Handle a future Port grows would
  // otherwise keep stale coordinates after an auto-mode reflow moves it
  // to a different lane/order without the node itself resizing.
  const onMovePort = useMemo<MovePort | undefined>(() => {
    if (!p.onMovePort) return undefined;
    const move = p.onMovePort;
    return (blockId, portIds, edge, target) => {
      move(blockId, portIds, edge, target);
      updateNodeInternals(blockId);
    };
  }, [p.onMovePort, updateNodeInternals]);

  const nodes: AnyNode[] = useMemo(
    () =>
      p.roots.map((instance) => {
        const position = p.positions[instance.id] ?? { x: 0, y: 0 };
        const selected = p.selectedIds.includes(instance.id);
        // WHY a Glyph node deliberately carries no `measured`, unlike every
        // bench node above: `BBoxGlyphNode` writes its own explicit
        // `width`/`height` into React Flow's store on mount
        // (`updateNode`, glyph-node.tsx) — it is the one node here that is
        // authoritatively sized rather than content-measured, so feeding it
        // a remembered DOM measurement would put a second, competing answer
        // next to the resizer's own.
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
          data: { entries: p.entries, byId, instance, selectedIds: p.selectedIds, onSelectInstance: p.onSelectInstance, edit: p.edit, onMovePort, highlightSlots: p.highlightSlots },
          draggable: true,
          measured: measuredRef.current[instance.id],
        } satisfies BenchNode;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredRef is
    // a ref (stable identity); `forceMeasuredTick` is read only to re-run
    // this memo the one time a node's first-ever measurement arrives.
    [p.roots, p.positions, p.selectedIds, p.transforms, p.entries, byId, p.onSelectInstance, p.edit, onMovePort, p.highlightSlots, forceMeasuredTick],
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
      let firstMeasurement = false;
      for (const c of changes) {
        if (c.type === "position" && c.position) moved[c.id] = { x: c.position.x, y: c.position.y };
        if (c.type === "select") {
          // WHY `priorSelectionForRootPress` and not `new Set(p.selectedIds)`
          // (verify-round-4, F2 — see bareAreaSelect.ts): after a member is
          // selected directly (bypassing React Flow, which has no node for
          // one), `p.selectedIds` can hold an id no node's `selected` flag
          // was ever derived from. Folding a fresh root click into the RAW
          // previous selection then UNIONS the two instead of replacing —
          // clicking a Block's bare padding produced a mixed
          // [Block, TextBox] selection instead of the Block alone. Starting
          // from only the ids React Flow still recognizes as a root's own
          // node drops that leftover before the union ever happens, while a
          // genuine multi-root selection (two Blocks shift-selected) is
          // untouched, since both survive the filter.
          selection ??= new Set(priorSelectionForRootPress(p.selectedIds, (id) => rootIdSet.has(id)));
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
        // The SAME `"dimensions"` change carries a completed NodeResizer
        // drag on a Glyph. WHY both branches run rather than one `else`:
        // the block above is bookkeeping every node needs (see measuredRef),
        // while `sizeChangeFromDimensions` is the adapter's own guard that
        // tells a finished resize (`resizing === false`) apart from an
        // ordinary remeasure — mounting a node must never pin it off its
        // size preset (the helper's own doc comment).
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
      // Only re-render for a node's FIRST measurement (unblocks
      // `nodeHasDimensions` once); every later resize already flows through
      // `measuredRef` the next time something else re-renders this canvas,
      // and re-rendering on every subsequent pixel of resize would fight
      // React Flow's own internal measurement loop for no visible gain.
      if (firstMeasurement) forceMeasuredTick((n) => n + 1);
    },
    [p, rootIdSet],
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
        // A test seam, matching the one tldraw-canvas.tsx already exposes
        // (`window.__bboxEditor`): a port drag has to be proved at a camera
        // zoom other than 1, and React Flow ships no zoom control here to
        // click. `zoomTo` from the journey is deterministic where a synthetic
        // wheel gesture is not.
        onInit={(instance) => {
          (window as unknown as { __bboxReactFlow?: unknown }).__bboxReactFlow = instance;
        }}
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
