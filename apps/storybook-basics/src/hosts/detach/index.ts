/**
 * src/hosts/detach/index.ts — detach-to-primitives, public surface.
 *
 * TWO REGISTRIES, and the difference is RULING 5 (Zach: "by making it work
 * on the basic components a primitive so then it comes for free for the
 * higher level things"):
 *   - `./primitives/` — how each PART lowers itself, keyed by the
 *     `data-slot` its component already stamps. Adding one entry there
 *     upgrades every composite, present and future, at once.
 *   - `./definitions/` — which SCENE NODES can be detached at all. A kind
 *     is a `matches` predicate plus a record; the lowering body is shared
 *     (`./lowerSceneNode.ts`), so no composite enumerates its own parts.
 *
 * ARCHITECTURE, decided here rather than assumed silently (Zach's brief for
 * this lane asked for exactly this call to be reported): both registries
 * live in THIS kit, never inside `../components/*.tsx`. Two independent reasons converge on the same
 * answer:
 *
 *   1. This repo's own governing rule (CLAUDE.md, "The one rule the design
 *      rests on") — a component file that knew what a tldraw `geo` shape was
 *      would import a canvas engine into code that must stay engine-free.
 *   2. Zach, on a different but analogous seam (the skin token layer):
 *      "nothing inside the code base should ever be driven [by
 *      presentation]" — a component should not carry the logic for what it
 *      turns into on a SPECIFIC host's export format.
 *
 * Both donors agree in practice: the pre-reset adapter's `blockDetachable.ts`
 * sits in `packages/adapter-tldraw`, not in `packages/bbox-ui`'s `block.tsx`;
 * SystemSketch's per-feature detach files sit beside their host feature, not
 * inside the shared component kit. This kit follows the same split.
 *
 * WHAT THIS KIT DOES NOT DO (see the lane report for the full "owed wiring"
 * list): register `glyph`/`code`/`value` scene-node KINDS, and lower a
 * `glyph`/`badge`/`bar` PART — an icon reduced to a rectangle is worse than
 * a missing icon, so that rule is deliberately unmade rather than guessed. The right-click "Rebuild" menu item IS
 * wired now (`./rebuildContextMenu.tsx`'s `RebuildContextMenu`, composed
 * onto tldraw's own `DefaultContextMenu`/`DefaultContextMenuContent` via
 * `TldrawHost`'s `components` prop) — this line used to say it was not.
 */
export {
  BBOX_UI_META_KEY,
  DETACH_FORMAT_VERSION,
  detachMeta,
  isDetachedAnchor,
  readDetachedNode,
  readDetachedRecord,
  toJsonSafe,
  type DetachedAnchorRecord,
  type DetachedNodeRecord,
  type DetachedRecord,
} from "./detachModel";
export {
  matchDetachableKind,
  type DetachableKind,
  type DetachNodePhase,
  type LoweredNode,
  type SceneReader,
} from "./detachableKind";
export { orderNodes, planDetach, type NodeParticipant, type PlanReader } from "./detachPlan";
export { runDetachSweep, type DetachSweepOptions, type DetachSweepResult } from "./detachSweep";
export { rebuildDetachedShapes, selectedRebuildableIds, type RebuildResult } from "./rebuild";
export { DETACHABLE_KINDS, blockDetachableKind } from "./definitions";
export { lowerSceneNodeShape, type LowerSceneNodeOptions } from "./lowerSceneNode";
export {
  DETACHABLE_PRIMITIVES,
  PRIMITIVE_REGISTRY,
  blockCardPrimitive,
  blockFooterPrimitive,
  blockHeaderPrimitive,
  lowerSubtree,
  portDotPrimitive,
  portLabelPrimitive,
  portRowPrimitive,
  registryOf,
  textSlotPrimitive,
  type DetachablePrimitive,
  type LoweredSubtree,
  type PrimitiveContext,
  type PrimitiveRegistry,
} from "./primitives";
export { registerEditorContainer, containerFor } from "./editorContainer";
export { RebuildContextMenu } from "./rebuildContextMenu";

import type { Editor, TLShapeId } from "tldraw";

import type { HostScene } from "../hostScene";
import { DETACHABLE_KINDS } from "./definitions";
import { planDetach } from "./detachPlan";
import { runDetachSweep } from "./detachSweep";

/** Ids in the selection (or their subtrees) some registered kind can detach. */
export function selectedDetachableIds(editor: Editor, scene: HostScene): TLShapeId[] {
  return planDetach(editor, { scene }, editor.getSelectedShapeIds(), DETACHABLE_KINDS).map((p) => p.id);
}

/** Detach every registered-kind shape in the current selection. */
export function detachSelectedShapes(
  editor: Editor,
  scene: HostScene,
  onSceneChange: ((next: HostScene) => void) | undefined,
) {
  return runDetachSweep(editor, scene, onSceneChange, editor.getSelectedShapeIds(), DETACHABLE_KINDS);
}
