"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import { renderInstance } from "../render-instance";

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
}: {
  entries: ComponentEntry[];
  instances: Instance[];
  roots: Instance[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSelectInstance: (id: string, additive: boolean) => void;
}) {
  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  return (
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
            className="rounded-md p-2 outline-offset-4 data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:outline-ring"
            title={`${inst.type} · ${inst.id}`}
          >
            {renderInstance(entries, byId, inst, selectedIds, onSelectInstance)}
          </button>
        );
      })}
    </div>
  );
}
