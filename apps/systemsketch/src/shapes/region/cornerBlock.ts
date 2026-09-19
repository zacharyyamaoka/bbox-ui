// src/shapes/region/cornerBlock.ts — a region's HEADER CONTRACT, which is a
// real `ss-block`.
//
// "Everything is really a block" (Zach, docs/ASK-2026-09-18…md) is not a
// slogan in this file, it is the implementation: a Loop's `Iterable` inlet
// and a Branch's condition are ports on an ORDINARY `ss-block` that lives as
// a CHILD of the region, named by `ss-region.cornerBlockId`. The region grows
// no ports of its own and never will — `Pasted image 20260918150916.png`
// marks the ports-on-the-region-header design OLD: BAD and the block-in-the-
// corner design NEW: GOOD, and `docs/SYSTEMSKETCH-REBUILD-PLAN.md` §2 records
// it as settled. Every consumer therefore resolves a loop's port through the
// identical `[data-block-id]` → `[data-port-id]` walk it uses for any other
// block: the wire gesture, the anchor measurement and the derived scene each
// needed exactly zero region-specific code.
//
// Three things live here because all three are answers to "what does the
// corner block decide?":
//   1. `cornerBlockPropsFor` — the typed header per region kind;
//   2. `createCornerBlock` / `armRegionPreset` — who mints it, and when;
//   3. `regionLayoutOf` — the frame's geometry, which starts BELOW the corner
//      block's measured box (`@trunk/components/region.layout`'s own rule).
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import { regionLayout, type RegionLayout } from "@trunk/components/region.layout";

import type { BlockPortSpec, BlockShapeProps } from "../block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE, type PortSide } from "../types";
import type { RegionArm, RegionKind, RegionShape } from "./RegionShapeUtil";

/**
 * How far in from the frame's left wall the corner block sits, px.
 *
 * WHY 8 and not 0, which is what the "NEW GOOD" sketch draws: a block's LEFT
 * rail puts its dots ON the card's wall, straddling it by the dot's radius
 * (`@trunk/hosts/portDotSightings` measures the centre, the paint hangs half
 * the dot outside). A frame-like shape CLIPS its children to its own geometry
 * (`BaseFrameLikeShapeUtil.getClipPath`), so a corner block flush at x = 0
 * loses the outer half of every `Iterable` dot to that clip. Eight px is the
 * dot's radius plus slack, and it is inside the 24px the acceptance test
 * allows between the two top-left corners.
 */
const CORNER_INSET_X_PX = 8;

/** The corner block's own top edge sits ON the frame's top edge — the label
 *  tab of the React Flow Labeled Group Node look (`Pasted image
 *  20260918192040.png`), which `@trunk/components/region.tsx` draws by pulling
 *  its `region-corner` slot back by the frame's 1px border. */
const CORNER_INSET_Y_PX = 0;

/** The height of the plain text tab a region wears INSTEAD of a corner block
 *  (`kind: "plain"`, or a region a writer created without one). It exists so
 *  a stored `name` is never invisible — Zach's "render stored properties
 *  truthfully" rule — and it is a constant rather than a measurement so the
 *  geometry and the paint cannot disagree about where the first arm starts. */
export const REGION_NAME_TAB_PX = 28;

/** An empty rail set, spelled once. */
const NO_PORTS: Record<PortSide, BlockPortSpec[]> = { left: [], right: [], top: [], bottom: [] };

