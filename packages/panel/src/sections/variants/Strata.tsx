import { Fragment, type CSSProperties } from "react";
import { sectionDividerStyle } from "../FoldRow";
import { PanelShell, PanelTitle, SectionBlock, SHIPPED_HEADER_POLICY, type HeaderPolicy } from "../shared";
import type { SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P3 · STRATA — the panel MARKS the boundary between who writes the values.
 *
 * WHAT CHANGED after Zach's 2026-09-12 review, and it is most of this file:
 * the `Renderer · <surface>` section is no longer P3's feature. His words —
 * "for p3 renderer section I don't think we need a new thing to the model,
 * we can probably just support it within the existing model... its just
 * another header and fields." He is right, and it was never gated on
 * anything real: the section is built from an ordinary `FieldSpec` array
 * bound to a different subject, which every design can already render. The
 * `SectionPanelVariant.renderer` flag that used to switch it on is gone, and
 * the host-owned section is now built whenever the subject HAS host facts —
 * so P1, the shipped default, shows it too.
 *
 * What is left here is the only part that was ever a design question: does
 * the panel DRAW the boundary? Everything the component owns sits above a
 * heavier rule; everything the render surface owns sits below it. P1 just
 * lists the sections and lets the label ("Renderer · tldraw") do the work.
 *
 * AXIS — what a section header carries at rest: its OWNER, made structural.
 * It costs one extra rule and nothing else; the sections on both sides are
 * identical to P1's.
 */
function StrataPanel(p: SectionPanelProps) {
  const owned = p.sections.filter((s) => !s.hostOwned);
  const host = p.sections.filter((s) => s.hostOwned);
  return (
    <PanelShell id="strata">
      <PanelTitle componentName={p.componentName} subjectCount={p.subjectCount} density={p.density} />
      {p.controlBar}
      {p.notice}
      {owned.map((section, index) => (
        <Fragment key={section.id}>
          {index > 0 && <div style={sectionDividerStyle} />}
          <SectionBlock section={section} fold={p.fold} density={p.density} policy={POLICY} />
        </Fragment>
      ))}
      {host.length > 0 && (
        <>
          {/* The stratum boundary. Heavier than the hairline between sections
              BECAUSE it separates two different kinds of fact, not two groups
              of the same kind — the one place this design spends ink that P1
              does not. */}
          <div data-slot="stratum-rule" style={stratumRuleStyle} />
          {host.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <div style={sectionDividerStyle} />}
              <SectionBlock section={section} fold={p.fold} density={p.density} policy={POLICY} />
            </Fragment>
          ))}
        </>
      )}
    </PanelShell>
  );
}

const POLICY: HeaderPolicy = SHIPPED_HEADER_POLICY;

const stratumRuleStyle: CSSProperties = {
  height: 1,
  marginTop: 6,
  background: "var(--bbox-panel-border, #d6d6de)",
};

export const STRATA: SectionPanelVariant = {
  id: "strata",
  label: "P3 · Strata",
  axis: "The panel draws the boundary: component-owned sections above a heavier rule, the render surface's own below it",
  blurb:
    "P1's sections, in two strata. The Renderer section itself ships in every design now — this one additionally marks where the component's properties stop and the canvas's begin, instead of leaving that to the section's label.",
  Panel: StrataPanel,
};
