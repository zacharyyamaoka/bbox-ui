import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import {
  expectWireAvoids,
  expectWireBadge,
  expectWirePainted,
} from "./controlFlow.acceptance";

/**
 * Control Flow/Wires — lane D of docs/CONTROL-FLOW-PLAN.md, on plain blocks.
 *
 * Zach's rule, verbatim: "data cables that aren't flowing through the branch
 * should actively avoid the branch — bypass by going above or below it." The
 * keep-out rule that implements it is deliberately GENERIC — it subtracts a
 * wire's own two endpoints and its `through` containers from every measured
 * box and hands the rest to the router — so none of these fixtures needs a
 * Region to prove it. A region frame, an arm row and a block card are the
 * same thing to `keepOutsFor`: an id and a rect. Proving it on blocks is
 * what makes that claim honest rather than a coincidence of lane A landing.
 *
 * "Everything is a block" shows up here as the absence of a special case;
 * "never mix data and control lines" shows up as what a bypass MEANS — the
 * cable does not enter the branch, so there is no line to mistake for
 * control flow, and the carried value stays a data cable that is merely
 * delayed (dotted + a z⁻¹ pill), never a "loop back" wire.
 */

const ELBOW = { routing: "elbow" } as const;

function hostOf(canvasElement: HTMLElement): HTMLElement {
  const host = canvasElement.querySelector<HTMLElement>('[data-host="dom-canvas"]');
  if (!host) throw new Error('expected the DOM Canvas host (`[data-host="dom-canvas"]`)');
  return host;
}

/**
 * The bypass claim, measured on the line that is actually PAINTED.
 *
 * WHY this sits beside `expectWireAvoids` rather than replacing it: the
 * acceptance helper is off-limits and IS called, unchanged, on every story
 * below. But its selector is `[data-wire-id] path` and `querySelector`
 * takes the first match in document order — which is the arrowhead marker's
 * own `data-slot="trace-marker-head"`, because `TraceBody` renders `<defs>`
 * before the line (`trace.tsx`). Measured here, 2026-09-18, on
 * `BypassAroundABlock`'s own fixture: the selector resolves to
 * `trace-marker-head`, `getTotalLength()` is 17.89 (the 10x10 chevron, not
 * a 500px route), and its five sampled screen points are
 * `1,1 · 4.6,2.8 · 8.2,4.6 · 6.3,6.4 · 2.7,8.2` — the marker's own user
 * space, which the layer's root CTM maps straight onto the container's
 * top-left corner. `bystander` is at `220,60 340,220`, so "zero points
 * inside" is true of a triangle that was never on the route. The helper
 * therefore passes without looking at the cable, and would FAIL a correct
 * route if an obstacle ever covered the layer's own origin.
 *
 * This one selects `path[data-slot="trace-line"]` — the real, mounted,
 * routed line — so the bypass below is proved rather than assumed. The fix
 * belongs in `controlFlow.acceptance.ts`, which this lane may not edit; it
 * is one selector (`path[data-slot="trace-line"]`) and it is reported.
 */
function expectRoutedLineAvoids(root: ParentNode, wireId: string, obstacleSelector: string): void {
  const obstacle = root.querySelector<HTMLElement>(obstacleSelector);
  if (!obstacle) throw new Error(`expected obstacle \`${obstacleSelector}\``);
  const line = root.querySelector<SVGPathElement>(
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
  );
  if (!line) throw new Error(`expected wire \`${wireId}\`'s painted line`);
  const ctm = line.getScreenCTM();
  if (!ctm) throw new Error(`wire \`${wireId}\`'s line is not rendered — no screen CTM`);
  const box = obstacle.getBoundingClientRect();
  const total = line.getTotalLength();
  const inside: { x: number; y: number }[] = [];
  for (let d = 0; d <= total; d += 4) {
    const local = line.getPointAtLength(d);
    const p = new DOMPoint(local.x, local.y).matrixTransform(ctm);
    if (p.x > box.left + 1 && p.x < box.right - 1 && p.y > box.top + 1 && p.y < box.bottom - 1) inside.push(p);
  }
  expect(inside, `wire ${wireId}'s PAINTED line enters ${obstacleSelector} at ${inside.length} sampled points`).toHaveLength(0);
}

/** The route left the straight chord — otherwise "avoids" could be true for
 *  a wire that was never in the box's way to begin with. */
