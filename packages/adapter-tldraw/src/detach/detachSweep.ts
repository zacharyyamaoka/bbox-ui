/**
 * Execute a detach plan: one history stopping point, phases in order.
 *
 * The phases are the whole point — see `detachableKind.ts` for the two
 * invariants they protect. Today both registered kinds are leaves, but the
 * sweep already runs `leaf` before `container` so a future region kind
 * plugs in without re-deriving the ordering.
 */
import type { Editor, TLShapeId } from "tldraw";

import type { DetachableKind, LoweredNode } from "./detachableKind";
import { planDetach } from "./detachPlan";

export interface DetachSweepResult {
  /** Replacement facts per lowered participant, keyed by the original id. */
  lowered: Map<TLShapeId, LoweredNode>;
}

export interface DetachSweepOptions {
  /** Mark a history stopping point (default true). */
  mark?: boolean;
  /** Replace the selection with the replacements (default true). */
  select?: boolean;
}

export function runDetachSweep(
  editor: Editor,
  requestedIds: readonly TLShapeId[],
  kinds: readonly DetachableKind[],
  options: DetachSweepOptions = {},
): DetachSweepResult {
  const result: DetachSweepResult = { lowered: new Map() };
  const plan = planDetach(editor, requestedIds, kinds);
  if (plan.length === 0) return result;

  // `editor.groupShapes` returns early — silently — unless the select tool
  // is active. Detaching while the Block tool is armed would otherwise
  // leave a heap of loose primitives, and nothing would say so.
  if (editor.getCurrentToolId() !== "select") editor.setCurrentTool("select");
  // One mark for the whole sweep, and none inside it: a second stopping
  // point in the middle would split the undo into "some of it came back".
  if (options.mark !== false) {
    editor.markHistoryStoppingPoint("detach to primitives");
  }

  editor.run(() => {
    const replacementSelection: TLShapeId[] = [];
    for (const participant of plan) {
      const shape = editor.getShape(participant.id);
      if (!shape || !participant.kind.matches(shape)) continue;
      const lowered = participant.kind.lowerNode(editor, shape);
      if (!lowered) continue;
      result.lowered.set(participant.id, lowered);
      if (lowered.selectionId !== null) {
        replacementSelection.push(lowered.selectionId);
      }
    }
    // A selection should stay a selection after its primitives take over;
    // otherwise the context-menu Detach makes the result unexpectedly
    // disappear from the user's active context.
    if (options.select !== false && replacementSelection.length > 0) {
      editor.setSelectedShapes(replacementSelection);
    }
  });
  return result;
}
