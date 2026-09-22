/**
 * Components/Blocks/BlockRegion/Toggle — the Blackbox toggle (Expanded ⇄
 * Expanded Opaque) and the P/E selector (Port ⇄ Expanded), on all three
 * hosts (docs/CONTROL-FLOW-PLAN.md lane E, §2.B and §3.4).
 *
 * Zach, 2026-09-22: "Please do not put chevron drop downs on the regions."
 * and "the blackbox toggle goes in the right corner. your chevron was in the
 * left next to the title, they are completely different operations as
 * well... chevron folds, blackbox makes opaque without folding." So there is
 * no region chevron anywhere here: the toggle at the frame's top-right hides
 * the inside at the SAME size, and folding the region down to a block is the
 * P/E selector's Port — a dropdown in the story, the pattern
 * `BlockRegionViews.stories.tsx` set (the app's floating toolbar is not this
 * file's job).
 *
 * The claim these stories exist to make is not "a face appears". It is
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
 *   • the Expanded Opaque face is the expanded frame's own box, ±1px, and
 *     the promoted ports sit ON its walls;
 *   • every crossing cable keeps its id and its OUTSIDE end: `e-seed` still
 *     starts at `src/pose` and `e-out` still ends at `enc/pose`; only the
 *     hidden end moved, onto the face's promoted port;
 *   • the loop's private `Iter` cable (`e-iter`, a `port-inner` edge) is
 *     GONE rather than re-pointed — a region's own interior wiring is not a
 *     value arriving from outside, and drawing it on the face would be
 *     exactly the "data and control mixed" failure the language forbids;
 *   • clicking again restores the frame with every wire resolved, off the
 *     same untouched document;
 *   • a press-drag that STARTS on the toggle never moves the region — the
 *     toggle owns its press on every canvas, the way the chevron did.
 *
 * "Everything is a block" is what makes the face work at all: the opaque
 * face is a `BlockPort id="loop"` with more ports on it. `merge/pose`
 * resolves through the identical `[data-block-id]` → `[data-port-id]` walk
 * as any other port, which is why `WireLayer`, React Flow's handles and
 * tldraw's anchors needed no region-specific code for the projected edges.
 */
import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { DomCanvas as DomCanvasHost } from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { regionPresentationOf, setRegionPresentation, type RegionPresentation } from "../hosts/regionScene";
import { TldrawHost } from "../hosts/tldrawHost";
import { ARM_NODE_TYPE, describeHidden, hiddenSummary } from "../scene/controlFlow";
import { REGION_NODE_TYPE } from "../scene/region";
import { expectRegionExpanded, expectRegionOpaque, expectWirePainted } from "./blockRegion.acceptance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const meta = {
  title: "Components/Blocks/BlockRegion/Toggle",
  tags: ["object:region", "host:dom", "host:react-flow", "host:tldraw", "lane:region-host-toggle"],
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

const PRESENTATION_ITEMS: Record<RegionPresentation, string> = { port: "Port", expanded: "Expanded" };

/**
 * The P/E selector for the loop. Regions have no Simple (Zach, 2026-09-22:
 * "regions do not have a simple view. they just have port, expanded and
 * expanded opaque view"), so it offers two. A stock `Select` in the story's
 * own canvas, where Zach looks — not a Storybook args control — writing the
 * scene through `setRegionPresentation`, the same write the app's toolbar
 * will make.
 */
