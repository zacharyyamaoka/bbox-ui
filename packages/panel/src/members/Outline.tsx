import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import type { MembersControl, MembersControlProps, MemberSummary } from "./contract";
import { AddMemberMenu, MemberBadge, SectionHeader, TypeGlyph, acceptsSentence, hintStyle, iconButtonStyle, sectionStyle } from "./shared";

/**
 * V2 · Outline — Figma's Layers panel, as a bbox-ui control.
 *
 * The axis this variant moves against List is DEPTH: it draws the whole
 * subtree under the parent, not just its direct members, so you can jump
 * straight to a grandchild instead of selecting down through each level.
 * `p.onMove`/`p.onRemove` only index into `p.members` (the contract's "no
 * nested editor" rule), so a row past depth 0 gets disabled ↑↓× — select it
 * to edit its own parent's list instead.
 */
function OutlineControl(p: MembersControlProps) {
  const [closedIds, setClosedIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => {
    setClosedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRows = (members: MemberSummary[], depth: number, isDirect: boolean): ReactNode[] =>
    members.map((m, index) => {
      const isOpen = !closedIds.has(m.id);
      const children = isOpen
        ? m.memberIds.map((id) => p.summaryOf(id)).filter((s): s is MemberSummary => s !== undefined)
        : [];
      return (
        <Fragment key={m.id}>
          <Row
            p={p}
            member={m}
            depth={depth}
            isDirect={isDirect}
            index={index}
            siblingCount={members.length}
            isOpen={isOpen}
            hasChildren={m.memberIds.length > 0}
            onToggle={() => toggle(m.id)}
          />
          {children.length > 0 && renderRows(children, depth + 1, false)}
        </Fragment>
      );
    });

  return (
    <section data-slot="members-control" data-members-control="outline" style={sectionStyle}>
      <SectionHeader label={p.spec.label ?? "Members"} count={p.members.length} right={<AddMemberMenu p={p} />} />
      {p.members.length === 0 ? (
        <p data-slot="members-empty" style={hintStyle}>
          No members yet. {acceptsSentence(p)}
        </p>
      ) : (
        <ul data-slot="members-tree" style={treeStyle}>
          {renderRows(p.members, 0, true)}
        </ul>
      )}
      {p.members.length > 0 && (
        <p style={hintStyle}>The whole subtree. Click any row to edit it; ↑↓ reorder direct members.</p>
      )}
    </section>
  );
}

function Row({
  p,
  member,
  depth,
  isDirect,
  index,
  siblingCount,
  isOpen,
  hasChildren,
  onToggle,
}: {
  p: MembersControlProps;
  member: MemberSummary;
  depth: number;
  isDirect: boolean;
  index: number;
  siblingCount: number;
  isOpen: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const nestedTitle = "Select it to edit its parent's list";
  const atStart = !isDirect || index === 0;
  const atEnd = !isDirect || index === siblingCount - 1;
  const opacity = (disabled: boolean) => (disabled ? 0.2 : hovered ? 1 : 0.35);

  return (
    <li
      data-slot="member-row"
      data-member-id={member.id}
      data-member-type={member.type}
      data-depth={depth}
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hasChildren ? (
        <button
          type="button"
          data-slot="member-disclosure"
          aria-label={isOpen ? `Collapse ${member.title}` : `Expand ${member.title}`}
          onClick={onToggle}
          style={{ ...disclosureStyle, marginLeft: depth * 14 }}
        >
          {isOpen ? "▾" : "▸"}
        </button>
      ) : (
        <span aria-hidden style={{ ...spacerStyle, marginLeft: depth * 14 }} />
      )}
      <button type="button" data-slot="member-select" onClick={() => p.onSelect(member.id)} title={`Edit ${member.title}`} style={bodyStyle}>
        <TypeGlyph type={member.type} />
        <span data-slot="member-title" style={{ ...titleStyle, ...(member.untitled ? untitledStyle : {}) }}>
          {member.title}
        </span>
        <span data-slot="member-type" style={typeStyle}>
          {member.type}
        </span>
        <MemberBadge member={member} />
      </button>
      <button
        type="button"
        data-slot="member-up"
        aria-label={`Move ${member.title} up`}
        title={isDirect ? "Move up" : nestedTitle}
        disabled={atStart}
        onClick={() => p.onMove(index, index - 1)}
        style={{ ...iconButtonStyle, opacity: opacity(atStart) }}
      >
        ↑
      </button>
      <button
        type="button"
        data-slot="member-down"
        aria-label={`Move ${member.title} down`}
        title={isDirect ? "Move down" : nestedTitle}
        disabled={atEnd}
        onClick={() => p.onMove(index, index + 1)}
        style={{ ...iconButtonStyle, opacity: opacity(atEnd) }}
      >
        ↓
      </button>
      <button
        type="button"
        data-slot="member-remove"
        aria-label={`Remove ${member.title}`}
        title={isDirect ? "Remove" : nestedTitle}
        disabled={!isDirect}
        onClick={() => p.onRemove(member.id)}
        style={{ ...iconButtonStyle, opacity: opacity(!isDirect) }}
      >
        ×
      </button>
    </li>
  );
}

export const OUTLINE: MembersControl = {
  id: "outline",
  label: "Outline",
  blurb: "Figma's Layers panel: the whole subtree as a disclosure tree, so you can select a grandchild directly instead of drilling down.",
  Control: OutlineControl,
};

const treeStyle: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 };
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 2, minHeight: 24, borderRadius: 4, background: "var(--bbox-panel-surface, #fff)" };
const disclosureStyle: CSSProperties = { ...iconButtonStyle, width: 14, fontSize: 9, flexShrink: 0 };
const spacerStyle: CSSProperties = { display: "inline-block", width: 14, flexShrink: 0 };
const bodyStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 6px", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 4, background: "transparent", color: "var(--bbox-panel-fg, #222)", cursor: "pointer", textAlign: "left", fontSize: 12 };
const titleStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const untitledStyle: CSSProperties = { color: "var(--bbox-panel-fg-muted, #6a6a75)" };
const typeStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #9a9aa5)", flexShrink: 0 };
