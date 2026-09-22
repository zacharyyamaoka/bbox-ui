import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Block } from "../components/block";
import { Port } from "../components/port";
import { Toggle } from "../components/toggle";
import { Trace } from "../components/trace";
import { dragDelta } from "../scene/interactions/dragIntent";
import { OWNER_ATTR } from "../hosts/grabChain";
import { MagnetProposalLayer } from "./magnetProposalLayer";
import { composeJudges, magnetTypeJudge, type ConnectionJudge, type MagnetPort, type MagnetRadius } from "../scene/interactions/magnet/magnetProposals";
import type { PortTypeMatching } from "../scene/interactions/magnet/magnetPortTypes";
import { useMagnetDrag, type MagnetFrame } from "../hosts/useMagnetDrag";
import { validateConnection } from "../scene/edgeValidation";
import type { LintScene } from "../scene/lint";
import { portKey, wiredPorts, type ScenePortRef } from "../scene/scene";

/**
 * Editor/MagnetProposals — Zach's "magnetic wire proposals"
 * (`PROJECT - Black Box UI.md`, §"Magnetic wire proposals"): *"if you move a
 * node close enough… then it should kinda like automatically propose a
 * connection… if you turn it on… different ports basically could have like
 * magnet radius. if those radius are in range, and then a data validation
 * thing bases. then it can make a trace proposals so it just automatically
 * draws it (dotted line)… if you move out of range then it disappears."*
 *
 * The model is `src/scene/interactions/magnet/magnetProposals.ts` (pure, unit-tested in the
 * `unit` project), the binding is `src/hosts/useMagnetDrag.ts`, the paint is
 * `src/editor/magnetProposalLayer.tsx`. This file is only the bench.
 *
 * WHY this story renders its OWN bench rather than going through `DomCanvas`
 * — a measured constraint, not a preference. `PortEdgeItem` carries
 * `id`/`label`/`state`/`diagnostics` and NO `hinting` (`portEdge.tsx:90-103`),
 * and `nodeViews.tsx` has no per-port hook, so the eligible-port paint this
 * feature needs cannot travel through the host today. `src/components/**`
 * and `src/hosts/**` are both another lane's write set. `Lint.stories.tsx:23-36`
 * hit the identical wall for the identical reason and set the precedent
 * verbatim: *"this story measures its own ports and draws its own `Trace`s
 * directly."* Same technique, same fence. The owed wiring
 * (`PortEdgeItem.hinting?: boolean` + forwarding in `nodeViews.tsx`) is named
 * in docs/MAGNET-WIRES-SPEC.md §8.3 — until it lands, this feature is
 * demonstrated on a story-local bench and NOT proven through the real host
 * composition.
 *
 * WHY the controls sit on the canvas: Zach, same note — *"We don't have a
 * floating toolbar so you can just put like controls on the canvas."*
 *
 * NOT VERIFIED IN-APP UNDER ZOOM. `DomCanvas` has no viewport by design and
 * its own tripwire says a story needing pan/zoom moves to the React Flow
 * bench (`domCanvas.tsx:5-15`). The zoom rule (`effectiveMagnetRadius`) is
 * covered by unit test A1 only.
 */

const meta = {
  title: "Editor/MagnetProposals",
  tags: ["object:trace", "lane:magnetic-wires"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The bench vocabulary                                                */
/* ------------------------------------------------------------------ */

const NODE_W = 120;
const NODE_H = 56;
const DOT_PX = 12; // PORT_DIAMETERS.md (port.layout.ts:44)

interface BenchPort {
  id: string;
  role: "source" | "target";
  side: "left" | "right";
  type?: string;
  radius?: MagnetRadius;
}

interface BenchNode {
  id: string;
  label: string;
  x: number;
  y: number;
  ports: BenchPort[];
  /** Exactly one node per fixture carries the drag. */
  draggable?: boolean;
}

interface Fixture {
  nodes: BenchNode[];
  /** Edges that ALREADY exist — drawn solid, and fed to `validateConnection`
   *  so a refusal in this bench is a real one. */
  edges?: { id: string; from: ScenePortRef; to: ScenePortRef }[];
  width: number;
  height: number;
  enabled?: boolean;
  mode?: PortTypeMatching;
  show?: "top" | "all";
  showRadius?: boolean;
  /** Port keys whose radius gets a number input + a swap button. */
  radiusControls?: [string, string];
  legend: string;
}

const dotStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  [side]: -DOT_PX / 2,
  top: NODE_H / 2 - DOT_PX / 2,
  width: DOT_PX,
  height: DOT_PX,
});

/** `out` ports sit on right walls and `in` ports on left walls in this bench,
 *  so both ends read `dir: "right"` — `wireLayer.tsx`'s general rule
 *  specialized exactly the way `Lint.stories.tsx` specializes it. */
