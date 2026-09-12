import type { Node, NodeProps } from "@xyflow/react";

import {
  PortDot,
  PortLabel,
  portLabelPlacement,
  type PortSize,
  type PortTextLayout,
} from "@bbox-ui/core";

/**
 * A standalone Port wrapped in a minimal chrome-less React Flow node.
 *
 * WHY this node exists: React Flow has no node-less handle — handles belong
 * to nodes — so a standalone `bbox-port` drawn on a tldraw board has no
 * natural counterpart there. The comparison still needs the dot's geometry,
 * so the smallest possible host concept carries it: a node that paints ONLY
 * the core `PortDot` (stretched to w×h exactly like the tldraw shape util
 * does) at the same world point. The compare readout discloses the wrapper
 * rather than hiding it.
 */
export type BBoxPortNodeData = {
  w: number;
  h: number;
  // INTEGRATION (docs/T1-SPEC.md §2): "default" was Lane P's old, now-
  // deleted `PortState` label — the rebuilt Port's `AppearanceState` names
  // the same resting-value-set state "valueSet".
  state: "empty" | "valueSet" | "wired";
  size: PortSize;
  label: string;
  textLayout: PortTextLayout;
};

export type BBoxPortNodeType = Node<BBoxPortNodeData, "bboxStandalonePort">;

export function BBoxPortNode({ id, data }: NodeProps<BBoxPortNodeType>) {
  return (
    <div
      // The compare harness pairs this dot with its tldraw twin by id.
      data-standalone-port-id={id}
      className="relative"
      style={{ width: data.w, height: data.h }}
    >
      <PortDot
        state={data.state}
        diameter={data.size}
        className="block"
        style={{ width: "100%", height: "100%" }}
      />
      {data.label !== "" && (
        <PortLabel
          className="absolute"
          style={portLabelPlacement(data.textLayout, { w: data.w, h: data.h })}
        >
          {data.label}
        </PortLabel>
      )}
    </div>
  );
}
