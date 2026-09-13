import type { CSSProperties, ReactNode } from "react";
import { readFieldRow } from "../fieldModel";
import { ProvenanceTag } from "../variants/FigmaDense";
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

/**
 * What a section or list that STANDS FOR A SLOT is called: the slot's own
 * name plus the noun.
 *
 * WHY the noun is not optional, and why this is a function rather than the
 * literal string at each call site — Zach, 2026-09-12, of a Flex cell whose
 * section header read bare "Left" above a Size / Direction / Justify / Align
 * / Wrap stack: "Left"/"Center"/"Right" are ALREADY words in that same panel,
 * as the values of Justify, Align and Port's Edge. A dropdown one row down
 * offers "Left" as a thing to pick, so the same bare word as a TITLE is not a
 * heading, it is an ambiguity — you cannot tell the piece of anatomy from the
 * value. "Left Slot" can only be the anatomy.
 *
 * It is one function because the Block's Header/Body/Footer, a Bar's
 * Left/Center/Right cells, and any slot host added later must not each get to
 * decide; three hand-written templates is how "Left" and "Left slot" and
 * "Left cell" end up on one screen.
 */
export function slotTitle(slotLabel: string): string {
  return `${slotLabel} Slot`;
}

/**
 * What a member list under a slot section is called when the component says
 * nothing more specific: "Members", never the parent's own name.
 *
 * WHY not the parent's name — the same screenshot: the "Left" section held a
 * list also titled "Left", because the list took the slot's label too. A
 * label that repeats the heading directly above it spends a row saying
 * nothing, and reads as though the two are different things that happen to
 * share a name. A `MembersSpec.label` (PortEdge's "Ports") still wins; this
 * is only the fallback, and the fallback should be the generic noun.
 */
export const MEMBERS_LABEL = "Members";

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
  /**
   * When a section is FOLDED and holds overridden rows, mark its header with
   * the rows' own OVERRIDE / MIXED tag, aggregated.
   *
   * WHY it is a flag here rather than one design's private behaviour: it is
   * the one idea from P2 worth keeping on its own — a status line earns its
   * ink exactly when the content it summarises cannot be seen, and not
   * before. Zach, 2026-09-12: "leave it off by default, I prefer simplicity,
   * but yes if you want to implement it that's fine." So the mechanism ships
   * and the default is `false`; `SHIPPED_HEADER_POLICY` is what P1 — the
   * default design — uses, and it leaves this off.
   */
  foldedOverrideMark: boolean;
}

/**
 * What a header carries in the design that actually renders.
 *
 * P1 · Hairline is the shipped default (Zach picked it on 2026-09-12), and
 * this is its policy: nothing at rest but the section's name. Exported so a
 * consumer of this package can start from the shipped answer and flip one
 * field, rather than reassembling four booleans and getting a fifth design
 * by accident.
 */
export const SHIPPED_HEADER_POLICY: HeaderPolicy = {
  countAtRest: false,
  summaryWhenOpen: false,
  actionsAtRest: false,
  foldedOverrideMark: false,
};

/**
 * One section: its single header row, and its body while it is open.
 *
 * WHY all three designs render through this rather than each writing their
 * own `FoldRow` call: after the fold, the count, the summary, the verbs and
 * now the folded override mark, a "section" is five policy decisions, and
 * three copies of that is how the panel grew two headers for one list in the
 * first place. A design supplies a `HeaderPolicy` and, at most, decides what
 * sits BETWEEN sections.
 */
export function SectionBlock({
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
  const defaultOpen = !isEffectivelyEmpty(section);
  const id = `section:${section.id}`;
  const open = fold.isOpen(id, defaultOpen);
  // Computed only when it can be shown: `sectionTagCount` resolves every row
  // in the section, which is wasted work on a panel that never marks one.
  const tagged = policy.foldedOverrideMark && !open ? sectionTagCount(section) : null;
  return (
    <div
      data-slot="inspector-section"
      data-section={section.id}
      data-open={open}
      data-host-owned={section.hostOwned || undefined}
      data-muted={section.muted || undefined}
      data-tagged={tagged ? `${tagged.count} ${tagged.tag}` : undefined}
      style={section.muted ? mutedSectionStyle : undefined}
    >
      <FoldRow
        label={section.label}
        count={policy.countAtRest ? countOf(section) : undefined}
        summary={section.summary ?? derivedSummary(section, !policy.countAtRest)}
        actions={section.actions}
        density={density}
        open={open}
        foldable
        onToggle={() => fold.toggle(id, defaultOpen)}
        mark={
          tagged ? (
            <ProvenanceTag
              tag={tagged.tag}
              text={`${tagged.count} ${tagged.tag}`}
              title={`${tagged.count} row${tagged.count === 1 ? "" : "s"} in ${section.label} ${tagged.tag === "mixed" ? "disagree across the selection" : "override their default"}`}
            />
          ) : undefined
        }
        countAtRest={policy.countAtRest}
        summaryWhenOpen={policy.summaryWhenOpen}
        actionsAtRest={policy.actionsAtRest}
      />
      {open && <SectionBody section={section} fold={fold} density={density} policy={policy} />}
    </div>
  );
}

/** A section chips its ROW count, the same way a member list chips its member
 *  count — one number, one meaning, at both levels. A section with one row
 *  does not chip it: "Appearance \u2460" says nothing you cannot see, and the
 *  summary beside it then keeps its own property count instead. */
export function countOf(section: InspectorSection): number | undefined {
  const n = section.rows.reduce((sum, row) => sum + (row.kind === "pair" ? 2 : 1), 0);
  return n > 1 ? n : undefined;
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
