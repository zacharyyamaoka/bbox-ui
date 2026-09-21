import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import { collapsedWallCenterPx, type BlockBands, type BlockView } from "../components/blockPort.layout";
import type { PortEdgeItem } from "../components/portEdge";
import { TRACE_TERMINAL_GAP } from "../components/trace";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "../components/trace.layout";
import { WireLayer } from "../components/wireLayer";
import { type BlockScene, type SceneData, type ScenePosition, wiredPorts } from "./scene";
import { sceneWires, withWiredState, type WireStyleData } from "./sceneWires";

/**
 * Basics/CollapseWireEndpoints — Zach, reacting to a screenshot of a Block's
 * view toggle: "expanded view to simple view is not an issue. All of the
 * ports collapse to one that is centered in the block body. You can refer
 * to SystemSketch for this right now."
 *
 * MEASURED FIRST, before writing anything here (2026-09-18): the premise
 * that this kit currently drops a simple-view block's wires does not
 * reproduce. `wireLayer.tsx`'s `resolveDot` already has a second lookup —
 * `[data-collapsed-ports]`, landed with Group B wiring (`e6aea8e`) and
 * exercised today by `BlockWiring.stories.tsx`'s own `ViewsWired` story
 * (its "sig,aux" case) — that finds the ONE stand-in dot a collapsed wall
 * renders and resolves every wire naming any of its members onto it. Every
 * populated wall in this kit renders a real, measurable dot in EVERY view,
 * `blockPort.tsx`'s `renderCollapsed`/`renderItem`, so `resolveDot`'s DOM
 * lookup already covers 100% of "the view collapsed this port" — there is
 * no case left over for a synthetic, computed fallback to catch, and
 * `wireLayer.tsx`'s own module doc states the reason not to add one anyway:
 * "WireLayer never invents a point."
 *
 * So this file's job is not a bug fix — it is the missing PROOF, at the
 * exact geometric tolerance the brief asked for, that the invariant Zach
 * described is what actually renders: every wire into a collapsed wall
 * lands on ITS midpoint, nothing is dropped, and `collapsedWallCenterPx`
 * (blockPort.layout.ts) is the closed form for where that midpoint sits —
 * proven here against the REAL rendered DOM, not just against itself
 * (blockPort.layout.test.ts already does that half in isolation).
 */

/* ------------------------------------------------------------------ */
/* Measurement — the same idiom as BlockWiring.stories.tsx's own        */
/* helpers, copied rather than imported (this repo's own convention:    */
/* components are copy-paste-owned, and so, deliberately, are these).   */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(canvasElement: HTMLElement, benchId: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="wire-bench"][data-bench="${benchId}"]`, `the \`${benchId}\` bench`);
}

function dotOf(bench: HTMLElement, blockId: string, portId: string): HTMLElement {
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  const direct = block.querySelector<HTMLElement>(`[data-port-id="${portId}"]`);
  if (direct) return direct;
  for (const collapsed of Array.from(block.querySelectorAll<HTMLElement>("[data-collapsed-ports]"))) {
    if ((collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").includes(portId)) return collapsed;
  }
  throw new Error(`expected a dot for ${blockId}/${portId} in bench \`${bench.getAttribute("data-bench")}\``);
}

function dotCentre(dot: HTMLElement): { x: number; y: number } {
  const r = dot.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (±${tolerance}), off by ${delta.toFixed(2)}`);
  }
}

function traceGroupOf(bench: HTMLElement, wireId: string): SVGGElement {
  return required<SVGGElement>(bench, `[data-wire-id="${wireId}"]`, `the rendered trace for wire \`${wireId}\``);
}

/** Same race `BlockWiring.stories.tsx` documents: `WireLayer`'s own
 *  resolution lands one frame after the fixture's first commit. */
async function waitForWireGroup(bench: HTMLElement, wireId: string): Promise<SVGGElement> {
  await waitFor(
    () => {
      if (!bench.querySelector(`[data-wire-id="${wireId}"]`)) {
        const layer = bench.querySelector('[data-slot="wire-layer"]');
        throw new Error(`no [data-wire-id="${wireId}"] yet — unresolved="${layer?.getAttribute("data-unresolved-wires")}"`);
      }
    },
    { timeout: 3000 },
  );
  return traceGroupOf(bench, wireId);
}

function traceLineOf(group: SVGGElement): SVGPathElement {
  return required<SVGPathElement>(group, '[data-slot="trace-line"]', "the trace's visible line");
}

function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the svg mounted?");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/**
 * The rendered trace's TRUE terminal (undoing `Trace`'s own
 * `TRACE_TERMINAL_GAP` pull-back — see `BlockWiring.stories.tsx`'s
 * `expectTerminalOnDot`, same math), asserted against an arbitrary target
 * point rather than a specific dot element — because the whole point here
 * is to check the wire lands on the Block's own measured EDGE, independent
 * of whether `resolveDot` happened to find the "right" DOM node.
 */
