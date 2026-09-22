/**
 * src/components/blockPortMembers.layout.ts — the pure half of
 * `BlockPortMembers` (lane `collapsed-members`, 2026-09-22).
 *
 * One job: how tall a member's PORTS need to be, from nothing but its port
 * count. Both views use it — the port view's band and the expanded view's
 * card body — so a member's ports take the same room whichever view shows
 * them.
 *
 * WHY no new spacing rule: a port-view rail with ports on the left and right
 * walls only is `aligned / start` with `RAIL_GAP_PX` between slots and no
 * edge padding (`railPlanFor`'s left/right-only branch, blockPort.layout.ts).
 * Its content box therefore needs exactly `n` slots and `n - 1` gaps, and
 * that is all this returns: the base's own rail pitch, summed. A band built
 * to this height holds its last dot's whole slot, so no port can hang past
 * the band, and the parent (which hugs its bands) grows by exactly this.
 */
import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, railPitchPx } from "./blockPort.layout";

/**
 * The main-axis length of an aligned rail holding `portCount` ports:
 * `(n - 1)` pitches plus one slot.
 *
 * WHY at least one slot: a member with no ports still gets a one-slot band.
 * With its header hidden, a zero-height band would make the member vanish
 * from the stack, and a member must never silently disappear from a view.
 */
export function memberPortsLengthPx(
  portCount: number,
  slotMainPx: number = PORT_EDGE_SLOT_MIN_PX,
  gap: number = RAIL_GAP_PX,
): number {
  const slots = Math.max(1, portCount);
  return (slots - 1) * railPitchPx(slotMainPx, gap) + slotMainPx;
}
