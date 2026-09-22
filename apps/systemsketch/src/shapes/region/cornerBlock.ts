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
//   4. `installRegionKit` — the repairs that keep 1 and 3 TRUE over a
//      document's whole life: a duplicated region must not keep naming the
//      ORIGINAL's corner block, a frame must not stay the size it was
//      authored at once the card it hugs has measured itself, and the card
//      and its frame are ONE object — the card is pinned to the corner slot
//      and a gesture on it is a gesture on the region.
import { createShapeId, type Editor, type TLEventInfo, type TLInstancePageState, type TLShape, type TLShapeId } from "tldraw";

import {
  REGION_ARM_MIN_BODY_PX,
  REGION_MIN_WIDTH_PX,
  regionLayout,
  type RegionLayout,
} from "@trunk/components/region.layout";
import { REGION_VARIANTS, readRegionVariant } from "@trunk/skin/regionVariants";

import type { BlockPortSpec, BlockShapeProps } from "../block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE, type PortSide } from "../types";
import type { RegionArm, RegionKind, RegionShape } from "./RegionShapeUtil";

/**
 * How far in from the frame's left wall the corner block sits, px.
 *
 * ZERO — flush, which is what the "NEW GOOD" sketch draws and what Zach
 * asked for again on 2026-09-19, comparing the tldraw app (`Pasted image
 * 20260919115050.png`) against the DOM canvas (`…115249.png`): "Generally I
 * want the port to be right on the edge. and it shouldn't be cut off by the
 * frame. This is desired: [the DOM render]". The trunk's own `Region` puts
 * its corner slot at `left: -FRAME_BORDER_PX` (`@trunk/components/region.tsx`),
 * so flush here IS parity with the drawing he approved.
 *
 * WHY IT WAS 8 UNTIL NOW, and what had to change with it: a block's LEFT
 * rail puts its dots ON the card's wall, straddling it by the dot's radius
 * (`@trunk/hosts/portDotSightings` measures the centre, the paint hangs half
 * the dot outside), and a frame-like shape CLIPS its children to its own
 * geometry (`BaseFrameLikeShapeUtil.getClipPath`) — so a flush corner block
 * lost the outer half of every `Iterable` dot to that clip. Eight px bought
 * the dot's radius plus slack, at the cost of a card visibly inset from the
 * frame and a dot sitting INSIDE the scope instead of on its wall.
 *
 * The clip is the thing that was actually wrong, and it is now lifted for
 * this one child (`RegionShapeUtil.shouldClipChild`). Every OTHER member
 * still clips, which is what a scope is for.
 */
const CORNER_INSET_X_PX = 0;

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
 * region's top-left" (`src/region.smoke.test.tsx`). Since the card is pinned
 * (`installRegionKit`), an original's card is always exactly on the slot, so
 * the slack only matters for a copy of a board written before the pin.
 */
const CORNER_CLAIM_SLACK_PX = 24;

/** Is this card exactly on the corner slot — region-local (0, 0), unrotated?
 *  The one predicate the pin, the sweep and the repairs all ask. */
function onCornerSlot(shape: TLShape): boolean {
  return shape.x === CORNER_INSET_X_PX && shape.y === CORNER_INSET_Y_PX && shape.rotation === 0;
}

/** The height of the plain text tab a region wears INSTEAD of a corner block
 *  (`kind: "plain"`, or a region a writer created without one). It exists so
 *  a stored `name` is never invisible — Zach's "render stored properties
 *  truthfully" rule — and it is a constant rather than a measurement so the
 *  geometry and the paint cannot disagree about where the first arm starts. */
export const REGION_NAME_TAB_PX = 28;

/**
 * The floor under an ARMLESS region's height. The width's floor is the trunk's
 * own `REGION_MIN_WIDTH_PX` (240, the archive's `BRANCH_MIN_WIDTH`); 160 is
 * this plan's matching floor for the height — below it a frame cannot hold a
 * corner block and a body to drop into at once.
 *
 * WHY IT DOES NOT APPLY TO A REGION WITH ARMS, which the lane brief's flat
 * "h >= 160" reads as covering: an armed region has NO free body — "a branch
 * has no free body; its arms are its body" (`@trunk/components/region.layout`
 * :96-97) — so its height is exactly its rows, and a floor above them would
 * paint a band under the last arm that belongs to no arm. The archive agrees
 * by omission: `reconcileBranchProps` floors the WIDTH
 * (`/home/bam/systemsketch/src/branch/branchModel.ts:458-479`) and never the
 * height, because `branchHeightForArms` IS the height. What protects an armed
 * region from collapsing is `REGION_ARM_MIN_BODY_PX` on each open arm, which
 * is a floor on the rows rather than on the frame.
 */
