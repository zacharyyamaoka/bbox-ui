import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "./block";
import type { BlockMember } from "./blockMembers";
import { BlockPort } from "./blockPort";
import type { BlockView } from "./blockPort.layout";
import type { PortEdgeItem } from "./portEdge";
import { paintedPullBackPx } from "../presets/wireEnds.acceptance";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "./trace.layout";
import { DUPLICATE_FAN_PX, type Wire } from "./wiring";
import { WireLayer } from "./wireLayer";
import { type BlockScene, type SceneData, type ScenePosition, wiredPorts } from "../scene/scene";
import { sceneWires, withWiredState, type WireStyleData } from "../scene/sceneWires";

/**
 * Basics/BlockWiring — phase B1 of docs/BLOCK-PORT-EDGES-PLAN.md: wires
 * between real ports on real Blocks, dispatched the moment `claude/
 * trace-component` merged (it has — Trace, `TraceTerminalSpec`, `OPPOSITE_DIR`
 * and `traceSideOf` are all landed, committed code, not sibling-worktree
 * imports).
 *
 * Zach's brief, verbatim: "draw as many wires as you want... even multiple
 * wires between the same two ports" — so `wiring.ts`'s `Wire` is a plain
 * array element with nothing validating it (D-B2), and everything measured
 * here is DERIVATION, never a permission check.
 *
 * Every claim below is a real rect or a real rendered path, never DOM
 * presence alone — a `<Trace>` that exists in the tree and a `<Trace>` whose
 * endpoints actually sit on the two ports it claims to join have identical
 * "does this element exist" answers, and only one of them is the feature.
 */

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(canvasElement: HTMLElement, benchId: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="wire-bench"][data-bench="${benchId}"]`, `the \`${benchId}\` bench`);
}

/** The rendered dot for one port — `[data-port-id]`, or the collapsed
 *  stand-in whose `data-collapsed-ports` names it. The SAME reading
 *  `wireLayer.tsx`'s own `resolveDot` uses, restated here so a test never
 *  trusts the component to have found the right element — it re-finds it. */
