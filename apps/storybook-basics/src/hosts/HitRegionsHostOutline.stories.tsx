/**
 * Hosts/Hit Region Outline — "what will outline blue inside a host?"
 *
 * Zach, 2026-09-22: "How can I demonstrate in DOM what the hover regions are??
 * like what will outline blue inside the hosts? I feel that would be useful to
 * see?" — and, about the app: "when you hover on the corner block its the
 * entire out frame that should become highlighted in blue.. More like an
 * expanded block in that sense..."
 *
 * The other `Hit Regions/*` stories paint where the pointer LANDS on one
 * component. This one answers the next question — given where it lands, what
 * does a HOST take? — and asks it of a NAMED host, because they disagree:
 *
 *   - React Flow bench — the real `ReactFlowHost`, asked through its own
 *     exported `reactFlowDragStartsAt` for a primary press (xyflow's drag
 *     filter over this host's `DRAG_HANDLE_FOR_TYPE` + `nodrag`). Binary: the
 *     node, or nothing — it never claims a component owns the press;
 *   - tldraw bench — the real `TldrawHost`, asked through its own exported
 *     `contentOwnsPress`;
 *   - Policy — `dragPolicy.ts`'s DECLARED rules, on the DOM canvas. No bench
 *     implements it fully yet; it is labelled as the policy, never as a host.
 *
 * Hover anywhere: the blue ring is what the selected host takes (the node, or
 * the pointer-owning content), and the caption names the owner and the rule.
 * Two hosts are deliberately NOT offered, and say so: the DOM canvas as a HOST
 * is static by design (docs/peps/0005 — no hover, selection or drag, so it
 * outlines nothing), and the SystemSketch app's own rule lives in
 * `apps/systemsketch/src/shapes/shared/pointerOwnership.ts`, which the trunk
 * cannot import (the app imports the trunk, never the reverse).
 *
 * WHY this file is in `hosts/`, not `components/hitRegions/`: which element a
 * host outlines is interaction geometry, host-owned by `CLAUDE.md`'s core
 * rule. The title files it into the same "Hit Regions" group as the others.
 */