const BENCH_DIR = "right" as const;

/** The fixture's authored scene-unit radii, as the editable state's seed —
 *  one spelling, shared by the initial state and by Reset. */
function seedRadii(fixture: Fixture): Record<string, number> {
  const seed: Record<string, number> = {};
  for (const node of fixture.nodes) {
    for (const p of node.ports) {
      const key = portKey(node.id, p.id);
      if (p.radius && "sceneUnits" in p.radius) seed[key] = p.radius.sceneUnits;
    }
  }
  return seed;
}

/* ------------------------------------------------------------------ */
/* The bench                                                           */
/* ------------------------------------------------------------------ */

function MagnetBench({ fixture }: { fixture: Fixture }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragged = fixture.nodes.find((node) => node.draggable)!;

  const [enabled, setEnabled] = useState(fixture.enabled ?? true);
  const [showRadius, setShowRadius] = useState(fixture.showRadius ?? false);
  const [show, setShow] = useState<"top" | "all">(fixture.show ?? "top");
  const [mode, setMode] = useState<PortTypeMatching>(fixture.mode ?? "lenient");
  /** Committed offset of the dragged node. `onCommit` writes it; nothing in
   *  `src/magnet/**` ever does — the module hands over a proposal and a
   *  delta, and the caller owns the scene. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [committed, setCommitted] = useState<string | null>(null);
  const [radii, setRadii] = useState<Record<string, number>>(() => seedRadii(fixture));

  const typeOf = useCallback(
    (ref: ScenePortRef) => fixture.nodes.find((n) => n.id === ref.nodeId)?.ports.find((p) => p.id === ref.portId)?.type,
    [fixture.nodes],
  );

  const scene = useMemo<LintScene>(
    () => ({
      nodes: fixture.nodes.map((n) => ({ id: n.id })),
      edges: (fixture.edges ?? []).map((e) => ({ id: e.id, source: e.from.nodeId, sourceHandle: e.from.portId, target: e.to.nodeId, targetHandle: e.to.portId })),
    }),
    [fixture.nodes, fixture.edges],
  );
  const portsOf = useCallback((nodeId: string) => fixture.nodes.find((n) => n.id === nodeId)?.ports.map((p) => p.id), [fixture.nodes]);
  const wired = useMemo(() => wiredPorts(scene), [scene]);

  // BOTH producers, composed — never forked. The type gate is ours
  // (`validateConnection` has no type rule); the structural rules are the
  // linter lane's landed engine, reached through the `ConnectionJudge` seam
  // so a rename over there costs this one line.
  const judge = useMemo<ConnectionJudge>(
    () => composeJudges(magnetTypeJudge({ typeOf, mode }), (candidate) => validateConnection(scene, candidate, { portsOf })),
    [mode, portsOf, scene, typeOf],
  );

  /**
   * The ONE DOM measurement in the whole feature. Reads every dot's live
   * centre relative to the bench — `wireLayer.tsx`'s own house method
   * (`resolveDot`/`centreOf`, :63-87), so the magnet's geometry and a real
   * wire's geometry are identical by construction.
   */
  const measure = useCallback((): MagnetFrame => {
    const container = containerRef.current;
    if (!container) return { moving: [], resting: [] };
    const rect = container.getBoundingClientRect();
    const moving: MagnetPort[] = [];
    const resting: MagnetPort[] = [];
    for (const node of fixture.nodes) {
      for (const p of node.ports) {
        const key = portKey(node.id, p.id);
        const el = container.querySelector<HTMLElement>(`[data-node-id="${node.id}"] [data-port-id="${key}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const declared = radii[key];
        const port: MagnetPort = {
          ref: { nodeId: node.id, portId: p.id },
          at: { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top },
          role: p.role,
          radius: declared != null ? { sceneUnits: declared } : p.radius,
          type: p.type,
          dir: BENCH_DIR,
        };
        (node.draggable ? moving : resting).push(port);
      }
    }
    return { moving, resting };
  }, [fixture.nodes, radii]);

  const magnet = useMagnetDrag({
    enabled,
    measure,
    judge,
    intent: { owner: "canvas" },
    onCommit: (top, delta) => {
      setOffset((prev) => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
      setCommitted(top ? `${portKey(top.source.nodeId, top.source.portId)} → ${portKey(top.target.nodeId, top.target.portId)}` : null);
    },
  });

  // The live delta, read straight off the drag reducer's own state — so the
  // node under the hand and the proposal's geometry can never disagree.
  const live = dragDelta(magnet.drag.state);
  const restingPorts = useMemo(() => measure().resting, [measure]);
  // Re-measure the radius overlay once the bench has laid out (the first
  // render has no DOM yet, so `measure()` above returns empty).
  const [overlayPorts, setOverlayPorts] = useState<readonly MagnetPort[]>([]);
  useLayoutEffect(() => setOverlayPorts(measure().resting), [measure, restingPorts.length]);

  // Only the WINNER hints, even when every proposal is drawn. `hinting`'s
  // own contract is "the port is previewing becoming wired"
  // (port.tsx:232-234) — exactly one port is, and marking four of them
  // would be a small lie that the `show="all"` capture made obvious.
  const hintedKeys = new Set(magnet.top ? [portKey(magnet.top.to.nodeId, magnet.top.to.portId)] : []);
  const refusedKeys = new Set(magnet.scan.refused.map((r) => portKey(r.to.nodeId, r.to.portId)));

  const [wireGeometry, setWireGeometry] = useState<Map<string, { from: { x: number; y: number }; to: { x: number; y: number } }>>(new Map());
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !fixture.edges?.length) return;
    const rect = container.getBoundingClientRect();
    const next = new Map<string, { from: { x: number; y: number }; to: { x: number; y: number } }>();
    const centre = (ref: ScenePortRef) => {
      const el = container.querySelector<HTMLElement>(`[data-port-id="${portKey(ref.nodeId, ref.portId)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
    };
    for (const edge of fixture.edges) {
      const from = centre(edge.from);
      const to = centre(edge.to);
      if (from && to) next.set(edge.id, { from, to });
    }
    setWireGeometry(next);
  }, [fixture.edges]);

  return (
    <div style={{ fontFamily: "ui-sans-serif, sans-serif" }}>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 740, marginBottom: 10 }}>{fixture.legend}</p>
      <div
        ref={containerRef}
        data-testid="magnet-bench"
        style={{ position: "relative", width: fixture.width, height: fixture.height, border: "1px dashed var(--border)", borderRadius: 8 }}
      >
        {fixture.nodes.map((node) => {
          const isDragged = Boolean(node.draggable);
          const left = node.x + (isDragged ? offset.x + live.x : 0);
          const top = node.y + (isDragged ? offset.y + live.y : 0);
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              data-testid={`node-${node.id}`}
              // The drag declaration rides on a DOM attribute because the
              // host that has to honour it is not in the React tree
              // (grabChain.ts's own header). `block:solid`'s face is `grab`
              // and its `port-dot` part is `owns-pointer`
              // (dragPolicy.ts:172-186) — so the header drags the node and a
              // press on a dot does not, which is the policy this bench
              // wants and gets for free.
              {...(isDragged ? { [OWNER_ATTR]: "block:solid" } : null)}
              onPointerDown={isDragged ? magnet.drag.onPointerDown : undefined}
              onPointerMove={isDragged ? magnet.drag.onPointerMove : undefined}
              onPointerUp={isDragged ? magnet.drag.onPointerUp : undefined}
              onKeyDown={isDragged ? magnet.drag.onKeyDown : undefined}
              tabIndex={isDragged ? 0 : undefined}
              // `userSelect: none` because a REAL mouse drag across a header
              // selects its text (seen in docs/capture_magnet_shots.mjs's
              // out-of-range capture, 2026-09-18 — the synthetic pointer
              // sequences in the play functions never reproduce it, because
              // dispatched events do not drive the browser's own selection).
              style={{ position: "absolute", left, top, width: NODE_W, height: NODE_H, touchAction: "none", cursor: isDragged ? "grab" : "default", outline: "none", userSelect: "none", WebkitUserSelect: "none" }}
            >
              <Block header={node.label} width={NODE_W} height={NODE_H} />
              {node.ports.map((p) => {
                const key = portKey(node.id, p.id);
                return (
                  <div key={p.id} data-port-id={key} title={p.type ? `${p.id}: ${p.type}` : p.id} style={dotStyle(p.side)}>
                    <Port state={wired.has(key) ? "wired" : "empty"} hinting={hintedKeys.has(key)} dimmed={refusedKeys.has(key)} />
                  </div>
                );
              })}
              {node.ports.some((p) => p.type) && (
                <span style={{ position: "absolute", left: 0, top: NODE_H + 2, fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                  {node.ports.map((p) => `${p.id}: ${p.type ?? "—"}`).join(" · ")}
                </span>
              )}
            </div>
          );
        })}

        {/* Edges that already exist — solid, so a `many-to-one` refusal in
            `RefusalPreview` is something you can SEE the cause of. */}
        <svg data-slot="magnet-existing-wires" width={fixture.width} height={fixture.height} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
          {(fixture.edges ?? []).map((edge) => {
            const g = wireGeometry.get(edge.id);
            if (!g) return null;
            return <Trace key={edge.id} id={edge.id} from={{ ...g.from, dir: BENCH_DIR }} to={{ ...g.to, dir: BENCH_DIR }} routing="curved" terminals={false} />;
          })}
        </svg>

        <MagnetProposalLayer enabled={enabled} scan={magnet.scan} show={show} showRadius={showRadius} ports={overlayPorts} width={fixture.width} height={fixture.height} />

        {/* Controls, on the canvas. */}
        <div
          data-testid="magnet-controls"
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 8,
            fontSize: 11,
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            zIndex: 2,
          }}
        >
          <Toggle size="sm" pressed={enabled} onPressedChange={setEnabled} data-testid="magnet-toggle">
            Magnets {enabled ? "on" : "off"}
          </Toggle>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" data-testid="magnet-show-radius" checked={showRadius} onChange={(e) => setShowRadius(e.target.checked)} />
            Show magnet radius
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" data-testid="magnet-show-all" checked={show === "all"} onChange={(e) => setShow(e.target.checked ? "all" : "top")} />
            Show all proposals
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            Type matching
            <select data-testid="magnet-mode" value={mode} onChange={(e) => setMode(e.target.value as PortTypeMatching)}>
              <option value="off">off</option>
              <option value="lenient">lenient</option>
              <option value="strict">strict</option>
            </select>
          </label>
          {fixture.radiusControls?.map((key) => (
            <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>{key}</span>
              <input
                type="number"
                data-testid={`magnet-radius-${key}`}
                value={radii[key] ?? 0}
                onChange={(e) => setRadii((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                style={{ width: 62 }}
              />
            </label>
          ))}
          {fixture.radiusControls && (
            <button
              type="button"
              data-testid="magnet-swap-radii"
              onClick={() => {
                const [a, b] = fixture.radiusControls!;
                setRadii((prev) => ({ ...prev, [a]: prev[b] ?? 0, [b]: prev[a] ?? 0 }));
              }}
            >
              Swap the two radii
            </button>
          )}
          <span data-testid="magnet-readout" style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)" }}>
            {/* Zach asked for the refusal to be VISIBLE, not only stamped:
                "if you would release it would error … Drag time validity
                preview!" So when nothing is proposed but something was
                refused, the reason is what the readout says. */}
            {magnet.top
              ? `${magnet.top.distance.toFixed(1)}u → ${portKey(magnet.top.to.nodeId, magnet.top.to.portId)}`
              : magnet.scan.refused.length > 0
                ? `refused: ${magnet.scan.refused.map((r) => `${portKey(r.to.nodeId, r.to.portId)} ${r.refusal?.code ?? "(silent)"}`).join(", ")}`
                : "no proposal"}
          </span>
          <span data-testid="magnet-committed" style={{ fontFamily: "ui-monospace, monospace", color: "var(--muted-foreground)" }}>
            {committed ? `committed ${committed}` : "nothing committed"}
          </span>
          {/* WHY a Reset control and not just "reload the page": a story's
              own play function AUTOPLAYS on load, and several of these end
              with the node committed somewhere else (and, for
              RadiusAndToggle, with magnets switched off). A reload replays
              it, so reloading can never get you back to the resting bench.
              Found by docs/capture_magnet_shots.mjs, whose first run
              photographed four empty canvases for exactly this reason —
              the play functions could not have caught it, because they
              never look at the bench they inherit. It is also simply what
              you want after dragging the node into a corner. */}
          <button
            type="button"
            data-testid="magnet-reset"
            onClick={() => {
              setOffset({ x: 0, y: 0 });
              setCommitted(null);
              setEnabled(fixture.enabled ?? true);
              setShowRadius(fixture.showRadius ?? false);
              setShow(fixture.show ?? "top");
              setMode(fixture.mode ?? "lenient");
              setRadii(seedRadii(fixture));
            }}
          >
            Reset the bench
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Real-gesture helpers — copied from DragPolicy.stories.tsx:73-95     */
/* ------------------------------------------------------------------ */

/** Both event families, the browser's own order. Copied rather than
 *  re-invented so one recipe for "a real press" exists in this app, even
 *  though this bench has no d3-drag under it. */
function fireBoth(el: Element, kind: "down" | "move" | "up", x: number, y: number) {
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: kind === "up" ? 0 : 1, view: window } as const;
  el.dispatchEvent(new PointerEvent(`pointer${kind}`, { ...base, pointerId: 1, isPrimary: true, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent(`mouse${kind}`, base));
}

const tick = (ms = 24) => new Promise((r) => setTimeout(r, ms));

function nodeBox(root: HTMLElement, nodeId: string): DOMRect {
  const el = root.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
  if (!el) throw new Error(`no node \`${nodeId}\``);
  return el.getBoundingClientRect();
}

function dotCentre(root: HTMLElement, key: string): { x: number; y: number } {
  const el = root.querySelector<HTMLElement>(`[data-port-id="${key}"]`);
  if (!el) throw new Error(`no port \`${key}\``);
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function grabPoint(root: HTMLElement, nodeId: string): { x: number; y: number; el: Element } {
  const header = root.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] [data-slot="block-header"]`);
  if (!header) throw new Error(`no header on \`${nodeId}\``);
  const r = header.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), el: header };
}

const layer = (root: HTMLElement) => root.querySelector<SVGSVGElement>('[data-slot="magnet-layer"]')!;
const proposals = (root: HTMLElement) => [...root.querySelectorAll<SVGGElement>("[data-magnet-proposal]")];
const parsePoint = (raw: string | null) => {
  const [x, y] = (raw ?? "").split(",").map(Number);
  return { x, y };
};

/** Press the header, then glide through each delta WITHOUT releasing. */
async function pressAndGlide(root: HTMLElement, nodeId: string, path: readonly { x: number; y: number }[]): Promise<{ x: number; y: number; el: Element }> {
  const grab = grabPoint(root, nodeId);
  fireBoth(grab.el, "down", grab.x, grab.y);
  await tick();
  for (const step of path) {
    fireBoth(grab.el, "move", grab.x + step.x, grab.y + step.y);
    await tick();
  }
  return grab;
}

/* ------------------------------------------------------------------ */
/* R2 + R4 — one port, two candidates, the TYPE decides                */
/* ------------------------------------------------------------------ */

const TYPE_DECIDES: Fixture = {
  width: 720,
  height: 420,
  mode: "lenient",
  legend:
    "R4. `src/out` carries `Pose`. `bytesSink/in` is placed STRICTLY NEARER than `poseSink/in`, and both are inside their magnet radius — so geometry alone would pick the wrong one. Drag `src` right: the dotted proposal goes to `poseSink/in`, and `bytesSink/in` is refused with `type-mismatch`.",
  nodes: [
    { id: "src", label: "src", x: 40, y: 180, draggable: true, ports: [{ id: "out", role: "source", side: "right", type: "Pose" }] },
    { id: "poseSink", label: "poseSink", x: 320, y: 140, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 100 } }] },
    { id: "bytesSink", label: "bytesSink", x: 320, y: 230, ports: [{ id: "in", role: "target", side: "left", type: "bytes", radius: { sceneUnits: 100 } }] },
  ],
};

