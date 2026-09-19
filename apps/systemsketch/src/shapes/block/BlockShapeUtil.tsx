// src/shapes/block/BlockShapeUtil.tsx — `ss-block`, THE node primitive.
//
// "Everything is really a block" (Zach, docs/ASK-2026-09-18…md): a function
// call, a function definition, a class, and — once L5 lands — a loop's or a
// branch's header contract are all THIS shape. A region does not grow ports;
// it holds a real `ss-block` in its corner instead.
//
// Frame-like only in `expanded` view, which is the same shape as the archive's
// Expanded Block: members are real tldraw children (plan §1.4), so drag-in,
// clipping and z-order stay the engine's rather than becoming ours.
import {
  BaseFrameLikeShapeUtil,
  Rectangle2d,
  T,
  createShapePropsMigrationSequence,
  resizeBox,
  type TLBaseShape,
  type TLDragShapesInInfo,
  type TLResizeInfo,
  type TLShape,
  type TLShapeUtilCanBindOpts,
} from "tldraw";

import { PortAnchorV, PortSpecV } from "../shared/props";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE, type PortSide } from "../types";
import { BlockFace } from "./BlockFace";

export interface BlockPortSpec {
  id: string;
  name: string;
  type: string;
}

export interface BlockPortAnchor {
  portId: string;
  x: number;
  y: number;
  side: PortSide | null;
}

export type BlockView = "simple" | "port" | "expanded";

export interface BlockShapeProps {
  w: number;
  h: number;
  name: string;
  view: BlockView;
  ports: Record<PortSide, BlockPortSpec[]>;
  /** MEASURED shape-local dot centres, written back by the host. A writer
   *  (pyblocks) leaves this `[]` and the first render fills it. */
  anchors: BlockPortAnchor[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-block": BlockShapeProps;
  }
}

export type BlockShape = TLBaseShape<"ss-block", BlockShapeProps>;

export class BlockShapeUtil extends BaseFrameLikeShapeUtil<BlockShape> {
  static override type = BLOCK_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    view: T.literalEnum("simple", "port", "expanded"),
    ports: T.object({
      left: T.arrayOf(PortSpecV),
      right: T.arrayOf(PortSpecV),
      top: T.arrayOf(PortSpecV),
      bottom: T.arrayOf(PortSpecV),
    }),
    anchors: T.arrayOf(PortAnchorV),
  };

  // WHY an empty sequence and not "no migrations": the sequence is what gives
  // this shape's props a version number in a saved file. Declaring it now (at
  // version 0) is what lets a later lane ADD a migration; retrofitting the
  // sequence after boards exist in the wild cannot.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): BlockShapeProps {
    return {
      w: 160,
      h: 100,
      name: "block",
      view: "port",
      ports: { left: [], right: [], top: [], bottom: [] },
      anchors: [],
    };
  }

  // WHY frame-like ONLY when expanded: a port-view block is a CALL — dragging
  // another block onto it must not silently make it a member. An expanded
  // block is a DEFINITION, and its body is where members belong.
  override isFrameLike(shape: BlockShape): boolean {
    return shape.props.view === "expanded";
  }

  override providesBackgroundForChildren(): boolean {
    return true;
  }

  override canReceiveNewChildrenOfType(shape: BlockShape, type: TLShape["type"]): boolean {
    // A wire is never a member. It is an edge between blocks, and containment
    // is control flow — the two must not be mixed (plan §2).
    //
    // WHY the widened local: `ss-wire` joins the engine's shape-type union
    // when L3 augments `TLGlobalShapePropsMap`, so until that lane lands the
    // comparison is correct at runtime and unprovable to the type checker.
    const childType: string = type;
    return shape.props.view === "expanded" && childType !== WIRE_SHAPE_TYPE;
  }

  override onDragShapesIn(shape: BlockShape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
    // Archive: src/blocks/RegionShapeUtil.ts:22-27 — a locked container takes
    // nothing, and a drag that contains the container itself would adopt it
    // into its own body.
    if (shape.isLocked) return;
    if (draggingShapes.some((dragging) => dragging.id === shape.id)) return;
    super.onDragShapesIn(shape, draggingShapes, info);
  }

  // A block is a data endpoint: the one thing a wire may name, together with a
  // floating `ss-port`. Nothing else binds — and there is no control-line
  // binding to refuse, because control flow is never a cable.
  override canBind(opts: TLShapeUtilCanBindOpts): boolean {
    // Widened for the same reason as `canReceiveNewChildrenOfType` above.
    const fromType: string = opts.fromShapeType;
    return opts.bindingType === WIRE_BINDING_TYPE && fromType === WIRE_SHAPE_TYPE;
  }

  override canResize(): boolean {
    return true;
  }

  override onResize(shape: BlockShape, info: TLResizeInfo<BlockShape>) {
    return resizeBox(shape, info);
  }

  // A rotated block would rotate its rails and its labels with it, and every
  // port dot would still be reachable — but no diagram in this language reads
  // sideways. Rotation is off until something asks for it.
  override hideRotateHandle(): boolean {
    return true;
  }

  override getGeometry(shape: BlockShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: BlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  override component(shape: BlockShape) {
    return <BlockFace shape={shape} />;
  }
}
