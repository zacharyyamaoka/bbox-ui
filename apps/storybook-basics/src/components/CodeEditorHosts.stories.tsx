import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { POINTER_OWNED_CLASS } from "../hosts/nodeViews";
import { ReactFlowHost } from "../hosts/reactFlowHost";

/**
 * Components/Text & Marks/CodeEditor/In A Host — the CodeEditor as a canvas node under its
 * host-facing name `code` (H6). The interesting seam: the editor owns its
 * pointer (caret, selection), so inside a gesturing host the node is
 * repositioned by the host-owned grab ring around it, never through the
 * editor's face.
 */

const meta = {
  title: "Components/Text & Marks/CodeEditor/In A Host",
  tags: ["object:text-marks", "host:dom", "host:react-flow", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const CODE_SCENE: HostScene = {
  nodes: [{ id: "prog", type: "code", position: { x: 24, y: 24 }, data: { name: "prog", code: "gain = clamp(x * k, 0, 1)" } }],
  edges: [],
};

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

export const CodeDomCanvas: Story = {
  name: "Code (DOM Canvas)",
  render: () => <DomCanvas scene={CODE_SCENE} width={320} height={120} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");
    const editor = required<HTMLElement>(host, '[data-scene-node="prog"] [data-slot="code-editor"]', "the hosted CodeEditor");
    /* The real CodeMirror mounted through the host and shows the scene's
     * own document. */
    await waitFor(() => {
      const content = required<HTMLElement>(editor, ".cm-content", "the CodeMirror document");
      expect(content.textContent).toContain("clamp(x * k, 0, 1)");
    });
  },
};

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={420} height={220} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

export const CodeReactFlow: Story = {
  name: "Code (ReactFlow)",
  render: () => <StatefulReactFlow initial={CODE_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="prog"]', "the code RF node");
    const wrapper = required<HTMLElement>(node, '[data-scene-node="prog"]', "the host wrapper (the grab ring)");
    const editor = required<HTMLElement>(node, '[data-slot="code-editor"]', "the hosted CodeEditor");
    await waitFor(() => {
      expect(required<HTMLElement>(editor, ".cm-content", "the CodeMirror document").textContent).toContain("clamp");
    });

    /* The boundary marker is ON the editor: React Flow's own default
     * noDragClassName, honored by its drag filter with zero adapter code. */
    expect(editor.classList.contains(POINTER_OWNED_CLASS)).toBe(true);

    /* A drag STARTED INSIDE the editor belongs to the editor — the node
     * must not move. */
    const before = node.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    await dragFrom(editor, { x: editorRect.left + 60, y: editorRect.top + editorRect.height / 2 + 40 }, {
      pressAt: { x: editorRect.left + editorRect.width / 2, y: editorRect.top + editorRect.height / 2 },
    });
    const afterEditorDrag = node.getBoundingClientRect();
    expect(Math.abs(afterEditorDrag.left - before.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(afterEditorDrag.top - before.top)).toBeLessThanOrEqual(0.5);

    /* A drag on the grab ring (the wrapper's own padding, host chrome)
     * repositions the node. */
    const ring = wrapper.getBoundingClientRect();
    await dragFrom(wrapper, { x: ring.left + 60, y: ring.top + 45 }, { pressAt: { x: ring.left + 5, y: ring.top + 5 } });
    await waitFor(() => {
      const after = node.getBoundingClientRect();
      expect(after.left - before.left).toBeGreaterThan(30);
      expect(after.top - before.top).toBeGreaterThan(20);
    });
  },
};