/**
 * The typed, UNNAMED header each region kind publishes.
 *
 * WHY the label is the TYPE and not a field name (DP - Loop, quoted verbatim
 * in `@trunk/presets/loop/loop.ts:36-56` from the archive's own
 * `/home/bam/systemsketch/src/loop/loopModel.ts:55-70`: "A type and nothing
 * else. You do not NAME these — the collection's name lives on whatever
 * produces it, and the element has no name until a Block's port gives it one.
 * What the header can say is what KIND of thing crosses it, so the inlet
 * reads `Iterable` and the outlet reads `Iter`"). `BlockFace` paints
 * `port.name`, so writing the type into `name` is literally what puts it on
 * the rail; `id` stays a stable machine handle, because a wire binding names
 * it and a rename must never break a cable.
 *
 * WHY `while` has no right wall at all, which reads like an omission and is
 * the design (DP - Loop's header table, restated in the trunk preset): an
 * iterable is consumed at entry so the header can hand out this turn's
 * element; a condition is re-evaluated after every pass and produces no
 * element, so an `Iter` outlet "for symmetry" would mint a port with no value
 * behind it.
 *
 * WHY `branch` has no right wall either: V1 of DP - Branch, which Zach picked
 * over the research's own recommendation on 2026-09-02 — yields "get messy —
 * then you don't know which of those ports are firing". The arms' results fan
 * in at the CONSUMER's ordinary port instead, which is why nothing here mints
 * an outlet (`@trunk/presets/branch/branch.ts:14-24` carries the full ruling).
 */
export function cornerBlockPropsFor(kind: RegionKind): Partial<BlockShapeProps> | null {
  switch (kind) {
    case "for":
      return {
        name: "For Loop",
        view: "port",
        ports: {
          ...NO_PORTS,
          left: [{ id: "iterable", name: "Iterable", type: "Iterable" }],
          // The element's own type is whatever the collection holds, which
          // this header cannot know — `""` is the document model's honest
          // "no type stated" (sceneFromStore.ts's `portTypes` drops it).
          right: [{ id: "iter", name: "Iter", type: "" }],
        },
      };
    case "while":
      return {
        name: "While Loop",
        view: "port",
        ports: { ...NO_PORTS, left: [{ id: "condition", name: "Bool", type: "Bool" }] },
      };
    case "branch":
      return {
        name: "Branch",
        view: "port",
        // `Pasted image 20260918145125.png` / `…144504.png`: Zach's own
        // sketches label the selector's inlet `input 1`. A second condition
        // is an ordinary rail edit on a real block — no region API needed.
        ports: { ...NO_PORTS, left: [{ id: "input_1", name: "input 1", type: "" }] },
      };
    // A plain region is a bare scope: a frame you drop things into, with no
    // interface to publish. It gets no corner block at all rather than an
    // empty one, because an empty card in the corner would claim there is a
    // contract and then show none.
    case "plain":
      return null;
  }
}

/**
 * Mint the corner block for `regionId` and write its id into the region.
 *
 * The block is a CHILD (`parentId`), so tldraw carries it when the region
 * moves, clips it with the frame and lists it in the region's own subtree —
 * the containment that already means "control flow" everywhere else in this
 * document model.
 */
export function createCornerBlock(editor: Editor, regionId: TLShapeId, kind: RegionKind): TLShapeId | null {
  const props = cornerBlockPropsFor(kind);
  if (!props) return null;
  // The id is minted here rather than read back, because `createShape`
  // answers the editor, not the record (tldraw 5.3.2 `Editor.createShape`).
  const id = createShapeId();
  editor.createShape({ id, type: BLOCK_SHAPE_TYPE, parentId: regionId, x: CORNER_INSET_X_PX, y: CORNER_INSET_Y_PX, props });
  editor.updateShape({ id: regionId, type: REGION_SHAPE_TYPE, props: { cornerBlockId: id } });
  return id;
}

/** What one dock row puts on the board: a region kind, its name, and the arms
 *  it starts life with. */
export interface RegionPreset {
  kind: RegionKind;
  name: string;
  arms: RegionArm[];
}

