import { useEffect, useState, type CSSProperties } from "react";
import { PanelShell, SectionActions, SectionRows, sectionSummaryStyle, sectionTitleTextStyle } from "../shared";
import type { InspectorSection, SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * S3 · SECTION RAIL — sections are destinations, not a stack to scroll.
 *
 * S1 and S2 both lay every section out top to bottom and let the column
 * scroll past whichever one you are not looking at. This design asks the
 * opposite question: what if the panel never shows more than one section's
 * body at a time? The seven section labels become a wrapping row of chips
 * directly under the panel title — Block · Layout · Appearance · Header ·
 * Body · Footer · Ports — and clicking one swaps the body beneath it. The
 * panel's own height stops depending on how many sections a subject has.
 *
 * The chip row is also the only way to answer "does this Block have ports"
 * without opening the Ports section: a filled member list anywhere in a
 * section's rows earns its chip a small dot, read straight off
 * `section.rows` rather than hand-maintained per section id.
 */

/** True once a section holds a member list with at least one member —
 *  the one fact worth surfacing on a chip you are not looking at. */
function sectionHasFilledList(section: InspectorSection): boolean {
  return section.rows.some((row) => row.kind === "list" && row.list.count > 0);
}

function RailPanel(p: SectionPanelProps) {
  const sections = p.sections;
  const joinedIds = sections.map((section) => section.id).join("|");
  const [selectedId, setSelectedId] = useState<string>(sections[0]?.id ?? "");

  // The subject can change under us (a different Block selected, a Bar
  // toggled off and its section gone); if the id we were showing no longer
  // exists, land back on the first section. Done in an effect, keyed on
  // the joined ids, so it never mutates state mid-render.
  useEffect(() => {
    if (!sections.some((section) => section.id === selectedId)) {
      setSelectedId(sections[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedIds]);

  const open = sections.find((section) => section.id === selectedId) ?? sections[0];

  return (
    <PanelShell id="rail">
      <div data-slot="panel-title" style={titleBarStyle}>
        <span style={panelNameStyle}>{p.componentName}</span>
        <span style={panelCountStyle}>
          {p.subjectCount === 0 ? "no subject" : p.subjectCount === 1 ? "1 selected" : `${p.subjectCount} selected`}
        </span>
      </div>
      {p.controlBar}
      {p.notice}
      <div data-slot="section-rail" style={railStyle}>
        {sections.map((section) => {
          const active = section.id === open?.id;
          const filled = sectionHasFilledList(section);
          return (
            <button
              key={section.id}
              type="button"
              data-slot="section-chip"
              data-section={section.id}
              data-active={active || undefined}
              aria-pressed={active}
              onClick={() => setSelectedId(section.id)}
              style={chipStyle(active, section.muted)}
            >
              <span style={chipLabelStyle}>{section.label}</span>
              {filled && (
                <span aria-hidden style={chipDotStyle}>
                  •
                </span>
              )}
              {section.summary && <span style={chipSummaryStyle}>{section.summary}</span>}
            </button>
          );
        })}
      </div>
      {open && (
        <div data-slot="inspector-section" data-section={open.id} data-muted={open.muted || undefined}>
          <div data-slot="section-title" style={titleRowStyle}>
            <span style={sectionTitleTextStyle}>{open.label}</span>
            {open.summary && <span style={sectionSummaryStyle}>{open.summary}</span>}
            <span style={{ flex: 1 }} />
            <SectionActions actions={open.actions} />
          </div>
          <div data-slot="section-body" style={bodyStyle}>
            <SectionRows rows={open.rows} />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

export const RAIL: SectionPanelVariant = {
  id: "rail",
  label: "S3 · Section rail",
  axis: "Navigation: sections are destinations, one at a time",
  blurb:
    "The section list becomes a wrapping row of chips under the title; exactly one section's body shows at a time, so the panel's height stops tracking how many sections the subject has.",
  Panel: RailPanel,
};

const titleBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "10px 12px 8px",
};
const panelNameStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--bbox-panel-fg, #111)" };
const panelCountStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", marginLeft: "auto" };

// The rail wraps rather than scrolling — the inspector column is ~22rem
// wide and seven chips will not fit one line. `flexWrap` is the entire
// mechanism; there is no horizontal scroller to keep in sync.
const railStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
  padding: "0 12px 8px",
};

function chipStyle(active: boolean, muted?: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 4,
    padding: "3px 8px",
    border: "none",
    background: active ? "var(--bbox-panel-emphasis, #16161a)" : "var(--bbox-panel-surface-2, #f6f6f8)",
    color: active
      ? "var(--bbox-panel-emphasis-fg, #fff)"
      : muted
        ? "var(--bbox-panel-fg-faint, #9a9aa5)"
        : "var(--bbox-panel-fg-muted, #5c5c66)",
    fontWeight: active ? 650 : 500,
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
    opacity: muted && !active ? 0.65 : 1,
  };
}

const chipLabelStyle: CSSProperties = { whiteSpace: "nowrap" };
const chipDotStyle: CSSProperties = { color: "var(--bbox-panel-accent, #0d9488)", fontSize: 10, lineHeight: 1 };
const chipSummaryStyle: CSSProperties = { fontSize: 9.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", whiteSpace: "nowrap" };

const titleRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 8px 0 12px" };
const bodyStyle: CSSProperties = { display: "flex", flexDirection: "column", padding: "0 12px 10px" };
