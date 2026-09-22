// src/hosts/reactFlowHost.tsx — the React Flow host: the same scene record
// the DOM host renders, handed to a real viewport engine.
//
// There is deliberately NO translation layer here. `scene.reactflow.test.ts`
// proves a `SceneNode`/`SceneEdge` assigns to `@xyflow/react`'s `Node`/
// `Edge` with no cast, so `scene.nodes`/`scene.edges` hand straight to
// `<ReactFlow>`. The one thing this host ADDS to a node before handing it
// over is `dragHandle` — pure interaction geometry, which is host-owned by
// the repo's core rule and therefore belongs exactly here, never in the
// scene record.
//
// Gesture ownership (ARCHITECTURE.md "Where an interaction belongs"):
// bounded by one component's box → the component's (dnd-kit rails, the
// CodeMirror caret); spanning the canvas → this host's (node drag, pan,
// zoom). The boundary is drawn with two stock React Flow mechanisms and
// zero custom event code:
//   1. `dragHandle: '[data-slot="block-header"]'` on block nodes — a node
//      drag can only START on the header, so a pointerdown on a port rail
//      belongs to dnd-kit alone (H4's "the host must not steal the
//      gesture").
//   2. `POINTER_OWNED_CLASS` ("nodrag", React Flow's own default
//      `noDragClassName`) on pointer-owning internals without a header
//      refuge — the Code face, the Value capsule's editor. React Flow's
//      drag filter rejects any press under that class natively.
// SystemSketch resolves the same fight on tldraw with
// `editor.markEventAsHandled` per surface (memberStackDnd.tsx:44-46,485) —
// host-specific mechanism, same boundary; see POINTER_OWNED_CLASS's doc.

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeDimensionChange,
  type NodeProps,
  type ReactFlowState,
  type Viewport,
} from "@xyflow/react";
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { TraceBody } from "../components/trace";
import { DEFAULT_TRACE_ROUTING, type Point, type TraceRouting } from "../components/trace.layout";
import { ResolvedWireTrace, resolveWires, type ResolvedWire, type ResolvedWires, type WireSpace } from "../components/wireLayer";
import type { Wire } from "../components/wiring";
import { ancestorsOf } from "../scene/region";
import { portKey } from "../scene/scene";
import { sceneWires, type WireStyleData } from "../scene/sceneWires";
import { topLevelNodes, type HostScene } from "./hostScene";
import type { OpaqueRegionView } from "../scene/regionView";
import { producerCountsOf, SceneNodeView, wiredPortsOf, type Decorate } from "./nodeViews";
import { projectHostScene, regionViewMap } from "./regionScene";
import { sightPortDots } from "./portDotSightings";
import { usePortVariant } from "../skin/portVariants";

/* ------------------------------------------------------------------ */
/* Scene context — how the node renderer reaches the record             */
/* ------------------------------------------------------------------ */

/** React Flow hands a custom node only its own props; the renderer needs
 *  the scene (members via `childrenOf`, wired state, the write-back seam),
 *  so the host provides it by context — the same one-way flow as every
 *  other adapter, just threaded past React Flow's own render boundary. */
const HostSceneContext = createContext<{
  scene: HostScene;
  wired: ReadonlySet<string>;
  /** `producerCountsOf(projected.scene)` — see `SceneNodeViewProps.producers`. */
  producers: ReadonlyMap<string, number>;
  onSceneChange?(next: HostScene): void;
  resizable?: boolean;
  decorate?: Decorate;
  /** The opaque projection's cards — see `SceneNodeViewProps.regionViews`. */
  regionViews?: ReadonlyMap<string, OpaqueRegionView>;
} | null>(null);

/* ------------------------------------------------------------------ */
/* Measured handles — the host measures; the scene contains              */
/* ------------------------------------------------------------------ */

interface MeasuredHandle {
  portId: string;
  /**
   * The `<Handle id>` React Flow resolves an edge end against — the port id
   * for this node's OWN dots (so every handle that existed before member
   * sighting keeps its name), `portKey(memberId, portId)` for a member's.
   * `portDotSightings.ts` mints it; this host only carries it through.
   */
  handleId: string;
  /** Node-local px (unscaled — divided back out of the viewport zoom). */
  x: number;
  y: number;
  side: Position;
}

const POSITION_FOR_EDGE: Record<string, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/* ------------------------------------------------------------------ */
/* The node's OWN drag handle — not a member's, wherever it renders     */
/* ------------------------------------------------------------------ */

/** Stamped onto exactly one element per top-level node: its OWN header,
 *  never a member's. See `OwnDragHandleMarker` below for why this exists
 *  at all — a plain `[data-slot="block-header"]` selector cannot tell the
 *  two apart. */
const OWN_DRAG_HANDLE_ATTR = "data-rf-own-header";

/** Same ownership reading as `portDotSightings.ts`'s `dotOwnedBy` /
 *  `WireLayer.resolveDot`: a header belongs to THIS node only if the
 *  nearest `[data-block-id]` ancestor above it IS this node's own block
 *  element, not a member's nested one. Queried by the node's unique
 *  `data-block-id={nodeId}` first, so it never has to walk past a member
 *  to find the right subtree at all. */
function ownHeaderOf(root: HTMLElement, nodeId: string): HTMLElement | null {
  const block = root.querySelector<HTMLElement>(`[data-block-id="${nodeId}"]`);
  if (!block) return null;
  for (const header of Array.from(block.querySelectorAll<HTMLElement>('[data-slot="block-header"]'))) {
    if (header.closest("[data-block-id]") === block) return header;
  }
  return null;
}

