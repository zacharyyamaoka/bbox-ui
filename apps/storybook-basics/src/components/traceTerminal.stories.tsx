// src/components/traceTerminal.stories.tsx — the terminal GLYPH on its own,
// colocated with the component it measures.
//
// WHY this exists next to `Trace.stories.tsx`'s own `TerminalDirections`,
// which already draws the four tangents: that story pins the ARROW's
// rotation (the `dir` vocabulary). Nothing yet pins the two numbers this
// file exports — `TRACE_TERMINAL_RADIUS` and `TRACE_TERMINAL_RING_PX` — as
// painted geometry, and those are precisely the numbers `traceEditor.tsx`
// reasons against when it sizes its invisible grab circle "deliberately
// wider than the drawn glyph".
//
// Every spatial claim below is MEASURED: `getBoundingClientRect` for
// centres and for radius scaling, and `document.elementFromPoint` for the
// ring's painted outer edge. The ring is a stroked circle, so its box is
// ambiguous by construction (whether a UA folds the stroke into
// `getBoundingClientRect` is not something a story should bet on) — a radial
// hit-test scan is not, which is why the ring-width claim is made that way
// and the box is only ever used for DIFFERENCES, where the constant stroke
// contribution cancels.

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect } from "storybook/test";

import { TRACE_TERMINAL_RADIUS, TRACE_TERMINAL_RING_PX, TraceTerminal } from "./traceTerminal";

/* ------------------------------------------------------------------ */
/* Page scaffolding — same shape `TraceInteractive.stories.tsx` uses.   */
/* ------------------------------------------------------------------ */

function Caption({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 640 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted-foreground)" }}>{text}</div>
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, background: "var(--background)" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement                                                          */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el;
}

function centreOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/** User units -> CSS px for this `<svg>`, read off the real CTM rather than
 * divided out of the width/viewBox by hand. */
function scaleOf(svg: SVGSVGElement): number {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  return ctm.a;
}

/**
 * The radius, in USER units, of the outermost point the ring still paints —
 * found by walking outward along +x from the glyph centre and asking the
 * browser's own hit test which element is on top. A stroked circle of radius
 * `r` and stroke-width `w` paints out to `r + w/2`, so this measures
 * `TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX / 2` without ever asking
 * what a bounding box does with a stroke.
 */
