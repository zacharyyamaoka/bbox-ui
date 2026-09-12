"use client";

import { useMemo, type ReactNode } from "react";
import type { FieldValue } from "@bbox-ui/schema";
import type { ArrangementMode, Placement, PortEdgeId } from "@bbox-ui/core";
import type { ComponentEntry, Instance, MembersSpec } from "@bbox-ui/panel";
import { MEMBERS_CONTROLS, ancestry, memberSpecFor, summarize, typeGlyph } from "@bbox-ui/panel";
import { ArrangementSection } from "./arrangement-section";

export interface MemberListActions {
  onAddMember: (parentId: string, type: string) => void;
  onRemoveMember: (id: string) => void;
  onMoveMember: (parentId: string, from: number, to: number) => void;
  onSelect: (id: string) => void;
  /** Write one prop on one instance — the region row's quick controls. */
  onSetProp: (id: string, fieldId: string, value: FieldValue) => void;
  /**
   * The Block Arrangement / Port Placement ops (Zach, 2026-09-12) — see
   * `arrangement-section.tsx` for the two inspector surfaces these back
   * and `workbench.tsx` for the model-backed implementation.
   */
  onSetArrangement: (blockId: string, id: string) => void;
  onAddArrangement: (blockId: string) => void;
  onSetArrangementMode: (blockId: string, mode: ArrangementMode) => void;
  onToggleArrangementEdge: (blockId: string, edge: PortEdgeId, on: boolean) => void;
  onSetArrangementGrouping: (blockId: string, setId: string | null) => void;
  onMovePort: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
  onSetPortPlacement: (portId: string, patch: Partial<Placement> & { locked?: boolean }) => void;
}

/**
 * One member list the inspector has to place. A Block has several (one per
 * slot); a Stack has one; a Port has none. The inspector-layout variants
 * receive these and decide WHERE they go relative to the scalar rows —
 * that is the whole question those variants exist to answer.
 */
export interface MemberList {
  id: string;
  label: string;
  /** The parent's region for a slot list ("header" / "body" / "footer"),
   *  null for a component's own single list. */
  region: string | null;
  count: number;
  node: ReactNode;
  /**
   * When the region is filled by a component with fields of its own (a
   * Bar): the row a layout draws where the region caption would go —
   * label, the Bar's quick controls (hidden · line · size) and ⚙ to open
   * it. Set on the FIRST list of the region only.
   */
  regionHeader?: ReactNode;
  /** The region's fill is hidden: a layout may fold its lists away. */
  regionHidden?: boolean;
}

/**
 * The path. When the subject is itself a member, a breadcrumb above the
 * panel says where it sits and lets you climb back out. Without it the
 * click-into-a-child rule is a one-way door.
 */
export function MembersPath({ instances, subject, onSelect }: { instances: Instance[]; subject: Instance | null; onSelect: (id: string) => void }) {
  const path = useMemo(() => (subject ? ancestry(instances, subject.id) : []), [instances, subject]);
  if (!subject || path.length === 0) return null;
  return (
    <nav data-slot="members-path" aria-label="Inside" className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="mr-1">Inside</span>
      {path.map((id) => {
        const s = summarize(instances, id);
        if (!s) return null;
        return (
          <span key={id} className="flex items-center gap-1">
            <button
              type="button"
              data-slot="members-path-crumb"
              data-instance-id={id}
              onClick={() => onSelect(id)}
              title={`Edit ${s.title}`}
              className="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
            >
              <span aria-hidden className="mr-1 text-[10px]">
                {typeGlyph(s.type)}
              </span>
              {s.title}
            </button>
            <span aria-hidden>›</span>
          </span>
        );
      })}
      <span className="text-foreground">{summarize(instances, subject.id)?.title}</span>
    </nav>
  );
}

function listFor(
  entries: ComponentEntry[],
  instances: Instance[],
  parent: Instance,
  entry: ComponentEntry,
  spec: MembersSpec,
  region: string | null,
  actions: MemberListActions,
  onSelectParent?: () => void,
): MemberList {
  const members = (parent.members ?? []).map((id) => summarize(instances, id)).filter((m): m is NonNullable<typeof m> => !!m);
  const Control = MEMBERS_CONTROLS[0]!.Control;
  return {
    id: parent.id,
    label: parent.slot?.label ?? spec.label ?? "Members",
    region,
    count: members.length,
    node: (
      <div key={parent.id} data-slot="members-section" data-parent-id={parent.id} data-region={region ?? undefined}>
        <Control
          parent={parent}
          entry={entry}
          spec={spec}
          members={members}
          summaryOf={(id) => summarize(instances, id)}
          entryFor={(t) => entries.find((e) => e.name === t)!}
          entries={entries}
          preview={(id) => {
            const inst = instances.find((i) => i.id === id);
            const e = inst && entries.find((x) => x.name === inst.type);
            return e && inst ? e.render(inst.props) : null;
          }}
          onAdd={(type) => actions.onAddMember(parent.id, type)}
          onRemove={actions.onRemoveMember}
          onMove={(from, to) => actions.onMoveMember(parent.id, from, to)}
          onSelect={actions.onSelect}
          onSelectParent={onSelectParent}
        />
      </div>
    ),
  };
}

/**
 * The member lists a subject carries, automatically:
 *  - a component with SLOTS: one list per slot, each editing the fill's
 *    members directly (a Block's inspector shows Header · left, …, Footer
 *    · right), with ⚙ to select the fill itself;
 *  - a component with `members`: its one list;
 *  - anything else: none.
 */