/**
 * Marks the node's OWN header with `OWN_DRAG_HANDLE_ATTR`, and only that
 * one — host-fixes lane, defect 6.
 *
 * `dragHandle: '[data-slot="block-header"]'` matches ANY element with that
 * slot inside the node's DOM subtree, and every `Block` that renders a
 * `header` prop stamps it — including a MEMBER'S own header inside an
 * expanded parent. React Flow's `hasSelector` walk starts at the pressed
 * element and stops at the first match, so pressing a member's header
 * matches immediately and starts dragging the PARENT (the React Flow node
 * the member lives inside), not the member itself. Measured twice
 * independently, 2026-09-18: kid's header inside proc moved proc by
 * (57, 24) and by 40.8px. The existing `DragPolicy.stories.tsx` dodges
 * this with a `>`-scoped query the actual drag POLICY (this file) lacks.
 *
 * A host-stamped attribute is the fix: mark only the header this specific
 * node owns (by `ownHeaderOf`'s ownership rule, above), and key
 * `dragHandle` off the marker instead of the slot. A member's own header
 * never carries it, so pressing one no longer resolves to anything and
 * the press falls through to whatever's underneath — inert, matching a
 * member's face until member reorder ships its own declaration.
 *
 * A COMPONENT, not a bare hook, for the same reason `MeasuredPortHandles`
 * is one: `BboxNode` early-returns `null` before its host/node are known,
 * and a hook called after a conditional return breaks React's rules. As a
 * child mounted only once that check passes, this one's own hook runs
 * unconditionally on ITS OWN terms — nothing rendered, purely the effect.
 */
function OwnDragHandleMarker({ nodeId, rootRef }: { nodeId: string; rootRef: React.RefObject<HTMLDivElement | null> }) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Cleared and re-stamped every render, not just once: a view-mode
    // change (simple ↔ expanded) unmounts and remounts the header element,
    // and a stale marker left on a detached node is merely wasted — but a
    // stale marker on a DIFFERENT still-attached element (a header that
    // used to be this node's own, before a re-render moved it) would keep
    // authorizing a drag from the wrong place.
    for (const stale of Array.from(root.querySelectorAll(`[${OWN_DRAG_HANDLE_ATTR}]`))) {
      stale.removeAttribute(OWN_DRAG_HANDLE_ATTR);
    }
    ownHeaderOf(root, nodeId)?.setAttribute(OWN_DRAG_HANDLE_ATTR, "");
  });
  return null;
}

/**
 * Every port dot the view kit rendered inside this node, as node-local
 * handle positions. This is ARCHITECTURE.md's measurement rule verbatim:
 * a dot's place on the wall is a VIEW fact the component owns, so the host
 * MEASURES it (`getBoundingClientRect`, un-scaled by the viewport zoom)
 * instead of re-deriving rail geometry it does not own.
 *
 * Host-fixes lane, defect 7: the SIGHTING half of this (which dots exist,
 * owned by which node, on which wall — pure DOM contract reading, zero
 * canvas-engine imports) used to be a private copy of exactly what
 * `portDotSightings.ts` now exports as `sightPortDots`, built by the
 * tldraw lane for this exact repointing. Importing this file dragged
 * `@xyflow/react/dist/style.css` (line 29's `import`) into ANY host that
 * wanted the sighting, which the core rule forbids ("never the other
 * engine"). What's left HERE, host-owned, is the PROJECTION
 * `sightPortDots` deliberately does not do: dividing the raw viewport
 * sighting by this node's own rect-to-offsetWidth ratio to get node-local,
 * zoom-independent px, and mapping the wall name to React Flow's own
 * `Position` enum.
 */
function measurePortDots(root: HTMLElement, nodeId: string): MeasuredHandle[] {
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width === 0 || root.offsetWidth === 0) return [];
  const scale = rootRect.width / root.offsetWidth;
  // `{ members: true }`: a member is drawn INSIDE this node by the view kit
  // (rfNodes below never makes it a React Flow node of its own), so the only
  // place its dot can be reached from is this node's subtree — and the only
  // thing an edge into it can anchor to is a handle of THIS node. Own dots
  // keep `handleId === portId`, so nothing that already resolved moves.
  return sightPortDots(root, nodeId, { members: true }).map((sighting) => {
    const x = (sighting.clientX - rootRect.left) / scale;
    const y = (sighting.clientY - rootRect.top) / scale;
    const side = sighting.side ? POSITION_FOR_EDGE[sighting.side] : undefined;
    return {
      portId: sighting.portId,
      handleId: sighting.handleId,
      x,
      y,
      side: side ?? (x < root.offsetWidth / 2 ? Position.Left : Position.Right),
    };
  });
}

function sameHandles(a: MeasuredHandle[], b: MeasuredHandle[]): boolean {
  return a.length === b.length && a.every((h, i) => h.handleId === b[i].handleId && Math.abs(h.x - b[i].x) < 0.5 && Math.abs(h.y - b[i].y) < 0.5 && h.side === b[i].side);
}

/** Invisible and inert: the handle exists so React Flow can resolve and
 *  route an edge end; the DOT stays the visible affordance. */
function handleStyle(h: MeasuredHandle): CSSProperties {
  return {
    position: "absolute",
    left: h.x,
    top: h.y,
    transform: "translate(-50%, -50%)",
    width: 2,
    height: 2,
    minWidth: 0,
    minHeight: 0,
    border: "none",
    background: "transparent",
    opacity: 0,
    pointerEvents: "none",
  };
}

