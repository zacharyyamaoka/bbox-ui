"use client";

import dynamic from "next/dynamic";
import { VIEWPORT_TABS, type ViewportProps, type ViewportTab } from "../contract";
import { DomPreview } from "./dom-preview";
import { DomCode } from "./dom-code";

// Both canvases touch window at import time and have no server story, so
// they load client-only. The DOM tabs are ordinary and render on the server.
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

/**
 * Four tabs over one bench. The tab strip mirrors the shadcn/React Flow docs
 * preview Zach pointed at: names in a row, the active one underlined, the
 * view in a bordered dotted-grid well below.
 *
 * WHY every canvas is mounted only while its tab is active: tldraw and React
 * Flow each hold a live store and listeners. Keeping all four alive would
 * mean three canvases echoing every change to the page. Because the page
 * owns the state, remounting a canvas is free — it rebuilds from the same
 * arrays and lands exactly where it left off.
 */
export function Viewport(p: ViewportProps) {
  return (
    <div data-slot="viewport" className="flex h-full min-h-0 flex-col">
      <div role="tablist" data-slot="viewport-tabs" className="flex shrink-0 items-center gap-1 border-b border-border px-3">
        {VIEWPORT_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            data-slot="viewport-tab"
            data-tab={t.id}
            aria-selected={p.tab === t.id}
            onClick={() => p.onTabChange(t.id)}
            className="-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
            title={t.canMove ? "Instances can be moved and multi-selected here" : "Instances render as plain DOM here"}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        data-slot="viewport-well"
        data-tab={p.tab}
        className="relative m-3 min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:20px_20px]"
      >
        <TabBody {...p} />
      </div>
    </div>
  );
}

function TabBody(p: ViewportProps) {
  const tab: ViewportTab = p.tab;
  switch (tab) {
    case "dom":
      return <DomPreview entries={p.entries} instances={p.instances} selectedIds={p.selectedIds} onSelectionChange={p.onSelectionChange} />;
    case "code":
      return <DomCode entries={p.entries} instances={p.instances} selectedIds={p.selectedIds} />;
    case "reactflow":
      return (
        <ReactFlowCanvas
          entries={p.entries}
          instances={p.instances}
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
          selectedIds={p.selectedIds}
          positions={p.positions}
          onSelectionChange={p.onSelectionChange}
          onPositionsChange={p.onPositionsChange}
        />
      );
  }
}