/**
 * The quick controls for a region filled by a Bar: hidden · line · size,
 * bound straight to the Bar instance, and ⚙ to open the Bar itself.
 * Zach, 2026-09-11: "a key control I then want is hide header, hide
 * footer … hide the line" — one click from the Block's own inspector.
 */
function RegionHeader({ fill, label, actions }: { fill: Instance; label: string; actions: MemberListActions }) {
  const hidden = fill.props.hidden === true;
  const line = fill.props.line !== false;
  const size = typeof fill.props.size === "string" ? fill.props.size : "md";
  return (
    <div data-slot="region-header" data-region-fill={fill.id} data-hidden={hidden} className="flex items-center gap-2 px-2 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground/80">
      <span className="font-semibold">{label}</span>
      <span className="flex-1" />
      <label className="flex items-center gap-1 normal-case tracking-normal">
        <input type="checkbox" data-slot="region-hidden" checked={hidden} onChange={(e) => actions.onSetProp(fill.id, "hidden", e.target.checked)} className="accent-foreground" />
        hidden
      </label>
      <label className="flex items-center gap-1 normal-case tracking-normal">
        <input type="checkbox" data-slot="region-line" checked={line} onChange={(e) => actions.onSetProp(fill.id, "line", e.target.checked)} className="accent-foreground" />
        line
      </label>
      <select data-slot="region-size" value={size} onChange={(e) => actions.onSetProp(fill.id, "size", e.target.value)} className="rounded border border-input bg-background px-1 py-0 text-[10px] normal-case text-foreground">
        <option value="sm">sm</option>
        <option value="md">md</option>
        <option value="lg">lg</option>
        <option value="xl">xl</option>
      </select>
      <button type="button" data-slot="region-open" title={`Open the ${fill.type} that fills ${label}`} onClick={() => actions.onSelect(fill.id)} className="rounded px-1 text-[11px] hover:bg-muted hover:text-foreground">
        ⚙
      </button>
    </div>
  );
}

export function memberListsFor(entries: ComponentEntry[], instances: Instance[], subject: Instance | null, actions: MemberListActions): MemberList[] {
  if (!subject) return [];
  const entry = entries.find((e) => e.name === subject.type);
  if (!entry) return [];
  if (entry.slots) {
    const byId = new Map(instances.map((i) => [i.id, i]));
    const out: MemberList[] = [];
    for (const slot of entry.slots) {
      const fill = (subject.members ?? []).map((id) => byId.get(id)).find((i) => i?.slot?.id === slot.id);
      const fillEntry = fill && entries.find((e) => e.name === fill.type);
      if (!fill || !fillEntry) continue;
      if (fillEntry.slots) {
        // A fill with slots of its own (a Bar): its lists, grouped under
        // ONE region row carrying the Bar's quick controls. No nested
        // editor beyond that — ⚙ opens the Bar for everything else.
        const inner = memberListsFor(entries, instances, fill, actions).map((l) => ({ ...l, id: l.id, label: `${slot.label} · ${l.label.toLowerCase()}`, region: slot.region }));
        if (inner.length === 0) continue;
        inner[0] = { ...inner[0]!, regionHeader: <RegionHeader fill={fill} label={slot.label} actions={actions} />, regionHidden: fill.props.hidden === true };
        out.push(...inner);
        continue;
      }
      const spec = memberSpecFor(fillEntry, fill);
      if (!spec) continue;
      out.push(listFor(entries, instances, fill, fillEntry, spec, slot.region, actions, () => actions.onSelect(fill.id)));
    }
    // A component with slots AND its own members (a Block: its Bars/body
    // fill the slots above, its Ports are its OWN list) gets that list
    // appended last, with the Arrangement controls riding its
    // `regionHeader` — the same seam a slot-filling Bar already uses for
    // ITS quick controls (`RegionHeader`, above). `region: null` keeps it
    // out of the slot-region hiding logic (`InlineRows.tsx`), which only
    // ever applies to `region !== null`.
    //
    // `subject.members` holds slot fills FIRST, ports after (see
    // `bench.tsx`'s `makeInstanceWithSlots`/`addMemberTo`) — the list must
    // show only the ports (never the Header/Body/Footer fills, which are
    // reached through their own slot lists' ⚙, not this one), so it gets a
    // narrowed clone rather than the raw instance. `onMoveMember` is
    // re-scoped to translate an index WITHIN that narrowed list back to
    // its real position in the full array — the drag reorders ports
    // amongst themselves without touching where the slot fills sit.
    if (entry.members) {
      const spec = memberSpecFor(entry, subject);
      if (spec) {
        const fullMembers = subject.members ?? [];
        const portIds = fullMembers.filter((id) => !byId.get(id)?.slot);
        const portsOnly: Instance = { ...subject, members: portIds };
        const scopedActions: MemberListActions = {
          ...actions,
          onMoveMember: (parentId, from, to) => {
            const a = fullMembers.indexOf(portIds[from]!);
            const b = fullMembers.indexOf(portIds[to]!);
            if (a === -1 || b === -1) return;
            actions.onMoveMember(parentId, a, b);
          },
        };
        const list = listFor(entries, instances, portsOnly, entry, spec, null, scopedActions);
        out.push({ ...list, regionHeader: <ArrangementSection block={subject} actions={actions} /> });
      }
    }
    return out;
  }
  const spec = memberSpecFor(entry, subject);
  if (!spec) return [];
  return [listFor(entries, instances, subject, entry, spec, null, actions)];
}