export const REGION_MIN_HEIGHT_PX = 160;

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
          left: [{ id: "iterable", declaration: "Iterable: Iterable" }],
          // The element's own type is whatever the collection holds, which
          // this header cannot know — a bare name with no `:` is the document
          // model's honest "no type stated" (sceneFromStore.ts's `portTypes`
          // drops it).
          right: [{ id: "iter", declaration: "Iter" }],
        },
      };
    case "while":
      return {
        name: "While Loop",
        view: "port",
        ports: { ...NO_PORTS, left: [{ id: "condition", declaration: "Bool: Bool" }] },
      };
    case "branch":
      return {
        name: "Branch",
        view: "port",
        // `Pasted image 20260918145125.png` / `…144504.png`: Zach's own
        // sketches label the selector's inlet `input 1`. A second condition
        // is an ordinary rail edit on a real block — no region API needed.
        ports: { ...NO_PORTS, left: [{ id: "input_1", declaration: "input 1" }] },
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

/**
 * The inverse of `cornerBlockOf`, asked from the BLOCK's side: is this
 * `ss-block` the corner card of the region it is parented to?
 *
 * WHY this predicate exists at all: a corner card is not painted differently
 * because of anything in its own props — it is an ordinary `ss-block`, which
 * is the whole "everything is really a block" ruling — so the only thing that
 * makes it a corner is the RELATIONSHIP, and `BlockFace` has to be able to
 * read it. Same double check `cornerBlockOf` makes, for the same reason: the
 * id is a plain string that survives a copy, so `props.cornerBlockId === id`
 * alone would also be true of a duplicated region's ORIGINAL card until
 * `installRegionKit` repairs the copy, and that card would then be painted
 * with a corner's square junctions while sitting loose on the page.
 */
export function isRegionCornerBlock(editor: Editor, blockId: TLShapeId): boolean {
  const block = editor.getShape(blockId);
  if (!block) return false;
  const parent = editor.getShape(block.parentId as TLShapeId);
  if (!parent || parent.type !== REGION_SHAPE_TYPE) return false;
  return (parent as unknown as RegionShape).props.cornerBlockId === blockId;
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
 *   3. The card is PINNED, and the card and its frame are ONE object. See
 *      `pinnedCorner` and `redirectCornerSelection` below.
 *
 * All are store side effects rather than anything in the tools, because the
 * events that need them (duplicate, paste, a measurement settling, a nudge,
 * an undo, a file load) are not gestures any tool owns.
 */
export function installRegionKit(editor: Editor): () => void {
  const parentRegionOf = (shape: TLShape): RegionShape | undefined => {
    const parent = editor.getShape(shape.parentId as TLShapeId);
    return parent && parent.type === REGION_SHAPE_TYPE ? (parent as RegionShape) : undefined;
  };

  /**
   * The card moved the rows, so the frame follows them — DOWN as well as up.
   *
   * WHY it goes through `reconcileRegionProps` with `previous === next` rather
   * than writing `regionLayoutOf`'s answer (which is what an earlier cut of
   * this lane did, and what the auditor caught): `regionLayoutOf` returns
   * `max(authored, hugged)` and therefore only ever GROWS, so a corner card
   * that shrank left a dead band under the last arm that belongs to no arm.
   * Passing the region as its own `previous` says exactly what happened — the
   * rows moved, nobody dragged a handle — which is the one branch of the
   * reconcile that re-derives `h` from the rows. Sharing the function is also
   * what makes this write a FIXED POINT: `onBeforeUpdate` re-runs the same
   * rule on the record written here and finds nothing left to change.
   */
  const reconcileFrame = (region: RegionShape) => {
    const reconciled = reconcileRegionProps(editor, region, region);
    if (!reconciled) return;
    const { w, h, arms } = reconciled.props;
    editor.updateShape({ id: region.id, type: REGION_SHAPE_TYPE, props: { w, h, arms } });
  };

  /** The region whose corner card `block` is, judged from the block's OWN
   *  `parentId` — the same double check `cornerBlockOf` makes. */
  const regionNaming = (block: TLShape): RegionShape | undefined => {
    if (block.type !== BLOCK_SHAPE_TYPE) return undefined;
    const region = parentRegionOf(block);
    return region && region.props.cornerBlockId === block.id ? region : undefined;
  };

  /**
   * THE CARD IS PINNED to the corner slot: region-local (0, 0), unrotated.
   *
   * WHY: Zach, 2026-09-21, looking at a For Loop and a Branch whose cards had
   * come to rest ~26px inside their frames: "You need to rigidly connect the
   * for loop and branch block to the region frame. It should conceptually be
   * one object." ... "Same issue with branch." That OVERRULES what this file
   * used to say — that a card "an author has deliberately dragged somewhere
   * else is left exactly where they put it". There is no such author any more:
   * the card is the frame's own header, so a card off the slot is a broken
   * record, never an intention. The tempting half-measure, snapping only
   * within some slack of the slot, is exactly what let the inset card of his
   * screenshot survive.
   *
   * Enforced at the store (before-create / before-change) rather than in the
   * select tool, because a card leaves its slot through writes no gesture
   * owns — a nudge, align/distribute, a paste, an undo, stream 3's
   * `applyScene`. The select tool can no longer move a card at all
   * (`redirectCornerSelection`); this is what makes that a guarantee instead
   * of a consequence.
   *
   * The POSITION pin is unconditional: no writer has a reason to put a corner
   * card anywhere but its slot. PARENTAGE is different — see
   * `gestureMovesCard` for why only a gesture on the card itself is refused
   * a reparent.
   */
  const pinnedCorner = <Shape extends TLShape>(shape: Shape): Shape =>
    onCornerSlot(shape) ? shape : { ...shape, x: CORNER_INSET_X_PX, y: CORNER_INSET_Y_PX, rotation: 0 };

  /** Every card among `cards` that is off its slot, back on it — one
   *  `history: "ignore"` write for the lot. */
  const snapCards = (cards: readonly TLShape[]) => {
    const moves = cards
      .filter((corner) => !onCornerSlot(corner))
      .map((corner) => ({ id: corner.id, type: corner.type, x: CORNER_INSET_X_PX, y: CORNER_INSET_Y_PX, rotation: 0 }));
    if (moves.length > 0) editor.run(() => editor.updateShapes(moves), { history: "ignore" });
  };

  /**
   * Corner cards back on their slot, OUTSIDE the store handlers.
   *
   * WHY a sweep IN ADDITION to the store handlers: two writers bypass side
   * effects entirely — `Store.loadStoreSnapshot` runs with them switched off
   * (`@tldraw/store` Store.ts, `sideEffects.setIsEnabled(false)`), and that is
   * both the IndexedDB board the app mounts on and File › Open
   * (`chrome/FileMenu/fileActions.ts`'s `loadBoardText`).
   *
   * Once at mount over the whole store, then only over what each change batch
   * TOUCHED: a touched block that is a corner card, and a touched region's own
   * card. WHY not the whole store every batch, which an earlier cut of this
   * lane did: a region drag is a batch per animation frame, and scanning every
   * record on every page per frame is cost that buys nothing — a batch that
   * did not touch a card or its region cannot have moved it. A snapshot load
   * arrives as one batch with every record in `added`, so loads stay fully
   * covered by the same rule.
   *
   * `history: "ignore"` for the same reason `shared/measure.ts` uses it:
   * this is a repair, not an edit, and it must not make the first Ctrl-Z of
   * a session undo the frame's own geometry.
   */
  snapCards(
    editor.store
      .allRecords()
      .filter((record): record is RegionShape => record.typeName === "shape" && (record as TLShape).type === REGION_SHAPE_TYPE)
      .map((region) => cornerBlockOf(editor, region))
      .filter((corner): corner is TLShape => !!corner),
  );
  const stopSweep = editor.store.listen(
    ({ changes }) => {
      const cards = new Map<TLShapeId, TLShape>();
      for (const record of [...Object.values(changes.added), ...Object.values(changes.updated).map(([, next]) => next)]) {
        if (record.typeName !== "shape") continue;
        // Read back from the store: the batch's record may already be stale.
        const current = editor.getShape((record as TLShape).id);
        if (!current) continue;
        const card = current.type === REGION_SHAPE_TYPE ? cornerBlockOf(editor, current as RegionShape) : regionNaming(current) ? current : undefined;
        if (card) cards.set(card.id, card);
      }
      snapCards([...cards.values()]);
    },
    { scope: "document", source: "all" },
  );

  /**
   * Is `cardId` ITSELF part of what an in-flight select-tool gesture moves?
   *
   * WHY the reparent veto asks THIS and nothing broader (Codex audit,
   * 2026-09-22, two rounds): the rigidity Zach asked for — "rigidly connect
   * the for loop and branch block to the region frame. It should conceptually
   * be one object" — is a property of what a person's HAND does to the card,
   * not a rule over every writer. A deliberate document operation may
   * legitimately move a card out: `document/applySceneDiff.ts`'s
   * `hoistedSurvivors` deletes a region while keeping its card by reparenting
   * the card to the page first, and a veto that fires on that write puts the
   * card back under the doomed region, whose delete then takes it too.
   *
   * Two predicates were tried and are WRONG, so a future refactor should not
   * reach for them again:
   *   - "any local write" (the first cut) vetoed the hoist outright;
   *   - "any local write while the select tool is mid-gesture" still vetoed
   *     it whenever an async scene (an Open Python response) landed while the
   *     person happened to be dragging some UNRELATED shape — the store's
   *     `source === "user"` covers every local write, programmatic ones
   *     included, so it says nothing about who is writing.
   * The gesture state alone cannot name the writer; the SELECTION can name
   * what the gesture is moving. So the veto needs both: mid-gesture AND the
   * card itself selected.
   *
   * Deliberately NOT "the card or one of its ancestors is selected": that
   * would veto the hoist when the scene lands while the person is dragging
   * the very region the scene deletes — the same data loss, in a narrower
   * window.
   *
   * REACHABILITY, stated plainly: with `redirectCornerSelection` in place a
   * card is selected only while `editingShapeId` names it (its own rename),
   * and tldraw leaves `editing_shape` — clearing the editing id, which hands
   * the selection back to the region — before it can enter `translating`
   * (`SelectTool/childStates/EditingShape.ts` transitions out; `onExit` calls
   * `setEditingShape(null)`). So no real gesture reaches this veto today. It
   * is kept as a SCOPED BACKSTOP for the day something lets a card be selected
   * on its own mid-gesture, never as a blanket rule.
   */
  const gestureMovesCard = (cardId: TLShapeId) =>
    editor.isInAny("select.translating", "select.resizing", "select.rotating", "select.dragging_handle") &&
    editor.getSelectedShapeIds().includes(cardId);

  /**
   * A gesture on the card is a gesture on the REGION: selecting a corner card
   * selects its region instead.
   *
   * WHY, and why at `instance_page_state` rather than in a pointer handler:
   * "It should conceptually be one object" (Zach, 2026-09-21, quoted on
   * `pinnedCorner`). One object means one selection — and every door into the
   * selection has to agree: a click, a marquee, select-all, the Frames panel,
   * the selection history. They all end in the same record, so the rewrite
   * lives there, once. tldraw 5.3.2's press-drag reads it back: `PointingShape
   * .onEnter` calls `setSelectedShapes([card])`, the record comes out naming
   * the region, and `Translating` moves whatever is selected — so a drag that
   * starts on the card moves frame, card and members together, and the card's
   * own `x/y` are never written.
   *
   * THE ONE EXCEPTION is the card's own editing session. tldraw's
   * `setEditingShape` selects the shape it edits and `EditingShape.onEnter`
   * re-selects it (`Editor.setEditingShape`, `SelectTool/childStates/
   * EditingShape.ts`), and a rename opened on the card must type into the
   * card. While `editingShapeId` names the card it may stay selected; the
   * moment the session ends the same rewrite hands the selection back to the
   * region. Nothing else is carved out: the glyph picker and the port rails
   * are content-owned presses (`shared/pointerOwnership.ts`) that never reach
   * the selection, and a dot's wire gesture is DOM-level.
   *
   * NOT a bug, and not to be "fixed" here: a press on a card that lies inside
   * an existing MULTI-selection's bounds drags that multi-selection. That is
   * stock tldraw deferring selection for any unselected shape inside the
   * selection bounds (`PointingShape.onEnter`'s `selectionBounds.containsPoint`
   * branch), and a corner card is no different from any other shape there.
   */
  const redirectCornerSelection = (next: TLInstancePageState): TLInstancePageState => {
    let changed = false;
    const ids: TLShapeId[] = [];
    for (const id of next.selectedShapeIds) {
      const block = id === next.editingShapeId ? undefined : editor.getShape(id);
      const region = block ? regionNaming(block) : undefined;
      const target = region ? region.id : id;
      if (target !== id) changed = true;
      if (ids.includes(target)) changed = true;
      else ids.push(target);
    }
    return changed ? { ...next, selectedShapeIds: ids } : next;
  };

  /**
   * ENTER on a region renames its corner card — exactly what a double-click on
   * the card does.
   *
   * WHY it needs saying: tldraw's `select.idle` starts an edit on Enter only
   * when the ONLY selected shape `canEditShape` (`SelectTool/childStates/
   * Idle.ts`, `onKeyUp` 'Enter'). Before the redirect that shape was the card;
   * now it is the region, whose util cannot edit, so Enter silently did
   * nothing (Codex audit, 2026-09-22). The region is deliberately NOT made
   * editable instead: `canEditShape` is also what a double-click on the
   * region's own title strip or arm header asks, with no way to tell the two
   * apart (`Editor.canEditShape` defaults `info` to `unknown`), and that would
   * turn every double-click on a frame into a rename.
   *
   * Armed on key DOWN and fired on key UP, the same split tldraw's own Idle
   * makes (`selectedShapesOnKeyDown`), so an Enter that began outside the
   * canvas cannot rename anything. `'event'` is emitted AFTER the state chart
   * has handled the key (`Editor._flushEventForTick`), so Idle has already had
   * its turn and found nothing to do. Ending the session hands the selection
   * back to the region through `redirectCornerSelection`.
   */
  let enterArmedFor: TLShapeId | null = null;
  const cardToRenameOnEnter = (): TLShape | undefined => {
    if (!editor.isIn("select.idle")) return undefined;
    const only = editor.getOnlySelectedShape();
    if (!only || only.type !== REGION_SHAPE_TYPE) return undefined;
    const card = cornerBlockOf(editor, only as RegionShape);
    return card && editor.canEditShape(card) ? card : undefined;
  };
  const onEditorEvent = (info: TLEventInfo) => {
    if (info.type !== "keyboard" || info.key !== "Enter") return;
    if (info.name === "key_down") {
      enterArmedFor = cardToRenameOnEnter()?.id ?? null;
      return;
    }
    if (info.name !== "key_up") return;
    const card = cardToRenameOnEnter();
    const armed = enterArmedFor;
    enterArmedFor = null;
    if (!card || card.id !== armed) return;
    editor.markHistoryStoppingPoint("editing shape");
    editor.setEditingShape(card.id);
    editor.setCurrentTool("select.editing_shape", { ...info, target: "shape", shape: card });
  };
  editor.on("event", onEditorEvent);

  /** A region that has just started naming a card snaps that card onto the
   *  slot. `createCornerBlock` mints the card BEFORE the region names it, and a
   *  duplicate's copy is claimed by the after-create handler below, so neither
   *  card is pinned at its own create — this is the write that catches both. */
  const snapNamedCorner = (region: RegionShape) => {
    const corner = cornerBlockOf(editor, region);
    if (corner && !onCornerSlot(corner)) editor.updateShape({ id: corner.id, type: corner.type, x: CORNER_INSET_X_PX, y: CORNER_INSET_Y_PX, rotation: 0 });
  };

  const stops = [
    stopSweep,
    () => editor.off("event", onEditorEvent),
    editor.sideEffects.registerBeforeChangeHandler("instance_page_state", (_previous, next) => redirectCornerSelection(next)),
    editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => (regionNaming(shape) ? pinnedCorner(shape) : shape)),
    editor.sideEffects.registerBeforeChangeHandler("shape", (previous, next, source) => {
      if (next.type !== BLOCK_SHAPE_TYPE) return next;
      // A GESTURE never pulls a card out of its region: one object has no
      // seam for a hand to pull it through. Restoring the index too keeps it
      // a valid sibling. A deliberate document write (a scene diff's hoist, a
      // programmatic reparent) goes through — see `gestureMovesCard`.
      //
      // WHY there is no orphan repair beside this (audit item, 2026-09-22):
      // a card is only ever orphaned by a batch that removes its region's
      // RECORD without its children, and no writer here does that —
      // `Editor.deleteShapes` expands to every descendant before it removes
      // anything, and a remote peer's batch is that same expanded diff. A raw
      // `store.remove` of a parent orphans ANY child in tldraw, card or not,
      // so it is not a corner-card rule to patch in this file.
      if (next.parentId !== previous.parentId && regionNaming(previous) && source === "user" && gestureMovesCard(previous.id)) {
        return pinnedCorner({ ...next, parentId: previous.parentId, index: previous.index });
      }
      return regionNaming(next) ? pinnedCorner(next) : next;
    }),
    editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
      if (shape.type === REGION_SHAPE_TYPE) snapNamedCorner(shape as RegionShape);
    }),
    editor.sideEffects.registerAfterChangeHandler("shape", (previous, next) => {
      if (next.type !== REGION_SHAPE_TYPE) return;
      if ((previous as RegionShape).props.cornerBlockId === (next as RegionShape).props.cornerBlockId) return;
      snapNamedCorner(next as RegionShape);
    }),
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
  return regionLayout(layoutInput(editor, shape, shape.props.h, shape.props.arms));
}

