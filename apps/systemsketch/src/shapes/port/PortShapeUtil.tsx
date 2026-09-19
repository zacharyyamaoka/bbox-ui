// src/shapes/port/PortShapeUtil.tsx — `ss-port`, the FREE port: one wireable
// dot with a label and no enclosing block.
//
// The archive's own one-liner for it (/home/bam/systemsketch/src/floatingPort/
// FloatingPortShapeUtil.tsx:28): "The free Port primitive: a semantic, wireable
// endpoint with no enclosing Block." This rebuild states the same thing the
// other way round — a floating port is a ONE-PORT NODE, the smallest block
// ("everything is really a block", plan §2), which is why it binds a wire at
// all and why its single anchor always carries `FLOATING_PORT_ID`.
//
// Nothing here draws a line. Its one anchor is a DATA endpoint (an `ss-wire`
// terminal, L3); control flow is containment and marks, never a cable
// (plan §2, §6's L2 row).
import {
  Rectangle2d,
  ShapeUtil,
  T,
  createShapePropsMigrationSequence,
  type TLBaseShape,
  type TLShapeUtilCanBindOpts,
} from "tldraw";

import { PortAnchorV } from "../shared/props";
import { PORT_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE, type PortSide } from "../types";
import { PortFace } from "./PortFace";

export interface PortShapeAnchor {
  portId: string;
  x: number;
  y: number;
  side: PortSide | null;
}

export type PortDirection = "in" | "out";

export interface PortShapeProps {
  w: number;
  h: number;
  name: string;
  type: string;
  direction: PortDirection;
  /** Exactly one MEASURED anchor, whose `portId` is `FLOATING_PORT_ID`. */
  anchors: PortShapeAnchor[];
}

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "ss-port": PortShapeProps;
  }
}

export type PortShape = TLBaseShape<"ss-port", PortShapeProps>;

export class PortShapeUtil extends ShapeUtil<PortShape> {
  static override type = PORT_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    name: T.string,
    type: T.string,
    direction: T.literalEnum("in", "out"),
    anchors: T.arrayOf(PortAnchorV),
  };

  // Version 0, declared now for the reason BlockShapeUtil records: the sequence
  // is what gives these props a version number in a saved file, and it cannot
  // be retrofitted once boards exist in the wild.
  static override migrations = createShapePropsMigrationSequence({ sequence: [] });

  override getDefaultProps(): PortShapeProps {
    return { w: 120, h: 32, name: "port", type: "", direction: "out", anchors: [] };
  }

  // WHY the whole box is filled geometry rather than a circle for the dot plus
  // a separate label rect: the archive's own rule, recorded at
  // FloatingPortShapeUtil.tsx:47-52 — "A free Port's text is its movable face,
  // not an editor label … Keep the real label bounds hit-testable so one grab
  // starts the stock translating interaction immediately." One rectangle is
  // that rule with nothing left to drift, because the face rendered by
  // PortFace is exactly this box (it is laid out at `props.w × props.h`, so
  // the measurement pass confirms the box rather than shrinking it to the dot).
  override getGeometry(shape: PortShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override getIndicatorPath(shape: PortShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }

  // A free port is a fixed-size token: its box is the dot plus the room its
  // label needs, not something to stretch. Resize and rotate are off for the
  // same reason the archive turned them off (FloatingPortShapeUtil.tsx:96-99).
  override canResize(): boolean {
    return false;
  }

  override hideResizeHandles(): boolean {
    return true;
  }

  override hideRotateHandle(): boolean {
    return true;
  }

  // Double-click enters editing (tldraw's select tool asks exactly this before
  // calling `setEditingShape`, SelectTool/childStates/Idle.mjs:334-350); the
  // NAME editor PortFace swaps in is what that editing session drives. Nothing
  // custom is needed to get there — `canEdit` is the whole subscription.
  override canEdit(): boolean {
    return true;
  }

  // WHY a floating port binds at all: it IS a wire endpoint — the smallest
  // block. `ss-block` and `ss-port` are the only two shapes a wire may name
  // (plan §3); code and regions refuse, so a data line can never be attached
  // to a thing that speaks no ports or to a control-flow container.
  //
  // The widened local mirrors BlockShapeUtil.canBind: `ss-wire` only joins the
  // engine's shape-type union when L3 augments `TLGlobalShapePropsMap`, so
  // until that lane lands the comparison is right at runtime and unprovable to
  // the type checker.
  override canBind(opts: TLShapeUtilCanBindOpts): boolean {
    const fromType: string = opts.fromShapeType;
    return opts.bindingType === WIRE_BINDING_TYPE && fromType === WIRE_SHAPE_TYPE;
  }

  override component(shape: PortShape) {
    return <PortFace shape={shape} />;
  }
}