function expectTerminalAt(
  svg: SVGSVGElement,
  line: SVGPathElement,
  end: "from" | "to",
  railEdge: TraceDir,
  target: { x: number; y: number },
  tolerance: number,
  what: string,
): void {
  const dir = end === "from" ? railEdge : OPPOSITE_DIR[railEdge];
  const total = line.getTotalLength();
  const local = end === "from" ? line.getPointAtLength(0) : line.getPointAtLength(total);
  const sign = end === "from" ? -1 : 1;
  const trueLocal = {
    x: local.x + sign * DIR_VECTOR[dir].x * TRACE_TERMINAL_GAP,
    y: local.y + sign * DIR_VECTOR[dir].y * TRACE_TERMINAL_GAP,
  };
  const screen = toScreen(svg, trueLocal.x, trueLocal.y);
  expectWithin(screen.x, target.x, tolerance, `${what} — x`);
  expectWithin(screen.y, target.y, tolerance, `${what} — y`);
}

/** The hub's own measured box, read the same way `blockPort.tsx`'s
 *  `useBlockBands` reads it — direct-child `[data-slot="block"]`, never a
 *  bare descendant query (a collapsed wall inside a MEMBER could otherwise
 *  be mistaken for the hub's own). Only `blockLeft/Top/Width/Height` are
 *  needed here (no header/footer in this fixture), so the rest of
 *  `BlockBands` is filled in as equal to the block band — unused by
 *  `collapsedWallCenterPx` for left/right, which never reads `bodyTop`/
 *  `bodyBottom`. */
function hubBandsOf(bench: HTMLElement, blockId: string): BlockBands {
  const wrapperRect = bench.getBoundingClientRect();
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"] > [data-slot="block"]`, `the \`${blockId}\` Block`);
  const r = block.getBoundingClientRect();
  const blockLeft = r.left - wrapperRect.left;
  const blockTop = r.top - wrapperRect.top;
  return { blockLeft, blockTop, blockWidth: r.width, blockHeight: r.height, bodyTop: blockTop, bodyBottom: blockTop + r.height };
}

/* ------------------------------------------------------------------ */
/* The scene — 3 sources fan into ONE wall, 1 sink fans out of another, */
/* rebuilding Zach's own screenshot: three cables converge from the     */
/* left, one leaves from the right.                                    */
/* ------------------------------------------------------------------ */

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

type WiringScene = BlockScene<SceneData, WireStyleData>;

function at(scene: WiringScene, nodeId: string): ScenePosition {
  return scene.nodes.find((node) => node.id === nodeId)?.position ?? { x: 0, y: 0 };
}

function buildHubScene(): WiringScene {
  return {
    nodes: [
      { id: "cw-n1", position: { x: 16, y: 0 }, data: {} },
      { id: "cw-n2", position: { x: 16, y: 90 }, data: {} },
      { id: "cw-n3", position: { x: 16, y: 180 }, data: {} },
      { id: "cw-hub", position: { x: 230, y: 10 }, data: {} },
      { id: "cw-dn", position: { x: 540, y: 105 }, data: {} },
    ],
    edges: [
      { id: "cw-w1", source: "cw-n1", sourceHandle: "out", target: "cw-hub", targetHandle: "a" },
      { id: "cw-w2", source: "cw-n2", sourceHandle: "out", target: "cw-hub", targetHandle: "b" },
      { id: "cw-w3", source: "cw-n3", sourceHandle: "out", target: "cw-hub", targetHandle: "c" },
      { id: "cw-w4", source: "cw-hub", sourceHandle: "y", target: "cw-dn", targetHandle: "in" },
    ],
  };
}

const HUB_LEFT_IDS = ["a", "b", "c"];
const ALL_WIRE_IDS = ["cw-w1", "cw-w2", "cw-w3", "cw-w4"];

interface HubFaceProps {
  benchId: string;
  caption: string;
  view: BlockView;
  width?: number;
  height?: number;
}

/** One rendering of the scene at a given hub `view` — the two static
 *  instances of this are literally Zach's screenshot's two rows; the live
 *  toggle story below re-renders the SAME markup in place instead. */