function paintedOuterRadius(svg: SVGSVGElement, ring: Element, centre: { x: number; y: number }): number {
  const scale = scaleOf(svg);
  const step = 0.05;
  let last = 0;
  for (let r = TRACE_TERMINAL_RADIUS - 1; r <= TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX * 2; r += step) {
    if (document.elementFromPoint(centre.x + r * scale, centre.y) === ring) last = r;
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* Meta                                                                 */
/* ------------------------------------------------------------------ */

const ZOOM_BOX = 40;
const ZOOM = 6;

const meta = {
  title: "Trace/Terminal",
  tags: ["area:trace", "lane:baseline"],
  component: TraceTerminal,
  args: { x: ZOOM_BOX / 2, y: ZOOM_BOX / 2, dir: "right" as const },
} satisfies Meta<typeof TraceTerminal>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* 1. RingGeometry — the two exported constants, painted and measured   */
/* ==================================================================== */

export const RingGeometry: Story = {
  render: () => (
    <Page>
      <Caption
        title="Ring geometry"
        text={`One terminal at ${ZOOM}× so the ${TRACE_TERMINAL_RING_PX}px ring is visible as a band, not a hairline. The play function walks outward from the centre asking elementFromPoint what is painted, and requires the last painted radius to be TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX / 2.`}
      />
      <svg
        data-testid="ring-canvas"
        width={ZOOM_BOX * ZOOM}
        height={ZOOM_BOX * ZOOM}
        viewBox={`0 0 ${ZOOM_BOX} ${ZOOM_BOX}`}
        style={{ background: "var(--muted)", borderRadius: 8, display: "block" }}
      >
        <TraceTerminal x={ZOOM_BOX / 2} y={ZOOM_BOX / 2} dir="right" />
      </svg>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.scrollIntoView({ block: "center" });
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="ring-canvas"]');
    const scale = scaleOf(svg);
    await expect(scale).toBeCloseTo(ZOOM, 2);

    const ring = requireEl<SVGCircleElement>(svg, '[data-slot="trace-terminal-ring"]');

    // 1. The glyph lands on the {x, y} it was asked for — via the real CTM.
    const want = toScreen(svg, ZOOM_BOX / 2, ZOOM_BOX / 2);
    const centre = centreOf(ring);
    await expect(Math.abs(centre.x - want.x)).toBeLessThan(0.5);
    await expect(Math.abs(centre.y - want.y)).toBeLessThan(0.5);

    // 2. The default radius is the exported constant, not a literal: the
    //    ring's own attribute AND the painted disc both say 9.
    await expect(Number(ring.getAttribute("r"))).toBe(TRACE_TERMINAL_RADIUS);
    await expect(Number(ring.getAttribute("stroke-width"))).toBe(TRACE_TERMINAL_RING_PX);

    // 3. Three probes across the band, in user units scaled by the CTM:
    //    inside the fill, on the stroke only, and clear of both.
    const probe = (userRadius: number) =>
      document.elementFromPoint(centre.x + userRadius * scale, centre.y);
    await expect(probe(TRACE_TERMINAL_RADIUS - 1)).toBe(ring);
    // 9.5 is OUTSIDE the r=9 disc — only the ring's own stroke reaches it.
    await expect(probe(TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX / 4)).toBe(ring);
    // 11 is past r + w/2 = 10; nothing of the glyph paints there.
    await expect(probe(TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX)).not.toBe(ring);

    // 4. The measured outer edge, as a number: r + w/2 = 10 user units.
    //    Tolerance 0.5 keeps this mutation-sensitive — a ring of width 0
    //    would measure 9.0, a full unit away.
    const outer = paintedOuterRadius(svg, ring, centre);
    const wantOuter = TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX / 2;
    await expect(
      Math.abs(outer - wantOuter),
      `painted outer radius measured ${outer.toFixed(2)}u, want ${wantOuter}u`,
    ).toBeLessThan(0.5);

    // 5. The arrow is strictly INSIDE the ring it sits in (`arrowPath` runs
    //    to 0.5r ahead and 0.4r behind), so the glyph reads as one mark.
    const arrow = requireEl<SVGPathElement>(svg, '[data-slot="trace-terminal-arrow"]');
    const arrowRect = arrow.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    await expect(arrowRect.left).toBeGreaterThan(ringRect.left);
    await expect(arrowRect.right).toBeLessThan(ringRect.right);
    await expect(arrowRect.top).toBeGreaterThan(ringRect.top);
    await expect(arrowRect.bottom).toBeLessThan(ringRect.bottom);
  },
};

/* ==================================================================== */
/* 2. RadiusScaling — `radius` overrides the constant, linearly          */
/* ==================================================================== */

const SCALE_ROW = [
  { key: "default", radius: TRACE_TERMINAL_RADIUS, cx: 60 },
  { key: "double", radius: TRACE_TERMINAL_RADIUS * 2, cx: 180 },
  { key: "triple", radius: TRACE_TERMINAL_RADIUS * 3, cx: 330 },
] as const;

const SCALE_W = 420;
const SCALE_H = 120;

export const RadiusScaling: Story = {
  render: () => (
    <Page>
      <Caption
        title="Radius scaling"
        text="TRACE_TERMINAL_RADIUS is the default, not the only size — the whole glyph (ring and arrow) scales as one piece because arrowPath is written in fractions of the radius. Measured as DIFFERENCES between the three rings, so whatever the box does with the constant 2px stroke cancels out."
      />
      <svg
        data-testid="scale-canvas"
        width={SCALE_W}
        height={SCALE_H}
        viewBox={`0 0 ${SCALE_W} ${SCALE_H}`}
        style={{ background: "var(--muted)", borderRadius: 8, display: "block" }}
      >
        {SCALE_ROW.map((cell) => (
          <g key={cell.key} data-cell={cell.key}>
            <TraceTerminal x={cell.cx} y={SCALE_H / 2} dir="right" radius={cell.radius} />
          </g>
        ))}
      </svg>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="scale-canvas"]');
    await expect(scaleOf(svg)).toBeCloseTo(1, 2);

    const rings = SCALE_ROW.map((cell) => ({
      cell,
      ring: requireEl<SVGCircleElement>(svg, `[data-cell="${cell.key}"] [data-slot="trace-terminal-ring"]`),
    }));

    // Every ring lands on its own centre, untouched by its size.
    for (const { cell, ring } of rings) {
      const want = toScreen(svg, cell.cx, SCALE_H / 2);
      const centre = centreOf(ring);
      await expect(Math.abs(centre.x - want.x)).toBeLessThan(0.5);
      await expect(Math.abs(centre.y - want.y)).toBeLessThan(0.5);
    }

    const widths = rings.map(({ ring }) => ring.getBoundingClientRect().width);

    // The default box brackets the constants: at least the bare disc
    // (2r = 18), at most the disc plus the full ring (2r + w = 20).
    await expect(widths[0]).toBeGreaterThanOrEqual(TRACE_TERMINAL_RADIUS * 2 - 0.5);
    await expect(widths[0]).toBeLessThanOrEqual(TRACE_TERMINAL_RADIUS * 2 + TRACE_TERMINAL_RING_PX + 0.5);

    // ...and the DIFFERENCES are exactly 2 Δr — 18px and 36px — because the
    // stroke width does not scale with the radius.
    await expect(Math.abs(widths[1] - widths[0] - TRACE_TERMINAL_RADIUS * 2)).toBeLessThan(0.5);
    await expect(Math.abs(widths[2] - widths[0] - TRACE_TERMINAL_RADIUS * 4)).toBeLessThan(0.5);

    // The arrow scales with it: authored -0.4r..+0.5r, so its drawn width
    // grows by 0.9 Δr between each pair (stroke contribution cancels only
    // partially here, hence the looser 1.5px window).
    const arrows = SCALE_ROW.map((cell) =>
      requireEl<SVGPathElement>(svg, `[data-cell="${cell.key}"] [data-slot="trace-terminal-arrow"]`).getBoundingClientRect(),
    );
    await expect(arrows[1].width - arrows[0].width).toBeGreaterThan(0.9 * TRACE_TERMINAL_RADIUS - 1.5);
    await expect(arrows[2].width - arrows[0].width).toBeGreaterThan(1.8 * TRACE_TERMINAL_RADIUS - 1.5);
  },
};