export const TypeDecides: Story = {
  name: "Type decides (R2 + R4)",
  render: () => <MagnetBench fixture={TYPE_DECIDES} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    await pressAndGlide(root, "src", [{ x: 40, y: 8 }, { x: 120, y: 26 }]);

    // The fixture cannot rot into the easy case: assert the WRONG-type sink
    // is strictly nearer BEFORE asserting the outcome. Measured, not assumed.
    const out = dotCentre(root, "src/out");
    const distTo = (key: string) => {
      const p = dotCentre(root, key);
      return Math.hypot(p.x - out.x, p.y - out.y);
    };
    const wrong = distTo("bytesSink/in");
    const right = distTo("poseSink/in");
    expect(wrong).toBeLessThan(right);

    // Exactly one proposal, and it is the FARTHER, type-correct one.
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("1");
    const only = proposals(root);
    expect(only).toHaveLength(1);
    expect(only[0].getAttribute("data-magnet-to")).toBe("poseSink/in");
    expect(only[0].getAttribute("data-magnet-from")).toBe("src/out");

    // The refusal is EXPLAINED, with the donor's own code.
    expect(layer(root).getAttribute("data-magnet-refusals")).toContain("bytesSink/in:type-mismatch");

    // The paint agrees with the model: the winner hints, the loser does not.
    expect(root.querySelector('[data-port-id="poseSink/in"] [data-slot="port-dot"]')?.getAttribute("data-hinting")).toBe("true");
    expect(root.querySelector('[data-port-id="bytesSink/in"] [data-slot="port-dot"]')?.getAttribute("data-hinting")).toBeNull();

    // A9 — genuinely DOTTED, read off the computed style, never inferred
    // from the `variant` prop.
    const line = only[0].querySelector<SVGPathElement>('[data-slot="trace"] path')!;
    const dash = getComputedStyle(line).strokeDasharray;
    expect(dash).not.toBe("");
    expect(dash).not.toBe("none");
    expect(getComputedStyle(line).strokeLinecap).toBe("round");

    // Turning the type gate OFF flips the winner to the nearer port — which
    // is what proves the gate, not the geometry, made the earlier choice.
    const mode = root.querySelector<HTMLSelectElement>('[data-testid="magnet-mode"]')!;
    mode.value = "off";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    const grab = grabPoint(root, "src");
    fireBoth(grab.el, "move", grab.x + 121, grab.y + 26);
    await tick();
    expect(proposals(root)[0]?.getAttribute("data-magnet-to")).toBe("bytesSink/in");
    fireBoth(grab.el, "up", grab.x + 121, grab.y + 26);
  },
};

