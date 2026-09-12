import type { SectionPanelVariant } from "../contract";
import { FIGMA_FLAT } from "./FigmaFlat";
import { ACCORDION } from "./Accordion";
import { RAIL } from "./Rail";
import { STACKED_LABELS } from "./StackedLabels";
import { MEMBERS_AS_ROWS } from "./MembersAsRows";

/**
 * Five section designs, babbled 2026-09-12 against Zach's feedback on the
 * Block inspector. Each differs from every other on a LOAD-BEARING axis —
 * section chrome, navigation model, row geometry, or how a member list and
 * its section's fields interleave — never on styling alone:
 *
 *   S1 Figma flat     section chrome: flat dividers, nothing folds
 *   S2 Accordion      section chrome: every section folds, with a summary
 *   S3 Section rail   navigation: one section at a time, chips are the map
 *   S4 Stacked labels row geometry: label above, two-up; lists as a strip
 *   S5 Members as rows interleave: a member list IS a property row
 *
 * S1 is first and therefore the default, because it answers his reference
 * directly ("Let's match the look and feel of the figma inspector panel,
 * with regards to its headers and group of things"). The other four exist
 * because that reference does not have to be the answer for a panel whose
 * subject has six sections and eight member lists, which Figma's never
 * does.
 *
 * NOTHING is deleted until he picks. The pre-feedback inspector is still
 * reachable from the same switcher as "Current (before)", so the
 * comparison is one dropdown rather than a git checkout.
 */
export const SECTION_PANELS: SectionPanelVariant[] = [FIGMA_FLAT, ACCORDION, RAIL, STACKED_LABELS, MEMBERS_AS_ROWS];

export const DEFAULT_SECTION_PANEL = SECTION_PANELS[0]!;

export function findSectionPanel(id: string): SectionPanelVariant {
  return SECTION_PANELS.find((v) => v.id === id) ?? DEFAULT_SECTION_PANEL;
}