function expectDetour(root: ParentNode, wireId: string, obstacleSelector: string): void {
  const obstacle = root.querySelector<HTMLElement>(obstacleSelector);
  if (!obstacle) throw new Error(`expected obstacle \`${obstacleSelector}\``);
  const line = root.querySelector<SVGPathElement>(
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
  );
  if (!line) throw new Error(`expected wire \`${wireId}\`'s painted line`);
  const ctm = line.getScreenCTM()!;
  const box = obstacle.getBoundingClientRect();
  let clears = false;
  const total = line.getTotalLength();
  for (let d = 0; d <= total; d += 4) {
    const local = line.getPointAtLength(d);
    const p = new DOMPoint(local.x, local.y).matrixTransform(ctm);
    if (p.x > box.left && p.x < box.right && (p.y <= box.top || p.y >= box.bottom)) clears = true;
  }
  expect(clears, `wire ${wireId} never passes above or below ${obstacleSelector} — it is not bypassing anything`).toBe(true);
}

const meta = {
  title: "Presets/ControlFlow/Wires",
  tags: ["object:region", "host:dom", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ==================================================================== */
/* BypassAroundABlock                                                    */
/* ==================================================================== */

/**
 * `bystander` sits squarely on the chord between `src/out` and `enc/in`,
 * at the same centre height, so a cable that ignored it would run straight
 * through the card. It is not an endpoint and it is not in `through`, so it
 * is a keep-out and the route goes over or under it.
 */
const bypassScene: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 0, y: 110 }, data: { name: "src", view: "port", w: 120, h: 70, ports: { right: ["out"] } } },
    { id: "bystander", type: "block", position: { x: 220, y: 60 }, data: { name: "bystander", view: "port", w: 120, h: 160 } },
    { id: "enc", type: "block", position: { x: 520, y: 110 }, data: { name: "enc", view: "port", w: 120, h: 70, ports: { left: ["in"] } } },
  ],
  edges: [{ id: "e", source: "src", sourceHandle: "out", target: "enc", targetHandle: "in", data: ELBOW }],
};

export const BypassAroundABlock: Story = {
  name: "a cable that does not flow through a block routes around it",
  render: () => <DomCanvas scene={bypassScene} width={700} height={330} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await expectWirePainted(root, "e");
    await expectWireAvoids(root, "e", '[data-block-id="bystander"]');
    expectRoutedLineAvoids(root, "e", '[data-block-id="bystander"]');
    expectDetour(root, "e", '[data-block-id="bystander"]');
  },
};

/* ==================================================================== */
/* CarriedValueSelfLoop                                                  */
/* ==================================================================== */

/**
 * The carried value (plan B, "never mix data and control lines"): a loop's
 * state travels on an ordinary DATA cable that is merely delayed, from the
 * block's own `Pose` back into its own `pose`. There is no control wire
 * anywhere in the picture, and the pill says what the dots cannot — that
 * the value is one turn old.
 *
 * No badge is authored on the edge. `sceneWires` derives `z⁻¹` from
 * `variant: "delayed"` (plan Q7, "always draw the pill"), which is the
 * whole point of this fixture.
 */
const selfLoopScene: HostScene = {
  nodes: [
    {
      id: "merge",
      type: "block",
      position: { x: 190, y: 110 },
      data: { name: "merge", view: "port", w: 160, h: 120, ports: { left: ["pose", "other"], right: ["Pose"] } },
    },
  ],
  edges: [
    {
      id: "e-carry",
      source: "merge",
      sourceHandle: "Pose",
      target: "merge",
      targetHandle: "pose",
      data: { variant: "delayed", ...ELBOW },
    },
  ],
};

export const CarriedValueSelfLoop: Story = {
  name: "the carried value leaves and re-enters its own block, badged z⁻¹",
  render: () => <DomCanvas scene={selfLoopScene} width={560} height={330} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await expectWirePainted(root, "e-carry");
    await expectWireBadge(root, "e-carry", "z⁻¹");
    await expectWireAvoids(root, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
    expectRoutedLineAvoids(root, "e-carry", '[data-block-id="merge"] [data-slot="block"]');
  },
};

/* ==================================================================== */
/* ThroughAContainer                                                     */
/* ==================================================================== */

/**
 * Two cables leaving the SAME port, with opposite verdicts about the same
 * box — which is what makes `through` a per-wire fact rather than a global
 * obstacle list. `e-kid` ends on a member of `proc`, so `proc` is one of its
 * ancestors and it may enter. `e-past` merely passes by, so `proc` is a
 * keep-out and it goes around.
 */