/**
 * The height this region's own ROWS add up to: the corner card, every arm row
 * (a folded arm costs only its header) and the bottom pad — ignoring whatever
 * height the frame was authored at.
 *
 * This is the archive's `branchHeightForArms`
 * (`/home/bam/systemsketch/src/branch/branchModel.ts:150-154`), generalised
 * over a MEASURED corner block where the donor had a fixed 40px band.
 */
export function regionHugHeightOf(editor: Editor, shape: RegionShape): number {
  return hugHeightOf(editor, shape, shape.props.arms);
}

/**
 * The smallest height a live resize may reach (`RegionShapeUtil.onResize`'s
 * `minHeight`).
 *
 * WHY it is NOT the current hug, which is what an earlier cut of this lane
 * passed: `resizeBox` clamps the drag at `minHeight`, so a floor equal to the
 * rows as they stand means the bottom handle can never make an arm smaller —
 * the frame would be resizable upward only. The real floor is the hug with
 * every OPEN arm shrunk to `REGION_ARM_MIN_BODY_PX`, i.e. exactly as far down
 * as `reconcileRegionProps` can spread a negative delta before its per-arm
 * clamp bites. Keeping the two numbers the same function of the same arms is
 * what stops a top-handle drag from sliding the frame: `resizeBox` turns a
 * shortfall into a `y` offset, so if it floored at a height the reconcile then
 * refused to honour, the edge the author is NOT dragging would move.
 *
 * WHY an armless region uses `REGION_MIN_HEIGHT_PX` instead: it has a FREE
 * body rather than rows, so there is nothing to spread a delta into and the
 * floor is a constant (see that constant's own note).
 */