function HubFace({ benchId, caption, view, width = 700, height = 280 }: HubFaceProps) {
  const scene = useMemo(buildHubScene, []);
  const wires = useMemo(() => sceneWires(scene), [scene]);
  const wiredSet = useMemo(() => wiredPorts(scene), [scene]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftItems: PortEdgeItem[] = [
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "c", label: "c" },
  ];
  return (
    <div data-slot="wire-stage" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{caption}</div>
      <div data-slot="wire-bench" data-bench={benchId} ref={containerRef} style={{ position: "relative", width, height }}>
        <Positioned {...at(scene, "cw-n1")}>
          <BlockPort id="cw-n1" view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "cw-n1", wiredSet) } }}>
            <Block header="n1" width={100} height={60} />
          </BlockPort>
        </Positioned>
        <Positioned {...at(scene, "cw-n2")}>
          <BlockPort id="cw-n2" view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "cw-n2", wiredSet) } }}>
            <Block header="n2" width={100} height={60} />
          </BlockPort>
        </Positioned>
        <Positioned {...at(scene, "cw-n3")}>
          <BlockPort id="cw-n3" view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "cw-n3", wiredSet) } }}>
            <Block header="n3" width={100} height={60} />
          </BlockPort>
        </Positioned>
        <Positioned {...at(scene, "cw-hub")}>
          <BlockPort
            id="cw-hub"
            view={view}
            collapsePorts={view === "simple" ? true : undefined}
            edges={{
              left: { items: withWiredState(leftItems, "cw-hub", wiredSet) },
              right: { items: withWiredState([{ id: "y", label: "y" }], "cw-hub", wiredSet) },
            }}
          >
            <Block header="hub" width={170} height={220} />
          </BlockPort>
        </Positioned>
        <Positioned {...at(scene, "cw-dn")}>
          <BlockPort id="cw-dn" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "cw-dn", wiredSet) } }}>
            <Block header="dn" width={110} height={70} />
          </BlockPort>
        </Positioned>
        <WireLayer wires={wires} containerRef={containerRef} layoutKey={view} />
      </div>
    </div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: "32px 56px" }}>{children}</div>;
}

const meta = {
  title: "Blocks/CollapseWireEndpoints",
  tags: ["area:blocks", "lane:collapse-wires"],
  component: WireLayer,
  args: { wires: [], containerRef: { current: null } },
} satisfies Meta<typeof WireLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* SideBySide — Zach's own screenshot, two rows: "port" then "simple",   */
/* same scene, same neighbours, same cables.                             */
/* ==================================================================== */

export const SideBySide: Story = {
  render: () => (
    <Stage>
      <HubFace benchId="cwe-port" caption="Port View" view="port" />
      <HubFace benchId="cwe-simple" caption="Simple" view="simple" />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    /* Port row: three DISTINCT dots on the hub's left wall, one on the
     * right — nothing collapsed, every wire resolves. */
    {
      const bench = benchOf(canvasElement, "cwe-port");
      for (const id of ALL_WIRE_IDS) await waitForWireGroup(bench, id);
      const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
      const centres = HUB_LEFT_IDS.map((id) => dotCentre(dotOf(bench, "cw-hub", id)));
      // Distinct dots — no two of the three land on the same pixel. If a
      // future change accidentally always-collapsed, this is what would
      // start failing here instead of silently passing.
      for (let i = 0; i < centres.length; i++) {
        for (let j = i + 1; j < centres.length; j++) {
          const d = Math.hypot(centres[i].x - centres[j].x, centres[i].y - centres[j].y);
          if (!(d > 8)) throw new Error(`port view · dots for "${HUB_LEFT_IDS[i]}" and "${HUB_LEFT_IDS[j]}" are only ${d.toFixed(1)}px apart — expected distinct rows`);
        }
      }
      for (const id of HUB_LEFT_IDS) await expect(dotOf(bench, "cw-hub", id).getAttribute("data-collapsed-ports")).toBeNull();
    }

    /* Simple row: one collapsed dot names all three left-wall ids; every
     * wire STILL resolves (the bug Zach was reacting to would show up here
     * as `data-unresolved-wires` naming cw-w1..cw-w3). */
    {
      const bench = benchOf(canvasElement, "cwe-simple");
      for (const id of ALL_WIRE_IDS) await waitForWireGroup(bench, id);
      const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
      const collapsed = dotOf(bench, "cw-hub", "a");
      await expect(collapsed.getAttribute("data-collapsed-ports")).toBe("a,b,c");
      // The three inbound wires' rendered dots are now the SAME element.
      await expect(dotOf(bench, "cw-hub", "b")).toBe(collapsed);
      await expect(dotOf(bench, "cw-hub", "c")).toBe(collapsed);

      const bands = hubBandsOf(bench, "cw-hub");
      const left = collapsedWallCenterPx(bands, "left");
      const right = collapsedWallCenterPx(bands, "right");
      const wrapperRect = bench.getBoundingClientRect();
      const leftScreen = { x: wrapperRect.left + left.x, y: wrapperRect.top + left.y };
      const rightScreen = { x: wrapperRect.left + right.x, y: wrapperRect.top + right.y };

      // The rendered stand-in dot really is where the closed form says.
      expectWithin(dotCentre(collapsed).x, leftScreen.x, 1, "simple · collapsed left dot vs. closed form — x");
      expectWithin(dotCentre(collapsed).y, leftScreen.y, 1, "simple · collapsed left dot vs. closed form — y");

      // And every one of the three rendered TRACES really terminates
      // there too — the actual acceptance claim, measured on the drawn
      // path, not assumed from DOM identity.
      const svg = layer;
      for (const wireId of ["cw-w1", "cw-w2", "cw-w3"]) {
        const line = traceLineOf(await waitForWireGroup(bench, wireId));
        expectTerminalAt(svg, line, "to", "left", leftScreen, 2, `simple · ${wireId} → hub left-wall midpoint`);
      }
      const outLine = traceLineOf(await waitForWireGroup(bench, "cw-w4"));
      expectTerminalAt(svg, outLine, "from", "right", rightScreen, 2, "simple · cw-w4 ← hub right-wall midpoint");
    }
  },
};

