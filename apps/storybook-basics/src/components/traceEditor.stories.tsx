// src/components/traceEditor.stories.tsx — the editor's STATES, colocated
// with the component.
//
// WHY this is not a second copy of `src/components/TraceInteractive.stories.tsx`:
// that file is the D5 gallery — the hero, the routings, and the two
// acceptance gestures (A7 add / A8 collapse) driven end to end. This one
// pins the states around those gestures that nothing currently measures:
// the REVEAL policy's three doors (forced, hovered, selected), the handle
// LAYOUT against the polyline it claims to control, the `handleRadius`
// override, and `lockBends` — the half of the lock pair `LockedEndpoints`
// does not cover.
//
// Every spatial claim is measured. Handle positions are compared against
// the vertices parsed out of the rendered `SVGPathElement`'s own `d`, in
// screen space via the real CTM; handle sizes are read with
// `getBoundingClientRect`; and the collapse threshold is asserted against
// the exported `TRACE_BEND_COLLAPSE_PX` rather than the literal 4 — a drag
// that lands INSIDE it must delete its bend and a drag that lands outside
// must keep it, with both distances measured off the path afterwards.
//
// Every canvas below is deliberately drawn at CTM scale 1 (explicit
// `width`/`height` matching the `viewBox`, never `width="100%"`), because
// `TRACE_BEND_COLLAPSE_PX` is a SCENE-space number: at any other scale the
// story would have to divide it back out to place a drag, and a test that
// does arithmetic on its own oracle is not testing much.

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, fireEvent, waitFor } from "storybook/test";

import { TRACE_BEND_COLLAPSE_PX, TraceEditor } from "./traceEditor";
import { TRACE_TERMINAL_RADIUS } from "./traceTerminal";
import type { Point, TraceTerminalSpec } from "./trace.layout";

/* ------------------------------------------------------------------ */
/* Page scaffolding — `TraceInteractive.stories.tsx`'s own shape.       */
/* ------------------------------------------------------------------ */

function Caption({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 680 }}>
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

const W = 480;
const H = 200;

/** CTM scale 1, on purpose — see this file's header. */
function Canvas({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <svg
      data-testid={testId}
      data-slot="story-canvas"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ background: "var(--muted)", borderRadius: 8, display: "block", overflow: "visible" }}
    >
      {children}
    </svg>
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

function centreOf(el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function userToClient(svg: SVGSVGElement, p: Point): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  const point = svg.createSVGPoint();
  point.x = p.x;
  point.y = p.y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/** `"M x y L x y L x y"` -> its vertices. `straight` routing is the only
 * one this file uses, and `polylinePath` (trace.layout.ts:208) writes
 * exactly that, so every number in `d` is a coordinate. */
function pathVertices(d: string): Point[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return points;
}

function countL(d: string): number {
  return (d.match(/L/g) ?? []).length;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Perpendicular distance from `p` to the segment `a`-`b` — the same
 * quantity `traceEditor.tsx`'s own `distanceToSegment` compares against
 * `TRACE_BEND_COLLAPSE_PX`, restated here so the story measures the result
 * rather than importing the component's private judgement of it. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t =
    lengthSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** A genuine pointer gesture — `bubbles: true` so it reaches the `window`
 * listeners `traceEditor.tsx` attaches (its own header explains why the
 * drag lives there and not on the handle element). Lifted verbatim from
 * `TraceInteractive.stories.tsx`, which lifted it from `TraceBadge`. */
function firePointer(el: EventTarget, type: string, client: Point, pointerId = 1) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      pointerType: "mouse",
      clientX: client.x,
      clientY: client.y,
    }),
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Grab `handle` at its measured centre and drop it on the USER-space point
 * `target`, in five steps — a whole gesture, down through up. */
async function dragHandleTo(svg: SVGSVGElement, handle: Element, target: Point): Promise<void> {
  const grab = centreOf(handle);
  const drop = userToClient(svg, target);
  firePointer(handle, "pointerdown", grab);
  await wait(16);
  for (let i = 1; i <= 5; i += 1) {
    const t = i / 5;
    firePointer(handle, "pointermove", {
      x: grab.x + (drop.x - grab.x) * t,
      y: grab.y + (drop.y - grab.y) * t,
    });
    await wait(8);
  }
  firePointer(handle, "pointerup", drop);
  await wait(16);
}

function handleIds(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('[data-slot="trace-handle"]'))
    .map((el) => el.getAttribute("data-handle-id") ?? "")
    .sort();
}

