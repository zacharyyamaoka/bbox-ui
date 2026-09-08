import type { ReactNode } from "react";
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";

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
  PORT_RING_PX,
  PortLabel,
  cn,
  inwardTextLayout,
  portDotClass,
  portDotPlacement,
  portLabelPlacement,
  portSideForDirection,
  wiredInnerPx,
  type PortSize,
  type PortState,
  type PortTextLayout,
  type TextSize,
} from "@bbox-ui/core";

/**
 * One port on a block's edge. `t` runs 0→1 down the side.
 * WHY `state: "received"` is legal here but not in the tldraw adapter's shape
 * props: React Flow node data is React state, not a persisted document — a
 * runtime-only state can live in it without ever being written to disk.
 */
export interface BBoxPortSpec {
  id: string;
  direction: "input" | "output";
  state?: PortState;
  size?: PortSize;
  label?: string;
  textLayout?: PortTextLayout;
  textSize?: TextSize;
  t?: number;
}

export type BBoxBlockData = {
  title: string;
  blockType?: string;
  description?: string;
  icon?: ReactNode;
  tag?: string;
  titleSize?: TextSize;
  orientation?: "horizontal" | "vertical";
  ports?: BBoxPortSpec[];
  /**
   * Explicit container size — the size contract: explicit when the scene
   * carries one, hug contents when it does not. React Flow's node
   * `width`/`height` fields are where it stores what it MEASURED; size is
   * controlled through CSS, so whoever sets `w`/`h` here must also put
   * `style: { width: w, height: h }` on the node (the scene converter
   * does). The core Block then fills that box and the port anchors follow
   * the real boundary. Both or neither — a half-specified size is hug.
   */
  w?: number;
  h?: number;
  /**
   * Opt-in interactive resizing (a `<NodeResizer>` on the selected node).
   * Only for editable surfaces — the compare panes are read-only by design:
   * their camera bridge and divergence measurement assume no interaction,
   * so a resize handle there could de-calibrate the measurement.
   */
  resizable?: boolean;
};

export type BBoxBlockNodeType = Node<BBoxBlockData, "bboxBlock">;

/**
 * A React Flow custom node wrapping the presentational core. Each port is a
 * real `<Handle>` DOM element painted with the shared port-dot classes, so
 * edges connect to exactly the circle the user sees. React Flow measures the
 * node from the DOM into `node.measured.width/height` — hug-contents is the
 * default in this host, and an explicit size (`data.w/h` + node `style`)
 * overrides it through CSS.
 */
export function BBoxBlockNode({
  id,
  data,
  selected,
}: NodeProps<BBoxBlockNodeType>) {
  const titleSize = data.titleSize ?? "xl";
  const { updateNode } = useReactFlow();
  const sized = data.w != null && data.h != null;
  return (
    <>
      {data.resizable && (
        <NodeResizer
          isVisible={selected ?? false}
          // WHY write back on every tick: the resizer sizes the node
          // WRAPPER (React Flow applies the new width/height as CSS); the
          // core Block only follows because it fills a sized box, and the
          // port anchors only follow through data.w/h. Mirroring the size
          // into data + style keeps ports live during the drag and leaves
          // the node exactly as the scene converter would have emitted it —
          // the explicit-size contract round-trips.
          onResize={(_event, params) =>
            updateNode(id, (node) => ({
              data: { ...node.data, w: params.width, h: params.height },
              style: {
                ...node.style,
                width: params.width,
                height: params.height,
              },
            }))
          }
        />
      )}
      {/* WHY data-block-id: the compare harness pairs each block with its
          twin in the other host by id, not by title — titles are user text
          and can repeat on an authored board, and a title collision would
          mispair the measurement. */}
      <Block
        data-block-id={id}
        // The size contract: explicit size fills the node's CSS-sized box
        // (100%, so it tracks a live NodeResizer drag frame-perfectly);
        // no size means hug contents — the core's own default box.
        style={sized ? { width: "100%", height: "100%" } : undefined}
      >
        <BlockHeader orientation={data.orientation}>
          {data.icon != null && (
            <BlockGlyph size={titleSize}>{data.icon}</BlockGlyph>
          )}
          <BlockTitle size={titleSize}>{data.title}</BlockTitle>
          {data.tag != null && <BlockChip>{data.tag}</BlockChip>}
        </BlockHeader>
        {data.description != null && (
          <BlockDescription>{data.description}</BlockDescription>
        )}
        {data.blockType != null && <BlockType>{data.blockType}</BlockType>}
        {(data.ports ?? []).map((port) => {
          const state = port.state ?? "empty";
          const size = port.size ?? "md";
          const diameter = PORT_DIAMETERS[size];
          const side = portSideForDirection(port.direction);
          const textLayout = port.textLayout ?? inwardTextLayout(side);
          // WHY px + an explicit transform, not the stylesheet's `top: %`:
          // React Flow's handle CSS resolves percentages against the block's
          // *padding* box, which drifted the dot off the tldraw host's anchor
          // by the border width. portDotPlacement is the one shared answer.
          // An explicit size moves the boundary the anchors sit on — both
          // hosts feed the same w/h to the same function, so a resized
          // block's ports land on the same points in each.
          const placement = portDotPlacement(
            side,
            port.t ?? 0.5,
            data.w,
            data.h,
          );
          return (
            <Handle
              key={port.id}
              id={port.id}
              type={port.direction === "input" ? "target" : "source"}
              position={side === "left" ? Position.Left : Position.Right}
              data-state={state}
              // WHY "absolute": portDotClass carries "relative" for the core's
              // standalone dot; the Handle must keep React Flow's absolute
              // positioning or it falls into the block's flex flow.
              className={cn(portDotClass(state), "absolute overflow-visible")}
              style={{
                width: diameter,
                height: diameter,
                ...placement,
                transform: PORT_DOT_CENTER_TRANSFORM,
              }}
            >
              {state === "wired" && (
                <span
                  data-slot="port-dot-inner"
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{
                    width: wiredInnerPx(size),
                    height: wiredInnerPx(size),
                  }}
                />
              )}
              {port.label != null && (
                <PortLabel
                  textSize={port.textSize ?? "md"}
                  className="pointer-events-none absolute"
                  // WHY PORT_RING_PX: the Handle IS the bordered dot, so the
                  // label's containing box sits a ring-width inside the circle.
                  style={portLabelPlacement(textLayout, diameter, PORT_RING_PX)}
                >
                  {port.label}
                </PortLabel>
              )}
            </Handle>
          );
        })}
      </Block>
    </>
  );
}