/* ==================================================================== */
/* ToggleLive — ONE instance, the hub's view flips live. The rigorous     */
/* half of the acceptance: wire COUNT is measured before and after the   */
/* SAME toggle, not inferred from two independently-authored benches.    */
/* ==================================================================== */

function ToggleLiveBench() {
  const [view, setView] = useState<BlockView>("port");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        data-testid="cwe-toggle"
        onClick={() => setView((v) => (v === "port" ? "simple" : "port"))}
        style={{ alignSelf: "flex-start", fontSize: 12, padding: "3px 8px" }}
      >
        view: {view} (click to flip)
      </button>
      <HubFace benchId="cwe-toggle" caption={`${view} view (live)`} view={view} />
    </div>
  );
}

export const ToggleLive: Story = {
  render: () => (
    <Stage>
      <ToggleLiveBench />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "cwe-toggle");
    const toggle = required<HTMLButtonElement>(canvasElement, '[data-testid="cwe-toggle"]', "the view toggle");
    const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");

    // --- before: port view, distinct rows, four resolved wires ---
    for (const id of ALL_WIRE_IDS) await waitForWireGroup(bench, id);
    const beforeCount = bench.querySelectorAll("[data-wire-id]").length;
    await expect(beforeCount).toBe(4);
    await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
    for (const id of HUB_LEFT_IDS) await expect(dotOf(bench, "cw-hub", id).getAttribute("data-collapsed-ports")).toBeNull();

    // --- flip to simple: THE assertion this story exists for ---
    await userEvent.click(toggle);
    await waitFor(() => expect(dotOf(bench, "cw-hub", "a").getAttribute("data-collapsed-ports")).toBe("a,b,c"));

    // Wire count unchanged across the toggle — nothing dropped.
    await waitFor(() => {
      const afterCount = bench.querySelectorAll("[data-wire-id]").length;
      expect(afterCount).toBe(beforeCount);
    });
    for (const id of ALL_WIRE_IDS) await waitForWireGroup(bench, id);
    await expect(layer.getAttribute("data-unresolved-wires")).toBe("");

    // Every inbound wire's real terminal sits within tolerance of ONE
    // point — the hub's left-wall midpoint, measured fresh (the toggle
    // just resized nothing, but the assertion re-measures rather than
    // trusting the pre-toggle rect).
    const bandsAfter = hubBandsOf(bench, "cw-hub");
    const leftAfter = collapsedWallCenterPx(bandsAfter, "left");
    const rightAfter = collapsedWallCenterPx(bandsAfter, "right");
    const wrapperRect = bench.getBoundingClientRect();
    const leftScreen = { x: wrapperRect.left + leftAfter.x, y: wrapperRect.top + leftAfter.y };
    const rightScreen = { x: wrapperRect.left + rightAfter.x, y: wrapperRect.top + rightAfter.y };
    for (const wireId of ["cw-w1", "cw-w2", "cw-w3"]) {
      const line = traceLineOf(await waitForWireGroup(bench, wireId));
      expectTerminalAt(layer, line, "to", "left", leftScreen, 2, `toggle·simple · ${wireId} → hub left midpoint`);
    }
    const outLine = traceLineOf(await waitForWireGroup(bench, "cw-w4"));
    expectTerminalAt(layer, outLine, "from", "right", rightScreen, 2, "toggle·simple · cw-w4 ← hub right midpoint");

    // --- flip back: round-trips to distinct rows again, same 4 wires ---
    await userEvent.click(toggle);
    await waitFor(() => expect(dotOf(bench, "cw-hub", "a").getAttribute("data-collapsed-ports")).toBeNull());
    await waitFor(() => {
      const backCount = bench.querySelectorAll("[data-wire-id]").length;
      expect(backCount).toBe(beforeCount);
    });
    await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
  },
};