function PresentationSelect({ scene, onSceneChange }: { scene: HostScene; onSceneChange(next: HostScene): void }) {
  const loop = scene.nodes.find((node) => node.id === "loop");
  const value = loop ? regionPresentationOf(loop) : "expanded";
  return (
    <Select
      value={value}
      items={PRESENTATION_ITEMS}
      onValueChange={(next) => (next === "port" || next === "expanded") && onSceneChange(setRegionPresentation(scene, "loop", next))}
    >
      <SelectTrigger aria-label="Region view" style={{ width: 160 }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRESENTATION_ITEMS) as RegionPresentation[]).map((key) => (
          <SelectItem key={key} value={key}>
            {PRESENTATION_ITEMS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Bench({ initial, host }: { initial: HostScene; host: (scene: HostScene, onSceneChange: (next: HostScene) => void) => ReactNode }) {
  const [scene, setScene] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {host(scene, setScene)}
      {/* WHY under the canvas, not above it: above, the Select's list opens
          down INTO the canvas, and tldraw's own page menu paints over it —
          measured 2026-09-22, the "Port" option was covered and a real click
          landed on tldraw's "Page 1" instead. */}
      <PresentationSelect scene={scene} onSceneChange={setScene} />
      <PositionsProbe scene={scene} />
    </div>
  );
}

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  return <Bench initial={initial} host={(scene, onSceneChange) => <DomCanvasHost scene={scene} onSceneChange={onSceneChange} width={800} height={368} />} />;
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  return (
    <Bench
      initial={initial}
      host={(scene, onSceneChange) => (
        <ReactFlowHost scene={scene} onSceneChange={onSceneChange} width={800} height={400} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
      )}
    />
  );
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  return <Bench initial={initial} host={(scene, onSceneChange) => <TldrawHost scene={scene} onSceneChange={onSceneChange} width={800} height={400} />} />;
}

/* ------------------------------------------------------------------ */
/* Measured helpers                                                     */
/* ------------------------------------------------------------------ */

const TOLERANCE_PX = 2;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function regionOf(root: ParentNode, regionId: string): HTMLElement {
  return required<HTMLElement>(root, `[data-slot="region"][data-region-id="${regionId}"]`, `region \`${regionId}\``);
}

function toggleOf(root: ParentNode, regionId: string): HTMLElement {
  return required<HTMLElement>(regionOf(root, regionId), '[aria-label="Blackbox toggle"]', `region \`${regionId}\`'s Blackbox toggle`);
}

/**
 * No REGION-level chevron: the corner card carries none, and every chevron
 * left under the region folds something else — an arm row
 * (`region-arm-header`) or a member's own body (inside a member block). The
 * arms' chevrons stay by Zach's own distinction ("chevron folds").
 */
function expectNoRegionChevron(root: ParentNode, regionId: string): void {
  const region = regionOf(root, regionId);
  expect(region.querySelectorAll('[data-slot="region-corner"] [data-slot="folding-chevron"]'), "a chevron on the corner card").toHaveLength(0);
  for (const chevron of Array.from(region.querySelectorAll<HTMLElement>('[data-slot="folding-chevron"]'))) {
    const foldsAnArm = chevron.closest('[data-slot="region-arm-header"]') !== null;
    const owner = chevron.closest("[data-block-id]")?.getAttribute("data-block-id");
    expect(foldsAnArm || (owner !== null && owner !== undefined && owner !== regionId), "a chevron that folds the region itself").toBe(true);
  }
}

/** The toggle sits INSIDE `box`'s top-right corner: within its right and top
 *  edges, and no further than 12px from either. */
function expectToggleInTopRight(toggle: HTMLElement, box: HTMLElement): void {
  const t = toggle.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  expect(t.width, "the toggle is drawn").toBeGreaterThan(0);
  expect(t.right, "toggle's right edge inside the frame").toBeLessThanOrEqual(b.right + TOLERANCE_PX);
  expect(t.top, "toggle's top edge inside the frame").toBeGreaterThanOrEqual(b.top - TOLERANCE_PX);
  expect(b.right - t.right, "toggle hugs the right wall").toBeLessThanOrEqual(12);
  expect(t.top - b.top, "toggle hugs the top wall").toBeLessThanOrEqual(12);
  // And it is the RIGHT corner, not the left one the chevron used to sit in.
  expect(t.left, "toggle is on the right half").toBeGreaterThan(b.left + b.width / 2);
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
 * of failure a `querySelector` presence test cannot see. Holds for the
 * Expanded Opaque face and the Port card alike.
 */
async function expectOpaqueCardPorts(root: ParentNode): Promise<void> {
  await waitFor(() => {
    const card = required<HTMLElement>(root, '[data-region-id="loop"] [data-block-id="loop"]', "the opaque card");
    expect(railPortIds(card, "left")).toEqual(["Iterable", "merge/pose"]);
    expect(railPortIds(card, "right")).toEqual(["Iter", "smooth/out"]);
  });
}

/** Each port's dot centre sits ON its wall of `box` — the promoted seats
 *  hug the frame they cross, not the inside of it. */
function expectDotsOnWalls(root: ParentNode, box: HTMLElement, walls: Record<"left" | "right", string[]>): void {
  const b = box.getBoundingClientRect();
  for (const [wall, ids] of Object.entries(walls) as ["left" | "right", string[]][]) {
    for (const id of ids) {
      const dot = required<HTMLElement>(root, `[data-region-id="loop"] [data-block-id="loop"] [data-port-id="${id}"] [data-slot="port-dot"]`, `${id}'s dot`).getBoundingClientRect();
      const centreX = dot.left + dot.width / 2;
      const wallX = wall === "left" ? b.left : b.right;
      expect(Math.abs(centreX - wallX), `${id}'s dot sits on the ${wall} wall`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(dot.top >= b.top && dot.bottom <= b.bottom, `${id}'s dot is within the wall's span`).toBe(true);
    }
  }
}

function expectMembersHidden(root: ParentNode): void {
  expect(regionOf(root, "loop").querySelectorAll("[data-member-id]"), "members hidden").toHaveLength(0);
  for (const id of ["merge", "smooth"]) {
    expect(root.querySelector(`[data-block-id="${id}"]`), `member \`${id}\` is hidden`).toBeNull();
  }
}

async function chooseRegionView(canvasElement: HTMLElement, label: string): Promise<void> {
  const trigger = await within(canvasElement).findByRole("combobox", { name: "Region view" });
  await userEvent.click(trigger);
  await userEvent.click(await within(document.body).findByRole("option", { name: label }));
  await waitFor(() => expect(trigger.textContent).toContain(label));
}

/**
 * A press that STARTS on the toggle and travels 60×40px must move nothing:
 * not the host's box, not the scene record, and it must not flip the view
 * either. `dragFrom` fires the pointer AND mouse families in the browser's
 * order, so React Flow's d3-drag and tldraw's state chart both really see
 * the press and have to be kept out of it — a pointer-only drag would make
 * this vacuous.
 */
async function expectToggleDragMovesNothing(canvasElement: HTMLElement): Promise<void> {
  const view = regionOf(canvasElement, "loop").getAttribute("data-region-view");
  const positions = probeText(canvasElement);
  const box = hostBoxOf(canvasElement, "loop");
  const toggle = toggleOf(canvasElement, "loop");
  const t = toggle.getBoundingClientRect();
  await dragFrom(toggle, { x: t.left + t.width / 2 + 60, y: t.top + t.height / 2 + 40 });
  expect(probeText(canvasElement), "a drag from the toggle wrote no position").toBe(positions);
  expect(hostBoxOf(canvasElement, "loop"), "a drag from the toggle moved the region").toEqual(box);
  expect(regionOf(canvasElement, "loop").getAttribute("data-region-view")).toBe(view);
}

/**
 * The positive control that keeps `expectToggleDragMovesNothing` honest: the
 * SAME drag from a point on the face that is NOT the toggle does move the
 * region, so the host was able to drag right there and it was the toggle's
 * ownership that stopped it. Only on the two canvases — the DOM host has no
 * node drag at all (`domCanvas.tsx`'s deliberate incapability).
 */
async function expectFaceDragMovesRegion(canvasElement: HTMLElement): Promise<void> {
  const face = required<HTMLElement>(canvasElement, '[data-region-id="loop"] [data-slot="region-opaque-face"]', "the opaque face");
  const toggle = toggleOf(canvasElement, "loop").getBoundingClientRect();
  const f = face.getBoundingClientRect();
  // Just left of the toggle, on the same row: the face, and nothing else.
  const pressAt = { x: toggle.left - 24, y: toggle.top + toggle.height / 2 };
  expect(pressAt.x).toBeGreaterThan(f.left + f.width / 2);
  const before = hostBoxOf(canvasElement, "loop");
  await dragFrom(face, { x: pressAt.x + 60, y: pressAt.y + 40 }, { pressAt });
  // ±10px, `SceneHosts.stories.tsx`'s own tolerance for the same `dragFrom`
  // node drag: the host may eat the threshold step. The claim is "it moved
  // by roughly the drag", which a 0px result cannot pass.
  await waitFor(() => {
    const after = hostBoxOf(canvasElement, "loop");
    expect(Math.abs(after.left - before.left - 60), "the face drags the region").toBeLessThanOrEqual(10);
    expect(Math.abs(after.top - before.top - 40), "the face drags the region").toBeLessThanOrEqual(10);
  });
}

/**
 * The whole ruling, on one host: no chevron; the toggle in the frame's
 * top-right; a real click to Expanded Opaque at the same size with the
 * members hidden and the promoted ports on the walls; the projection's
 * cables and the untouched document; a click back; a drag from the toggle
 * that moves nothing; and the P/E selector to Port and back.
 */
async function playToggle(canvasElement: HTMLElement, options: { hostDrags: boolean; checkAllWires: boolean }): Promise<void> {
  await expectRegionExpanded(canvasElement, "loop");
  expectNoRegionChevron(canvasElement, "loop");
  const positionsBefore = probeText(canvasElement);
  const boxBefore = hostBoxOf(canvasElement, "loop");
  const frame = required<HTMLElement>(regionOf(canvasElement, "loop"), '[data-slot="region-frame"]', "the frame");
  const frameBefore = frame.getBoundingClientRect();
  expectToggleInTopRight(toggleOf(canvasElement, "loop"), frame);
  expect(toggleOf(canvasElement, "loop").getAttribute("aria-pressed")).toBe("false");
  if (options.checkAllWires) {
    // Every cable the expanded document declares is painted and resolved —
    // the baseline the flip has to preserve for the four that survive it.
    for (const id of ["e-iterable", "e-iter", "e-seed", "e-ms", "e-out"]) {
      await expectWirePainted(canvasElement, id);
    }
  }

  // Expanded → Expanded Opaque, by a real click on the toggle.
  await userEvent.click(toggleOf(canvasElement, "loop"));

  await expectRegionOpaque(canvasElement, "loop");
  await expectOpaqueCardPorts(canvasElement);
  expectNoRegionChevron(canvasElement, "loop");
  expectMembersHidden(canvasElement);
  const face = required<HTMLElement>(canvasElement, '[data-region-id="loop"] [data-slot="region-opaque-face"] [data-slot="block"]', "the opaque face");
  const faceRect = face.getBoundingClientRect();
  expect(Math.abs(faceRect.width - frameBefore.width), "Expanded Opaque keeps the frame's width").toBeLessThanOrEqual(1);
  expect(Math.abs(faceRect.height - frameBefore.height), "Expanded Opaque keeps the frame's height").toBeLessThanOrEqual(1);
  expect(Math.abs(faceRect.left - frameBefore.left), "…and its place").toBeLessThanOrEqual(1);
  expect(Math.abs(faceRect.top - frameBefore.top), "…and its place").toBeLessThanOrEqual(1);
  expectDotsOnWalls(canvasElement, face, { left: ["Iterable", "merge/pose"], right: ["Iter", "smooth/out"] });
  expectToggleInTopRight(toggleOf(canvasElement, "loop"), face);
  expect(toggleOf(canvasElement, "loop").getAttribute("aria-pressed")).toBe("true");

  // The crossing cables survive with their ids and their OUTSIDE ends; the
  // interior one and the region's private `Iter` cable do not.
  if (options.checkAllWires) {
    await expectWirePainted(canvasElement, "e-seed");
    await expectWirePainted(canvasElement, "e-out");
    await expectWirePainted(canvasElement, "e-iterable");
    expect(canvasElement.querySelector('[data-wire-id="e-iter"]'), "the loop's private Iter cable is hidden, not re-pointed").toBeNull();
    expect(canvasElement.querySelector('[data-wire-id="e-ms"]'), "an interior cable is hidden").toBeNull();
  }

  // The ruling, measured: one field changed, so nothing moved.
  expect(probeText(canvasElement), "no node's position changed").toBe(positionsBefore);
  await waitFor(() => expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore));

  // A drag that starts on the pressed toggle moves nothing.
  await expectToggleDragMovesNothing(canvasElement);

  // Expanded Opaque → Expanded, by the same toggle.
  await userEvent.click(toggleOf(canvasElement, "loop"));
  await expectRegionExpanded(canvasElement, "loop");
  expectNoRegionChevron(canvasElement, "loop");
  if (options.checkAllWires) {
    for (const id of ["e-iterable", "e-iter", "e-seed", "e-ms", "e-out"]) {
      await expectWirePainted(canvasElement, id);
    }
  }
  expect(probeText(canvasElement)).toBe(positionsBefore);
  await waitFor(() => expect(hostBoxOf(canvasElement, "loop")).toEqual(boxBefore));
  await expectToggleDragMovesNothing(canvasElement);

  // P/E: Port is the region collapsed to a block — no frame, no toggle, no
  // members, the same walls as the opaque face. And back.
  await chooseRegionView(canvasElement, "Port");
  await waitFor(() => expect(regionOf(canvasElement, "loop").getAttribute("data-region-view")).toBe("port"));
  const port = regionOf(canvasElement, "loop");
  expect(port.querySelector('[data-slot="region-frame"]'), "no frame in Port").toBeNull();
  expect(port.querySelector('[data-slot="region-opaque-face"]'), "no opaque face in Port").toBeNull();
  expect(port.querySelector('[aria-label="Blackbox toggle"]'), "no Blackbox toggle in Port").toBeNull();
  expectNoRegionChevron(canvasElement, "loop");
  expectMembersHidden(canvasElement);
  await expectOpaqueCardPorts(canvasElement);
  const card = required<HTMLElement>(port, '[data-block-id="loop"] [data-slot="block"]', "the port card").getBoundingClientRect();
  expect(card.width, "Port is a block, smaller than the frame").toBeLessThan(frameBefore.width);
  if (options.checkAllWires) {
    await expectWirePainted(canvasElement, "e-seed");
    await expectWirePainted(canvasElement, "e-out");
  }
  expect(probeText(canvasElement), "Port writes no position").toBe(positionsBefore);

  await chooseRegionView(canvasElement, "Expanded");
  await expectRegionExpanded(canvasElement, "loop");
  expect(toggleOf(canvasElement, "loop").getAttribute("aria-pressed"), "back to what the toggle last said").toBe("false");
  expect(probeText(canvasElement)).toBe(positionsBefore);

  // Last, because it moves the region: the positive control for the drag
  // checks above, on the opaque face.
  if (options.hostDrags) {
    await userEvent.click(toggleOf(canvasElement, "loop"));
    await expectRegionOpaque(canvasElement, "loop");
    await expectFaceDragMovesRegion(canvasElement);
  }
}

/* ------------------------------------------------------------------ */
/* The three hosts                                                      */
/* ------------------------------------------------------------------ */

export const DomCanvas: Story = {
  name: "Toggle (DOM Canvas)",
  render: () => <StatefulDomCanvas initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    // The DOM host has no node drag at all, so its drag check proves only
    // that nothing here invents one; the canvases below carry the control.
    await playToggle(canvasElement, { hostDrags: false, checkAllWires: true });
  },
};

export const ReactFlow: Story = {
  name: "Toggle (ReactFlow)",
  render: () => <StatefulReactFlow initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    // The toggle carries `POINTER_OWNED_CLASS` ("nodrag"), which is the only
    // reason a press on it is a click on the opaque face: that face IS the
    // region's drag handle there (`reactFlowHost.tsx`'s `ownHeaderOf`), and
    // React Flow would otherwise claim the press as the first pixels of a
    // node drag.
    await playToggle(canvasElement, { hostDrags: true, checkAllWires: false });
  },
};

export const Tldraw: Story = {
  name: "Toggle (tldraw)",
  render: () => <StatefulTldraw initial={TOGGLE_SCENE} />,
  play: async ({ canvasElement }) => {
    // tldraw's half of the same ownership marker: `contentOwnsPress` reads
    // `.nodrag` and calls `editor.markEventAsHandled`, so the canvas never
    // sees this pointerdown and the button gets its click.
    await playToggle(canvasElement, { hostDrags: true, checkAllWires: false });
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
