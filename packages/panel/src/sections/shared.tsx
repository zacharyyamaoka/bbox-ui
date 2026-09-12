import type { CSSProperties, ReactNode } from "react";
import type { InspectorSection, SectionAction, SectionRow } from "./contract";
import { StandardPair, StandardRow, type RowGeometry } from "./StandardRow";

/**
 * The bits every section design shares, so five designs disagree about
 * section CHROME — which is the question they exist to answer — and never
 * about how a row is drawn or what an action looks like.
 */

/** Dispatches a section's rows to the standard renderers. */
export function SectionRows({ rows, geometry = "label-left" }: { rows: SectionRow[]; geometry?: RowGeometry }) {
  return (
    <>
      {rows.map((row) => {
        if (row.kind === "node") return <div key={`node:${row.id}`}>{row.node}</div>;
        if (row.kind === "list")
          return (
            <div key={`list:${row.list.id}`} data-slot="section-list" data-list-id={row.list.id} data-count={row.list.count}>
              {row.list.node}
            </div>
          );
        if (row.kind === "pair")
          return <StandardPair key={`pair:${row.fields[0].field.id}`} fields={row.fields} geometry={geometry} />;
        return <StandardRow key={`field:${row.field.targetId}:${row.field.field.id}`} bound={row.field} geometry={geometry} />;
      })}
    </>
  );
}

/** Figma's own right-aligned icon verbs. A title carries its actions; a
 *  row never grows a button that creates something. */
export function SectionActions({ actions }: { actions: SectionAction[] }) {
  if (actions.length === 0) return null;
  return (
    <span data-slot="section-actions" style={actionsWrapStyle}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          data-slot="section-action"
          data-action={action.id}
          title={action.title}
          aria-label={action.title}
          disabled={action.disabled}
          onClick={(e) => {
            // A section title may itself be a fold trigger (S2/S3): an
            // action inside it must not also toggle the fold.
            e.stopPropagation();
            action.onInvoke();
          }}
          style={actionButtonStyle(action.disabled)}
        >
          {action.glyph}
        </button>
      ))}
    </span>
  );
}

export function sectionRowCount(section: InspectorSection): number {
  return section.rows.length;
}

/** True once a section holds at least one member list with members — the
 *  only case where folding buys anything. */
export function sectionHasMembers(section: InspectorSection): boolean {
  return section.rows.some((row) => row.kind === "list" && row.list.count > 0);
}

export function Chevron({ open, size = 10 }: { open: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      data-slot="section-chevron"
      data-open={open}
      style={{
        display: "inline-block",
        width: size,
        flexShrink: 0,
        fontSize: size,
        lineHeight: 1,
        color: "var(--bbox-panel-fg-faint, #9a9aa5)",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
    >
      ▶
    </span>
  );
}

/** The panel shell every design sits in: full bleed, no card. Rule 1 of
 *  SECTION_PANEL_CONTRACT lives here so no design can forget it. */
export function PanelShell({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div data-slot="section-panel" data-section-panel={id} style={panelShellStyle}>
      {children}
    </div>
  );
}

const panelShellStyle: CSSProperties = {
  // WHY every one of these is explicit and none of them is a border: Zach,
  // 2026-09-12 — "I don't like how this block property thing is kinda in
  // its own box not spreading the full width of the inspector panel." The
  // old panel painted its own 320px bordered card and the column then
  // fought it with `[&>*]:!border-0`, which reached the LAYOUT wrapper
  // rather than the panel, so the card survived. A panel that never paints
  // one cannot lose that fight.
  width: "100%",
  maxWidth: "none",
  border: "none",
  borderRadius: 0,
  background: "transparent",
  display: "flex",
  flexDirection: "column",
  fontFamily: "inherit",
  fontSize: 12,
  color: "var(--bbox-panel-fg, #222)",
};

const actionsWrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 };
function actionButtonStyle(disabled?: boolean): CSSProperties {
  return {
    width: 20,
    height: 20,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "var(--bbox-panel-fg-muted, #5c5c66)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 13,
    lineHeight: 1,
    padding: 0,
  };
}

/** Shared title typography — Figma's own: bold, dark, sentence case, left,
 *  ~12px. Designs differ in what sits AROUND it, never in what it is. */
export const sectionTitleTextStyle: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 650,
  color: "var(--bbox-panel-fg, #111)",
  letterSpacing: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
export const sectionSummaryStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--bbox-panel-fg-faint, #9a9aa5)",
  whiteSpace: "nowrap",
};
/** The full-bleed hairline BETWEEN sections. Figma's panel is a stack of
 *  these and nothing else. */
export const sectionDividerStyle: CSSProperties = {
  height: 1,
  background: "var(--bbox-panel-border-soft, #e7e7ec)",
};
