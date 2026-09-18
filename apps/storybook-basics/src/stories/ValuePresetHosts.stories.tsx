import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { POINTER_OWNED_CLASS } from "../hosts/nodeViews";
import { ReactFlowHost } from "../hosts/reactFlowHost";

/**
 * Presets/Value/In A Host — the Value capsule under its host-facing name
 * `value` (H6). Like the Code face, the capsule's editor owns its pointer;
 * unlike Code, the pill itself is grabbable chrome, so the node drags by
 * any non-editor part of the capsule.
 */

const meta = {
  title: "Presets/Value/In A Host",
} satisfies Meta;

export default meta;
type Story = StoryObj;

const VALUE_SCENE: HostScene = {
  nodes: [
    { id: "gain", type: "value", position: { x: 40, y: 40 }, data: { name: "gain", value: "0.75", w: 150, writers: ["set"], readers: ["val"] } },
  ],
  edges: [],
};

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

export const ValueDomCanvas: Story = {
  name: "Value (DOM Canvas)",
  render: () => <DomCanvas scene={VALUE_SCENE} width={280} height={140} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");
    const capsule = required<HTMLElement>(host, '[data-scene-node="gain"] [data-block-id="gain"]', "the hosted Value capsule");
    /* The capsule's face is the value itself… */
    await waitFor(() => {
      expect(required<HTMLElement>(capsule, ".cm-content", "the value document").textContent).toContain("0.75");
    });
    /* …and both walls collapsed to their usual single dot, resolvable by
     * the same `data-collapsed-ports` reading wires use. */
    const collapsed = Array.from(capsule.querySelectorAll<HTMLElement>("[data-collapsed-ports]")).map((el) => el.getAttribute("data-collapsed-ports"));
    expect(collapsed).toEqual(expect.arrayContaining(["set", "val"]));
  },
};

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={360} height={220} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

export const ValueReactFlow: Story = {
  name: "Value (ReactFlow)",
  render: () => <StatefulReactFlow initial={VALUE_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="gain"]', "the value RF node");
    const capsule = required<HTMLElement>(node, '[data-block-id="gain"]', "the hosted Value capsule");
    const editor = required<HTMLElement>(capsule, '[data-slot="code-editor"]', "the capsule's editor face");
    await waitFor(() => {
      expect(required<HTMLElement>(editor, ".cm-content", "the value document").textContent).toContain("0.75");
    });
    expect(editor.classList.contains(POINTER_OWNED_CLASS)).toBe(true);

    /* A drag started ON the editor face stays the editor's. */
    const before = node.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    await dragFrom(editor, { x: editorRect.left + 40, y: editorRect.top + 40 });
    const afterEditorDrag = node.getBoundingClientRect();
    expect(Math.abs(afterEditorDrag.left - before.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(afterEditorDrag.top - before.top)).toBeLessThanOrEqual(0.5);

    /* A drag on the pill's non-editor face repositions the node — the
     * rounded end left of the centred editor is capsule, not editor. */
    const block = required<HTMLElement>(capsule, '[data-slot="block"]', "the pill");
    const pill = block.getBoundingClientRect();
    await dragFrom(block, { x: pill.left + 70, y: pill.top + pill.height / 2 + 35 }, {
      pressAt: { x: pill.left + 8, y: pill.top + pill.height / 2 },
    });
    await waitFor(() => {
      const after = node.getBoundingClientRect();
      expect(after.left - before.left).toBeGreaterThan(30);
      expect(after.top - before.top).toBeGreaterThan(15);
    });
  },
};
