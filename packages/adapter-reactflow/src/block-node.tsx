import type { ReactNode } from "react";
import {
  Handle,
  Position,
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
};

export type BBoxBlockNodeType = Node<BBoxBlockData, "bboxBlock">;

/**
 * A React Flow custom node wrapping the presentational core. Each port is a
 * real `<Handle>` DOM element painted with the shared port-dot classes, so
 * edges connect to exactly the circle the user sees. React Flow measures the
 * node from the DOM into `node.measured.width/height` — hug-contents is free
 * in this host.
 */
export function BBoxBlockNode({ id, data }: NodeProps<BBoxBlockNodeType>) {
  const titleSize = data.titleSize ?? "xl";
  return (
    // WHY data-block-id: the compare harness pairs each block with its twin
    // in the other host by id, not by title — titles are user text and can
    // repeat on an authored board, and a title collision would mispair the
    // measurement.
    <Block data-block-id={id}>
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
        const placement = portDotPlacement(side, port.t ?? 0.5);
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
                style={{ width: wiredInnerPx(size), height: wiredInnerPx(size) }}
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
  );
}
