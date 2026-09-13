import { Fragment } from "react";
import { sectionDividerStyle } from "../FoldRow";
import { PanelShell, PanelTitle, SectionBlock, SHIPPED_HEADER_POLICY, type HeaderPolicy } from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P2 · LEDGER — the header is a status line.
 *
 * Same chrome as P1 and the same rows; the difference is entirely in the
 * `HeaderPolicy` below. A header states standing facts whether you are
 * pointing at it or not — the count chip, a summary that survives expansion,
 * the verbs — and a FOLDED section carries the rows' own OVERRIDE / MIXED
 * tag, aggregated.
 *
 * AXIS — what a section header carries at rest: its status. "Body ⑥
 * 0 body · 2 OVERRIDE" tells you, with the section folded, that you changed
 * something in there. That is the one thing P1 structurally cannot do.
 *
 * WHY this design is now four booleans and nothing else: the folded mark
 * shipped as `HeaderPolicy.foldedOverrideMark`, default off (Zach,
 * 2026-09-12: "leave it off by default, I prefer simplicity, but yes if you
 * want to implement it that's fine"). So P2 is no longer a rival design with
 * private behaviour — it is the shipped panel with its flags turned up, and
 * anything it does can be taken one flag at a time.
 *
 * WHY the tag is `ProvenanceTag` from `variants/FigmaDense` (in
 * `SectionBlock`) and not a lookalike: Zach replaced the row's provenance
 * DOT with a plain-word tag on 2026-09-11, and the point was one legible
 * vocabulary for "this value is not the default". A section mark in a second
 * colour or shape would be a second vocabulary for the same idea, one level
 * up.
 */
function LedgerPanel(p: SectionPanelProps) {
  return (
    <PanelShell id="ledger">
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

const POLICY: HeaderPolicy = {
  ...SHIPPED_HEADER_POLICY,
  countAtRest: true,
  summaryWhenOpen: true,
  actionsAtRest: true,
  foldedOverrideMark: true,
};

export const LEDGER: SectionPanelVariant = {
  id: "ledger",
  label: "P2 · Ledger",
  axis: "A header carries its status at rest — count, live summary, verbs, and, folded, the rows' own OVERRIDE tag aggregated",
  blurb:
    "The shipped panel with every header flag turned up. Fold a Block to five lines and it still tells you which section you edited, how many rows it holds and what it can do — in the row tag's own vocabulary, one level up. Each half of it is one boolean on HeaderPolicy.",
  Panel: LedgerPanel,
};
