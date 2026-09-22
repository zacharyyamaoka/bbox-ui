/**
 * Trace/In A Host/Cable Parity — the SAME `HOST_SCENE` through the static
 * DOM canvas and its React Flow twin, and a measurement that both draw every
 * cable on the same waypoints (±1px).
 *
 * WHY this exists (docs/peps/0005-dom-canvas-stays-static.md): the DOM
 * canvas stays the static control and anything that moves across the canvas
 * goes in a React Flow twin — Zach, 2026-09-22: "ok its settled 100% lets
 * use reactflow than." A twin is only a twin if its cables are the kit's:
 * before this lane React Flow drew `getSmoothStepPath` with no keep-outs, so
 * the two panes compared two routers, not two hosts. The play function is
 * the tripwire: put React Flow's edge back on its stock path and it fails.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { expectSameCables, useWireGeometryRecorder } from "./cableParity";
import { DomCanvas } from "./domCanvas";
import { HOST_SCENE } from "./hostScene";
import { ReactFlowHost } from "./reactFlowHost";

const meta = {
  title: "Trace/In A Host/Cable Parity",
  tags: ["area:trace", "lane:reactflow-parity", "host:dom", "host:react-flow"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const WIDTH = 640;
const HEIGHT = 300;

function Panes() {
  const dom = useWireGeometryRecorder();
  const reactFlow = useWireGeometryRecorder();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 13, marginBottom: 8 }}>DOM Canvas — static, the control</figcaption>
        <div ref={dom.ref} data-pane="dom" style={{ border: "1px solid var(--border)" }}>
          <DomCanvas scene={HOST_SCENE} width={WIDTH} height={HEIGHT} onWireGeometry={dom.onWireGeometry} />
        </div>
      </figure>
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 13, marginBottom: 8 }}>React Flow — the twin, same cables</figcaption>
        <div ref={reactFlow.ref} data-pane="react-flow" style={{ border: "1px solid var(--border)" }}>
          <ReactFlowHost scene={HOST_SCENE} width={WIDTH} height={HEIGHT} defaultViewport={{ x: 0, y: 0, zoom: 1 }} onWireGeometry={reactFlow.onWireGeometry} />
        </div>
      </figure>
    </div>
  );
}

export const SameWaypoints: Story = {
  name: "Same Waypoints (DOM Canvas ⇄ React Flow)",
  render: () => <Panes />,
  play: async ({ canvasElement }) => {
    const domPane = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLElement>('[data-pane="dom"]');
      expect(found).not.toBeNull();
      return found!;
    });
    const reactFlowPane = canvasElement.querySelector<HTMLElement>('[data-pane="react-flow"]')!;
    const wireIds = HOST_SCENE.edges.map((edge) => edge.id);
    await waitFor(
      () => {
        // Both hosts resolved every cable to two real dots…
        expect(domPane.querySelector('[data-slot="wire-layer"]')?.getAttribute("data-unresolved-wires")).toBe("");
        expect(reactFlowPane.querySelector('[data-host="react-flow"]')?.getAttribute("data-unresolved-wires")).toBe("");
        // …and drew each on the same waypoints.
        expectSameCables(domPane, reactFlowPane, wireIds);
      },
      { timeout: 5000 },
    );
  },
};