/* ------------------------------------------------------------------ */
/* R3 — tracks the drag, vanishes out of range, returns                */
/* ------------------------------------------------------------------ */

const TRACKS: Fixture = {
  width: 760,
  height: 400,
  legend:
    "R3. One source, one same-type sink with a 100u magnet. The scripted path comes into range, closes in twice more, leaves range entirely, then comes back — the dotted proposal follows the dragged port, keeps the resting end pinned, and disappears the moment the gap exceeds the radius.",
  nodes: [
    { id: "src", label: "src", x: 40, y: 180, draggable: true, ports: [{ id: "out", role: "source", side: "right", type: "Pose" }] },
    { id: "sink", label: "sink", x: 400, y: 180, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 100 } }] },
  ],
};

export const TracksAndVanishes: Story = {
  name: "Tracks and vanishes (R3)",
  render: () => <MagnetBench fixture={TRACKS} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    const grab = grabPoint(root, "src");
    fireBoth(grab.el, "down", grab.x, grab.y);
    await tick();

    const step = async (dx: number) => {
      fireBoth(grab.el, "move", grab.x + dx, grab.y);
      await tick();
      const node = nodeBox(root, "src");
      const g = proposals(root)[0] ?? null;
      return {
        count: layer(root).getAttribute("data-magnet-proposals"),
        id: g?.getAttribute("data-magnet-id") ?? null,
        from: g ? parsePoint(g.getAttribute("data-magnet-from-at")) : null,
        to: g ? parsePoint(g.getAttribute("data-magnet-to-at")) : null,
        distance: g ? Number(g.getAttribute("data-magnet-distance")) : null,
        nodeLeft: node.left,
      };
    };

    // 1 — well short of the radius: nothing proposed at all.
    const far = await step(120);
    expect(far.count).toBe("0");
    expect(proposals(root)).toHaveLength(0);

    // 2, 3, 4 — three IN-RANGE positions.
    const a = await step(180);
    const b = await step(200);
    const c = await step(220);
    for (const s of [a, b, c]) expect(s.count).toBe("1");

    // A7 — the proposal's FROM point moves by the same delta as the dragged
    // node's own rect (±1px), its TO point does not move at all, and the
    // reported distance closes monotonically.
    //
    // WHY not the line's own bounding rect: a `Trace`'s rect spans BOTH
    // endpoints and only one endpoint moves, so its delta is roughly half
    // the node's — an assertion on it would fail, or pass for the wrong
    // reason. Hence `data-magnet-from-at` / `-to-at`.
    expect(Math.abs(b.from!.x - a.from!.x - (b.nodeLeft - a.nodeLeft))).toBeLessThanOrEqual(1);
    expect(Math.abs(c.from!.x - b.from!.x - (c.nodeLeft - b.nodeLeft))).toBeLessThanOrEqual(1);
    expect(b.to).toEqual(a.to);
    expect(c.to).toEqual(a.to);
    expect(b.distance!).toBeLessThan(a.distance!);
    expect(c.distance!).toBeLessThan(b.distance!);

    // A8 — out of range it VANISHES; back in range the SAME proposal returns.
    const gone = await step(520);
    expect(gone.count).toBe("0");
    expect(proposals(root)).toHaveLength(0);
    const back = await step(220);
    expect(back.count).toBe("1");
    expect(back.id).toBe(c.id);

    // Release commits — and the commit is the CALLER's, so the readout
    // changes while `src/magnet/**` still wrote nothing.
    fireBoth(grab.el, "up", grab.x + 220, grab.y);
    await tick();
    expect(root.querySelector('[data-testid="magnet-committed"]')?.textContent).toContain("src/out → sink/in");
    // And the gesture is over: no proposal survives the release.
    expect(proposals(root)).toHaveLength(0);
  },
};

