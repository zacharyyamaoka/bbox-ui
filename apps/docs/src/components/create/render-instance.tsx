"use client";

import type { ReactNode } from "react";
import type { ComponentEntry, Instance, RenderContext } from "@bbox-ui/panel";
import { activeArrangement, blockPorts, DraggablePort, effectiveProps, portPlacementsOf } from "@bbox-ui/panel";
import type { PortEdgeId } from "@bbox-ui/core";
import { PortDndProvider } from "./port-dnd";

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
  // Absent for a host not yet wired for Port dragging (React Flow, tldraw —
  // see port-dnd.tsx's own header): a Block then renders with its lanes
  // but no PortDndProvider, so its ports are visible and selectable, just
  // not draggable.
  onMovePort?: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void,
): ReactNode {
  const entry = entries.find((e) => e.name === inst.type);
  if (!entry) return null;
  const memberIds = inst.members ?? [];
  const wrap = (child: Instance): ReactNode => {
    const on = selectedIds.includes(child.id);
    // A Port member of a Block that has reached its arrangements (Zach,
    // 2026-09-12) is draggable; every other member keeps the plain
    // selection wrapper unchanged.
    if (child.type === "Port" && inst.arrangements) {
      return (
        <DraggablePort key={child.id} portId={child.id} selected={on} disabled={child.locked === true} onSelect={onSelect}>
          {renderInstance(entries, byId, child, selectedIds, onSelect, onMovePort)}
        </DraggablePort>
      );
    }
    return (
      <span
        key={child.id}
        data-slot="member-instance"
        data-instance-id={child.id}
        data-instance-type={child.type}
        data-selected={on}
        // See viewport/dom-preview.tsx: no rounded-* under the selection
        // outline, and bbox-accent instead of the neutral ring token.
        className="contents [&>*:first-child]:outline-offset-2 data-[selected=true]:[&>*:first-child]:outline data-[selected=true]:[&>*:first-child]:outline-2 data-[selected=true]:[&>*:first-child]:outline-[color:var(--bbox-accent)]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(child.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {renderInstance(entries, byId, child, selectedIds, onSelect, onMovePort)}
      </span>
    );
  };
  const kids = memberIds.map((id) => byId.get(id)).filter((c): c is Instance => !!c);
  const ctx: RenderContext = {};
  if (inst.slot) {
    ctx.slotLabel = inst.slot.label;
    ctx.slotId = inst.slot.id;
  }
  // What the component draws is its own props over what it inherits (a
  // header's size reaching the Glyph inside it). The store keeps only the
  // own props; the Code view prints only the store.
  const all = Array.from(byId.values());
  const props = effectiveProps(all, entries, inst);
  if (entry.slots) {
    ctx.slots = {};
    const nonSlotKids: Instance[] = [];
    for (const child of kids) {
      if (child.slot) ctx.slots[child.slot.id] = wrap(child);
      else nonSlotKids.push(child);
    }
    // A component with BOTH slots and members (a Block: its Bars/body,
    // plus its own Ports) hands the non-slot members through separately,
    // by id — never mixed into `slots`, and never as `children` (a
    // slotted `render` never reads that arg, see the call below).
    if (entry.members && nonSlotKids.length > 0) {
      ctx.members = {};
      for (const child of nonSlotKids) ctx.members[child.id] = wrap(child);
      // Placement data only makes sense once the instance actually carries
      // an active Arrangement (Zach's 2026-09-12 model) — absent for any
      // other slots+members shape that might arrive later.
      if (inst.arrangements) {
        const arrangement = activeArrangement(inst);
        const ports = blockPorts(all, inst.id);
        ctx.arrangement = arrangement;
        ctx.placements = portPlacementsOf(inst, ports, arrangement.id);
        ctx.lockedMemberIds = ports.filter((p) => p.locked).map((p) => p.id);
        ctx.blockId = inst.id;
      }
    }
    const rendered = entry.render(props, undefined, ctx);
    // One DndContext per Block (Zach, 2026-09-12: "nested contexts across
    // Blocks are fine") — mounted here, around this Block's own render, so
    // a sibling Block's Ports never collide with this one's four lanes.
    // Absent `onMovePort` (a host not yet wired for dragging) or `arrangement`
    // (not a Block) means the plain render, unwrapped.
    if (ctx.arrangement && onMovePort) {
      return (
        <PortDndProvider blockId={inst.id} arrangement={ctx.arrangement} onMovePort={onMovePort}>
          {rendered}
        </PortDndProvider>
      );
    }
    return rendered;
  }
  const children = kids.length === 0 ? undefined : kids.map(wrap);
  return entry.render(props, children, ctx);
}
