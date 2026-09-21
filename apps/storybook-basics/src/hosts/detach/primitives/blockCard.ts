/**
 * src/hosts/detach/primitives/blockCard.ts — `Block`'s own card
 * (`data-slot="block"`, `../../../components/block.tsx:245`) as a stock
 * rectangle.
 *
 * It DESCENDS: a Block paints its card and then lets whatever it contains —
 * its header, its members, a nested Block, a port that happens to sit inside
 * it — lower itself. That one flag is the whole of "composites get it free"
 * for the Block family, and it is why a Block rendered as a MEMBER of
 * another Block now lowers: it meets this same primitive on the way down,
 * with no member-specific code anywhere.
 *
 * The card is also the ANCHOR — the first shape a Block's walk emits,
 * because DOM order is paint order and the card encloses everything else.
 * `lowerShared.ts` stamps `shapes[0]` with the anchor meta so a rebuild can
 * find where the user left the group.
 */
import { boxRelativeTo, geoAtBox } from "../stockShapes";
import type { DetachablePrimitive } from "./detachablePrimitive";

export const BLOCK_CARD_SLOT = "block";

export const blockCardPrimitive: DetachablePrimitive = {
  slot: BLOCK_CARD_SLOT,
  descend: true,
  groupsSubtree: false,
  emit(context, el) {
    const box = boxRelativeTo(context.origin, el, context.editor);
    return [geoAtBox(box, { geo: "rectangle", color: "black", fill: "semi" })];
  },
};