function dotOf(bench: HTMLElement, blockId: string, portId: string): HTMLElement {
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  const direct = block.querySelector<HTMLElement>(`[data-port-id="${portId}"]`);
  if (direct) return direct;
  for (const collapsed of Array.from(block.querySelectorAll<HTMLElement>("[data-collapsed-ports]"))) {
    if ((collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").includes(portId)) return collapsed;
  }
  throw new Error(`expected a dot for ${blockId}/${portId} in bench \`${bench.getAttribute("data-bench")}\``);
}

function stateOf(dot: HTMLElement): string | null {
  return required<HTMLElement>(dot, '[data-slot="port-dot"]', "the port dot").getAttribute("data-state");
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

/**
 * `WireLayer`'s own resolution lands one browser frame after the fixture's
 * first commit — its rails' own dots do not exist until `BlockPort`'s band
 * measurement lands (`wireLayer.tsx`'s own note on the race). Every first
 * look at a wire's rendered group goes through this, never a bare
 * `querySelector`, so a test never races the layer's own deferred re-measure.
 */
async function waitForWireGroup(bench: HTMLElement, wireId: string): Promise<SVGGElement> {
  await waitFor(
    () => {
      const found = bench.querySelector(`[data-wire-id="${wireId}"]`);
      if (!found) {
        const layer = bench.querySelector('[data-slot="wire-layer"]');
        const blocks = Array.from(bench.querySelectorAll<HTMLElement>("[data-block-id]")).map((b) => b.getAttribute("data-block-id"));
        const ports = Array.from(bench.querySelectorAll<HTMLElement>("[data-port-id]")).map((p) => p.getAttribute("data-port-id"));
        throw new Error(
          `no [data-wire-id="${wireId}"] yet — unresolved="${layer?.getAttribute("data-unresolved-wires")}" blocks=${JSON.stringify(blocks)} ports=${JSON.stringify(ports)}`,
        );
      }
    },
    { timeout: 3000 },
  );
  return traceGroupOf(bench, wireId);
}

function traceLineOf(group: SVGGElement): SVGPathElement {
  return required<SVGPathElement>(group, '[data-slot="trace-line"]', "the trace's visible line");
}

/** Screen-space position of an SVG user-space point, via the real CTM —
 *  same technique `TraceRouting.stories.tsx` already established. */
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
 * B1's actual claim: the TERMINAL `WireLayer` resolved — not the visibly
 * drawn line, which ends ON the dot's painted ring rather than at its
 * centre (`trace.tsx`'s `traceRingGapPx`; until 2026-09-22 a fixed 16px
 * `TRACE_TERMINAL_GAP`). Reconstructing
 * the true terminal from the rendered path's own endpoint plus that
 * documented pull-back — `traceRouteStart`/`traceRouteEnd`, run backwards —
 * is what proves `WireLayer`'s OWN derivation is right, rather than
 * asserting something Trace was never going to draw. `dir` is read the same
 * way `WireLayer` computed it (`railEdgeOf`'s rule, restated locally) so this
 * check never trusts the component to have picked the right one.
 */
function expectTerminalOnDot(svg: SVGSVGElement, line: SVGPathElement, end: "from" | "to", railEdge: TraceDir, dot: HTMLElement, what: string): void {
  // The SAME rule `wireLayer.tsx` applies: `from` leaves along its own
  // rail's edge; `to` arrives travelling AGAINST its rail's edge. Taking the
  // raw rail edge here (rather than pre-flipping it at the call site) is
  // what keeps this helper impossible to call with the wrong sign by hand.
  const dir = end === "from" ? railEdge : OPPOSITE_DIR[railEdge];
  const total = line.getTotalLength();
  const local = end === "from" ? line.getPointAtLength(0) : line.getPointAtLength(total);
  const sign = end === "from" ? -1 : 1;
  // The pull-back is the dot's OWN painted ring (+ the round cap) since
  // 2026-09-22 — Zach: "make the trace end exactly at the port" — read
  // off the pixels by `paintedPullBackPx`, never off `WireLayer`'s own
  // radius function.
  const pullBack = paintedPullBackPx(dot, line);
  const trueLocal = {
    x: local.x + sign * DIR_VECTOR[dir].x * pullBack,
    y: local.y + sign * DIR_VECTOR[dir].y * pullBack,
  };
  const screen = toScreen(svg, trueLocal.x, trueLocal.y);
  const centre = dotCentre(dot);
  expectWithin(screen.x, centre.x, 2, `${what} — x`);
  expectWithin(screen.y, centre.y, 2, `${what} — y`);
}

/* ------------------------------------------------------------------ */
/* The bench — one fixture container, real BlockPorts, a WireLayer      */
/* ------------------------------------------------------------------ */

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

/** Every bench's source of truth is now a `BlockScene` (the scene kit —
 *  docs/SCENE-KIT.md): nodes carry placement, edges carry connectivity,
 *  and the two view derivations (`sceneWires` → `WireLayer` props,
 *  `wiredPorts` → per-item wired state) replace the `Wire[]`-as-model +
 *  `wiredPortKeys` pair this story used to own ad hoc. */
type WiringScene = BlockScene<SceneData, WireStyleData>;

/** The node's authored position — so a bench places each block where the
 *  SCENE says it sits, instead of repeating x/y beside it. A ghost id
 *  lands at the origin (total, like the scene kit itself). */
function at(scene: WiringScene, nodeId: string): ScenePosition {
  return scene.nodes.find((node) => node.id === nodeId)?.position ?? { x: 0, y: 0 };
}

interface WireBenchProps {
  benchId: string;
  caption?: ReactNode;
  wires: Wire[];
  width: number;
  height: number;
  layoutKey?: unknown;
  children: ReactNode;
}

function WireBench({ benchId, caption, wires, width, height, layoutKey, children }: WireBenchProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <div data-slot="wire-stage" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {caption && (
        <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{caption}</div>
      )}
      <div data-slot="wire-bench" data-bench={benchId} ref={containerRef} style={{ position: "relative", width, height }}>
        {children}
        <WireLayer wires={wires} containerRef={containerRef} layoutKey={layoutKey} />
      </div>
    </div>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "32px 56px", alignItems: "flex-start" }}>{children}</div>;
}

const meta = {
  title: "Blocks/BlockWiring",
  tags: ["area:blocks", "lane:baseline"],
  component: WireLayer,
  args: { wires: [], containerRef: { current: null } },
} satisfies Meta<typeof WireLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* WiringScenarios                                                       */
/* ==================================================================== */

/** Outside↔outside, with a live toggle — B2's derivation claim: add a wire,
 *  the state changes; remove it, the state reverts to whatever the fixture
 *  authored (here `valueSet`, deliberately not `empty`, so "reverts" means
 *  something more precise than "goes back to the default"). */
function OutsideToOutsideBench() {
  const [wired, setWired] = useState(true);
  const items = useMemo(
    () => ({
      out: [{ id: "out", label: "out", state: "valueSet" }] as PortEdgeItem[],
      in: [{ id: "in", label: "in" }] as PortEdgeItem[],
    }),
    [],
  );
  const scene: WiringScene = {
    nodes: [
      { id: "oto-a", position: { x: 16, y: 30 }, data: {} },
      { id: "oto-b", position: { x: 216, y: 30 }, data: {} },
    ],
    edges: wired ? [{ id: "oto-w1", source: "oto-a", sourceHandle: "out", target: "oto-b", targetHandle: "in" }] : [],
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" data-testid="oto-toggle" onClick={() => setWired((w) => !w)} style={{ alignSelf: "flex-start", fontSize: 12, padding: "3px 8px" }}>
        {wired ? "remove wire" : "add wire"}
      </button>
      <WireBench benchId="outside-to-outside" caption="outside ↔ outside" wires={wires} width={360} height={140}>
        <Positioned {...at(scene, "oto-a")}>
          <BlockPort id="oto-a" view="port" edges={{ right: { items: withWiredState(items.out, "oto-a", wiredSet) } }}>
            <Block header="A" width={120} height={80} />
          </BlockPort>
        </Positioned>
        <Positioned {...at(scene, "oto-b")}>
          <BlockPort id="oto-b" view="port" edges={{ left: { items: withWiredState(items.in, "oto-b", wiredSet) } }}>
            <Block header="B" width={120} height={80} />
          </BlockPort>
        </Positioned>
      </WireBench>
    </div>
  );
}

/** Fan-out: one source port, three targets. */
function FanOutBench() {
  const src: PortEdgeItem[] = [{ id: "cmd", label: "cmd" }];
  const targets = ["p", "q", "r"];
  const scene: WiringScene = {
    nodes: [
      { id: "fo-src", position: { x: 16, y: 90 }, data: {} },
      ...targets.map((t, i) => ({ id: `fo-${t}`, position: { x: 230, y: 10 + i * 90 }, data: {} })),
    ],
    edges: targets.map((t) => ({ id: `fo-w-${t}`, source: "fo-src", sourceHandle: "cmd", target: `fo-${t}`, targetHandle: "in" })),
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  return (
    <WireBench benchId="fan-out" caption="fan-out · 1 → 3" wires={wires} width={360} height={260}>
      <Positioned {...at(scene, "fo-src")}>
        <BlockPort id="fo-src" view="port" edges={{ right: { items: withWiredState(src, "fo-src", wiredSet) } }}>
          <Block header="src" width={100} height={70} />
        </BlockPort>
      </Positioned>
      {targets.map((t) => (
        <Positioned key={t} {...at(scene, `fo-${t}`)}>
          <BlockPort id={`fo-${t}`} view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], `fo-${t}`, wiredSet) } }}>
            <Block header={t} width={100} height={60} />
          </BlockPort>
        </Positioned>
      ))}
    </WireBench>
  );
}

