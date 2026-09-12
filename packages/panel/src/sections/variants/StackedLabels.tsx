import { useState, type CSSProperties } from "react";
import { PanelShell, SectionActions, SectionRows, sectionDividerStyle, sectionSummaryStyle, sectionTitleTextStyle } from "../shared";
import type { SectionPanelProps, SectionPanelVariant, SectionRow } from "../contract";

/**
 * S4 · STACKED LABELS — Figma's Inspect panel read a second way: not for its
 * flat section chrome (S1 already took that), but for what sits INSIDE a
 * section. There, a caption ("Alignment", "Position", "Rotation",
 * "Dimensions") sits ABOVE its control, and pairs (X/Y, W/H) share one line.
 * That is `StandardRow`'s `"label-above"` geometry plus a two-up grid — this
 * design is that geometry applied to every row, not a restyle beside it.
 *
 * The second axis is where a member list lands. S1 leaves a `kind: "list"`
 * row wherever it falls among the fields; here every list in a section is
 * pulled OUT of the grid and shown as a row of chips directly under the
 * section's own title — one glance at what a section holds before opening
 * any of it. A chip is a fold trigger over exactly one list at a time per
 * section; the chosen list's `node` then runs full width, still rendered
 * exactly as the list control built it (rule: this design never draws a
 * member row itself, only where it sits).
 */

type ListRow = Extract<SectionRow, { kind: "list" }>;

/** `pair` / `list` / `node` rows always take the full two-up line — a pair
 *  because it is already two fields wide, a list because it never reaches
 *  the grid at all (see above), a node because a variant can't predict its
 *  width. A lone `field` row spans only when its OWN control needs the
 *  room: a >3-option segmented strip, a flag set, or free text — the same
 *  three shapes that already refuse to squeeze into `LABEL_WIDTH` today. */
function spansBothColumns(row: SectionRow): boolean {
  if (row.kind !== "field") return true;
  const { kind, options } = row.field.field;
  if (kind === "flags" || kind === "text") return true;
  return kind === "segments" && (options?.length ?? 0) > 3;
}

function keyForRow(row: Exclude<SectionRow, ListRow>): string {
  if (row.kind === "field") return `field:${row.field.targetId}:${row.field.field.id}`;
  if (row.kind === "pair") return `pair:${row.fields[0].field.id}`;
  return `node:${row.id}`;
}

function StackedLabelsPanel(p: SectionPanelProps) {
  // One open list id per section, keyed by section id — a chip toggles its
  // own list closed, opening a different chip in the same section replaces
  // it, and a different section's chips are unaffected.
  const [openListBySection, setOpenListBySection] = useState<Record<string, string | null>>({});

  return (
    <PanelShell id="stacked">
      <div data-slot="panel-title" style={titleBarStyle}>
        <span style={panelNameStyle}>{p.componentName}</span>
        <span style={panelCountStyle}>
          {p.subjectCount === 0 ? "no subject" : p.subjectCount === 1 ? "1 selected" : `${p.subjectCount} selected`}
        </span>
      </div>
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => {
        const lists = section.rows.filter((row): row is ListRow => row.kind === "list");
        const propertyRows = section.rows.filter((row): row is Exclude<SectionRow, ListRow> => row.kind !== "list");
        const openListId = openListBySection[section.id] ?? null;
        const openList = lists.find((row) => row.list.id === openListId);
        return (
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
            {lists.length > 0 && (
              <div data-slot="member-strip" style={memberStripStyle}>
                {lists.map((row) => {
                  const active = row.list.id === openListId;
                  return (
                    <button
                      key={row.list.id}
                      type="button"
                      data-slot="list-chip"
                      data-list-id={row.list.id}
                      aria-pressed={active}
                      onClick={() =>
                        setOpenListBySection((prev) => ({
                          ...prev,
                          [section.id]: prev[section.id] === row.list.id ? null : row.list.id,
                        }))
                      }
                      style={chipStyle(active)}
                    >
                      <span style={chipLabelStyle}>{row.list.label}</span>
                      <span style={chipCountStyle}>{row.list.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {openList && (
              <div data-slot="section-list" data-list-id={openList.list.id}>
                {openList.list.node}
              </div>
            )}
            <div data-slot="section-body" style={bodyGridStyle}>
              {propertyRows.map((row) => (
                <div key={keyForRow(row)} style={spansBothColumns(row) ? cellSpanStyle : cellStyle}>
                  <SectionRows rows={[row]} geometry="label-above" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </PanelShell>
  );
}

export const STACKED_LABELS: SectionPanelVariant = {
  id: "stacked",
  label: "S4 · Stacked labels",
  axis: "Row geometry: label above the control, two-up; members as a strip at the section head",
  blurb:
    "Figma's caption-over-control rhythm applied to every row, two-up in a grid. Every member list in a section surfaces as a chip under its title, open one at a time, full width.",
  Panel: StackedLabelsPanel,
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

const mutedSectionStyle: CSSProperties = { opacity: 0.6 };

const memberStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  padding: "0 12px 8px",
};
function chipStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 22,
    padding: "0 9px",
    fontSize: 10.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    border: `1px solid ${active ? "var(--bbox-panel-fg, #222)" : "var(--bbox-panel-border, #d6d6de)"}`,
    borderRadius: 999,
    background: active ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: active ? "var(--bbox-panel-surface, #fff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
    cursor: "pointer",
  };
}
const chipLabelStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis" };
const chipCountStyle: CSSProperties = { fontSize: 9.5, opacity: 0.75 };

// The two-up grid every S4 row lives in. Airier than S1's dense label-left
// column by design — Zach's own read of the reference: "airier than the
// dense label-left grammar."
const bodyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  columnGap: 10,
  rowGap: 6,
  padding: "2px 12px 10px",
};
const cellStyle: CSSProperties = { minWidth: 0 };
const cellSpanStyle: CSSProperties = { minWidth: 0, gridColumn: "1 / -1" };
