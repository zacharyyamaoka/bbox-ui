import { useRef } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort } from "../components/blockPort";
import type { BlockView } from "../components/blockPort.layout";
import type { PortEdgeItem } from "../components/portEdge";
import type { Distribution } from "../components/portEdge.layout";
import type { BlockSide } from "../components/port.layout";
import { TRACE_TERMINAL_GAP } from "../components/trace";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "../components/trace.layout";
import { WireLayer } from "../components/wireLayer";
import { type BlockScene, childrenOf, portKey, rank, type SceneNode, topologicalOrder, wiredPorts } from "./scene";
import { sceneWires, withWiredState, type WireStyleData } from "./sceneWires";

/**
 * Blocks/Scene — the scene kit rendered through the EXISTING view kit
 * (docs/SCENE-KIT.md). One `BlockScene` literal is the single source of
 * truth for everything on the bench: placement (`position`), nesting
 * (`parentId`), connectivity (`edges`), and the derived captions
 * (`topologicalOrder`/`rank`). One host adapter (`SceneBlock` below, plus
 * `sceneWires`) turns that record into ordinary props — no component in
 * `src/components/` imports the scene, which is the separation this story
 * exists to prove.
 *
 * The play function's claim is measured, not counted: for every edge the
 * scene declares, the RENDERED trace's true terminals must sit on the two
 * dots that edge names — the same rect-level standard `BlockWiring` set.
 */

/* ------------------------------------------------------------------ */
/* The scene — the one record everything below derives from            */
/* ------------------------------------------------------------------ */

/** What THIS host stores per node: how the view kit should dress it. The
 *  scene does not know these fields exist — they are `data` to it. */
type NodeView = {
  name: string;
  view: BlockView;
  w: number;
  h: number;
  /** Which wall each port sits on — VIEW geometry, host-owned. The scene
   *  only ever names ports; it never places them. */
  ports?: Partial<Record<BlockSide, string[]>>;
  /** Walls whose ports hug the header end instead of centring — purely so
   *  proc's own `in` dot stays visually clear of its member's dot. */
  anchorStart?: BlockSide[];
};

const ANCHOR_START: Distribution = { mode: "aligned", anchor: "start", gap: 24, edgePadding: 16 };

const SCENE: BlockScene<NodeView, WireStyleData> = {
  nodes: [
    { id: "src", position: { x: 16, y: 86 }, data: { name: "src", view: "port", w: 110, h: 74, ports: { right: ["out"] } } },
    {
      id: "proc",
      position: { x: 190, y: 30 },
      data: { name: "proc", view: "expanded", w: 250, h: 190, ports: { left: ["in"], right: ["out", "aux"] }, anchorStart: ["left"] },
    },
    // `parentId` IS the nesting — the kid renders as a member of proc, and
    // its `position` is idle here because the parent stacks its members.
    { id: "kid", position: { x: 0, y: 0 }, parentId: "proc", data: { name: "kid", view: "port", w: 100, h: 60, ports: { left: ["in"] } } },
    // `dbg` stays unwired on purpose: the control that proves `wiredPorts`
    // derives state rather than painting every port it can find.
    { id: "sink", position: { x: 505, y: 80 }, data: { name: "sink", view: "port", w: 110, h: 96, ports: { left: ["in", "cfg"], right: ["dbg"] } } },
  ],
  edges: [
    { id: "e-cmd", source: "src", sourceHandle: "out", target: "proc", targetHandle: "in" },
    { id: "e-out", source: "proc", sourceHandle: "out", target: "sink", targetHandle: "in" },
    { id: "e-aux", source: "proc", sourceHandle: "aux", target: "kid", targetHandle: "in", data: { color: "var(--muted-foreground)" } },
    { id: "e-cfg", source: "src", sourceHandle: "out", target: "sink", targetHandle: "cfg", data: { variant: "async" } },
  ],
};

/* ------------------------------------------------------------------ */
/* The host adapter — scene in, view-kit props out                     */
/* ------------------------------------------------------------------ */

/** One node → one `BlockPort`-wrapped `Block`, members built from
 *  `childrenOf` (recursively — boxes all the way down), port items built
 *  from the host's own `data.ports` with wired state derived from the
 *  scene's edges. This function is the whole integration: everything it
 *  passes down is an ordinary prop. */
