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
//      block's measured box (`@trunk/components/region.layout`'s own rule);
//   4. `installRegionKit` — the two repairs that keep 1 and 3 TRUE over a
//      document's whole life: a duplicated region must not keep naming the
//      ORIGINAL's corner block, and a frame must not stay the size it was
//      authored at once the card it hugs has measured itself.
import { createShapeId, type Editor, type TLShape, type TLShapeId } from "tldraw";

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

/**
 * How far from the corner slot a freshly created child block may sit and still
 * be recognised as a COPY of the region's header contract.
 *
 * WHY a position test at all, when the region already names its corner by id:
 * `cornerBlockId` is a plain `T.string` (the planner's schema, §3), and tldraw
 * remaps ids inside `duplicateShapes` / `putContent` only for the fields it
 * knows about — `parentId`, bindings, `props.*` of its OWN shapes. A copied
 * region therefore arrives naming the ORIGINAL's card. The copy's real card is
 * created in the same batch, at exactly the local position the original's card
 * has, so "a new block landed in this region's corner slot while the region is
 * pointing at something that is not its child" identifies it without guessing.
 * 24px is the acceptance test's own tolerance for "the corner block is at the
 * region's top-left" (`src/region.smoke.test.tsx`).
 */
const CORNER_CLAIM_SLACK_PX = 24;

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
  /** The tool whose OWN pointing state authorises this preset. See
   *  `armRegionPreset` — without it the arming is authorship-blind. */
  toolId: string;
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
 *
 * WHY THE GATE IS THE TOOL'S OWN `pointing` STATE, and not the shape type plus
 * `kind === "plain"`: a store side effect sees EVERY create, from every source.
 * A shape-type filter says "an ss-region was born", never "THIS user drew one
 * with THIS tool". While a Loop row was armed, a paste, a programmatic
 * `createShape`, a collaborator's record and stream 3's `applyScene` all came
 * out rewritten as a For Loop with a corner block minted into them — the
 * `kind !== "plain"` guard distinguishes RESTORES, not AUTHORSHIP, so anything
 * that legitimately wanted a bare scope was hijacked. `BaseBoxShapeTool`
 * creates its shape inside `root.<toolId>.pointing` on BOTH paths it has
 * (`children/Pointing.ts`: `onPointerMove` for the drag, `complete()` for the
 * click, both before the state leaves `pointing`), while a paste or a
 * programmatic write while the row is merely armed happens in `<toolId>.idle`.
 * So `editor.isIn(\`${toolId}.pointing\`)` is exactly "this create is the
 * gesture this tool is running", and it is the narrowest true statement
 * available from inside a store handler.
 */
export function armRegionPreset(editor: Editor, preset: RegionPreset): () => void {
  const isThisToolPlacing = () => editor.isIn(`${preset.toolId}.pointing`);
  const stops = [
    editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
      if (shape.type !== REGION_SHAPE_TYPE) return shape;
      if (!isThisToolPlacing()) return shape;
      const region = shape as RegionShape;
      // Only a FRESH default region takes the preset (see the guard note
      // above): anything already typed is a restore, not a placement.
      if (region.props.kind !== "plain") return shape;
      return { ...region, props: { ...region.props, kind: preset.kind, name: preset.name, arms: preset.arms } };
    }),
    editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
      if (shape.type !== REGION_SHAPE_TYPE) return;
      if (!isThisToolPlacing()) return;
      const region = shape as RegionShape;
      if (region.props.cornerBlockId) return;
      createCornerBlock(editor, region.id, region.props.kind);
    }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * The region's OWN corner block, or `undefined`.
 *
 * WHY the parent check and not a bare `getShape(cornerBlockId)`: the id is a
 * plain string that survives a copy verbatim, so a duplicated region names the
 * ORIGINAL's card until `installRegionKit` repairs it — and a lookup that
 * happily returned another region's block would silently lay THIS frame out
 * around a card that is on the other side of the page. "Is it my child?" is
 * the same question `parentId` already answers for containment everywhere else
 * in this document model, so the header contract answers it the same way.
 */
export function cornerBlockOf(editor: Editor, shape: RegionShape): TLShape | undefined {
  const cornerId = shape.props.cornerBlockId;
  if (!cornerId) return undefined;
  const corner = editor.getShape(cornerId as TLShapeId);
  if (!corner || corner.parentId !== shape.id) return undefined;
  return corner;
}

/** A `1x1` `ss-region` is the stock box tool's PLACEHOLDER, not a document: it
 *  exists for the handful of milliseconds between `createShapes` and the
 *  `select.resizing` snapshot that sizes it. Nothing may reconcile it — see
 *  `RegionShapeUtil.onBeforeCreate`. */
export function isRegionPlaceholder(shape: RegionShape): boolean {
  return shape.props.w <= 1 && shape.props.h <= 1;
}

