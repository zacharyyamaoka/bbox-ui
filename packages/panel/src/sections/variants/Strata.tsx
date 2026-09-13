import { Fragment, type CSSProperties } from "react";
import { FoldRow, sectionDividerStyle } from "../FoldRow";
import {
  PanelShell,
  PanelTitle,
  SectionBody,
  derivedSummary,
  isEffectivelyEmpty,
  mutedSectionStyle,
  type HeaderPolicy,
} from "../shared";
import type { InspectorSection, SectionPanelProps, SectionPanelVariant } from "../contract";

/**
 * P3 · STRATA — the panel is ordered by WHO WRITES THE VALUE.
 *
 * Same chrome as P1. The one difference: the panel has two strata with a
 * heavier rule between them. Above it, everything the COMPONENT owns —
 * properties an author sets, that a `.bbox` file would persist. Below it,
 * everything the RENDER SURFACE owns — the X and Y a drag writes, which
 * belong to the canvas and not to the component at all.
 *
 * AXIS — what a section header carries at rest: its OWNER. P1 and P2 differ
 * on how much a header says about its own contents; this one says which
 * layer the contents belong to, and pays for it with one extra rule and a
 * section most components will not have.
 *
 * WHY the Renderer region is an ordinary `InspectorSection` and not a
 * bespoke block — Zach, 2026-09-12: "I like how there is a section that
 * displays the props from the renderer … I am thinking this could be just
 * another header though." He is right, and `apps/docs/.../contract.ts`
 * already said so before the panel did:
 *
 *     "Kept OUT of `Instance.props`: position is a fact about a host, not a
 *      property of the component, and putting it in props would put an x/y
 *      row in the inspector for every component."
 *
 * The distinction was already in the model; the panel just had no view onto
 * it. So this section needs no new mechanism: a host fact is a `FieldSpec`
 * bound to a different subject (`BoundField.targetId`/`subjects` — the same
 * machinery a Bar's `hidden` already uses inside the Block's Header
 * section), `disabled` for a surface with no drag handles (`RENDERS`' own
 * `canMove: false`), `note` for who writes it, and `muted` for a region
 * switched off. The prior implementation of this idea
 * (`HostFactsSection.tsx`, on `claude/glyph-finish`) carried two things a
 * section cannot: a paragraph of helper text under the title, and a warning
 * box — and both are exactly what Zach already deleted from member lists
 * ("No need to put this text under the members list. it just add
 * clutter."). Losing them is the finding, not a compromise.
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
          <Section section={section} p={p} />
        </Fragment>
      ))}
      {host.length > 0 && (
        <>
          {/* The stratum boundary. Heavier than the hairline between
              sections BECAUSE it separates two different kinds of fact,
              not two groups of the same kind — the one place this design
              spends ink that P1 does not. */}
          <div data-slot="stratum-rule" style={stratumRuleStyle} />
          {host.map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <div style={sectionDividerStyle} />}
              <Section section={section} p={p} />
            </Fragment>
          ))}
        </>
      )}
    </PanelShell>
  );
}

function Section({ section, p }: { section: InspectorSection; p: SectionPanelProps }) {
  const defaultOpen = !isEffectivelyEmpty(section);
  const open = p.fold.isOpen(`section:${section.id}`, defaultOpen);
  return (
    <div
      data-slot="inspector-section"
      data-section={section.id}
      data-open={open}
      data-host-owned={section.hostOwned || undefined}
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
  );
}

const POLICY: HeaderPolicy = {
  countAtRest: false,
  summaryWhenOpen: false,
  actionsAtRest: false,
};

const stratumRuleStyle: CSSProperties = {
  height: 1,
  marginTop: 6,
  background: "var(--bbox-panel-border, #d6d6de)",
};

export const STRATA: SectionPanelVariant = {
  id: "strata",
  label: "P3 · Strata",
  axis: "The panel splits by who writes the value: component-owned sections above, the render surface's own below",
  blurb:
    "P1's chrome plus a second stratum. Under a heavier rule sits Renderer · tldraw / React Flow / DOM — the X and Y a drag writes — as an ordinary section with ordinary rows, each saying who writes it, and disabled outright on the DOM render, which has no canvas.",
  renderer: true,
  Panel: StrataPanel,
};
