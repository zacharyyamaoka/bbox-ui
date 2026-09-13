import { Fragment } from "react";
import { ProvenanceTag } from "../../variants/FigmaDense";
import { FoldRow, sectionDividerStyle } from "../FoldRow";
import {
  PanelShell,
  PanelTitle,
  SectionBody,
  derivedSummary,
  isEffectivelyEmpty,
  mutedSectionStyle,
  sectionTagCount,
  type HeaderPolicy,
} from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P2 · LEDGER — the header is a status line.
 *
 * Same chrome as P1 (title, hairline, hover chevron, one compact folded
 * line, one header per list) and the same rows. The one difference: a
 * header states standing facts whether you are pointing at it or not — the
 * count chip, a live summary that survives expansion, the verbs, and the
 * SAME OVERRIDE / MIXED tag the rows use, aggregated.
 *
 * AXIS — what a section header carries at rest: its status. "Layout
 * 2 OVERRIDE" tells you, with the section folded, that you changed
 * something in there. That is the one thing P1 structurally cannot do, and
 * the reason this design exists: with a Block's seven sections folded, P1
 * is a clean list of names and P2 is an audit of your edits.
 *
 * WHY the tag is `ProvenanceTag` from `variants/FigmaDense` and not a
 * lookalike: Zach replaced the row's provenance DOT with a plain-word tag
 * on 2026-09-11 and the whole point was one legible vocabulary for "this
 * value is not the default". A section mark in a second colour or a second
 * shape would be a second vocabulary for the same idea, one level up. It
 * is literally the row's component, given an aggregate string.
 *
 * The cost it accepts: every header is now three or four visual elements
 * instead of one, so the resting panel is busier — which is exactly the
 * thing the S1 pick was reacting against. That tension is the judgement.
 */
function LedgerPanel(p: SectionPanelProps) {
  return (
    <PanelShell id="ledger">
      <PanelTitle componentName={p.componentName} subjectCount={p.subjectCount} density={p.density} />
      {p.controlBar}
      {p.notice}
      {p.sections.map((section, index) => {
        const defaultOpen = !isEffectivelyEmpty(section);
        const open = p.fold.isOpen(`section:${section.id}`, defaultOpen);
        const tagged = sectionTagCount(section);
        const chip = countOf(section.rows);
        return (
          <Fragment key={section.id}>
            {index > 0 && <div style={sectionDividerStyle} />}
            <div
              data-slot="inspector-section"
              data-section={section.id}
              data-open={open}
              data-muted={section.muted || undefined}
              data-tagged={tagged ? `${tagged.count} ${tagged.tag}` : undefined}
              style={section.muted ? mutedSectionStyle : undefined}
            >
              <FoldRow
                label={section.label}
                count={chip}
                summary={section.summary ?? derivedSummary(section, chip === undefined)}
                actions={section.actions}
                density={p.density}
                open={open}
                foldable
                onToggle={() => p.fold.toggle(`section:${section.id}`, defaultOpen)}
                mark={
                  tagged ? (
                    <ProvenanceTag
                      tag={tagged.tag}
                      text={`${tagged.count} ${tagged.tag}`}
                      title={`${tagged.count} row${tagged.count === 1 ? "" : "s"} in ${section.label} ${tagged.tag === "mixed" ? "disagree across the selection" : "override their default"}`}
                    />
                  ) : undefined
                }
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

/** A section chips its ROW count, the same way a member list chips its
 *  member count — one number, one meaning, at both levels. A section with
 *  one row does not chip it: "Appearance ①" says nothing you cannot see.
 *  The summary beside it then drops its own property count (see
 *  `derivedSummary`'s second argument) rather than saying it twice. */
function countOf(rows: SectionPanelProps["sections"][number]["rows"]): number | undefined {
  const n = rows.reduce((sum, row) => sum + (row.kind === "pair" ? 2 : 1), 0);
  return n > 1 ? n : undefined;
}

const POLICY: HeaderPolicy = {
  countAtRest: true,
  summaryWhenOpen: true,
  actionsAtRest: true,
};

export const LEDGER: SectionPanelVariant = {
  id: "ledger",
  label: "P2 · Ledger",
  axis: "A header carries its status at rest — count, live summary, verbs, and the rows' own OVERRIDE tag aggregated",
  blurb:
    "P1's chrome with standing information on every header. Fold a Block down to seven lines and it still tells you which section you edited, how many rows it holds, and what it can do — using the row tag's own vocabulary, one level up.",
  Panel: LedgerPanel,
};
