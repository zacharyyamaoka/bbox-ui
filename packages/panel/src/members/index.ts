import type { MembersControl } from "./contract";
import { LIST } from "./List";

export type { MembersControl, MembersControlProps, MembersSpec, MemberSummary } from "./contract";
export { MEMBERS_CONTRACT } from "./contract";
export * from "./model";
export { TYPE_GLYPH, typeGlyph } from "./shared";

/**
 * ONE control. Five were babbled on 2026-09-11 (List, Chips, Outline,
 * Grouped by type, Stepper — see reports/media/members-control-2026-09-11
 * and commit 9d365e2); Zach picked List the same day: "I greatly prefer
 * the list control, the one you recommended, lets always keep that. No
 * need for chips or anything else." The others were deleted rather than
 * kept behind a switcher — a switcher with one real answer is a control
 * whose only reachable state is the one it is already in.
 */
export const MEMBERS_CONTROLS: MembersControl[] = [LIST];

export function findMembersControl(id: string | null): MembersControl {
  return MEMBERS_CONTROLS.find((c) => c.id === id) ?? MEMBERS_CONTROLS[0]!;
}
