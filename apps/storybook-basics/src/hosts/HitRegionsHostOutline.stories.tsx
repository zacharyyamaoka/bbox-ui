/**
 * Hit Regions/Host Outline — "what will outline blue inside a host?"
 *
 * Zach, 2026-09-22: "How can I demonstrate in DOM what the hover regions are??
 * like what will outline blue inside the hosts? I feel that would be useful to
 * see?" — and, about the app: "when you hover on the corner block its the
 * entire out frame that should become highlighted in blue.. More like an
 * expanded block in that sense..."
 *
 * The other `Hit Regions/*` stories paint where the pointer LANDS on one
 * component. This one answers the next question: given where it lands, which
 * element does a HOST outline? Hover anywhere on the bench and the element
 * that would outline gets a blue ring; the caption names who owns the pointer
 * and which real rule decided (`hostOutline.ts` — every branch there cites the
 * host code it reuses, and the one part that is a mirror says so).
 *
 * WHY this file is in `hosts/`, not `components/hitRegions/`: which element a
 * host outlines is interaction geometry, which is host-owned (`CLAUDE.md`'s
 * core rule), so it may import hosts and the kit may not. The title files it
 * into the same "Hit Regions" group the other six live in.
 *
 * The bench is the REAL DOM host (`DomCanvas`) over a real scene: the corner
 * card, frame, rails, dots and members are exactly what every host renders.
 * One thing is added on top, labelled as such: `DomCanvas`'s `WireLayer`
 * draws cables with no hit path on purpose (`wireLayer.tsx`'s header), so the
 * cable here gets `Trace`'s own `interactive` hit path laid over the SAME
 * route the layer drew (`onWireGeometry`) — the corridor a host that opts in
 * gets.
 */
