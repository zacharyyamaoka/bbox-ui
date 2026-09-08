import { useEffect, useState } from "react";
import { ReactFlow } from "@xyflow/react";
import { Tldraw, type Editor } from "tldraw";

import { BBoxBlockNode } from "@bbox-ui/adapter-reactflow";
import { BBoxBlockShapeUtil, setPortReceived } from "@bbox-ui/adapter-tldraw";
import { sceneToReactFlowNodes } from "@bbox-ui/demo-scene/reactflow";
import { sceneToTldrawShapes } from "@bbox-ui/demo-scene/tldraw";

/**
 * Side-by-side / fullscreen / overlay comparison of the two hosts rendering
 * the ONE shared scene (demos/scene). The point of the harness: any visible
 * or measured difference is adapter drift, never content drift.
 *
 * WHY the cameras are pinned: React Flow maps world→screen as
 * `world * zoom + viewport.xy`; tldraw as `(page + camera.xy) * z`. Locking
 * both to the same zoom and the same world origin
 * (viewport = ORIGIN, camera = ORIGIN / zoom) makes the two canvases
 * pixel-commensurable, which is what gives the overlay's difference blend
 * meaning — without it the modes would compare camera policy, not the kit.
 * All interaction is disabled for the same reason: one pan would silently
 * de-calibrate the comparison.
 */
const ZOOM = 0.45;
const ORIGIN = { x: 50, y: 90 };

/**
 * The tldraw camera that puts world (0,0) exactly at screen ORIGIN.
 *
 * WHY not simply ORIGIN / ZOOM: tldraw's `getHtmlLayerTransform` renders the
 * HTML shape layer as `scale(z) translate(x + offset, y + offset)` where
 * `offset` is a zoom-dependent nudge (modulated [0.1,1]→[-2,0.125] below
 * z=1, [1,8]→[0.125,0.5] above), and the 1×1 layer element scales about its
 * own centre, adding another 0.5·(1−z). Left uncompensated the two hosts
 * disagree by a constant whole-scene 0.25px at z=0.45 — measured before
 * this correction, 0.00px after. Both terms are deterministic in z, so the
 * harness cancels them here rather than shipping a silently misaligned
 * overlay.
 */
function tldrawCameraFor(origin: { x: number; y: number }, zoom: number) {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const layerOffset =
    zoom >= 1
      ? 0.125 + clamp01((zoom - 1) / 7) * (0.5 - 0.125)
      : -2 + clamp01((zoom - 0.1) / 0.9) * (0.125 - -2);
  const originShift = 0.5 * (1 - zoom);
  return {
    x: (origin.x - originShift) / zoom - layerOffset,
    y: (origin.y - originShift) / zoom - layerOffset,
    z: zoom,
  };
}

const nodeTypes = { bboxBlock: BBoxBlockNode };
const shapeUtils = [BBoxBlockShapeUtil];

// WHY no edges in either pane: edges are host-rendered chrome (only the
// React Flow host draws them today), so they would light up the difference
// blend forever without saying anything about the shared components.
const nodes = sceneToReactFlowNodes();
const { shapes, receivedPorts } = sceneToTldrawShapes();

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
  maxAbs: number;
  measuredAt: number;
}

interface HostBlockGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Record<string, { cx: number; cy: number }>;
}

/** Block and port-dot geometry in screen px relative to the pane's origin. */
function measurePane(pane: HTMLElement): Record<string, HostBlockGeometry> {
  const paneRect = pane.getBoundingClientRect();
  const blocks: Record<string, HostBlockGeometry> = {};
  for (const blockEl of pane.querySelectorAll<HTMLElement>('[data-slot="block"]')) {
    const title =
      blockEl.querySelector('[data-slot="block-title"]')?.textContent?.trim() ??
      "?";
    const rect = blockEl.getBoundingClientRect();
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
    blocks[title] = {
      x: rect.left - paneRect.left,
      y: rect.top - paneRect.top,
      w: rect.width,
      h: rect.height,
      ports,
    };
  }
  return blocks;
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
  for (const [title, rfBlock] of Object.entries(rf)) {
    const tlBlock = tl[title];
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
      title,
      dx: track(rfBlock.x - tlBlock.x),
      dy: track(rfBlock.y - tlBlock.y),
      dw: track(rfBlock.w - tlBlock.w),
      dh: track(rfBlock.h - tlBlock.h),
      ports,
    });
  }
  if (rows.length === 0) return null;
  return { rows, maxAbs, measuredAt: Date.now() };
}

