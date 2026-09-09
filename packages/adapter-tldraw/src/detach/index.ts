/**
 * Detach-to-primitives, public surface.
 *
 * The registry is the one place a new detachable kind is added; nothing
 * else — not the sweep, not any existing kind — learns about it.
 */
import type { Editor, TLShapeId } from "tldraw";

import { blockDetachableKind } from "./blockDetachable";
import { matchDetachableKind, type DetachableKind } from "./detachableKind";
import { planDetach } from "./detachPlan";
import { runDetachSweep } from "./detachSweep";
import { portDetachableKind } from "./portDetachable";

export {
  BBOX_UI_META_KEY,
  DETACH_FORMAT_VERSION,
  detachMeta,
  isDetachedAnchor,
  readDetachedBlock,
  readDetachedPort,
  readDetachedRecord,
  readRebuildableRecord,
  toJsonSafe,
  type DetachedAnchorRecord,
  type DetachedBlockRecord,
  type DetachedPortRecord,
  type DetachedRecord,
} from "./detachModel";
export {
  matchDetachableKind,
  type DetachableKind,
  type DetachNodePhase,
  type LoweredNode,
} from "./detachableKind";
export { orderNodes, planDetach, type NodeParticipant, type PlanReader } from "./detachPlan";
export { runDetachSweep, type DetachSweepOptions, type DetachSweepResult } from "./detachSweep";
export { primitivesForPort, type PortPrimitiveInput, type PortPrimitives } from "./portPrimitives";
export {
  primitivesForBlock,
  type BlockPortRow,
  type BlockPrimitiveOptions,
  type BlockPrimitives,
} from "./blockPrimitives";
export { renderedLineMeasureFor, type RenderedLineMeasure } from "./stockPartials";
export { blockDetachableKind } from "./blockDetachable";
export { portDetachableKind } from "./portDetachable";
export { rebuildDetachedShapes, selectedRebuildableIds, type RebuildResult } from "./rebuild";

/** Every registered kind, leaf and (future) container alike. */
export const DETACHABLE_KINDS: readonly DetachableKind[] = [
  portDetachableKind,
  blockDetachableKind,
];

/** Ids in the selection (or their subtrees) that some kind can detach. */
export function selectedDetachableIds(editor: Editor): TLShapeId[] {
  return planDetach(editor, editor.getSelectedShapeIds(), DETACHABLE_KINDS).map(
    (participant) => participant.id,
  );
}

/** True when this one shape would participate in a detach. */
export function isDetachableShape(editor: Editor, id: TLShapeId): boolean {
  const shape = editor.getShape(id);
  return shape ? matchDetachableKind(DETACHABLE_KINDS, shape) !== null : false;
}

/** Detach every bbox-ui shape in the current selection. */
export function detachSelectedShapes(editor: Editor) {
  return runDetachSweep(
    editor,
    editor.getSelectedShapeIds(),
    DETACHABLE_KINDS,
  );
}
