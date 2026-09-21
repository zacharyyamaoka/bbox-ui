// src/shapes/block/BlockTool.ts — arming and placing an `ss-block`.
//
// Stock `BaseBoxShapeTool` plus ONE block-specific completion step, P-045: the
// gesture picks the view. The engine still owns click placement, live drag
// sizing, coordinate conversion, cancel, undo boundaries, tool locking and
// create-inside-frame; the only thing added here is "which view did that box
// ask for", and the answer comes from `blockPlacement.ts`, which is pure.
import { BaseBoxShapeTool, StateNode, type Editor, type TLShape, type TLShapeId, type TLStateNodeConstructor } from "tldraw";

import { BLOCK_SHAPE_TYPE, BLOCK_TOOL_ID } from "../types";
import type { BlockShape } from "./BlockShapeUtil";
import { blockViewForPlacement, type BlockPlacementGesture } from "./blockPlacement";

/**
 * The shapes the finished box landed completely around — the frame test.
 *
 * Siblings only, and only shapes this block would actually be allowed to
 * adopt. The allowed-child rule is NOT restated here: it is asked of the
 * shape util (`canReceiveNewChildrenOfType`), which is where the app already
 * says a wire is never a member ("containment is control flow"). Restating it
 * is how the two drift.
 *
 * WHY the util is asked about a HYPOTHETICAL expanded block rather than the
 * one that was just drawn: `canReceiveNewChildrenOfType` opens with
 * `shape.props.view === "expanded"` (BlockShapeUtil.tsx:240), and the shape
 * this runs on is still wearing `getDefaultProps()`'s view — deciding the view
 * is the very thing being done. Asked as-is it answers `false` for everything
 * and the enclosure branch is dead code that nothing would notice, because
 * every box big enough to look like a frame also clears the size rung. The
 * question this actually needs answered is "if I WERE expanded, could I take
 * this?", so that is the question asked.
 */
function adoptableEnclosedIds(editor: Editor, block: BlockShape): TLShapeId[] {
  const bounds = editor.getShapePageBounds(block);
  if (!bounds) return [];
  const util = editor.getShapeUtil(block);
  const asFrame: BlockShape = { ...block, props: { ...block.props, view: "expanded" } };
  const ancestorIds = new Set(editor.getShapeAncestors(block).map((ancestor) => ancestor.id));

  return editor.getSortedChildIdsForParent(block.parentId).filter((id) => {
    const sibling = editor.getShape(id);
    if (!sibling || sibling.id === block.id || sibling.isLocked) return false;
    if (ancestorIds.has(sibling.id) || sibling.parentId !== block.parentId) return false;
    if (!util.canReceiveNewChildrenOfType(asFrame, sibling.type)) return false;
    const siblingBounds = editor.getShapePageBounds(sibling);
    // CONTAINS, not intersects: a box that merely clips a neighbour is a box
    // drawn next to it, not a frame drawn around it.
    return Boolean(siblingBounds && bounds.contains(siblingBounds));
  });
}

/**
 * Write the view the gesture asked for onto a block that has just been placed.
 *
 * Shared by the two completion paths below because they are the SAME rule seen
 * twice — `blockPlacement.ts` is the rule, and this is the one place the store
 * hears about it.
 *
 * WHY the adoption step lives with the view write rather than being left to
 * the user: an `ss-block` in `expanded` view is `isFrameLike` and
 * `providesBackgroundForChildren`, so a box that turns expanded ON TOP OF the
 * things it was drawn around paints over them and they are simply gone from
 * the board. The donor met exactly this and recorded it ("the screenshot
 * showed a rectangle vanishing behind the frame's opaque card. Children render
 * above their parent, so adoption is what keeps contents visible"). Deciding
 * the view and adopting are therefore one step, not two.
 */
function applyPlacementView(editor: Editor, created: TLShape | null, gesture: (enclosed: TLShapeId[]) => BlockPlacementGesture): void {
  if (!created || created.type !== BLOCK_SHAPE_TYPE) return;
  const block = created as BlockShape;
  const enclosed = adoptableEnclosedIds(editor, block);
  const view = blockViewForPlacement(gesture(enclosed));
  if (view !== block.props.view) editor.updateShape<BlockShape>({ id: block.id, type: BLOCK_SHAPE_TYPE, props: { view } });
  if (view === "expanded" && enclosed.length > 0) editor.reparentShapes(enclosed, block.id);
}