declare global {
  interface Window {
    __bboxCompare?: Divergence | null;
  }
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

function handleTldrawMount(editor: Editor) {
  (window as { editor?: Editor }).editor = editor;
  editor.createShapes(shapes);
  // Runtime-only "Data Recived" paint — never written into the document.
  for (const { shapeId, portId } of receivedPorts) {
    setPortReceived(shapeId, portId, true);
  }
  editor.updateInstanceState({ isReadonly: true });
  const applyCamera = () =>
    editor.setCamera(tldrawCameraFor(ORIGIN, ZOOM), {
      immediate: true,
      force: true,
    });
  applyCamera();
  editor.setCameraOptions({ isLocked: true });
  // WHY re-assert: tldraw preserves the viewport CENTRE when its container
  // resizes (including the resize it sees while mounting), nudging the
  // camera off the pinned origin — measured 0.25px of whole-scene offset
  // against React Flow. Snap back after layout settles and on every pane
  // resize (mode switches change the pane width); `force` bypasses the lock.
  requestAnimationFrame(applyCamera);
  const observer = new ResizeObserver(() => requestAnimationFrame(applyCamera));
  observer.observe(editor.getContainer());
}

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

export function App() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [blend, setBlend] = useState<"difference" | "alpha">("difference");
  const [topOpacity, setTopOpacity] = useState(100);
  const [divergence, setDivergence] = useState<Divergence | null>(null);

  useEffect(() => {
    const onHashChange = () => setMode(modeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const tick = () => {
      const measured = measureDivergence();
      window.__bboxCompare = measured;
      setDivergence(measured);
    };
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [mode]);

  const pickMode = (next: Mode) => {
    window.location.hash = next;
    setMode(next);
  };

  const rfStyle: React.CSSProperties = {
    ...paneBase,
    left: 0,
    width: mode === "split" ? "50%" : "100%",
    display: mode === "tldraw" ? "none" : "block",
  };
  const tlStyle: React.CSSProperties = {
    ...paneBase,
    left: mode === "split" ? "50%" : 0,
    width: mode === "split" ? "50%" : "100%",
    display: mode === "reactflow" ? "none" : "block",
    // WHY difference blending: pixels the two hosts agree on cancel to
    // black, so any divergence is literally the only thing that lights up.
    mixBlendMode:
      mode === "overlay" && blend === "difference" ? "difference" : "normal",
    opacity: mode === "overlay" ? topOpacity / 100 : 1,
    borderLeft: mode === "split" ? "2px solid #334155" : "none",
    zIndex: mode === "overlay" ? 10 : "auto",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#ffffff" }}>
      <div id="pane-reactflow" style={rfStyle}>
        {mode !== "overlay" && (
          <span style={{ ...badgeStyle, background: "#1d4ed8" }}>React Flow</span>
        )}
        <ReactFlow
          defaultNodes={nodes}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: ORIGIN.x, y: ORIGIN.y, zoom: ZOOM }}
          minZoom={ZOOM}
          maxZoom={ZOOM}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
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
          alignItems: "center",
          gap: 6,
          padding: 6,
          borderRadius: 10,
          background: "#0f172a",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          color: "#fff",
        }}
      >
        {MODES.map((candidate) => (
          <button
            key={candidate}
            data-mode={candidate}
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
              onClick={() => {
                const next = blend === "difference" ? "alpha" : "difference";
                setBlend(next);
                setTopOpacity(next === "alpha" ? 50 : 100);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #38bdf8",
                cursor: "pointer",
                background: "transparent",
                color: "#38bdf8",
              }}
            >
              {blend === "difference" ? "difference" : "50% alpha"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              top
              <input
                type="range"
                min={0}
                max={100}
                value={topOpacity}
                onChange={(event) => setTopOpacity(Number(event.target.value))}
              />
              {topOpacity}%
            </label>
          </>
        )}
      </div>

      {/* Divergence readout — a number that can go to zero beats a picture */}
      {mode === "overlay" && (
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
              </div>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