import { useCallback, useRef, useState, type CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type { Point } from "../components/trace.layout";
import { TraceBody } from "../components/trace";
import { Segmented } from "../components/hitRegions/harness.fixture";
import { DomCanvas } from "./domCanvas";
import type { HostScene } from "./hostScene";
import {
  contentTargetOf,
  hostPressOutlineAt,
  policyOutlineAt,
  type HostOutline,
  type HostOutlineKind,
  type HostPressRule,
} from "./hostOutline";
import { ReactFlowHost, reactFlowDragStartsAt } from "./reactFlowHost";
import { contentOwnsPress, TldrawHost } from "./tldrawHost";

const meta = {
  title: "Hosts/Hit Region Outline",
  tags: ["object:block", "host:dom", "host:react-flow", "host:tldraw", "lane:hover-regions-host-outline"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A tldraw-like selection blue — the colour a host paints its ring. */
const HOST_BLUE = "#2f80ed";

// WHY this much room around a ~900x300 scene: the tldraw bench mounts
// tldraw's own UI (a style panel top-right, the tool bar bottom-centre) OVER
// the canvas. A probe landing on that chrome would "agree" with the host by
// both answering nothing, which proves nothing; the margin keeps every node
// clear of it, and `expectHostAgrees` asserts each on-node probe really lands
// on its node.
const STAGE_W = 1120;
const STAGE_H = 430;

const SCENE: HostScene = {
  nodes: [
    { id: "load", type: "block", position: { x: 24, y: 70 }, data: { name: "load", view: "port", w: 130, h: 84, ports: { right: ["rows"] } } },
    {
      id: "loop",
      type: "region",
      position: { x: 250, y: 24 },
      data: { name: "For Loop", region: { kind: "loop", loop: "for" }, ports: { left: ["Iterable"], right: ["Iter"] }, w: 360, h: 280 },
    },
    { id: "step", type: "block", parentId: "loop", position: { x: 190, y: 70 }, data: { name: "step", view: "port", w: 130, h: 70, ports: { left: ["item"] } } },
    {
      id: "proc",
      type: "block",
      position: { x: 670, y: 40 },
      data: { name: "proc", view: "expanded", w: 240, h: 230, ports: { left: ["in"] }, anchorStart: ["left"] },
    },
    { id: "kid", type: "block", parentId: "proc", position: { x: 0, y: 0 }, data: { name: "kid", view: "port", w: 110, h: 62, ports: { left: ["in"] } } },
  ],
  edges: [{ id: "e-rows", source: "load", sourceHandle: "rows", target: "loop", targetHandle: "Iterable" }],
};

const nodeTypeOf = (id: string) => SCENE.nodes.find((node) => node.id === id)?.type;

type HostId = "react-flow" | "tldraw" | "policy";

/** `MouseEvent.button` of the press every probe asks about: the primary one. */
const PRIMARY_BUTTON = 0;

/** Each bench's OWN predicate, adapted to one signature — nothing re-derived. */
const HOST_RULES: Record<Exclude<HostId, "policy">, HostPressRule> = {
  // BINARY on purpose: React Flow's predicate answers ONE question — does a
  // node drag start here? — so this bench shows the node or nothing. It never
  // says "content": a refused drag is not proof a component owns the press
  // (a rail's port card owns its press through dnd-kit listeners and carries
  // no `.nodrag`, `portEdge.tsx`'s `SortableSlotCard`), and inferring
  // ownership from `.nodrag` was a second rule re-derived beside the host's
  // (Codex re-judge, 2026-09-22). Asked about a hypothetical PRIMARY press
  // (`button` 0): xyflow never drags on any other button.
  "react-flow": {
    source: "reactFlowHost.tsx reactFlowDragStartsAt, primary press (xyflow's drag filter: button + DRAG_HANDLE_FOR_TYPE + .nodrag)",
    takes(nodeType, _nodeId, target) {
      const rfNode = target.closest(".react-flow__node");
      return rfNode && reactFlowDragStartsAt(nodeType, target, rfNode, PRIMARY_BUTTON) ? "node" : "none";
    },
  },
  tldraw: {
    source: "tldrawHost.tsx contentOwnsPress",
    takes: (nodeType, nodeId, target) => (contentOwnsPress(nodeType, nodeId, target) ? "content" : "node"),
  },
};

const HOST_LABELS: { value: HostId; label: string }[] = [
  { value: "react-flow", label: "React Flow bench" },
  { value: "tldraw", label: "tldraw bench" },
  { value: "policy", label: "Policy (dragPolicy)" },
];

/** Legend rows — one per answer. */
const LEGEND: { kind: HostOutlineKind; what: string }[] = [
  { kind: "node", what: "the host takes the press: the whole node" },
  { kind: "region", what: "the host takes the press on a region: the WHOLE frame (a region is one node)" },
  { kind: "port", what: "a port dot owns the press: its own hit halo" },
  { kind: "cable", what: "a cable: its hit corridor" },
  { kind: "owned", what: "other content owns it (chevron, rail card, editor): the host stays out" },
  { kind: "none", what: "nothing: empty interior, a rail's empty margin, or (React Flow) no node drag starts here" },
];

function pathOf(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function HostOutlineBench({ initialHost = "react-flow" }: { initialHost?: HostId }) {
  const benchRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HostId>(initialHost);
  const [route, setRoute] = useState<readonly Point[] | null>(null);
  const [outline, setOutline] = useState<HostOutline | null>(null);
  const [ring, setRing] = useState<{ box?: CSSProperties; d?: string; offset?: { x: number; y: number } } | null>(null);

  const onWireGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    if (wireId === "e-rows") setRoute((previous) => (points && (!previous || pathOf(previous) !== pathOf(points)) ? points : previous));
  }, []);

  // CAPTURE phase: tldraw's canvas handles its own pointer events, and a
  // bubbling listener here would never hear a move over a shape.
  const onPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bench = benchRef.current;
      const root = bench?.querySelector("[data-host-root]");
      if (!bench || !root) return;
      const answer =
        host === "policy"
          ? policyOutlineAt(event.clientX, event.clientY, root)
          : hostPressOutlineAt(event.clientX, event.clientY, root, HOST_RULES[host], nodeTypeOf);
      setOutline(answer);
      if (!answer.target) return setRing(null);
      const origin = bench.getBoundingClientRect();
      if (answer.kind === "cable" && answer.target.getAttribute("data-slot") === "trace-hit") {
        const svgOrigin = (answer.target as SVGGraphicsElement).ownerSVGElement!.getBoundingClientRect();
        return setRing({ d: answer.target.getAttribute("d") ?? "", offset: { x: svgOrigin.left - origin.left, y: svgOrigin.top - origin.top } });
      }
      const r = answer.target.getBoundingClientRect();
      setRing({
        box: {
          left: r.left - origin.left,
          top: r.top - origin.top,
          width: r.width,
          height: r.height,
          borderRadius: answer.target instanceof HTMLElement ? getComputedStyle(answer.target).borderRadius : undefined,
        },
      });
    },
    [host],
  );

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>Host</span>
        <Segmented
          ariaLabel="Host"
          options={HOST_LABELS}
          value={host}
          onChange={(next) => {
            setHost(next);
            setOutline(null);
            setRing(null);
          }}
        />
      </span>
      <div
        ref={benchRef}
        data-testid="host-outline-bench"
        data-host={host}
        onPointerMoveCapture={onPointerMoveCapture}
        onPointerLeave={() => {
          setOutline(null);
          setRing(null);
        }}
        style={{ position: "relative", cursor: "crosshair", border: "1px dashed var(--border)", borderRadius: 8 }}
      >
        <div data-host-root key={host}>
          {host === "policy" ? (
            <DomCanvas scene={SCENE} width={STAGE_W} height={STAGE_H} onWireGeometry={onWireGeometry}>
              {/* DomCanvas's WireLayer draws cables with no hit path on
                  purpose (`wireLayer.tsx`); this is Trace's own `interactive`
                  hit path on the SAME route — the corridor a host that opts in
                  gets. Ink transparent: the layer below paints the line. */}
              <svg width={STAGE_W} height={STAGE_H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
                {route && (
                  <g data-wire-id="e-rows">
                    <TraceBody id="host-outline-e-rows" path={pathOf(route)} points={route} color="transparent" interactive />
                  </g>
                )}
              </svg>
            </DomCanvas>
          ) : host === "react-flow" ? (
            <ReactFlowHost scene={SCENE} width={STAGE_W} height={STAGE_H} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />
          ) : (
            <TldrawHost scene={SCENE} width={STAGE_W} height={STAGE_H} />
          )}
        </div>
        {/* The ring. Inert paint on top of everything: it must never become a
            hit target itself, or it would answer its own question. */}
        {ring?.d && (
          <svg
            style={{ position: "absolute", left: ring.offset!.x, top: ring.offset!.y, width: STAGE_W, height: STAGE_H, overflow: "visible", pointerEvents: "none", zIndex: 1000 }}
          >
            <path data-slot="host-outline" data-outline-kind="cable" d={ring.d} fill="none" stroke={HOST_BLUE} strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
        )}
        {ring?.box && (
          <div
            data-slot="host-outline"
            data-outline-kind={outline?.kind}
            style={{ position: "absolute", boxSizing: "border-box", border: `1.5px solid ${HOST_BLUE}`, pointerEvents: "none", zIndex: 1000, ...ring.box }}
          />
        )}
      </div>
      <div
        data-testid="host-outline-caption"
        data-kind={outline?.kind ?? ""}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, minHeight: 36, maxWidth: STAGE_W, lineHeight: 1.5 }}
      >
        {outline == null ? (
          <span style={{ color: "var(--muted-foreground)" }}>hover anything on the bench — the blue ring is what this host takes</span>
        ) : (
          <>
            <div>
              <strong style={{ color: outline.kind === "none" ? "var(--muted-foreground)" : HOST_BLUE }}>
                {outline.kind === "none" ? "nothing outlines" : `outlines: ${outline.kind}`}
              </strong>{" "}
              · pointer owned by <strong>{outline.owner}</strong>
            </div>
            <div style={{ color: "var(--muted-foreground)" }}>rule: {outline.rule}</div>
          </>
        )}
      </div>
      <ul data-testid="host-outline-legend" style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 12, display: "grid", gap: 4 }}>
        {LEGEND.map((row) => (
          <li key={row.kind} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 22,
                height: 12,
                borderRadius: row.kind === "port" ? 999 : 3,
                border: row.kind === "none" ? "1px dashed var(--border)" : `1.5px solid ${HOST_BLUE}`,
              }}
            />
            <code style={{ minWidth: 52 }}>{row.kind}</code>
            <span>{row.what}</span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: STAGE_W, margin: 0 }}>
        Not offered, on purpose: the DOM canvas as a host (static by design, docs/peps/0005 — it outlines nothing), and the
        SystemSketch app's rule (<code>pointerOwnership.ts</code> lives in the app, which the trunk cannot import). The Policy
        view carries one labelled MIRROR: a region frame's own chrome (the app's <code>RegionShapeUtil.getGeometry</code>).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play helpers — hover real points, MEASURE the ring                   */