const containerScene: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 0, y: 130 }, data: { name: "src", view: "port", w: 110, h: 70, ports: { right: ["out"] } } },
    {
      id: "proc",
      type: "block",
      position: { x: 180, y: 70 },
      data: { name: "proc", view: "expanded", w: 240, h: 180, ports: { left: ["in"] }, anchorStart: ["left"] },
    },
    { id: "kid", type: "block", parentId: "proc", position: { x: 0, y: 0 }, data: { name: "kid", view: "port", w: 100, h: 60, ports: { left: ["in"] } } },
    { id: "far", type: "block", position: { x: 520, y: 130 }, data: { name: "far", view: "port", w: 110, h: 70, ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "e-kid", source: "src", sourceHandle: "out", target: "kid", targetHandle: "in", data: ELBOW },
    { id: "e-past", source: "src", sourceHandle: "out", target: "far", targetHandle: "in", data: ELBOW },
  ],
};

export const ThroughAContainer: Story = {
  name: "into a member: enters the container; past it: routes around",
  render: () => <DomCanvas scene={containerScene} width={700} height={360} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await expectWirePainted(root, "e-kid");
    await expectWirePainted(root, "e-past");
    await expectWireAvoids(root, "e-past", '[data-block-id="proc"]');
    expectRoutedLineAvoids(root, "e-past", '[data-block-id="proc"]');
    expectDetour(root, "e-past", '[data-block-id="proc"]');
  },
};

/* ==================================================================== */
/* MutEffectCable                                                        */
/* ==================================================================== */

/**
 * A mutation, drawn with zero new components (plan §4's "Mutation effect
 * cable" row): a top-wall port named `effect:<input>`, a colour, and a
 * `mut` pill. It is still a data cable — the effect is what the cable
 * CARRIES, not a second kind of line.
 */
const mutScene: HostScene = {
  nodes: [
    { id: "estimator", type: "block", position: { x: 60, y: 190 }, data: { name: "estimator", view: "port", w: 150, h: 70, ports: { top: ["effect:pose"] } } },
    { id: "world", type: "block", position: { x: 340, y: 40 }, data: { name: "world", view: "port", w: 150, h: 70, ports: { left: ["pose"] } } },
  ],
  edges: [
    {
      id: "e-mut",
      source: "estimator",
      sourceHandle: "effect:pose",
      target: "world",
      targetHandle: "pose",
      data: { color: "var(--color-amber-600, #d97706)", badge: "mut", ...ELBOW },
    },
  ],
};

export const MutEffectCable: Story = {
  name: "an effect cable off a top-wall port, badged mut",
  render: () => <DomCanvas scene={mutScene} width={620} height={320} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await expectWirePainted(root, "e-mut");
    await expectWireBadge(root, "e-mut", "mut");
    // The wire genuinely LEFT the top-wall port — `data-wire-from` is what
    // `expectControlMark` reads to prove the negative case (no wire may
    // originate at a control mark), so it has to be right in the positive
    // one too.
    const group = root.querySelector('[data-slot="wire-layer"] [data-wire-id="e-mut"]');
    expect(group?.getAttribute("data-wire-from")).toBe("estimator/effect:pose");
  },
};

/* ==================================================================== */
/* BadgeWithSeed                                                         */
/* ==================================================================== */

/**
 * An authored badge beats the derived `z⁻¹`, and it renders EVERY authored
 * character — the superscript minus, the superscript one, the spaces around
 * `=`, the empty parens. Truthful property rendering: typography may restyle
 * text, it may not make characters disappear.
 */
const seedScene: HostScene = {
  nodes: [
    { id: "seed", type: "block", position: { x: 40, y: 120 }, data: { name: "seed", view: "port", w: 140, h: 70, ports: { right: ["Pose"] } } },
    { id: "filter", type: "block", position: { x: 380, y: 120 }, data: { name: "filter", view: "port", w: 140, h: 70, ports: { left: ["pose"] } } },
  ],
  edges: [
    {
      id: "e-seed",
      source: "seed",
      sourceHandle: "Pose",
      target: "filter",
      targetHandle: "pose",
      data: { variant: "delayed", badge: "z⁻¹ = estimate()", ...ELBOW },
    },
  ],
};

export const BadgeWithSeed: Story = {
  name: "an authored seed renders verbatim, not the derived z⁻¹",
  render: () => <DomCanvas scene={seedScene} width={620} height={300} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await expectWireBadge(root, "e-seed", "z⁻¹ = estimate()");
    // Character-for-character, not just "starts with z⁻¹": the rule is that
    // nothing authored is silently normalized, trimmed or clipped.
    const badge = root.querySelector<HTMLElement>('[data-slot="wire-badges"] [data-wire-id="e-seed"] [data-slot="trace-badge"]');
    expect(Array.from(badge?.textContent ?? "")).toEqual(Array.from("z⁻¹ = estimate()"));
  },
};
