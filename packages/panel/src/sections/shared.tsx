import type { CSSProperties, ReactNode } from "react";
import { readFieldRow } from "../fieldModel";
import { DENSITY, type BoundField, type Density, type FoldState, type InspectorSection, type SectionList, type SectionRow } from "./contract";
import { FoldRow } from "./FoldRow";
import { StandardPair, StandardRow } from "./StandardRow";

/**
 * The bits every section design shares, so three designs disagree about
 * what a section HEADER carries — which is the question they exist to
 * answer — and never about how a row is drawn, how a list is headed, or
 * whether a member list ends up with two headers again.
 */

/** Header content for a member list, in one place: the compact summary
 *  Zach picked from S5 ("Center · empty", "Right · 1 member"). */
export function listSummary(count: number): string {
  return count > 0 ? `${count} member${count === 1 ? "" : "s"}` : "empty";
}

/** "4 properties · 3 members" — what a folded SECTION still gets to say. A
 *  field is one property, a pair is two (both halves write a value), and a
 *  list contributes its own label so two lists in one section read as
 *  themselves, never as one anonymous total. */
export function derivedSummary(section: InspectorSection, includeProperties = true): string | undefined {
  let properties = 0;
  const listParts: string[] = [];
  for (const row of section.rows) {
    if (row.kind === "field") properties += 1;
    else if (row.kind === "pair") properties += 2;
    else if (row.kind === "list") listParts.push(`${row.list.count} ${row.list.label.toLowerCase()}`);
  }
  const parts: string[] = [];
  // WHY a caller may turn the property count off: a design that already
  // chips the row count on the same header would otherwise print the same
  // number twice, a word apart — "Layout ④ 4 properties" — which was
  // exactly how P2 read in its first capture pass.
  if (includeProperties && properties > 0) parts.push(`${properties} propert${properties === 1 ? "y" : "ies"}`);
  parts.push(...listParts);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** A section whose only rows are member lists with nothing in them yet —
 *  the one case where starting closed loses nothing. */
export function isEffectivelyEmpty(section: InspectorSection): boolean {
  if (section.rows.length === 0) return true;
  return section.rows.every((row) => row.kind === "list" && row.list.count === 0);
}

/**
 * How many of a section's rows carry a row-level tag, and which one.
 *
 * WHY it goes through `readFieldRow` rather than counting explicit prop
 * keys: that IS the tag's own rule (`FigmaDense`'s `RowLabel` reads
 * `data.isMixed` / `trace.winner === "override"`), and an aggregate
 * computed a second way is an aggregate that can disagree with the rows it
 * is summarising — a header saying "1 OVERRIDE" over a section showing
 * none. One rule, read twice.
 */
export function sectionTagCount(section: InspectorSection): { tag: "override" | "mixed"; count: number } | null {
  const bounds: BoundField[] = [];
  for (const row of section.rows) {
    if (row.kind === "field") bounds.push(row.field);
    else if (row.kind === "pair") bounds.push(row.fields[0], row.fields[1]);
  }
  let overrides = 0;
  let mixed = 0;
  for (const bound of bounds) {
    if (bound.disabled || bound.provenance === "none") continue;
    const data = readFieldRow(bound.field, bound.subjects, bound.presets, bound.toSubject);
    if (data.isMixed) mixed += 1;
    else if (data.trace?.winner === "override") overrides += 1;
  }
  if (mixed > 0) return { tag: "mixed", count: mixed };
  if (overrides > 0) return { tag: "override", count: overrides };
  return null;
}

export interface HeaderPolicy {
  countAtRest: boolean;
  summaryWhenOpen: boolean;
  actionsAtRest: boolean;
}

/** Dispatches a section's rows to the standard renderers. Lists go through
 *  `ListBlock`, which is the ONLY place a member list gets a header. */
export function SectionRows({
  rows,
  fold,
  density,
  policy,
}: {
  rows: SectionRow[];
  fold: FoldState;
  density: Density;
  policy: HeaderPolicy;
}) {
  return (
    <>
      {rows.map((row) => {
        if (row.kind === "list") return <ListBlock key={`list:${row.list.id}`} list={row.list} fold={fold} density={density} policy={policy} />;
        if (row.kind === "pair") return <StandardPair key={`pair:${row.fields[0].field.id}`} fields={row.fields} />;
        return <StandardRow key={`field:${row.field.targetId}:${row.field.field.id}`} bound={row.field} />;
      })}
    </>
  );
}

/**
 * One member list: exactly ONE header, and its rows under it.
 *
 * WHY this component exists at all — it is the fix for the double header.
 * Before, the section layer drew a compact summary row and the list control
 * drew its own header inside `list.node`, so expanding showed both. Now the
 * list arrives headerless (`members/List.tsx`, `chrome: "none"`) and its
 * verbs arrive as `list.actions`, so the single `FoldRow` below is the only
 * header that can exist. There is no configuration under which two appear.
 */
export function ListBlock({
  list,
  fold,
  density,
  policy,
}: {
  list: SectionList;
  fold: FoldState;
  density: Density;
  policy: HeaderPolicy;
}) {
  const foldable = list.count > 0;
  const id = `list:${list.id}`;
  const open = foldable ? fold.isOpen(id, true) : false;
  return (
    <div data-slot="section-list" data-list-id={list.id} data-count={list.count} data-open={open}>
      <FoldRow
        label={list.label}
        count={list.count > 0 ? list.count : undefined}
        summary={listSummary(list.count)}
        actions={list.actions}
        density={density}
        open={open}
        foldable={foldable}
        onToggle={() => fold.toggle(id, true)}
        emphasis="list"
        countAtRest={policy.countAtRest}
        summaryWhenOpen={policy.summaryWhenOpen}
        actionsAtRest={policy.actionsAtRest}
      />
      {open && (
        <div data-slot="list-body" style={listBodyStyle}>
          {list.node}
        </div>
      )}
    </div>
  );
}

/** A section's body: its rows, at the density's gutter. */
export function SectionBody({
  section,
  fold,
  density,
  policy,
}: {
  section: InspectorSection;
  fold: FoldState;
  density: Density;
  policy: HeaderPolicy;
}) {
  const rung = DENSITY[density];
  return (
    <div data-slot="section-body" style={{ display: "flex", flexDirection: "column", padding: `0 ${rung.gutter}px ${rung.bodyBottom}px` }}>
      <SectionRows rows={section.rows} fold={fold} density={density} policy={policy} />
    </div>
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

/** The panel's own title bar — the component name and the selection count.
 *  Identical in all three designs, so it is not a place they may differ. */
export function PanelTitle({ componentName, subjectCount, density }: { componentName: string; subjectCount: number; density: Density }) {
  const rung = DENSITY[density];
  return (
    <div data-slot="panel-title" style={{ display: "flex", alignItems: "baseline", gap: 8, padding: `${rung.bodyBottom}px ${rung.gutter}px ${Math.max(4, rung.bodyBottom - 2)}px` }}>
      <span style={panelNameStyle}>{componentName}</span>
      <span style={panelCountStyle}>
        {subjectCount === 0 ? "no subject" : subjectCount === 1 ? "1 selected" : `${subjectCount} selected`}
      </span>
    </div>
  );
}

const panelShellStyle: CSSProperties = {
  // WHY every one of these is explicit and none of them is a border: Zach,
  // 2026-09-12 — "I don't like how this block property thing is kinda in
  // its own box not spreading the full width of the inspector panel." The
  // old panel painted its own 280px bordered card and the column then
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
const panelNameStyle: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--bbox-panel-fg, #111)" };
const panelCountStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-faint, #9a9aa5)", marginLeft: "auto" };
const listBodyStyle: CSSProperties = { padding: "0 0 4px" };

/** A section whose anatomy is switched off (a hidden Bar, a render surface
 *  with no canvas) stays fully expandable and its rows stay reachable —
 *  dim it, don't disable it. */
export const mutedSectionStyle: CSSProperties = { opacity: 0.55 };