/**
 * Arm the preset: while this is installed, every `ss-region` a tool creates
 * comes out as THIS kind, with THIS name and arms, and with its corner block
 * already in it. Returns the uninstall.
 *
 * WHY a pair of store side effects instead of `BaseBoxShapeTool.onCreate`,
 * which is what both this lane's brief and the archive's own
 * `/home/bam/systemsketch/src/loop/LoopTool.ts:26-38` reach for — measured in
 * tldraw 5.3.2's source, not guessed: `onCreate` is handed to `select.resizing`
 * from `BaseBoxShapeTool`'s `Pointing.onPointerMove` and NOWHERE else
 * (`@tldraw/editor/src/lib/editor/tools/BaseBoxShapeTool/children/Pointing.ts`).
 * Its sibling `complete()` — the CLICK path, which creates the shape at the
 * default size and never enters a resize — does not call it at all. The
 * archive never met this because each of its regions had its own SHAPE type,
 * so `getDefaultProps()` could carry the kind; here one `ss-region` serves two
 * tools, so the kind has to come from the tool, and it has to arrive on both
 * paths. `src/region.smoke.test.tsx` places its loop with a CLICK.
 *
 * `registerBeforeCreateHandler` is the documented hook for "modify the record
 * being created" and `registerAfterCreateHandler` for "create another record
 * in response" (@tldraw/store's own doc comments, whose example is literally
 * `createShape` inside an after-create handler). Both run inside the tool's
 * own `markHistoryStoppingPoint`, so the region and its corner block are ONE
 * undo step.
 *
 * Both handlers are guarded against acting twice: an undo that re-creates a
 * region already carrying a kind and a corner id must not mint a second block.
 */
export function armRegionPreset(editor: Editor, preset: RegionPreset): () => void {
  const stops = [
    editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
      if (shape.type !== REGION_SHAPE_TYPE) return shape;
      const region = shape as RegionShape;
      // Only a FRESH default region takes the preset (see the guard note
      // above): anything already typed is a restore, not a placement.
      if (region.props.kind !== "plain") return shape;
      return { ...region, props: { ...region.props, kind: preset.kind, name: preset.name, arms: preset.arms } };
    }),
    editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
      if (shape.type !== REGION_SHAPE_TYPE) return;
      const region = shape as RegionShape;
      if (region.props.cornerBlockId) return;
      createCornerBlock(editor, region.id, region.props.kind);
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/** The corner block's box in region space, or the name tab's when there is no
 *  corner block. `{w: 0, h: 0}` for an unnamed plain region: nothing sits above
 *  the body, so the body starts at the top. */
export function cornerBoxOf(editor: Editor, shape: RegionShape): { w: number; h: number } {
  const cornerId = shape.props.cornerBlockId;
  const corner = cornerId ? editor.getShape(cornerId as TLShapeId) : undefined;
  if (corner) {
    const props = corner.props as { w?: number; h?: number };
    return { w: props.w ?? 0, h: props.h ?? 0 };
  }
  return shape.props.name ? { w: 0, h: REGION_NAME_TAB_PX } : { w: 0, h: 0 };
}

/**
 * The frame's geometry, from `@trunk/components/region.layout`'s pure twin.
 *
 * WHY the shape util and the face both call THIS rather than each doing its
 * own arithmetic (the trunk's own reason, `region.layout.ts:17-23`, inherited
 * from the archive's `branchModel.ts:14-16`): "a fold, an added arm and a
 * tldraw resize all agree about where every row is". Here it buys one more
 * thing — `props.h` is the AUTHORED height and `layout.height` is the height
 * the arms actually need, and the trunk's rule is that an explicit height may
 * only ever make a region TALLER. Because the geometry is derived from the
 * same call as the paint, a region whose arms outgrow its authored box has a
 * selection outline, a clip path and a drop target that still match what is
 * on screen — without writing a single reconciled number back into the
 * document.
 */
export function regionLayoutOf(editor: Editor, shape: RegionShape): RegionLayout {
  return regionLayout({
    width: shape.props.w,
    height: shape.props.h,
    corner: cornerBoxOf(editor, shape),
    arms: shape.props.arms.map((arm) => ({ id: arm.id, open: arm.open, bodyHeight: arm.h })),
  });
}