/* ------------------------------------------------------------------ */
/* R5 — nearest wins, and an exact tie is deterministic                */
/* ------------------------------------------------------------------ */

const NEAREST: Fixture = {
  width: 760,
  height: 440,
  show: "all",
  // WHY the radius overlay is OFF here even though this story has the most
  // candidates: at 240u the four circles overlap into one wash that hides
  // the ranking this story exists to show (looked at, 2026-09-18). The
  // overlay earns its place in `RadiusAndToggle`, where the two circles ARE
  // the subject.
  legend:
    "R5. Four legal, same-type candidates. `alphaTie/in` and `zetaTie/in` sit at EXACTLY equal distance from the dragged port; `midway` and `outer` are farther. Every proposal is drawn (Show all proposals) so the ranking is visible — nearest first, and the exact tie resolves to the smaller port key, never to array order.",
  nodes: [
    { id: "src", label: "src", x: 40, y: 212, draggable: true, ports: [{ id: "out", role: "source", side: "right", type: "Pose" }] },
    { id: "alphaTie", label: "alphaTie", x: 330, y: 112, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 240 } }] },
    { id: "zetaTie", label: "zetaTie", x: 330, y: 312, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 240 } }] },
    { id: "midway", label: "midway", x: 420, y: 212, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 240 } }] },
    { id: "outer", label: "outer", x: 480, y: 92, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 240 } }] },
  ],
};

