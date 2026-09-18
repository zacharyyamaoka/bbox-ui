// src/hosts/tldrawHost.tsx — the tldraw host: the same scene record the DOM
// Canvas and React Flow hosts render, handed to tldraw's viewport engine.
// One custom ShapeUtil per top-level scene node; members stay the view kit's
// business (`childrenOf` inside `SceneNodeView`), identically in every host.
//
// The two tldraw-specific rules this file preserves, both of which a future
// refactor would undo by accident:
//
// 1. WHY shape props are `{w, h, nodeId}` and nothing else — tldraw shape
//    props are PERSISTED DOCUMENT STATE (they pass the `T.*` validators
//    below), so a prop cannot hold a live ReactNode: a `.tldr` that
//    serialized rendered JSX would be nonsense on reload. Content instead
//    rides a plain React Context — the shape's `component()` runs in the
//    SAME React tree tldraw mounts, so `useContext` reaches through. Donor:
//    demos/story-hosts/src/TldrawHost.tsx:17-33 (the T0 spike's finding,
//    quoted nearly verbatim); packages/adapter-tldraw's shapes obey the same
//    rule (block-shape-util.tsx:51-55, "never persisted document state").
//
// 2. WHY port anchors are geometry points, not DOM elements — the pre-reset
//    adapter's own package description states it ("port anchors are geometry
//    points, not DOM elements", packages/adapter-tldraw/package.json:6).
//    React Flow gets to mount a measured, invisible `<Handle>` per dot and
//    let its edge renderer resolve them from the DOM; tldraw's edge paint
//    happens in PAGE SPACE, where no DOM element of the shape exists to
//    measure at paint time. So this host measures each dot ONCE per layout
//    change (through the engine-free sighting seam, `portDotSightings.ts`),
//    projects it into SHAPE-LOCAL geometry via `editor.screenToPage` +
//    `editor.getPointInShapeSpace` (survives camera pan/zoom and rotation,
//    which a rect-ratio projection does not), and stores it as numbers. The
//    wire overlay then renders from anchors × live shape transforms only —
//    the paint never touches the node's DOM.
//
// Gesture ownership (ARCHITECTURE.md "Where an interaction belongs"):
// bounded by one component's box → the component's (dnd-kit rails, the
// CodeMirror caret); spanning the canvas → this host's (shape drag, pan,
// zoom). tldraw's mechanism for the boundary is `editor.markEventAsHandled`
// — SystemSketch's device (src/blocks/memberStackDnd.tsx:485,
// src/blocks/ports/CommunicationPortDnd.tsx:196), chosen over
// `stopPropagation` for the reason SystemSketch's Inspector.tsx:616-620
// records: stopPropagation on a wrapper breaks a child's own pointer
// capture (CodeMirror's caret drag included); marking only hides the event
// from tldraw. The DECLARATION of what owns its pointer is shared with the
// React Flow host (`POINTER_OWNED_CLASS`, nodeViews.tsx); the per-type drag
// surface below mirrors reactFlowHost.tsx's `DRAG_HANDLE_FOR_TYPE` and is
// expected to repoint at the shared `dragPolicy` module when that lands —
// see `contentOwnsPress`'s own doc.

import "tldraw/tldraw.css";

import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  Tldraw,
  createShapeId,
  resizeBox,
  useEditor,
  useValue,
  type Editor,
  type TLBaseShape,
  type TLComponents,
  type TLResizeInfo,
  type TLShapeId,
} from "tldraw";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { BlockSide } from "../components/port.layout";
import { OPPOSITE_DIR, type TraceDir, type TraceTerminalSpec } from "../components/trace.layout";
import { Trace } from "../components/trace";
import { fanWires } from "../components/wiring";
import { sceneWires } from "../scene/sceneWires";
import { topLevelNodes, type HostScene } from "./hostScene";
import { POINTER_OWNED_CLASS, SceneNodeView, wiredPortsOf, type Decorate } from "./nodeViews";
import { sightPortDots } from "./portDotSightings";

/* ------------------------------------------------------------------ */
/* Scene context — how the shape renderer reaches the record            */
/* ------------------------------------------------------------------ */