function MeasuredPortHandles({ nodeId, rootRef }: { nodeId: string; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [handles, setHandles] = useState<MeasuredHandle[]>([]);

  // Every render, equality-guarded: a rail reorder moves dots WITHOUT
  // resizing the node (slots swap inside the same box), so a
  // ResizeObserver alone would sleep through it — but the reorder does
  // re-render this node, and this effect rides that render.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = measurePortDots(root, nodeId);
    setHandles((prev) => (sameHandles(prev, next) ? prev : next));
  });

  // Rails land one layout pass after the Block they attach to (the same
  // race WireLayer documents), and fonts/editor chrome can settle later
  // still — one deferred frame plus a ResizeObserver covers both.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const next = measurePortDots(root, nodeId);
      setHandles((prev) => (sameHandles(prev, next) ? prev : next));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [nodeId, rootRef]);

  // Handles moved → React Flow must re-read its handle bounds or edges
  // keep pointing at where the dots USED to be.
  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [handles, nodeId, updateNodeInternals]);

  return (
    <>
      {handles.map((h) => (
        // Both types per port: a scene port may be an edge's source in one
        // wire and a target in another; React Flow resolves each end
        // against its own type's handle list.
        <Fragment key={h.handleId}>
          <Handle type="source" id={h.handleId} position={h.side} isConnectable={false} style={handleStyle(h)} />
          <Handle type="target" id={h.handleId} position={h.side} isConnectable={false} style={handleStyle(h)} />
        </Fragment>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The custom node — one renderer for every host-facing type            */
/* ------------------------------------------------------------------ */

function BboxNode({ id }: NodeProps) {
  const host = useContext(HostSceneContext);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const node = host?.scene.nodes.find((candidate) => candidate.id === id);
  if (!host || !node) return null;
  return (
    <div
      ref={rootRef}
      data-scene-node={id}
      // The code face is wall-to-wall editor and the editor owns its
      // pointer — a 10px host-owned grab ring is what makes the node
      // repositionable at all. Chrome, not component: it exists only in
      // hosts with a drag gesture.
      style={{ position: "relative", padding: node.type === "code" ? 10 : 0 }}
    >
      <SceneNodeView
        scene={host.scene}
        node={node}
        wired={host.wired}
        producers={host.producers}
        onSceneChange={host.onSceneChange}
        decorate={host.decorate}
        regionViews={host.regionViews}
      />
      <MeasuredPortHandles nodeId={id} rootRef={rootRef} />
      <OwnDragHandleMarker nodeId={id} rootRef={rootRef} />
      {host.resizable && (node.type ?? "block") === "block" && (
        // Resize is the HOST's gesture (it spans the node's own box against
        // the canvas), and `NodeResizer` is React Flow's stock control for
        // it — nothing hand-rolled. The result is written back into the
        // scene as data (`w`/`h` + the new at-rest position), which is the
        // same write-back seam every other interaction uses. `isVisible`
        // unconditionally because this host deliberately does not mirror
        // React Flow's selection state into the scene record; a phase-2
        // host that tracks selection can gate the handles on it.
        // Rotation has NO stock React Flow control (their rotatable node is
        // a documented custom example, not a shipped component) — reported
        // as a finding rather than built here.
        //
        // WHY it renders LAST, after `SceneNodeView`/`MeasuredPortHandles`
        // (host-fixes lane, defect 4): the four corner handles are
        // absolutely positioned at the node's own edges, and so is a
        // Block's own port rail/card content — with no explicit z-index on
        // either side, later DOM order wins the stack. Mounted BEFORE the
        // Block (as this was originally written), any port sitting near a
        // corner painted OVER the handle there — measured on `:5421`:
        // `document.elementsFromPoint` at three of four corners resolved to
        // `[data-slot="block-port"]` or `[data-slot="port-edge"]`, never
        // the grip, and only the one corner with no nearby port was
        // actually reachable. Moving `NodeResizer` after the content it
        // resizes is the same "later wins" rule already keeping wire
        // trace/scene-node z-order sane — no z-index needed, no custom
        // stacking context, one JSX reorder.
        //
        // WHY onResizeEnd and not onResize: the scene doc's own rule — "a
        // host mid-drag owns the moving copy and writes back here at
        // rest". Writing per-move was tried first and feeds back: each
        // write re-renders the Block at the new `w`/`h`, XYResizer's
        // gesture math then measures the moved box mid-gesture, and the
        // node collapses to its minimum within a few frames (driven live,
        // 2026-09-17). One write at release has no loop to enter.
        <NodeResizer
          isVisible
          minWidth={RESIZE_MIN_WIDTH}
          minHeight={RESIZE_MIN_HEIGHT}
          handleStyle={{ zIndex: RESIZE_CONTROL_Z_INDEX }}
          lineStyle={{ zIndex: RESIZE_CONTROL_Z_INDEX }}
          onResizeEnd={(_event, params) => {
            // A gesture that started before React Flow MEASURED the node
            // reports start values of 0 (`node.measured.width ?? 0` in
            // XYResizer) and can end below its own minimums — writing that
            // back collapses the Block to nothing (driven live,
            // 2026-09-17: inline width 0px after an early drag). A result
            // the resizer's own constraints could never legitimately
            // produce is a mismeasured gesture, not a resize — drop it.
            if (params.width < RESIZE_MIN_WIDTH || params.height < RESIZE_MIN_HEIGHT) return;
            host.onSceneChange?.({
              ...host.scene,
              nodes: host.scene.nodes.map((candidate) =>
                candidate.id === id
                  ? { ...candidate, position: { x: params.x, y: params.y }, data: { ...candidate.data, w: params.width, h: params.height } }
                  : candidate,
              ),
            });
          }}
        />
      )}

    </div>
  );
}

/** The resizer's floor — also the write-back guard's threshold (see the
 *  NodeResizer above): anything smaller cannot be a legitimate result. */
export const RESIZE_MIN_WIDTH = 120;
export const RESIZE_MIN_HEIGHT = 80;

/**
 * Host-fixes lane, defect 4, part two: DOM order alone was not enough. A
 * positioned element with an explicit `z-index` beats a later sibling that
 * has none — `port-edge.tsx:832` already sets `zIndex: isDragging ? 10 : 1`
 * on a port card, `:989` sets `zIndex: 5` on its lane overlay, and
 * `blockPort.tsx:490` sets `zIndex: 1` on every rail — so a resize control
 * with no z-index of its own stayed BELOW those even after the reorder
 * above put it later in the DOM. `20` clears the highest of the three
 * (a port mid-drag) with room to spare; it is set via `NodeResizer`'s own
 * `handleStyle`/`lineStyle` props, not a new stacking hack.
 */
const RESIZE_CONTROL_Z_INDEX = 20;

/** Every host-facing name renders through the one shared node component;
 *  `SceneNodeView` owns the type switch, so a fifth kind is one case
 *  there, zero here. */
const NODE_TYPES = { block: BboxNode, glyph: BboxNode, code: BboxNode, value: BboxNode, region: BboxNode };

/** Where a node drag may START, per host-facing type. Interaction
 *  geometry — host-owned, never written into the scene record. */
const DRAG_HANDLE_FOR_TYPE: Record<string, string | undefined> = {
  // `[data-slot="block-header"]` would ALSO match a member's own header
  // nested inside this node (host-fixes lane, defect 6) — the marker
  // `OwnDragHandleMarker` stamps is unique to this node's own header.
  block: `[${OWN_DRAG_HANDLE_ATTR}]`,
  // A region drags by the same marker for the same reason, and that is not a
  // second rule: a region's own header IS its corner block's header
  // ("everything is a block" — the corner card carries
  // `[data-block-id=<region id>]`), so `ownHeaderOf` already resolves it
  // once lane A renders one. Harmless before then — no region node exists to
  // match, and a frame is not a header.
  region: `[${OWN_DRAG_HANDLE_ATTR}]`,
  // glyph: the whole face is inert — drag anywhere.
  // code: the wrapper's grab ring (the editor itself is `nodrag`).
  // value: the pill's non-editor face (the editor carries `nodrag`;
  //        collapsed dots have no sortable of their own).
};

/* ------------------------------------------------------------------ */
/* Edges — the trunk's own paint, on React Flow's own geometry           */
/* ------------------------------------------------------------------ */

/**
 * A React Flow edge that paints through the trunk's own `TraceBody`,
 * instead of the stock bezier `<ReactFlow>` draws when no `edgeTypes`
 * entry claims a `type`. Before this, `rfEdges` handed `scene.edges`
 * straight through with no `type`, so React Flow drew its own bezier for
 * every wire — none of `trace.tsx`, `wireLayer.tsx`, `trace.routing.ts`,
 * the elbow router, or any per-edge `WireStyleData` (an async edge's dash)
 * ever reached this host. Measured 2026-09-18: `wireLayerCount: 0`,
 * `trunkTraceCount: 0`, three stock `.react-flow__edge` paths.
 *
 * Ported from `demos/scene/src/TraceEdge.tsx:1-46` (the repo already
 * solved this once, for the demo scene against `@bbox-ui/core`'s
 * `TraceBody`) — same split, originally the same single call to
 * `getBezierPath` (now one of four, dispatched by routing — see
 * `edgePathFor`), repointed at
 * this trunk's own `TraceBody` (`../components/trace.tsx:376`) and
 * threading the scene's `WireStyleData` through instead of hardcoding
 * `variant="data"` (the donor had no per-edge style data to read). The
 * split itself is this file's own header rule, restated by the donor:
 * "the HOST owns the geometry (`getBezierPath` here, tldraw's arrow info
 * there) and the core owns the paint. `TraceBody` is handed a finished `d`
 * and never computes a point."
 *
 * WHY `length` is a straight-line estimate, not the exact bezier arc
 * length: React Flow's `EdgeProps` gives endpoints and positions, not a
 * measured path length (the donor's own comment: "React Flow gives no
 * path length"). `TraceBody` only spends `length` on dash PHASE math —
 * `ASYNC_PACKET_DASHARRAY`'s actual dash pattern is a fixed constant
 * (`trace.tsx:316-318`), so an async edge dashes correctly regardless —
 * the estimate only affects how the phase centres along a curved path.
 * `Math.hypot` of the endpoints is closer than the donor's flat `0` for
 * the common case (a shallow curve is close to its chord) and costs
 * nothing extra; an exact arc length would need a real, mounted `<path>`
 * to call `getTotalLength()` on, which is more machinery than a phase
 * offset warrants here.
 *
 * CHANGED (2026-09-22, the React Flow parity lane): the "host owns the
 * geometry" split above no longer holds for any cable the kit can resolve.
 * Those paint `WireLayer`'s own `ResolvedWireTrace` — the kit's router,
 * keep-outs and ring-flush ends — and this stock-path paint is the
 * fallback only. See `KitRoutesContext` for why.
 */
function edgePathFor(routing: TraceRouting, geometry: Parameters<typeof getBezierPath>[0]): string {
  // The FALLBACK only, since the parity lane (see `KitRoutesContext` below):
  // React Flow's stock path builders draw an edge the kit could not resolve
  // to two measured dots — a node-level end with no handle, or the one
  // frame before the first measurement lands. Every resolved cable is
  // routed by the kit, keep-outs included.
  switch (routing) {
    case "elbow":
      return getSmoothStepPath(geometry)[0];
    case "straight":
    case "slanted":
      return getStraightPath({ sourceX: geometry.sourceX, sourceY: geometry.sourceY, targetX: geometry.targetX, targetY: geometry.targetY })[0];
    case "curved":
      return getBezierPath(geometry)[0];
  }
}

/**
 * The kit's own routes for this host's edges, keyed by edge id (a scene
 * edge's id IS its `Wire` id — `sceneWires` maps one to one), plus the
 * drawn-polyline read-back. Provided by `ReactFlowHost`, filled by
 * `KitWireRouter`, read by `TraceEdge`.
 *
 * WHY React Flow's edges route through the kit at all, and not through its
 * own `getSmoothStepPath` as they used to (docs/peps/0005-dom-canvas-stays-
 * static.md): the DOM canvas stays the static control, and anything that
 * MOVES across the canvas gets a React Flow twin — Zach, 2026-09-22: "ok its
 * settled 100% lets use reactflow than." A twin that routed with a
 * different router (no keep-outs, a gap short of the ring, no frame to
 * cross) would compare two routers, not two hosts. So the only thing this
 * host changes is the edge PAINT/ROUTE, through React Flow's own custom
 * edge type; node drag, selection and handles stay stock. One derivation —
 * `WireLayer`'s `resolveWires` + `ResolvedWireTrace` — measured in flow
 * space instead of container space.
 */
const KitRoutesContext = createContext<{
  routes: ReadonlyMap<string, ResolvedWire>;
  onGeometry?(wireId: string, points: readonly Point[] | null): void;
}>({ routes: new Map() });

/** Client px → flow px: the viewport element's own transformed origin and
 *  zoom, read off its box the same way `measurePortDots` reads a node's
 *  (rect-to-offsetWidth ratio) rather than from React Flow's store. */
function flowSpaceOf(viewport: HTMLElement): WireSpace {
  const rect = viewport.getBoundingClientRect();
  return { left: rect.left, top: rect.top, scale: viewport.offsetWidth > 0 ? rect.width / viewport.offsetWidth : 1 };
}

/** Every node's at-rest box as one string — compared by value, so the
 *  router re-measures exactly when a node moved or resized (a drag streams
 *  one per frame) and never on an unrelated store tick. */
function nodeLayoutSignature(state: ReactFlowState): string {
  let signature = "";
  for (const node of state.nodeLookup.values()) {
    const at = node.internals.positionAbsolute;
    signature += `${node.id}:${at.x},${at.y},${node.measured.width ?? 0}x${node.measured.height ?? 0};`;
  }
  return signature;
}

/**
 * One viewport's routing passes, coalesced: at most ONE `resolveWires` per
 * animation frame, however many inputs changed inside it.
 *
 * WHY (audit of 7fbf22c, 2026-09-22): the first version ran a synchronous
 * pass on every layout-signature change, another on the next frame, and
 * tore down and rebuilt a `ResizeObserver` over every node each time — and
 * a drag invalidates it twice per move (the streamed scene write-back AND
 * the store's new positions). Measured on the mirror's 8-step drag: 31
 * passes. A pass is a full DOM measure plus, downstream, an A* re-route of
 * every elbow cable, so it is the one cost here worth bounding.
 *
 * So a request never runs a pass itself: it books the next animation frame,
 * and every request until that frame lands folds into the same pass. That
 * one deferred pass is also what the rails race needs (rails land one layout
 * pass after their Block — `WireLayer`'s own race — and a rail landing
 * resizes nothing, so nothing else would ask), so there is no separate
 * trailing pass. The cost, stated: a cable is resolved one frame after its
 * node moved. A first version that also ran a synchronous pass on an idle
 * frame measured 16 passes on the same drag — two per move.
 */
interface RouteScheduler {
  frame: number | null;
  pass(): void;
}

function requestRoutePass(scheduler: RouteScheduler): void {
  if (scheduler.frame !== null) return;
  scheduler.frame = requestAnimationFrame(() => {
    scheduler.frame = null;
    scheduler.pass();
  });
}

/**
 * Resolves `wires` against the rendered nodes with `WireLayer`'s own
 * `resolveWires` — the viewport element as the container, flow space as
 * the space — whenever a node's box moves, a node resizes, or the port
 * style changes. Mounted INSIDE `<ReactFlow>` for the store; renders
 * nothing. ONE `ResizeObserver` per viewport, which observes and unobserves
 * nodes as the set changes rather than being rebuilt on every move.
 */
function KitWireRouter({ wires, layoutKey, onResolved }: { wires: readonly Wire[]; layoutKey: unknown; onResolved(next: ResolvedWires): void }) {
  const domNode = useStore((state) => state.domNode);
  const layout = useStore(nodeLayoutSignature);
  // WHY the port style is a dependency (audit of 7fbf22c): switching the
  // document-wide variant (v1 → v3) grows every dot's painted ring from
  // 5.5px to 8px WITHOUT resizing a node, so neither the layout signature
  // nor the ResizeObserver would notice, and every cable kept its old
  // ring-flush gap, painting ~2.5px into the new ring. Same subscription
  // `WireLayer` re-measures on.
  const portVariantId = usePortVariant().id;
  const latest = useRef({ wires, onResolved });
  latest.current = { wires, onResolved };
  const passes = useRef(0);
  const live = useRef<{ scheduler: RouteScheduler; observer: ResizeObserver; observed: Set<Element>; viewport: HTMLElement } | null>(null);

  useLayoutEffect(() => {
    const viewport = domNode?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport) return;
    const scheduler: RouteScheduler = {
      frame: null,
      pass: () => {
        viewport.dataset.kitRoutePasses = String(++passes.current);
        latest.current.onResolved(resolveWires(viewport, latest.current.wires, flowSpaceOf(viewport)));
      },
    };
    const observer = new ResizeObserver(() => requestRoutePass(scheduler));
    live.current = { scheduler, observer, observed: new Set(), viewport };
    return () => {
      if (scheduler.frame !== null) cancelAnimationFrame(scheduler.frame);
      observer.disconnect();
      live.current = null;
    };
  }, [domNode]);

  useLayoutEffect(() => {
    const current = live.current;
    if (!current) return;
    const nodes = new Set<Element>(current.viewport.querySelectorAll("[data-scene-node]"));
    for (const node of current.observed) if (!nodes.has(node)) current.observer.unobserve(node);
    for (const node of nodes) if (!current.observed.has(node)) current.observer.observe(node);
    current.observed = nodes;
    requestRoutePass(current.scheduler);
  }, [domNode, layout, wires, layoutKey, portVariantId]);
  return null;
}

const NO_ROUTES: ResolvedWires = { resolved: [], unresolvedIds: [] };

/** Value equality over everything `Trace` routes from. Keeping the previous
 *  object when nothing moved is what keeps `Trace`'s identity-compared
 *  `obstacles`/`fromBox`/`toBox` stable — a fresh-but-equal array would
 *  re-run the A* router on every store tick. */
function sameRoutes(a: ResolvedWires, b: ResolvedWires): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function TraceEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<WireStyleData>>) {
  const kit = useContext(KitRoutesContext);
  const route = kit.routes.get(id);
  if (route) return <ResolvedWireTrace route={route} onGeometry={kit.onGeometry} />;
  // `?? DEFAULT_TRACE_ROUTING` — Zach, 2026-09-19: "by default elbow arrows
  // should always be used. never straight arrows." Before this the host
  // drew a bezier for EVERY edge, so an explicitly-elbow cable and a
  // defaulted one looked identical here and neither was orthogonal.
  const path = edgePathFor(data?.routing ?? DEFAULT_TRACE_ROUTING, { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <g data-edge-route="stock">
      <TraceBody
        id={id}
        path={path}
        length={Math.hypot(targetX - sourceX, targetY - sourceY)}
        variant={data?.variant ?? "data"}
        color={data?.color ?? "var(--muted-foreground)"}
        // No `?? "arrow"` of its own any more: the kit default
        // (`DEFAULT_TRACE_MARKER_END`, "none" — Zach, 2026-09-22: "because its
        // DAG, we already know the order!") is `TraceBody`'s, and a host that
        // restated the old literal here was the third place it could drift.
        markerEnd={data?.markerEnd}
      />
    </g>
  );
}

const EDGE_TYPES: EdgeTypes = { bboxTrace: TraceEdge };

/* ------------------------------------------------------------------ */
/* The host                                                            */
/* ------------------------------------------------------------------ */

export interface ReactFlowHostProps {
  scene: HostScene;
  /** Position writes (drag), reorders, keystrokes — all one seam: the
   *  host writes interaction results back into the scene as data. Omit
   *  for a read-only bench (nodes then simply do not move). */
  onSceneChange?(next: HostScene): void;
  width?: number;
  height?: number;
  defaultViewport?: Viewport;
  fitView?: boolean;
  /** Mount React Flow's stock `NodeResizer` on block nodes. Opt-in per
   *  bench: always-visible handles are review chrome, not a default. */
  resizable?: boolean;
  /** Extra children mounted inside <ReactFlow> (a story's probe layer). */
  children?: ReactNode;
  /** The story lane's paint seam — see `nodeViews.tsx`'s `Decorate`. Omit
   *  for byte-identical output to before this prop existed. */
  decorate?: Decorate;
  /** The polyline each kit-routed cable was DRAWN on, in flow space — the
   *  same read-back as `WireLayer.onWireGeometry` (at zoom 1 with a zero
   *  viewport offset, the same numbers the DOM canvas reports). `null`
   *  retracts a wire the kit no longer draws — it fell back to the stock
   *  path, or left the scene — exactly as `WireLayer.onWireGeometry` does. */
  onWireGeometry?(wireId: string, points: readonly Point[] | null): void;
}

/**
 * Position changes only: mid-drag React Flow owns the moving copy and
 * streams positions; everything else it might change (selection flags,
 * measured sizes) is host-internal and never enters the scene record.
 *
 * WHY a node's own resize gesture is excluded here (host-fixes lane,
 * defect 5): React Flow's stock `ResizeControl` streams BOTH a
 * `type: "position"` change (the anchor shift, whenever the drag moves the
 * top or left edge) AND a `type: "dimensions"` change stamped
 * `resizing: true` — on the SAME tick, from the SAME gesture. This host
 * only ever writes `w`/`h` back at rest (`BboxNode`'s `onResizeEnd`'s own
 * WHY: writing per-move feeds back into XYResizer's gesture math and
 * collapses the node). Applying just the streamed position half while
 * holding the size half made a top-left resize visibly SLIDE the block
 * before snapping wider at release, and gave a bottom-right resize NO
 * feedback at all until release — measured 2026-09-18. The two halves
 * move together or not at all; since size can only move at rest, position
 * has to wait for it too, not the other way around (writing size per-move
 * was already tried and rejected for the reason above it).
 */
function applyPositionChanges(scene: HostScene, changes: NodeChange[]): HostScene {
  const isResizing = (c: NodeChange): c is NodeDimensionChange => c.type === "dimensions" && c.resizing === true;
  const resizingIds = new Set(changes.filter(isResizing).map((c) => c.id));
  let nodes = scene.nodes;
  for (const change of changes) {
    if (change.type === "position" && change.position && !resizingIds.has(change.id)) {
      const position = change.position;
      nodes = nodes.map((node) => (node.id === change.id ? { ...node, position } : node));
    }
  }
  return nodes === scene.nodes ? scene : { ...scene, nodes };
}

/**
 * Which React Flow node + handle an edge end actually resolves against.
 *
 * A member is not a canvas node — the view kit draws it INSIDE its parent
 * (`rfNodes` below only ever hands React Flow top-level nodes), so an edge
 * into one used to resolve against nothing and React Flow dropped it
 * (`hostScene.ts:75-82`'s recorded gap). The member's dot is still on
 * screen, inside its outermost ancestor's box, and `MeasuredPortHandles`
 * now mounts a handle there named `portKey(memberId, portId)` — so the end
 * re-points to that ancestor and asks for that handle.
 *
 * WHY this is a rendering fact and not a scene rewrite: the scene record is
 * untouched (`wiredPorts`, `sceneWires` and the DOM host all still read
 * `kid/in` as an edge into `kid`), and the edge object keeps its own `id`
 * and `data`. It changes where a wire ANCHORS, never what it means — the
 * member is a block whose dots this host can now see.
 */
function anchorEnd(scene: HostScene, nodeId: string, handleId: string | undefined): { nodeId: string; handleId: string | undefined } {
  // Outermost ancestor: `ancestorsOf` walks nearest-first, so the LAST entry
  // is the top-level node — a member of a member still lands on the one
  // shape that draws it. `undefined` = already top-level, nothing to do.
  const topLevelId = ancestorsOf(scene, nodeId).at(-1);
  if (topLevelId === undefined) return { nodeId, handleId };
  // An end with no handle wires the NODE, not a port (`sceneWires`' own
  // rule) — there is no dot to name, so it keeps that honest absence.
  return { nodeId: topLevelId, handleId: handleId === undefined ? undefined : portKey(nodeId, handleId) };
}

export function ReactFlowHost({ scene, onSceneChange, width = 640, height = 360, defaultViewport, fitView, resizable, children, decorate, onWireGeometry }: ReactFlowHostProps) {
  // Hosts paint the projection; the document keeps its direct P1 cables.
  // Identity on an all-expanded scene (same arrays out), so `wired`, the
  // edge list and every memo below are unchanged for every bench that has
  // no opaque region.
  const projected = useMemo(() => projectHostScene(scene), [scene]);
  const wired = useMemo(() => wiredPortsOf(projected.scene), [projected]);
  // Off the projection, like `wired`: the count is of the cables PAINTED
  // at each dot (domCanvas.tsx says why at length).
  const producers = useMemo(() => producerCountsOf(projected.scene), [projected]);
  const regionViews = useMemo(() => regionViewMap(projected.regions), [projected]);
  const context = useMemo(
    () => ({ scene, wired, producers, onSceneChange, resizable, decorate, regionViews }),
    [scene, wired, producers, onSceneChange, resizable, decorate, regionViews],
  );

  // Host-owned measurement cache, by node id — NEVER part of the scene
  // record (the same "host owns interaction/measurement geometry" rule
  // `dragHandle` follows above). WHY it exists: every scene update hands
  // React Flow a brand-new decorated object for the changed node (below),
  // with no `measured` field, because our own `SceneNode` never carries
  // one. `adoptUserNodes` (`@xyflow/system`, `checkEquality: true` by
  // default) keys its "keep the cached internal node" fast path on
  // `userNode === internalNode.internals.userNode` — a reference that our
  // decoration always breaks for whichever node just moved — so on the
  // `else` branch it rebuilds with `measured: {width: undefined, height:
  // undefined}`. `nodeHasDimensions` then reads false, and `NodeWrapper`
  // sets `visibility: hidden` on the node's own DOM element until the next
  // `ResizeObserver` tick repopulates it. `visibility:hidden` does not
  // collapse layout (`getBoundingClientRect` stays correct) — it only
  // removes the element from hit-testing, so a press landing in that
  // window falls through to `.react-flow__pane` beneath and PANS THE
  // CANVAS instead of touching the node, which moves the node's measured
  // screen box by the same delta as a real drag and is indistinguishable
  // from one. Measured 2026-09-18: `DragPolicy.stories.tsx`'s `BlockSolid`
  // story flaked on exactly this, ~1 run in 8-15 — `elementFromPoint` at a
  // point provably inside the node's own rect resolved to the pane. Once a
  // node's real size is known we carry it forward on every subsequent
  // `rfNodes` build regardless of reference churn, so `measured` is never
  // unset again and the hidden flash cannot recur.
  const measuredSizeRef = useRef(new Map<string, { width: number; height: number }>());

  // The decoration, not a translation: the scene node object itself passes
  // through (`{...node}`), proven assignable by scene.reactflow.test.ts;
  // the host adds only what it owns. Members are the view kit's business —
  // a `parentId` node is drawn INSIDE its parent by `SceneNodeView`, so
  // only top-level nodes become React Flow nodes (React Flow's own
  // sub-flow rendering would draw the member a second time, as a free-
  // floating sibling).
  const rfNodes: Node[] = useMemo(
    () =>
      topLevelNodes(scene).map((node) => ({
        ...node,
        type: node.type && node.type in NODE_TYPES ? node.type : "block",
        dragHandle: DRAG_HANDLE_FOR_TYPE[node.type ?? "block"],
        measured: measuredSizeRef.current.get(node.id),
      })),
    [scene],
  );
  // `bboxTrace` on every edge — the decoration, same licence as `rfNodes`
  // above: the scene edge object passes through untouched, this host only
  // adds the type that routes it through `TraceEdge` instead of React
  // Flow's stock bezier, and re-points each END at the canvas node that
  // actually renders it (`anchorEnd`).
  const rfEdges: Edge[] = useMemo(
    () =>
      // The PROJECTED edges: an opaque region's crossing cables already
      // name its card's promoted ports, so `anchorEnd` below then runs on
      // ends that are already top-level and leaves them alone, while a
      // member's cable in an EXPANDED region still gets lane G's
      // re-pointing. Two independent re-anchorings, composed in the order
      // that makes each one's input true.
      projected.scene.edges.map((edge) => {
        const source = anchorEnd(scene, edge.source, edge.sourceHandle);
        const target = anchorEnd(scene, edge.target, edge.targetHandle);
        return {
          ...edge,
          source: source.nodeId,
          sourceHandle: source.handleId,
          target: target.nodeId,
          targetHandle: target.handleId,
          type: "bboxTrace",
        };
      }),
    // The WHOLE scene, not just `scene.edges`: `anchorEnd` reads `parentId`
    // off the NODES, so an edge list memoized on the edges alone would keep
    // pointing a member's cable at a parent the member has since left.
    [scene, projected],
  );

  // The kit's routes for the PROJECTED wires — the same list the DOM canvas
  // hands its `WireLayer` (`domCanvas.tsx`), so both hosts route one set.
  const wires = useMemo(() => sceneWires(projected.scene), [projected]);
  const [kitRoutes, setKitRoutes] = useState<ResolvedWires>(NO_ROUTES);
  const onResolved = useCallback((next: ResolvedWires) => setKitRoutes((previous) => (sameRoutes(previous, next) ? previous : next)), []);
  const onWireGeometryRef = useRef(onWireGeometry);
  onWireGeometryRef.current = onWireGeometry;
  const reportedRef = useRef(new Set<string>());
  const kitContext = useMemo(
    () => ({
      routes: new Map(kitRoutes.resolved.map((route) => [route.wire.id, route])),
      onGeometry: (wireId: string, points: readonly Point[] | null) => {
        if (!points || points.length < 2) return;
        reportedRef.current.add(wireId);
        onWireGeometryRef.current?.(wireId, points);
      },
    }),
    [kitRoutes],
  );
  // The same retraction `WireLayer` does: a wire that stops being kit-routed
  // (its edge went handle-less and fell back to the stock path, or left the
  // scene) takes its reported polyline with it, so nothing derived from the
  // kit's route outlives the route.
  useLayoutEffect(() => {
    const routed = new Set(kitRoutes.resolved.map(({ wire }) => wire.id));
    for (const wireId of [...reportedRef.current]) {
      if (routed.has(wireId)) continue;
      reportedRef.current.delete(wireId);
      onWireGeometryRef.current?.(wireId, null);
    }
  }, [kitRoutes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Cache every reported size BEFORE the early return below — a
      // read-only bench (no `onSceneChange`) still needs the measurement
      // carried forward, or its nodes flash unmeasured on every render.
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions && change.dimensions.width && change.dimensions.height) {
          measuredSizeRef.current.set(change.id, change.dimensions);
        }
      }
      if (!onSceneChange) return;
      const next = applyPositionChanges(scene, changes);
      if (next !== scene) onSceneChange(next);
    },
    [scene, onSceneChange],
  );

  return (
    <div data-host="react-flow" data-unresolved-wires={kitRoutes.unresolvedIds.join(",")} style={{ width, height }}>
      <HostSceneContext.Provider value={context}>
        <KitRoutesContext.Provider value={kitContext}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={handleNodesChange}
            defaultViewport={defaultViewport}
            fitView={fitView}
            // Owed wiring from the drag-policy lane (`dragPolicy.ts:544-573`,
            // `INNER_CLAIM_PX`'s own WHY): left at React Flow's default of 1,
            // the canvas claims a contested press 3px before a dnd-kit rail
            // (activation constraint 4) ever sees it — the more specific
            // owner has to arm first, not last. Matches the rail's own
            // constraint; `src/scene/interactions/dragPolicy.ts` is read-only from
            // here (another workflow owns `src/interaction/**`), so this is
            // the one number from that lane's list this file can safely take
            // without editing it.
            nodeDragThreshold={4}
            // Wires are declared by the scene record; interactive connecting
            // is phase-2 work (the port-side affordances are the expensive
            // part — ARCHITECTURE.md's "drawing an edge splits").
            nodesConnectable={false}
          >
            <Background />
            <Controls showInteractive={false} />
            <KitWireRouter wires={wires} layoutKey={scene} onResolved={onResolved} />
            {children}
          </ReactFlow>
        </KitRoutesContext.Provider>
      </HostSceneContext.Provider>
    </div>
  );
}