/**
 * The two permanent repairs the region kit installs on the editor
 * (`regionKit.install`, run once from `App.tsx`'s `onMount`).
 *
 *   1. A DUPLICATED region's header contract. `props.cornerBlockId` is a
 *      `T.string`; tldraw remaps `parentId` and bindings when it copies
 *      shapes, and has no way to know this string is a shape id, so the copy
 *      points at the original's card (measured: `duplicateShapes([region])`
 *      leaves `copy.props.cornerBlockId === original.props.cornerBlockId`
 *      while the copy's real child card is a different, unnamed shape). Left
 *      alone that is a card that names the wrong contract, a frame laid out
 *      around a foreign block, a `cornerBlockId` the derived scene reports
 *      pointing into a different region, and a dangling id the moment the
 *      original is deleted.
 *   2. The frame's hug. The corner card is a real `ss-block`, so its height is
 *      MEASURED from its own face (`shared/measure.ts`) and lands after the
 *      region already exists. `props.w/h` are the geometry now
 *      (`RegionShapeUtil.getGeometry`), so a card that grew has to push its
 *      frame rather than overflow it.
 *
 * Both are store side effects rather than anything in the tools, because the
 * events that need them (duplicate, paste, a measurement settling) are not
 * gestures any tool owns.
 */
export function installRegionKit(editor: Editor): () => void {
  const parentRegionOf = (shape: TLShape): RegionShape | undefined => {
    const parent = editor.getShape(shape.parentId as TLShapeId);
    return parent && parent.type === REGION_SHAPE_TYPE ? (parent as RegionShape) : undefined;
  };

  /** Only ever GROWS: `regionLayout` returns `max(authored, hugged)`, so an
   *  author's deliberately roomy frame survives a card that shrank. */
  const reconcileFrame = (region: RegionShape) => {
    if (isRegionPlaceholder(region)) return;
    const layout = regionLayoutOf(editor, region);
    if (layout.width === region.props.w && layout.height === region.props.h) return;
    editor.updateShape({ id: region.id, type: REGION_SHAPE_TYPE, props: { w: layout.width, h: layout.height } });
  };

  const stops = [
    editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
      if (shape.type !== BLOCK_SHAPE_TYPE) return;
      const region = parentRegionOf(shape);
      if (!region) return;
      // A region that claims NO contract never adopts one behind the author's
      // back — dragging a block into a plain scope must stay a drop, not a
      // promotion. Only a region already naming a card it does not own is
      // broken, and only the card in its corner slot is that card's copy.
      if (!region.props.cornerBlockId) return;
      if (cornerBlockOf(editor, region)) return;
      if (Math.abs(shape.x - CORNER_INSET_X_PX) > CORNER_CLAIM_SLACK_PX) return;
      if (Math.abs(shape.y - CORNER_INSET_Y_PX) > CORNER_CLAIM_SLACK_PX) return;
      editor.updateShape({ id: region.id, type: REGION_SHAPE_TYPE, props: { cornerBlockId: shape.id } });
    }),
    editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
      if (next.type !== BLOCK_SHAPE_TYPE) return;
      const before = previous.props as { w: number; h: number };
      const after = next.props as { w: number; h: number };
      if (before.w === after.w && before.h === after.h) return;
      const region = parentRegionOf(next);
      if (!region || region.props.cornerBlockId !== next.id) return;
      reconcileFrame(region);
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
  const corner = cornerBlockOf(editor, shape);
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
 * tldraw resize all agree about where every row is".
 *
 * WHY THE ANSWER IS WRITTEN BACK INTO `props.w/h` instead of being left as a
 * derived reading the geometry quietly uses — the archive's
 * `reconcileBranchProps` rule, and the thing an earlier cut of this lane got
 * wrong. tldraw sizes an interactive drag against the SELECTION BOUNDS
 * (`Resizing._createSnapshot` → `getSelectionRotatedPageBounds`, i.e. the
 * geometry) while `resizeBox` multiplies `initialShape.props.w/h`. The moment
 * those two disagree every gesture is scaled by their ratio: a drag-create
 * whose frame lands 239px right of the release point, and a bottom handle
 * drawn at the hugged edge that moves a height 176px shorter, so the first
 * 176px of the drag do nothing at all. There is no way to tune them apart —
 * the ONE fix is that geometry and props are the same numbers, which means
 * the hug has to become an authored number (`RegionShapeUtil.onBeforeCreate` /
 * `onBeforeUpdate`) rather than a correction applied downstream of one.
 * `/home/bam/systemsketch/src/loop/LoopShapeUtil.tsx:101-104` says the same
 * thing about the same engine: "The record, not the layout".
 */
export function regionLayoutOf(editor: Editor, shape: RegionShape): RegionLayout {
  return regionLayout(layoutInput(editor, shape, shape.props.h));
}

/**
 * The smallest height this region's CONTENT allows — the corner card plus
 * every arm row plus the bottom pad, ignoring whatever height it was authored
 * at.
 *
 * WHY it is separate from `regionLayoutOf`: it is the `minHeight` a live
 * resize needs (`RegionShapeUtil.onResize`). `resizeBox` does not merely clamp
 * a too-small number — for a top or left handle it also offsets `x`/`y` by the
 * shortfall, so the edge the author is NOT dragging stays put. Flooring the
 * result afterwards instead would slide the whole frame.
 */
export function regionHugHeightOf(editor: Editor, shape: RegionShape): number {
  return regionLayout(layoutInput(editor, shape, 0)).height;
}

function layoutInput(editor: Editor, shape: RegionShape, height: number) {
  return {
    width: shape.props.w,
    height,
    corner: cornerBoxOf(editor, shape),
    arms: shape.props.arms.map((arm) => ({ id: arm.id, open: arm.open, bodyHeight: arm.h })),
  };
}
