import { Fragment } from "react";
import { FoldRow, sectionDividerStyle } from "../FoldRow";
import { PanelShell, PanelTitle, SectionBody, derivedSummary, isEffectivelyEmpty, type HeaderPolicy } from "../shared";
import { mutedSectionStyle } from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P1 · HAIRLINE — the combination itself, with nothing added.
 *
 * This is Zach's five picks and no sixth idea: a section is a title and a
 * hairline (S1); every section folds and the chevron appears only on hover
 * (S2, with his correction); a folded thing is one compact line (S5); a
 * member list has exactly one header (the bug he screenshotted); stacked
 * rows come from `FieldSpec.group`, already on main (S4); and nothing is
 * taken from S3.
 *
 * AXIS — what a section header carries at rest: NOTHING but its name. The
 * count chip, the summary and the verbs are all hover-revealed or
 * fold-revealed. At rest the panel is a column of bold words and hairlines,
 * which is the most literal possible reading of "the section is a title and
 * a hairline" and the answer to "can you make it way more compact" that
 * spends the least ink.
 *
 * The bet it makes: you know which section you want, so a header only has
 * to be findable, not informative. The cost it accepts: with everything
 * folded, the panel tells you nothing about what is inside.
 */
function HairlinePanel(p: SectionPanelProps) {
  return (
    <PanelShell id="hairline">
      <PanelTitle componentName={p.componentName} subjectCount={p.subjectCount} density={p.density} />
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => {
        const defaultOpen = !isEffectivelyEmpty(section);
        const open = p.fold.isOpen(`section:${section.id}`, defaultOpen);
        return (
          <Fragment key={section.id}>
            {index > 0 && <div style={sectionDividerStyle} />}
            <div
              data-slot="inspector-section"
              data-section={section.id}
              data-open={open}
              data-muted={section.muted || undefined}
              style={section.muted ? mutedSectionStyle : undefined}
            >
              <FoldRow
                label={section.label}
                summary={section.summary ?? derivedSummary(section)}
                actions={section.actions}
                density={p.density}
                open={open}
                foldable
                onToggle={() => p.fold.toggle(`section:${section.id}`, defaultOpen)}
                countAtRest={POLICY.countAtRest}
                summaryWhenOpen={POLICY.summaryWhenOpen}
                actionsAtRest={POLICY.actionsAtRest}
              />
              {open && <SectionBody section={section} fold={p.fold} density={p.density} policy={POLICY} />}
            </div>
          </Fragment>
        );
      })}
    </PanelShell>
  );
}

const POLICY: HeaderPolicy = {
  // Everything a header could say at rest, it does not.
  countAtRest: false,
  summaryWhenOpen: false,
  actionsAtRest: false,
};

export const HAIRLINE: SectionPanelVariant = {
  id: "hairline",
  label: "P1 · Hairline",
  axis: "A header carries nothing at rest — name only; count, summary and verbs appear on hover",
  blurb:
    "The combination itself: title plus hairline, every section folds, chevron on hover, one compact line when folded, one header per member list. At rest it is a column of bold words and nothing else.",
  Panel: HairlinePanel,
};
