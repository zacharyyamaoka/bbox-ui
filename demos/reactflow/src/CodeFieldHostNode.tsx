import { useState } from "react";

import { CodeField, signatureGrammar } from "@bbox-ui/core";
import type { Node, NodeProps } from "@xyflow/react";

/**
 * A real React Flow custom node with a `CodeField` inside — not the
 * floating `CodeFieldDemo` panel (a DOM sibling of the canvas, which never
 * exercised any of React Flow's own pointer/wheel handling). Proves the
 * field survives being mounted where a consumer actually wants it: inside
 * node content, subject to RF's own drag-to-move-node and
 * wheel-to-zoom-canvas gestures on everything else in the pane.
 *
 * WHY `nodrag nowheel`: React Flow recognises these two class names on any
 * element inside a node's own content and skips its own drag/zoom handling
 * for pointer/wheel events that start there — no prop wiring needed, just
 * the class. Without them, a drag that starts inside the field's own text
 * moves the node instead of placing the caret, and scrolling over it zooms
 * the whole canvas instead of doing nothing where a plain `<input>` would.
 */
export type CodeFieldHostNodeData = { value: string };
export type CodeFieldHostNodeType = Node<CodeFieldHostNodeData, "codeFieldHost">;

const TYPES = [
  { label: "Pose", kind: "known" },
  { label: "int", kind: "primitive" },
];

export function CodeFieldHostNode({ data }: NodeProps<CodeFieldHostNodeType>) {
  const [value, setValue] = useState(data.value);
  const grammar = signatureGrammar({ types: TYPES });
  return (
    <div className="nodrag nowheel" style={{ width: 220, padding: 8, background: "var(--color-card, #fff)", border: "1px solid var(--color-border, #ccc)", borderRadius: 8 }}>
      <div style={{ fontSize: 10, marginBottom: 4, color: "var(--color-muted-foreground, #888)" }}>CodeField in a React Flow node</div>
      <CodeField value={value} onWrite={setValue} grammar={grammar} testId="code-field-in-rf-node" />
    </div>
  );
}