export const NearestWins: Story = {
  name: "Nearest wins, ties are deterministic (R5)",
  render: () => <MagnetBench fixture={NEAREST} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    const grab = await pressAndGlide(root, "src", [{ x: 40, y: 0 }, { x: 140, y: 0 }]);

    const shown = proposals(root);
    expect(shown.length).toBeGreaterThanOrEqual(3);
    const rows = shown.map((g) => ({ to: g.getAttribute("data-magnet-to")!, d: Number(g.getAttribute("data-magnet-distance")) }));

    // Ranked nearest-first — the order IS the data, not a re-sort here.
    for (let i = 1; i < rows.length; i += 1) expect(rows[i].d).toBeGreaterThanOrEqual(rows[i - 1].d);

    // The tie is real: the two tied candidates are measurably equidistant.
    const min = rows[0].d;
    const tied = rows.filter((r) => Math.abs(r.d - min) < 0.01);
    expect(tied.map((r) => r.to).sort()).toEqual(["alphaTie/in", "zetaTie/in"]);

    // And it resolves lexicographically, not by array order — the rung
    // `magnetProposals.test.ts` A3 proves is stable under 100 shuffles,
    // and the one every library studied does differently.
    const smallest = [...tied].map((r) => r.to).sort()[0];
    expect(rows[0].to).toBe(smallest);
    expect(root.querySelector('[data-testid="magnet-readout"]')?.textContent).toContain(smallest);

    // Escape rolls the whole gesture back in one step (dragIntent.ts:159-161).
    const node = root.querySelector<HTMLElement>('[data-node-id="src"]')!;
    node.focus();
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("0");
    expect(root.querySelector('[data-testid="magnet-committed"]')?.textContent).toContain("nothing committed");
    fireBoth(grab.el, "up", grab.x + 140, grab.y);
  },
};

