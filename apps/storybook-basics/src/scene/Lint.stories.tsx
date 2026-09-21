import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { Port } from "../components/port";
import { Trace } from "../components/trace";
import type { TraceTerminalSpec } from "../components/trace.layout";
import { findingsFor, lintScene, LINT_RULE_IDS, type LintFinding, type LintRuleId, type LintScene } from "./lint";
import { portKey, wiredPorts, type SceneEdgeEnds } from "./scene";

/**
 * Blocks/Scene/Lint — the producer half of Zach's before/after ask
 * (2026-09-17, verbatim): "no linting you can show like a bunch of
 * potentially illegal wires, and then with it on, the illegal ones should
 * be highlighted. and then if you only have a subset of the rules on then
 * only a subset of the traces are in error state."
 *
 * `../scene/lint.ts`'s `lintScene` is the pure engine; this file is the
 * story-local host adapter that turns its findings into props on the
 * LANDED `diagnostics` axis components (Block/Port/Trace) — no component
 * under `src/components/**` is edited, per this lane's write-set boundary.
 *
 * WHY this bypasses `WireLayer`/`sceneWires` (`Scene.stories.tsx`'s own
 * pattern) rather than reusing them: `wiring.ts`'s `Wire` type carries no
 * `diagnostics` field, and `WireLayer` never forwards one to the `Trace`s
 * it renders — there is no way to mark an individual wire through that
 * path today. That is real, owed wiring for whoever next touches
 * `src/components/wiring.ts`/`wireLayer.tsx` (out of THIS lane's write set:
 * `src/components/**` is off-limits here). Until then, this story measures
 * its own ports and draws its own `Trace`s directly — the same DOM-
 * measurement technique `wireLayer.tsx`'s `resolveDot`/`centreOf` and
 * `BlockWiring.stories.tsx`'s `dotOf`/`dotCentre` already establish as the
 * house method, just applied to a `Trace` this file owns instead of one a
 * shared component owns.
 *
 * The demo scene packs one instance of every v1 rule into 7 nodes / 8
 * edges: `a`+`b` both feed `sink/in` (many-to-one), `a` double-wires `dup/in`
 * (duplicate-edge), `loop1`/`loop2` cycle, `selfy` wires itself
 * (self-connection — and, structurally, a 1-node cycle too: `findCycles`
 * really does count a self-loop as its own SCC, so BOTH rules legitimately
 * mark it, on two different carriers — the node glow and the wire
 * backdrop), and `b` also fans a wire at a node ("ghost") that was never
 * added to the scene (dangling-edge, drawn trailing into the dashed
 * placeholder so "points at nothing" is something you can actually see).
 */

const meta = {
  title: "Blocks/Scene/Lint",
  tags: ["area:blocks", "lane:lint-engine-2026-09-17"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The demo scene — hand-laid-out, small enough to eyeball every rule   */
/* ------------------------------------------------------------------ */

const NODE_W = 132;
const NODE_H = 60;
const BENCH_W = 760;
const BENCH_H = 430;
const GHOST_X = 300;
const GHOST_Y = 184;

interface DemoNode {
  id: string;
  label: string;
  x: number;
  y: number;
  hasIn?: boolean;
  hasOut?: boolean;
}

const NODES: DemoNode[] = [
  { id: "a", label: "a", x: 16, y: 16, hasOut: true },
  { id: "b", label: "b", x: 16, y: 160, hasOut: true },
  { id: "sink", label: "sink", x: 360, y: 88, hasIn: true },
  { id: "dup", label: "dup", x: 360, y: 224, hasIn: true },
  { id: "loop1", label: "loop1", x: 16, y: 328, hasIn: true, hasOut: true },
  { id: "loop2", label: "loop2", x: 300, y: 328, hasIn: true, hasOut: true },
  { id: "selfy", label: "selfy", x: 584, y: 328, hasIn: true, hasOut: true },
];

type DemoTarget = { nodeId: string; port: "in" } | { ghost: true };

interface DemoEdge {
  id: string;
  from: { nodeId: string; port: "out" };
  to: DemoTarget;
}

const EDGES: DemoEdge[] = [
  { id: "e-a-sink", from: { nodeId: "a", port: "out" }, to: { nodeId: "sink", port: "in" } },
  { id: "e-b-sink", from: { nodeId: "b", port: "out" }, to: { nodeId: "sink", port: "in" } }, // + e-a-sink => many-to-one on sink/in
  { id: "e-dup-1", from: { nodeId: "a", port: "out" }, to: { nodeId: "dup", port: "in" } },
  { id: "e-dup-2", from: { nodeId: "a", port: "out" }, to: { nodeId: "dup", port: "in" } }, // identical pair => duplicate-edge
  { id: "e-loop-fwd", from: { nodeId: "loop1", port: "out" }, to: { nodeId: "loop2", port: "in" } },
  { id: "e-loop-back", from: { nodeId: "loop2", port: "out" }, to: { nodeId: "loop1", port: "in" } }, // + e-loop-fwd => cycle
  { id: "e-self", from: { nodeId: "selfy", port: "out" }, to: { nodeId: "selfy", port: "in" } }, // self-connection (+ incidental 1-node cycle)
  { id: "e-dangling", from: { nodeId: "b", port: "out" }, to: { ghost: true } }, // "ghost" is not a node in the scene
];

function domKey(target: { nodeId: string; port: string } | { ghost: true }): string {
  return "ghost" in target ? "ghost" : `${target.nodeId}/${target.port}`;
}

function toSceneEdges(edges: readonly DemoEdge[]): (SceneEdgeEnds & { id: string })[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    sourceHandle: edge.from.port,
    target: "ghost" in edge.to ? "ghost" : edge.to.nodeId,
    targetHandle: "ghost" in edge.to ? "in" : edge.to.port,
  }));
}

