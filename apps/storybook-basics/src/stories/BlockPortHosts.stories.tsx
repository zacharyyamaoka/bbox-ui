import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";

/**
 * Blocks/BlockPort/In A Host — the ported Block under its host-facing name
 * `block` (H6). The DOM Canvas story doubles as the interaction CONTROL:
 * the same dnd-kit rail reorder the React Flow bench fights for (H4) runs
 * here with no engine anywhere near it, which is what makes "the host must
 * not steal it" a claim about the HOST and not about the components.
 */

const meta = {
  title: "Blocks/BlockPort/In A Host",
} satisfies Meta;

export default meta;
type Story = StoryObj;

const BLOCK_SCENE: HostScene = {
  nodes: [
    { id: "amp", type: "block", position: { x: 24, y: 16 }, data: { name: "amp", view: "expanded", w: 220, h: 170, ports: { left: ["in"], right: ["out", "aux"] } } },
  ],
  edges: [],
};

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function railOrder(rail: HTMLElement): (string | null)[] {
  return Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
}

function cardOf(rail: HTMLElement, portId: string): HTMLElement {
  const port = required<HTMLElement>(rail, `[data-port-id="${portId}"]`, `the ${portId} port`);
  return port.closest<HTMLElement>('[data-slot="port-edge-card"]') ?? port;
}

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={340} height={220} />;
}

export const BlockDomCanvas: Story = {
  name: "Block (DOM Canvas)",
  render: () => <StatefulDomCanvas initial={BLOCK_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");
    required<HTMLElement>(host, '[data-scene-node="amp"] [data-block-id="amp"], [data-scene-node="amp"][data-block-id="amp"]', "the hosted Block");
    const rail = required<HTMLElement>(host, '[data-block-id="amp"] [data-slot="block-port-rail"][data-edge="right"]', "amp's right rail");
    await waitFor(() => expect(railOrder(rail)).toEqual(["out", "aux"]));

    /* The control: the SAME bounded gesture H4 adjudicates inside React
     * Flow, with no engine in the tree — reorder works, and the host
     * writes the new order back into the scene. */
    await dragFrom(cardOf(rail, "out"), cardOf(rail, "aux"));
    await waitFor(() => expect(railOrder(rail)).toEqual(["aux", "out"]));
  },
};

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={420} height={260} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

export const BlockReactFlow: Story = {
  name: "Block (ReactFlow)",
  render: () => <StatefulReactFlow initial={BLOCK_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="amp"]', "the block RF node");
    required<HTMLElement>(node, '[data-block-id="amp"]', "the hosted Block");

    /* The measured handles landed: one per rendered dot, both types. */
    await waitFor(() => {
      for (const portId of ["in", "out", "aux"]) {
        expect(node.querySelector(`.react-flow__handle[data-handleid="${portId}"]`)).not.toBeNull();
      }
    });

    /* Node drag by the header — the block type's drag handle. */
    const header = required<HTMLElement>(node, '[data-block-id="amp"] > [data-slot="block"] > [data-slot="block-header"]', "amp's header");
    const before = node.getBoundingClientRect();
    const grip = header.getBoundingClientRect();
    await dragFrom(header, { x: grip.left + grip.width / 2 + 60, y: grip.top + grip.height / 2 + 20 });
    await waitFor(() => {
      const after = node.getBoundingClientRect();
      expect(Math.abs(after.left - before.left - 60)).toBeLessThanOrEqual(10);
      expect(Math.abs(after.top - before.top - 20)).toBeLessThanOrEqual(10);
    });
  },
};
