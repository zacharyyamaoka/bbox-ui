import { useState, type CSSProperties } from "react";
import {
  Chevron,
  PanelShell,
  SectionActions,
  SectionRows,
  sectionDividerStyle,
  sectionSummaryStyle,
  sectionTitleTextStyle,
} from "../shared";
import { LABEL_WIDTH } from "../StandardRow";
import type { SectionList, SectionPanelProps, SectionPanelVariant, SectionRow } from "../contract";

/**
 * S5 · MEMBERS AS ROWS — the fields/members split, deleted.
 *
 * Zach, 2026-09-12: the fields/members split "is actually just very
 * confusing". S1 (FigmaFlat) keeps that split visible — a run of property
 * rows, then a member list with its own header sitting inside the same
 * section. S5 removes the seam instead of restyling it: wherever a section
 * declares a `{ kind: "list" }` row, it appears in that exact declared
 * position drawn in the SAME grammar as every property row above and below
 * it — a LABEL_WIDTH label cell, then a control cell, then (here) a
 * chevron. A member list therefore reads as a property whose value happens
 * to be a list, not as a second kind of thing bolted under the fields.
 *
 * That is the ONLY load-bearing difference from S1. Section chrome (title,
 * hairline, always-open sections, right-aligned actions) is copied by
 * value from FigmaFlat rather than shared, because the contract says the
 * five designs may disagree about chrome — importing S1's panel here would
 * couple two designs that are meant to be independently disposable.
 */
function MembersAsRowsPanel(p: SectionPanelProps) {
  // Default open-ness is a one-time read of the count each list started
  // with: something to look at opens, an empty list — whose only content
  // is a "+" button inside `list.node` — stays one click away rather than
  // permanently taking a row's worth of vertical space for nothing.
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of p.sections) {
      for (const row of section.rows) {
        if (row.kind === "list" && row.list.count > 0) initial.add(row.list.id);
      }
    }
    return initial;
  });

  function toggleList(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PanelShell id="member-rows">
      <div data-slot="panel-title" style={titleBarStyle}>
        <span style={panelNameStyle}>{p.componentName}</span>
        <span style={panelCountStyle}>
          {p.subjectCount === 0 ? "no subject" : p.subjectCount === 1 ? "1 selected" : `${p.subjectCount} selected`}
        </span>
      </div>
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => (
        <div
          key={section.id}
          data-slot="inspector-section"
          data-section={section.id}
          data-muted={section.muted || undefined}
          style={section.muted ? mutedSectionStyle : undefined}
        >
          {index > 0 && <div style={sectionDividerStyle} />}
          <div data-slot="section-title" style={titleRowStyle}>
            <span style={sectionTitleTextStyle}>{section.label}</span>
            {section.summary && <span style={sectionSummaryStyle}>{section.summary}</span>}
            <span style={{ flex: 1 }} />
            <SectionActions actions={section.actions} />
          </div>
          <div data-slot="section-body" style={bodyStyle}>
            {section.rows.map((row) => {
              if (row.kind === "list") {
                const open = openIds.has(row.list.id);
                return (
                  <div key={`list:${row.list.id}`}>
                    <MemberRow list={row.list} open={open} onToggle={() => toggleList(row.list.id)} />
                    {open && (
                      <div data-slot="member-row-body" style={memberBodyStyle}>
                        {row.list.node}
                      </div>
                    )}
                  </div>
                );
              }
              // Every non-list row keeps going through the shared renderer —
              // one row at a time, so this component never learns how a
              // field or a pair is drawn.
              return <SectionRows key={sectionRowKey(row)} rows={[row]} geometry="label-left" />;
            })}
          </div>
        </div>
      ))}
    </PanelShell>
  );
}

/** A member list drawn as one property row: label cell, then a compact
 *  count summary and a chevron in the control cell. Row height, label
 *  width and type sizes match `StandardRow`'s `rowGridStyle`/`labelCellStyle`
 *  exactly — the likeness to a field row IS the design. */
function MemberRow({ list, open, onToggle }: { list: SectionList; open: boolean; onToggle: () => void }) {
  const summary = list.count > 0 ? `${list.count} member${list.count === 1 ? "" : "s"}` : "empty";
  return (
    <button
      type="button"
      data-slot="member-row-summary"
      data-list-id={list.id}
      data-open={open}
      aria-expanded={open}
      onClick={onToggle}
      style={memberRowButtonStyle}
    >
      <span style={memberLabelCellStyle}>{list.label}</span>
      <span style={memberControlCellStyle}>
        <span style={memberSummaryTextStyle}>{summary}</span>
        <Chevron open={open} />
      </span>
    </button>
  );
}

function sectionRowKey(row: SectionRow): string {
  if (row.kind === "field") return `field:${row.field.targetId}:${row.field.field.id}`;
  if (row.kind === "pair") return `pair:${row.fields[0].field.id}`;
  if (row.kind === "node") return `node:${row.id}`;
  return `list:${row.list.id}`;
}

export const MEMBERS_AS_ROWS: SectionPanelVariant = {
  id: "member-rows",
  label: "S5 · Members as rows",
  axis: "Members and fields interleave: a member list reads as one property row",
  blurb:
    "Deletes the fields/members split entirely. Every member list sits in its declared position drawn as one property row — a label, a count summary, a chevron — and expands in place to the list's own control underneath it.",
  Panel: MembersAsRowsPanel,
};

const titleBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "10px 12px 8px",
};
const panelNameStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--bbox-panel-fg, #111)" };
const panelCountStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", marginLeft: "auto" };
const titleRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 8px 0 12px" };
const bodyStyle: CSSProperties = { display: "flex", flexDirection: "column", padding: "0 12px 10px" };
const mutedSectionStyle: CSSProperties = { opacity: 0.55 };

// Same box model as StandardRow's rowGridStyle (gap 6, minHeight 22): a
// <button> reset to a full-width, unstyled row so it sits flush with the
// field rows around it.
const memberRowButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 22,
  width: "100%",
  padding: "1px 0",
  margin: 0,
  border: "none",
  background: "transparent",
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};
const memberLabelCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: LABEL_WIDTH,
  flexShrink: 0,
  fontSize: 11,
  color: "var(--bbox-panel-fg, #222)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const memberControlCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 4,
  flex: 1,
  minWidth: 0,
};
const memberSummaryTextStyle: CSSProperties = {
  fontSize: 10.5,
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
};
const memberBodyStyle: CSSProperties = { padding: "2px 0 4px" };