/* ==================================================================== */
/* 3. DirectionHidden — `showDirection={false}` moves NOTHING            */
/* ==================================================================== */

const PAIR_W = 260;
const PAIR_H = 100;
const PAIR_LEFT = 70;
const PAIR_RIGHT = 190;

export const DirectionHidden: Story = {
  render: () => (
    <Page>
      <Caption
        title="Blind terminal"
        text="A routing that does not read this end's dir passes showDirection={false} rather than let the glyph assert a polarity the geometry ignores. The component's own promise is that only the <path> goes — the ring's radius and centre never move — so a blind and an honoured terminal still line up size-for-size in a gallery row. Measured, not assumed."
      />
      <svg
        data-testid="pair-canvas"
        width={PAIR_W}
        height={PAIR_H}
        viewBox={`0 0 ${PAIR_W} ${PAIR_H}`}
        style={{ background: "var(--muted)", borderRadius: 8, display: "block" }}
      >
        <g data-cell="honoured">
          <TraceTerminal x={PAIR_LEFT} y={PAIR_H / 2} dir="right" />
        </g>
        <g data-cell="blind">
          <TraceTerminal x={PAIR_RIGHT} y={PAIR_H / 2} dir="right" showDirection={false} />
        </g>
      </svg>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="pair-canvas"]');
    const honoured = requireEl<SVGGElement>(svg, '[data-cell="honoured"]');
    const blind = requireEl<SVGGElement>(svg, '[data-cell="blind"]');

    // Exactly one arrow on the page, and it belongs to the honoured end.
    await expect(honoured.querySelectorAll('[data-slot="trace-terminal-arrow"]')).toHaveLength(1);
    await expect(blind.querySelectorAll('[data-slot="trace-terminal-arrow"]')).toHaveLength(0);
    await expect(svg.querySelectorAll('[data-slot="trace-terminal-arrow"]')).toHaveLength(1);

    // Both still carry a ring, and both rings measure the same.
    const honouredRing = requireEl<SVGCircleElement>(honoured, '[data-slot="trace-terminal-ring"]');
    const blindRing = requireEl<SVGCircleElement>(blind, '[data-slot="trace-terminal-ring"]');
    const a = honouredRing.getBoundingClientRect();
    const b = blindRing.getBoundingClientRect();
    await expect(Math.abs(a.width - b.width)).toBeLessThan(0.01);
    await expect(Math.abs(a.height - b.height)).toBeLessThan(0.01);

    // And each is still centred on its own {x, y} — the blind glyph did not
    // shrink onto, or drift off, the point it marks.
    for (const [ring, x] of [
      [honouredRing, PAIR_LEFT],
      [blindRing, PAIR_RIGHT],
    ] as const) {
      const want = toScreen(svg, x, PAIR_H / 2);
      const centre = centreOf(ring);
      await expect(Math.abs(centre.x - want.x)).toBeLessThan(0.5);
      await expect(Math.abs(centre.y - want.y)).toBeLessThan(0.5);
    }

    // The horizontal gap between the two centres is exactly the gap asked
    // for — a blind terminal occupies the same slot as an honoured one.
    await expect(Math.abs((b.left + b.width / 2) - (a.left + a.width / 2) - (PAIR_RIGHT - PAIR_LEFT))).toBeLessThan(0.5);
  },
};

