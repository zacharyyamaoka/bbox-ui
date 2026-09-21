/**
 * Blocks/Scene/Producer Count — "how many cables meet this port", fed from
 * the scene, on all three hosts.
 *
 * Zach, 2026-09-19, looking at three cables leaving one `pose` dot at three
 * stacked offsets and two entering another at two different points: "very
 * bad. edges should always leave from the center of the port… The port only
 * should have 1 connection point in the center. Instead you should show the
 * producer circle that has the number for the number of arrows intersecting
 * at that port." One centre attach point (lane `fix-edges`) plus this count
 * is the whole language for fan-in and fan-out.
 *
 * What these stories MEASURE, per host (DOM Canvas, React Flow, tldraw):
 *   1. The badge set on the whole canvas is EXACTLY the ports with 2+ cable
 *      ends — `merge/pose` reads "3" (fan-in: three producers, of three
 *      different edge kinds) and `merge/Pose` reads "2" (fan-out). Every
 *      other port has none: a port with ONE cable is wired and carries no
 *      number, an unwired port carries none either.
 *   2. Each badge rides ITS dot: circular, visible, and its centre no
 *      further from the dot's centre than dot radius + ring overhang + its
 *      own radius (the same reach `PortVariants.stories.tsx` measures).
 *   3. The count is LIVE: a story button writes a new edge into the scene
 *      and the badge text follows (3 → 4 → 5, and a duplicate from the same
 *      source makes that source read "2"); removing edges walks it back
 *      down, and at one cable the badge is gone while the dot stays wired.
 *
 * ACCEPTANCE — committed before the implementation, not to be weakened by it.
 */
import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { DomCanvas as DomCanvasHost } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { producerCounts } from "./producers";
import { isPortVariantId, PORT_VARIANTS, portVariantRingOverhangPx } from "../skin/portVariants";