export function regionMinHeightOf(editor: Editor, shape: RegionShape): number {
  const arms = shape.props.arms;
  if (arms.length === 0) return Math.max(REGION_MIN_HEIGHT_PX, hugHeightOf(editor, shape, arms));
  return hugHeightOf(
    editor,
    shape,
    arms.map((arm) => ({ ...arm, h: REGION_ARM_MIN_BODY_PX })),
  );
}

/**
 * KEEP `h` AND THE ARMS IN STEP, WHICHEVER SIDE WROTE — ported by value from
 * the archive's `reconcileBranchProps`
 * (`/home/bam/systemsketch/src/branch/branchModel.ts:458-479`), whose own
 * doc comment states the contract this lane owes: "A command that folds, adds
 * or resizes an arm writes the arms and expects `h` to follow. tldraw's resize
 * writes `h` and expects the open arms to share the change. Both go through
 * here, so a Branch can never carry a height its rows do not add up to."
 *
 * The invariant it buys, and the reason every caller funnels through it: for a
 * region WITH ARMS, `props.h` is always exactly `regionHugHeightOf`. Never a
 * pixel more — a taller frame would show a band under the last arm that
 * belongs to no arm, inside a construct the trunk says has no free body
 * (`@trunk/components/region.layout:96-97`) — and never a pixel less, which
 * would paint arms outside the border they live in.
 *
 * WHY THE THREE BRANCHES, and why the donor's own discriminator could not be
 * ported literally. The archive reads "did the arms change?" and otherwise
 * assumes a resize, because its band was a CONSTANT 40px so the only thing
 * that could move `expected` was an arm. Here the top row is a real measured
 * `ss-block` child, so `expected` also moves when that card measures itself or
 * is replaced — and reading that as a resize would spread the card's growth
 * into the arms, squashing every one of them the moment the corner block
 * settled (a click-placed Branch would come out with 72px arms instead of
 * 160px). The honest discriminator is therefore "did THIS write touch `h`?",
 * which `previous` answers exactly: `resizeBox` writes `h`, a fold writes only
 * `arms`, and the corner-card repair writes the hug it was already at.
 *
 *   1. ARMLESS — a Loop or a plain scope. Its body is free space to drop into,
 *      so an author's roomier frame survives and `h` only ever has floors
 *      applied. This is the one case where `h > hug` is legitimate.
 *   2. THE ROWS MOVED — a fold, an added or removed arm, or the corner card
 *      re-measuring (`previous` and `next` carry the same `h`). `h` follows
 *      the rows, DOWN as much as up. This is the branch the auditor's repro
 *      exercises: folding `else` on a 480x496 Branch must hug back to 336, not
 *      leave a 160px dead band.
 *   3. A HEIGHT WAS WRITTEN and the arms were not. The delta over the rows is
 *      spread across the OPEN arms (`armsAfterDelta`) and `h` is re-derived
 *      from them, so the two can never disagree. A fully folded region has no
 *      open arm to receive the space, so it simply snaps back to its rows (the
 *      donor's `open.length === 0` case) — which is also why
 *      `regionMinHeightOf` refuses to let a handle go below them. NOTE that a
 *      resize GESTURE does not normally arrive here: `onResize` has already
 *      spread it, for the engine reason written out on `armsAfterDelta`, and
 *      this branch then finds a delta of zero. What is left for it is a
 *      programmatic `props.h` — stream 3's `applyScene`, a paste with an
 *      off-layout height — which no gesture seam ever sees.
 *
 * Returns nothing when the record is already true, so an update that changed
 * only `name` does not churn a second record out of this hook.
 */