function portsOfNode(nodeId: string): readonly string[] | undefined {
  const node = NODES.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined; // "ghost" — unknown vocabulary, no port judgement
  const ports: string[] = [];
  if (node.hasIn) ports.push("in");
  if (node.hasOut) ports.push("out");
  return ports;
}

const SCENE: LintScene = { nodes: NODES.map((node) => ({ id: node.id })), edges: toSceneEdges(EDGES) };
const WIRED = wiredPorts(SCENE);

/* ------------------------------------------------------------------ */
/* The host adapter — findings in, component props out                 */
/* ------------------------------------------------------------------ */

function DemoScene({ rules }: { rules: readonly LintRuleId[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Map<string, { from: TraceTerminalSpec; to: TraceTerminalSpec }>>(new Map());

  const findings = useMemo<LintFinding[]>(() => lintScene(SCENE, { rules, portsOf: portsOfNode }), [rules]);

  // Real DOM measurement, once per mount — this bench's layout is static
  // (no drag, no resize), so a single post-commit measure is enough; see
  // this file's own header for why it measures rather than hand-computes
  // pixel coordinates for two-ended shapes at all.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const next = new Map<string, { from: TraceTerminalSpec; to: TraceTerminalSpec }>();
    for (const edge of EDGES) {
      const fromEl = container.querySelector<HTMLElement>(`[data-port-id="${domKey(edge.from)}"]`);
      const toEl = container.querySelector<HTMLElement>(`[data-port-id="${domKey(edge.to)}"]`);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      // Every `out` port sits on its block's RIGHT wall and every `in`
      // port (real or ghost) on its block's LEFT wall — `wireLayer.tsx`'s
      // own rule, restated for this story's fixed layout: `from.dir` is
      // the wall's own outward direction; `to.dir` is `OPPOSITE_DIR` of
      // it. Both resolve to "right" here because every wall in this bench
      // is either an out-right or an in-left — see wireLayer.tsx's header
      // for the general rule this specializes.
      next.set(edge.id, {
        from: { x: fr.left + fr.width / 2 - rect.left, y: fr.top + fr.height / 2 - rect.top, dir: "right" },
        to: { x: tr.left + tr.width / 2 - rect.left, y: tr.top + tr.height / 2 - rect.top, dir: "right" },
      });
    }
    setGeometry(next);
  }, []);

  return (
    <div ref={containerRef} data-testid="lint-bench" style={{ position: "relative", width: BENCH_W, height: BENCH_H, fontFamily: "ui-sans-serif, sans-serif" }}>
      {NODES.map((node) => {
        const nodeFindings = findingsFor(findings, { kind: "node", id: node.id });
        const inFindings = node.hasIn ? findingsFor(findings, { kind: "port", id: portKey(node.id, "in") }) : [];
        const outFindings = node.hasOut ? findingsFor(findings, { kind: "port", id: portKey(node.id, "out") }) : [];
        return (
          <div key={node.id} data-node-id={node.id} style={{ position: "absolute", left: node.x, top: node.y, width: NODE_W, height: NODE_H }}>
            <Block header={node.label} width={NODE_W} height={NODE_H} diagnostics={nodeFindings} />
            {node.hasIn && (
              <div data-port-id={portKey(node.id, "in")} style={{ position: "absolute", left: -8, top: NODE_H / 2 - 8 }}>
                <Port state={WIRED.has(portKey(node.id, "in")) ? "wired" : "empty"} diagnostics={inFindings} />
              </div>
            )}
            {node.hasOut && (
              <div data-port-id={portKey(node.id, "out")} style={{ position: "absolute", right: -8, top: NODE_H / 2 - 8 }}>
                <Port state={WIRED.has(portKey(node.id, "out")) ? "wired" : "empty"} diagnostics={outFindings} />
              </div>
            )}
          </div>
        );
      })}
      {/* The dangling edge's target — deliberately NOT a Port: nothing in
          the scene names it, so a real port dot here would be a lie. A
          dashed stand-in is the honest picture of "this wire points at
          nothing". */}
      <div
        data-port-id="ghost"
        title='"ghost" is not in the scene'
        style={{
          position: "absolute",
          left: GHOST_X,
          top: GHOST_Y,
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1.5px dashed var(--muted-foreground)",
        }}
      />
      <span style={{ position: "absolute", left: GHOST_X + 20, top: GHOST_Y - 6, fontSize: 11, color: "var(--muted-foreground)" }}>ghost (missing)</span>
      <svg data-slot="lint-wire-layer" width={BENCH_W} height={BENCH_H} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
        {EDGES.map((edge) => {
          const g = geometry.get(edge.id);
          if (!g) return null;
          const edgeFindings = findingsFor(findings, { kind: "edge", id: edge.id });
          return (
            <g key={edge.id} data-wire-id={edge.id}>
              <Trace id={edge.id} from={g.from} to={g.to} routing="curved" diagnostics={edgeFindings} terminals={false} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend() {
  return (
    <p style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 700, marginBottom: 12 }}>
      a+b both feed sink/in (many-to-one) · a double-wires dup/in (duplicate-edge) · loop1⇄loop2 (cycle) · selfy wires itself
      (self-connection, and structurally a 1-node cycle too) · b also wires a node that was never added to the scene (dangling-edge,
      the dashed "ghost" dot).
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement helpers for play functions                              */
/* ------------------------------------------------------------------ */

async function waitForBenchMeasured(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => {
    const wires = canvasElement.querySelectorAll('[data-slot="trace"]');
    if (wires.length < EDGES.length) throw new Error(`expected ${EDGES.length} rendered traces, found ${wires.length} — measurement effect hasn't settled`);
  });
}

function nodeFlagOf(canvasElement: HTMLElement, nodeId: string): Element | null {
  return canvasElement.querySelector(`[data-node-id="${nodeId}"] [data-slot="diagnostic-flag"]`);
}

function portDiagnosticOf(canvasElement: HTMLElement, key: string): string | null {
  return canvasElement.querySelector(`[data-port-id="${key}"] [data-slot="port-dot"]`)?.getAttribute("data-diagnostic") ?? null;
}

function wireDiagnosticOf(canvasElement: HTMLElement, edgeId: string): string | null {
  return canvasElement.querySelector(`[data-wire-id="${edgeId}"] [data-slot="trace"]`)?.getAttribute("data-diagnostic") ?? null;
}

/* ------------------------------------------------------------------ */
/* Before — no linting at all                                          */
/* ------------------------------------------------------------------ */

export const NoLinting: Story = {
  name: "Before — linting off",
  render: () => (
    <div>
      <Legend />
      <DemoScene rules={[]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("lint-bench")).toBeInTheDocument();

    // Nothing is marked anywhere — no flags, no port halos, no wire marks —
    // even though every scene fact the rules WOULD catch is present.
    expect(canvasElement.querySelectorAll('[data-slot="diagnostic-flag"]')).toHaveLength(0);
    expect(canvasElement.querySelectorAll('[data-slot="port-dot"][data-diagnostic]')).toHaveLength(0);
    expect(canvasElement.querySelectorAll('[data-slot="trace"][data-diagnostic]')).toHaveLength(0);
  },
};

/* ------------------------------------------------------------------ */
/* After — every rule enabled                                          */
/* ------------------------------------------------------------------ */

export const AllRulesEnabled: Story = {
  name: "After — every rule on",
  render: () => (
    <div>
      <Legend />
      <DemoScene rules={LINT_RULE_IDS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);

    // cycle — node-level marks on loop1, loop2, selfy; nowhere else.
    for (const id of ["loop1", "loop2", "selfy"]) await expect(nodeFlagOf(canvasElement, id)).not.toBeNull();
    for (const id of ["a", "b", "sink", "dup"]) await expect(nodeFlagOf(canvasElement, id)).toBeNull();

    // many-to-one — the PORT sink/in, not either feeding edge.
    expect(portDiagnosticOf(canvasElement, "sink/in")).toBe("error");
    expect(wireDiagnosticOf(canvasElement, "e-a-sink")).toBeNull();
    expect(wireDiagnosticOf(canvasElement, "e-b-sink")).toBeNull();

    // duplicate-edge — both copies, warning severity.
    expect(wireDiagnosticOf(canvasElement, "e-dup-1")).toBe("warning");
    expect(wireDiagnosticOf(canvasElement, "e-dup-2")).toBe("warning");

    // self-connection — the wire itself, error severity.
    expect(wireDiagnosticOf(canvasElement, "e-self")).toBe("error");

    // dangling-edge — the wire trailing into "ghost", error severity.
    expect(wireDiagnosticOf(canvasElement, "e-dangling")).toBe("error");

    // cycle marks NODES, never the loop's own edges.
    expect(wireDiagnosticOf(canvasElement, "e-loop-fwd")).toBeNull();
    expect(wireDiagnosticOf(canvasElement, "e-loop-back")).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* Subset — Zach's own requirement, made mechanical                    */
/* ------------------------------------------------------------------ */

export const OnlyManyToOneEnabled: Story = {
  name: "Subset — only many-to-one on",
  render: () => (
    <div>
      <Legend />
      <DemoScene rules={["many-to-one"]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);

    // The one thing many-to-one marks — present.
    expect(portDiagnosticOf(canvasElement, "sink/in")).toBe("error");

    // Nothing else — no flags, no other port halos, no wire marks. This is
    // the mechanical proof of "if you only have a subset of the rules on
    // then only a subset of the traces are in error state."
    expect(canvasElement.querySelectorAll('[data-slot="diagnostic-flag"]')).toHaveLength(0);
    expect(canvasElement.querySelectorAll('[data-slot="port-dot"][data-diagnostic]')).toHaveLength(1);
    expect(canvasElement.querySelectorAll('[data-slot="trace"][data-diagnostic]')).toHaveLength(0);
  },
};

export const OnlyCycleAndSelfConnectionEnabled: Story = {
  name: "Subset — cycle + self-connection on",
  render: () => (
    <div>
      <Legend />
      <DemoScene rules={["cycle", "self-connection"]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);

    for (const id of ["loop1", "loop2", "selfy"]) await expect(nodeFlagOf(canvasElement, id)).not.toBeNull();
    expect(wireDiagnosticOf(canvasElement, "e-self")).toBe("error");

    // many-to-one and duplicate-edge are OFF — their carriers stay clean.
    expect(portDiagnosticOf(canvasElement, "sink/in")).toBeNull();
    expect(wireDiagnosticOf(canvasElement, "e-dup-1")).toBeNull();
    expect(wireDiagnosticOf(canvasElement, "e-dangling")).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* Interactive — live rule toggles, Zach's own click-through            */
/* ------------------------------------------------------------------ */

interface InteractiveArgs {
  "dangling-edge": boolean;
  cycle: boolean;
  "duplicate-edge": boolean;
  "many-to-one": boolean;
  "self-connection": boolean;
}

const RULE_ARG_LABELS: Record<keyof InteractiveArgs, string> = {
  "dangling-edge": "dangling-edge",
  cycle: "cycle",
  "duplicate-edge": "duplicate-edge",
  "many-to-one": "many-to-one",
  "self-connection": "self-connection",
};

export const Interactive: StoryObj<Meta<InteractiveArgs>> = {
  name: "Interactive — toggle rules live",
  argTypes: Object.fromEntries(Object.keys(RULE_ARG_LABELS).map((id) => [id, { control: "boolean", name: id }])),
  args: {
    "dangling-edge": false,
    cycle: false,
    "duplicate-edge": false,
    "many-to-one": false,
    "self-connection": false,
  },
  render: (args) => {
    const enabled = (Object.keys(args) as LintRuleId[]).filter((id) => args[id as keyof InteractiveArgs]);
    return (
      <div>
        <Legend />
        <p style={{ fontSize: 12, marginBottom: 8 }}>
          Rules enabled: <code>{enabled.length ? enabled.join(", ") : "(none)"}</code>
        </p>
        <DemoScene rules={enabled} />
      </div>
    );
  },
};
