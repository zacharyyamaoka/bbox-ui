/**
 * Turn a requested id set into an ordered detach plan.
 *
 * Planning is read-only: it walks down from the requested shapes (so
 * selecting a stock group detaches the bbox shapes inside it) and fixes the
 * one global lowering order the invariants allow. Execution lives in
 * `detachSweep.ts`; keeping the plan pure is what lets the ordering rules
 * be unit-tested against synthetic kinds with no editor at all.
 */
import type { TLShape, TLShapeId } from "tldraw";

import { matchDetachableKind, type DetachableKind } from "./detachableKind";

export interface NodeParticipant {
  id: TLShapeId;
  kind: DetachableKind;
}

/**
 * The read surface planning needs. `Editor` satisfies it structurally;
 * tests satisfy it with a stub board.
 */
export interface PlanReader {
  getShape(id: TLShapeId): TLShape | undefined;
  getSortedChildIdsForParent(id: TLShapeId): TLShapeId[];
}

export function planDetach(
  reader: PlanReader,
  requestedIds: readonly TLShapeId[],
  kinds: readonly DetachableKind[],
): NodeParticipant[] {
  const nodes: NodeParticipant[] = [];
  const seen = new Set<TLShapeId>();

  const visit = (id: TLShapeId) => {
    if (seen.has(id)) return;
    seen.add(id);
    const shape = reader.getShape(id);
    if (!shape) return;
    const kind = matchDetachableKind(kinds, shape);
    if (kind) {
      nodes.push({ id, kind });
      if (kind.discoversChildren === false) return;
    }
    // Unmatched shapes are not participants, but their subtree may hold
    // some — a group's members, a frame's children.
    for (const childId of reader.getSortedChildIdsForParent(id)) visit(childId);
  };

  for (const id of requestedIds) visit(id);
  return orderNodes(nodes);
}

/**
 * The one lowering order the invariants allow: leaf kinds before container
 * kinds. Within a rank, discovery order survives — an outer participant's
 * replacement still encloses an inner one the way the live shapes did.
 * A container discovered above the leaves it hosts must still lower after
 * them, which is exactly what the rank gives without any per-kind
 * knowledge of who contains whom.
 */
export function orderNodes(
  participants: readonly NodeParticipant[],
): NodeParticipant[] {
  const rank = (participant: NodeParticipant) =>
    participant.kind.nodePhase === "container" ? 1 : 0;
  // Array.prototype.sort is stable, so within a rank discovery order holds.
  return [...participants].sort((left, right) => rank(left) - rank(right));
}