/** Fan-in: three sources, one shared target port. */
function FanInBench() {
  const sources = ["p", "q", "r"];
  const scene: WiringScene = {
    nodes: [
      ...sources.map((s, i) => ({ id: `fi-${s}`, position: { x: 16, y: 10 + i * 90 }, data: {} })),
      { id: "fi-dst", position: { x: 230, y: 90 }, data: {} },
    ],
    edges: sources.map((s) => ({ id: `fi-w-${s}`, source: `fi-${s}`, sourceHandle: "out", target: "fi-dst", targetHandle: "sum" })),
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  return (
    <WireBench benchId="fan-in" caption="fan-in · 3 → 1" wires={wires} width={360} height={260}>
      {sources.map((s) => (
        <Positioned key={s} {...at(scene, `fi-${s}`)}>
          <BlockPort id={`fi-${s}`} view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], `fi-${s}`, wiredSet) } }}>
            <Block header={s} width={100} height={60} />
          </BlockPort>
        </Positioned>
      ))}
      <Positioned {...at(scene, "fi-dst")}>
        <BlockPort id="fi-dst" view="port" edges={{ left: { items: withWiredState([{ id: "sum", label: "sum" }], "fi-dst", wiredSet) } }}>
          <Block header="dst" width={100} height={70} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

