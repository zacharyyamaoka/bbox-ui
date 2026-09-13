import { Fragment } from "react";
import { sectionDividerStyle } from "../FoldRow";
import { PanelShell, PanelTitle, SectionBlock, SHIPPED_HEADER_POLICY, type HeaderPolicy } from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P1 · HAIRLINE — the combination itself, and the design that actually
 * ships.
 *
 * Zach picked it on 2026-09-12 ("ship P1"), so this is not a proposal any
 * more: it is what `/create` renders when nothing else is chosen, and
 * `SHIPPED_HEADER_POLICY` is literally this design's policy, exported from
 * `shared.tsx` so the shipped answer has one name.
 *
 * It is his five picks and no sixth idea: a section is a title and a
 * hairline (S1); every section folds and the chevron appears only on hover
 * (S2, with his correction); a folded thing is one compact line (S5); a
 * member list has exactly one header, drawn in the same grammar as a
 * property row (the bug he screenshotted, and its follow-up); stacked rows
 * come from `FieldSpec.group`, already on main (S4); nothing is taken from
 * S3.
 *
 * AXIS — what a section header carries at rest: NOTHING but its name. The
 * count chip, the summary and the verbs are all hover-revealed or
 * fold-revealed, and the folded override mark is off.
 */
function HairlinePanel(p: SectionPanelProps) {
  return (
    <PanelShell id="hairline">
      <PanelTitle componentName={p.componentName} subjectCount={p.subjectCount} density={p.density} />
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => (
        <Fragment key={section.id}>
          {index > 0 && <div style={sectionDividerStyle} />}
          <SectionBlock section={section} fold={p.fold} density={p.density} policy={POLICY} />
        </Fragment>
      ))}
    </PanelShell>
  );
}

/** The shipped policy, by reference rather than by copy — if the default
 *  ever changes, this design is the default and must change with it. */
const POLICY: HeaderPolicy = SHIPPED_HEADER_POLICY;

export const HAIRLINE: SectionPanelVariant = {
  id: "hairline",
  label: "P1 · Hairline",
  axis: "A header carries nothing at rest — name only; count, summary and verbs appear on hover",
  blurb:
    "The combination itself, and the shipped default: title plus hairline, every section folds, chevron on hover, one compact line when folded, one header per member list drawn as an ordinary property row. At rest it is a column of bold words and nothing else.",
  Panel: HairlinePanel,
};