/* ------------------------------------------------------------------ */
/* R1 — per-port radius, and the toggle                                */
/* ------------------------------------------------------------------ */

const RADIUS_AND_TOGGLE: Fixture = {
  width: 720,
  height: 420,
  showRadius: true,
  radiusControls: ["small/in", "big/in"],
  legend:
    "R1. The dragged port declares a deliberately tiny 10u magnet, so the CANDIDATES' radii decide: `small/in` has 40u, `big/in` has 120u, and the drag parks the port ~80u from both. Only `big` is in reach. Swap the two numbers and the proposal flips — same geometry, different declaration. Turn Magnets off and the node still drags with no proposal at all.",
  nodes: [
    { id: "src", label: "src", x: 40, y: 180, draggable: true, ports: [{ id: "out", role: "source", side: "right", type: "Pose", radius: { sceneUnits: 10 } }] },
    { id: "small", label: "small (40u)", x: 360, y: 100, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 40 } }] },
    { id: "big", label: "big (120u)", x: 360, y: 260, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 120 } }] },
  ],
};

export const RadiusAndToggle: Story = {
  name: "Per-port radius and the toggle (R1)",
  render: () => <MagnetBench fixture={RADIUS_AND_TOGGLE} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    const grab = await pressAndGlide(root, "src", [{ x: 40, y: 0 }, { x: 200, y: 0 }]);

    // Parked between the two: measurably about equidistant, so the RADIUS is
    // the only thing that can be deciding.
    const out = dotCentre(root, "src/out");
    const dSmall = Math.hypot(dotCentre(root, "small/in").x - out.x, dotCentre(root, "small/in").y - out.y);
    const dBig = Math.hypot(dotCentre(root, "big/in").x - out.x, dotCentre(root, "big/in").y - out.y);
    expect(Math.abs(dSmall - dBig)).toBeLessThan(2);

    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("1");
    expect(proposals(root)[0].getAttribute("data-magnet-to")).toBe("big/in");
    fireBoth(grab.el, "up", grab.x + 200, grab.y);
    await tick();

    // Swap the two numbers through the ON-CANVAS control, then drag again:
    // same geometry, opposite answer.
    root.querySelector<HTMLButtonElement>('[data-testid="magnet-swap-radii"]')!.click();
    await tick();
    const grab2 = await pressAndGlide(root, "src", [{ x: 8, y: 0 }, { x: 12, y: 0 }]);
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("1");
    expect(proposals(root)[0].getAttribute("data-magnet-to")).toBe("small/in");
    fireBoth(grab2.el, "up", grab2.x + 12, grab2.y);
    await tick();

    // A10 — the toggle gates the PROPOSAL, not the drag. The node still
    // moves; nothing is proposed.
    root.querySelector<HTMLButtonElement>('[data-testid="magnet-toggle"]')!.click();
    await tick();
    expect(layer(root).getAttribute("data-magnet-enabled")).toBe("false");
    const before = nodeBox(root, "src").left;
    const grab3 = await pressAndGlide(root, "src", [{ x: 10, y: 0 }, { x: 40, y: 0 }]);
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("0");
    expect(nodeBox(root, "src").left - before).toBeGreaterThan(30);
    fireBoth(grab3.el, "up", grab3.x + 40, grab3.y);
  },
};

