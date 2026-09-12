"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { PortEdgeId } from "@bbox-ui/core";
import { renderInstance } from "../render-instance";
import { HostZoomContext } from "../port-dnd";

/**
 * Plain DOM. The components exactly as they render with no host around them,
 * one per instance, in a dotted-grid well so the eye reads "canvas" here too
 * even though nothing moves. Clicking one selects it; shift-click extends.
 */
export function DomPreview({
  entries,
  instances,
  roots,
  selectedIds,
  onSelectionChange,
  onSelectInstance,
  onMovePort,
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSelectInstance: (id: string, additive: boolean) => void;
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  The DOM render is the one host wired for it today. */
  onMovePort?: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
}) {
  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  return (
    // The DOM render is never scaled, so every PortDndProvider nested under
    // it (one per Block, mounted by renderInstance) divides its drag
    // overlay by zoom 1 — a no-op, and the seam a scaled host would use.
    <HostZoomContext.Provider value={1}>
      <div data-slot="dom-preview" className="flex h-full min-h-0 flex-wrap content-start items-start gap-6 overflow-auto p-6">
        {roots.map((inst) => {
          const on = selectedIds.includes(inst.id);
          return (
            <button
              key={inst.id}
              type="button"
              data-slot="dom-instance"
              data-instance-id={inst.id}
              data-selected={on}
              onClick={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) {
                  onSelectionChange(on ? selectedIds.filter((x) => x !== inst.id) : [...selectedIds, inst.id]);
                } else onSelectionChange([inst.id]);
              }}
              // WHY no rounded-* here: `outline` traces the element's own
              // border-radius, so a rounded box drew the selection as a soft
              // pill instead of tldraw's sharp-cornered indicator (Zach,
              // 2026-09-11). bbox-accent — not the neutral `ring` token — is
              // this app's real blue, already used for Port's role text.
              className="p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-[color:var(--bbox-accent)]"
              title={`${inst.type} · ${inst.id}`}
            >
              {renderInstance(entries, byId, inst, selectedIds, onSelectInstance, onMovePort)}
            </button>
          );
        })}
      </div>
    </HostZoomContext.Provider>
  );
}
