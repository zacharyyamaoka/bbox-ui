/**
 * src/hosts/detach/primitives/portRow.ts — one port's row on a rail
 * (`data-slot="block-port-item"`, `../../../components/blockPort.tsx:490`
 * and `:494`) as a GROUPING primitive: it paints nothing of its own and
 * exists only to say "the dot and the label inside me move together."
 *
 * Zach's rule for how the detached output should feel: "unpeel the groups
 * from the top down until you get to the exact grouping you want." A port
 * row is that unit — nobody wants to drag a ring away from its own label.
 *
 * WHY a structural primitive rather than a flag on the dot: the row is the
 * only element that CONTAINS both parts. The collapsed (simple-view) branch
 * renders a bare `Port` with no label at all, so the row legitimately holds
 * one shape there — and `lowerShared.ts` already declines to group a single
 * child (tldraw refuses a one-child group), so the same declaration covers
 * both branches with no special case.
 */
import type { DetachablePrimitive } from "./detachablePrimitive";

export const PORT_ROW_SLOT = "block-port-item";

export const portRowPrimitive: DetachablePrimitive = {
  slot: PORT_ROW_SLOT,
  descend: true,
  groupsSubtree: true,
  emit: () => [],
};
