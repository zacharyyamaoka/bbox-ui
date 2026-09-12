"use client";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { InspectorLayoutProps, InspectorLayoutVariant } from "./contract";

/**
 * V5 · Split pane — the scalar rows and the member lists as two independently
 * scrolling panes, dragged apart by a handle instead of read as one long
 * stacked column. Members: Zach, 2026-09-11 — "a member list is not a
 * field … it doesn't play as nicely with the compact property list."
 *
 * Each pane owns its own scroller (rule 5: panel and List rendered as
 * given, so neither may be restyled to fit — they just get their own box).
 * The split ratio persists per Zach's browser via react-resizable-panels'
 * own autoSaveId, so a preference set once survives future subjects.
 */
function SplitPaneLayout(p: InspectorLayoutProps) {
  if (p.lists.length === 0) {
    return (
      <div data-slot="inspector-layout" data-inspector-layout="split">
        {p.panel}
      </div>
    );
  }

  const total = p.lists.reduce((sum, list) => sum + list.count, 0);
  let lastRegion: string | null | undefined;

  return (
    <div data-slot="inspector-layout" data-inspector-layout="split" className="flex h-full min-h-0 flex-col">
      <PanelGroup direction="vertical" autoSaveId="bbox-ui.create.inspectorSplit" className="min-h-0 flex-1">
        <Panel defaultSize={55} minSize={20} className="min-h-0 overflow-y-auto">
          {p.panel}
        </Panel>
        <PanelResizeHandle
          data-slot="inspector-split-handle"
          className="h-[6px] shrink-0 cursor-row-resize bg-border hover:bg-ring"
        />
        <Panel defaultSize={45} minSize={20} className="flex min-h-0 flex-col overflow-y-auto">
          <div
            data-slot="inspector-split-members-header"
            className="sticky top-0 z-10 border-b border-border bg-background/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 backdrop-blur"
          >
            Members · {total}
          </div>
          {p.lists.map((list) => {
            const caption = list.region !== null && list.region !== lastRegion ? list.region : null;
            lastRegion = list.region;
            return (
              <div key={list.id}>
                {caption && (
                  <div data-slot="region-caption" className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {caption}
                  </div>
                )}
                {list.node}
              </div>
            );
          })}
        </Panel>
      </PanelGroup>
    </div>
  );
}

export const SPLIT_PANE: InspectorLayoutVariant = {
  id: "split",
  label: "Split pane",
  blurb: "Fields and members as two independently scrolling panes, dragged apart by a handle; the split persists across subjects.",
  stockPart: "PanelGroup / Panel / PanelResizeHandle from react-resizable-panels (shadcn Resizable)",
  Layout: SplitPaneLayout,
};
