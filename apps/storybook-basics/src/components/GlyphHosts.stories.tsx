import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";

/**
 * Components/Text & Marks/Glyph/In A Host — the Glyph face as a canvas node, under its
 * host-facing name `glyph` (H6). Story-name tags carry the host; untagged
 * stories elsewhere are plain DOM.
 */

const meta = {
  title: "Components/Text & Marks/Glyph/In A Host",
  tags: ["object:text-marks", "host:dom", "host:react-flow", "lane:baseline"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const GLYPH_SCENE: HostScene = {
  nodes: [{ id: "logo", type: "glyph", position: { x: 32, y: 32 }, data: { name: "logo", content: "lucide:rocket" } }],
  edges: [],
};

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

export const GlyphDomCanvas: Story = {
  name: "Glyph (DOM Canvas)",
  render: () => <DomCanvas scene={GLYPH_SCENE} width={200} height={140} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");
    const glyph = required<HTMLElement>(host, '[data-scene-node="logo"] [data-slot="glyph"]', "the hosted Glyph");
    /* The face resolved for real: lucide content, THROUGH the host, via
     * the same preview-level resolver every bare story uses. */
    await expect(glyph.getAttribute("data-content-kind")).toBe("lucide");
    await waitFor(() => expect(glyph.getAttribute("data-unresolved")).toBeNull());
    expect(glyph.querySelector("svg")).not.toBeNull();
  },
};

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={320} height={220} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

export const GlyphReactFlow: Story = {
  name: "Glyph (ReactFlow)",
  render: () => <StatefulReactFlow initial={GLYPH_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="logo"]', "the glyph RF node");
    const glyph = required<HTMLElement>(node, '[data-slot="glyph"]', "the hosted Glyph");
    await waitFor(() => expect(glyph.getAttribute("data-unresolved")).toBeNull());

    /* Per-type drag policy: a Glyph has no pointer-owning internals, so
     * the WHOLE face repositions the node. */
    const before = node.getBoundingClientRect();
    await dragFrom(glyph, { x: before.left + before.width / 2 + 50, y: before.top + before.height / 2 + 25 });
    await waitFor(() => {
      const after = node.getBoundingClientRect();
      expect(Math.abs(after.left - before.left - 50)).toBeLessThanOrEqual(10);
      expect(Math.abs(after.top - before.top - 25)).toBeLessThanOrEqual(10);
    });
  },
};
