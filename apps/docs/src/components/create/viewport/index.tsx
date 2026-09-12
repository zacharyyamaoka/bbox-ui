"use client";

import dynamic from "next/dynamic";
import { RENDERS, VIEWS, type ViewportProps } from "../contract";
import { DomPreview } from "./dom-preview";
import { CodeView } from "./code-view";

// Both canvases touch window at import time and have no server story, so
// they load client-only. The DOM render is ordinary and renders on the server.
const ReactFlowCanvas = dynamic(() => import("./reactflow-canvas").then((m) => m.ReactFlowCanvas), {
  ssr: false,
  loading: () => <CanvasLoading name="React Flow" />,
});
const TldrawCanvas = dynamic(() => import("./tldraw-canvas").then((m) => m.TldrawCanvas), {
  ssr: false,
  loading: () => <CanvasLoading name="tldraw" />,
});

function CanvasLoading({ name }: { name: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading {name}…</div>;
}

const tabClass =
  "-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground";

/**
 * Two tab groups over one bench: RENDERS on the left, VIEWS on the right.
 * Six combinations, one state. Zach, 2026-09-11: "3 different renders on
 * the left side, 2 different views on the right side — that way you get 6
 * different views in total."
 *
 * WHY a canvas is mounted only while its render is active: tldraw and React
 * Flow each hold a live store and listeners. Because the page owns the state,
 * remounting is free — a canvas rebuilds from the same arrays and lands
 * exactly where it left off.
 */
export function Viewport(p: ViewportProps) {
  return (
    <div data-slot="viewport" className="flex h-full min-h-0 flex-col">
      <div data-slot="viewport-tabs" className="flex shrink-0 items-center border-b border-border px-3">
        <div role="tablist" aria-label="Render" data-slot="render-tabs" className="flex items-center gap-1">
          {RENDERS.map((r) => (
            <button
              key={r.id}
              role="tab"
              type="button"
              data-slot="render-tab"
              data-render={r.id}
              aria-selected={p.render === r.id}
              onClick={() => p.onRenderChange(r.id)}
              className={tabClass}
              title={r.canMove ? "Instances can be moved and multi-selected here" : "Instances render as plain DOM here"}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div role="tablist" aria-label="View" data-slot="view-tabs" className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              data-slot="view-tab"
              data-view={v.id}
              aria-selected={p.view === v.id}
              onClick={() => p.onViewChange(v.id)}
              className={tabClass}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {/* WHY the well is plain, not a dotted grid: Zach, 2026-09-11 — "the DOM
          background should just be plain, so we don't think it's a canvas or
          something; the dots make it look like React Flow." Each canvas paints
          its own ground (React Flow's <Background>, tldraw's grid); the well
          stays the page colour so the DOM render reads as what it is. */}
      <div
        data-slot="viewport-well"
        data-render={p.render}
        data-view={p.view}
        className="relative m-3 min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background"
      >
        <Body {...p} />
      </div>
    </div>
  );
}

function Body(p: ViewportProps) {
  if (p.view === "code") {
    return <CodeView render={p.render} entries={p.entries} instances={p.instances} roots={p.roots} selectedIds={p.selectedIds} positions={p.positions} />;
  }
  switch (p.render) {
    case "dom":
      return (
        <DomPreview
          entries={p.entries}
          instances={p.instances}
          roots={p.roots}
          selectedIds={p.selectedIds}
          onSelectionChange={p.onSelectionChange}
          onSelectInstance={p.onSelectInstance}
        />
      );
    case "reactflow":
      return (
        <ReactFlowCanvas
          entries={p.entries}
          instances={p.instances}
          roots={p.roots}
          onSelectInstance={p.onSelectInstance}
          selectedIds={p.selectedIds}
          positions={p.positions}
          onSelectionChange={p.onSelectionChange}
          onPositionsChange={p.onPositionsChange}
        />
      );
    case "tldraw":
      return (
        <TldrawCanvas
          entries={p.entries}
          instances={p.instances}
          roots={p.roots}
          onSelectInstance={p.onSelectInstance}
          selectedIds={p.selectedIds}
          positions={p.positions}
          onSelectionChange={p.onSelectionChange}
          onPositionsChange={p.onPositionsChange}
        />
      );
  }
}
