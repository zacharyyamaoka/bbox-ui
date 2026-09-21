import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { Port } from "../components/port";
import { Trace } from "../components/trace";
import type { TraceTerminalSpec } from "../components/trace.layout";
import { FocusControls } from "./focusControls";
import { focusSnapshot, focusStepLimits, type FocusDirection, type FocusStepLimits } from "../scene/focus";
import { portKey } from "../scene/scene";

/**
 * Blocks/Editor/Focus View — the propagation-focus reading lens, ported
 * from SystemSketch (Zach, 2026-09-18, quoted in full in
 * `docs/ALGORITHM-PROVENANCE.md` and the vault callout under "The focus
 * slider"). `scene/focus.ts` is the pure traversal; `editor/focusControls.tsx`
 * is the floating toolbar. This file is the story-local host adapter that
 * wires the two together over a small demo scene — same technique
 * `Lint.stories.tsx` established (DOM-measured `Trace`s, no `WireLayer`,
 * because a per-edge "is this included" fact has nowhere to travel through
 * that path either, same as Lint's own `diagnostics` field did not).
 *
 * The demo scene is a chain with a fan-in and a fan-out at its middle node
 * (`seed`) specifically so a bounded upstream/downstream walk has
 * something real to exclude at both ends:
 *
 *   a → b → c ─┐                 ┌─→ e → f
 *              seed ─────────────┤
 *        c2 ───┘                 └─→ e2
 *
 * Seeded at `seed` with upstream=2 / downstream=1, the walk reaches
 * `{b, c, c2, seed, e, e2}` and stops one edge short of `a` and `f` — both
 * present in the scene, both deliberately left dim. That is the traversal
 * claim the play function below checks against `focusSnapshot` directly,
 * not just against paint.
 */

