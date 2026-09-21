/**
 * src/hosts/detach/detachSweep.ts — execute a detach plan: one history stopping
 * point, phases in order.
 *
 * DONOR: packages/adapter-tldraw/src/hosts/detach/detachSweep.ts (read in full,
 * 2026-09-18) — the `editor.run` wrapping, the single history mark, the
 * "replace the selection with the replacements" rule and the tool-guard
 * (`editor.getCurrentToolId() !== "select"`, needed because
 * `editor.groupShapes` silently no-ops unless the select tool is active) are
 * ported near-verbatim.
 *
 * DIFFERS FROM THE DONOR: this app's scene node DATA lives outside the
 * shape (`../hosts/tldrawHost.tsx`'s file header, rule 1), so a sweep here
 * also has to strip the lowered node out of `HostScene.nodes` — the donor
 * has no such step because a `bbox-block` shape WAS its own data. The scene
 * write is applied ONCE, after every phase, as a single `onSceneChange`
 * call — not per-node — so a multi-node sweep produces one scene update,
 * matching the donor's "one mark for the whole sweep" posture at the scene
 * layer too.
 */
import type { Editor, TLShapeId } from "tldraw";

import type { HostScene } from "../hostScene";
import type { DetachableKind, LoweredNode } from "./detachableKind";
import { planDetach } from "./detachPlan";

export interface DetachSweepResult {
  /** Replacement facts per lowered participant, keyed by the original id. */
  lowered: Map<TLShapeId, LoweredNode>;
  /** The scene node ids that were removed — empty when nothing lowered. */
  removedNodeIds: string[];
}

export interface DetachSweepOptions {
  mark?: boolean;
  select?: boolean;
}

export function runDetachSweep(
  editor: Editor,
  scene: HostScene,
  onSceneChange: ((next: HostScene) => void) | undefined,
  requestedIds: readonly TLShapeId[],
  kinds: readonly DetachableKind[],
  options: DetachSweepOptions = {},
): DetachSweepResult {
  const result: DetachSweepResult = { lowered: new Map(), removedNodeIds: [] };
  const plan = planDetach(editor, { scene }, requestedIds, kinds);
  if (plan.length === 0) return result;

  if (editor.getCurrentToolId() !== "select") editor.setCurrentTool("select");
  if (options.mark !== false) {
    editor.markHistoryStoppingPoint("detach to primitives");
  }

  const removedNodeIds: string[] = [];
  editor.run(() => {
    const replacementSelection: TLShapeId[] = [];
    for (const participant of plan) {
      const shape = editor.getShape(participant.id);
      if (!shape || !participant.kind.matches(shape, { scene })) continue;
      const lowered = participant.kind.lowerNode(editor, shape, { scene });
      if (!lowered) continue;
      result.lowered.set(participant.id, lowered);
      if (lowered.selectionId !== null) {
        replacementSelection.push(lowered.selectionId);
      }
      const bboxNodeId = (shape.props as { nodeId?: string }).nodeId;
      if (typeof bboxNodeId === "string") removedNodeIds.push(bboxNodeId);
    }
    if (options.select !== false && replacementSelection.length > 0) {
      editor.setSelectedShapes(replacementSelection);
    }
  });

  if (removedNodeIds.length > 0) {
    result.removedNodeIds = removedNodeIds;
    onSceneChange?.({
      ...scene,
      nodes: scene.nodes.filter((node) => !removedNodeIds.includes(node.id)),
    });
  }
  return result;
}