import { useCallback, useRef, useState, type CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import type { Point } from "../components/trace.layout";
import { TraceBody } from "../components/trace";
import { DomCanvas } from "./domCanvas";
import type { HostScene } from "./hostScene";
import { hostOutlineAt, type HostOutline, type HostOutlineKind } from "./hostOutline";

const meta = {
  title: "Hit Regions/Host Outline",
  tags: ["area:hit-regions", "lane:hover-regions-host-outline"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A tldraw-like selection blue — the colour a host paints its hover ring. */
const HOST_BLUE = "#2f80ed";

const STAGE_W = 940;
const STAGE_H = 330;

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

/** Legend rows — one per answer a host can give. */
const LEGEND: { kind: HostOutlineKind; what: string }[] = [
  { kind: "node", what: "a plain block (or a member) — its whole box" },
  { kind: "region", what: "a region's corner card or its chrome — the WHOLE frame (a region is one node)" },
  { kind: "port", what: "a port dot — the dot's own hit halo, not the block (the policy; the tldraw app today also outlines the block)" },
  { kind: "cable", what: "a cable — its hit corridor" },
  { kind: "owned", what: "a chevron / rail card — the subtree owns its own press" },
  { kind: "none", what: "empty interior of an expanded block or region, a rail's empty margin — falls through, nothing outlines" },
];

function pathOf(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function HostOutlineBench() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [route, setRoute] = useState<readonly Point[] | null>(null);
  const [outline, setOutline] = useState<HostOutline | null>(null);
  const [ring, setRing] = useState<{ box?: CSSProperties; d?: string } | null>(null);

  const onWireGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    if (wireId === "e-rows") setRoute((previous) => (points && (!previous || pathOf(previous) !== pathOf(points)) ? points : previous));
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current?.querySelector('[data-host="dom-canvas"]');
    if (!host) return;
    const answer = hostOutlineAt(event.clientX, event.clientY, host);
    setOutline(answer);
    if (!answer.target) return setRing(null);
    if (answer.kind === "cable") return setRing({ d: answer.target.getAttribute("d") ?? "" });
    const origin = host.getBoundingClientRect();
    const r = answer.target.getBoundingClientRect();
    setRing({
      box: {
        left: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
        borderRadius: getComputedStyle(answer.target).borderRadius,
      },
    });
  }, []);

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
      <div
        ref={hostRef}
        data-testid="host-outline-bench"
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setOutline(null);
          setRing(null);
        }}
        style={{ cursor: "crosshair", border: "1px dashed var(--border)", borderRadius: 8 }}
      >
        <DomCanvas scene={SCENE} width={STAGE_W} height={STAGE_H} onWireGeometry={onWireGeometry}>
          {/* The cable's hit corridor: Trace's own `interactive` hit path on the
              route WireLayer drew. Ink transparent — the layer below paints
              the visible line; this layer only answers hit tests. */}
          <svg data-slot="host-outline-cable-hit" width={STAGE_W} height={STAGE_H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
            {route && (
              <g data-wire-id="e-rows">
                <TraceBody id="host-outline-e-rows" path={pathOf(route)} points={route} color="transparent" interactive />
              </g>
            )}
          </svg>
          {/* The ring a host would paint. Inert paint: it must never become a
              hit target itself, or it would answer its own question. */}
          <svg width={STAGE_W} height={STAGE_H} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
            {ring?.d && <path data-slot="host-outline" data-outline-kind="cable" d={ring.d} fill="none" stroke={HOST_BLUE} strokeWidth={1.5} strokeLinejoin="round" />}
          </svg>
          {ring?.box && (
            <div
              data-slot="host-outline"
              data-outline-kind={outline?.kind}
              style={{ position: "absolute", boxSizing: "border-box", border: `1.5px solid ${HOST_BLUE}`, pointerEvents: "none", ...ring.box }}
            />
          )}
        </DomCanvas>
      </div>
      <div
        data-testid="host-outline-caption"
        data-kind={outline?.kind ?? ""}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, minHeight: 36, maxWidth: STAGE_W, lineHeight: 1.5 }}
      >
        {outline == null ? (
          <span style={{ color: "var(--muted-foreground)" }}>hover anything on the bench — the blue ring is what a host would outline</span>
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
        Reused, not re-drawn: the browser's own hit test, <code>dragPolicy.resolveGrab</code>, the nearest-<code>[data-block-id]</code>{" "}
        ownership walk, and the corner card carrying its region's id. One MIRROR, labelled in the caption when it answers: a region
        frame's own chrome (the app's <code>RegionShapeUtil.getGeometry</code>, which the trunk cannot import).
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play: hover real points, MEASURE the ring against the expected box   */
/* ------------------------------------------------------------------ */

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** A real pointermove at a screen point, delivered to whatever the browser
 *  says is there (so it bubbles to the bench like a mouse's would). */
async function hoverAt(x: number, y: number) {
  const under = document.elementFromPoint(x, y);
  if (!under) throw new Error(`nothing under (${Math.round(x)}, ${Math.round(y)})`);
  under.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerType: "mouse", isPrimary: true }));
  await tick(30);
}

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
  await waitFor(() => expect(canvas.querySelector('[data-testid="host-outline-caption"]')?.getAttribute("data-kind"), what).toBe("none"));
  await expect(canvas.querySelector('[data-slot="host-outline"][data-outline-kind]:not([data-outline-kind="cable"])'), what).toBeNull();
  await expect(canvas.querySelector('path[data-slot="host-outline"]'), what).toBeNull();
}