/** A measured port anchor in SHAPE-LOCAL px — a geometry point, stored as
 *  numbers precisely so the wire paint never has to find a DOM element. */
export interface PortAnchor {
  portId: string;
  x: number;
  y: number;
  side: BlockSide | null;
}

interface TldrawHostContextValue {
  scene: HostScene;
  wired: ReadonlySet<string>;
  onSceneChange?(next: HostScene): void;
  anchors: Readonly<Record<string, readonly PortAnchor[]>>;
  reportAnchors(nodeId: string, anchors: PortAnchor[]): void;
  decorate?: Decorate;
}

const TldrawHostContext = createContext<TldrawHostContextValue | null>(null);

/**
 * ShapeUtil METHODS (`onTranslateEnd`, `onResizeEnd`, `canResize`) are not
 * React components, so the context above cannot reach them — this WeakMap
 * is the bridge: the host registers a mutable ref per editor on mount, the
 * util reads through it. Same shape as SystemSketch's per-editor `bridges`
 * map (src/blocks/memberStackDnd.tsx:466-492), for the same reason.
 */
const bridgeByEditor = new WeakMap<Editor, { current: TldrawHostContextValue | null }>();

function bridgeFor(editor: Editor): TldrawHostContextValue | null {
  return bridgeByEditor.get(editor)?.current ?? null;
}

/** Scene node id → the tldraw shape id this host gives its shape. */
export function shapeIdForNode(nodeId: string): TLShapeId {
  return createShapeId(`bbox-${nodeId}`);
}

/* ------------------------------------------------------------------ */
/* The gesture boundary                                                 */
/* ------------------------------------------------------------------ */

/**
 * Does the pressed element belong to the CONTENT rather than to the host's
 * own drag gesture? `true` → the press is hidden from tldraw
 * (`markEventAsHandled`) and dnd-kit / CodeMirror keep it; `false` → tldraw
 * sees it and the select tool translates the shape.
 *
 * The per-type surface mirrors reactFlowHost.tsx's `DRAG_HANDLE_FOR_TYPE` +
 * `POINTER_OWNED_CLASS` pairing, expressed as one predicate because tldraw
 * has no `dragHandle` selector concept — it either sees a pointerdown or it
 * does not:
 *   - block: drags ONLY by its OWN header. Ownership is resolved through
 *     the nearest `[data-block-id]` ancestor, NOT by bare selector match —
 *     the 2026-09-17 audit measured React Flow's unscoped
 *     `[data-slot="block-header"]` dragHandle letting a MEMBER's header
 *     (kid's, inside proc) move the parent by (57, 24). Here kid's header
 *     resolves to kid and is therefore content, never a drag surface.
 *   - glyph: the whole face is inert — drag anywhere.
 *   - code: the wrapper's grab ring (the editor itself is `nodrag`).
 *   - value: the pill's non-editor face (the editor carries `nodrag`; the
 *     writer/reader rails are rails, caught by the rail rule).
 *
 * TRADE-OFF, stated rather than hidden: in tldraw, select and translate are
 * one gesture, so hiding a block-body press from tldraw also costs body-
 * click SELECTION — a block is selected via its header (or marquee). React
 * Flow can be more permissive because `dragHandle` filters only the DRAG.
 * Splitting the two on tldraw needs SystemSketch's preempt/interlock lane
 * (memberStackDnd.tsx's four steps), deliberately not built for a bench.
 * This predicate is the seam the planned shared `dragPolicy` module should
 * replace — keep it a single exported function so that lands as one import
 * swap.
 */