/** Two wires, same two ports — the permission-free case Zach named
 *  explicitly. D-B3's fan must make them visibly two, not one line drawn
 *  twice. */
function DuplicatesBench() {
  const scene: WiringScene = {
    nodes: [
      { id: "dup-a", position: { x: 16, y: 30 }, data: {} },
      { id: "dup-b", position: { x: 216, y: 30 }, data: {} },
    ],
    edges: [
      { id: "dup-w1", source: "dup-a", sourceHandle: "out", target: "dup-b", targetHandle: "in" },
      { id: "dup-w2", source: "dup-a", sourceHandle: "out", target: "dup-b", targetHandle: "in" },
    ],
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  return (
    <WireBench benchId="duplicates" caption="duplicates · same two ports, twice" wires={wires} width={360} height={140}>
      <Positioned {...at(scene, "dup-a")}>
        <BlockPort id="dup-a" view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "dup-a", wiredSet) } }}>
          <Block header="A" width={120} height={80} />
        </BlockPort>
      </Positioned>
      <Positioned {...at(scene, "dup-b")}>
        <BlockPort id="dup-b" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "dup-b", wiredSet) } }}>
          <Block header="B" width={120} height={80} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

/** A block's own left → its own right — no rule forbids it. */
function SelfWireBench() {
  const scene: WiringScene = {
    nodes: [{ id: "self-a", position: { x: 80, y: 30 }, data: {} }],
    edges: [{ id: "self-w1", source: "self-a", sourceHandle: "in", target: "self-a", targetHandle: "out" }],
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  return (
    <WireBench benchId="self-wire" caption="self-wire · a block's own left → right" wires={wires} width={280} height={140}>
      <Positioned {...at(scene, "self-a")}>
        <BlockPort
          id="self-a"
          view="port"
          edges={{
            left: { items: withWiredState([{ id: "in", label: "in" }], "self-a", wiredSet) },
            right: { items: withWiredState([{ id: "out", label: "out" }], "self-a", wiredSet) },
          }}
        >
          <Block header="A" width={120} height={80} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

/** Wire into a child — the parent's own inner (right) rail to a member's
 *  own (left) rail. The member is itself a `BlockPort`, nested exactly the
 *  way `blockMembers.tsx`'s `content: ReactNode` always allowed. */
function IntoChildBench() {
  // `parentId` IS the nesting: the kid is a scene fact here, and the
  // member below is the view kit RENDERING that fact — the same
  // membership `blockMembers.tsx` used to be the only owner of.
  const scene: WiringScene = {
    nodes: [
      { id: "child-parent", position: { x: 16, y: 20 }, data: {} },
      { id: "child-kid", position: { x: 0, y: 0 }, data: {}, parentId: "child-parent" },
    ],
    edges: [{ id: "child-w1", source: "child-parent", sourceHandle: "out", target: "child-kid", targetHandle: "in" }],
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  const member: BlockMember = {
    id: "kid",
    content: (
      <BlockPort id="child-kid" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "child-kid", wiredSet) } }}>
        <Block header="kid" width={100} height={60} />
      </BlockPort>
    ),
  };
  return (
    <WireBench benchId="into-child" caption="into a child · parent's inner rail → a member's own port" wires={wires} width={360} height={220}>
      <Positioned {...at(scene, "child-parent")}>
        <BlockPort
          id="child-parent"
          view="expanded"
          edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "child-parent", wiredSet) } }}
        >
          <Block header="parent" width={260} height={180} members={[member]} membersLayout="stack" memberGutter={20} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