/* ------------------------------------------------------------------ */
/* Fixture — a horizontal chord, so a bend's distance from the chord is */
/* just |y - chordY| and the collapse threshold is readable by eye.     */
/* ------------------------------------------------------------------ */

const FROM: TraceTerminalSpec = { x: 40, y: 100, dir: "right" };
const TO: TraceTerminalSpec = { x: 440, y: 100, dir: "right" };
const CHORD_Y = 100;

/** The default handle sizes `traceEditor.tsx` documents (lines 89-90, 103):
 * a terminal's invisible grab circle, and the two drawn interior dots. */
const TERMINAL_HIT_RADIUS = 13;
const BEND_HANDLE_RADIUS = 4;
const VIRTUAL_HANDLE_RADIUS = 3;

const meta = {
  title: "Components/Traces/TraceEditor",
  tags: ["object:trace", "lane:baseline"],
  component: TraceEditor,
  // Placeholders only — every story supplies its own `render` and never
  // reads `args` (the idiom `TraceInteractive.stories.tsx` already uses for
  // this component's required `id`/`from`/`to`).
  args: { id: "trace-editor-states", from: FROM, to: TO },
} satisfies Meta<typeof TraceEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* 1. Revealed — the handle SET and its LAYOUT against the polyline      */
/* ==================================================================== */

export const Revealed: Story = {
  render: () => (
    <Page>
      <Caption
        title="Revealed"
        text="revealed forces the handles on regardless of hover or selection. One bend gives five handles: two terminals, the bend itself, and a virtual midpoint per segment. The play function requires every one of them to sit on the vertex (or segment midpoint) it claims to control, measured off the rendered path."
      />
      <Canvas testId="revealed-canvas">
        <TraceEditor
          id="revealed"
          from={FROM}
          to={TO}
          routing="straight"
          defaultBends={[{ t: 0.4, o: -45 }]}
          revealed
        />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="revealed-canvas"]');
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');

    // One bend -> a 3-vertex polyline, i.e. two `L` commands.
    const vertices = pathVertices(line.getAttribute("d")!);
    await expect(countL(line.getAttribute("d")!)).toBe(2);
    await expect(vertices).toHaveLength(3);

    // The whole handle vocabulary, by id — not a count.
    await expect(handleIds(svg)).toEqual(["bend:0", "end", "start", "virtual:0", "virtual:1"]);

    // Each handle's MEASURED centre against the vertex it belongs to.
    const expected: [string, Point][] = [
      ["start", vertices[0]],
      ["bend:0", vertices[1]],
      ["end", vertices[2]],
      ["virtual:0", midpoint(vertices[0], vertices[1])],
      ["virtual:1", midpoint(vertices[1], vertices[2])],
    ];
    for (const [id, point] of expected) {
      const handle = requireEl<SVGCircleElement>(svg, `[data-handle-id="${id}"]`);
      const centre = centreOf(handle);
      const want = userToClient(svg, point);
      await expect(Math.abs(centre.x - want.x), `${id} x`).toBeLessThan(0.5);
      await expect(Math.abs(centre.y - want.y), `${id} y`).toBeLessThan(0.5);
    }

    // The three default sizes, measured: 26 / 8 / 6 px across.
    const widthOf = (id: string) =>
      requireEl<SVGCircleElement>(svg, `[data-handle-id="${id}"]`).getBoundingClientRect().width;
    await expect(widthOf("start")).toBeCloseTo(TERMINAL_HIT_RADIUS * 2, 1);
    await expect(widthOf("end")).toBeCloseTo(TERMINAL_HIT_RADIUS * 2, 1);
    await expect(widthOf("bend:0")).toBeCloseTo(BEND_HANDLE_RADIUS * 2, 1);
    await expect(widthOf("virtual:0")).toBeCloseTo(VIRTUAL_HANDLE_RADIUS * 2, 1);

    // ...and the claim those numbers exist to make: the invisible grab
    // circle is WIDER than the glyph `Trace` paints at the same point, so a
    // terminal is easy to grab without a second, redundant dot on top of it.
    await expect(widthOf("start")).toBeGreaterThan(TRACE_TERMINAL_RADIUS * 2);
  },
};

/* ==================================================================== */
/* 2. HoverReveals — door one of the reveal policy                       */
/* ==================================================================== */