export function reconcileRegionProps(
  editor: Editor,
  previous: RegionShape | undefined,
  next: RegionShape,
): RegionShape | void {
  // A `1x1` region is the box tool's placeholder, not a document — see
  // `isRegionPlaceholder` and `RegionShapeUtil.onBeforeCreate`.
  if (isRegionPlaceholder(next)) return;

  const w = Math.max(next.props.w, REGION_MIN_WIDTH_PX);
  const arms = next.props.arms;

  // 1. No arms: a free body an author may size at will.
  if (arms.length === 0) {
    const h = Math.max(next.props.h, hugHeightOf(editor, next, arms), REGION_MIN_HEIGHT_PX);
    return settled(next, w, h, arms);
  }

  const hugged = hugHeightOf(editor, next, arms);
  // A CREATE counts as "the rows moved": the archive mints a branch at
  // `h: branchHeightForArms(arms)` too (`branchModel.ts:282`), so a pasted,
  // duplicated or programmatically written region lands on its own rows.
  const rowsMoved = previous === undefined || !sameArms(previous.props.arms, arms) || previous.props.h === next.props.h;

  // 2. The rows moved: `h` follows them.
  if (rowsMoved) return settled(next, w, hugged, arms);

  // 3. A height was written with no arm change — a programmatic `props.h`, or
  //    a gesture whose spread `onResize` already applied and is re-stating.
  //    Either way the open arms share it (donor lines 470-479).
  const spread = armsAfterDelta(arms, next.props.h - hugged);
  return settled(next, w, hugHeightOf(editor, next, spread), spread);
}