const meta = {
  title: "Blocks/Scene/Producer Count",
  tags: ["area:blocks", "lane:prf-producers-count-2026-09-19"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

function source(id: string, y: number): HostScene["nodes"][number] {
  return { id, type: "block", position: { x: 16, y }, data: { name: id, view: "port", w: 96, h: 60, ports: { right: ["out"] } } };
}

/**
 * Zach's two screenshots as one bench: three producers into `merge/pose`
 * (fan-in) and `merge/Pose` feeding two consumers (fan-out). The three
 * fan-in cables are three different kinds — plain data, `delayed` (the z⁻¹
 * pill), `async` — because every kind is an arrow at the dot and every kind
 * counts. `d` starts unwired: it is where the live "add a cable" comes from.
 */
const FAN_SCENE: HostScene = {
  nodes: [
    source("a", 16),
    source("b", 108),
    source("c", 200),
    source("d", 292),
    {
      id: "merge",
      type: "block",
      position: { x: 280, y: 110 },
      data: { name: "merge", view: "port", w: 150, h: 96, ports: { left: ["pose", "gain"], right: ["Pose"] } },
    },
    { id: "sink", type: "block", position: { x: 540, y: 40 }, data: { name: "sink", view: "port", w: 104, h: 60, ports: { left: ["in"] } } },
    { id: "log", type: "block", position: { x: 540, y: 250 }, data: { name: "log", view: "port", w: 104, h: 60, ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "e-a", source: "a", sourceHandle: "out", target: "merge", targetHandle: "pose" },
    { id: "e-b", source: "b", sourceHandle: "out", target: "merge", targetHandle: "pose", data: { variant: "delayed" } },
    { id: "e-c", source: "c", sourceHandle: "out", target: "merge", targetHandle: "pose", data: { variant: "async" } },
    { id: "e-sink", source: "merge", sourceHandle: "Pose", target: "sink", targetHandle: "in" },
    { id: "e-log", source: "merge", sourceHandle: "Pose", target: "log", targetHandle: "in" },
  ],
};

/* ------------------------------------------------------------------ */
/* The bench — one scene, a host, and two buttons that edit the scene   */
/* ------------------------------------------------------------------ */

type HostKind = "dom" | "reactflow" | "tldraw";

/** Every edge into `merge/pose`, newest last — what "remove a cable" pops. */
function intoMergePose(scene: HostScene) {
  return scene.edges.filter((edge) => edge.target === "merge" && edge.targetHandle === "pose");
}

function Bench({ host }: { host: HostKind }) {
  const [scene, setScene] = useState(FAN_SCENE);
  const [minted, setMinted] = useState(0);
  const addCable = () => {
    const id = `e-d-${minted + 1}`;
    setMinted(minted + 1);
    setScene((current) => ({ ...current, edges: [...current.edges, { id, source: "d", sourceHandle: "out", target: "merge", targetHandle: "pose" }] }));
  };
  const removeCable = () => {
    setScene((current) => {
      const last = intoMergePose(current).at(-1);
      return last ? { ...current, edges: current.edges.filter((edge) => edge !== last) } : current;
    });
  };
  let canvas: ReactNode;
  if (host === "dom") canvas = <DomCanvasHost scene={scene} onSceneChange={setScene} width={680} height={380} />;
  else if (host === "reactflow")
    canvas = <ReactFlowHost scene={scene} onSceneChange={setScene} width={680} height={380} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
  else canvas = <TldrawHost scene={scene} onSceneChange={setScene} width={680} height={380} />;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
        <button type="button" data-slot="add-cable" onClick={addCable} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px" }}>
          add a cable d → merge/pose
        </button>
        <button type="button" data-slot="remove-cable" onClick={removeCable} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px" }}>
          remove the newest cable into merge/pose
        </button>
        <span data-slot="scene-counts">{JSON.stringify(Object.fromEntries(producerCounts(scene)))}</span>
      </div>
      {canvas}
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

function centre(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function dotOf(root: ParentNode, key: string): HTMLElement {
  const [nodeId, portId] = key.split("/");
  return required<HTMLElement>(root, `[data-block-id="${nodeId}"] [data-port-id="${portId}"] [data-slot="port-dot"]`, `${key}'s dot`);
}

/** `nodeId/portId` of the port a badge belongs to, read off the DOM it sits in. */
function keyOfBadge(badge: Element): string {
  const port = badge.closest("[data-port-id]");
  const block = badge.closest("[data-block-id]");
  return `${block?.getAttribute("data-block-id")}/${port?.getAttribute("data-port-id")}`;
}

/**
 * The whole badge set, exactly (1), and each badge's geometry (2). `expected`
 * lists ONLY the ports that must carry a number; every other port on the
 * canvas must carry none — that is the "one cable needs no number" half.
 */
async function expectBadges(root: HTMLElement, expected: Record<string, number>): Promise<void> {
  await waitFor(() => {
    const badges = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="port-producers"]'));
    const found = Object.fromEntries(badges.map((badge) => [keyOfBadge(badge), badge.textContent?.trim()]));
    expect(found).toEqual(Object.fromEntries(Object.entries(expected).map(([key, count]) => [key, String(count)])));
    expect(badges.length, "one badge per port, never two").toBe(Object.keys(expected).length);
  });
  for (const [key, count] of Object.entries(expected)) {
    const dot = dotOf(root, key);
    const badge = required<HTMLElement>(dot, '[data-slot="port-producers"]', `${key}'s badge`);
    expect(badge.getAttribute("data-count")).toBe(String(count));
    const style = getComputedStyle(badge);
    expect(style.display).not.toBe("none");
    expect(style.visibility).toBe("visible");
    expect(Number(style.opacity)).toBeGreaterThan(0.5);
    const rect = badge.getBoundingClientRect();
    expect(rect.width, `${key}'s badge has a painted size`).toBeGreaterThan(6);
    expect(Math.abs(rect.width - rect.height), `${key}'s badge is a circle`).toBeLessThanOrEqual(0.5);
    // Rides the dot: within dot radius + ring overhang + its own radius,
    // scaled by whatever zoom the host applies (dot's painted px over its
    // layout px — 1 at the benches' zoom 1, still right if that changes).
    const variantId = dot.getAttribute("data-bbox-port-variant");
    const variant = PORT_VARIANTS[isPortVariantId(variantId) ? variantId : "v1"];
    const scale = dot.getBoundingClientRect().width / dot.offsetWidth;
    const reach = (dot.offsetWidth / 2 + portVariantRingOverhangPx(variant)) * scale + rect.width / 2;
    const dotC = centre(dot);
    const badgeC = centre(badge);
    expect(Math.hypot(badgeC.x - dotC.x, badgeC.y - dotC.y), `${key}'s badge rides its dot`).toBeLessThanOrEqual(reach + 0.5);
    expect(Math.hypot(badgeC.x - dotC.x, badgeC.y - dotC.y), `${key}'s badge is beside the dot, not hiding it`).toBeGreaterThan(rect.width / 4);
  }
}

/** A port with exactly one cable is WIRED and carries no number. */
function expectWiredWithoutBadge(root: HTMLElement, key: string): void {
  const dot = dotOf(root, key);
  expect(dot.getAttribute("data-state"), `${key} is wired`).toBe("wired");
  expect(dot.querySelector('[data-slot="port-producers"]'), `${key} has one cable — no number`).toBeNull();
}

function sceneCounts(root: HTMLElement): Record<string, number> {
  return JSON.parse(required<HTMLElement>(root, '[data-slot="scene-counts"]', "the scene-counts probe").textContent ?? "{}");
}

async function playFanIn(canvasElement: HTMLElement): Promise<void> {
  // 1 + 2 — at rest.
  await expectBadges(canvasElement, { "merge/pose": 3, "merge/Pose": 2 });
  for (const key of ["a/out", "b/out", "c/out", "sink/in", "log/in"]) expectWiredWithoutBadge(canvasElement, key);
  expect(dotOf(canvasElement, "merge/gain").getAttribute("data-state")).not.toBe("wired");
  expect(dotOf(canvasElement, "d/out").getAttribute("data-state")).not.toBe("wired");
  // The number painted is the scene's number, not a fixture literal twice.
  expect(sceneCounts(canvasElement)["merge/pose"]).toBe(3);

  // 3 — live. Add one cable from d: fan-in 4, d's own single end has none.
  await userEvent.click(required<HTMLElement>(canvasElement, '[data-slot="add-cable"]', "the add-cable button"));
  await expectBadges(canvasElement, { "merge/pose": 4, "merge/Pose": 2 });
  expectWiredWithoutBadge(canvasElement, "d/out");

  // A duplicate from the same source: now d/out itself has two cable ends.
  await userEvent.click(required<HTMLElement>(canvasElement, '[data-slot="add-cable"]', "the add-cable button"));
  await expectBadges(canvasElement, { "merge/pose": 5, "merge/Pose": 2, "d/out": 2 });

  // Walk it back down: 5 → 4 → 3 → 2 …
  const remove = () => userEvent.click(required<HTMLElement>(canvasElement, '[data-slot="remove-cable"]', "the remove-cable button"));
  await remove();
  await expectBadges(canvasElement, { "merge/pose": 4, "merge/Pose": 2 });
  await remove();
  await remove();
  await expectBadges(canvasElement, { "merge/pose": 2, "merge/Pose": 2 });
  // … → 1: the number disappears, the dot stays wired.
  await remove();
  await expectBadges(canvasElement, { "merge/Pose": 2 });
  expectWiredWithoutBadge(canvasElement, "merge/pose");
  expect(sceneCounts(canvasElement)["merge/pose"]).toBe(1);
}

/* ------------------------------------------------------------------ */
/* The three hosts                                                      */
/* ------------------------------------------------------------------ */

export const DomCanvas: Story = {
  name: "Fan-in 3 (DOM Canvas)",
  render: () => <Bench host="dom" />,
  play: async ({ canvasElement }) => playFanIn(canvasElement),
};

export const ReactFlow: Story = {
  name: "Fan-in 3 (ReactFlow)",
  render: () => <Bench host="reactflow" />,
  play: async ({ canvasElement }) => playFanIn(canvasElement),
};

export const Tldraw: Story = {
  name: "Fan-in 3 (tldraw)",
  render: () => <Bench host="tldraw" />,
  play: async ({ canvasElement }) => playFanIn(canvasElement),
};

/* ------------------------------------------------------------------ */
/* The opaque card — a promoted seat counts what the projection lands   */
/* ------------------------------------------------------------------ */

/**
 * Two cables from outside into `merge/pose`, a member of a loop that starts
 * OPAQUE. The card's promoted seat `merge/pose` is where the projection
 * re-points both of them, so it reads "2"; expanding the loop moves both
 * cables back onto the real `merge/pose` dot, and the "2" moves with them.
 * The count is of the cables PAINTED at a dot — the host computes it off the
 * same projection it paints.
 */
const OPAQUE_SCENE: HostScene = {
  nodes: [
    // 120 tall, not the 84 `ControlFlowToggle`'s `src` uses: at 84 its second
    // dot (`others`) hangs below the card in a capture — two port-view slots
    // need the taller body.
    { id: "src", type: "block", position: { x: 16, y: 40 }, data: { name: "src", view: "port", w: 108, h: 120, ports: { right: ["pose", "others"] } } },
    { id: "prior", type: "block", position: { x: 16, y: 210 }, data: { name: "prior", view: "port", w: 108, h: 60, ports: { right: ["out"] } } },
    {
      id: "loop",
      type: "region",
      position: { x: 200, y: 24 },
      // 330 tall so the expanded frame holds `merge` whole (at 268 it hangs
      // out of the frame's bottom edge once the loop is opened).
      data: { name: "For Loop", region: { kind: "loop", loop: "for", view: "opaque" }, ports: { left: ["Iterable"], right: ["Iter"] }, w: 400, h: 330 },
    },
    { id: "merge", type: "block", parentId: "loop", position: { x: 36, y: 86 }, data: { name: "merge", view: "port", w: 156, h: 106, ports: { left: ["pose", "other"], right: ["Pose"] } } },
  ],
  edges: [
    { id: "e-iterable", source: "src", sourceHandle: "others", target: "loop", targetHandle: "Iterable" },
    { id: "e-seed", source: "src", sourceHandle: "pose", target: "merge", targetHandle: "pose" },
    { id: "e-prior", source: "prior", sourceHandle: "out", target: "merge", targetHandle: "pose", data: { variant: "delayed" } },
  ],
};

function StatefulOpaque() {
  const [scene, setScene] = useState(OPAQUE_SCENE);
  return <DomCanvasHost scene={scene} onSceneChange={setScene} width={680} height={380} />;
}

/** Every badge as `blockId/portId → text`, split at the FIRST `/` so a
 *  promoted id (`merge/pose`) stays whole. */
function badgeTexts(root: ParentNode): Record<string, string | undefined> {
  return Object.fromEntries(Array.from(root.querySelectorAll('[data-slot="port-producers"]')).map((badge) => [keyOfBadge(badge), badge.textContent?.trim()]));
}

export const OpaqueCard: Story = {
  name: "Opaque card — a promoted seat counts its re-pointed cables",
  render: () => <StatefulOpaque />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(badgeTexts(canvasElement)).toEqual({ "loop/merge/pose": "2" }));
    const seat = required<HTMLElement>(canvasElement, '[data-block-id="loop"] [data-port-id="merge/pose"] [data-slot="port-dot"]', "the card's merge/pose seat");
    const badge = required<HTMLElement>(seat, '[data-slot="port-producers"]', "the seat's badge");
    const d = Math.hypot(centre(badge).x - centre(seat).x, centre(badge).y - centre(seat).y);
    const reach = seat.offsetWidth / 2 + portVariantRingOverhangPx(PORT_VARIANTS.v1) + badge.getBoundingClientRect().width / 2;
    expect(d, "the badge rides the promoted seat").toBeLessThanOrEqual(reach + 0.5);

    // Expand: the same two cables land on the real dot, and the count follows.
    await userEvent.click(required<HTMLElement>(canvasElement, '[data-region-id="loop"] [data-block-id="loop"] [data-slot="folding-chevron"]', "the loop's chevron"));
    await waitFor(() => expect(badgeTexts(canvasElement)).toEqual({ "merge/pose": "2" }));
    expect(canvasElement.querySelector('[data-port-id="merge/pose"]'), "the promoted seat is gone with the card").toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* At rest — the three hosts side by side, for review (no play)         */
/* ------------------------------------------------------------------ */

export const AtRest: Story = {
  name: "At rest — all three hosts",
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      {(["dom", "reactflow", "tldraw"] as const).map((host) => (
        <section key={host} data-slot="bench" data-host-kind={host}>
          <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 4px" }}>{host === "dom" ? "DOM Canvas" : host === "reactflow" ? "React Flow" : "tldraw"}</h3>
          <Bench host={host} />
        </section>
      ))}
    </div>
  ),
};
