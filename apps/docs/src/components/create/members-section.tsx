"use client";

import { useMemo } from "react";
import type { ComponentEntry, Instance, MembersControl } from "@bbox-ui/panel";
import { ancestry, summarize, typeGlyph } from "@bbox-ui/panel";

interface MembersSectionProps {
  control: MembersControl;
  entries: ComponentEntry[];
  instances: Instance[];
  /** The single selected instance, or null when 0 or many are selected. */
  subject: Instance | null;
  onAddMember: (parentId: string, type: string) => void;
  onRemoveMember: (id: string) => void;
  onMoveMember: (parentId: string, from: number, to: number) => void;
  onSelect: (id: string) => void;
}

/**
 * The inspector's standard Members section, added AUTOMATICALLY for any
 * component whose entry declares `members`. Two parts:
 *
 * 1. The path. When the subject is itself a member, a breadcrumb above the
 *    panel says where it sits and lets you climb back out. Without it the
 *    click-into-a-child rule is a one-way door: you can reach a Port inside
 *    a Stack but not the Stack again except from the sidebar.
 * 2. The control — whichever of the five designs the switcher has chosen.
 *
 * WHY outside the panel variant: the six panel designs render FIELDS, and a
 * member list is not a field (members/contract.ts). Putting it here means
 * all six designs get it for free and none of them had to learn about it.
 */
export function MembersPath({ instances, subject, onSelect }: Pick<MembersSectionProps, "instances" | "subject" | "onSelect">) {
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

export function MembersSection(p: MembersSectionProps) {
  const { subject, instances, entries } = p;
  const entry = subject ? entries.find((e) => e.name === subject.type) : undefined;
  const spec = entry?.members;
  const members = useMemo(
    () => (subject ? (subject.members ?? []).map((id) => summarize(instances, id)).filter((m): m is NonNullable<typeof m> => !!m) : []),
    [instances, subject],
  );
  if (!subject || !entry || !spec) return null;
  const Control = p.control.Control;
  return (
    <div data-slot="members-section" data-parent-id={subject.id}>
      <Control
        parent={subject}
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
        onAdd={(type) => p.onAddMember(subject.id, type)}
        onRemove={p.onRemoveMember}
        onMove={(from, to) => p.onMoveMember(subject.id, from, to)}
        onSelect={p.onSelect}
      />
    </div>
  );
}
