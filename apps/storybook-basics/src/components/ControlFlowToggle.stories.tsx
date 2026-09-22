/**
 * Components/Blocks/BlockRegion/Toggle — the opaque (P5) ⇄ expanded (P1) flip, on all three
 * hosts (docs/CONTROL-FLOW-PLAN.md lane E, §2.B and §3.4).
 *
 * The claim these stories exist to make is not "a card appears". It is
 * **the toggle is a PROJECTION, not a document edit** — so the things that
 * must NOT change are asserted as hard as the thing that does:
 *
 *   • the positions probe (`[data-slot="positions"]`, every node's own
 *     `position` serialised) reads byte-identical across the flip, because
 *     `setRegionView` writes exactly one field on exactly one node;
 *   • the region's host element does not move — measured with
 *     `getBoundingClientRect`, on whichever element the host actually
 *     positions (a `position:absolute` div, a `.react-flow__node`
 *     transform, a tldraw shape);
 *   • every crossing cable keeps its id and its OUTSIDE end: `e-seed` still
 *     starts at `src/pose` and `e-out` still ends at `enc/pose`; only the
 *     hidden end moved, onto the card's promoted port;
 *   • the loop's private `Iter` cable (`e-iter`, a `port-inner` edge) is
 *     GONE rather than re-pointed — a region's own interior wiring is not a
 *     value arriving from outside, and drawing it on the card would be
 *     exactly the "data and control mixed" failure the language forbids;
 *   • clicking again restores the frame with every wire resolved, off the
 *     same untouched document.
 *
 * "Everything is a block" is what makes the card work at all: the opaque
 * card is the SAME `BlockPort id="loop"` the frame's corner renders, with
 * more ports on it. `merge/pose` resolves through the identical
 * `[data-block-id]` → `[data-port-id]` walk as any other port, which is why
 * `WireLayer`, React Flow's handles and tldraw's anchors needed no
 * region-specific code for the projected edges.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { DomCanvas as DomCanvasHost } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { ARM_NODE_TYPE, describeHidden, hiddenSummary } from "../scene/controlFlow";
import { REGION_NODE_TYPE } from "../scene/region";
import { expectRegionExpanded, expectRegionOpaque, expectWirePainted } from "./blockRegion.acceptance";

const meta = {
  title: "Components/Blocks/BlockRegion/Toggle",
  tags: ["object:region", "host:dom", "host:react-flow", "host:tldraw", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * `hosts/regionScene.test.ts`'s loop, grown the two members and the two
 * outside blocks the acceptance names. Every crossing cable in it is a
 * DIRECT one (V1): `src/pose → merge/pose` runs straight through the frame
 * into a member, because that is what the EXPANDED document contains. The
 * card is a lens over exactly these edges — nothing here is authored twice.
 */
const TOGGLE_SCENE: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 108, h: 84, ports: { right: ["pose", "others"] } } },
    {
      id: "loop",
      type: REGION_NODE_TYPE,
      position: { x: 190, y: 32 },
      data: { name: "For Loop", region: { kind: "loop", loop: "for" }, ports: { left: ["Iterable"], right: ["Iter"] }, w: 400, h: 268 },
    },
    // `merge` is 156px wide, not the 120 a two-port card needs: its left
    // wall says `pose` and its right wall says `Pose`, and at 120 the two
    // labels touch and read as "posePose" in a capture. Sizing a fixture so
    // the thing under review is legible is the fixture's job.
    { id: "merge", type: "block", parentId: "loop", position: { x: 36, y: 86 }, data: { name: "merge", view: "port", w: 156, h: 106, ports: { left: ["pose", "other"], right: ["Pose"] } } },
    { id: "smooth", type: "block", parentId: "loop", position: { x: 244, y: 86 }, data: { name: "smooth", view: "port", w: 128, h: 84, ports: { left: ["in"], right: ["out"] } } },
    { id: "enc", type: "block", position: { x: 664, y: 150 }, data: { name: "enc", view: "port", w: 108, h: 84, ports: { left: ["pose"] } } },
  ],
  edges: [
    // port-outer: the region's own interface, wired from outside. SAME
    // object through the projection — it already lands on the card.
    { id: "e-iterable", source: "src", sourceHandle: "others", target: "loop", targetHandle: "Iterable" },
    // port-inner: the loop's private `Iter` cable. Hidden while opaque.
    { id: "e-iter", source: "loop", sourceHandle: "Iter", target: "merge", targetHandle: "other" },
    // inbound: re-pointed at the card's `merge/pose`, outside end intact.
    { id: "e-seed", source: "src", sourceHandle: "pose", target: "merge", targetHandle: "pose" },
    // interior: both ends inside. Dropped while opaque.
    { id: "e-ms", source: "merge", sourceHandle: "Pose", target: "smooth", targetHandle: "in" },
    // outbound: re-pointed at the card's `smooth/out`, outside end intact.
    { id: "e-out", source: "smooth", sourceHandle: "out", target: "enc", targetHandle: "pose" },
  ],
};