export function contentOwnsPress(nodeType: string | undefined, nodeId: string, target: Element): boolean {
  if (target.closest(`.${POINTER_OWNED_CLASS}`)) return true;
  if (target.closest('[data-slot="block-port-rail"]')) return true;
  if ((nodeType ?? "block") === "block") {
    const header = target.closest('[data-slot="block-header"]');
    if (!header) return true;
    const owner = header.closest("[data-block-id]")?.getAttribute("data-block-id");
    return owner !== nodeId;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* The shape                                                            */
/* ------------------------------------------------------------------ */

export interface BboxNodeShapeProps {
  /** The measured content box — the one piece of real, persistable shape
   *  state (see the file header's rule 1). */
  w: number;
  h: number;
  /** Which scene node this shape renders. An id, never the node itself. */
  nodeId: string;
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-node": BboxNodeShapeProps;
  }
}

export type BboxNodeShape = TLBaseShape<"bbox-node", BboxNodeShapeProps>;

/** The resizer floor — mirrors reactFlowHost.tsx's exported
 *  `RESIZE_MIN_WIDTH`/`RESIZE_MIN_HEIGHT` (120×80). NOT imported from
 *  there: that module's first line imports React Flow's global stylesheet,
 *  which must never load in a tldraw host ("never the other engine").
 *  Owed wiring: both pairs should live in the shared drag-policy module. */
export const TLDRAW_RESIZE_MIN_WIDTH = 120;
export const TLDRAW_RESIZE_MIN_HEIGHT = 80;

function nodeForShape(editor: Editor, shape: BboxNodeShape) {
  const bridge = bridgeFor(editor);
  return bridge?.scene.nodes.find((candidate) => candidate.id === shape.props.nodeId);
}

function sameAnchors(a: readonly PortAnchor[] | undefined, b: readonly PortAnchor[]): boolean {
  if (!a) return b.length === 0;
  return (
    a.length === b.length &&
    a.every((p, i) => p.portId === b[i].portId && Math.abs(p.x - b[i].x) < 0.5 && Math.abs(p.y - b[i].y) < 0.5 && p.side === b[i].side)
  );
}

function BboxNodeShapeComponent({ shape }: { shape: BboxNodeShape }) {
  const editor = useEditor();
  const host = useContext(TldrawHostContext);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nodeId = shape.props.nodeId;
  const node = host?.scene.nodes.find((candidate) => candidate.id === nodeId);

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    const bridge = bridgeFor(editor);
    if (!wrapper || !bridge) return;

    // The content box IS the shape's geometry (rule 1): `offsetWidth` is
    // unscaled layout px, which is exactly shape-local px — the html layer's
    // camera transform scales the paint, not the layout. Skipped mid-resize:
    // `resizeBox` owns w/h for the duration of the gesture, and a measured
    // write here would snap the box back under the user's pointer.
    const live = editor.getShape<BboxNodeShape>(shape.id);
    if (!live) return;
    const w = wrapper.offsetWidth;
    const h = wrapper.offsetHeight;
    if (w > 0 && h > 0 && !editor.isIn("select.resizing") && (Math.abs(live.props.w - w) > 0.5 || Math.abs(live.props.h - h) > 0.5)) {
      editor.updateShape<BboxNodeShape>({ id: shape.id, type: "bbox-node", props: { w, h } });
    }

    // Dots → anchors: sight in viewport space (engine-free seam), project
    // into shape space through the editor's own camera math (rule 2).
    const anchors = sightPortDots(wrapper, nodeId).map((sighting): PortAnchor => {
      const local = editor.getPointInShapeSpace(shape.id, editor.screenToPage({ x: sighting.clientX, y: sighting.clientY }));
      return { portId: sighting.portId, x: local.x, y: local.y, side: sighting.side };
    });
    bridge.reportAnchors(nodeId, anchors);
  }, [editor, nodeId, shape.id]);

  // Every render, equality-guarded (the guard lives in `reportAnchors` /
  // the 0.5px prop deltas above): a rail reorder moves dots WITHOUT
  // resizing the node, so a ResizeObserver alone would sleep through it —
  // but the reorder re-renders this component via the scene context, and
  // this effect rides that render. Same reasoning as reactFlowHost.tsx's
  // MeasuredPortHandles.
  useLayoutEffect(() => {
    measure();
  });

  // Rails land one layout pass after the Block they attach to, and fonts /
  // editor chrome can settle later still — one deferred frame plus a
  // ResizeObserver covers both (the same race wireLayer.tsx documents).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  if (!host || !node) return null;

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        // Dots straddle the walls and labels hang outside them — the same
        // overflow the pre-reset adapter's shapes needed
        // (port-shape-util.tsx's `overflow: "visible"`).
        overflow: "visible",
        pointerEvents: "all",
      }}
    >
      <div
        ref={wrapperRef}
        data-scene-node={nodeId}
        // The code face is wall-to-wall editor and the editor owns its
        // pointer — a 10px host-owned grab ring is what makes the shape
        // repositionable at all. Host chrome, not component; same device as
        // reactFlowHost.tsx's BboxNode.
        style={{ position: "absolute", left: 0, top: 0, width: "max-content", padding: node.type === "code" ? 10 : 0 }}
        onPointerDownCapture={(event) => {
          if (contentOwnsPress(node.type, nodeId, event.target as Element)) {
            editor.markEventAsHandled(event);
          }
        }}
      >
        <SceneNodeView scene={host.scene} node={node} wired={host.wired} onSceneChange={host.onSceneChange} decorate={host.decorate} />
      </div>
    </HTMLContainer>
  );
}