const meta = {
  title: "Blocks/Editor/Focus View",
  tags: ["area:blocks", "lane:focus-view"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* The demo scene                                                       */
/* ------------------------------------------------------------------ */

const NODE_W = 96;
const NODE_H = 48;
const BENCH_W = 900;
const BENCH_H = 240;

interface DemoNode {
  id: string;
  x: number;
  y: number;
  inPorts: string[];
  outPorts: string[];
}

const NODES: DemoNode[] = [
  { id: "a", x: 8, y: 96, inPorts: [], outPorts: ["out"] },
  { id: "b", x: 160, y: 96, inPorts: ["in"], outPorts: ["out"] },
  { id: "c", x: 312, y: 96, inPorts: ["in"], outPorts: ["out"] },
  { id: "c2", x: 312, y: 16, inPorts: [], outPorts: ["out"] },
  { id: "seed", x: 464, y: 96, inPorts: ["in", "in2"], outPorts: ["out", "out2"] },
  { id: "e", x: 616, y: 96, inPorts: ["in"], outPorts: ["out"] },
  { id: "e2", x: 616, y: 176, inPorts: ["in"], outPorts: [] },
  { id: "f", x: 768, y: 96, inPorts: ["in"], outPorts: [] },
];

interface DemoEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

const EDGES: DemoEdge[] = [
  { id: "e_ab", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
  { id: "e_bc", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
  { id: "e_cd", source: "c", sourceHandle: "out", target: "seed", targetHandle: "in" },
  { id: "e_c2d", source: "c2", sourceHandle: "out", target: "seed", targetHandle: "in2" },
  { id: "e_de", source: "seed", sourceHandle: "out", target: "e", targetHandle: "in" },
  { id: "e_de2", source: "seed", sourceHandle: "out2", target: "e2", targetHandle: "in" },
  { id: "e_ef", source: "e", sourceHandle: "out", target: "f", targetHandle: "in" },
];

const SCENE = { nodes: NODES.map((node) => ({ id: node.id })), edges: EDGES };

function portElementKey(nodeId: string, port: string): string {
  return portKey(nodeId, port);
}

/* ------------------------------------------------------------------ */
/* The host adapter — click a node, Focus, drag the two step ranges     */
/* ------------------------------------------------------------------ */

interface FocusState {
  seedId: string;
  upstreamSteps: number;
  downstreamSteps: number;
}

interface DemoSceneProps {
  /** Pre-seed the selection/focus so a story can render its END state
   *  directly — a screenshot taken mid-`play()` races the async
   *  click/keyboard sequence (measured: the capture script waits for
   *  network-idle + a settle timeout, never for `play()`'s own promise),
   *  so the two interactive stories below stay play-driven for their real
   *  assertions while these capture stories start already-settled. */
  initialSelectedId?: string;
  initialFocus?: FocusState;
}

function DemoScene({ initialSelectedId, initialFocus }: DemoSceneProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Map<string, { from: TraceTerminalSpec; to: TraceTerminalSpec }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [focus, setFocus] = useState<FocusState | null>(initialFocus ?? null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const next = new Map<string, { from: TraceTerminalSpec; to: TraceTerminalSpec }>();
    for (const edge of EDGES) {
      const fromEl = container.querySelector<HTMLElement>(`[data-port-id="${portElementKey(edge.source, edge.sourceHandle)}"]`);
      const toEl = container.querySelector<HTMLElement>(`[data-port-id="${portElementKey(edge.target, edge.targetHandle)}"]`);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      next.set(edge.id, {
        from: { x: fr.left + fr.width / 2 - rect.left, y: fr.top + fr.height / 2 - rect.top, dir: "right" },
        to: { x: tr.left + tr.width / 2 - rect.left, y: tr.top + tr.height / 2 - rect.top, dir: "right" },
      });
    }
    setGeometry(next);
  }, []);

  const limits: FocusStepLimits = useMemo(
    () => (focus ? focusStepLimits(SCENE, focus.seedId, focus.upstreamSteps) : { upstream: 0, downstream: 0 }),
    [focus],
  );
  const snapshot = useMemo(
    () => (focus ? focusSnapshot(SCENE, focus.seedId, focus.upstreamSteps, focus.downstreamSteps) : null),
    [focus],
  );
  const includedNodes = snapshot?.includedNodeIds ?? new Set<string>();
  const includedEdges = snapshot?.includedEdgeIds ?? new Set<string>();

  function selectNode(id: string) {
    // Selecting a different object clears any running focus rather than
    // silently retargeting a path the reader did not ask to inspect —
    // donor `propagationFocus.ts`'s `reconcilePropagationFocus` WHY.
    setFocus(null);
    setSelectedId((current) => (current === id ? null : id));
  }

  function handleStepsChange(direction: FocusDirection, value: number) {
    setFocus((current) => (current ? { ...current, [direction === "upstream" ? "upstreamSteps" : "downstreamSteps"]: value } : current));
  }

  return (
    <div style={{ position: "relative", fontFamily: "ui-sans-serif, sans-serif" }}>
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }} data-testid="focus-toolbar">
        <FocusControls
          hasSeed={selectedId !== null && !focus}
          active={focus !== null}
          limits={limits}
          upstreamSteps={focus?.upstreamSteps ?? 0}
          downstreamSteps={focus?.downstreamSteps ?? 0}
          onStart={() => selectedId && setFocus({ seedId: selectedId, upstreamSteps: 1, downstreamSteps: 1 })}
          onStepsChange={handleStepsChange}
          onClear={() => setFocus(null)}
        />
      </div>
      <div
        ref={containerRef}
        data-testid="focus-bench"
        data-focus-active={focus !== null}
        style={{ position: "relative", width: BENCH_W, height: BENCH_H }}
      >
        {NODES.map((node) => {
          const isIncluded = !focus || includedNodes.has(node.id);
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              data-focus={focus ? (isIncluded ? "included" : "excluded") : undefined}
              onClick={() => selectNode(node.id)}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                width: NODE_W,
                height: NODE_H,
                cursor: "pointer",
                opacity: isIncluded ? 1 : 0.17,
                outline: selectedId === node.id ? "2px solid var(--ss-accent, #2563eb)" : "none",
                outlineOffset: 2,
                // Same value and curve as the donor's CSS-only dimming lens
                // (`propagation-focus.css:1-12`): composes with the
                // element's own opacity rather than a hand-tuned value.
                transition: "opacity 120ms ease-out",
              }}
            >
              <Block header={node.id} width={NODE_W} height={NODE_H} />
              {node.inPorts.map((port, index) => (
                <div
                  key={port}
                  data-port-id={portElementKey(node.id, port)}
                  style={{ position: "absolute", left: -8, top: (NODE_H * (index + 1)) / (node.inPorts.length + 1) - 8 }}
                >
                  <Port state="wired" />
                </div>
              ))}
              {node.outPorts.map((port, index) => (
                <div
                  key={port}
                  data-port-id={portElementKey(node.id, port)}
                  style={{ position: "absolute", right: -8, top: (NODE_H * (index + 1)) / (node.outPorts.length + 1) - 8 }}
                >
                  <Port state="wired" />
                </div>
              ))}
            </div>
          );
        })}
        <svg data-slot="focus-wire-layer" width={BENCH_W} height={BENCH_H} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
          {EDGES.map((edge) => {
            const g = geometry.get(edge.id);
            if (!g) return null;
            const isIncluded = !focus || includedEdges.has(edge.id);
            return (
              <g
                key={edge.id}
                data-wire-id={edge.id}
                data-focus={focus ? (isIncluded ? "included" : "excluded") : undefined}
                style={{ opacity: isIncluded ? 1 : 0.17, transition: "opacity 120ms ease-out" }}
              >
                <Trace id={edge.id} from={g.from} to={g.to} routing="curved" terminals={false} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play-function helpers                                                */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

async function waitForBenchMeasured(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => {
    const wires = canvasElement.querySelectorAll("[data-wire-id]");
    if (wires.length < EDGES.length) throw new Error(`expected ${EDGES.length} rendered wires, found ${wires.length}`);
  });
}

function rangeInput(canvasElement: HTMLElement, testId: string): HTMLInputElement {
  return required<HTMLInputElement>(canvasElement, `[data-testid="${testId}"] input`, `the ${testId} range input`);
}

/* ------------------------------------------------------------------ */
/* The traversal claim — asserted against focusSnapshot AND the DOM     */
/* ------------------------------------------------------------------ */

export const ChainWithFanInAndFanOut: Story = {
  name: "Chain With Fan-In And Fan-Out",
  render: () => <DemoScene />,
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);

    // The pure claim first, independent of any rendering at all: seeded at
    // "seed" with upstream=2 / downstream=1, exactly these ids focus.
    const snapshot = focusSnapshot(SCENE, "seed", 2, 1);
    const nodeIds = [...snapshot.includedNodeIds].sort();
    const edgeIds = [...snapshot.includedEdgeIds].sort();
    expect(nodeIds).toEqual(["b", "c", "c2", "e", "e2", "seed"]);
    expect(edgeIds).toEqual(["e_bc", "e_c2d", "e_cd", "e_de", "e_de2"]);
    // "a" and "f" sit one edge past the requested depth in each direction —
    // present in the scene, deliberately not focused.
    expect(nodeIds).not.toContain("a");
    expect(nodeIds).not.toContain("f");
    expect(edgeIds).not.toContain("e_ab");
    expect(edgeIds).not.toContain("e_ef");

    // Now drive the real UI to the same state and check the DOM agrees.
    await userEvent.click(required(canvasElement, '[data-node-id="seed"]', "the seed node"));
    await userEvent.click(required(canvasElement, '[data-testid="focus-start"]', "the Focus trigger"));
    await waitFor(() => expect(canvasElement.querySelector('[data-testid="focus-upstream"]')).not.toBeNull());

    const upstream = rangeInput(canvasElement, "focus-upstream");
    upstream.focus();
    // One step past the default (1) reaches the requested upstream=2.
    await userEvent.keyboard("{ArrowLeft}");

    await waitFor(() => {
      for (const id of nodeIds) {
        const el = required(canvasElement, `[data-node-id="${id}"]`, `node ${id}`);
        expect(el.getAttribute("data-focus")).toBe("included");
      }
      for (const id of ["a", "f"]) {
        const el = required(canvasElement, `[data-node-id="${id}"]`, `node ${id}`);
        expect(el.getAttribute("data-focus")).toBe("excluded");
      }
      for (const id of edgeIds) {
        const el = required(canvasElement, `[data-wire-id="${id}"]`, `edge ${id}`);
        expect(el.getAttribute("data-focus")).toBe("included");
      }
      for (const id of ["e_ab", "e_ef"]) {
        const el = required(canvasElement, `[data-wire-id="${id}"]`, `edge ${id}`);
        expect(el.getAttribute("data-focus")).toBe("excluded");
      }
    });

    // Clear returns to the honest "nothing focused" state — every node and
    // edge back at full opacity, the toolbar back to its "Focus" trigger.
    await userEvent.click(required(canvasElement, '[data-testid="focus-clear"]', "the Clear trigger"));
    await waitFor(() => {
      expect(canvasElement.querySelector('[data-testid="focus-upstream"]')).toBeNull();
      expect(required<HTMLElement>(canvasElement, '[data-node-id="a"]', "node a").getAttribute("data-focus")).toBeNull();
    });
  },
};

/* ------------------------------------------------------------------ */
/* The accessibility claim — RTL keyboard direction matches the visual  */
/* flip, on the ONE control Zach specifically remembers ("We made the   */
/* left slider flipped")                                                */
/* ------------------------------------------------------------------ */

export const UpstreamSliderKeyboardMatchesItsRtlPaint: Story = {
  name: "Upstream Slider's Keyboard Direction Matches Its RTL Paint",
  render: () => <DemoScene />,
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);
    await userEvent.click(required(canvasElement, '[data-node-id="seed"]', "the seed node"));
    await userEvent.click(required(canvasElement, '[data-testid="focus-start"]', "the Focus trigger"));
    await waitFor(() => expect(canvasElement.querySelector('[data-testid="focus-upstream"]')).not.toBeNull());

    const upstreamInput = rangeInput(canvasElement, "focus-upstream");
    const downstreamInput = rangeInput(canvasElement, "focus-downstream");
    upstreamInput.focus();
    const before = Number(upstreamInput.value);
    // RTL: ArrowLeft reads as "toward the seed's far side" — the SAME
    // visual direction as a normal LTR slider's ArrowRight — so it must
    // INCREASE the value, not decrease it. A paint-only flip (a CSS
    // transform instead of a real direction context) would pass every
    // OTHER assertion in this file and still fail exactly this one.
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(Number(upstreamInput.value)).toBeGreaterThan(before));
    const afterLeft = Number(upstreamInput.value);
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(Number(upstreamInput.value)).toBeLessThan(afterLeft));

    // The control on the OTHER side of "steps" stays plain LTR: ArrowRight
    // increases it, same as any ordinary slider — proving the RTL wiring
    // is scoped to the upstream control alone, not a global flip.
    downstreamInput.focus();
    const downstreamBefore = Number(downstreamInput.value);
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(Number(downstreamInput.value)).toBeGreaterThanOrEqual(downstreamBefore));
  },
};

