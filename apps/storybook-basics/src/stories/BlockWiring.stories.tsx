import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import type { BlockMember } from "../components/blockMembers";
import { BlockPort } from "../components/blockPort";
import type { BlockView } from "../components/blockPort.layout";
import type { PortEdgeItem } from "../components/portEdge";
import { TRACE_TERMINAL_GAP } from "../components/trace";
import { DIR_VECTOR, OPPOSITE_DIR, type TraceDir } from "../components/trace.layout";
import { DUPLICATE_FAN_PX, wiredPortKeys, withWiredState, type Wire } from "../components/wiring";
import { WireLayer } from "../components/wireLayer";

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
 * drawn line, which `Trace` deliberately pulls back `TRACE_TERMINAL_GAP`
 * (16px) short of it so the arrowhead and the port's own ring never
 * collide (`trace.tsx`'s own doc on `TRACE_TERMINAL_GAP`). Reconstructing
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
  const trueLocal = {
    x: local.x + sign * DIR_VECTOR[dir].x * TRACE_TERMINAL_GAP,
    y: local.y + sign * DIR_VECTOR[dir].y * TRACE_TERMINAL_GAP,
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
  const wires: Wire[] = wired ? [{ id: "oto-w1", from: { blockId: "oto-a", portId: "out" }, to: { blockId: "oto-b", portId: "in" } }] : [];
  const wiredSet = wiredPortKeys(wires);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" data-testid="oto-toggle" onClick={() => setWired((w) => !w)} style={{ alignSelf: "flex-start", fontSize: 12, padding: "3px 8px" }}>
        {wired ? "remove wire" : "add wire"}
      </button>
      <WireBench benchId="outside-to-outside" caption="outside ↔ outside" wires={wires} width={360} height={140}>
        <Positioned x={16} y={30}>
          <BlockPort id="oto-a" view="port" edges={{ right: { items: withWiredState(items.out, "oto-a", wiredSet) } }}>
            <Block header="A" width={120} height={80} />
          </BlockPort>
        </Positioned>
        <Positioned x={216} y={30}>
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
  const wires: Wire[] = targets.map((t) => ({ id: `fo-w-${t}`, from: { blockId: "fo-src", portId: "cmd" }, to: { blockId: `fo-${t}`, portId: "in" } }));
  const wiredSet = wiredPortKeys(wires);
  return (
    <WireBench benchId="fan-out" caption="fan-out · 1 → 3" wires={wires} width={360} height={260}>
      <Positioned x={16} y={90}>
        <BlockPort id="fo-src" view="port" edges={{ right: { items: withWiredState(src, "fo-src", wiredSet) } }}>
          <Block header="src" width={100} height={70} />
        </BlockPort>
      </Positioned>
      {targets.map((t, i) => (
        <Positioned key={t} x={230} y={10 + i * 90}>
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
  const wires: Wire[] = sources.map((s) => ({ id: `fi-w-${s}`, from: { blockId: `fi-${s}`, portId: "out" }, to: { blockId: "fi-dst", portId: "sum" } }));
  const wiredSet = wiredPortKeys(wires);
  return (
    <WireBench benchId="fan-in" caption="fan-in · 3 → 1" wires={wires} width={360} height={260}>
      {sources.map((s, i) => (
        <Positioned key={s} x={16} y={10 + i * 90}>
          <BlockPort id={`fi-${s}`} view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], `fi-${s}`, wiredSet) } }}>
            <Block header={s} width={100} height={60} />
          </BlockPort>
        </Positioned>
      ))}
      <Positioned x={230} y={90}>
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
  const wires: Wire[] = [
    { id: "dup-w1", from: { blockId: "dup-a", portId: "out" }, to: { blockId: "dup-b", portId: "in" } },
    { id: "dup-w2", from: { blockId: "dup-a", portId: "out" }, to: { blockId: "dup-b", portId: "in" } },
  ];
  const wiredSet = wiredPortKeys(wires);
  return (
    <WireBench benchId="duplicates" caption="duplicates · same two ports, twice" wires={wires} width={360} height={140}>
      <Positioned x={16} y={30}>
        <BlockPort id="dup-a" view="port" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "dup-a", wiredSet) } }}>
          <Block header="A" width={120} height={80} />
        </BlockPort>
      </Positioned>
      <Positioned x={216} y={30}>
        <BlockPort id="dup-b" view="port" edges={{ left: { items: withWiredState([{ id: "in", label: "in" }], "dup-b", wiredSet) } }}>
          <Block header="B" width={120} height={80} />
        </BlockPort>
      </Positioned>
    </WireBench>
  );
}