/* ------------------------------------------------------------------ */

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** A real pointermove at a screen point, delivered to whatever the browser
 *  says is there (so it reaches the bench's capture listener like a mouse's). */
async function hoverAt(x: number, y: number) {
  const under = document.elementFromPoint(x, y);
  if (!under) throw new Error(`nothing under (${Math.round(x)}, ${Math.round(y)})`);
  under.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerType: "mouse", isPrimary: true }));
  await tick(30);
}

const captionKind = (canvas: HTMLElement) => canvas.querySelector('[data-testid="host-outline-caption"]')?.getAttribute("data-kind");

async function ringFor(canvas: HTMLElement, kind: HostOutlineKind): Promise<Element> {
  return waitFor(() => {
    const ring = canvas.querySelector(`[data-slot="host-outline"][data-outline-kind="${kind}"]`);
    if (!ring) throw new Error(`no ${kind} ring (caption: ${canvas.querySelector('[data-testid="host-outline-caption"]')?.textContent})`);
    return ring;
  });
}

async function expectRingOn(canvas: HTMLElement, kind: HostOutlineKind, expected: Element, what: string) {
  const ring = (await ringFor(canvas, kind)).getBoundingClientRect();
  const want = expected.getBoundingClientRect();
  for (const side of ["left", "top", "right", "bottom"] as const) {
    await expect(Math.abs(ring[side] - want[side]), `${what}: ring ${side} ${ring[side].toFixed(1)} vs ${want[side].toFixed(1)}`).toBeLessThanOrEqual(1.5);
  }
}