export const Playground: Story = {
  render: () => <HostOutlineBench />,
  play: async ({ canvasElement }) => {
    const canvas = canvasElement;
    canvas.scrollIntoView({ block: "center" });
    const bench = await waitFor(() => required<HTMLElement>(canvas, '[data-testid="host-outline-bench"]'));
    const frame = await waitFor(() => required<HTMLElement>(bench, '[data-slot="region-frame"][data-region-id="loop"]'));
    const card = required<HTMLElement>(bench, '[data-region-id="loop"] [data-block-id="loop"]');
    const cardFace = required<HTMLElement>(card, '[data-slot="block"]');
    const cardHeader = required<HTMLElement>(card, '[data-slot="block-header"]');

    // 1 — the corner card's HEADER outlines the WHOLE region frame.
    const h = cardHeader.getBoundingClientRect();
    await hoverAt(h.left + h.width / 2, h.top + h.height / 2);
    await expectRingOn(canvas, "region", frame, "corner card header");
    // ...which is far bigger than the card: the ring is not the card's box.
    const ring = (await ringFor(canvas, "region")).getBoundingClientRect();
    await expect(ring.width - cardFace.getBoundingClientRect().width).toBeGreaterThan(100);

    // 2 — the card's BODY, clear of its rails, does the same.
    const f = cardFace.getBoundingClientRect();
    const body = { x: f.left + f.width / 2, y: (h.bottom + f.bottom) / 2 };
    await expect(document.elementFromPoint(body.x, body.y)?.closest('[data-slot="block-port-rail"]'), "body point is not a rail").toBeNull();
    await hoverAt(body.x, body.y);
    await expectRingOn(canvas, "region", frame, "corner card body");

    // 3 — the region's EMPTY interior: hollow, nothing outlines.
    const fr = frame.getBoundingClientRect();
    await hoverAt(fr.left + 40, fr.bottom - 30);
    await expectNoRing(canvas, "region interior");

    // 4 — a port DOT outlines its own halo, not the block.
    const dot = required<HTMLElement>(bench, '[data-block-id="load"] [data-port-id="rows"] [data-slot="port-dot"]');
    const halo = required<HTMLElement>(dot, '[data-slot="port-dot-halo"]');
    const d = dot.getBoundingClientRect();
    await hoverAt(d.left + d.width / 2, d.top + d.height / 2);
    await expectRingOn(canvas, "port", halo, "port dot");

    // 5 — a rail's EMPTY margin (outside the wall, clear of the dot) passes
    // through: the browser's hit test never reaches the rail box.
    const loadCard = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block"]').getBoundingClientRect();
    const rail = required<HTMLElement>(bench, '[data-block-id="load"] [data-slot="block-port-rail"][data-edge="right"]').getBoundingClientRect();
    const margin = { x: (loadCard.right + rail.right) / 2 + 4, y: rail.top + 4 };
    await expect(margin.x).toBeGreaterThan(loadCard.right);
    await expect(document.elementFromPoint(margin.x, margin.y)?.closest('[data-slot="block-port-rail"]') ?? null, "the margin is not a hit target").toBeNull();
    await hoverAt(margin.x, margin.y);
    await expectNoRing(canvas, "rail margin");

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

    // 7 — an EXPANDED block: its header outlines it; its empty interior is
    // hollow; a member inside outlines the member, never the parent.
    const proc = required<HTMLElement>(bench, '[data-block-id="proc"]');
    const procHeader = required<HTMLElement>(proc, '[data-slot="block-header"]').getBoundingClientRect();
    await hoverAt(procHeader.left + procHeader.width / 2, procHeader.top + procHeader.height / 2);
    await expectRingOn(canvas, "node", proc, "expanded block header");
    const pr = proc.getBoundingClientRect();
    await hoverAt(pr.right - 24, pr.bottom - 24);
    await expectNoRing(canvas, "expanded interior");
    const kid = required<HTMLElement>(bench, '[data-block-id="kid"]');
    const kidHeader = required<HTMLElement>(kid, '[data-slot="block-header"]').getBoundingClientRect();
    await hoverAt(kidHeader.left + kidHeader.width / 2, kidHeader.top + kidHeader.height / 2);
    await expectRingOn(canvas, "node", kid, "member inside the expanded block");

    // 8 — a plain block's body outlines the block's own box.
    const loadBlock = required<HTMLElement>(bench, '[data-block-id="load"]');
    await hoverAt(loadCard.left + 20, loadCard.bottom - 12);
    await expectRingOn(canvas, "node", loadBlock, "plain block body");
  },
};
