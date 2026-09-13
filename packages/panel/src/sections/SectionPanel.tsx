import { Fragment } from "react";
import { sectionDividerStyle } from "./FoldRow";
import { PanelShell, PanelTitle, SectionBlock, SHIPPED_HEADER_POLICY } from "./shared";
import type { SectionPanelProps } from "./contract";

/**
 * THE section panel. One design, no registry, no picker.
 *
 * It was P1 · Hairline while there were three. Zach picked it on 2026-09-12
 * ("ship P1"), and on 2026-09-12 (round 3) the two rivals came out with it:
 *
 *   P2 · Ledger was, by the end, `{...SHIPPED_HEADER_POLICY, countAtRest,
 *   summaryWhenOpen, actionsAtRest, foldedOverrideMark: true}` and a `Panel`
 *   body byte-identical to this one. Its ideas survive as the four flags on
 *   `HeaderPolicy`, which is where he asked them to go.
 *
 *   P3 · Strata had already given up its real feature — the `Renderer ·
 *   <host>` section, now built for every subject that has host facts. What
 *   was left was one extra `<div>` drawing a heavier rule above the
 *   host-owned sections. That boundary is carried by the section's own label
 *   here, which is exactly the reading P1 was picked for.
 *
 * WHY the variant seam went with them rather than staying as a one-entry
 * registry: `SectionPanelVariant` existed to make three drawings of one panel
 * comparable — `id`, `label`, `axis`, `blurb` are all fields about a
 * COMPARISON. With one design they describe nothing, and a registry with one
 * row is an invitation to add a second rather than to change the first. The
 * repo's own precedent is `demos/capture-picks-applied.mjs`, which asserts
 * that once picks are applied "no switcher for navigator, layout or members
 * control remains".
 *
 * What it is: his five picks and no sixth idea. A section is a title and a
 * hairline (S1); every section folds and the chevron appears only on hover
 * (S2, with his correction); a folded thing is one compact line (S5); a
 * member list has exactly one header, drawn in the same grammar as a property
 * row (the bug he screenshotted, and its follow-up); stacked rows come from
 * `FieldSpec.group`, already on main (S4); nothing is taken from S3. At rest
 * a header carries nothing but its name — the count, the summary and the
 * verbs are hover- or fold-revealed, and the folded override mark is off.
 */
export function SectionPanel(p: SectionPanelProps) {
  return (
    <PanelShell id="sections">
      <PanelTitle componentName={p.componentName} subjectCount={p.subjectCount} density={p.density} />
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => (
        <Fragment key={section.id}>
          {index > 0 && <div style={sectionDividerStyle} />}
          <SectionBlock section={section} fold={p.fold} density={p.density} policy={SHIPPED_HEADER_POLICY} />
        </Fragment>
      ))}
    </PanelShell>
  );
}