export const HoverReveals: Story = {
  render: () => (
    <Page>
      <Caption
        title="Hover reveals"
        text="With no revealed prop the policy is hovered || selected, and hover is attached to the editor's OWN outer <g> — so moving from the hit stroke onto a handle never fires a spurious leave. Handles are absent until the pointer arrives and gone again when it leaves."
      />
      <Canvas testId="hover-canvas">
        <TraceEditor id="hover" from={FROM} to={TO} routing="straight" defaultBends={[{ t: 0.4, o: -45 }]} />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="hover-canvas"]');
    const hit = requireEl<SVGPathElement>(svg, '[data-slot="trace-hit"]');

    // Cold: the trace draws, and nothing else does.
    await expect(svg.querySelectorAll('[data-slot="trace-handle"]')).toHaveLength(0);
    await expect(svg.querySelectorAll('[data-slot="trace-line"]')).toHaveLength(1);

    // React synthesises onPointerEnter from a bubbling `pointerover` with a
    // null relatedTarget, which is exactly what `fireEvent.pointerOver`
    // dispatches — the same path `userEvent.hover` takes.
    fireEvent.pointerOver(hit);
    await waitFor(() =>
      expect(handleIds(svg)).toEqual(["bend:0", "end", "start", "virtual:0", "virtual:1"]),
    );

    // The revealed handles are real, positioned geometry, not placeholders:
    // the bend dot sits on the polyline's middle vertex.
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
    const middle = pathVertices(line.getAttribute("d")!)[1];
    const bendCentre = centreOf(requireEl(svg, '[data-handle-id="bend:0"]'));
    const want = userToClient(svg, middle);
    await expect(Math.abs(bendCentre.x - want.x)).toBeLessThan(0.5);
    await expect(Math.abs(bendCentre.y - want.y)).toBeLessThan(0.5);

    fireEvent.pointerOut(hit);
    await waitFor(() => expect(svg.querySelectorAll('[data-slot="trace-handle"]')).toHaveLength(0));
  },
};

/* ==================================================================== */
/* 3. SelectedByClick — door two, and Escape as the way back out         */
/* ==================================================================== */

export const SelectedByClick: Story = {
  render: () => (
    <Page>
      <Caption
        title="Selected by click"
        text="A pointer-down on the line itself (or on its invisible hit band) latches the handles on, so they survive the pointer wandering off. Escape clears it — as does a pointer-down anywhere outside this editor's own subtree."
      />
      <Canvas testId="select-canvas">
        <TraceEditor id="select" from={FROM} to={TO} routing="straight" defaultBends={[{ t: 0.4, o: -45 }]} />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="select-canvas"]');
    const hit = requireEl<SVGPathElement>(svg, '[data-slot="trace-hit"]');
    await expect(svg.querySelectorAll('[data-slot="trace-handle"]')).toHaveLength(0);

    // The document-level listener keys off the hit band / the line, so a
    // real bubbling pointerdown is what selects.
    firePointer(hit, "pointerdown", centreOf(hit));
    await waitFor(() =>
      expect(handleIds(svg)).toEqual(["bend:0", "end", "start", "virtual:0", "virtual:1"]),
    );

    // Selection outlives the pointer leaving — this is what distinguishes
    // it from the hover door above.
    fireEvent.pointerOut(hit);
    await wait(30);
    await expect(svg.querySelectorAll('[data-slot="trace-handle"]')).toHaveLength(5);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(svg.querySelectorAll('[data-slot="trace-handle"]')).toHaveLength(0));

    // ...and the trace itself never went anywhere while the chrome came and
    // went: still one line, still a 3-vertex polyline.
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
    await expect(countL(line.getAttribute("d")!)).toBe(2);
  },
};

/* ==================================================================== */
/* 4. BendCollapseThreshold — TRACE_BEND_COLLAPSE_PX as the oracle       */
/* ==================================================================== */

