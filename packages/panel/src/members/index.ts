import type { MembersControl } from "./contract";
import { LIST } from "./List";
import { CHIPS } from "./Chips";
import { OUTLINE } from "./Outline";
import { GROUPED } from "./Grouped";
import { STEPPER } from "./Stepper";

export type { MembersControl, MembersControlProps, MembersSpec, MemberSummary } from "./contract";
export { MEMBERS_CONTRACT } from "./contract";
export * from "./model";
export { TYPE_GLYPH, typeGlyph } from "./shared";

/**
 * LIST is first, and therefore the default — it is the control Zach
 * pasted as "one simple idea", and the one SystemSketch's Arms and Members
 * sections already use. The other four are the babble: each moves ONE axis
 * (density, depth, grouping, how much per child) so the comparison is about
 * that axis and nothing else.
 */
export const MEMBERS_CONTROLS: MembersControl[] = [LIST, CHIPS, OUTLINE, GROUPED, STEPPER];

export function findMembersControl(id: string | null): MembersControl {
  return MEMBERS_CONTROLS.find((c) => c.id === id) ?? MEMBERS_CONTROLS[0]!;
}