export const WiringScenarios: Story = {
  render: () => (
    <Stage>
      <OutsideToOutsideBench />
      <FanOutBench />
      <FanInBench />
      <DuplicatesBench />
      <SelfWireBench />
      <IntoChildBench />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    /* ---- outside ↔ outside, + B2's add/remove derivation ---- */
    {
      const bench = benchOf(canvasElement, "outside-to-outside");
      const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      const a = dotOf(bench, "oto-a", "out");
      const b = dotOf(bench, "oto-b", "in");

      await expect(stateOf(a)).toBe("wired");
      await expect(stateOf(b)).toBe("wired");

      const group = await waitForWireGroup(bench, "oto-w1");
      const line = traceLineOf(group);
      expectTerminalOnDot(svg, line, "from", "right", a, "outside↔outside · from terminal on A's out dot");
      expectTerminalOnDot(svg, line, "to", "left", b, "outside↔outside · to terminal on B's in dot"); // B's rail is its LEFT edge; the helper flips it to "right" for the `to` flow tangent

      // B2 — removing the wire: the port reverts to its FIXTURE state
      // (`valueSet`), not to some generic default, and the trace disappears.
      const toggle = required<HTMLButtonElement>(canvasElement, '[data-testid="oto-toggle"]', "the wire toggle");
      await userEvent.click(toggle);
      await waitFor(() => expect(stateOf(dotOf(bench, "oto-a", "out"))).toBe("valueSet"));
      await expect(stateOf(dotOf(bench, "oto-b", "in"))).toBe("empty");
      await waitFor(() => expect(bench.querySelector('[data-wire-id="oto-w1"]')).toBeNull());

      // …and adding it back re-derives `wired` on both ends again.
      await userEvent.click(toggle);
      await waitFor(() => expect(stateOf(dotOf(bench, "oto-a", "out"))).toBe("wired"));
      await expect(stateOf(dotOf(bench, "oto-b", "in"))).toBe("wired");
      await waitFor(() => expect(bench.querySelector('[data-wire-id="oto-w1"]')).not.toBeNull());
    }

    /* ---- fan-out : one source, three wired targets ---- */
    {
      const bench = benchOf(canvasElement, "fan-out");
      await expect(stateOf(dotOf(bench, "fo-src", "cmd"))).toBe("wired");
      for (const t of ["p", "q", "r"]) {
        await expect(stateOf(dotOf(bench, `fo-${t}`, "in"))).toBe("wired");
        await waitForWireGroup(bench, `fo-w-${t}`);
      }
    }

    /* ---- fan-in : three sources, one shared target ---- */
    {
      const bench = benchOf(canvasElement, "fan-in");
      await expect(stateOf(dotOf(bench, "fi-dst", "sum"))).toBe("wired");
      for (const s of ["p", "q", "r"]) {
        await expect(stateOf(dotOf(bench, `fi-${s}`, "out"))).toBe("wired");
        await waitForWireGroup(bench, `fi-w-${s}`);
      }
    }

    /* ---- duplicates : two wires, same pair, ONE shared route ---- */
    {
      // INVERTED 2026-09-19 (lane `fix-edges`). This block used to demand
      // the two midpoints be at least `DUPLICATE_FAN_PX / 2` APART — the
      // fan that made "two wires between the same two ports" read as two.
      // Zach ruled that out on the real board: "edges should always leave
      // from the center of the port… The port only should have 1 connection
      // point in the center. Instead you should show the producer circle
      // that has the number for the number of arrows intersecting at that
      // port." So the expectation is not dropped, it is REVERSED: the two
      // cables must now coincide, and the count is what a badge will say.
      // Same measurement, opposite sign — see `EdgeDefaults.stories.tsx`
      // for the endpoint half of the same rule.
      const bench = benchOf(canvasElement, "duplicates");
      const g1 = await waitForWireGroup(bench, "dup-w1");
      const g2 = await waitForWireGroup(bench, "dup-w2");
      const l1 = traceLineOf(g1);
      const l2 = traceLineOf(g2);
      const mid1 = l1.getPointAtLength(l1.getTotalLength() / 2);
      const mid2 = l2.getPointAtLength(l2.getTotalLength() / 2);
      const separation = Math.hypot(mid2.x - mid1.x, mid2.y - mid1.y);
      if (separation > 0.5) {
        throw new Error(`duplicates · the two wires' rendered midpoints are ${separation.toFixed(2)}px apart — a per-cable offset has come back; a duplicate must share its twin's route exactly (DUPLICATE_FAN_PX is ${DUPLICATE_FAN_PX} and is no longer applied to paint)`);
      }
    }

    /* ---- self-wire : a block's own left → right ---- */
    {
      const bench = benchOf(canvasElement, "self-wire");
      await expect(stateOf(dotOf(bench, "self-a", "in"))).toBe("wired");
      await expect(stateOf(dotOf(bench, "self-a", "out"))).toBe("wired");
      await waitForWireGroup(bench, "self-w1");
    }

    /* ---- into a child : dots stay inside the parent's own client rect ---- */
    {
      const bench = benchOf(canvasElement, "into-child");
      await expect(stateOf(dotOf(bench, "child-parent", "out"))).toBe("wired");
      await expect(stateOf(dotOf(bench, "child-kid", "in"))).toBe("wired");
      await waitForWireGroup(bench, "child-w1");

      const parentBlock = required<HTMLElement>(bench, '[data-block-id="child-parent"] > [data-slot="block"]', "the parent Block");
      const parentRect = parentBlock.getBoundingClientRect();
      const kidDot = dotOf(bench, "child-kid", "in");
      const kidRect = kidDot.getBoundingClientRect();
      if (!(kidRect.left >= parentRect.left && kidRect.right <= parentRect.right && kidRect.top >= parentRect.top && kidRect.bottom <= parentRect.bottom)) {
        throw new Error(`into-child · the child's own port dot (${kidRect.left.toFixed(1)}..${kidRect.right.toFixed(1)}) escapes the parent Block's client rect (${parentRect.left.toFixed(1)}..${parentRect.right.toFixed(1)})`);
      }
    }
  },
};

