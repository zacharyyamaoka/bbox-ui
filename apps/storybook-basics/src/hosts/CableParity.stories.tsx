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

import { paintedPullBackPx } from "../presets/wireEnds.acceptance";
import { expectSameCables, useWireGeometryRecorder } from "./cableParity";
import { DomCanvas } from "./domCanvas";
import { HOST_SCENE } from "./hostScene";
import { ReactFlowHost } from "./reactFlowHost";

/** The resolved dot for one end — the element `WireLayer.resolveDot` picks:
 *  `[data-port-id]` owned by `[data-block-id]` itself, not by a member. */
function dotOf(host: ParentNode, blockId: string, portId: string): HTMLElement {
  const block = host.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  const dot = [...(block?.querySelectorAll<HTMLElement>(`[data-port-id="${portId}"]`) ?? [])].find((candidate) => candidate.closest("[data-block-id]") === block);
  if (!dot) throw new Error(`no dot ${blockId}/${portId}`);
  return dot;
}

function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * For every edge, how far each PAINTED end of React Flow's cable stands off
 * its dot's centre, minus that dot's RENDERED ring pull-back
 * (`wireEnds.acceptance.ts`, read off the pixels — never the radius function
 * the router placed the end with). 0 = the end sits on the ring. Returns the
 * worst |error| and the largest pull-back seen, so the caller can also prove
 * the ring actually changed size.
 */
function ringErrors(host: HTMLElement): { worst: number; pullBack: number } {
  let worst = 0;
  let pullBack = 0;
  for (const edge of HOST_SCENE.edges) {
    const lines = [...host.querySelectorAll<SVGPathElement>(`[data-wire-id="${edge.id}"] [data-slot="trace-line"]:not([data-sketch="true"])`)];
    if (lines.length === 0) throw new Error(`no painted line for ${edge.id}`);
    const ends = [
      { line: lines[0], at: 0, dot: dotOf(host, edge.source, edge.sourceHandle!) },
      { line: lines.at(-1)!, at: lines.at(-1)!.getTotalLength(), dot: dotOf(host, edge.target, edge.targetHandle!) },
    ];
    for (const { line, at, dot } of ends) {
      const local = line.getPointAtLength(at);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(line.getScreenCTM()!);
      const centre = centreOf(dot.querySelector('[data-slot="port-dot"]') ?? dot);
      // The rendered ring plus the cap's REAL reach past the path end — read
      // off the pixels and the computed style by `paintedPullBackPx`, never
      // off `traceRingGapPx`. The async `e-cfg` edge is butt-capped, so it
      // must touch its ring with no half-stroke of daylight.
      const expected = paintedPullBackPx(dot, line);
      pullBack = Math.max(pullBack, expected);
      worst = Math.max(worst, Math.abs(Math.hypot(screen.x - centre.x, screen.y - centre.y) - expected));
    }
  }
  return { worst, pullBack };
}

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
  play: async ({ canvasElement, step }) => {
    const domPane = await waitFor(() => {
      const found = canvasElement.querySelector<HTMLElement>('[data-pane="dom"]');
      expect(found).not.toBeNull();
      return found!;
    });
    const reactFlowPane = canvasElement.querySelector<HTMLElement>('[data-pane="react-flow"]')!;
    const reactFlowHost = reactFlowPane.querySelector<HTMLElement>('[data-host="react-flow"]')!;
    const wireIds = HOST_SCENE.edges.map((edge) => edge.id);

    let restPullBack = 0;
    await step("At rest: same waypoints, and React Flow's ends on the rings", async () => {
      await waitFor(
        () => {
          // Both hosts resolved every cable to two real dots…
          expect(domPane.querySelector('[data-slot="wire-layer"]')?.getAttribute("data-unresolved-wires")).toBe("");
          expect(reactFlowHost.getAttribute("data-unresolved-wires")).toBe("");
          // …and drew each on the same waypoints.
          expectSameCables(domPane, reactFlowPane, wireIds);
          const { worst, pullBack } = ringErrors(reactFlowHost);
          expect(worst, "React Flow end vs rendered ring, px").toBeLessThanOrEqual(0.5);
          restPullBack = pullBack;
          // The measurement above covers a BUTT cap too, not only round
          // ones: `e-cfg` is the async dash, and it must touch its ring
          // with no half-stroke of daylight (re-judge of d97f5ec).
          for (const host of [reactFlowHost, domPane]) {
            const asyncLine = host.querySelector<SVGPathElement>('[data-wire-id="e-cfg"] [data-slot="trace-line"]:not([data-sketch="true"])');
            expect(asyncLine && getComputedStyle(asyncLine).strokeLinecap, "e-cfg's cap").toBe("butt");
          }
          expect(ringErrors(domPane).worst, "DOM canvas end vs rendered ring, px").toBeLessThanOrEqual(0.5);
        },
        { timeout: 5000 },
      );
    });

    // WHY this step (audit of 7fbf22c): a live port-style switch changes the
    // ring without resizing a node, so nothing but the variant itself tells
    // React Flow's router to re-run — the cables kept the old gap and painted
    // into the new ring. The same `<html>` attribute the toolbar global
    // (`.storybook/preview.tsx`'s `stampVariants`) and the app's variant pill
    // stamp.
    const html = document.documentElement.dataset;
    const previous = html.bboxPortVariant;
    expect(previous, "the story must start on a variant other than v3").not.toBe("v3");
    try {
      await step("Switch the port style to v3: both hosts re-route onto the new ring", async () => {
        html.bboxPortVariant = "v3";
        await waitFor(
          () => {
            const { worst, pullBack } = ringErrors(reactFlowHost);
            // Not vacuous: the ring really grew — by more than the 0.5px
            // tolerance below, so a cable left on the OLD gap cannot pass.
            expect(pullBack - restPullBack, "v3 ring pull-back growth, px").toBeGreaterThan(0.5);
            expect(worst, "React Flow end vs the NEW rendered ring, px").toBeLessThanOrEqual(0.5);
            expectSameCables(domPane, reactFlowPane, wireIds);
          },
          { timeout: 5000 },
        );
      });
    } finally {
      if (previous === undefined) delete html.bboxPortVariant;
      else html.bboxPortVariant = previous;
    }
  },
};