export const BendCollapseThreshold: Story = {
  render: () => (
    <Page>
      <Caption
        title="Collapse threshold"
        text={`Drop a bend within ${TRACE_BEND_COLLAPSE_PX}px of the chord joining its neighbours and it is deleted — the inverse of dragging a virtual dot out. This play function drops one INSIDE the threshold (it must vanish) and then grows a fresh one well OUTSIDE it (it must survive), measuring both distances off the rendered path rather than trusting the gesture.`}
      />
      <Canvas testId="collapse-canvas">
        <TraceEditor
          id="collapse"
          from={FROM}
          to={TO}
          routing="straight"
          defaultBends={[{ t: 0.5, o: 40 }]}
          revealed
        />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="collapse-canvas"]');
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
    const d0 = line.getAttribute("d")!;
    const start0 = pathVertices(d0)[0];
    const end0 = pathVertices(d0)[2];

    // The seeded bend is a real corner: 40px off the chord, ten times the
    // threshold, and the chord itself is flat so the distance is readable.
    await expect(countL(d0)).toBe(2);
    await expect(start0.y).toBeCloseTo(CHORD_Y, 3);
    await expect(end0.y).toBeCloseTo(CHORD_Y, 3);
    const seeded = distanceToSegment(pathVertices(d0)[1], start0, end0);
    await expect(seeded).toBeCloseTo(40, 1);
    await expect(seeded).toBeGreaterThan(TRACE_BEND_COLLAPSE_PX);

    /* ---- inside the threshold: the bend is deleted on drop ---------- */
    const insideTarget: Point = { x: (start0.x + end0.x) / 2, y: CHORD_Y - TRACE_BEND_COLLAPSE_PX / 2 };
    await expect(distanceToSegment(insideTarget, start0, end0)).toBeLessThan(TRACE_BEND_COLLAPSE_PX);
    await dragHandleTo(svg, requireEl(svg, '[data-handle-id="bend:0"]'), insideTarget);

    await waitFor(() => expect(countL(line.getAttribute("d")!)).toBe(1));
    await expect(svg.querySelectorAll('[data-handle-kind="bend"]')).toHaveLength(0);
    // Collapsing restores the exact straight chord, not an almost-straight
    // one with a nearly-collinear vertex left in it.
    const flat = pathVertices(line.getAttribute("d")!);
    await expect(flat).toHaveLength(2);
    await expect(flat[0].y).toBeCloseTo(CHORD_Y, 3);
    await expect(flat[1].y).toBeCloseTo(CHORD_Y, 3);

    /* ---- outside the threshold: one drag, one surviving corner ------ */
    const outsideOffset = TRACE_BEND_COLLAPSE_PX * 4;
    const outsideTarget: Point = { x: (start0.x + end0.x) / 2, y: CHORD_Y - outsideOffset };
    await expect(distanceToSegment(outsideTarget, start0, end0)).toBeGreaterThan(TRACE_BEND_COLLAPSE_PX);
    await dragHandleTo(svg, requireEl(svg, '[data-handle-id="virtual:0"]'), outsideTarget);

    await waitFor(() => expect(countL(line.getAttribute("d")!)).toBe(2));
    const grown = pathVertices(line.getAttribute("d")!);
    await expect(grown).toHaveLength(3);
    const grownDistance = distanceToSegment(grown[1], grown[0], grown[2]);
    await expect(
      Math.abs(grownDistance - outsideOffset),
      `grown bend measured ${grownDistance.toFixed(2)}px off the chord, dropped at ${outsideOffset}px`,
    ).toBeLessThan(0.75);
    await expect(grownDistance).toBeGreaterThan(TRACE_BEND_COLLAPSE_PX);
    // Exactly ONE corner grew — the base-capture rule (`activeRailDrag`):
    // a drag adjusts the bend it inserted, it does not insert per move.
    await expect(svg.querySelectorAll('[data-handle-kind="bend"]')).toHaveLength(1);
  },
};

/* ==================================================================== */
/* 5. LockedBends — the other half of the lock pair                      */
/* ==================================================================== */