export class BboxNodeShapeUtil extends ShapeUtil<BboxNodeShape> {
  static override type = "bbox-node" as const;

  static override props = {
    w: T.number,
    h: T.number,
    nodeId: T.string,
  };

  override getDefaultProps(): BboxNodeShape["props"] {
    return { w: 160, h: 100, nodeId: "" };
  }

  override getGeometry(shape: BboxNodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  /** Resize is a box gesture; only the block face has an authored box in
   *  the scene to write it back into — the same gate reactFlowHost.tsx
   *  applies by mounting `NodeResizer` on block nodes only. */
  override canResize(shape: BboxNodeShape): boolean {
    return (nodeForShape(this.editor, shape)?.type ?? "block") === "block";
  }

  override onResize(shape: BboxNodeShape, info: TLResizeInfo<BboxNodeShape>) {
    return resizeBox(shape, info);
  }

  override onResizeEnd(_initial: BboxNodeShape, current: BboxNodeShape) {
    // One write at release, never per-move — the scene doc's own rule ("a
    // host mid-drag owns the moving copy and writes back here at rest"),
    // and the same floor guard as reactFlowHost.tsx's NodeResizer: a result
    // the resize's own constraints could never legitimately produce is a
    // mismeasured gesture, not a resize — drop it.
    const bridge = bridgeFor(this.editor);
    const node = nodeForShape(this.editor, current);
    if (!bridge?.onSceneChange || !node) return;
    if (current.props.w < TLDRAW_RESIZE_MIN_WIDTH || current.props.h < TLDRAW_RESIZE_MIN_HEIGHT) return;
    bridge.onSceneChange({
      ...bridge.scene,
      nodes: bridge.scene.nodes.map((candidate) =>
        candidate.id === node.id
          ? {
              ...candidate,
              position: { x: current.x, y: current.y },
              data: { ...candidate.data, w: current.props.w, h: current.props.h },
            }
          : candidate,
      ),
    });
  }

  override onTranslateEnd(_initial: BboxNodeShape, current: BboxNodeShape) {
    // Position writes back at rest; mid-drag tldraw owns the moving copy —
    // the same seam every other interaction uses.
    const bridge = bridgeFor(this.editor);
    const node = nodeForShape(this.editor, current);
    if (!bridge?.onSceneChange || !node) return;
    if (node.position.x === current.x && node.position.y === current.y) return;
    bridge.onSceneChange({
      ...bridge.scene,
      nodes: bridge.scene.nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, position: { x: current.x, y: current.y } } : candidate,
      ),
    });
  }

  override component(shape: BboxNodeShape) {
    return <BboxNodeShapeComponent shape={shape} />;
  }

  override getIndicatorPath(shape: BboxNodeShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

const SHAPE_UTILS = [BboxNodeShapeUtil];

/* ------------------------------------------------------------------ */
/* The wire overlay — anchors × live shape transforms, no DOM           */
/* ------------------------------------------------------------------ */

interface ResolvedWireRender {
  id: string;
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  curve: { dx: number; dy: number };
  variant?: "data" | "async" | "delayed";
  routing?: Parameters<typeof Trace>[0]["routing"];
  markerEnd?: Parameters<typeof Trace>[0]["markerEnd"];
  color?: string;
}

/**
 * Painted through tldraw's `OnTheCanvas` slot, which mounts INSIDE
 * `.tl-html-layer` before the shapes layer (@tldraw/editor
 * DefaultCanvas.tsx:147-150) — page coordinates for free, wires under
 * shapes. That is the DONOR's posture (SystemSketch's
 * `keepConnectionsAtBottom`: "Cables paint under Blocks") and React Flow's
 * stock one (edges render beneath nodes); the DOM host's `WireLayer` paints
 * ABOVE blocks instead because there the dots and the wires share one
 * unlayered plane (wireLayer.tsx's D-B1 note). Here the dots already paint
 * above the card inside their own shape, so an under-shapes wire loses only
 * the half-dot of approach the card was always going to cover.
 *
 * The paint itself is the trunk's own (`Trace`, exactly as
 * wireLayer.tsx:196-212 mounts it) — "the host owns the geometry, the core
 * owns the paint" (demos/scene/src/TraceEdge.tsx's split). The geometry
 * here is anchors (shape-local points) pushed through
 * `editor.getShapePageTransform` inside `useValue`, so a mid-drag shape
 * moves its wires live without any DOM read.
 */
function WireOverlay() {
  const editor = useEditor();
  const host = useContext(TldrawHostContext);
  const scene = host?.scene;
  const anchors = host?.anchors;

  const state = useValue(
    "bbox tldraw wires",
    () => {
      if (!scene || !anchors) return { resolved: [] as ResolvedWireRender[], unresolvedIds: [] as string[] };
      const wires = sceneWires(scene);
      const fans = fanWires(wires);
      const resolved: ResolvedWireRender[] = [];
      const unresolvedIds: string[] = [];
      const endPoint = (blockId: string, portId: string): { x: number; y: number; side: BlockSide } | null => {
        const anchor = anchors[blockId]?.find((candidate) => candidate.portId === portId);
        if (!anchor) return null;
        const transform = editor.getShapePageTransform(shapeIdForNode(blockId));
        if (!transform) return null;
        const page = transform.applyToPoint({ x: anchor.x, y: anchor.y });
        const shape = editor.getShape<BboxNodeShape>(shapeIdForNode(blockId));
        const side = anchor.side ?? (shape && anchor.x < shape.props.w / 2 ? "left" : "right");
        return { x: page.x, y: page.y, side };
      };
      wires.forEach((wire, i) => {
        const from = endPoint(wire.from.blockId, wire.from.portId);
        const to = endPoint(wire.to.blockId, wire.to.portId);
        if (!from || !to) {
          // Skipped, not guessed at — WireLayer's own unresolved channel,
          // kept so a story can assert every edge resolved.
          unresolvedIds.push(wire.id);
          return;
        }
        resolved.push({
          id: wire.id,
          from: { x: from.x, y: from.y, dir: from.side as TraceDir },
          to: { x: to.x, y: to.y, dir: OPPOSITE_DIR[to.side as TraceDir] },
          curve: fans[i].offset,
          variant: wire.variant,
          routing: wire.routing,
          markerEnd: wire.markerEnd,
          color: wire.color,
        });
      });
      return { resolved, unresolvedIds };
    },
    [editor, scene, anchors],
  );

  return (
    <svg
      data-slot="wire-layer"
      data-unresolved-wires={state.unresolvedIds.join(",")}
      style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}
    >
      {state.resolved.map(({ id, from, to, curve, variant, routing, markerEnd, color }) => (
        <g key={id} data-wire-id={id}>
          <Trace
            id={id}
            from={from}
            to={to}
            routing={routing}
            variant={variant ?? "data"}
            color={color}
            markerEnd={markerEnd}
            curve={curve}
            terminals={false}
          />
        </g>
      ))}
    </svg>
  );
}

