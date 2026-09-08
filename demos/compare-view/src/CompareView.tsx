import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, type Viewport } from "@xyflow/react";
import { Tldraw, type Editor } from "tldraw";

import { BBoxBlockNode, BBoxPortNode } from "@bbox-ui/adapter-reactflow";
import {
  BBoxBlockShapeUtil,
  BBoxPortShapeUtil,
  setPortReceived,
} from "@bbox-ui/adapter-tldraw";
import type { Scene } from "@bbox-ui/demo-scene";
import { sceneToReactFlowNodes } from "@bbox-ui/demo-scene/reactflow";
import { sceneToTldrawShapes } from "@bbox-ui/demo-scene/tldraw";
import {
  extractionSummary,
  type ExtractionCounts,
} from "@bbox-ui/demo-scene/fromEditor";

import {
  camerasAgree,
  reactFlowToTldraw,
  tldrawToReactFlow,
  viewportsAgree,
} from "./cameraBridge";
import "./compare-view.css";

/**
 * Side-by-side / fullscreen / overlay comparison of the two hosts rendering
 * ONE scene. The point of the view: any visible or measured difference is
 * adapter drift, never content drift. demos/compare feeds it the fixed demo
 * scene (the regression net); the playground feeds it a scene derived from
 * its live board.
 *
 * WHY the cameras are linked, not pinned: both panes are live — pan and
 * zoom in either one and the other follows. Without the link the Overlay
 * slider is meaningless — crossfading two boards framed differently shows
 * the framing changing, not the board. It matters in Split too, which is
 * why Simulink ships a "Linked Scrolling" checkbox turned on by default.
 * The world→screen bridge between the two camera models (and the
 * zoom-dependent compensation it must recompute on every change) lives in
 * `cameraBridge.ts`.
 */
const ZOOM = 0.45;
const ORIGIN = { x: 50, y: 90 };

// tldraw clamps its camera to its zoomSteps' extremes [0.05, 8]; React Flow
// is pinned to the same bounds so neither host can zoom where the other
// cannot follow — a one-sided clamp would silently break the link.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

const nodeTypes = {
  bboxBlock: BBoxBlockNode,
  bboxStandalonePort: BBoxPortNode,
};
const shapeUtils = [BBoxBlockShapeUtil, BBoxPortShapeUtil];

/**
 * The slice of a React Flow instance the camera link needs. WHY not
 * `ReactFlowInstance`: that type is generic over the node type and
 * invariant in it, so the instance `onInit` hands over (typed to the
 * scene's node) refuses to assign to a plainly-typed slot. The viewport
 * helpers are the only part the link touches and they carry no generics.
 */
interface ViewportHost {
  getViewport(): Viewport;
  setViewport(viewport: Viewport): Promise<unknown>;
}

const MODES = ["split", "reactflow", "tldraw", "overlay"] as const;
type Mode = (typeof MODES)[number];

