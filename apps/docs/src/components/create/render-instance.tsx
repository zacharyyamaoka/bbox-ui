"use client";

import type { ReactNode } from "react";
import type { ComponentEntry, Instance, RenderContext } from "@bbox-ui/panel";

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
 *
 * A component with SLOTS gets its fills by slot id in `ctx.slots` instead
 * of as ordered children, so its render puts each in its hole. A fill is
 * told its slot's label so an empty Flex can say which hole it is.
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
  const wrap = (child: Instance): ReactNode => {
    const on = selectedIds.includes(child.id);
    return (
      <span
        key={child.id}
        data-slot="member-instance"
        data-instance-id={child.id}
        data-instance-type={child.type}
        data-selected={on}
        className="contents [&>*:first-child]:rounded-sm [&>*:first-child]:outline-offset-2 data-[selected=true]:[&>*:first-child]:outline data-[selected=true]:[&>*:first-child]:outline-2 data-[selected=true]:[&>*:first-child]:outline-ring"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(child.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {renderInstance(entries, byId, child, selectedIds, onSelect)}
      </span>
    );
  };
  const kids = memberIds.map((id) => byId.get(id)).filter((c): c is Instance => !!c);
  const ctx: RenderContext = {};
  if (inst.slot) ctx.slotLabel = inst.slot.label;
  if (entry.slots) {
    ctx.slots = {};
    for (const child of kids) if (child.slot) ctx.slots[child.slot.id] = wrap(child);
    return entry.render(inst.props, undefined, ctx);
  }
  const children = kids.length === 0 ? undefined : kids.map(wrap);
  return entry.render(inst.props, children, ctx);
}
