import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "./domCanvas";
import { dragFrom, dragSteps } from "./hostGestures";
import type { HostScene } from "./hostScene";
import { ReactFlowHost } from "./reactFlowHost";

/**
 * Hosts/BlockPort — the ported Block under its host-facing name
 * `block` (H6). The DOM Canvas story doubles as the interaction CONTROL:
 * the same dnd-kit rail reorder the React Flow bench fights for (H4) runs
 * here with no engine anywhere near it, which is what makes "the host must
 * not steal it" a claim about the HOST and not about the components.
 */

const meta = {
  title: "Hosts/BlockPort",
  tags: ["object:block", "host:dom", "host:react-flow", "lane:host-fixes"],
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

function StatefulReactFlow({ initial, resizable, height = 260 }: { initial: HostScene; resizable?: boolean; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={420} height={height} defaultViewport={{ x: 0, y: 0, zoom: 1 }} resizable={resizable} />;
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

export const BlockResizeReactFlow: Story = {
  name: "Resize (ReactFlow)",
  // Taller than the other benches on purpose: `amp`'s bottom-left resize
  // handle at (24, 186) sits inside the stock zoom `<Controls>` panel's own
  // bottom-left footprint on the default 260px-tall canvas — a genuine
  // collision between two DIFFERENT things (a per-node handle, a
  // canvas-fixed overlay), unrelated to defect 4's occlusion-by-the-Block's
  // -own-content bug this story exists to catch. More headroom keeps the
  // two apart without touching either's z-index.
  render: () => <StatefulReactFlow initial={BLOCK_SCENE} resizable height={360} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="amp"]', "the block RF node");
    const block = required<HTMLElement>(node, '[data-block-id="amp"] > [data-slot="block"]', "the Block box");
    const grip = await waitFor(() =>
      required<HTMLElement>(node, ".react-flow__resize-control.handle.bottom.right", "the stock NodeResizer's corner handle"),
    );
    /* Wait until the HOST has measured the node: XYResizer anchors a
     * gesture on `node.measured`, which lands a beat after mount, and a
     * grip grabbed before that resizes from a phantom 0×0 start (the live
     * failure the write-back guard also covers). React Flow's own tell is
     * exact: a node stays `visibility: hidden` until its measurement
     * lands, then flips to `visible`. Generous timeout: measurement rides
     * rAF, which a backgrounded tab throttles to seconds. */
    await waitFor(() => expect(node.style.visibility).toBe("visible"), { timeout: 10000 });

    /* Host-fixes lane, defect 4: `dragFrom(grip, …)` dispatches ON the grip
     * element directly, which is exactly how the story stayed green while
     * a real pointer could not reach it — `document.elementsFromPoint`
     * never returned the grip at any of its four corners, occluded by the
     * Block's own port rail/card content (no explicit z-index on the
     * resize controls, so a later-painted, z-indexed sibling won the
     * stack). Before touching this element, prove with REAL hit-testing —
     * not element-targeted synthesis — that a real pointer would land on
     * the grip and nothing else, for every one of the eight controls. */
    const allControls = Array.from(node.querySelectorAll<HTMLElement>(".react-flow__resize-control"));
    expect(allControls.length).toBe(8);
    for (const control of allControls) {
      const r = control.getBoundingClientRect();
      const topHit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      expect(topHit, `real hit-test at ${control.className} resolved to ${topHit?.tagName}.${(topHit as HTMLElement)?.className}, not the control`).toBe(control);
    }

    const boxBefore = block.getBoundingClientRect();
    const dotBefore = required<HTMLElement>(node, '[data-port-id="out"] [data-slot="port-dot"]', "the out dot").getBoundingClientRect();

    /* Drag the STOCK resize handle — the host's gesture, written back into
     * the scene as data (`w`/`h`), which is what makes the Block itself
     * grow rather than a wrapper clipping it. Real-hit-tested above, so
     * dispatching on `grip` now targets what a real pointer would too. */
    const gripRect = grip.getBoundingClientRect();
    await dragFrom(grip, { x: gripRect.left + gripRect.width / 2 + 60, y: gripRect.top + gripRect.height / 2 + 40 });

    await waitFor(() => {
      const boxAfter = block.getBoundingClientRect();
      expect(boxAfter.width - boxBefore.width).toBeGreaterThan(40);
      expect(boxAfter.height - boxBefore.height).toBeGreaterThan(25);
      /* The wall's dots travelled WITH the resized wall — measured, the
       * rail re-attached to the new geometry. */
      const dotAfter = required<HTMLElement>(node, '[data-port-id="out"] [data-slot="port-dot"]', "the out dot").getBoundingClientRect();
      expect(dotAfter.left - dotBefore.left).toBeGreaterThan(40);
    });
  },
};

export const BlockResizeTopLeftReactFlow: Story = {
  name: "Resize from top-left holds until release (ReactFlow)",
  render: () => <StatefulReactFlow initial={BLOCK_SCENE} resizable height={360} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const node = required<HTMLElement>(host, '.react-flow__node[data-id="amp"]', "the block RF node");
    const block = required<HTMLElement>(node, '[data-block-id="amp"] > [data-slot="block"]', "the Block box");
    const grip = await waitFor(() => required<HTMLElement>(node, ".react-flow__resize-control.handle.top.left", "the top-left corner handle"));
    await waitFor(() => expect(node.style.visibility).toBe("visible"), { timeout: 10000 });

    /* Real hit-test first, same reason as the sibling story above. */
    const r0 = grip.getBoundingClientRect();
    expect(document.elementsFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2)[0]).toBe(grip);

    /* Host-fixes lane, defect 5: a TOP-LEFT drag moves the anchor (x, y)
     * AND grows (w, h) in the SAME gesture — React Flow streams the
     * position half on every pointermove (`applyPositionChanges`, before
     * this fix) while this host only ever writes w/h back at
     * `onResizeEnd`, so the two used to visibly separate: the Block SLID
     * with the streamed position while staying its OLD size, then jumped
     * to its new size only at release. The fix holds position back to
     * match size — proven here by sampling the Block's real rect at
     * several points DURING the drag and asserting NONE of them differ
     * from the pre-drag box, only the post-release one does. */
    const boxBefore = block.getBoundingClientRect();
    const gripRect = grip.getBoundingClientRect();
    const target = { x: gripRect.left + gripRect.width / 2 - 50, y: gripRect.top + gripRect.height / 2 - 30 };
    let sawIntermediateChange = false;
    await dragSteps(grip, target, {
      steps: 5,
      onStep: () => {
        const mid = block.getBoundingClientRect();
        if (mid.left !== boxBefore.left || mid.top !== boxBefore.top || mid.width !== boxBefore.width || mid.height !== boxBefore.height) {
          sawIntermediateChange = true;
        }
      },
    });
    expect(sawIntermediateChange, "the Block's box changed mid-drag — position and size streamed out of step").toBe(false);

    /* …and it DOES change, once, after release — this is not "resize
     * stopped working", it is "resize now commits atomically". */
    await waitFor(() => {
      const boxAfter = block.getBoundingClientRect();
      expect(boxAfter.width - boxBefore.width).toBeGreaterThan(30);
      expect(boxAfter.height - boxBefore.height).toBeGreaterThan(15);
    });
  },
};