/* ==================================================================== */
/* ViewsWired — the same wire list, re-anchored across the three views   */
/* ==================================================================== */

/**
 * `view` gates whether the child member is rendered at all — the donor's own
 * rule, "only expanded blocks can show children" (`canBlockContainChildren`).
 * Simple and port views therefore render the SAME wire list with the child
 * genuinely absent, which is what makes their `data-unresolved-wires`
 * reading honest rather than a story hiding the wire on purpose.
 */
function ViewsWiredBench({ view }: { view: BlockView }) {
  // The SAME scene across all three benches — the kid exists in every one
  // of them (it is a scene fact, `parentId: "vw-parent"`); only the VIEW
  // decides whether to render it, which is exactly what makes the
  // `data-unresolved-wires` reading honest rather than a story hiding the
  // wire on purpose.
  const scene: WiringScene = {
    nodes: [
      { id: "vw-parent", position: { x: 16, y: 40 }, data: {} },
      { id: "vw-sibling", position: { x: 300, y: 60 }, data: {} },
      { id: "vw-kid", position: { x: 0, y: 0 }, data: {}, parentId: "vw-parent" },
    ],
    edges: [
      { id: "vw-outer", source: "vw-parent", sourceHandle: "sig", target: "vw-sibling", targetHandle: "in" },
      { id: "vw-inner", source: "vw-parent", sourceHandle: "aux", target: "vw-kid", targetHandle: "in" },
    ],
  };
  const wires = sceneWires(scene);
  const wiredSet = wiredPorts(scene);
  const parentItems: PortEdgeItem[] = [
    { id: "sig", label: "sig" },
    { id: "aux", label: "aux" },
  ];
  const member: BlockMember | undefined =
    view === "expanded"
      ? {
          id: "kid",
          content: (
            <BlockPort id="vw-kid" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "vw-kid", wiredSet) } }}>
              <Block header="kid" width={90} height={56} />
            </BlockPort>
          ),
        }
      : undefined;

  return (
    <WireBench benchId={`views-${view}`} caption={`${view} view`} wires={wires} width={420} height={260}>
      <Positioned {...at(scene, "vw-parent")}>
        <BlockPort
          id="vw-parent"
          view={view}
          collapsePorts={view === "simple" ? true : undefined}
          edges={{ right: { items: withWiredState(parentItems, "vw-parent", wiredSet) } }}
        >
          <Block header="parent" width={220} height={180} members={member ? [member] : undefined} membersLayout="stack" memberGutter={20} />
        </BlockPort>
      </Positioned>
      <Positioned {...at(scene, "vw-sibling")}>
        <BlockPort id="vw-sibling" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "vw-sibling", wiredSet) } }}>
          <Block header="sib" width={100} height={60} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

