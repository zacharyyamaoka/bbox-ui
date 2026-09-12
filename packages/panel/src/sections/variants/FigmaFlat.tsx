import type { CSSProperties } from "react";
import { PanelShell, SectionActions, SectionRows, sectionDividerStyle, sectionSummaryStyle, sectionTitleTextStyle } from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * S1 · FIGMA FLAT — the section is a title and a hairline, nothing more.
 *
 * Read straight off the reference Zach pasted (Inspect panel, Ellipse
 * selected): Position / Layout / Appearance / Fill / Stroke / Effects /
 * Export are full-bleed runs separated by a 1px line, each headed by a
 * bold left title with its icon verbs right-aligned on the same baseline.
 * No chevron, no box, no card. Figma's panel does not fold its sections,
 * because a section that is four rows tall has nothing to hide.
 *
 * THESIS: a Block's inspector is long because it was undivided, not
 * because it is big. Give it the same seven-run structure and the
 * scrolling stops being a problem to solve with machinery.
 *
 * The one place folding survives is the member list's OWN header, where
 * Zach put it: "just put a folding chevron to the left of the existing
 * header". That is the List control's job (members/List.tsx), not this
 * design's — which is exactly why this design has no fold state at all.
 */
function FigmaFlatPanel(p: SectionPanelProps) {
  return (
    <PanelShell id="figma-flat">
      <div data-slot="panel-title" style={titleBarStyle}>
        <span style={panelNameStyle}>{p.componentName}</span>
        <span style={panelCountStyle}>
          {p.subjectCount === 0 ? "no subject" : p.subjectCount === 1 ? "1 selected" : `${p.subjectCount} selected`}
        </span>
      </div>
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => (
        <div key={section.id} data-slot="inspector-section" data-section={section.id} data-muted={section.muted || undefined}>
          {index > 0 && <div style={sectionDividerStyle} />}
          <div data-slot="section-title" style={titleRowStyle}>
            <span style={sectionTitleTextStyle}>{section.label}</span>
            {section.summary && <span style={sectionSummaryStyle}>{section.summary}</span>}
            <span style={{ flex: 1 }} />
            <SectionActions actions={section.actions} />
          </div>
          <div data-slot="section-body" style={bodyStyle}>
            <SectionRows rows={section.rows} />
          </div>
        </div>
      ))}
    </PanelShell>
  );
}

export const FIGMA_FLAT: SectionPanelVariant = {
  id: "figma-flat",
  label: "S1 · Figma flat",
  axis: "Section chrome: flat dividers, always open",
  blurb:
    "Figma's own panel, literally: full-bleed runs separated by a hairline, each with a bold title and right-aligned icon verbs. Nothing folds except a member list, on its own header.",
  Panel: FigmaFlatPanel,
};

const titleBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "10px 12px 8px",
};
const panelNameStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--bbox-panel-fg, #111)" };
const panelCountStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", marginLeft: "auto" };
// 12px side padding on the section body, matching Figma's own gutter, and
// the divider above runs edge to edge THROUGH it — that contrast is what
// makes a flat panel read as sections rather than as one long list.
const titleRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 30, padding: "0 8px 0 12px" };
const bodyStyle: CSSProperties = { display: "flex", flexDirection: "column", padding: "0 12px 10px" };
