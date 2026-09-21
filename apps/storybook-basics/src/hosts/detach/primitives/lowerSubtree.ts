/**
 * src/hosts/detach/primitives/lowerSubtree.ts — the generic walk that turns a
 * composite's RENDERED DOM into stock shapes by dispatching each part to the
 * primitive that owns it.
 *
 * This is the whole of RULING 5's mechanism. A composite's `lowerNode` no
 * longer enumerates its parts; it calls this. So a composite gets every
 * registered primitive inside it for free, at any depth, and a composite
 * nested inside another composite (a Block rendered as a member of a Block)
 * lowers through the very same primitives its standalone form does — there
 * is no second code path to keep in step.
 *
 * WHY a DOM walk rather than a recursion over props or scene data: this
 * kit's whole measurement posture is "read the ACTUAL rendered boxes off
 * the DOM at the moment of detach" (`../stockShapes.ts`'s header, and the
 * reason is that this app's Block/Port layout is not closed-form over
 * props). A walk over the painted tree is the only enumeration that agrees
 * with that by construction — it cannot report a part the user is not
 * looking at, and it cannot MISS one the composite rendered, which is
 * exactly the failure the per-composite version had.
 *
 * The walk starts at `root`'s CHILDREN, never at `root` itself: `root` is
 * the lowering composite's own wrapper and the origin every box is measured
 * against, not a part to be painted.
 */
import type { TLShapeId, TLShapePartial } from "tldraw";

import type { DetachablePrimitive, PrimitiveContext, PrimitiveRegistry } from "./detachablePrimitive";

export interface LoweredSubtree {
  /** Every stock shape, in paint order (a container's own box precedes its
   *  contents, because DOM order IS paint order here). The first is the
   *  outermost box the composite painted — the anchor `lowerToGroup` marks. */
  shapes: TLShapePartial[];
  /** Shape-id sets that each want their own stock group, innermost first —
   *  the shape `lowerShared.ts`'s `nestedRows` takes. */
  nestedRows: { shapeIds: TLShapeId[] }[];
}

interface WalkResult {
  ids: TLShapeId[];
  /** Did anything in this subtree already claim a group? See the guard in
   *  `walk` — grouping is ONE level deep today because that is what
   *  `lowerShared.ts`'s `nestedRows` can execute (it groups each row against
   *  live shape ids, and an outer row whose members were already absorbed
   *  into an inner group would name ids that no longer sit where it thinks).
   *  Generalising grouping to one level per composite is owed follow-up;
   *  this flag is what keeps the current limit honest rather than silently
   *  emitting a row that would misgroup. */
  claimedRow: boolean;
}

export function lowerSubtree(context: PrimitiveContext, root: Element, registry: PrimitiveRegistry): LoweredSubtree {
  const shapes: TLShapePartial[] = [];
  const nestedRows: { shapeIds: TLShapeId[] }[] = [];

  const primitiveFor = (el: Element): DetachablePrimitive | undefined => {
    const slot = el.getAttribute("data-slot");
    return slot === null ? undefined : registry.get(slot);
  };

  const walk = (el: Element): WalkResult => {
    const ids: TLShapeId[] = [];
    let claimedRow = false;

    const children = el.children;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const primitive = primitiveFor(child);

      // An element with no registered primitive is TRANSPARENT, not opaque:
      // the walk passes straight through it into its children. That is what
      // lets a part land inside arbitrary un-modelled chrome — a rail, a
      // flex row, a dnd boundary — and still lower itself.
      if (!primitive) {
        const inner = walk(child);
        ids.push(...inner.ids);
        claimedRow = claimedRow || inner.claimedRow;
        continue;
      }

      const own = primitive.emit(context, child);
      shapes.push(...own);
      const subtreeIds: TLShapeId[] = own.map((partial) => partial.id as TLShapeId);

      let innerClaimedRow = false;
      if (primitive.descend) {
        const inner = walk(child);
        subtreeIds.push(...inner.ids);
        innerClaimedRow = inner.claimedRow;
      }

      if (primitive.groupsSubtree && subtreeIds.length > 1 && !innerClaimedRow) {
        nestedRows.push({ shapeIds: subtreeIds });
        claimedRow = true;
      } else {
        claimedRow = claimedRow || innerClaimedRow;
      }

      ids.push(...subtreeIds);
    }

    return { ids, claimedRow };
  };

  walk(root);
  return { shapes, nestedRows };
}