/* ==================================================================== */
/* 4. OpaqueDiscAndColor — the `fill`/`color` props, and the occlusion   */
/*    claim the `fill` doc comment makes in prose.                       */
/* ==================================================================== */

const INK = "rgb(220, 38, 38)";
const DISC = "rgb(255, 255, 255)";

export const OpaqueDiscAndColor: Story = {
  render: () => (
    <Page>
      <Caption
        title="Opaque disc, custom ink"
        text="The disc is opaque ON PURPOSE — it hides the trace's own stroke running underneath, so the line reads as arriving AT the terminal rather than through it. A wire is drawn straight through this glyph below; the play function hit-tests the centre and requires the glyph, not the wire, to be what is on top."
      />
      <svg
        data-testid="ink-canvas"
        width={PAIR_W}
        height={PAIR_H}
        viewBox={`0 0 ${PAIR_W} ${PAIR_H}`}
        style={{ background: "var(--muted)", borderRadius: 8, display: "block" }}
      >
        <line
          data-testid="under-wire"
          x1={10}
          y1={PAIR_H / 2}
          x2={PAIR_W - 10}
          y2={PAIR_H / 2}
          stroke="rgb(20, 20, 20)"
          strokeWidth={6}
        />
        <TraceTerminal x={PAIR_W / 2} y={PAIR_H / 2} dir="right" color={INK} fill={DISC} />
      </svg>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.scrollIntoView({ block: "center" });
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="ink-canvas"]');
    const glyph = requireEl<SVGGElement>(svg, '[data-slot="trace-terminal"]');
    const ring = requireEl<SVGCircleElement>(svg, '[data-slot="trace-terminal-ring"]');
    const arrow = requireEl<SVGPathElement>(svg, '[data-slot="trace-terminal-arrow"]');
    const wire = requireEl<SVGLineElement>(svg, '[data-testid="under-wire"]');

    // `color` reaches the ring's stroke, the arrow's stroke, AND the
    // `--bbox-ink-state` custom property the skin boundary reads.
    await expect(getComputedStyle(ring).stroke).toBe(INK);
    await expect(arrow.getAttribute("stroke")).toBe(INK);
    await expect(getComputedStyle(glyph).getPropertyValue("--bbox-ink-state").trim()).toBe(INK);
    await expect(ring.getAttribute("fill")).toBe(DISC);
    await expect(getComputedStyle(ring).strokeWidth).toBe(`${TRACE_TERMINAL_RING_PX}px`);

    // The occlusion claim, hit-tested: the wire runs through y = PAIR_H / 2
    // at full width, but inside the disc the glyph is what answers. Probed
    // 6 user units off-centre so the sample is on the DISC, not on the
    // arrow shaft that also sits at y = 0.
    const centre = centreOf(ring);
    const scale = scaleOf(svg);
    const onDisc = document.elementFromPoint(centre.x, centre.y - 6 * scale);
    await expect(onDisc).toBe(ring);
    // ...and clear of the glyph, the wire is visible again: at r + w = 11
    // user units out along the wire's own axis.
    const offGlyph = document.elementFromPoint(
      centre.x + (TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX) * scale,
      centre.y,
    );
    await expect(offGlyph).toBe(wire);
  },
};