const COMPONENTS: TLComponents = { OnTheCanvas: WireOverlay };

/* ------------------------------------------------------------------ */
/* The host                                                            */
/* ------------------------------------------------------------------ */

export interface TldrawHostProps {
  scene: HostScene;
  /** Position writes (drag/resize), reorders, keystrokes — all one seam:
   *  the host writes interaction results back into the scene as data. Omit
   *  for a read-only bench. */
  onSceneChange?(next: HostScene): void;
  width?: number;
  height?: number;
  /** The story lane's paint seam — see `nodeViews.tsx`'s `Decorate`. Omit
   *  for byte-identical output to before this prop existed. */
  decorate?: Decorate;
}

export function TldrawHost({ scene, onSceneChange, width = 720, height = 400, decorate }: TldrawHostProps) {
  const editorRef = useRef<Editor | null>(null);
  const [anchors, setAnchors] = useState<Record<string, readonly PortAnchor[]>>({});

  const reportAnchors = useCallback((nodeId: string, next: PortAnchor[]) => {
    setAnchors((prev) => (sameAnchors(prev[nodeId], next) ? prev : { ...prev, [nodeId]: next }));
  }, []);

  const wired = useMemo(() => wiredPortsOf(scene), [scene]);
  const context = useMemo<TldrawHostContextValue>(
    () => ({ scene, wired, onSceneChange, anchors, reportAnchors, decorate }),
    [scene, wired, onSceneChange, anchors, reportAnchors, decorate],
  );

  // The ShapeUtil-side bridge (see bridgeByEditor) — a ref updated per
  // render so util callbacks always read the CURRENT scene, registered the
  // moment the editor exists.
  const bridgeRef = useRef<TldrawHostContextValue | null>(null);
  bridgeRef.current = context;

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      bridgeByEditor.set(editor, bridgeRef);
      // Deterministic bench: the same fixed viewport the other host
      // benches default to (zoom 1, origin 0), instant camera for tests.
      editor.user.updateUserPreferences({ animationSpeed: 0 });
      editor.setCamera({ x: 0, y: 0, z: 1 });
      // StrictMode-safe creation guard — the T0 spike's own device
      // (demos/story-hosts/src/TldrawHost.tsx handleMount).
      if (editor.getCurrentPageShapeIds().size === 0) {
        for (const node of topLevelNodes(scene)) {
          editor.createShape<BboxNodeShape>({
            id: shapeIdForNode(node.id),
            type: "bbox-node",
            x: node.position.x,
            y: node.position.y,
            props: {
              // A first-frame guess; the component's measurement corrects
              // it within a frame (see BboxNodeShapeComponent.measure).
              w: node.data.w ?? 160,
              h: node.data.h ?? 100,
              nodeId: node.id,
            },
          });
        }
      }
      editor.selectNone();
    },
    // Mount-time snapshot on purpose: shapes are created once; later scene
    // changes flow through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Scene → shapes: the at-rest reconciliation half. Mid-gesture tldraw
  // owns the moving copy (the guards), and the shape's own onTranslateEnd/
  // onResizeEnd wrote the rest state we are reading — so this effect is a
  // no-op right after a gesture and only moves shapes when the SCENE moved
  // first (a story writing positions, say).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.isIn("select.translating") || editor.isIn("select.resizing")) return;
    for (const node of topLevelNodes(scene)) {
      const shape = editor.getShape<BboxNodeShape>(shapeIdForNode(node.id));
      if (!shape) continue;
      if (Math.abs(shape.x - node.position.x) > 0.5 || Math.abs(shape.y - node.position.y) > 0.5) {
        editor.updateShape<BboxNodeShape>({ id: shape.id, type: "bbox-node", x: node.position.x, y: node.position.y });
      }
    }
  }, [scene]);

  useEffect(() => {
    return () => {
      const editor = editorRef.current;
      if (editor) bridgeByEditor.delete(editor);
      editorRef.current = null;
    };
  }, []);

  return (
    <div data-host="tldraw" style={{ position: "relative", width, height }}>
      <TldrawHostContext.Provider value={context}>
        {/* `colorScheme="system"` (a real 5.3.2 editor option; the older
         * `inferDarkMode` prop no longer exists) — without it tldraw pins
         * its LIGHT chrome inside this app's dark Storybook, and the trunk
         * faces' dim labels sit on a white canvas while the other two
         * benches render dark (seen in the 2026-09-17 three-host capture). */}
        <Tldraw shapeUtils={SHAPE_UTILS} components={COMPONENTS} onMount={handleMount} colorScheme="system" />
      </TldrawHostContext.Provider>
    </div>
  );
}
