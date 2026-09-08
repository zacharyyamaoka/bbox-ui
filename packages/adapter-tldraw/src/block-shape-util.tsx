import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  atom,
  resizeBox,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";

import {
  Block,
  BlockChip,
  BlockDescription,
  BlockGlyph,
  BlockHeader,
  BlockTitle,
  BlockType,
  PORT_DIAMETERS,
  PORT_DOT_CENTER_TRANSFORM,
  PortDot,
  PortLabel,
  SIMPLE_BLOCK,
  portDotPlacement,
  portLabelPlacement,
  type BlockSide,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";

/**
 * A port stored on the shape record. Note the state validator below admits
 * only "empty" | "default" | "wired".
 * WHY: `received` is a RUNTIME prop, never persisted document state — a
 * .tldr file that recorded "data arrived here" would be lying after reload.
 * Runtime delivery goes through `receivedPorts` instead.
 */
export interface BBoxShapePort {
  id: string;
  direction: "input" | "output";
  state: "empty" | "default" | "wired";
  size: PortSize;
  label: string;
  textLayout: PortTextLayout;
  side: BlockSide;
  t: number;
}

export interface BBoxBlockShapeProps {
  w: number;
  h: number;
  title: string;
  titleSize: TextSize;
  blockType: string;
  description: string;
  icon: string;
  tag: string;
  orientation: "horizontal" | "vertical";
  ports: BBoxShapePort[];
}

// tldraw 5.x custom shapes register their props on the global map so the
// shape type participates in TLShape (the documented augmentation path).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-block": BBoxBlockShapeProps;
  }
}

export type BBoxBlockShape = TLBaseShape<"bbox-block", BBoxBlockShapeProps>;

/**
 * Runtime-only "data received" flags, keyed `${shapeId}:${portId}`. A tldraw
 * atom so `component()` (which is reactive) repaints when a flag flips.
 * WHY a side table and not a shape prop: shape props are the persisted
 * document; `received` must never survive a save/load. See BBoxShapePort.
 */
export const receivedPorts = atom<Record<string, boolean>>(
  "bbox received ports",
  {},
);

export function setPortReceived(
  shapeId: string,
  portId: string,
  received: boolean,
) {
  receivedPorts.update((current) => ({
    ...current,
    [`${shapeId}:${portId}`]: received,
  }));
}

const portValidator: T.Validator<BBoxShapePort> = T.object({
  id: T.string,
  direction: T.literalEnum("input", "output"),
  // Deliberately excludes "received" — see BBoxShapePort.
  state: T.literalEnum("empty", "default", "wired"),
  size: T.literalEnum("sm", "md", "lg"),
  label: T.string,
  textLayout: T.literalEnum(
    "top",
    "bot",
    "right",
    "left",
    "right-offset",
    "left-offset",
  ),
  side: T.literalEnum("left", "right", "top", "bottom"),
  t: T.number,
});

/**
 * tldraw host adapter. The same presentational core renders inside
 * `HTMLContainer`, but here `props.w`/`props.h` on the shape record are
 * authoritative and the body geometry comes from `getGeometry()` — port
 * anchors are geometry points computed by the shared layout module, not DOM
 * elements the engine could measure.
 */
export class BBoxBlockShapeUtil extends ShapeUtil<BBoxBlockShape> {
  static override type = "bbox-block" as const;

  static override props = {
    w: T.number,
    h: T.number,
    title: T.string,
    titleSize: T.literalEnum("md", "lg", "xl"),
    blockType: T.string,
    description: T.string,
    icon: T.string,
    tag: T.string,
    orientation: T.literalEnum("horizontal", "vertical"),
    ports: T.arrayOf(portValidator),
  };

  override getDefaultProps(): BBoxBlockShape["props"] {
    return {
      w: SIMPLE_BLOCK.width,
      h: SIMPLE_BLOCK.height,
      title: "Title",
      titleSize: "xl",
      blockType: "",
      description: "",
      icon: "",
      tag: "",
      orientation: "horizontal",
      ports: [],
    };
  }

  override getGeometry(shape: BBoxBlockShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: BBoxBlockShape, info: TLResizeInfo<BBoxBlockShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: BBoxBlockShape) {
    const { props } = shape;
    const received = receivedPorts.get();
    return (
      <HTMLContainer style={{ overflow: "visible" }}>
        {/* data-block-id lets the compare harness pair this block with its
            React Flow twin by id (titles are user text and can repeat). */}
        <Block width={props.w} height={props.h} data-block-id={shape.id}>
          <BlockHeader orientation={props.orientation}>
            {props.icon !== "" && (
              <BlockGlyph size={props.titleSize}>{props.icon}</BlockGlyph>
            )}
            <BlockTitle size={props.titleSize}>{props.title}</BlockTitle>
            {props.tag !== "" && <BlockChip>{props.tag}</BlockChip>}
          </BlockHeader>
          {props.description !== "" && (
            <BlockDescription>{props.description}</BlockDescription>
          )}
          {props.blockType !== "" && <BlockType>{props.blockType}</BlockType>}
          {props.ports.map((port) => {
            const placement = portDotPlacement(
              port.side,
              port.t,
              props.w,
              props.h,
            );
            const state: PortState = received[`${shape.id}:${port.id}`]
              ? "received"
              : port.state;
            const diameter = PORT_DIAMETERS[port.size];
            return (
              <div
                key={port.id}
                data-port-id={port.id}
                className="absolute"
                style={{ ...placement, transform: PORT_DOT_CENTER_TRANSFORM }}
              >
                <PortDot state={state} size={port.size} className="block" />
                {port.label !== "" && (
                  <PortLabel
                    className="absolute"
                    style={portLabelPlacement(port.textLayout, diameter)}
                  >
                    {port.label}
                  </PortLabel>
                )}
              </div>
            );
          })}
        </Block>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: BBoxBlockShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
