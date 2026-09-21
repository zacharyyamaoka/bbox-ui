import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { Block } from "../components/block";
import { Port } from "../components/port";
import { Trace } from "../components/trace";
import type { TraceTerminalSpec } from "../components/trace.layout";
import { findingsFor, type LintFinding, type LintScene } from "./lint";
import { portKey, wiredPorts, type SceneEdgeEnds } from "./scene";
import {
  VALIDATION_LEVELS,
  VALIDATION_LEVEL_SPECS,
  validationLevelSpec,
  enabledRuleCount,
  lintSceneAtLevel,
  type ValidationLevel,
} from "./validationLevel";

/**
 * Blocks/Scene/Validation level — ruling 3, made visible.
 *
 * Zach, verbatim: "have the connection validation setting in the settings panel
 * so you can switch between what level of linting you want from whiteboard,
 * where anything goes to like evalid code, etc."
 *
 * ONE board, four levels. Nothing about the scene changes between these
 * stories — the same six wires, the same four nodes — only which of
 * `./validationLevel.ts`'s rungs is chosen. Everything marked here is
 * `lintSceneAtLevel`'s real output; no story hand-marks a carrier.
 *
 * WHY this bench is its own copy rather than an import from
 * `./Lint.stories.tsx`: that file's bench packs one instance of every rule for
 * a rule-by-rule reading, which is a different question from "what does one
 * rung add over the one below it" — and a story file importing another story
 * file's internals makes two stories fail together for one edit. The
 * MEASUREMENT technique, the `data-wire-id` / `data-port-id` addressing and
 * the "ghost is a dashed stand-in, never a real Port" rule are all that file's,
 * deliberately copied so the two benches stay readable side by side.
 */

const meta = {
  title: "Blocks/Scene/Validation level",
  tags: ["area:blocks", "lane:settings-validation-level-2026-09-21"],
} satisfies Meta;

export default meta;

const NODE_W = 132;
const NODE_H = 60;
const BENCH_W = 700;
const BENCH_H = 330;
const GHOST_X = 316;
const GHOST_Y = 252;

interface BenchNode {
  id: string;
  label: string;
  x: number;
  y: number;
  hasIn?: boolean;
  hasOut?: boolean;
}

const NODES: readonly BenchNode[] = [
  { id: "src1", label: "src1 · number", x: 16, y: 16, hasOut: true },
  { id: "src2", label: "src2 · string", x: 16, y: 136, hasOut: true },
  { id: "sink", label: "sink · number", x: 420, y: 76, hasIn: true },
  { id: "selfy", label: "selfy · number", x: 420, y: 216, hasIn: true, hasOut: true },
];

type BenchTarget = { nodeId: string; port: "in" } | { ghost: true };

interface BenchEdge {
  id: string;
  from: { nodeId: string; port: "out" };
  to: BenchTarget;
  /** What this wire is here to demonstrate — printed in the legend. */
  note: string;
}

const EDGES: readonly BenchEdge[] = [
  { id: "e-fan-1", from: { nodeId: "src1", port: "out" }, to: { nodeId: "sink", port: "in" }, note: "first producer into sink/in" },
  { id: "e-fan-2", from: { nodeId: "src2", port: "out" }, to: { nodeId: "sink", port: "in" }, note: "second producer (many-to-one) AND string→number (type-mismatch)" },
  { id: "e-dup-1", from: { nodeId: "src1", port: "out" }, to: { nodeId: "selfy", port: "in" }, note: "one of an identical pair" },
  { id: "e-dup-2", from: { nodeId: "src1", port: "out" }, to: { nodeId: "selfy", port: "in" }, note: "the other (duplicate-edge)" },
  { id: "e-self", from: { nodeId: "selfy", port: "out" }, to: { nodeId: "selfy", port: "in" }, note: "selfy wires itself (self-connection, and a 1-node cycle)" },
  { id: "e-ghost", from: { nodeId: "src2", port: "out" }, to: { ghost: true }, note: "points at a node the scene does not contain (dangling-edge)" },
];

function domKey(target: { nodeId: string; port: string } | { ghost: true }): string {
  return "ghost" in target ? "ghost" : `${target.nodeId}/${target.port}`;
}

const SCENE: LintScene = {
  nodes: NODES.map((node) => ({ id: node.id })),
  edges: EDGES.map((edge): SceneEdgeEnds & { id: string } => ({
    id: edge.id,
    source: edge.from.nodeId,
    sourceHandle: edge.from.port,
    target: "ghost" in edge.to ? "ghost" : edge.to.nodeId,
    targetHandle: "in",
  })),
};

const WIRED = wiredPorts(SCENE);

function portsOfNode(nodeId: string): readonly string[] | undefined {
  const node = NODES.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined; // "ghost" — unknown vocabulary, no port judgement
  return [...(node.hasIn ? ["in"] : []), ...(node.hasOut ? ["out"] : [])];
}

/** Every `out` emits and every `in` receives — the vocabulary `polarity` needs,
 *  supplied by the caller exactly as `lint.ts` intends. */