/**
 * Share `delta` px across the OPEN arms, weighted by their current heights —
 * the donor's spread (`reconcileBranchProps`, branchModel.ts:470-479), lifted
 * into its own function so the two seams that need it cannot drift apart.
 *
 * WHY TWO SEAMS NEED IT, which is the thing that cost this lane a round.
 * `RegionShapeUtil.onResize` is the one that runs during a drag, and it has to
 * be, because of how tldraw applies a resize: `Editor.getResizeShapePartial`
 * (@tldraw/editor `src/lib/editor/Editor.ts`, measured in 5.3.2) builds the
 * update as `applyPartialToRecordWithProps(initialShape, {…onResize's answer})`
 * — the SNAPSHOT taken when the gesture began, with only the props `onResize`
 * returned laid over it. `resizeBox` returns `props: { w, h }` and nothing
 * else, so `arms` is replayed from the snapshot on EVERY frame. A reconcile
 * that spread the delta from `onBeforeUpdate` therefore wrote arms the next
 * frame silently reverted, and `!sameArms(previous, next)` then read that
 * revert as "the rows moved" and hugged back to the start — measured as a
 * frame that visibly refused to resize at all: 336 → 343 → 336 → 357 → 336.
 * The fix is that `onResize` returns the arms too, so they survive the merge.
 * The reconcile keeps its own copy of the rule for the writes no gesture makes
 * (a programmatic `props.h`), and both call THIS.
 *
 * A folded arm is skipped: it has no body on screen to give or take, and its
 * `h` is a memory of what it will re-open at, which a resize must not rewrite.
 */
