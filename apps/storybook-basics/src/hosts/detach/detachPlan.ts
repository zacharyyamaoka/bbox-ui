/**
 * src/hosts/detach/detachPlan.ts — turn a requested id set into an ordered detach
 * plan.
 *
 * DONOR: packages/adapter-tldraw/src/hosts/detach/detachPlan.ts (read in full,
 * 2026-09-18), ported near-verbatim — planning is read-only: it walks down
 * from the requested shapes (selecting a stock group detaches the bbox
 * shapes inside it) and fixes the one global lowering order the invariants
 * in `./detachableKind.ts` allow. Keeping the plan pure is what lets the
 * ordering rule be unit-tested against synthetic kinds with no editor at all
 * (see `./detachPlan.test.ts`).
 *
 * DIFFERS FROM THE DONOR in exactly one place: `matchDetachableKind` here
 * also takes a `SceneReader` (this app's kinds match by scene-node `type`,
 * not shape `type` — see `./detachableKind.ts`'s header), so `planDetach`
 * threads it through. `orderNodes` is byte-identical to the donor.
 */
import type { TLShape, TLShapeId } from "tldraw";

import { matchDetachableKind, type DetachableKind, type SceneReader } from "./detachableKind";

export interface NodeParticipant {
  id: TLShapeId;
  kind: DetachableKind;
}

/** The read surface planning needs. `Editor` satisfies it structurally;
 *  tests satisfy it with a stub board. */
export interface PlanReader {
  getShape(id: TLShapeId): TLShape | undefined;
  getSortedChildIdsForParent(id: TLShapeId): TLShapeId[];
}

export function planDetach(
  reader: PlanReader,
  sceneReader: SceneReader,
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
    const kind = matchDetachableKind(kinds, shape, sceneReader);
    if (kind) {
      nodes.push({ id, kind });
    }
    // Unmatched shapes are not participants, but their subtree may hold
    // some — a stock group's members, e.g. one built by a prior detach.
    for (const childId of reader.getSortedChildIdsForParent(id)) visit(childId);
  };

  for (const id of requestedIds) visit(id);
  return orderNodes(nodes);
}

/**
 * The one lowering order the invariants allow: leaf kinds before container
 * kinds. Within a rank, discovery order survives. Byte-identical to the
 * donor (`detachPlan.ts:63-70`).
 */
export function orderNodes(participants: readonly NodeParticipant[]): NodeParticipant[] {
  const rank = (participant: NodeParticipant) => (participant.kind.nodePhase === "container" ? 1 : 0);
  return [...participants].sort((left, right) => rank(left) - rank(right));
}
