import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  resizeBox,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";

import {
  PORT_DIAMETERS,
  PortDot,
  PortLabel,
  portLabelPlacement,
  type PortSize,
  type PortTextLayout,
} from "@bbox-ui/core";

/**
 * A standalone Port on the canvas — a dot that is not (yet) attached to a
 * Block. Minimal by design: it exists so a Port can be placed from the
 * toolbar, adjusted, and later detached back to stock shapes.
 *
 * The state validator admits only "empty" | "default" | "wired".
 * WHY: `received` is a RUNTIME prop, never persisted document state — the
 * same rule the Block shape's ports follow. See block-shape-util.tsx.
 */
export interface BBoxPortShapeProps {
  w: number;
  h: number;
  state: "empty" | "default" | "wired";
  size: PortSize;
  label: string;
  textLayout: PortTextLayout;
}

// tldraw 5.x custom shapes register their props on the global map so the
// shape type participates in TLShape (the documented augmentation path).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    "bbox-port": BBoxPortShapeProps;
  }
}

export type BBoxPortShape = TLBaseShape<"bbox-port", BBoxPortShapeProps>;

/**
 * tldraw host adapter for the standalone Port. The dot is the same core
 * `PortDot` component the Block adapter paints — not a second drawing of a
 * circle — stretched to the shape's `w`/`h` so tldraw's stock resize keeps
 * working. The label hangs outside the geometry via the shared
 * `portLabelPlacement`, exactly as on a Block boundary.
 */
export class BBoxPortShapeUtil extends ShapeUtil<BBoxPortShape> {
  static override type = "bbox-port" as const;

  static override props = {
    w: T.number,
    h: T.number,
    // Deliberately excludes "received" — see BBoxPortShapeProps.
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
  };

  override getDefaultProps(): BBoxPortShape["props"] {
    return {
      w: PORT_DIAMETERS.md,
      h: PORT_DIAMETERS.md,
      state: "empty",
      size: "md",
      label: "",
      textLayout: "right",
    };
  }

  override getGeometry(shape: BBoxPortShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: BBoxPortShape, info: TLResizeInfo<BBoxPortShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: BBoxPortShape) {
    const { props } = shape;
    return (
      <HTMLContainer style={{ overflow: "visible" }}>
        <div
          // The compare harness pairs this dot with its React Flow wrapper
          // node by id — see BBoxPortNode in the React Flow adapter.
          data-standalone-port-id={shape.id}
          className="relative"
          style={{ width: props.w, height: props.h }}
        >
          <PortDot
            state={props.state}
            size={props.size}
            className="block"
            style={{ width: "100%", height: "100%" }}
          />
          {props.label !== "" && (
            <PortLabel
              className="absolute"
              style={portLabelPlacement(props.textLayout, { w: props.w, h: props.h })}
            >
              {props.label}
            </PortLabel>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: BBoxPortShape) {
    const path = new Path2D();
    path.ellipse(
      shape.props.w / 2,
      shape.props.h / 2,
      shape.props.w / 2,
      shape.props.h / 2,
      0,
      0,
      Math.PI * 2,
    );
    return path;
  }
}
