import type { SectionPanelVariant } from "../contract";
import { HAIRLINE } from "./Hairline";
import { LEDGER } from "./Ledger";
import { STRATA } from "./Strata";

/**
 * Round 2's three, in the order the picker offers them.
 *
 * They share ONE foundation — Zach's picks of 2026-09-12, which are settled
 * and are therefore not variation any more: S1's title-and-hairline, S2's
 * fold with the chevron on hover, S5's compact folded line, one header per
 * member list, `FieldSpec.group` for stacked rows, nothing from S3. What
 * they vary is the one question the picks left open: WHAT A SECTION HEADER
 * IS FOR. Nothing at rest (P1), a status line (P2), or a statement of who
 * owns the values under it (P3).
 *
 * Density is deliberately NOT one of the three. It is a switch in the
 * control bar that applies to all of them, so "do I prefer P2" and "do I
 * prefer 24px headers" stay separable questions.
 *
 * Round 1's five (`claude/inspector-panel-v5`: Figma flat, Accordion,
 * Section rail, Stacked labels, Members as rows) are not carried forward.
 * Three of them are now premises, one was ruled out outright, and one
 * turned out to need no code at all.
 */
export const SECTION_PANELS: SectionPanelVariant[] = [HAIRLINE, LEDGER, STRATA];

export const DEFAULT_SECTION_PANEL = SECTION_PANELS[0]!;

export function findSectionPanel(id: string): SectionPanelVariant {
  return SECTION_PANELS.find((v) => v.id === id) ?? DEFAULT_SECTION_PANEL;
}

export { HAIRLINE, LEDGER, STRATA };
