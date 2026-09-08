import type { CSSProperties, ReactNode } from "react";
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
  PortLabel,
  cn,
  portDotClass,
  portLabelGap,
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

function labelPlacement(
  layout: PortTextLayout,
  diameter: number,
): CSSProperties {
  const gap = portLabelGap(layout);
  const out = `${diameter + gap}px`;
  switch (layout) {
    case "right":
    case "right-offset":
      return { left: out, top: "50%", transform: "translateY(-50%)" };
    case "left":
    case "left-offset":
      return { right: out, top: "50%", transform: "translateY(-50%)" };
    case "top":
      return { bottom: out, left: "50%", transform: "translateX(-50%)" };
    case "bot":
      return { top: out, left: "50%", transform: "translateX(-50%)" };
  }
}

/**
 * A React Flow custom node wrapping the presentational core. Each port is a
 * real `<Handle>` DOM element painted with the shared port-dot classes, so
 * edges connect to exactly the circle the user sees. React Flow measures the
 * node from the DOM into `node.measured.width/height` — hug-contents is free
 * in this host.
 */
export function BBoxBlockNode({ data }: NodeProps<BBoxBlockNodeType>) {
  const titleSize = data.titleSize ?? "xl";
  return (
    <Block>
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
        const textLayout =
          port.textLayout ?? (port.direction === "input" ? "right" : "left");
        return (
          <Handle
            key={port.id}
            id={port.id}
            type={port.direction === "input" ? "target" : "source"}
            position={port.direction === "input" ? Position.Left : Position.Right}
            data-state={state}
            // WHY "absolute": portDotClass carries "relative" for the core's
            // standalone dot; the Handle must keep React Flow's absolute
            // positioning or it falls into the block's flex flow.
            className={cn(portDotClass(state), "absolute overflow-visible")}
            style={{ width: diameter, height: diameter, top: `${(port.t ?? 0.5) * 100}%` }}
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
                style={labelPlacement(textLayout, diameter)}
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