function modeFromHash(): Mode {
  const hash = window.location.hash.replace(/^#/, "");
  return (MODES as readonly string[]).includes(hash) ? (hash as Mode) : "split";
}

/* ------------------------------------------------------------------ */
/* Divergence measurement — numbers, not eyeballs                      */
/* ------------------------------------------------------------------ */

interface PortDelta {
  id: string;
  dx: number;
  dy: number;
}

interface BlockDelta {
  title: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  ports: PortDelta[];
}

interface Divergence {
  rows: BlockDelta[];
  /** Standalone port dots, paired across hosts by id. */
  standalonePorts: PortDelta[];
  maxAbs: number;
  /** The live camera zoom the reading was taken at. */
  zoom: number | null;
  measuredAt: number;
}

interface HostBlockGeometry {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Record<string, { cx: number; cy: number }>;
}

interface PaneGeometry {
  blocks: Record<string, HostBlockGeometry>;
  standalonePorts: Record<string, { cx: number; cy: number }>;
}

/**
 * Both hosts stamp ids the harness pairs on: React Flow the scene id, tldraw
 * the shape id, which is the scene id behind a `shape:` prefix. Strip the
 * prefix so the two sides meet on one key.
 * WHY ids and not titles: titles are user text and can repeat on an authored
 * board — a collision would mispair the measurement.
 */
const pairingId = (raw: string) => raw.replace(/^shape:/, "");

/** Block and port-dot geometry in screen px relative to the pane's origin. */
function measurePane(pane: HTMLElement): PaneGeometry {
  const paneRect = pane.getBoundingClientRect();
  const blocks: Record<string, HostBlockGeometry> = {};
  for (const blockEl of pane.querySelectorAll<HTMLElement>('[data-slot="block"]')) {
    const title =
      blockEl.querySelector('[data-slot="block-title"]')?.textContent?.trim() ??
      "?";
    const rect = blockEl.getBoundingClientRect();
    // WHY skip empty rects: tldraw CULLS shapes fully outside the viewport
    // (display: none), so a block panned far offscreen measures as a rect
    // at (0,0) and would register thousands of px of fake divergence.
    // React Flow renders everything, so the diff below simply drops blocks
    // the other host is not painting; `rows.length` is the honest count of
    // blocks a reading actually compared.
    if (rect.width === 0 || rect.height === 0) continue;
    const ports: Record<string, { cx: number; cy: number }> = {};
    const portEls = blockEl.querySelectorAll<HTMLElement>(
      "[data-port-id], .react-flow__handle",
    );
    for (const portEl of portEls) {
      const id = portEl.dataset.portId ?? portEl.dataset.handleid ?? "?";
      const dotEl = portEl.matches(".react-flow__handle")
        ? portEl
        : portEl.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? portEl;
      const dotRect = dotEl.getBoundingClientRect();
      ports[id] = {
        cx: (dotRect.left + dotRect.right) / 2 - paneRect.left,
        cy: (dotRect.top + dotRect.bottom) / 2 - paneRect.top,
      };
    }
    blocks[pairingId(blockEl.dataset.blockId ?? title)] = {
      title,
      x: rect.left - paneRect.left,
      y: rect.top - paneRect.top,
      w: rect.width,
      h: rect.height,
      ports,
    };
  }
  const standalonePorts: Record<string, { cx: number; cy: number }> = {};
  for (const portEl of pane.querySelectorAll<HTMLElement>(
    "[data-standalone-port-id]",
  )) {
    const dotEl =
      portEl.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? portEl;
    const dotRect = dotEl.getBoundingClientRect();
    if (dotRect.width === 0 || dotRect.height === 0) continue; // culled
    standalonePorts[pairingId(portEl.dataset.standalonePortId ?? "?")] = {
      cx: (dotRect.left + dotRect.right) / 2 - paneRect.left,
      cy: (dotRect.top + dotRect.bottom) / 2 - paneRect.top,
    };
  }
  return { blocks, standalonePorts };
}

function measureDivergence(): Divergence | null {
  const rfPane = document.getElementById("pane-reactflow");
  const tlPane = document.getElementById("pane-tldraw");
  if (!rfPane || !tlPane) return null;
  const rf = measurePane(rfPane);
  const tl = measurePane(tlPane);
  const rows: BlockDelta[] = [];
  let maxAbs = 0;
  const track = (value: number) => {
    maxAbs = Math.max(maxAbs, Math.abs(value));
    return value;
  };
  for (const [blockId, rfBlock] of Object.entries(rf.blocks)) {
    const tlBlock = tl.blocks[blockId];
    if (!tlBlock) continue;
    const ports: PortDelta[] = [];
    for (const [portId, rfPort] of Object.entries(rfBlock.ports)) {
      const tlPort = tlBlock.ports[portId];
      if (!tlPort) continue;
      ports.push({
        id: portId,
        dx: track(rfPort.cx - tlPort.cx),
        dy: track(rfPort.cy - tlPort.cy),
      });
    }
    rows.push({
      title: rfBlock.title,
      dx: track(rfBlock.x - tlBlock.x),
      dy: track(rfBlock.y - tlBlock.y),
      dw: track(rfBlock.w - tlBlock.w),
      dh: track(rfBlock.h - tlBlock.h),
      ports,
    });
  }
  const standalonePorts: PortDelta[] = [];
  for (const [portId, rfPort] of Object.entries(rf.standalonePorts)) {
    const tlPort = tl.standalonePorts[portId];
    if (!tlPort) continue;
    standalonePorts.push({
      id: portId,
      dx: track(rfPort.cx - tlPort.cx),
      dy: track(rfPort.cy - tlPort.cy),
    });
  }
  if (rows.length === 0 && standalonePorts.length === 0) return null;
  return {
    rows,
    standalonePorts,
    maxAbs,
    zoom: window.reactFlow?.getViewport().zoom ?? null,
    measuredAt: Date.now(),
  };
}

declare global {
  interface Window {
    editor?: Editor;
    reactFlow?: ViewportHost;
    __bboxCompare?: Divergence | null;
    /** Force a fresh reading now — the headless driver's hook. */
    __bboxMeasureNow?: () => Divergence | null;
    /** The pure camera maths, exposed so the driver can frame exact zooms. */
    __bboxBridge?: {
      reactFlowToTldraw: typeof reactFlowToTldraw;
      tldrawToReactFlow: typeof tldrawToReactFlow;
    };
  }
}

/* ------------------------------------------------------------------ */
/* Linked cameras                                                      */
/* ------------------------------------------------------------------ */

/**
 * Keep the two hosts' cameras in agreement, in BOTH directions, so either
 * pane can lead. Ported from SystemSketch's `useLinkedCameras`: an
 * `applying` re-entrancy flag so a sync does not echo back, compare before
 * writing and only write when the camera actually differs, one sync on
 * mount to bring the panes into agreement immediately, and a cleanup that
 * removes the listener. The one structural difference: React Flow has no
 * store to listen to, so its direction is the `onMove` handler this hook
 * returns for the caller to wire as a prop.
 */
function useLinkedHostCameras(
  tldrawEditor: Editor | null,
  reactFlow: ViewportHost | null,
  onSynced?: () => void,
) {
  const applyingRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  // tldraw → React Flow. The camera is a session-scope store record, so one
  // listener sees every pan, zoom and resize adjustment.
  useEffect(() => {
    if (!tldrawEditor || !reactFlow) return;
    const sync = () => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      const viewport = tldrawToReactFlow(tldrawEditor.getCamera());
      if (!viewportsAgree(viewport, reactFlow.getViewport())) {
        void reactFlow.setViewport(viewport);
        onSyncedRef.current?.();
      }
      applyingRef.current = false;
    };
    const stop = tldrawEditor.store.listen(sync, { scope: "session" });
    sync();
    return stop;
  }, [tldrawEditor, reactFlow]);

  // React Flow → tldraw.
  return useCallback(
    (_event: unknown, viewport: Viewport) => {
      if (!tldrawEditor || applyingRef.current) return;
      applyingRef.current = true;
      const camera = reactFlowToTldraw(viewport);
      if (!camerasAgree(camera, tldrawEditor.getCamera())) {
        tldrawEditor.setCamera(camera, { immediate: true });
        onSyncedRef.current?.();
      }
      applyingRef.current = false;
    },
    [tldrawEditor],
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

const paneBase: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  background: "#ffffff",
};

// Bottom-left: the top edge belongs to the centered mode control, which
// would cover a top badge on the right-hand split pane.
const badgeStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 10,
  zIndex: 20,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  color: "#fff",
  pointerEvents: "none",
};