function SceneBlock({ scene, node, wired }: { scene: BlockScene<NodeView, WireStyleData>; node: SceneNode<NodeView>; wired: ReadonlySet<string> }) {
  const members = childrenOf(scene, node.id).map((kid) => ({ id: kid.id, content: <SceneBlock scene={scene} node={kid} wired={wired} /> }));
  const edges = Object.fromEntries(
    Object.entries(node.data.ports ?? {}).map(([side, portIds]) => [
      side,
      {
        items: withWiredState(portIds.map((id): PortEdgeItem => ({ id, label: id })), node.id, wired),
        distribution: node.data.anchorStart?.includes(side as BlockSide) ? ANCHOR_START : undefined,
      },
    ]),
  );
  return (
    <BlockPort id={node.id} view={node.data.view} edges={edges}>
      <Block
        header={node.data.name}
        width={node.data.w}
        height={node.data.h}
        members={members.length > 0 ? members : undefined}
        membersLayout="stack"
        memberGutter={36}
      />
    </BlockPort>
  );
}

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

function SceneBench({ scene }: { scene: BlockScene<NodeView, WireStyleData> }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wired = wiredPorts(scene);
  const { order } = topologicalOrder(scene);
  const ranks = rank(scene);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "32px 56px" }}>
      <div data-slot="wire-bench" data-bench="scene" ref={containerRef} style={{ position: "relative", width: 640, height: 250 }}>
        {scene.nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => (
            <Positioned key={node.id} x={node.position.x} y={node.position.y}>
              <SceneBlock scene={scene} node={node} wired={wired} />
            </Positioned>
          ))}
        <WireLayer wires={sceneWires(scene)} containerRef={containerRef} />
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", display: "flex", gap: 24 }}>
        <span>
          order: <span data-slot="scene-order">{order.join(" → ")}</span>
        </span>
        <span>
          rank: <span data-slot="scene-ranks">{order.map((id) => `${id}=${ranks.get(id)}`).join(" · ")}</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement — the same rect-level standard BlockWiring set           */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