/**
 * A branch (two arms, one block each) nested in the loop's body, with the
 * loop already opaque — the outermost-opaque rule with something real
 * underneath it. Nothing of the branch may reach the DOM: its own card, its
 * arms and its members are all inside a region that is not drawn.
 */
const NESTED_SCENE: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 16, y: 150 }, data: { name: "src", view: "port", w: 108, h: 84, ports: { right: ["pose", "others"] } } },
    {
      id: "loop",
      type: REGION_NODE_TYPE,
      position: { x: 190, y: 32 },
      data: { name: "For Loop", region: { kind: "loop", loop: "for", view: "opaque" }, ports: { left: ["Iterable"], right: ["Iter"] }, w: 420, h: 330 },
    },
    { id: "br", type: REGION_NODE_TYPE, parentId: "loop", position: { x: 36, y: 86 }, data: { name: "Branch", region: { kind: "branch" }, ports: { left: ["fast"] }, w: 330 } },
    { id: "if", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: { name: "if fast:", arm: { open: true, h: 96 } } },
    { id: "else", type: ARM_NODE_TYPE, parentId: "br", position: { x: 0, y: 0 }, data: { name: "else:", arm: { open: true, h: 96 } } },
    { id: "est", type: "block", parentId: "if", position: { x: 24, y: 14 }, data: { name: "estimate", view: "port", w: 128, h: 64, ports: { left: ["frame"], right: ["pose"] } } },
    { id: "fb", type: "block", parentId: "else", position: { x: 24, y: 14 }, data: { name: "fallback", view: "port", w: 128, h: 64, ports: { left: ["frame"], right: ["pose"] } } },
    { id: "enc", type: "block", position: { x: 664, y: 150 }, data: { name: "enc", view: "port", w: 108, h: 84, ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "e-iterable", source: "src", sourceHandle: "others", target: "loop", targetHandle: "Iterable" },
    { id: "e-iter", source: "loop", sourceHandle: "Iter", target: "br", targetHandle: "fast" },
    { id: "e-in", source: "src", sourceHandle: "pose", target: "est", targetHandle: "frame" },
    { id: "e-int", source: "est", sourceHandle: "pose", target: "fb", targetHandle: "frame" },
    { id: "e-out", source: "fb", sourceHandle: "pose", target: "enc", targetHandle: "pose" },
  ],
};

/* ------------------------------------------------------------------ */
/* Benches — one stateful wrapper per host, plus the positions probe    */
/* ------------------------------------------------------------------ */

/**
 * The oracle for "nothing moved": the scene's OWN `position` records,
 * serialised. Read before and after the flip and compared as a string, so a
 * single node drifting by a pixel — or a host quietly writing a position
 * back — fails loudly. Deliberately the record and not a measurement: the
 * screen boxes are measured separately, and if the document itself changed
 * then the projection ruling (§2.B) is already broken whatever the pixels
 * say.
 */