export interface CompareViewProps {
  /** What both panes render. Any difference left is adapter drift. */
  scene: Scene;
  /**
   * Honest counting for a scene derived from a live board: how many of the
   * board's shapes the comparison actually covers, what was excluded (stock
   * tldraw shapes have no React Flow counterpart) and what rides in a
   * wrapper. Absent for the fixed demo scene, where every shape is compared.
   */
  provenance?: ExtractionCounts;
  /**
   * Keep the mode in `location.hash` (#split/#overlay…). The standalone
   * compare demo does; embedded in the playground the mode stays local so
   * entering compare never rewrites the app's URL.
   */
  useHashMode?: boolean;
  /** Renders a Back button that leaves compare mode (the playground's exit). */
  onExit?: () => void;
}

export function CompareView({
  scene,
  provenance,
  useHashMode = false,
  onExit,
}: CompareViewProps) {
  const [mode, setMode] = useState<Mode>(useHashMode ? modeFromHash : "split");
  /**
   * How the overlay composites, crossfade being what opens.
   *
   * WHY crossfade is the default: it is what SystemSketch's Compare screen
   * does — a plain opacity fade between the two panes, no `mix-blend-mode`
   * — and this harness clones that screen's conventions. The difference
   * blend stays one toggle away because it is the thing that PROVES
   * convergence: matching pixels cancel to black, so any divergence is
   * literally the only thing that lights up.
   */
  const [blendMode, setBlendMode] = useState<"crossfade" | "difference">(
    "crossfade",
  );
  /** 0 shows React Flow (the bottom pane), 100 shows tldraw (the top). */
  const [blend, setBlend] = useState(100);
  const [divergence, setDivergence] = useState<Divergence | null>(null);
  const [tldrawEditor, setTldrawEditor] = useState<Editor | null>(null);
  const [reactFlow, setReactFlow] = useState<ViewportHost | null>(null);

  const nodes = useMemo(() => sceneToReactFlowNodes(scene), [scene]);
  const tldrawScene = useMemo(() => sceneToTldrawShapes(scene), [scene]);

  const summary = provenance ? extractionSummary(provenance) : null;

  useEffect(() => {
    if (!useHashMode) return;
    const onHashChange = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [useHashMode]);

  const measureNow = useCallback(() => {
    const measured = measureDivergence();
    window.__bboxCompare = measured;
    setDivergence(measured);
    return measured;
  }, []);

  // A camera sync can fire many times per frame mid-gesture; coalesce the
  // DOM measurement to one reading per painted frame.
  const measureQueued = useRef(false);
  const scheduleMeasure = useCallback(() => {
    if (measureQueued.current) return;
    measureQueued.current = true;
    requestAnimationFrame(() => {
      measureQueued.current = false;
      measureNow();
    });
  }, [measureNow]);

  useEffect(() => {
    window.__bboxMeasureNow = measureNow;
    window.__bboxBridge = { reactFlowToTldraw, tldrawToReactFlow };
  }, [measureNow]);

  // The readout updates on every camera change (via `scheduleMeasure`
  // below); this slow tick only covers changes with no camera event, like
  // fonts settling after load.
  useEffect(() => {
    measureNow();
    const interval = window.setInterval(measureNow, 500);
    return () => window.clearInterval(interval);
  }, [mode, measureNow]);

  const onReactFlowMove = useLinkedHostCameras(
    tldrawEditor,
    reactFlow,
    scheduleMeasure,
  );

  const handleTldrawMount = useCallback(
    (editor: Editor) => {
      window.editor = editor;
      editor.createShapes(tldrawScene.shapes);
      // Runtime-only "Data Recived" paint — never written into the document.
      for (const { shapeId, portId } of tldrawScene.receivedPorts) {
        setPortReceived(shapeId, portId, true);
      }
      // A comparison is looked at, not drawn on — but it IS panned and
      // zoomed, so the camera stays unlocked and the hand tool makes
      // left-drag pan, matching React Flow's `panOnDrag`.
      editor.updateInstanceState({ isReadonly: true });
      editor.setCurrentTool("hand");
      // WHY wheelBehavior zoom: React Flow's default is zoom-on-scroll;
      // leaving tldraw on its pan-on-scroll default would give the two panes
      // different gestures for the same intent.
      editor.setCameraOptions({ wheelBehavior: "zoom" });
      editor.setCamera(
        reactFlowToTldraw({ x: ORIGIN.x, y: ORIGIN.y, zoom: ZOOM }),
        { immediate: true },
      );
      setTldrawEditor(editor);
    },
    [tldrawScene],
  );

  const pickMode = (next: Mode) => {
    if (useHashMode) window.location.hash = next;
    setMode(next);
  };

  // WHY visibility and not display: `display: none` collapses tldraw's
  // container to 0×0, its resize handling re-centres the camera on the way
  // out AND back, and the link would faithfully copy both detours into
  // React Flow. `visibility: hidden` keeps layout, so neither host ever
  // sees a zero-sized viewport.
  const rfStyle: React.CSSProperties = {
    ...paneBase,
    left: 0,
    width: mode === "split" ? "50%" : "100%",
    visibility: mode === "tldraw" ? "hidden" : "visible",
  };
  const tlStyle: React.CSSProperties = {
    ...paneBase,
    left: mode === "split" ? "50%" : 0,
    width: mode === "split" ? "50%" : "100%",
    visibility: mode === "reactflow" ? "hidden" : "visible",
    mixBlendMode:
      mode === "overlay" && blendMode === "difference" ? "difference" : "normal",
    // The top layer is what the slider fades; the bottom one always paints.
    opacity: mode === "overlay" && blendMode === "crossfade" ? blend / 100 : 1,
    borderLeft: mode === "split" ? "2px solid #334155" : "none",
    zIndex: mode === "overlay" ? 10 : "auto",
  };

  /*
   * The crossfade control, built ONCE and placed into the slot the mode
   * needs — SystemSketch's rule, kept for its reason: a slider that gained
   * a step size in one placement and not the other would be a bug nobody
   * would see until they scrubbed in the wrong mode.
   */
  const blendControl = (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>React Flow</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={blend}
        data-testid="compare-blend"
        aria-label="Crossfade React Flow to tldraw"
        onChange={(event) => setBlend(Number(event.target.value))}
      />
      <span>tldraw</span>
      <output
        data-testid="compare-blend-value"
        style={{ minWidth: 38, fontVariantNumeric: "tabular-nums" }}
      >
        {blend}%
      </output>
    </label>
  );

  return (
    <div
      className="bbox-compare-view"
      style={{ position: "fixed", inset: 0, background: "#ffffff" }}
    >
      <div id="pane-reactflow" style={rfStyle}>
        {mode !== "overlay" && (
          <span style={{ ...badgeStyle, background: "#1d4ed8" }}>React Flow</span>
        )}
        <ReactFlow
          defaultNodes={nodes}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: ORIGIN.x, y: ORIGIN.y, zoom: ZOOM }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          onInit={(instance) => {
            window.reactFlow = instance;
            setReactFlow(instance);
          }}
          onMove={onReactFlowMove}
          // WHY the nodes stay frozen while the camera roams: content
          // parity is the harness's point — a node dragged in one pane
          // would be adapter drift faked by hand.
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        />
      </div>
      <div id="pane-tldraw" style={tlStyle}>
        {mode !== "overlay" && (
          <span style={{ ...badgeStyle, background: "#0f766e" }}>tldraw</span>
        )}
        <Tldraw hideUi shapeUtils={shapeUtils} onMount={handleTldrawMount} />
      </div>

      {/* Mode control — always visible */}
      <div
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 6,
            borderRadius: 10,
            background: "#0f172a",
            fontSize: 13,
            color: "#fff",
          }}
        >
          {onExit && (
            <>
              <button
                data-testid="compare-exit"
                onClick={onExit}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #64748b",
                  cursor: "pointer",
                  background: "transparent",
                  color: "#e2e8f0",
                }}
              >
                ← Back
              </button>
              <span style={{ width: 1, height: 20, background: "#334155" }} />
            </>
          )}
          {MODES.map((candidate) => (
            <button
              key={candidate}
              data-mode={candidate}
              data-testid={`compare-mode-${candidate}`}
              onClick={() => pickMode(candidate)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: mode === candidate ? "#38bdf8" : "#1e293b",
                color: mode === candidate ? "#0f172a" : "#e2e8f0",
                fontWeight: mode === candidate ? 600 : 400,
              }}
            >
              {candidate === "reactflow"
                ? "React Flow"
                : candidate === "tldraw"
                  ? "tldraw"
                  : candidate[0].toUpperCase() + candidate.slice(1)}
            </button>
          ))}
          {mode === "overlay" && (
            <>
              <span style={{ width: 1, height: 20, background: "#334155" }} />
              <button
                data-blend-toggle
                onClick={() =>
                  setBlendMode(
                    blendMode === "crossfade" ? "difference" : "crossfade",
                  )
                }
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #38bdf8",
                  cursor: "pointer",
                  background: "transparent",
                  color: "#38bdf8",
                }}
              >
                {blendMode}
              </button>
              {/* Difference composites both panes at full strength, so the
                  slider is absent rather than inert. */}
              {blendMode === "crossfade" && blendControl}
            </>
          )}
        </div>
        {/* The denominator, always in view when the scene came off a live
            board: what is compared, what is excluded and why. A clean number
            silent about its denominator would be a lie of omission. */}
        {summary && !summary.empty && (
          <div
            data-compare-summary
            style={{
              padding: "3px 10px",
              borderRadius: 8,
              background: "rgba(15, 23, 42, 0.85)",
              color: "#cbd5e1",
              fontSize: 12,
              maxWidth: 640,
              textAlign: "center",
            }}
          >
            {summary.headline}
            {summary.notes.map((note) => (
              <div key={note} style={{ color: "#94a3b8" }}>
                {note}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zero bbox-ui shapes: an explicit empty state, NEVER a clean
          "max |Δ| = 0.00 px" — zero things compared is not agreement. */}
      {summary?.empty && (
        <div
          data-compare-empty
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 100,
            maxWidth: 460,
            padding: "18px 24px",
            borderRadius: 12,
            background: "rgba(15, 23, 42, 0.92)",
            color: "#e2e8f0",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700 }}>{summary.headline}</div>
          <div style={{ color: "#94a3b8", marginTop: 6, fontSize: 12 }}>
            Place a Block (B) or Port (P) on the board, then re-enter compare
            mode.
          </div>
        </div>
      )}

      {/* Divergence readout — a number that can go to zero beats a picture.
          It updates on every camera sync, so it can be watched live while
          panning and zooming. */}
      {mode === "overlay" && !summary?.empty && (
        <div
          data-compare-panel
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 100,
            minWidth: 320,
            maxHeight: "60%",
            overflow: "auto",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(15, 23, 42, 0.92)",
            color: "#e2e8f0",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            React Flow − tldraw (screen px)
          </div>
          {divergence == null ? (
            <div>measuring…</div>
          ) : (
            <>
              <div
                style={{
                  marginBottom: 6,
                  color: divergence.maxAbs < 0.5 ? "#4ade80" : "#f87171",
                }}
              >
                max |Δ| = {divergence.maxAbs.toFixed(2)} px
                {divergence.zoom != null && (
                  <span style={{ color: "#94a3b8" }}>
                    {" "}
                    @ zoom {divergence.zoom.toFixed(2)}
                  </span>
                )}
              </div>
              {summary && (
                <div style={{ marginBottom: 6, color: "#94a3b8" }}>
                  {summary.headline}
                  {summary.notes.map((note) => (
                    <div key={note}>{note}</div>
                  ))}
                </div>
              )}
              {divergence.rows.map((row) => (
                <div key={row.title} style={{ marginBottom: 4 }}>
                  <div style={{ color: "#93c5fd" }}>
                    {row.title} Δpos ({row.dx.toFixed(2)}, {row.dy.toFixed(2)})
                    Δsize ({row.dw.toFixed(2)}, {row.dh.toFixed(2)})
                  </div>
                  {row.ports.map((port) => (
                    <div key={port.id} style={{ paddingLeft: 12 }}>
                      ○ {port.id}: Δ ({port.dx.toFixed(2)}, {port.dy.toFixed(2)})
                    </div>
                  ))}
                </div>
              ))}
              {divergence.standalonePorts.map((port) => (
                <div key={port.id}>
                  <span style={{ color: "#93c5fd" }}>○ port {port.id}</span>: Δ (
                  {port.dx.toFixed(2)}, {port.dy.toFixed(2)})
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