export const ViewsWired: Story = {
  render: () => (
    <Stage>
      <ViewsWiredBench view="simple" />
      <ViewsWiredBench view="port" />
      <ViewsWiredBench view="expanded" />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    /* simple: both parent ports collapse to ONE dot; the outer wire
     * re-anchors there, and the inner (into-child) wire is unresolved —
     * there is no child rendered at all to resolve it against. */
    {
      const bench = benchOf(canvasElement, "views-simple");
      const collapsed = dotOf(bench, "vw-parent", "sig");
      await expect(collapsed.getAttribute("data-collapsed-ports")).toBe("sig,aux");
      await expect(stateOf(collapsed)).toBe("wired"); // any-member-wired (D-A2)
      const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      await waitFor(() => {
        expect(bench.querySelector('[data-wire-id="vw-outer"]')).not.toBeNull();
        expect(bench.querySelector('[data-wire-id="vw-inner"]')).toBeNull();
        expect(layer.getAttribute("data-unresolved-wires")).toBe("vw-inner");
      });
    }

    /* port: both ports render as their own rows; outer wire's terminal
     * moves to the "sig" ROW rather than the collapsed midpoint. Inner wire
     * is still unresolved — the child STILL is not rendered in port view. */
    {
      const bench = benchOf(canvasElement, "views-port");
      const sig = dotOf(bench, "vw-parent", "sig");
      await expect(sig.getAttribute("data-collapsed-ports")).toBeNull();
      await expect(stateOf(sig)).toBe("wired");
      const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      await waitFor(() => {
        expect(bench.querySelector('[data-wire-id="vw-outer"]')).not.toBeNull();
        expect(bench.querySelector('[data-wire-id="vw-inner"]')).toBeNull();
        expect(layer.getAttribute("data-unresolved-wires")).toBe("vw-inner");
      });
    }

    /* expanded: the child renders, and BOTH wires resolve. */
    {
      const bench = benchOf(canvasElement, "views-expanded");
      await expect(stateOf(dotOf(bench, "vw-parent", "sig"))).toBe("wired");
      await expect(stateOf(dotOf(bench, "vw-parent", "aux"))).toBe("wired");
      await expect(stateOf(dotOf(bench, "vw-kid", "in"))).toBe("wired");
      const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      await waitFor(() => {
        expect(bench.querySelector('[data-wire-id="vw-outer"]')).not.toBeNull();
        expect(bench.querySelector('[data-wire-id="vw-inner"]')).not.toBeNull();
        expect(layer.getAttribute("data-unresolved-wires")).toBe("");
      });
    }
  },
};