/** A block's own left → its own right — no rule forbids it. */
function SelfWireBench() {
  const wires: Wire[] = [{ id: "self-w1", from: { blockId: "self-a", portId: "in" }, to: { blockId: "self-a", portId: "out" } }];
  const wiredSet = wiredPortKeys(wires);
  return (
    <WireBench benchId="self-wire" caption="self-wire · a block's own left → right" wires={wires} width={280} height={140}>
      <Positioned x={80} y={30}>
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
  const wires: Wire[] = [{ id: "child-w1", from: { blockId: "child-parent", portId: "out" }, to: { blockId: "child-kid", portId: "in" } }];
  const wiredSet = wiredPortKeys(wires);
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
      <Positioned x={16} y={20}>
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

    /* ---- duplicates : two wires, same pair, visibly fanned apart ---- */
    {
      const bench = benchOf(canvasElement, "duplicates");
      const g1 = await waitForWireGroup(bench, "dup-w1");
      const g2 = await waitForWireGroup(bench, "dup-w2");
      const l1 = traceLineOf(g1);
      const l2 = traceLineOf(g2);
      const mid1 = l1.getPointAtLength(l1.getTotalLength() / 2);
      const mid2 = l2.getPointAtLength(l2.getTotalLength() / 2);
      const separation = Math.hypot(mid2.x - mid1.x, mid2.y - mid1.y);
      if (!(separation >= DUPLICATE_FAN_PX / 2)) {
        throw new Error(`duplicates · the two wires' rendered midpoints are only ${separation.toFixed(2)}px apart (want ≥ ${DUPLICATE_FAN_PX / 2}px) — they read as one line drawn twice`);
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
  const wires: Wire[] = [
    { id: "vw-outer", from: { blockId: "vw-parent", portId: "sig" }, to: { blockId: "vw-sibling", portId: "in" } },
    { id: "vw-inner", from: { blockId: "vw-parent", portId: "aux" }, to: { blockId: "vw-kid", portId: "in" } },
  ];
  const wiredSet = wiredPortKeys(wires);
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
      <Positioned x={16} y={40}>
        <BlockPort
          id="vw-parent"
          view={view}
          collapsePorts={view === "simple" ? true : undefined}
          edges={{ right: { items: withWiredState(parentItems, "vw-parent", wiredSet) } }}
        >
          <Block header="parent" width={220} height={180} members={member ? [member] : undefined} membersLayout="stack" memberGutter={20} />
        </BlockPort>
      </Positioned>
      <Positioned x={300} y={60}>
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
      const wires: Wire[] = [
        { id: "mv-1", from: { blockId: "mv-simple", portId: "out" }, to: { blockId: "mv-port", portId: "in" } },
        { id: "mv-2", from: { blockId: "mv-port", portId: "fwd" }, to: { blockId: "mv-expanded", portId: "in" } },
      ];
      const wiredSet = wiredPortKeys(wires);
      return (
        <WireBench benchId="mixed-views" caption="one canvas · three blocks, three different views" wires={wires} width={640} height={240}>
          <Positioned x={16} y={70}>
            <BlockPort id="mv-simple" view="simple" edges={{ right: { items: withWiredState([{ id: "out", label: "out" }], "mv-simple", wiredSet) } }}>
              <Block header="simple" width={120} height={90} showHeaderDivider={false} />
            </BlockPort>
          </Positioned>
          <Positioned x={260} y={20}>
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
          <Positioned x={490} y={10}>
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