export function armsAfterDelta(arms: readonly RegionArm[], delta: number): RegionArm[] {
  const open = arms.filter((arm) => arm.open);
  if (delta === 0 || open.length === 0) return [...arms];
  const total = open.reduce((sum, arm) => sum + arm.h, 0);
  let remaining = delta;
  return arms.map((arm) => {
    if (!arm.open) return arm;
    // The LAST open arm takes whatever the rounding left over, so the shares
    // add up to the delta exactly and the frame lands where the handle was let
    // go rather than a pixel or two off it.
    const isLast = open[open.length - 1] === arm;
    const share = isLast ? remaining : Math.round((delta * arm.h) / Math.max(1, total));
    remaining -= share;
    const h = Math.max(REGION_ARM_MIN_BODY_PX, arm.h + share);
    return h === arm.h ? arm : { ...arm, h };
  });
}

/** The height a region would hug if its arms were `arms` — what a resize needs
 *  in order to answer with a frame its own rows add up to. */
export function regionHugForArms(editor: Editor, shape: RegionShape, arms: readonly RegionArm[]): number {
  return hugHeightOf(editor, shape, arms);
}

/** The reconcile's one exit: answer `undefined` when nothing actually moved,
 *  so a no-op update does not mint a record. */
function settled(next: RegionShape, w: number, h: number, arms: RegionArm[]): RegionShape | void {
  if (w === next.props.w && h === next.props.h && sameArms(arms, next.props.arms)) return;
  return { ...next, props: { ...next.props, w, h, arms } };
}

