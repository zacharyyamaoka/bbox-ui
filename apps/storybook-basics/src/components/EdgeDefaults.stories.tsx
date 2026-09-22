import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";

/**
 * Edge Defaults — the acceptance for Zach's 2026-09-19 feedback, fixes (a)
 * and (b) (`docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md`):
 *
 *   (a) "by default elbow arrows should always be used. never straight
 *       arrows" — a cable drawn with NO `routing` is an elbow, everywhere.
 *       `straight` stays SELECTABLE, so the control story below still
 *       asks for it by name and still gets a chord.
 *
 *   (b) "edges should always leave from the center of the port… The port
 *       only should have 1 connection point in the center" — every cable
 *       at one dot starts (or ends) on that dot's centre line, and two
 *       cables sharing a pair land on the SAME point. Overlap on the stub
 *       is the accepted cost; fan-in/out is expressed later by a producer
 *       count badge, never by moving an endpoint.
 *
 * Written BEFORE the implementation and committed on its own, so the diff
 * that follows cannot quietly weaken it. Every assertion is MEASURED off
 * the mounted `SVGPathElement` — `getPointAtLength` in the path's own user
 * space mapped through `getScreenCTM()`, and `getBoundingClientRect` for
 * the dots — never DOM presence.
 */

const meta = {
  title: "Components/Blocks/Region/Edge Defaults",
  tags: ["object:region", "host:dom", "lane:fix-edges"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ==================================================================== */
/* Measuring                                                             */
/* ==================================================================== */

interface Pt {
  x: number;
  y: number;
}

function hostOf(canvasElement: HTMLElement): HTMLElement {
  const host = canvasElement.querySelector<HTMLElement>('[data-host="dom-canvas"]');
  if (!host) throw new Error('expected the DOM Canvas host (`[data-host="dom-canvas"]`)');
  return host;
}

/** The ONE painted line of a wire — never `[data-wire-id] path`, which
 *  resolves to the arrowhead marker inside `<defs>` first (the trap
 *  `ControlFlowWires.stories.tsx` documents at length). */
function lineOf(root: ParentNode, wireId: string): SVGPathElement {
  const line = root.querySelector<SVGPathElement>(
    `[data-slot="wire-layer"] [data-wire-id="${wireId}"] path[data-slot="trace-line"]`,
  );
  if (!line) throw new Error(`expected wire \`${wireId}\`'s painted line`);
  return line;
}

/** A point on the mounted path, in SCREEN space — the same space
 *  `getBoundingClientRect` reports the dots in, so the two are comparable
 *  with no container arithmetic. */
function pointAt(line: SVGPathElement, length: number): Pt {
  const ctm = line.getScreenCTM();
  if (!ctm) throw new Error("the line is not rendered — no screen CTM");
  const local = line.getPointAtLength(length);
  const screen = new DOMPoint(local.x, local.y).matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

function endpointsOf(line: SVGPathElement): { start: Pt; end: Pt; length: number } {
  const total = line.getTotalLength();
  return { start: pointAt(line, 0), end: pointAt(line, total), length: total };
}

/** The screen centre of a rendered dot. */
function dotCentre(root: ParentNode, blockId: string, portId: string): Pt {
  const block = root.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (!block) throw new Error(`no block \`${blockId}\``);
  const dot = Array.from(block.querySelectorAll<HTMLElement>(`[data-port-id="${portId}"]`))
    .find((candidate) => candidate.closest("[data-block-id]") === block)
    ?.querySelector<HTMLElement>('[data-slot="port-dot"]');
  if (!dot) throw new Error(`no dot \`${blockId}/${portId}\``);
  const rect = dot.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * How much of a path runs along an axis.
 *
 * WHY a FRACTION and not "every segment is axis-aligned": `elbowPath`
 * rounds every corner with an arc, so a perfectly orthogonal route still
 * samples a handful of diagonal steps at each bend. A chord between two
 * points at different x AND y is diagonal at EVERY step, so the two
 * populations are nowhere near each other — measured on this file's own
 * fixtures, an elbow reads ≥0.9 and a curve ≤0.25.
 */
function axisAlignedFraction(line: SVGPathElement, step = 2): number {
  const total = line.getTotalLength();
  if (total < step * 2) return 1;
  let aligned = 0;
  let counted = 0;
  let previous = pointAt(line, 0);
  for (let d = step; d <= total; d += step) {
    const here = pointAt(line, d);
    const dx = Math.abs(here.x - previous.x);
    const dy = Math.abs(here.y - previous.y);
    if (dx > 0.01 || dy > 0.01) {
      counted += 1;
      if (dx < 0.2 || dy < 0.2) aligned += 1;
    }
    previous = here;
  }
  return counted === 0 ? 1 : aligned / counted;
}

/** The distance from a point to the dot's centre ACROSS the flow — the
 *  only axis Zach's "one connection point in the centre" constrains. A
 *  cable still stops short of the centre ALONG the flow, which is what
 *  leaves room for the arrowhead and the dot's own disc. */
function perpendicularOffset(point: Pt, centre: Pt, wall: "horizontal" | "vertical"): number {
  return wall === "horizontal" ? Math.abs(point.y - centre.y) : Math.abs(point.x - centre.x);
}

/* ==================================================================== */
/* Fixtures                                                              */
/* ==================================================================== */

const CARD = { view: "port", w: 150, h: 84 } as const;

/** Source → three targets, all at DIFFERENT heights — and none of them at
 *  the SOURCE's height either, so every route genuinely has to turn a
 *  corner. (An elbow between two dots that happen to be level is a single
 *  straight run whose length IS its chord: correct, and indistinguishable
 *  from a chord by measurement, so it proves nothing about the default and
 *  is kept out of this fixture on purpose.) The blocks are far enough apart
 *  in both axes that a chord would be steeply diagonal — which is what makes
 *  `axisAlignedFraction` discriminating. */
const FAN_OUT: HostScene = {
  nodes: [
    { id: "src", type: "block", position: { x: 20, y: 180 }, data: { ...CARD, name: "estimate()", ports: { right: ["pose"] } } },
    { id: "t1", type: "block", position: { x: 420, y: 20 }, data: { ...CARD, name: "a()", ports: { left: ["pose"] } } },
    { id: "t2", type: "block", position: { x: 420, y: 260 }, data: { ...CARD, name: "b()", ports: { left: ["pose"] } } },
    { id: "t3", type: "block", position: { x: 420, y: 400 }, data: { ...CARD, name: "c()", ports: { left: ["pose"] } } },
  ],
  // No `data` at all: these cables state NO routing, so what they draw as
  // IS the default under test.
  edges: [
    { id: "w1", source: "src", sourceHandle: "pose", target: "t1", targetHandle: "pose" },
    { id: "w2", source: "src", sourceHandle: "pose", target: "t2", targetHandle: "pose" },
    { id: "w3", source: "src", sourceHandle: "pose", target: "t3", targetHandle: "pose" },
  ],
};

/** Three producers into ONE consumer dot — Zach's `115156`, where two
 *  cables entered `encode()/pose` at two different points. */
const FAN_IN: HostScene = {
  nodes: [
    { id: "p1", type: "block", position: { x: 20, y: 20 }, data: { ...CARD, name: "estimate()", ports: { right: ["Pose"] } } },
    { id: "p2", type: "block", position: { x: 20, y: 180 }, data: { ...CARD, name: "fallback()", ports: { right: ["Pose"] } } },
    { id: "p3", type: "block", position: { x: 20, y: 340 }, data: { ...CARD, name: "identity()", ports: { right: ["Pose"] } } },
    { id: "enc", type: "block", position: { x: 440, y: 180 }, data: { ...CARD, name: "encode()", ports: { left: ["pose"] } } },
  ],
  edges: [
    { id: "w1", source: "p1", sourceHandle: "Pose", target: "enc", targetHandle: "pose" },
    { id: "w2", source: "p2", sourceHandle: "Pose", target: "enc", targetHandle: "pose" },
    { id: "w3", source: "p3", sourceHandle: "Pose", target: "enc", targetHandle: "pose" },
  ],
};

/** Two cables between the SAME two dots. Before this lane they fanned
 *  apart; Zach's ruling is that they overlap and the COUNT is what says
 *  there are two. */
const DUPLICATES: HostScene = {
  nodes: [
    { id: "a", type: "block", position: { x: 20, y: 60 }, data: { ...CARD, name: "a()", ports: { right: ["out"] } } },
    { id: "b", type: "block", position: { x: 420, y: 200 }, data: { ...CARD, name: "b()", ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "w1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
    { id: "w2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
  ],
};

/** The control: `straight` asked for BY NAME still draws a chord. "Never a
 *  default" is not "never available". */
const EXPLICIT_STRAIGHT: HostScene = {
  nodes: [
    { id: "a", type: "block", position: { x: 20, y: 60 }, data: { ...CARD, name: "a()", ports: { right: ["out"] } } },
    { id: "b", type: "block", position: { x: 420, y: 260 }, data: { ...CARD, name: "b()", ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "w-straight", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", data: { routing: "straight" } },
    { id: "w-curved", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", data: { routing: "curved" } },
  ],
};

/* ==================================================================== */
/* (a) elbow by default                                                  */
/* ==================================================================== */

/**
 * Three cables, none of which states a routing. All three must draw as
 * orthogonal runs, and each must be LONGER than the straight chord between
 * its ends — an independent signal that the route really turned corners
 * rather than merely sampling flat.
 */
export const ElbowIsTheDefault: Story = {
  render: () => <DomCanvas scene={FAN_OUT} width={620} height={520} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(root.querySelector('[data-slot="wire-layer"]')?.getAttribute("data-unresolved-wires")).toBe("");

    for (const id of ["w1", "w2", "w3"]) {
      const line = lineOf(root, id);
      const { start, end, length } = endpointsOf(line);
      const chord = Math.hypot(end.x - start.x, end.y - start.y);
      expect(axisAlignedFraction(line), `wire ${id} runs on the axes (it is an elbow, not a chord)`).toBeGreaterThan(0.85);
      expect(length, `wire ${id}'s route is longer than its chord — it turned corners`).toBeGreaterThan(chord + 20);
    }
  },
};

/** `straight` and `curved` asked for by name still draw what they say. */
export const ExplicitRoutingStillWins: Story = {
  render: () => <DomCanvas scene={EXPLICIT_STRAIGHT} width={620} height={420} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const straight = lineOf(root, "w-straight");
    const { start, end, length } = endpointsOf(straight);
    expect(axisAlignedFraction(straight), "an explicitly straight cable is a diagonal chord, not an elbow").toBeLessThan(0.3);
    expect(length).toBeCloseTo(Math.hypot(end.x - start.x, end.y - start.y), 0);

    const curved = lineOf(root, "w-curved");
    expect(axisAlignedFraction(curved), "an explicitly curved cable is still a curve").toBeLessThan(0.3);
  },
};

/* ==================================================================== */
/* (b) one attach point, at the dot's centre                             */
/* ==================================================================== */

/** Three cables OUT of one dot: all three leave on the dot's centre line. */
export const FanOutLeavesOneCentre: Story = {
  render: () => <DomCanvas scene={FAN_OUT} width={620} height={520} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const centre = dotCentre(root, "src", "pose");

    const starts = ["w1", "w2", "w3"].map((id) => endpointsOf(lineOf(root, id)).start);
    for (const [index, start] of starts.entries()) {
      expect(
        perpendicularOffset(start, centre, "horizontal"),
        `wire w${index + 1} leaves \`src/pose\` on the dot's centre line (y ${start.y.toFixed(2)} vs ${centre.y.toFixed(2)})`,
      ).toBeLessThanOrEqual(1);
    }
    // And they are the SAME point, not three points that each happen to be
    // within tolerance of the centre from different sides.
    const ys = starts.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys), "all three cables leave from ONE point").toBeLessThanOrEqual(0.5);
  },
};

/** Three cables INTO one dot: all three arrive on the dot's centre line. */
export const FanInArrivesOneCentre: Story = {
  render: () => <DomCanvas scene={FAN_IN} width={660} height={460} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const centre = dotCentre(root, "enc", "pose");

    const ends = ["w1", "w2", "w3"].map((id) => endpointsOf(lineOf(root, id)).end);
    for (const [index, end] of ends.entries()) {
      expect(
        perpendicularOffset(end, centre, "horizontal"),
        `wire w${index + 1} arrives at \`enc/pose\` on the dot's centre line (y ${end.y.toFixed(2)} vs ${centre.y.toFixed(2)})`,
      ).toBeLessThanOrEqual(1);
    }
    const ys = ends.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys), "all three cables arrive at ONE point").toBeLessThanOrEqual(0.5);
  },
};

/**
 * Two cables between the same pair overlap — deliberately.
 *
 * Zach, 2026-09-19: "The port only should have 1 connection point in the
 * center. Instead you should show the producer circle that has the number
 * for the number of arrows intersecting at that port." So the fan that used
 * to make duplicates visible is gone, and this story asserts its ABSENCE
 * rather than merely not asserting its presence.
 */
export const DuplicatesShareOnePoint: Story = {
  render: () => <DomCanvas scene={DUPLICATES} width={620} height={380} />,
  play: async ({ canvasElement }) => {
    const root = hostOf(canvasElement);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const first = endpointsOf(lineOf(root, "w1"));
    const second = endpointsOf(lineOf(root, "w2"));
    expect(Math.hypot(first.start.x - second.start.x, first.start.y - second.start.y), "duplicates leave from one point").toBeLessThanOrEqual(0.5);
    expect(Math.hypot(first.end.x - second.end.x, first.end.y - second.end.y), "duplicates arrive at one point").toBeLessThanOrEqual(0.5);

    const out = dotCentre(root, "a", "out");
    const into = dotCentre(root, "b", "in");
    expect(perpendicularOffset(first.start, out, "horizontal")).toBeLessThanOrEqual(1);
    expect(perpendicularOffset(first.end, into, "horizontal")).toBeLessThanOrEqual(1);
  },
};