function PositionsProbe({ scene }: { scene: HostScene }) {
  return <pre data-slot="positions">{JSON.stringify(scene.nodes.map((node) => [node.id, node.position]))}</pre>;
}

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <div>
      <DomCanvasHost scene={scene} onSceneChange={setScene} width={800} height={368} />
      <PositionsProbe scene={scene} />
    </div>
  );
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <div>
      <ReactFlowHost scene={scene} onSceneChange={setScene} width={800} height={400} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      <PositionsProbe scene={scene} />
    </div>
  );
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return (
    <div>
      <TldrawHost scene={scene} onSceneChange={setScene} width={800} height={400} />
      <PositionsProbe scene={scene} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measured helpers                                                     */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/**
 * The region's own fold control, in BOTH views — it lives in the corner
 * card's header expanded and in the card's header opaque, which is the same
 * slot (pyblocks `viewer/nodes/RegionInterface.tsx:80`). Scoped to
 * `[data-block-id="<region>"]` rather than the region root on purpose: a
 * nested region's arms carry their own `[data-slot="folding-chevron"]`, and
 * the region root contains them all.
 */
function chevronOf(root: ParentNode, regionId: string): HTMLElement {
  return required<HTMLElement>(
    root,
    `[data-region-id="${regionId}"] [data-block-id="${regionId}"] [data-slot="folding-chevron"]`,
    `region \`${regionId}\`'s fold chevron`,
  );
}

/** Where the HOST put the region, in screen px. The element every host
 *  positions is the one carrying `data-scene-node` — an absolutely placed
 *  div here, a `.react-flow__node`'s child there, a tldraw shape's
 *  `HTMLContainer` child in the third. Measured, never read off a style
 *  string, so a transform the host applies further up still counts. */
function hostBoxOf(root: ParentNode, nodeId: string): { left: number; top: number } {
  const rect = required<HTMLElement>(root, `[data-scene-node="${nodeId}"]`, `host element for \`${nodeId}\``).getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

function probeText(root: ParentNode): string {
  return required<HTMLElement>(root, '[data-slot="positions"]', "the positions probe").textContent ?? "";
}

function railPortIds(card: HTMLElement, edge: "left" | "right"): (string | null)[] {
  const rail = required<HTMLElement>(card, `[data-slot="block-port-rail"][data-edge="${edge}"]`, `the ${edge} rail`);
  return Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((dot) => dot.getAttribute("data-port-id"));
}

/**
 * The card's walls, exactly: the region's OWN interface first, then one
 * promoted port per hidden endpoint, each on the side `promoteBoundary`
 * decided (`merge/pose` is a sink → left; `smooth/out` is a source →
 * right). `toEqual` rather than a containment check — a promoted port
 * landing on the wrong wall, or a second copy of one, is exactly the kind
 * of failure a `querySelector` presence test cannot see.
 */
async function expectOpaqueCardPorts(root: ParentNode): Promise<void> {
  await waitFor(() => {
    const card = required<HTMLElement>(root, '[data-region-id="loop"] [data-block-id="loop"]', "the opaque card");
    expect(railPortIds(card, "left")).toEqual(["Iterable", "merge/pose"]);
    expect(railPortIds(card, "right")).toEqual(["Iter", "smooth/out"]);
  });
}

/* ------------------------------------------------------------------ */
/* The three hosts                                                      */
/* ------------------------------------------------------------------ */

export const DomCanvas: Story = {
  name: "Toggle (DOM Canvas)",
  render: () => <StatefulDomCanvas initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    const positionsBefore = probeText(canvasElement);
    const boxBefore = hostBoxOf(canvasElement, "loop");
    // Every cable the expanded document declares is painted and resolved —
    // the baseline the flip has to preserve for the four that survive it.
    for (const id of ["e-iterable", "e-iter", "e-seed", "e-ms", "e-out"]) {
      await expectWirePainted(canvasElement, id);
    }

    await userEvent.click(chevronOf(canvasElement, "loop"));

    await expectRegionOpaque(canvasElement, "loop");
    await expectOpaqueCardPorts(canvasElement);

    // The crossing cables survive with their ids and their OUTSIDE ends;
    // the interior one and the region's private `Iter` cable do not.
    await expectWirePainted(canvasElement, "e-seed");
    await expectWirePainted(canvasElement, "e-out");
    await expectWirePainted(canvasElement, "e-iterable");
    expect(canvasElement.querySelector('[data-wire-id="e-iter"]'), "the loop's private Iter cable is hidden, not re-pointed").toBeNull();
    expect(canvasElement.querySelector('[data-wire-id="e-ms"]'), "an interior cable is hidden").toBeNull();

    // The ruling, measured: one field changed, so nothing moved.
    expect(probeText(canvasElement), "no node's position changed").toBe(positionsBefore);
    expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore);

    await userEvent.click(chevronOf(canvasElement, "loop"));

    await expectRegionExpanded(canvasElement, "loop");
    for (const id of ["e-iterable", "e-iter", "e-seed", "e-ms", "e-out"]) {
      await expectWirePainted(canvasElement, id);
    }
    expect(probeText(canvasElement)).toBe(positionsBefore);
    expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore);
  },
};