async function expectNoRing(canvas: HTMLElement, what: string) {
  await waitFor(() => expect(captionKind(canvas), what).toBe("none"));
  await expect(canvas.querySelector('[data-slot="host-outline"]'), what).toBeNull();
}

/** The probe points, found in whichever host is mounted. */
function probes(bench: HTMLElement): { name: string; at: () => { x: number; y: number } }[] {
  const centre = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const card = () => required<HTMLElement>(bench, '[data-block-id="loop"]');
  const header = () => required<HTMLElement>(card(), '[data-slot="block-header"]');
  const face = () => required<HTMLElement>(card(), '[data-slot="block"]');
  return [
    { name: "corner card header", at: () => { const h = header().getBoundingClientRect(); return { x: h.right - 16, y: h.top + h.height / 2 }; } },
    { name: "corner card body", at: () => { const f = face().getBoundingClientRect(); const h = header().getBoundingClientRect(); return { x: f.left + f.width / 2, y: (h.bottom + f.bottom) / 2 }; } },
    { name: "region empty interior", at: () => { const r = required<HTMLElement>(bench, '[data-slot="region-frame"][data-region-id="loop"]').getBoundingClientRect(); return { x: r.left + 40, y: r.bottom - 30 }; } },
    { name: "port dot", at: () => centre(required(bench, '[data-block-id="load"] [data-port-id="rows"] [data-slot="port-dot"]')) },
    // A `.nodrag` subtree: the probe that makes "React Flow never says
    // content" a claim that can fail (it is the one place `.nodrag` sits).
    { name: "corner card chevron", at: () => centre(required(card(), '[data-slot="folding-chevron"]')) },
    {
      name: "rail empty margin",
      at: () => {
        const card = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block"]').getBoundingClientRect();
        const rail = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block-port-rail"][data-edge="right"]').getBoundingClientRect();
        return { x: (card.right + rail.right) / 2 + 4, y: rail.top + 4 };
      },
    },
    { name: "plain block body", at: () => { const r = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block"]').getBoundingClientRect(); return { x: r.left + 20, y: r.bottom - 12 }; } },
    { name: "expanded block header", at: () => { const h = required<HTMLElement>(bench, '[data-block-id="proc"] [data-slot="block-header"]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; } },
    { name: "expanded block interior", at: () => { const r = required<HTMLElement>(bench, '[data-block-id="proc"]').getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 24 }; } },
    { name: "member header", at: () => centre(required(bench, '[data-block-id="kid"] [data-slot="block-header"]')) },
  ];
}

/** Probes that may land off every node, on the bare canvas, by design. */
const OFF_NODE_PROBES = new Set(["region empty interior", "rail empty margin", "expanded block interior"]);

/**
 * THE AGREEMENT CHECK, per host: for every probe, the demo's answer equals
 * that host's own predicate called directly on the element the browser's hit
 * test returns — and the ring sits on the element that answer names.
 */
async function expectHostAgrees(canvas: HTMLElement, host: Exclude<HostId, "policy">): Promise<Record<string, string>> {
  const bench = required<HTMLElement>(canvas, '[data-testid="host-outline-bench"]');
  const answers: Record<string, string> = {};
  for (const probe of probes(bench)) {
    const point = probe.at();
    const hit = document.elementFromPoint(point.x, point.y)!;
    const root = hit.closest("[data-scene-node]");
    if (!OFF_NODE_PROBES.has(probe.name)) {
      await expect(root !== null && bench.contains(root), `${host} · ${probe.name} lands on a node, not host chrome (hit: ${hit.tagName})`).toBe(true);
    }
    let expectedKind: HostOutlineKind = "none";
    let expectedTarget: Element | null = null;
    if (root && bench.contains(root)) {
      const id = root.getAttribute("data-scene-node")!;
      const answer = HOST_RULES[host].takes(nodeTypeOf(id), id, hit);
      // The host predicate itself, called here independently of the bench:
      if (host === "tldraw") await expect(answer === "content", `${probe.name}: tldraw contentOwnsPress`).toBe(contentOwnsPress(nodeTypeOf(id), id, hit));
      else {
        const rfNode = hit.closest(".react-flow__node")!;
        await expect(answer === "node", `${probe.name}: reactFlowDragStartsAt`).toBe(reactFlowDragStartsAt(nodeTypeOf(id), hit, rfNode, PRIMARY_BUTTON));
        // Binary host: the React Flow view never claims component ownership.
        await expect(answer, `${probe.name}: React Flow answers node or none, never content`).not.toBe("content");
      }
      if (answer === "node") {
        expectedKind = nodeTypeOf(id) === "region" ? "region" : "node";
        expectedTarget = root;
      } else if (answer === "content") {
        const content = contentTargetOf(hit);
        expectedKind = content.kind;
        expectedTarget = content.target;
      }
    }
    await hoverAt(point.x, point.y);
    await waitFor(() => expect(captionKind(canvas), `${host} · ${probe.name}`).toBe(expectedKind));
    if (expectedTarget) await expectRingOn(canvas, expectedKind, expectedTarget, `${host} · ${probe.name}`);
    else await expectNoRing(canvas, `${host} · ${probe.name}`);
    answers[probe.name] = expectedKind;
  }
  return answers;
}

async function switchHost(canvas: HTMLElement, label: string, host: HostId) {
  await fireEvent.click(within(canvas).getByRole("button", { name: label }));
  const bench = await waitFor(() => {
    const el = required<HTMLElement>(canvas, `[data-testid="host-outline-bench"][data-host="${host}"]`);
    required(el, '[data-block-id="kid"] [data-slot="block-header"]');
    required(el, '[data-block-id="loop"] [data-slot="block-header"]');
    return el;
  }, { timeout: 8000 });
  await tick(400);
  return bench;
}

export const Playground: Story = {
  render: () => <HostOutlineBench />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement;
    canvas.scrollIntoView({ block: "center" });
    await within(canvas).findByRole("button", { name: "React Flow bench" });

    // ── Each REAL host, point by point, against its own predicate ──
    await switchHost(canvas, "React Flow bench", "react-flow");
    const rf = await expectHostAgrees(canvas, "react-flow");
    await switchHost(canvas, "tldraw bench", "tldraw");
    const tl = await expectHostAgrees(canvas, "tldraw");

    // The disagreement the audit named, pinned: a plain block's BODY. React
    // Flow drags only from the node's own header; the tldraw bench hands
    // every non-header block press to the content; the policy grabs the node.
    await expect(rf["plain block body"]).toBe("none");
    await expect(tl["plain block body"]).toBe("owned");
    // Both benches agree the corner card's HEADER takes the whole region.
    await expect(rf["corner card header"]).toBe("region");
    await expect(tl["corner card header"]).toBe("region");
    // A port dot: the tldraw bench hands it to the content (its halo); React
    // Flow only says "no node drag from here" — it has no content answer.
    await expect(tl["port dot"]).toBe("port");
    await expect(rf["port dot"]).toBe("none");
    // The fold chevron (`.nodrag`): tldraw's contentOwnsPress hands it to the
    // chevron; React Flow refuses the drag and says nothing more.
    await expect(tl["corner card chevron"]).toBe("owned");
    await expect(rf["corner card chevron"]).toBe("none");

    // xyflow's `!event.button`: the SAME valid header refuses a right or
    // middle press. Asked of the real mounted React Flow node.
    await switchHost(canvas, "React Flow bench", "react-flow");
    const rfHeader = required<HTMLElement>(canvas, '[data-testid="host-outline-bench"] [data-block-id="proc"] [data-slot="block-header"]');
    const rfNode = rfHeader.closest(".react-flow__node")!;
    await expect(reactFlowDragStartsAt("block", rfHeader, rfNode, 0), "primary press on the own header drags").toBe(true);
    await expect(reactFlowDragStartsAt("block", rfHeader, rfNode, 1), "middle press never drags").toBe(false);
    await expect(reactFlowDragStartsAt("block", rfHeader, rfNode, 2), "right press never drags").toBe(false);

    // ── The declared POLICY, measured ──
    const bench = await switchHost(canvas, "Policy (dragPolicy)", "policy");
    const frame = required<HTMLElement>(bench, '[data-slot="region-frame"][data-region-id="loop"]');
    const card = required<HTMLElement>(bench, '[data-region-id="loop"] [data-block-id="loop"]');
    const cardFace = required<HTMLElement>(card, '[data-slot="block"]');
    const cardHeader = required<HTMLElement>(card, '[data-slot="block-header"]');

    // 1 — the corner card's HEADER outlines the WHOLE region frame.
    const h = cardHeader.getBoundingClientRect();
    await hoverAt(h.right - 16, h.top + h.height / 2);
    await expectRingOn(canvas, "region", frame, "policy · corner card header");
    const ring = (await ringFor(canvas, "region")).getBoundingClientRect();
    await expect(ring.width - cardFace.getBoundingClientRect().width).toBeGreaterThan(100);

    // 2 — the card's BODY, clear of its rails, does the same.
    const f = cardFace.getBoundingClientRect();
    const body = { x: f.left + f.width / 2, y: (h.bottom + f.bottom) / 2 };
    await expect(document.elementFromPoint(body.x, body.y)?.closest('[data-slot="block-port-rail"]'), "body point is not a rail").toBeNull();
    await hoverAt(body.x, body.y);
    await expectRingOn(canvas, "region", frame, "policy · corner card body");

    // 3 — the region's EMPTY interior: hollow, nothing outlines.
    const fr = frame.getBoundingClientRect();
    await hoverAt(fr.left + 40, fr.bottom - 30);
    await expectNoRing(canvas, "policy · region interior");

    // 4 — a port DOT outlines its own halo, not the block.
    const dot = required<HTMLElement>(bench, '[data-block-id="load"] [data-port-id="rows"] [data-slot="port-dot"]');
    const halo = required<HTMLElement>(dot, '[data-slot="port-dot-halo"]');
    const d = dot.getBoundingClientRect();
    await hoverAt(d.left + d.width / 2, d.top + d.height / 2);
    await expectRingOn(canvas, "port", halo, "policy · port dot");

    // 5 — a rail's EMPTY margin passes through: the browser's hit test never
    // reaches the rail box.
    const loadCard = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block"]').getBoundingClientRect();
    const rail = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block-port-rail"][data-edge="right"]').getBoundingClientRect();
    const margin = { x: (loadCard.right + rail.right) / 2 + 4, y: rail.top + 4 };
    await expect(margin.x).toBeGreaterThan(loadCard.right);
    await expect(document.elementFromPoint(margin.x, margin.y)?.closest('[data-slot="block-port-rail"]') ?? null, "the margin is not a hit target").toBeNull();
    await hoverAt(margin.x, margin.y);
    await expectNoRing(canvas, "policy · rail margin");

    // 6 — the CABLE outlines its own corridor: same path, same box.
    const hit = await waitFor(() => required<SVGPathElement>(bench, '[data-slot="trace-hit"]'));
    const mid = hit.getPointAtLength(hit.getTotalLength() / 2);
    const ctm = hit.getScreenCTM()!;
    await hoverAt(ctm.a * mid.x + ctm.c * mid.y + ctm.e, ctm.b * mid.x + ctm.d * mid.y + ctm.f);
    const cableRing = await waitFor(() => required<SVGPathElement>(canvas, 'path[data-slot="host-outline"][data-outline-kind="cable"]'));
    await expect(cableRing.getAttribute("d")).toBe(hit.getAttribute("d"));
    const hitBox = hit.getBoundingClientRect();
    const ringBox = cableRing.getBoundingClientRect();
    for (const side of ["left", "top", "right", "bottom"] as const) {
      await expect(Math.abs(ringBox[side] - hitBox[side]), `cable ring ${side}`).toBeLessThanOrEqual(1.5);
    }

    // 7 — an EXPANDED block: header outlines it; empty interior is hollow;
    // a member outlines the member, never the parent.
    const proc = required<HTMLElement>(bench, '[data-block-id="proc"]');
    const procHeader = required<HTMLElement>(proc, '[data-slot="block-header"]').getBoundingClientRect();
    await hoverAt(procHeader.left + procHeader.width / 2, procHeader.top + procHeader.height / 2);
    await expectRingOn(canvas, "node", proc, "policy · expanded block header");
    const pr = proc.getBoundingClientRect();
    await hoverAt(pr.right - 24, pr.bottom - 24);
    await expectNoRing(canvas, "policy · expanded interior");
    const kid = required<HTMLElement>(bench, '[data-block-id="kid"]');
    const kidHeader = required<HTMLElement>(kid, '[data-slot="block-header"]').getBoundingClientRect();
    await hoverAt(kidHeader.left + kidHeader.width / 2, kidHeader.top + kidHeader.height / 2);
    await expectRingOn(canvas, "node", kid, "policy · member");

    // 8 — the policy grabs a plain block's body (the bench disagreement above).
    const loadBlock = required<HTMLElement>(bench, '[data-block-id="load"]');
    await hoverAt(loadCard.left + 20, loadCard.bottom - 12);
    await expectRingOn(canvas, "node", loadBlock, "policy · plain block body");
  },
};