/** Same arms, field for field — the donor's `sameArms` (branchModel.ts:432-444)
 *  minus `controlIcons`, which this document model does not have (a `break` is
 *  a mark this lane does not build). Identity is not enough: `updateShape`
 *  rebuilds the array on every write. */
function sameArms(a: readonly RegionArm[], b: readonly RegionArm[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((arm, index) => {
    const other = b[index];
    return arm.id === other.id && arm.open === other.open && arm.h === other.h && arm.title === other.title;
  });
}

function hugHeightOf(editor: Editor, shape: RegionShape, arms: readonly RegionArm[]): number {
  return regionLayout(layoutInput(editor, shape, 0, arms)).height;
}

function layoutInput(editor: Editor, shape: RegionShape, height: number, arms: readonly RegionArm[]) {
  return {
    width: shape.props.w,
    height,
    corner: cornerBoxOf(editor, shape),
    // WHY the drawing in force and not the twin's default 32: the face paints
    // the trunk's `Region`, which lays its arm rows out with the ACTIVE
    // region variant's header (26-32px, `@trunk/skin/regionVariants`). Every
    // number this file hands tldraw — the header bands it hit-tests, the hug
    // written into `props.h` — has to be the same rows, or a drawing switch
    // leaves the paint and the geometry a few px apart per arm.
    // `chrome/DevMenu/variantSwitch.tsx` re-settles `props.h` when the drawing changes.
    armHeaderPx: REGION_VARIANTS[readRegionVariant()].arms.headerPx,
    arms: arms.map((arm) => ({ id: arm.id, open: arm.open, bodyHeight: arm.h })),
  };
}
