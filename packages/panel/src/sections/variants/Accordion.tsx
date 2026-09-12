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
import type { InspectorSection, SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * S2 · ACCORDION ANATOMY — every section folds, and a folded section still
 * says something.
 *
 * S1 (Figma flat) never folds a section because Figma's own panel never has
 * to: four rows fit on screen without help. A Block with five sections and
 * eight member lists does not have that luxury, so here the title row IS
 * the trigger — chevron on the left, a live right-aligned summary on the
 * right — and a section's body only exists while it is open. Rows and
 * actions still route through the same shared renderers as every other
 * design; the fold is the only thing this variant owns.
 */
function AccordionPanel(p: SectionPanelProps) {
  // Which sections the user has explicitly flipped AWAY from their default
  // state. The default itself is recomputed from each section's own content
  // on every render, so a section that gains its first member (or loses its
  // last) re-derives its open/closed state instead of being stuck wherever
  // it happened to land when the panel first mounted.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());

  function isOpen(section: InspectorSection): boolean {
    const isDefaultOpen = !isEffectivelyEmpty(section);
    return flipped.has(section.id) ? !isDefaultOpen : isDefaultOpen;
  }

  function toggle(id: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PanelShell id="accordion">
      <div data-slot="panel-title" style={titleBarStyle}>
        <span style={panelNameStyle}>{p.componentName}</span>
        <span style={panelCountStyle}>
          {p.subjectCount === 0 ? "no subject" : p.subjectCount === 1 ? "1 selected" : `${p.subjectCount} selected`}
        </span>
      </div>
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => {
        const open = isOpen(section);
        // Collapsed: section.summary, or a derived count — a folded
        // section still has to say something. Expanded: section.summary
        // only, never the derived count, per spec.
        const summaryText = open ? section.summary : (section.summary ?? derivedSummary(section));
        return (
          <div
            key={section.id}
            data-slot="inspector-section"
            data-section={section.id}
            data-open={open}
            data-muted={section.muted || undefined}
            style={section.muted ? mutedSectionStyle : undefined}
          >
            {index > 0 && <div style={sectionDividerStyle} />}
            <div data-slot="section-title" style={titleRowStyle}>
              {/* The fold trigger names itself: a section title also holds
                  this design's icon ACTIONS (⚙, ⧉, ↺), so "the button in
                  the title row" is ambiguous to anything driving the panel
                  from outside — a journey clicking the first one would
                  invoke the action instead of folding. */}
              <button
                type="button"
                data-slot="section-toggle"
                aria-expanded={open}
                onClick={() => toggle(section.id)}
                style={triggerStyle}
              >
                <Chevron open={open} />
                <span style={sectionTitleTextStyle}>{section.label}</span>
                <span style={{ flex: 1 }} />
                {summaryText && <span style={sectionSummaryStyle}>{summaryText}</span>}
              </button>
              <SectionActions actions={section.actions} />
            </div>
            {open && (
              <div data-slot="section-body" style={bodyStyle}>
                <SectionRows rows={section.rows} />
              </div>
            )}
          </div>
        );
      })}
    </PanelShell>
  );
}

export const ACCORDION: SectionPanelVariant = {
  id: "accordion",
  label: "S2 · Accordion",
  axis: "Section chrome: every section collapses, with a live summary",
  blurb:
    "Every section is its own disclosure: chevron left, title, a live summary right when folded. A section holding real content opens by default; a section whose only content is empty member lists starts closed.",
  Panel: AccordionPanel,
};

/** A section whose only rows are member lists with nothing in them yet —
 *  the one case where starting closed loses nothing. */
function isEffectivelyEmpty(section: InspectorSection): boolean {
  if (section.rows.length === 0) return true;
  return section.rows.every((row) => row.kind === "list" && row.list.count === 0);
}

/** "4 properties · 3 members" — a field is one property, a pair is two
 *  (both halves write a value), and a list contributes its own count and
 *  its own label so two different lists in one section read as
 *  themselves, never as one anonymous total. */
function derivedSummary(section: InspectorSection): string | undefined {
  let properties = 0;
  const listParts: string[] = [];
  for (const row of section.rows) {
    if (row.kind === "field") properties += 1;
    else if (row.kind === "pair") properties += 2;
    else if (row.kind === "list") listParts.push(`${row.list.count} ${row.list.label}`);
  }
  const parts: string[] = [];
  if (properties > 0) parts.push(`${properties} propert${properties === 1 ? "y" : "ies"}`);
  parts.push(...listParts);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

const titleBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "10px 12px 8px",
};
const panelNameStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--bbox-panel-fg, #111)" };
const panelCountStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", marginLeft: "auto" };
const titleRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 8px 0 12px" };
const triggerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
  color: "inherit",
};
const bodyStyle: CSSProperties = { display: "flex", flexDirection: "column", padding: "0 12px 10px" };
// A muted section (its anatomy switched off, e.g. a hidden Bar) stays fully
// expandable and its rows stay reachable — dim it, don't disable it.
const mutedSectionStyle: CSSProperties = { opacity: 0.55 };