/* ==================================================================== */
/* MixedViewsCanvas — Zach's own scenario: "blocks that are mixed in the */
/* view they are in", wired across, in one fixture.                      */
/* ==================================================================== */

export const MixedViewsCanvas: Story = {
  render: () => {
    function MixedCanvas() {
      const scene: WiringScene = {
        nodes: [
          { id: "mv-simple", position: { x: 16, y: 70 }, data: {} },
          { id: "mv-port", position: { x: 260, y: 20 }, data: {} },
          { id: "mv-expanded", position: { x: 490, y: 10 }, data: {} },
        ],
        edges: [
          { id: "mv-1", source: "mv-simple", sourceHandle: "out", target: "mv-port", targetHandle: "in" },
          { id: "mv-2", source: "mv-port", sourceHandle: "fwd", target: "mv-expanded", targetHandle: "in" },
        ],
      };
      const wires = sceneWires(scene);
      const wiredSet = wiredPorts(scene);
      return (
        <WireBench benchId="mixed-views" caption="one canvas · three blocks, three different views" wires={wires} width={640} height={240}>
          <Positioned {...at(scene, "mv-simple")}>
            <BlockPort id="mv-simple" view="simple" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "mv-simple", wiredSet) } }}>
              <Block header="simple" width={120} height={90} showHeaderDivider={false} />
            </BlockPort>
          </Positioned>
          <Positioned {...at(scene, "mv-port")}>
            <BlockPort
              id="mv-port"
              view="port"
              edges={{
                left: { items: withWiredState([{ id: "in", label: "in" }], "mv-port", wiredSet) },
                right: { items: withWiredState([{ id: "fwd", label: "fwd" }], "mv-port", wiredSet) },
              }}
            >
              <Block header="port" width={130} height={100} />
            </BlockPort>
          </Positioned>
          <Positioned {...at(scene, "mv-expanded")}>
            <BlockPort id="mv-expanded" view="expanded" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "mv-expanded", wiredSet) } }}>
              <Block header="expanded" body={null} width={130} height={140} />
            </BlockPort>
          </Positioned>
        </WireBench>
      );
    }
    return (
      <Stage>
        <MixedCanvas />
      </Stage>
    );
  },
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "mixed-views");
    await expect(stateOf(dotOf(bench, "mv-simple", "out"))).toBe("wired");
    await expect(stateOf(dotOf(bench, "mv-port", "in"))).toBe("wired");
    await expect(stateOf(dotOf(bench, "mv-port", "fwd"))).toBe("wired");
    await expect(stateOf(dotOf(bench, "mv-expanded", "in"))).toBe("wired");
    const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
    await waitFor(() => {
      expect(bench.querySelector('[data-wire-id="mv-1"]')).not.toBeNull();
      expect(bench.querySelector('[data-wire-id="mv-2"]')).not.toBeNull();
      expect(layer.getAttribute("data-unresolved-wires")).toBe("");
    });

    // Endpoints really did land where each block's own VIEW put its ports —
    // the mid-canvas "port" block's ports sit as two independent rows, not
    // one collapsed dot, precisely because its view is "port", not "simple".
    const inDot = dotOf(bench, "mv-port", "in");
    const fwdDot = dotOf(bench, "mv-port", "fwd");
    await expect(inDot.getAttribute("data-collapsed-ports")).toBeNull();
    await expect(fwdDot.getAttribute("data-collapsed-ports")).toBeNull();
    await expect(dotOf(bench, "mv-simple", "out").getAttribute("data-collapsed-ports")).toBe("out");
  },
};