export const LockedBends: Story = {
  render: () => (
    <Page>
      <Caption
        title="Locked bends"
        text="lockBends is the read-only display case: the corner is drawn and reported but neither drags nor double-click-deletes. The terminals are untouched by it and still move — the mirror image of the LockedEndpoints story in Components › Traces › Trace › Interactive."
      />
      <Canvas testId="locked-bends-canvas">
        <TraceEditor
          id="locked-bends"
          from={FROM}
          to={TO}
          routing="straight"
          defaultBends={[{ t: 0.5, o: 40 }]}
          lockBends
          revealed
        />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="locked-bends-canvas"]');
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
    const bend = requireEl<SVGCircleElement>(svg, '[data-handle-id="bend:0"]');
    const start = requireEl<SVGCircleElement>(svg, '[data-handle-id="start"]');

    // The lock is published per handle KIND, not globally.
    await expect(bend.getAttribute("data-handle-locked")).toBe("true");
    await expect(start.getAttribute("data-handle-locked")).toBeNull();
    await expect(getComputedStyle(bend).cursor).toBe("default");

    const before = line.getAttribute("d")!;

    // A full drag of the locked corner: the path is byte-identical after.
    await dragHandleTo(svg, bend, { x: 240, y: CHORD_Y - 80 });
    await expect(line.getAttribute("d")!).toBe(before);

    // ...and so is a double-click, the other delete gesture.
    fireEvent.dblClick(bend);
    await wait(30);
    await expect(line.getAttribute("d")!).toBe(before);
    await expect(countL(line.getAttribute("d")!)).toBe(2);

    /* ---- terminals are NOT locked: the start really moves ----------- */
    // `traceGeometry` pulls the route back from the terminal by the gap,
    // along the terminal's own dir — so the rendered `M` is the dragged
    // point PLUS whatever that pull-back was at mount, read off the DOM
    // rather than assumed to be 16.
    const m0 = pathVertices(before)[0];
    const pullBack: Point = { x: m0.x - FROM.x, y: m0.y - FROM.y };
    const dropAt: Point = { x: 90, y: 150 };
    await dragHandleTo(svg, start, dropAt);

    await waitFor(() => expect(line.getAttribute("d")!).not.toBe(before));
    const m1 = pathVertices(line.getAttribute("d")!)[0];
    await expect(Math.abs(m1.x - (dropAt.x + pullBack.x))).toBeLessThan(0.75);
    await expect(Math.abs(m1.y - (dropAt.y + pullBack.y))).toBeLessThan(0.75);
    // The locked corner is still there — moving an endpoint is not a way
    // around the lock, and a chord-relative bend rides the new chord.
    await expect(countL(line.getAttribute("d")!)).toBe(2);
  },
};

/* ==================================================================== */
/* 6. HandleRadiusOverride — one knob, both interior kinds               */
/* ==================================================================== */

const BIG_HANDLE = 9;

export const HandleRadiusOverride: Story = {
  render: () => (
    <Page>
      <Caption
        title="Handle radius override"
        text={`handleRadius is deliberately ONE number, not two: it replaces the bend radius (${BEND_HANDLE_RADIUS}) and the virtual radius (${VIRTUAL_HANDLE_RADIUS}) together, and leaves the terminals' own grab circle alone — that one has its own prop, because it is a hit target rather than a drawn dot.`}
      />
      <Canvas testId="radius-canvas">
        <TraceEditor
          id="radius"
          from={FROM}
          to={TO}
          routing="straight"
          defaultBends={[{ t: 0.5, o: 40 }]}
          handleRadius={BIG_HANDLE}
          revealed
        />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="radius-canvas"]');
    const widthOf = (id: string) =>
      requireEl<SVGCircleElement>(svg, `[data-handle-id="${id}"]`).getBoundingClientRect().width;

    // Both interior kinds took the override — and they are now the SAME
    // size as each other, which they are not by default.
    await expect(widthOf("bend:0")).toBeCloseTo(BIG_HANDLE * 2, 1);
    await expect(widthOf("virtual:0")).toBeCloseTo(BIG_HANDLE * 2, 1);
    await expect(widthOf("virtual:1")).toBeCloseTo(BIG_HANDLE * 2, 1);
    await expect(Math.abs(widthOf("bend:0") - widthOf("virtual:0"))).toBeLessThan(0.01);
    await expect(widthOf("bend:0")).toBeGreaterThan(BEND_HANDLE_RADIUS * 2);

    // The terminal grab circle is untouched by it.
    await expect(widthOf("start")).toBeCloseTo(TERMINAL_HIT_RADIUS * 2, 1);
    await expect(widthOf("end")).toBeCloseTo(TERMINAL_HIT_RADIUS * 2, 1);

    // Growing the dots moved none of them: every handle still sits on the
    // vertex (or midpoint) it controls.
    const line = requireEl<SVGPathElement>(svg, '[data-slot="trace-line"]');
    const vertices = pathVertices(line.getAttribute("d")!);
    const expected: [string, Point][] = [
      ["start", vertices[0]],
      ["bend:0", vertices[1]],
      ["end", vertices[2]],
      ["virtual:0", midpoint(vertices[0], vertices[1])],
      ["virtual:1", midpoint(vertices[1], vertices[2])],
    ];
    for (const [id, point] of expected) {
      const centre = centreOf(requireEl(svg, `[data-handle-id="${id}"]`));
      const want = userToClient(svg, point);
      await expect(Math.abs(centre.x - want.x), `${id} x`).toBeLessThan(0.5);
      await expect(Math.abs(centre.y - want.y), `${id} y`).toBeLessThan(0.5);
    }
  },
};
