import type { CSSProperties } from "react";
import type { MembersControl, MembersControlProps, MemberSummary } from "./contract";
import { addableTypes } from "./model";
import { AddMemberMenu, MemberBadge, SectionHeader, TypeGlyph, hintStyle, iconButtonStyle, sectionStyle } from "./shared";

/**
 * V4 · Grouped — the Shopify theme editor / Unity "Add Component" idea.
 *
 * The axis this variant moves is GROUPING: one sub-section per accepted
 * type (in `spec.accepts` order, or by the types present when `accepts` is
 * open), each with its own typed Add and its own "none yet" empty state.
 * Reordering swaps a member with its same-type sibling; the overall
 * `p.members` order is what actually moves, so a Block still renders in one
 * sequence regardless of which section drew it.
 */
type Group = { type: string; members: MemberSummary[] };

/** Sentinel for members whose type isn't in `spec.accepts` — kept out of the
 *  add affordance since it names no addable type. */
const OTHER = "Other";

function groupByType(p: MembersControlProps): Group[] {
  const { spec, members } = p;
  if (spec.accepts.length > 0) {
    const groups = spec.accepts.map((type) => ({ type, members: members.filter((m) => m.type === type) }));
    const leftover = members.filter((m) => !spec.accepts.includes(m.type));
    if (leftover.length > 0) groups.push({ type: OTHER, members: leftover });
    return groups;
  }
  const types = Array.from(new Set(members.map((m) => m.type))).sort();
  return types.map((type) => ({ type, members: members.filter((m) => m.type === type) }));
}

function GroupedControl(p: MembersControlProps) {
  const { spec, members, entries } = p;

  if (spec.accepts.length === 0 && members.length === 0) {
    return (
      <section data-slot="members-control" data-members-control="grouped" style={sectionStyle}>
        <SectionHeader label={spec.label ?? "Members"} count={0} />
        <p data-slot="members-empty" style={hintStyle}>
          No members yet. Add one below.
        </p>
        <AddMemberMenu p={p} label="+ Add" fullWidth />
      </section>
    );
  }

  const groups = groupByType(p);
  const addable = addableTypes(spec, entries, members.length);

  return (
    <section data-slot="members-control" data-members-control="grouped" style={sectionStyle}>
      <SectionHeader label={spec.label ?? "Members"} count={members.length} />
      <div data-slot="member-groups" style={groupsStyle}>
        {groups.map((group) => (
          <GroupSection key={group.type} group={group} p={p} canAdd={group.type !== OTHER && addable.includes(group.type)} />
        ))}
      </div>
      <p style={hintStyle}>One group per kind. Click a row to edit that member; ↑↓ reorder within its kind.</p>
    </section>
  );
}

function GroupSection({ group, p, canAdd }: { group: Group; p: MembersControlProps; canAdd: boolean }) {
  const isOther = group.type === OTHER;
  return (
    <div data-slot="member-group" data-type={group.type} style={groupStyle}>
      <div style={groupHeaderStyle}>
        <TypeGlyph type={group.type} />
        <span style={groupLabelStyle}>
          {group.type}s · {group.members.length}
        </span>
        <span style={{ flex: 1 }} />
        {!isOther && (
          <button
            type="button"
            data-slot="add-member-type"
            data-type={group.type}
            disabled={!canAdd}
            title={canAdd ? `Add ${group.type}` : `At most ${p.spec.max} here`}
            onClick={() => p.onAdd(group.type)}
            style={addTypeStyle(!canAdd)}
          >
            + {group.type}
          </button>
        )}
      </div>
      {group.members.length === 0 ? (
        <p data-slot="member-group-empty" style={emptyGroupStyle}>
          none yet
        </p>
      ) : (
        group.members.map((m, i) => {
          const overallIndex = p.members.findIndex((mm) => mm.id === m.id);
          const prevId = group.members[i - 1]?.id;
          const nextId = group.members[i + 1]?.id;
          const prevIndex = prevId ? p.members.findIndex((mm) => mm.id === prevId) : -1;
          const nextIndex = nextId ? p.members.findIndex((mm) => mm.id === nextId) : -1;
          return (
            <GroupRow
              key={m.id}
              member={m}
              isFirst={i === 0}
              isLast={i === group.members.length - 1}
              onSelect={() => p.onSelect(m.id)}
              onRemove={() => p.onRemove(m.id)}
              onMoveUp={() => prevIndex >= 0 && p.onMove(overallIndex, prevIndex)}
              onMoveDown={() => nextIndex >= 0 && p.onMove(overallIndex, nextIndex)}
            />
          );
        })
      )}
    </div>
  );
}

function GroupRow({
  member,
  isFirst,
  isLast,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  member: MemberSummary;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div data-slot="member-row" data-member-id={member.id} data-member-type={member.type} style={rowStyle}>
      <button type="button" data-slot="member-select" onClick={onSelect} title={`Edit ${member.title}`} style={bodyStyle}>
        <TypeGlyph type={member.type} />
        <span data-slot="member-title" style={{ ...titleStyle, ...(member.untitled ? untitledStyle : {}) }}>
          {member.title}
        </span>
        <MemberBadge member={member} />
      </button>
      <button type="button" data-slot="member-up" aria-label={`Move ${member.title} up`} title="Move up" disabled={isFirst} onClick={onMoveUp} style={moveButtonStyle(isFirst)}>
        ↑
      </button>
      <button type="button" data-slot="member-down" aria-label={`Move ${member.title} down`} title="Move down" disabled={isLast} onClick={onMoveDown} style={moveButtonStyle(isLast)}>
        ↓
      </button>
      <button type="button" data-slot="member-remove" aria-label={`Remove ${member.title}`} title="Remove" onClick={onRemove} style={iconButtonStyle}>
        ×
      </button>
    </div>
  );
}

export const GROUPED: MembersControl = {
  id: "grouped",
  label: "Grouped by type",
  blurb: "One sub-section per accepted type, each with its own typed Add and its own empty state, so a parent with many kinds of children never reads as one undifferentiated list.",
  Control: GroupedControl,
};

const groupsStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const groupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };
const groupHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, minHeight: 18 };
const groupLabelStyle: CSSProperties = { fontSize: 10.5, fontWeight: 600, color: "var(--bbox-panel-fg-muted, #5c5c66)" };
const emptyGroupStyle: CSSProperties = { ...hintStyle, fontStyle: "italic", paddingTop: 0, paddingLeft: 20 };
function addTypeStyle(disabled: boolean): CSSProperties {
  return {
    height: 18,
    padding: "0 7px",
    border: "1px dashed var(--bbox-panel-border, #d6d6de)",
    borderRadius: 999,
    background: "transparent",
    color: "var(--bbox-panel-fg-muted, #5c5c66)",
    fontSize: 10.5,
    lineHeight: "16px",
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  };
}
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 2, minHeight: 24, borderRadius: 4, background: "var(--bbox-panel-surface, #fff)" };
const bodyStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 6px", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 4, background: "transparent", color: "var(--bbox-panel-fg, #222)", cursor: "pointer", textAlign: "left", fontSize: 12 };
const titleStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const untitledStyle: CSSProperties = { color: "var(--bbox-panel-fg-muted, #6a6a75)" };
function moveButtonStyle(disabled: boolean): CSSProperties {
  return { ...iconButtonStyle, opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : "pointer" };
}