const DIRECTION_OF = ({ portId }: { portId: string }) => (portId === "out" ? ("source" as const) : ("sink" as const));

/** `src2` carries a string; everything else carries a number; `ghost` declares
 *  nothing — which is a wildcard at `typed` and the error itself at `strict`. */
const TYPE_OF = ({ nodeId }: { nodeId: string }) =>
  nodeId === "ghost" ? undefined : nodeId === "src2" ? ["string"] : ["number"];

function LevelBench({ level }: { level: ValidationLevel }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Map<string, { from: TraceTerminalSpec; to: TraceTerminalSpec }>>(new Map());

  const findings = useMemo<LintFinding[]>(
    () => lintSceneAtLevel(SCENE, level, { portsOf: portsOfNode, directionOf: DIRECTION_OF, typeOf: TYPE_OF }),
    [level],
  );

  // One post-commit measurement: this bench is static, so the technique
  // `Lint.stories.tsx` and `wireLayer.tsx` already use applies unchanged.
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
      next.set(edge.id, {
        from: { x: fr.left + fr.width / 2 - rect.left, y: fr.top + fr.height / 2 - rect.top, dir: "right" },
        to: { x: tr.left + tr.width / 2 - rect.left, y: tr.top + tr.height / 2 - rect.top, dir: "right" },
      });
    }
    setGeometry(next);
  }, []);

  // Through the accessor, not the record: a level may now BE its own spec
  // (the caller-supplied rung), and the record is keyed only by the four names.
  const spec = validationLevelSpec(level);

  return (
    <div style={{ fontFamily: "ui-sans-serif, sans-serif" }}>
      <header style={{ maxWidth: 700, marginBottom: 12 }}>
        <h3 data-testid="level-label" style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          {spec.label}
        </h3>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{spec.summary}</p>
        <p data-testid="level-rules" style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          <strong>{enabledRuleCount(level)}</strong> rules on: <code>{spec.rules.join(", ")}</code> · types:{" "}
          <code>{spec.types}</code>
        </p>
      </header>
      <div
        ref={containerRef}
        data-testid="level-bench"
        style={{ position: "relative", width: BENCH_W, height: BENCH_H }}
      >
        {NODES.map((node) => (
          <div
            key={node.id}
            data-node-id={node.id}
            style={{ position: "absolute", left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
          >
            <Block
              header={node.label}
              width={NODE_W}
              height={NODE_H}
              diagnostics={findingsFor(findings, { kind: "node", id: node.id })}
            />
            {node.hasIn && (
              <div data-port-id={portKey(node.id, "in")} style={{ position: "absolute", left: -8, top: NODE_H / 2 - 8 }}>
                <Port
                  state={WIRED.has(portKey(node.id, "in")) ? "wired" : "empty"}
                  diagnostics={findingsFor(findings, { kind: "port", id: portKey(node.id, "in") })}
                />
              </div>
            )}
            {node.hasOut && (
              <div data-port-id={portKey(node.id, "out")} style={{ position: "absolute", right: -8, top: NODE_H / 2 - 8 }}>
                <Port
                  state={WIRED.has(portKey(node.id, "out")) ? "wired" : "empty"}
                  diagnostics={findingsFor(findings, { kind: "port", id: portKey(node.id, "out") })}
                />
              </div>
            )}
          </div>
        ))}
        {/* Deliberately NOT a Port: nothing in the scene names it, so a real
            port dot here would be a lie (`Lint.stories.tsx`'s own rule). */}
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
        <span
          style={{ position: "absolute", left: GHOST_X + 20, top: GHOST_Y - 6, fontSize: 11, color: "var(--muted-foreground)" }}
        >
          ghost (missing)
        </span>
        <svg
          width={BENCH_W}
          height={BENCH_H}
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          {EDGES.map((edge) => {
            const g = geometry.get(edge.id);
            if (!g) return null;
            return (
              <g key={edge.id} data-wire-id={edge.id}>
                <Trace
                  id={edge.id}
                  from={g.from}
                  to={g.to}
                  routing="curved"
                  diagnostics={findingsFor(findings, { kind: "edge", id: edge.id })}
                  terminals={false}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <ul style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 700, marginTop: 12, paddingLeft: 18 }}>
        {EDGES.map((edge) => (
          <li key={edge.id}>
            <code>{edge.id}</code> — {edge.note}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement helpers                                                 */
/* ------------------------------------------------------------------ */

async function benchMeasured(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => {
    const wires = canvasElement.querySelectorAll('[data-slot="trace"]');
    if (wires.length < EDGES.length) {
      throw new Error(`expected ${EDGES.length} rendered traces, found ${wires.length} — measurement has not settled`);
    }
  });
}

function wireMark(canvasElement: HTMLElement, edgeId: string): string | null {
  return canvasElement.querySelector(`[data-wire-id="${edgeId}"] [data-slot="trace"]`)?.getAttribute("data-diagnostic") ?? null;
}

function portMark(canvasElement: HTMLElement, key: string): string | null {
  return canvasElement.querySelector(`[data-port-id="${key}"] [data-slot="port-dot"]`)?.getAttribute("data-diagnostic") ?? null;
}

function nodeMark(canvasElement: HTMLElement, nodeId: string): Element | null {
  return canvasElement.querySelector(`[data-node-id="${nodeId}"] [data-slot="diagnostic-flag"]`);
}

/** Every marked carrier on screen, as one number, so a story can assert that a
 *  rung adds marks rather than merely relabelling them. */
function markedCount(canvasElement: HTMLElement): number {
  return (
    canvasElement.querySelectorAll('[data-slot="trace"][data-diagnostic]').length
    + canvasElement.querySelectorAll('[data-slot="port-dot"][data-diagnostic]').length
    + canvasElement.querySelectorAll('[data-slot="diagnostic-flag"]').length
  );
}

type Story = StoryObj<typeof meta>;

export const Whiteboard: Story = {
  name: "Whiteboard — anything goes",
  render: () => <LevelBench level="whiteboard" />,
  play: async ({ canvasElement }) => {
    await benchMeasured(canvasElement);

    // The one rule that survives "anything goes" is the broken-record one, and
    // it marks exactly the wire that points at nothing.
    await expect(wireMark(canvasElement, "e-ghost")).toBe("error");
    expect(markedCount(canvasElement)).toBe(1);

    // Everything the tighter rungs will object to is already on the board and
    // deliberately unmarked — the duplicate pair, the self-wire, the fan-in.
    for (const id of ["e-fan-1", "e-fan-2", "e-dup-1", "e-dup-2", "e-self"]) {
      expect(wireMark(canvasElement, id), id).toBeNull();
    }
    expect(portMark(canvasElement, "sink/in")).toBeNull();
    expect(nodeMark(canvasElement, "selfy")).toBeNull();

    // The header's count is the level's own, never typed into this story.
    expect(enabledRuleCount("whiteboard")).toBe(VALIDATION_LEVEL_SPECS.whiteboard.rules.length);
  },
};

export const Guided: Story = {
  name: "Guided — direction, containment, loops, duplicates",
  render: () => <LevelBench level="guided" />,
  play: async ({ canvasElement }) => {
    await benchMeasured(canvasElement);

    // What this rung ADDS over whiteboard: the duplicate pair and the cycle.
    await expect(wireMark(canvasElement, "e-dup-1")).toBe("warning");
    expect(wireMark(canvasElement, "e-dup-2")).toBe("warning");
    expect(nodeMark(canvasElement, "selfy")).not.toBeNull();

    // What it still does NOT: the second producer into sink/in is a `typed`
    // question, and the self-wire is a `strict` one.
    expect(portMark(canvasElement, "sink/in")).toBeNull();
    expect(wireMark(canvasElement, "e-self")).toBeNull();

    // And the rung below it is still covered.
    expect(wireMark(canvasElement, "e-ghost")).toBe("error");
  },
};

export const Typed: Story = {
  name: "Typed — declared types agree, one producer per input",
  render: () => <LevelBench level="typed" />,
  play: async ({ canvasElement }) => {
    await benchMeasured(canvasElement);

    // Added here: the fan-in lands on the PORT (not on either feeding wire),
    // and the string→number wire is finally judged.
    await expect(portMark(canvasElement, "sink/in")).toBe("error");
    expect(wireMark(canvasElement, "e-fan-2")).toBe("error");
    expect(wireMark(canvasElement, "e-fan-1")).toBeNull();

    // `ghost` declares no type, and at `typed` an undeclared type is a
    // wildcard — so that wire is still marked only for dangling, never for a
    // type it never claimed.
    expect(wireMark(canvasElement, "e-ghost")).toBe("error");

    // Still not a self-connection finding — that rung is next.
    expect(wireMark(canvasElement, "e-self")).toBeNull();
  },
};

export const Strict: Story = {
  name: "Strict — only edges that could exist in the running program",
  render: () => <LevelBench level="strict" />,
  play: async ({ canvasElement }) => {
    await benchMeasured(canvasElement);

    // Every rule is on at the strictest rung — proved against the level's own
    // spec, never a typed-in 7.
    await expect(enabledRuleCount("strict")).toBe(VALIDATION_LEVEL_SPECS.strict.rules.length);
    expect(VALIDATION_LEVELS[VALIDATION_LEVELS.length - 1]).toBe("strict");

    // The rung's own addition: the self-wire is now an error in its own right.
    expect(wireMark(canvasElement, "e-self")).toBe("error");

    // And everything every looser rung caught is still caught.
    expect(wireMark(canvasElement, "e-ghost")).toBe("error");
    expect(wireMark(canvasElement, "e-dup-1")).toBe("warning");
    expect(portMark(canvasElement, "sink/in")).toBe("error");
    expect(wireMark(canvasElement, "e-fan-2")).toBe("error");
  },
};