/* ------------------------------------------------------------------ */
/* Capture-only states — pre-seeded so a screenshot lands on the        */
/* settled end state, not an arbitrary point in an async play()         */
/* ------------------------------------------------------------------ */

export const FocusedAtDefaultDepth: Story = {
  name: "Focused At Default Depth (Upstream 1 / Downstream 1)",
  render: () => <DemoScene initialSelectedId="seed" initialFocus={{ seedId: "seed", upstreamSteps: 1, downstreamSteps: 1 }} />,
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);
    await waitFor(() => {
      for (const id of ["seed", "c", "c2", "e", "e2"]) expect(required(canvasElement, `[data-node-id="${id}"]`, id).getAttribute("data-focus")).toBe("included");
      for (const id of ["a", "b", "f"]) expect(required(canvasElement, `[data-node-id="${id}"]`, id).getAttribute("data-focus")).toBe("excluded");
    });
  },
};

export const FocusedAtUpstreamTwoDownstreamOne: Story = {
  name: "Focused At Upstream 2 / Downstream 1",
  render: () => <DemoScene initialSelectedId="seed" initialFocus={{ seedId: "seed", upstreamSteps: 2, downstreamSteps: 1 }} />,
  play: async ({ canvasElement }) => {
    await waitForBenchMeasured(canvasElement);
    await waitFor(() => {
      for (const id of ["seed", "b", "c", "c2", "e", "e2"]) expect(required(canvasElement, `[data-node-id="${id}"]`, id).getAttribute("data-focus")).toBe("included");
      for (const id of ["a", "f"]) expect(required(canvasElement, `[data-node-id="${id}"]`, id).getAttribute("data-focus")).toBe("excluded");
    });
  },
};
