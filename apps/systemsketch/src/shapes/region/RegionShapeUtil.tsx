// src/shapes/region/RegionShapeUtil.tsx — `ss-region`: a Loop, a Branch or a
// bare scope, as a frame-like container.
//
// THE TWO LOAD-BEARING IDEAS, both structural here rather than stated:
//
//   • EVERYTHING IS A BLOCK. This shape has no ports and no port validator.
//     Its interface is `cornerBlockId`, naming a CHILD `ss-block` that carries
//     the real rails (`./cornerBlock.ts`). `Pasted image 20260918150916.png`
//     marks ports-on-the-region OLD: BAD; this class is that ruling with
//     nowhere left to put them.
//
//   • NEVER MIX DATA AND CONTROL LINES. `canBind` is `false`, unconditionally
//     — a cable cannot land on a region, so control flow has no cable to be
//     confused with. What control flow IS instead: containment (`parentId`,
//     which tldraw's own frame drop maintains) plus arm rows. `break` is a
//     mark, not an edge (DP - Break & Continue; not built in this lane).
//
// The schema below is reproduced VERBATIM from the L0 placeholder this file
// replaces, for the reason that placeholder recorded: the document model is
// ONE contract, a record only enters a tldraw store if a registered util
// validates it, and `src/document/documentModel.test.ts`'s `ss-region`
// describe is the arbiter if the two ever disagree.
//
// The container behaviours are ported BY VALUE from the archive's own region
// base, `/home/bam/systemsketch/src/blocks/RegionShapeUtil.ts:16-26` and
// `src/branch/BranchShapeUtil.tsx:73-98` — refuse to adopt yourself, do not
// resize the children, no rotation, floors under w/h, cables cross freely —
// and the hit geometry from `/home/bam/systemsketch/src/blocks/
// containerGeometry.ts`, whose header is the only written-down reading of
// tldraw 5.3.2's frame-like hit test I found and which I re-checked against
// `Editor.getShapeAtPoint` before porting it.
import {
  BaseFrameLikeShapeUtil,
  Group2d,
  Rectangle2d,
  T,
  createShapePropsMigrationSequence,
  resizeBox,
  type Editor,
  type TLBaseShape,
  type TLDragShapesInInfo,
  type TLResizeInfo,
  type TLShape,
  type TLShapeId,
} from "tldraw";

import { REGION_MIN_WIDTH_PX } from "@trunk/components/region.layout";

import { REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../types";
import { armsAfterDelta, reconcileRegionProps, regionHugForArms, regionHugHeightOf, regionLayoutOf, regionMinHeightOf } from "./cornerBlock";
import { RegionFace } from "./RegionFace";

/** Which construct this frame IS. Closed, because a `kind` the renderer has
 *  never heard of would paint a scope with no header contract at all. */
export type RegionKind = "for" | "while" | "branch" | "plain";

/** One arm ROW: a titled band inside the frame. Not a terminal — an arm is
 *  containment, so there is no port, no handle and no edge field here. */
export interface RegionArm {
  id: string;
  /** Free text as an author writes it — `if fast:`, `case "pet":` — never
   *  code to be parsed back (`@trunk/presets/branch/branch.ts`'s own rule). */
  title: string;
  open: boolean;
  /** Body height while OPEN; remembered while folded, so re-opening restores
   *  the number the author set rather than a default. */
  h: number;
}

export interface RegionShapeProps {
  w: number;
  h: number;
  kind: RegionKind;
  name: string;
  /** The CHILD `ss-block` that IS this region's header contract. Empty until
   *  a tool creates one; never a port list of the region's own. */
  cornerBlockId: string;
  arms: RegionArm[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-region": RegionShapeProps;
  }
}

export type RegionShape = TLBaseShape<"ss-region", RegionShapeProps>;

export class RegionShapeUtil extends BaseFrameLikeShapeUtil<RegionShape> {
  static override type = REGION_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    kind: T.literalEnum("for", "while", "branch", "plain"),
    name: T.string,
    cornerBlockId: T.string,
    arms: T.arrayOf(T.object({ id: T.string, title: T.string, open: T.boolean, h: T.number })),
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the
  // sequence is what gives these props a version number in a saved file, and
  // it cannot be retrofitted once boards exist in the wild.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): RegionShapeProps {
    return { w: 480, h: 320, kind: "plain", name: "", cornerBlockId: "", arms: [] };
  }

  /**
   * ALWAYS frame-like — the one place this differs from `ss-block`, which is
   * frame-like only while expanded.
   *
   * WHY the difference is real and not an inconsistency (the archive said the
   * same thing in `blocks/RegionShapeUtil.ts:3-13`): a block has two honest
   * readings — a CALL, which must not silently adopt whatever is dropped on
   * it, and a DEFINITION, whose body is exactly where members belong. A region
   * has only one reading. It IS a scope; there is no state of a loop in which
   * dropping a block inside it means anything other than "this runs in the
   * loop".
   *
   * Spelled out rather than inherited from `BaseFrameLikeShapeUtil` (which
   * already answers `true`) because `documentModel.test.ts` asserts it on an
   * instance built with a null editor — this override is the contract, in the
   * file the contract is about.
   */
  override isFrameLike(_shape: RegionShape): boolean {
    return true;
  }

  override providesBackgroundForChildren(): boolean {
    return true;
  }

  /**
   * Anything but a wire may live in a region — including another region.
   * `Pasted image 20260918144705.png` nests a Selector inside an arm, and the
   * grammar has no depth limit, so this is a type test and never a depth test.
   *
   * A wire is refused for the same reason `canBind` is: it is a DATA line, it
   * belongs to the scope that draws it, and making it a member would turn a
   * cable crossing a frame into a statement about control flow.
   */
  override canReceiveNewChildrenOfType(shape: RegionShape, type: TLShape["type"]): boolean {
    const childType: string = type;
    return !shape.isLocked && childType !== WIRE_SHAPE_TYPE;
  }

  override onDragShapesIn(shape: RegionShape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
    // Archive `src/blocks/RegionShapeUtil.ts:22-27`: a locked container takes
    // nothing, and a drag containing the container itself would adopt it into
    // its own body.
    if (shape.isLocked) return;
    if (draggingShapes.some((dragging) => dragging.id === shape.id)) return;
    super.onDragShapesIn(shape, draggingShapes, info);
  }

  /**
   * A region is NEVER a wire target.
   *
   * Never mix data and control lines: a region is control flow, a wire is
   * data; a cable cannot land on it. The tempting alternative — letting a
   * wire end on the frame and mean "then this scope runs" — is precisely the
   * mixing Zach ruled out ("when you read Python code, the control is apparent
   * from the structure itself"), and it would also make the corner block
   * pointless, because there would then be two ways to reach a loop: its real
   * typed port, and its box. `documentModel.test.ts` asserts this `false`
   * beside `ss-code`'s.
   */
  override canBind(): boolean {
    return false;
  }

  override canResize(): boolean {
    return true;
  }

  /**
   * Stock `resizeBox`, told the real floors.
   *
   * WHY the floors go THROUGH `resizeBox` rather than being applied to its
   * answer: for a top or left handle `resizeBox` converts the shortfall into
   * an `x`/`y` offset, so the edge the author is not dragging stays where it
   * is. Clamping afterwards would instead slide the whole frame across the
   * board the moment the drag hit the floor.
   *
   * WHY the height floor is `regionMinHeightOf` and NOT the current hug, which
   * is what an earlier cut of this lane passed: an armed region's height IS
   * its rows, so flooring at the rows-as-they-stand made the bottom handle
   * one-way — you could stretch a Branch and never shrink it again. The floor
   * is instead how far the arms themselves can give (every open arm at
   * `REGION_ARM_MIN_BODY_PX`), which is exactly where `armsAfterDelta` stops,
   * so the number `resizeBox` clamps at and the number the spread below can
   * honour are the same function of the same arms — the condition a top-handle
   * drag needs in order not to slide, since `resizeBox` turns a shortfall into
   * a `y` offset (`resizeBox.ts:78-116`).
   *
   * WHY THE ARMS ARE SPREAD HERE and not left to `onBeforeUpdate`, which is
   * where the archive put the whole rule and where this lane put it first:
   * tldraw applies a resize as `applyPartialToRecordWithProps(initialShape,
   * {…this answer})` (`Editor.getResizeShapePartial`), and `resizeBox` answers
   * `props: { w, h }` alone — so every prop this method does NOT return is
   * replayed from the gesture's opening snapshot on every frame. Arms written
   * downstream were therefore reverted a frame later and the revert then read
   * as "an arm changed", which hugged the frame straight back: measured as
   * 336 → 343 → 336 → 357 → 336, a Branch whose bottom handle visibly did
   * nothing. Returning the arms is what makes them survive that merge.
   *
   * The delta is taken against the SNAPSHOT's rows (`shape` here IS
   * `{…initialShape, x, y}`, same source `resizeBox` scales), so it is
   * absolute for the whole gesture and cannot accumulate rounding.
   */
  override onResize(shape: RegionShape, info: TLResizeInfo<RegionShape>) {
    const box = resizeBox(shape, info, {
      minWidth: REGION_MIN_WIDTH_PX,
      minHeight: regionMinHeightOf(this.editor, shape),
    });
    // An armless Loop or plain scope has a free body: the height IS the answer.
    if (shape.props.arms.length === 0) return box;
    const arms = armsAfterDelta(shape.props.arms, box.props.h - regionHugHeightOf(this.editor, shape));
    return { ...box, props: { ...box.props, h: regionHugForArms(this.editor, shape, arms), arms } };
  }

  /**
   * Resizing the FRAME never resizes what is inside it (archive
   * `BranchShapeUtil.tsx:95-97`, and tldraw's own `FrameShapeUtil` defaults
   * the same way while `ShapeUtil.canResizeChildren` returns `true`).
   *
   * A region is a SCOPE, not a group: making the loop bigger to fit one more
   * step must not stretch the steps already in it, and squashing the corner
   * block — a real `ss-block` whose size is its own measured face — would put
   * the document's measured truth and its paint into a fight.
   */
  override canResizeChildren(): boolean {
    return false;
  }

  // No diagram in this language reads sideways; same call as the block's.
  override hideRotateHandle(): boolean {
    return true;
  }

  /**
   * TWO children escape the frame's clip: a cable, and the region's own
   * corner card. Every other member still stops at the wall.
   *
   * CABLES, verbatim from the archive's
   * `/home/bam/systemsketch/src/loop/LoopShapeUtil.tsx:135-138` ("Cables cross
   * the region freely; they live in the scope outside it"), which is itself
   * tldraw's own carve-out for arrows in `BaseFrameLikeShapeUtil
   * .shouldClipChild`. A wire from a block inside a loop to a block outside it
   * is ordinary dataflow — "scopes see in" — and clipping it at the border
   * would draw a cable that stops in mid-air.
   *
   * THE CORNER CARD (added 2026-09-19). Zach, comparing the app (`Pasted image
   * 20260919115050.png`, the `input 1` dot sliced off by the frame's wall)
   * with the DOM canvas (`…115249.png`, the `mode` dot sitting cleanly ON it):
   * "Generally I want the port to be right on the edge. and it shouldn't be
   * cut off by the frame."
   *
   * WHY those two sentences need a clip carve-out and not just a smaller
   * inset: a left rail centres its dots on the card's own wall, so half of
   * every dot is painted OUTSIDE the card (`@trunk/components/port.layout`).
   * "On the edge" therefore means the card is flush at x = 0 AND the dot's
   * outer half is outside the frame — which is exactly what `getClipPath`
   * removes. The previous answer bought the dot back by pushing the card 8px
   * inside (`cornerBlock.ts`'s `CORNER_INSET_X_PX`), and paid for it with the
   * two things he objected to: a card visibly inset from its own frame, and a
   * dot sitting in the scope rather than on its wall. Lifting the clip for
   * this one child costs neither.
   *
   * WHY IT IS SAFE TO SCOPE IT THIS TIGHTLY: the clip is what makes a region a
   * SCOPE — a member dragged past the wall must visibly stop at it, or
   * containment stops reading as containment. The corner card is not a member.
   * It is the region's own header contract (`cornerBlock.ts`: "everything is
   * really a block"), it is pinned to the frame's top-left, and it is the one
   * child whose id the region itself names — so "the shape my parent calls its
   * corner" is a total, checkable test rather than a heuristic about which
   * children look important.
   *
   * `shouldClipChild` is handed the DESCENDANT and is asked of EVERY clipping
   * ancestor (`Editor._getShapeMaskCache` walks `getShapeAncestors`), so the
   * test reads the child's OWN parent rather than assuming it is this shape: a
   * region nested against another region's wall must not have its corner card
   * sliced by the outer frame either, and reading `child.parentId` gets that
   * right for free.
   */
  override shouldClipChild(child: TLShape): boolean {
    const childType: string = child.type;
    if (childType === WIRE_SHAPE_TYPE) return false;
    if (!super.shouldClipChild(child)) return false;
    const parent = this.editor?.getShape(child.parentId as TLShapeId);
    if (!parent || parent.type !== REGION_SHAPE_TYPE) return true;
    return (parent as RegionShape).props.cornerBlockId !== child.id;
  }

  /**
   * THE ONE SEAM WHERE `props` BECOMES TRUE. Every create and every update
   * leaves this class with `props.w/h` equal to what `getGeometry` will draw:
   * at least `REGION_MIN_WIDTH_PX` wide, and — for a region WITH ARMS —
   * exactly as tall as the corner card and the arm rows add up to, the arms
   * absorbing whatever a resize handle asked for. An armless Loop or plain
   * scope keeps a free body, so there `h` is `max(authored, hugged)` and an
   * author's roomier frame survives. The rule and the reason both live in
   * `reconcileRegionProps` (`./cornerBlock`).
   *
   * WHY reconcile the record instead of letting the geometry hug on its own,
   * which reads like the tidier half (no write-back, one derived reading): the
   * engine measures an interactive drag against the SELECTION BOUNDS — the
   * geometry — and then scales `initialShape.props` by that ratio
   * (`Resizing._createSnapshot` → `getSelectionRotatedPageBounds`;
   * `resizeBox`: `w = shape.props.w * scaleX`). A geometry that is 240x496
   * over props of 240x320 therefore does not merely look different; it makes
   * every gesture wrong by 496/320, which showed up as a drag-create landing
   * 239px past the release point and a bottom handle with a 176px dead zone.
   * The archive warns about exactly this at
   * `/home/bam/systemsketch/src/loop/LoopShapeUtil.tsx:101-104`: "The record,
   * not the layout".
   *
   * WHY the `1x1` guard, on BOTH hooks (the archive's, `LoopShapeUtil.tsx:74-79`,
   * extended to `onBeforeUpdate` because this lane needs it and the archive did
   * not): `BaseBoxShapeTool` creates a 1x1 PLACEHOLDER and hands it to
   * `select.resizing`, which snapshots it and scales that snapshot for the rest
   * of the gesture. Reconciling the placeholder — including through the
   * `cornerBlockId` write-back the corner block's creation performs, which is
   * an ordinary update and lands BEFORE the snapshot — replaces the 1x1 the
   * whole drag is measured from. That single write is what produced the +239px:
   * the guard has to cover the update path or it does not exist.
   */
  override onBeforeCreate(next: RegionShape): RegionShape | void {
    return reconcileRegionProps(this.editor, undefined, next);
  }

  /**
   * WHY `previous` IS READ AND NOT IGNORED — the whole difference between a
   * frame that hugs and one that only ever grows. `reconcileRegionProps` needs
   * to know whether THIS write touched `h`: `resizeBox` writes it and means
   * "give the arms this much more room", while a fold writes only `arms` and
   * means "`h`, follow me down". An earlier cut of this lane took
   * `max(props.h, hugged)` from the two records' `next` alone, which cannot
   * tell those apart — so a folded arm left a 160px band inside a construct
   * that has no free body, and a stretched frame left the extra under the last
   * arm. `previous` is the only place that answer exists.
   */
  override onBeforeUpdate(previous: RegionShape, next: RegionShape): RegionShape | void {
    return reconcileRegionProps(this.editor, previous, next);
  }

  /**
   * A frame you can see through, plus the chrome you grab it by.
   *
   * Ported by value from the archive's `blocks/containerGeometry.ts`, whose
   * header is the reading of tldraw 5.3.2 this depends on — re-checked here
   * against `Editor.getShapeAtPoint` before porting:
   *
   *   1. the BODY is closed and UNFILLED, which is what lets a click inside a
   *      region reach the child under it, and what `getDraggingOverShape` asks
   *      (`isPointInShape(…, { hitInside: true })`) when deciding whether this
   *      region can adopt a dropped block. The two are the same predicate, so
   *      they cannot be tuned apart;
   *   2. every CHROME band is `isLabel`, because the frame-like branch of
   *      `getShapeAtPoint` returns the shape for a point inside a label's
   *      bounds and for nothing else inside the frame. That is the only way an
   *      arm header or the title strip selects the region;
   *   3. chrome is `excludeFromShapeBounds`, so a laid-out band cannot widen
   *      the bounds and snap a region to its own layout mid-create.
   *
   * And the box is `props.w/h` — NOT the layout's, which is the same number by
   * the time anything hit-tests this shape (`onBeforeCreate`/`onBeforeUpdate`
   * reconcile it) and is deliberately NOT the same number during the box
   * tool's 1x1 placeholder. Reading the layout here instead is what made the
   * geometry disagree with the record the engine scales, and every drag wrong
   * by their ratio; the reconcile above is where the hug belongs.
   */
  override getGeometry(shape: RegionShape) {
    const layout = regionLayoutOf(this.editor, shape);
    const width = shape.props.w;
    const chrome = [
      // The title strip: the corner block's own row, full width. The corner
      // block is a CHILD and therefore sits ABOVE this in tldraw's z-order,
      // so pressing the card hits the CARD — which `installRegionKit`'s
      // selection rewrite turns into the region, because card and frame are
      // one object (Zach, 2026-09-21) — and pressing the strip beside it hits
      // the region directly. Either way the frame heading grabs the frame,
      // the affordance tldraw gives its own frames, wearing a real block
      // instead of a text chip.
      { y: 0, h: layout.corner.h },
      // One band per arm HEADER — the row you fold and drag by. The arm's
      // BODY is deliberately not chrome: it is where members go, and it has
      // to stay as see-through as the frame itself.
      ...layout.arms.map((arm) => ({ y: arm.headerTop, h: arm.bodyTop - arm.headerTop })),
    ].filter((band) => band.h > 0);

    return new Group2d({
      children: [
        new Rectangle2d({ width, height: shape.props.h, isFilled: false }),
        ...chrome.map(
          (band) =>
            new Rectangle2d({
              x: 0,
              y: band.y,
              width,
              height: band.h,
              isFilled: true,
              isLabel: true,
              excludeFromShapeBounds: true,
            }),
        ),
      ],
    });
  }

  override getIndicatorPath(shape: RegionShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  /** What a screen reader and tldraw's own search read. The NAME, because the
   *  corner block paints it and a region with no corner block wears it as a
   *  tab (`REGION_NAME_TAB_PX`). */
  override getText(shape: RegionShape): string {
    return shape.props.name;
  }

  override component(shape: RegionShape) {
    return <RegionFace shape={shape} />;
  }
}
