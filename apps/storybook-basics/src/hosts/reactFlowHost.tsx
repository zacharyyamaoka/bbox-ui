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
  Handle,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { topLevelNodes, type HostScene } from "./hostScene";
import { SceneNodeView, wiredPortsOf } from "./nodeViews";

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
  onSceneChange?(next: HostScene): void;
} | null>(null);

/* ------------------------------------------------------------------ */
/* Measured handles — the host measures; the scene contains              */
/* ------------------------------------------------------------------ */

interface MeasuredHandle {
  portId: string;
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

/** A dot belongs to THIS node, not to a member rendered inside it — the
 *  nearest `data-block-id` ancestor decides, the same ownership reading
 *  `WireLayer`'s own resolution uses. */
function dotOwnedBy(el: Element, nodeId: string): boolean {
  return el.closest("[data-block-id]")?.getAttribute("data-block-id") === nodeId;
}

/**
 * Every port dot the view kit rendered inside this node, as node-local
 * handle positions. This is ARCHITECTURE.md's measurement rule verbatim:
 * a dot's place on the wall is a VIEW fact the component owns, so the host
 * MEASURES it (`getBoundingClientRect`, un-scaled by the viewport zoom)
 * instead of re-deriving rail geometry it does not own. Collapsed
 * stand-in dots resolve every member id to the one dot — the same
 * `data-collapsed-ports` reading `WireLayer` uses.
 */
function measurePortDots(root: HTMLElement, nodeId: string): MeasuredHandle[] {
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width === 0 || root.offsetWidth === 0) return [];
  const scale = rootRect.width / root.offsetWidth;
  const out: MeasuredHandle[] = [];
  const seen = new Set<string>();
  const push = (portId: string, el: Element) => {
    // A port id is unique per node; first sighting wins. Mid-gesture a
    // wall can transiently expose BOTH forms of one port (its direct dot
    // and a collapsed stand-in naming it), and two handles with one id is
    // a duplicate React key plus an ambiguous edge anchor.
    if (seen.has(portId)) return;
    seen.add(portId);
    const dot = el.querySelector('[data-slot="port-dot"]') ?? el;
    const rect = dot.getBoundingClientRect();
    const x = (rect.left + rect.width / 2 - rootRect.left) / scale;
    const y = (rect.top + rect.height / 2 - rootRect.top) / scale;
    const edge = el.closest('[data-slot="block-port-rail"]')?.getAttribute("data-edge") ?? "";
    out.push({ portId, x, y, side: POSITION_FOR_EDGE[edge] ?? (x < root.offsetWidth / 2 ? Position.Left : Position.Right) });
  };
  for (const el of Array.from(root.querySelectorAll("[data-port-id]"))) {
    if (dotOwnedBy(el, nodeId)) push(el.getAttribute("data-port-id")!, el);
  }
  for (const el of Array.from(root.querySelectorAll("[data-collapsed-ports]"))) {
    if (!dotOwnedBy(el, nodeId)) continue;
    for (const portId of (el.getAttribute("data-collapsed-ports") ?? "").split(",")) {
      if (portId.trim()) push(portId.trim(), el);
    }
  }
  return out;
}

function sameHandles(a: MeasuredHandle[], b: MeasuredHandle[]): boolean {
  return a.length === b.length && a.every((h, i) => h.portId === b[i].portId && Math.abs(h.x - b[i].x) < 0.5 && Math.abs(h.y - b[i].y) < 0.5 && h.side === b[i].side);
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
        <Fragment key={h.portId}>
          <Handle type="source" id={h.portId} position={h.side} isConnectable={false} style={handleStyle(h)} />
          <Handle type="target" id={h.portId} position={h.side} isConnectable={false} style={handleStyle(h)} />
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
      <SceneNodeView scene={host.scene} node={node} wired={host.wired} onSceneChange={host.onSceneChange} />
      <MeasuredPortHandles nodeId={id} rootRef={rootRef} />
    </div>
  );
}

/** Every host-facing name renders through the one shared node component;
 *  `SceneNodeView` owns the type switch, so a fifth kind is one case
 *  there, zero here. */
const NODE_TYPES = { block: BboxNode, glyph: BboxNode, code: BboxNode, value: BboxNode };

/** Where a node drag may START, per host-facing type. Interaction
 *  geometry — host-owned, never written into the scene record. */
const DRAG_HANDLE_FOR_TYPE: Record<string, string | undefined> = {
  block: '[data-slot="block-header"]',
  // glyph: the whole face is inert — drag anywhere.
  // code: the wrapper's grab ring (the editor itself is `nodrag`).
  // value: the pill's non-editor face (the editor carries `nodrag`;
  //        collapsed dots have no sortable of their own).
};

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
  /** Extra children mounted inside <ReactFlow> (a story's probe layer). */
  children?: ReactNode;
}

/** Position changes only: mid-drag React Flow owns the moving copy and
 *  streams positions; everything else it might change (selection flags,
 *  measured sizes) is host-internal and never enters the scene record. */
function applyPositionChanges(scene: HostScene, changes: NodeChange[]): HostScene {
  let nodes = scene.nodes;
  for (const change of changes) {
    if (change.type === "position" && change.position) {
      const position = change.position;
      nodes = nodes.map((node) => (node.id === change.id ? { ...node, position } : node));
    }
  }
  return nodes === scene.nodes ? scene : { ...scene, nodes };
}

export function ReactFlowHost({ scene, onSceneChange, width = 640, height = 360, defaultViewport, fitView, children }: ReactFlowHostProps) {
  const wired = useMemo(() => wiredPortsOf(scene), [scene]);
  const context = useMemo(() => ({ scene, wired, onSceneChange }), [scene, wired, onSceneChange]);

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
      })),
    [scene],
  );
  const rfEdges: Edge[] = scene.edges;

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onSceneChange) return;
      const next = applyPositionChanges(scene, changes);
      if (next !== scene) onSceneChange(next);
    },
    [scene, onSceneChange],
  );

  return (
    <div data-host="react-flow" style={{ width, height }}>
      <HostSceneContext.Provider value={context}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          defaultViewport={defaultViewport}
          fitView={fitView}
          // Wires are declared by the scene record; interactive connecting
          // is phase-2 work (the port-side affordances are the expensive
          // part — ARCHITECTURE.md's "drawing an edge splits").
          nodesConnectable={false}
        >
          <Background />
          <Controls showInteractive={false} />
          {children}
        </ReactFlow>
      </HostSceneContext.Provider>
    </div>
  );
}
