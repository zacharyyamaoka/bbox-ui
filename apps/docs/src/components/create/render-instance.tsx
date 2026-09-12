"use client";

import type { ReactNode } from "react";
import type { ComponentEntry, Instance } from "@bbox-ui/panel";

/**
 * ONE way to draw an instance, members included, for every render.
 *
 * WHY here and not in each canvas: a member is drawn INSIDE its parent by
 * its parent's own component — a Port inside a PortEdge, a Block inside a
 * Stack — and never as a node of its own. If each of the three renders
 * walked the tree itself, one of them would forget, and a member would be a
 * node on React Flow and a child in the DOM. Every render calls this and
 * draws only `topLevel(instances)`.
 *
 * Each member is wrapped so a pointer-down on it selects THAT instance and
 * stops there: the inspector then shows the child. That is Zach's ask —
 * "if I click any of those children then it could change the inspector
 * panel to them" — done by ordinary selection, not a nested editor. The
 * wrapper is `display: contents` so it adds no box to the parent's layout;
 * the outline paints on the member's first element instead.
 */
export function renderInstance(
  entries: ComponentEntry[],
  byId: Map<string, Instance>,
  inst: Instance,
  selectedIds: string[],
  onSelect: (id: string, additive: boolean) => void,
): ReactNode {
  const entry = entries.find((e) => e.name === inst.type);
  if (!entry) return null;
  const memberIds = inst.members ?? [];
  const children =
    entry.members === undefined
      ? undefined
      : memberIds.length === 0
        ? undefined
        : memberIds.map((id) => {
            const child = byId.get(id);
            if (!child) return null;
            const on = selectedIds.includes(id);
            return (
              <span
                key={id}
                data-slot="member-instance"
                data-instance-id={id}
                data-instance-type={child.type}
                data-selected={on}
                className="contents [&>*:first-child]:rounded-sm [&>*:first-child]:outline-offset-2 data-[selected=true]:[&>*:first-child]:outline data-[selected=true]:[&>*:first-child]:outline-2 data-[selected=true]:[&>*:first-child]:outline-ring"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(id, e.shiftKey || e.metaKey || e.ctrlKey);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {renderInstance(entries, byId, child, selectedIds, onSelect)}
              </span>
            );
          });
  return entry.render(inst.props, children);
}