// WHY every candidate is ownership-checked instead of taking the first
// `[data-port-id]` match: `proc` and its member `kid` both declare a port
// named `in` (line 60/64 above — the exact case that "stays visually clear"
// comment exists for), and a bare descendant query resolves to whichever
// dot is first in document order, not necessarily proc's own. This test's
// own `dotOf` carried the identical bug `WireLayer.resolveDot` did
// (host-fixes lane, defect 2, `wireLayer.tsx`) — the two independently
// implemented queries agreeing with each other, both wrong, is exactly why
// nothing caught it: `e-cmd · to terminal on proc/in` compared the rendered
// wire (post-fix: correctly on proc's own dot) against THIS helper's
// resolution (still kid's), and only diverged once one side was fixed.
function dotOf(bench: HTMLElement, blockId: string, portId: string): HTMLElement {
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  for (const candidate of Array.from(block.querySelectorAll<HTMLElement>(`[data-port-id="${portId}"]`))) {
    if (candidate.closest("[data-block-id]") === block) return candidate;
  }
  for (const collapsed of Array.from(block.querySelectorAll<HTMLElement>("[data-collapsed-ports]"))) {
    if (collapsed.closest("[data-block-id]") !== block) continue;
    if ((collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").includes(portId)) return collapsed;
  }
  throw new Error(`expected a dot for ${blockId}/${portId}`);
}

function stateOf(dot: HTMLElement): string | null {
  return required<HTMLElement>(dot, '[data-slot="port-dot"]', "the port dot").getAttribute("data-state");
}

/** The wall a dot's rail is mounted on, read from the DOM the view kit
 *  stamped — the test re-derives it rather than trusting any hardcoding. */
function railEdgeOf(dot: HTMLElement): TraceDir {
  const edge = dot.closest<HTMLElement>('[data-slot="block-port-rail"]')?.getAttribute("data-edge");
  if (edge !== "top" && edge !== "right" && edge !== "bottom" && edge !== "left") throw new Error("dot has no rail edge");
  return edge;
}

function expectWithin(actual: number, expected: number, tolerance: number, what: string): void {
  const delta = Math.abs(actual - expected);
  if (!(delta <= tolerance)) {
    throw new Error(`${what} — measured ${actual.toFixed(2)}, expected ${expected.toFixed(2)} (±${tolerance}), off by ${delta.toFixed(2)}`);
  }
}

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
  return required<SVGGElement>(bench, `[data-wire-id="${wireId}"]`, `the rendered trace for wire \`${wireId}\``);
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

/** The true terminal `WireLayer` resolved, reconstructed from the rendered
 *  path's endpoint plus `Trace`'s documented `TRACE_TERMINAL_GAP` pull-back
 *  — measured against the centre of the dot the SCENE's edge names. */
function expectTerminalOnDot(svg: SVGSVGElement, line: SVGPathElement, end: "from" | "to", railEdge: TraceDir, dot: HTMLElement, what: string): void {
  const dir = end === "from" ? railEdge : OPPOSITE_DIR[railEdge];
  const total = line.getTotalLength();
  const local = end === "from" ? line.getPointAtLength(0) : line.getPointAtLength(total);
  const sign = end === "from" ? -1 : 1;
  const trueLocal = {
    x: local.x + sign * DIR_VECTOR[dir].x * TRACE_TERMINAL_GAP,
    y: local.y + sign * DIR_VECTOR[dir].y * TRACE_TERMINAL_GAP,
  };
  const screen = toScreen(svg, trueLocal.x, trueLocal.y);
  const rect = dot.getBoundingClientRect();
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  expectWithin(screen.x, centre.x, 2, `${what} — x`);
  expectWithin(screen.y, centre.y, 2, `${what} — y`);
}

/* ------------------------------------------------------------------ */
/* The story                                                           */
/* ------------------------------------------------------------------ */

const meta = {
  title: "Scene/Scene",
  tags: ["object:scene", "lane:host-fixes"],
  component: WireLayer,
  args: { wires: [], containerRef: { current: null } },
} satisfies Meta<typeof WireLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SceneDriven: Story = {
  render: () => <SceneBench scene={SCENE} />,
  play: async ({ canvasElement }) => {
    const bench = required<HTMLElement>(canvasElement, '[data-slot="wire-bench"][data-bench="scene"]', "the scene bench");
    const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");

    /* Every edge the scene declares renders with BOTH terminals ON the
     * two dots that edge names — measured from the real path, rail sides
     * read back from the DOM, never hardcoded. */
    for (const edge of SCENE.edges) {
      const group = await waitForWireGroup(bench, edge.id);
      const line = required<SVGPathElement>(group, '[data-slot="trace-line"]', `wire ${edge.id}'s visible line`);
      const fromDot = dotOf(bench, edge.source, edge.sourceHandle ?? "");
      const toDot = dotOf(bench, edge.target, edge.targetHandle ?? "");
      expectTerminalOnDot(svg, line, "from", railEdgeOf(fromDot), fromDot, `${edge.id} · from terminal on ${edge.source}/${edge.sourceHandle}`);
      expectTerminalOnDot(svg, line, "to", railEdgeOf(toDot), toDot, `${edge.id} · to terminal on ${edge.target}/${edge.targetHandle}`);
    }
    await waitFor(() => expect(svg.getAttribute("data-unresolved-wires")).toBe(""));

    /* Wired state is DERIVED from the same record: every port an edge
     * names reads wired; the deliberately unwired control does not. */
    const wired = wiredPorts(SCENE);
    for (const key of wired) {
      const [nodeId, portId] = key.split("/");
      await expect(stateOf(dotOf(bench, nodeId, portId))).toBe("wired");
    }
    expect(wired.has(portKey("sink", "dbg"))).toBe(false);
    await expect(stateOf(dotOf(bench, "sink", "dbg"))).toBe("empty");

    /* The captions carry the pure derivations, and the expectation is a
     * LITERAL — recomputing the function here would prove nothing. */
    await expect(required<HTMLElement>(canvasElement, '[data-slot="scene-order"]', "the order caption").textContent).toBe("src → proc → kid → sink");
    await expect(required<HTMLElement>(canvasElement, '[data-slot="scene-ranks"]', "the rank caption").textContent).toBe(
      "src=0 · proc=1 · kid=2 · sink=2",
    );

    /* The nesting fact (`parentId`) really became containment: the kid's
     * dot sits inside the parent Block's client rect. */
    const parentRect = required<HTMLElement>(bench, '[data-block-id="proc"] > [data-slot="block"]', "the proc Block").getBoundingClientRect();
    const kidRect = dotOf(bench, "kid", "in").getBoundingClientRect();
    if (!(kidRect.left >= parentRect.left && kidRect.right <= parentRect.right && kidRect.top >= parentRect.top && kidRect.bottom <= parentRect.bottom)) {
      throw new Error("kid's port dot escapes proc's client rect — parentId did not become containment");
    }
  },
};
