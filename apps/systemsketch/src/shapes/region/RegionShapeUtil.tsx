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
  type TLBaseShape,
  type TLDragShapesInInfo,
  type TLResizeInfo,
  type TLShape,
} from "tldraw";

import { REGION_MIN_WIDTH_PX } from "@trunk/components/region.layout";

import { REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../types";
import { regionLayoutOf } from "./cornerBlock";
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

/** The floor under an authored height. The width's floor is the trunk's own
 *  `REGION_MIN_WIDTH_PX` (240, the archive's `BRANCH_MIN_WIDTH`); 160 is this
 *  plan's matching floor for the height — below it a frame cannot hold a
 *  corner block and a body at once. */
const REGION_MIN_HEIGHT_PX = 160;

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

  override onResize(shape: RegionShape, info: TLResizeInfo<RegionShape>) {
    return resizeBox(shape, info);
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
   * Cables cross a region freely — verbatim from the archive's
   * `/home/bam/systemsketch/src/loop/LoopShapeUtil.tsx:135-138` ("Cables cross
   * the region freely; they live in the scope outside it"), which is itself
   * tldraw's own carve-out for arrows in `BaseFrameLikeShapeUtil
   * .shouldClipChild`. A wire from a block inside a loop to a block outside it
   * is ordinary dataflow — "scopes see in" — and clipping it at the border
   * would draw a cable that stops in mid-air.
   */
  override shouldClipChild(child: TLShape): boolean {
    const childType: string = child.type;
    return childType !== WIRE_SHAPE_TYPE && super.shouldClipChild(child);
  }

  /** A programmatic create with an off-layout size lands on the floor.
   *  The `1×1` guard is the archive's (`LoopShapeUtil.tsx:74-79`): the stock
   *  box tool creates a 1×1 placeholder and resizes it inside the SAME
   *  gesture, so flooring it here would fight the drag that is sizing it. */
  override onBeforeCreate(next: RegionShape): RegionShape | void {
    if (next.props.w <= 1 && next.props.h <= 1) return;
    return floored(next);
  }

  override onBeforeUpdate(_previous: RegionShape, next: RegionShape): RegionShape | void {
    return floored(next);
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
   * And the box is `regionLayoutOf`'s, not `props.w/h`: the geometry, the
   * clip path, the container tldraw sizes and the paint all come out of one
   * call, so a region whose arms outgrow its authored height still has a
   * selection outline that matches what is on screen (see `regionLayoutOf`).
   */
  override getGeometry(shape: RegionShape) {
    const layout = regionLayoutOf(this.editor, shape);
    const chrome = [
      // The title strip: the corner block's own row, full width. The corner
      // block is a CHILD and therefore sits ABOVE this in tldraw's z-order,
      // so pressing the card selects the CARD and pressing the strip beside
      // it selects the region — which is the frame-heading affordance tldraw
      // gives its own frames, wearing a real block instead of a text chip.
      { y: 0, h: layout.corner.h },
      // One band per arm HEADER — the row you fold and drag by. The arm's
      // BODY is deliberately not chrome: it is where members go, and it has
      // to stay as see-through as the frame itself.
      ...layout.arms.map((arm) => ({ y: arm.headerTop, h: arm.bodyTop - arm.headerTop })),
    ].filter((band) => band.h > 0);

    return new Group2d({
      children: [
        new Rectangle2d({ width: layout.width, height: layout.height, isFilled: false }),
        ...chrome.map(
          (band) =>
            new Rectangle2d({
              x: 0,
              y: band.y,
              width: layout.width,
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
    const layout = regionLayoutOf(this.editor, shape);
    const path = new Path2D();
    path.rect(0, 0, layout.width, layout.height);
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

/** The floors, in one place so create and update cannot disagree. */
function floored(next: RegionShape): RegionShape | void {
  const w = Math.max(next.props.w, REGION_MIN_WIDTH_PX);
  const h = Math.max(next.props.h, REGION_MIN_HEIGHT_PX);
  if (w === next.props.w && h === next.props.h) return;
  return { ...next, props: { ...next.props, w, h } };
}