/**
 * The stock `pointing` child of `BaseBoxShapeTool`, subclassed so a CLICK
 * completion runs the same grammar a drag does.
 *
 * WHY this fork exists at all, in a tool whose previous header said "stock
 * BaseBoxShapeTool and nothing else": tldraw 5.3.2 hands `onCreate` to the
 * DRAG path only. `Pointing.onPointerMove` passes it through to
 * `select.resizing` (BaseBoxShapeTool/children/Pointing.ts:55-57) and
 * `Resizing.complete()` calls it (SelectTool/childStates/Resizing.ts:160-162),
 * but `Pointing.complete()` — the click — creates, centres and selects the
 * shape and then switches tool with no hook anywhere in between. So there is
 * no stock seam through which a click can say anything about the shape it just
 * made.
 *
 * The two alternatives, and why they lost:
 *   - Change `getDefaultProps().view` to `"simple"`, which is how the donor
 *     got its click rung. It works, but the blast radius is every `ss-block`
 *     minted WITHOUT an explicit view, not just the tool's click — and
 *     `document/applySceneDiff.ts:206` deliberately omits `view` from its
 *     partial when the incoming scene does not name one, so the shape default
 *     is a live policy for every external scene producer, not a private
 *     detail of this tool. A gesture rule should not change what a pyblocks
 *     board looks like.
 *   - Hook the tool's own `onExit`. It fires late enough on the click path,
 *     but it also fires on the drag path (when `Pointing` hands over to
 *     `select.resizing`, with the shape still 1x1) and on every ordinary
 *     tool switch, so it would need a guess about which exit it was.
 *
 * This keeps the blast radius at the tool, which is where a gesture grammar
 * belongs. `super.complete()` does the whole stock job — grid snap, centring
 * on the point, selection, tool lock — and the only thing added is a write to
 * the shape it just selected.
 */
const StockPointing = BaseBoxShapeTool.children().find((child) => child.id === "pointing");
if (!StockPointing) {
  // Loud, not silent. If a tldraw upgrade renames this state the click rung of
  // P-045 stops working, and a board where clicking quietly gives the wrong
  // view is worse than a board that will not arm the tool.
  throw new Error("BlockTool: tldraw's BaseBoxShapeTool no longer has a `pointing` child state");
}

/** The stock class, typed for extension: `TLStateNodeConstructor` describes
 *  only `new (editor, parent) => StateNode`, so `complete()` — `Pointing`'s
 *  own method, not `StateNode`'s — has to be declared here to be callable. */
type StockPointingInstance = StateNode & { complete(): void };
const StockPointingClass = StockPointing as unknown as new (editor: Editor, parent?: StateNode) => StockPointingInstance;

class BlockPointing extends StockPointingClass {
  static id = "pointing";

  override complete() {
    // The selection BEFORE, because `complete()` has one branch that creates
    // nothing (`getShape` came back empty → `cancel()`), and in that branch the
    // previous selection is still standing. Without this, clicking the canvas
    // while a single block happened to be selected could re-view THAT block.
    const before = this.editor.getSelectedShapeIds();
    super.complete();
    const only = this.editor.getOnlySelectedShape();
    if (!only) return;
    if (before.length === 1 && before[0] === only.id) return;
    applyPlacementView(this.editor, only, () => ({ kind: "click" }));
  }
}

export class BlockTool extends BaseBoxShapeTool {
  static override id = BLOCK_TOOL_ID;
  static override initial = "idle";
  override shapeType = BLOCK_SHAPE_TYPE;

  static override children(): TLStateNodeConstructor[] {
    return BaseBoxShapeTool.children().map((child) => (child.id === "pointing" ? (BlockPointing as unknown as TLStateNodeConstructor) : child));
  }

  /**
   * The DRAG path. Stock hook, called by `select.resizing` with the finished
   * shape.
   *
   * WHY this method also has to end the interaction, which reads like
   * boilerplate and is not: `Resizing.complete()` RETURNS immediately after
   * invoking `onCreate` (Resizing.ts:160-163), so supplying this hook takes
   * over the tool-lock / back-to-select step that tldraw would otherwise have
   * done itself. Leave it out and the editor stays in `select.resizing` after
   * the pointer is up.
   */
  override onCreate(created: TLShape | null): void {
    applyPlacementView(this.editor, created, (enclosed) => {
      const block = created as BlockShape;
      // The box the user actually drew, read here — BEFORE `measure.ts`'s hug
      // pass has had a chance to write a rendered size back into `props.w/h`.
      return { kind: "drag", w: block.props.w, h: block.props.h, enclosesShapes: enclosed.length > 0 };
    });

    if (this.editor.getInstanceState().isToolLocked) this.editor.setCurrentTool(BLOCK_TOOL_ID);
    else this.editor.setCurrentTool("select.idle");
  }
}