export const ReactFlow: Story = {
  name: "Toggle (ReactFlow)",
  render: () => <StatefulReactFlow initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    const positionsBefore = probeText(canvasElement);
    const boxBefore = hostBoxOf(canvasElement, "loop");

    // The chevron carries `POINTER_OWNED_CLASS` ("nodrag"), which is the
    // only reason this click is a click: the region's drag handle IS the
    // corner card's header, and React Flow would otherwise claim the press
    // as the first pixels of a node drag.
    await userEvent.click(chevronOf(canvasElement, "loop"));

    await expectRegionOpaque(canvasElement, "loop");
    await expectOpaqueCardPorts(canvasElement);
    expect(probeText(canvasElement)).toBe(positionsBefore);
    await waitFor(() => {
      expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore);
    });

    await userEvent.click(chevronOf(canvasElement, "loop"));
    await expectRegionExpanded(canvasElement, "loop");
    expect(probeText(canvasElement)).toBe(positionsBefore);
  },
};

export const Tldraw: Story = {
  name: "Toggle (tldraw)",
  render: () => <StatefulTldraw initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    await expectRegionExpanded(canvasElement, "loop");
    const positionsBefore = probeText(canvasElement);
    const boxBefore = hostBoxOf(canvasElement, "loop");

    // tldraw's half of the same ownership marker: `contentOwnsPress` reads
    // `.nodrag` and calls `editor.markEventAsHandled`, so the canvas never
    // sees this pointerdown and the button gets its click.
    await userEvent.click(chevronOf(canvasElement, "loop"));

    await expectRegionOpaque(canvasElement, "loop");
    await expectOpaqueCardPorts(canvasElement);
    expect(probeText(canvasElement)).toBe(positionsBefore);
    await waitFor(() => {
      expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore);
    });

    await userEvent.click(chevronOf(canvasElement, "loop"));
    await expectRegionExpanded(canvasElement, "loop");
    expect(probeText(canvasElement)).toBe(positionsBefore);
  },
};

/* ------------------------------------------------------------------ */
/* Nesting — the outermost opaque region wins                            */
/* ------------------------------------------------------------------ */

export const NestedOpaque: Story = {
  name: "Nested (only the outermost card renders)",
  render: () => <StatefulDomCanvas initial={NESTED_SCENE} />,
  play: async ({ canvasElement }) => {
    await expectRegionOpaque(canvasElement, "loop");

    // Nothing under the opaque region reaches the DOM — not the nested
    // region's own card, not its arms, not their members.
    expect(canvasElement.querySelector('[data-region-id="br"]'), "the nested branch is inside a region that is not drawn").toBeNull();
    expect(canvasElement.querySelector("[data-arm-id]"), "no arm of a hidden branch renders").toBeNull();
    for (const id of ["est", "fb"]) {
      expect(canvasElement.querySelector(`[data-block-id="${id}"]`), `member \`${id}\` is hidden`).toBeNull();
    }

    // The footer's numbers are MEASURED off the scene by the same pure
    // function the card calls, not restated here as a literal.
    //
    // WHY `arms` reads 0 with two arms genuinely hidden: `hiddenSummary`'s
    // arm clause is the region's DIRECT arm children (controlFlow.ts, and
    // `armsOf(loopScene, "loop") === []` in controlFlow.test.ts:77, both
    // frozen for this lane). A loop has no arms of its own; the branch that
    // does is counted once, as one of the three blocks the loop hides
    // (`br` + `est` + `fb`). Asserting the summary as a whole rather than a
    // hard-coded sentence is what keeps this honest — the day the clause
    // goes transitive, this story reports the new truth instead of a stale
    // string.
    const summary = hiddenSummary(NESTED_SCENE, "loop");
    expect(summary).toEqual({ nodes: 3, arms: 0, edges: 2 });
    const footer = required<HTMLElement>(canvasElement, '[data-slot="region-hidden"]', "the what-is-hidden footer");
    expect(footer.textContent?.trim()).toBe(describeHidden(summary));

    // A cable into a block two levels down still lands on the outermost
    // card, at a port named for its own inner endpoint.
    const card = required<HTMLElement>(canvasElement, '[data-region-id="loop"] [data-block-id="loop"]', "the opaque card");
    expect(railPortIds(card, "left")).toEqual(["Iterable", "est/frame"]);
    expect(railPortIds(card, "right")).toEqual(["Iter", "fb/pose"]);

    await expectWirePainted(canvasElement, "e-in");
    await expectWirePainted(canvasElement, "e-out");
    expect(canvasElement.querySelector('[data-wire-id="e-int"]'), "an interior cable is hidden").toBeNull();
    expect(canvasElement.querySelector('[data-wire-id="e-iter"]'), "the region's private cable is hidden").toBeNull();
  },
};