/* ------------------------------------------------------------------ */
/* R2 — a real refusal from the landed validateConnection              */
/* ------------------------------------------------------------------ */

const REFUSAL: Fixture = {
  width: 720,
  height: 400,
  legend:
    "R2, explained. `producer/out` already feeds `sink/in`. Dragging `src` into range gets no proposal — but the refusal is not silent: `many-to-one` comes from `scene/edgeValidation.ts`'s landed `validateConnection`, reached through the same `ConnectionJudge` seam as the type gate. Zach: “if you would release it would error… Drag time validity preview!”",
  edges: [{ id: "e-existing", from: { nodeId: "producer", portId: "out" }, to: { nodeId: "sink", portId: "in" } }],
  nodes: [
    { id: "producer", label: "producer", x: 40, y: 80, ports: [{ id: "out", role: "source", side: "right", type: "Pose" }] },
    { id: "src", label: "src", x: 40, y: 240, draggable: true, ports: [{ id: "out", role: "source", side: "right", type: "Pose" }] },
    { id: "sink", label: "sink", x: 360, y: 240, ports: [{ id: "in", role: "target", side: "left", type: "Pose", radius: { sceneUnits: 120 } }] },
  ],
};

export const RefusalPreview: Story = {
  name: "Refusal preview — rules in the loop (R2)",
  render: () => <MagnetBench fixture={REFUSAL} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    const grab = await pressAndGlide(root, "src", [{ x: 40, y: 0 }, { x: 140, y: 0 }]);

    // In range by geometry — measured, so "no proposal" cannot be a
    // proximity failure dressed up as a rule.
    const out = dotCentre(root, "src/out");
    const target = dotCentre(root, "sink/in");
    expect(Math.hypot(target.x - out.x, target.y - out.y)).toBeLessThan(120);

    // ...and refused by a REAL rule, not by the type gate.
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("0");
    expect(layer(root).getAttribute("data-magnet-refusals")).toContain("sink/in:many-to-one");
    expect(proposals(root)).toHaveLength(0);
    // The reason is on the CANVAS while the pointer is still down, not only
    // in an attribute — Zach asked for a drag-time validity PREVIEW, and an
    // attribute nobody can see is not a preview.
    expect(root.querySelector('[data-testid="magnet-readout"]')?.textContent).toContain("sink/in many-to-one");
    fireBoth(grab.el, "up", grab.x + 140, grab.y);
    await tick();
    // Nothing was committed, because nothing was legal.
    expect(root.querySelector('[data-testid="magnet-committed"]')?.textContent).toContain("nothing committed");
  },
};

/* ------------------------------------------------------------------ */
/* A11 — a press that stays a click never flashes a wire               */
/* ------------------------------------------------------------------ */

export const ClickNeverProposes: Story = {
  name: "A click is not a drag (R2 composition)",
  render: () => <MagnetBench fixture={TRACKS} />,
  play: async ({ canvasElement }) => {
    const root = canvasElement;
    const grab = grabPoint(root, "src");
    // Under `thresholdFor({owner: "canvas"})` — CANVAS_DRAG_INTENT_PX is 4
    // (dragPolicy.ts:544), never re-read or re-tuned here.
    fireBoth(grab.el, "down", grab.x, grab.y);
    await tick();
    fireBoth(grab.el, "move", grab.x + 2, grab.y + 1);
    await tick();
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("0");
    fireBoth(grab.el, "up", grab.x + 2, grab.y + 1);
    await tick();
    // Still nothing — and the node did not move either.
    expect(layer(root).getAttribute("data-magnet-proposals")).toBe("0");
    expect(root.querySelector('[data-testid="magnet-committed"]')?.textContent).toContain("nothing committed");
  },
};
