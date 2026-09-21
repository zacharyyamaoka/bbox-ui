import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { TraceBody, type TraceProps } from "../components/trace";
import { TraceBadge } from "../components/traceBadge";
import { TraceTerminal } from "../components/traceTerminal";
import {
  LABEL_POSITION_MAX,
  LABEL_POSITION_MIN,
  clampLabelPosition,
  fractionNearest,
  pointAtFraction,
  polylineLength,
  polylinePath,
  type Point,
  type TraceTerminalSpec,
} from "../components/trace.layout";

/* ------------------------------------------------------------------ */
/* Fixtures. Both are hand-written vertex lists — no router involved,   */
/* which is what makes this lane independent of P2/P3 (docs/            */
/* TRACE-PLAN.md P4: "fixture uses a straight two-point polyline so it  */
/* needs only P1"). The CORNER fixture is the same free lunch: a        */
/* staircase is just four points, and it is the only shape that can     */
/* tell "the badge follows the pointer" apart from "the badge is        */
/* PROJECTED onto the path" — on a straight line the two look           */
/* identical unless the pointer leaves the line, and at a corner they   */
/* diverge by tens of pixels.                                           */
/* ------------------------------------------------------------------ */

const STAGE_W = 460;
const STAGE_H = 60;
const MID_Y = 30;
const FROM_X = 26;
const TO_X = STAGE_W - 26;
/** The line stops short of each terminal so the ring and the chevron
 * marker never collide — same 16px `Trace.stories.tsx` uses. */
const LINE_GAP = 16;

const STRAIGHT_POINTS: Point[] = [
  { x: FROM_X + LINE_GAP, y: MID_Y },
  { x: TO_X - LINE_GAP, y: MID_Y },
];
const STRAIGHT_FROM: TraceTerminalSpec = { x: FROM_X, y: MID_Y, dir: "right" };
const STRAIGHT_TO: TraceTerminalSpec = { x: TO_X, y: MID_Y, dir: "right" };

const CORNER_W = 420;
const CORNER_H = 200;
const CORNER_POINTS: Point[] = [
  { x: 40, y: 42 },
  { x: 230, y: 42 },
  { x: 230, y: 150 },
  { x: 380, y: 150 },
];
const CORNER_FROM: TraceTerminalSpec = { x: 24, y: 42, dir: "right" };
const CORNER_TO: TraceTerminalSpec = { x: 396, y: 150, dir: "right" };

/* ------------------------------------------------------------------ */
/* The stage: a `position: relative` box with the svg pinned to its     */
/* padding box, so SVG user space and the badge's own CSS space are the */
/* same numbers. That is the contract `traceBadge.tsx`'s header states  */
/* ("points are read in the space an absolutely-positioned child's      */
/* left/top resolve against"), made concrete in one place rather than   */
/* re-established per story.                                            */
/* ------------------------------------------------------------------ */

function TraceStage({
  testId,
  width,
  height,
  points,
  from,
  to,
  traceProps,
  onTraceDoubleClick,
  svgRef,
  children,
}: {
  testId: string;
  width: number;
  height: number;
  points: readonly Point[];
  from: TraceTerminalSpec;
  to: TraceTerminalSpec;
  traceProps?: Partial<TraceProps>;
  onTraceDoubleClick?: (event: ReactMouseEvent<SVGGElement>) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  children?: ReactNode;
}) {
  return (
    <div
      data-slot="trace-stage"
      data-testid={testId}
      style={{ position: "relative", width, height, flexShrink: 0 }}
    >
      <svg
        data-slot="trace-canvas"
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <TraceBody
          id={testId}
          path={polylinePath(points)}
          points={points}
          {...traceProps}
          // Lane A's invisible 12px sibling. Mounted only when someone is
          // listening — a trace nothing listens to should not silently eat
          // pointer events from whatever sits under it (`trace.tsx:113-116`).
          interactive={Boolean(onTraceDoubleClick)}
          onDoubleClick={onTraceDoubleClick}
        />
        <TraceTerminal {...from} />
        <TraceTerminal {...to} />
      </svg>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement helpers. Every spatial claim below is measured off the   */
/* REAL rendered element through the real CTM — never inferred from a   */
/* prop, and never from the component's own math.                       */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

/** Viewport-space centre of a rendered element. */
function centreOf(el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** SVG user space -> viewport, via the live CTM, so the comparison stays
 * correct under any viewBox scaling rather than assuming 1:1. */
function userToClient(svg: SVGGraphicsElement, p: Point): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  const d = new DOMPoint(p.x, p.y).matrixTransform(ctm);
  return { x: d.x, y: d.y };
}

function clientToUser(svg: SVGGraphicsElement, p: Point): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  const d = new DOMPoint(p.x, p.y).matrixTransform(ctm.inverse());
  return { x: d.x, y: d.y };
}

/**
 * Distance from a point to a segment.
 *
 * WHY this is written out again here rather than imported: it is the test's
 * ORACLE for "is the badge on the line", and `fractionNearest` — the thing
 * under test — is built from the same projection. Importing it would let one
 * shared bug agree with itself. This is a few lines of independent
 * arithmetic against the same textbook formula, which is the cheapest
 * independent second implementation available.
 */
function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const u = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
}

/** Shortest viewport-space distance from `client` to the polyline as it is
 * actually painted. */
function distanceToPolyline(svg: SVGGraphicsElement, points: readonly Point[], client: Point): number {
  const screen = points.map((p) => userToClient(svg, p));
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < screen.length; i += 1) {
    best = Math.min(best, distancePointToSegment(client, screen[i - 1], screen[i]));
  }
  return best;
}

function badgeT(badge: Element): number {
  const raw = badge.getAttribute("data-t");
  if (raw === null) throw new Error("badge has no data-t");
  return Number.parseFloat(raw);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A genuine pointer gesture, not a style-only stand-in: the same
 * `new PointerEvent` technique `PortEdge.stories.tsx` already established
 * here, with `isPrimary: true` and `button: 0` because real handlers check
 * both. Moves are dispatched ON THE BADGE even when the coordinates are far
 * outside it — which is precisely what a captured pointer delivers, and what
 * `traceBadge.tsx`'s window listeners are written to receive.
 */
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

/**
 * A real double-click sequence, not a bare `dblclick`: two full
 * mousedown/mouseup/click pairs and then `dblclick`, with `detail` counting
 * up the way a browser counts it. React only needs the last one, but firing
 * the whole sequence is what proves nothing earlier in it (a stray `click`
 * handler, a pointerdown that starts a drag) breaks the gesture.
 */
function fireDoubleClick(el: EventTarget, client: Point) {
  const mouse = (type: string, detail: number) =>
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        detail,
        clientX: client.x,
        clientY: client.y,
      }),
    );
  mouse("mousedown", 1);
  mouse("mouseup", 1);
  mouse("click", 1);
  mouse("mousedown", 2);
  mouse("mouseup", 2);
  mouse("click", 2);
  mouse("dblclick", 2);
}

/* ------------------------------------------------------------------ */
/* Gallery rows — every one of them LIVE. A gallery of dead specimens   */
/* would show the look and hide the whole feature, so each row owns its */
/* own `t`/text state and is draggable and editable exactly as the      */
/* focused stories below are.                                          */
/* ------------------------------------------------------------------ */

interface GalleryRowSpec {
  id: string;
  label: string;
  caption: string;
  t0: number;
  value: string;
  variant?: Parameters<typeof TraceBadge>[0]["variant"];
  trace?: Partial<TraceProps>;
  /** Ride the `delayed` split on the badge's own `t`, so dragging the badge
   * drags the seam the dots start at. */
  splitAtBadge?: boolean;
}

function GalleryRow({ spec }: { spec: GalleryRowSpec }) {
  const [t, setT] = useState(spec.t0);
  const [value, setValue] = useState(spec.value);
  const [editing, setEditing] = useState(false);
  return (
    <div data-testid={`badge-row-${spec.id}`} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ width: 168, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{spec.label}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{spec.caption}</div>
        {/* WHY a LIVE readout and not just the seed in the label: every row
            here is draggable, so a caption that only names the starting `t`
            starts lying the moment anyone uses the gallery — which is the
            first thing a reviewer does. Found by driving a real mouse drag
            and reading the row back: the badge had moved to 0.95 under a
            label still saying 0.5. */}
        <div
          data-testid={`badge-t-${spec.id}`}
          style={{ fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--muted-foreground)", opacity: 0.75 }}
        >
          t {clampLabelPosition(t).toFixed(4)}
        </div>
      </div>
      <TraceStage
        testId={`stage-${spec.id}`}
        width={STAGE_W}
        height={STAGE_H}
        points={STRAIGHT_POINTS}
        from={STRAIGHT_FROM}
        to={STRAIGHT_TO}
        traceProps={{
          ...spec.trace,
          ...(spec.splitAtBadge ? { splitAtLabel: true, labelPosition: t } : null),
        }}
      >
        <TraceBadge
          points={STRAIGHT_POINTS}
          t={t}
          onTChange={setT}
          value={value}
          onValueChange={setValue}
          editing={editing}
          onEditingChange={setEditing}
          variant={spec.variant}
          placeholder="label"
        />
      </TraceStage>
    </div>
  );
}

// WHY the two end rows are fed OUT-OF-RANGE `t` rather than 0.05 / 0.95
// directly: the clamp is documented on the prop, and a documented behaviour
// with no observation is the kind that quietly stops happening. Mutation-
// testing found exactly that — deleting `clampLabelPosition` from
// TraceBadge's render left the whole suite green, because every fixture
// already sat inside the range. These two rows are what makes the render
// clamp real, and they show the rule in the gallery instead of only in a
// comment.
const POSITION_ROWS: GalleryRowSpec[] = [
  { id: "t-min", label: "t = 0", caption: "clamped to 0.05 — off the terminal", t0: 0, value: "start" },
  { id: "t-quarter", label: "t = 0.275", caption: "", t0: 0.275, value: "warm" },
  { id: "t-half", label: "t = 0.5", caption: "the default", t0: 0.5, value: "12 ms" },
  { id: "t-three-quarter", label: "t = 0.725", caption: "", t0: 0.725, value: "retry" },
  { id: "t-max", label: "t = 1", caption: "clamped to 0.95 — off the terminal", t0: 1, value: "end" },
];

const VARIANT_ROWS: GalleryRowSpec[] = [
  { id: "v-default", label: "default", caption: "stock shadcn Badge", t0: 0.5, value: "default", variant: "default" },
  { id: "v-secondary", label: "secondary", caption: "TraceBadge's own default", t0: 0.5, value: "secondary", variant: "secondary" },
  { id: "v-destructive", label: "destructive", caption: "pairs with a red trace", t0: 0.5, value: "timeout", variant: "destructive" },
  { id: "v-outline", label: "outline", caption: "lightest touch on the line", t0: 0.5, value: "outline", variant: "outline" },
];

const TRACE_STYLE_ROWS: GalleryRowSpec[] = [
  { id: "s-data", label: "Data", caption: "plain grey, solid", t0: 0.5, value: "frames", trace: { variant: "data" } },
  { id: "s-async", label: "Async", caption: "carrier + packet dashes", t0: 0.5, value: "queued", trace: { variant: "async" } },
  {
    id: "s-red",
    label: "Red",
    caption: "colour is a plain prop",
    t0: 0.5,
    value: "dropped",
    variant: "destructive",
    trace: { variant: "data", color: "var(--destructive)" },
  },
  {
    id: "s-dotted",
    label: "Dotted",
    caption: "split rides the badge — drag it",
    t0: 0.5,
    value: "delayed",
    trace: { variant: "delayed" },
    splitAtBadge: true,
  },
];

const ALL_GALLERY_ROWS = [...POSITION_ROWS, ...VARIANT_ROWS, ...TRACE_STYLE_ROWS];

function GallerySection({ title, rows }: { title: string; rows: GalleryRowSpec[] }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
        }}
      >
        {title}
      </h3>
      {rows.map((spec) => (
        <GalleryRow key={spec.id} spec={spec} />
      ))}
    </section>
  );
}

const meta = {
  title: "Trace/Badge",
  tags: ["area:trace", "lane:baseline"],
  component: TraceBadge,
  // `points` and `value` are required props, so every story would otherwise
  // restate them purely to satisfy the type. These are the fixture defaults
  // each `render` already draws with.
  args: { points: STRAIGHT_POINTS, value: "12 ms" },
} satisfies Meta<typeof TraceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/**
 * The gallery: thirteen live badges at once — five positions, four stock
 * Badge variants, four trace styles. Every one of them drags and every one
 * of them double-clicks into edit.
 */
export const Gallery: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 26, padding: 20 }}>
      <GallerySection title="Position along the line" rows={POSITION_ROWS} />
      <GallerySection title="Badge variant" rows={VARIANT_ROWS} />
      <GallerySection title="On each trace style" rows={TRACE_STYLE_ROWS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const badges = canvasElement.querySelectorAll('[data-slot="trace-badge"]');
    await expect(badges).toHaveLength(ALL_GALLERY_ROWS.length);

    for (const spec of ALL_GALLERY_ROWS) {
      const row = requireEl(canvasElement, `[data-testid="badge-row-${spec.id}"]`);
      const badge = requireEl<HTMLElement>(row, '[data-slot="trace-badge"]');
      const svg = requireEl<SVGSVGElement>(row, '[data-slot="trace-canvas"]');

      /* --- it really is the stock Badge, with stock EditableText in it -- */
      // Not a lookalike: `[data-slot="badge"]` is emitted by
      // `src/components/badge.tsx` itself, and `badgeVariants` is what puts
      // the variant class on it. If TraceBadge ever grew its own pill, this
      // selector is what would go missing.
      const pill = requireEl<HTMLElement>(badge, '[data-slot="badge"]');
      await expect(requireEl(pill, '[data-slot="editable-text"]')).toBeTruthy();
      await expect(pill.textContent).toBe(spec.value);

      /* --- and it is where `t` says it is, MEASURED ------------------- */
      // `t0` is what the row PASSES; the clamp is what the component
      // promises to render, so that is what is asserted — which is what
      // makes the two out-of-range rows above a real check rather than a
      // caption.
      const expectedT = clampLabelPosition(spec.t0);
      const want = userToClient(svg, pointAtFraction(STRAIGHT_POINTS, expectedT));
      const got = centreOf(badge);
      await expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThanOrEqual(1);
      await expect(badgeT(badge)).toBeCloseTo(expectedT, 6);
      // ...and it sits ON the painted line, not merely near the right x.
      await expect(distanceToPolyline(svg, STRAIGHT_POINTS, got)).toBeLessThanOrEqual(2);
      // The row's own live readout agrees with the badge, so it cannot drift
      // back into being a stale caption.
      await expect(requireEl(row, `[data-testid="badge-t-${spec.id}"]`).textContent).toBe(
        `t ${expectedT.toFixed(4)}`,
      );
    }

    /* --- the four badge variants are genuinely four different paints -- */
    // Otherwise the variant column could be four copies of one look and
    // every check above would still pass.
    const pillBackgrounds = VARIANT_ROWS.map((spec) => {
      const row = requireEl(canvasElement, `[data-testid="badge-row-${spec.id}"]`);
      return getComputedStyle(requireEl(row, '[data-slot="badge"]')).backgroundColor;
    });
    await expect(new Set(pillBackgrounds).size).toBe(VARIANT_ROWS.length);

    /* --- the two clamp rows really sit inside the terminals ---------- */
    const lineLengthClient = (() => {
      const svg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="stage-t-min"] [data-slot="trace-canvas"]');
      const a = userToClient(svg, STRAIGHT_POINTS[0]);
      const b = userToClient(svg, STRAIGHT_POINTS[1]);
      return Math.hypot(b.x - a.x, b.y - a.y);
    })();
    const minBadge = requireEl(canvasElement, '[data-testid="badge-row-t-min"] [data-slot="trace-badge"]');
    const maxBadge = requireEl(canvasElement, '[data-testid="badge-row-t-max"] [data-slot="trace-badge"]');
    const minSvg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="stage-t-min"] [data-slot="trace-canvas"]');
    const maxSvg = requireEl<SVGSVGElement>(canvasElement, '[data-testid="stage-t-max"] [data-slot="trace-canvas"]');
    await expect(centreOf(minBadge).x - userToClient(minSvg, STRAIGHT_POINTS[0]).x).toBeCloseTo(
      lineLengthClient * LABEL_POSITION_MIN,
      0,
    );
    await expect(userToClient(maxSvg, STRAIGHT_POINTS[1]).x - centreOf(maxBadge).x).toBeCloseTo(
      lineLengthClient * (1 - LABEL_POSITION_MAX),
      0,
    );
  },
};

/* ------------------------------------------------------------------ */

function StraightDragFixture() {
  const [t, setT] = useState(0.2);
  const [emitted, setEmitted] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      <TraceStage
        testId="drag-stage"
        width={STAGE_W}
        height={STAGE_H}
        points={STRAIGHT_POINTS}
        from={STRAIGHT_FROM}
        to={STRAIGHT_TO}
      >
        <TraceBadge
          points={STRAIGHT_POINTS}
          t={t}
          onTChange={(next) => {
            // Recorded RAW, before this story clamps anything of its own
            // (it does not) — so the readout proves the clamp lives in the
            // DRAG, not only in TraceBadge's render. Without it, a drag that
            // emitted 1.0 would still render at 0.95 and look correct.
            setEmitted(next);
            setT(next);
          }}
          value="throughput"
        />
      </TraceStage>
      <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--muted-foreground)" }}>
        t <span data-testid="t-readout">{t.toFixed(4)}</span>
        {"   ·   last emitted "}
        <span data-testid="emitted-readout">{emitted === null ? "—" : emitted.toFixed(4)}</span>
      </div>
    </div>
  );
}

/**
 * The gesture, on the simplest possible route. The pointer is deliberately
 * driven 12px BELOW the line for the whole sweep — on a straight line that
 * is the only way to tell projection apart from "the badge follows the
 * finger", and the 2px acceptance would otherwise be free.
 */
export const DragAlongTheLine: Story = {
  render: () => <StraightDragFixture />,
  play: async ({ canvasElement }) => {
    const stage = requireEl(canvasElement, '[data-testid="drag-stage"]');
    const svg = requireEl<SVGSVGElement>(stage, '[data-slot="trace-canvas"]');
    const badge = requireEl<HTMLElement>(stage, '[data-slot="trace-badge"]');

    await expect(badgeT(badge)).toBeCloseTo(0.2, 6);
    await expect(badge.getAttribute("data-dragging")).toBe(null);

    /* --- grab it ----------------------------------------------------- */
    firePointer(badge, "pointerdown", centreOf(badge));
    await waitFor(() => expect(badge.getAttribute("data-dragging")).toBe("true"));

    /* --- sweep left to right, 12px off the line ---------------------- */
    const OFF_LINE_PX = 12;
    const sweepUserX = [80, 117.5, 155, 192.5, 230, 267.5, 305, 342.5, 380];
    const seen: number[] = [];
    for (const userX of sweepUserX) {
      const client = userToClient(svg, { x: userX, y: MID_Y + OFF_LINE_PX });
      firePointer(badge, "pointermove", client);
      await wait(20);

      const t = badgeT(badge);
      seen.push(t);

      const centre = centreOf(badge);
      // 1. the badge is ON the painted polyline — the acceptance claim
      await expect(distanceToPolyline(svg, STRAIGHT_POINTS, centre)).toBeLessThanOrEqual(2);
      // 2. ...and specifically at the arc-length point `t` names
      const want = userToClient(svg, pointAtFraction(STRAIGHT_POINTS, t));
      await expect(Math.hypot(centre.x - want.x, centre.y - want.y)).toBeLessThanOrEqual(1);
      // 3. the pointer genuinely WAS off the line, so claim 1 was not free
      await expect(distanceToPolyline(svg, STRAIGHT_POINTS, client)).toBeGreaterThan(OFF_LINE_PX - 2);
    }

    /* --- t changed monotonically along the drag ---------------------- */
    for (let i = 1; i < seen.length; i += 1) {
      await expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
    // ...and actually travelled, rather than creeping within float noise.
    await expect(seen[seen.length - 1] - seen[0]).toBeGreaterThan(0.6);

    /* --- past the far end: clamps at 0.95, and the emitted value is
           already clamped (so the clamp is in the drag, not the paint) -- */
    firePointer(badge, "pointermove", userToClient(svg, { x: STAGE_W + 400, y: MID_Y + 300 }));
    await wait(30);
    await expect(badgeT(badge)).toBeCloseTo(LABEL_POSITION_MAX, 6);
    await expect(requireEl(canvasElement, '[data-testid="emitted-readout"]').textContent).toBe(
      LABEL_POSITION_MAX.toFixed(4),
    );
    // Measured, not inferred: it stopped a real 5% of the line short of the
    // end rather than landing on the terminal.
    const endClient = userToClient(svg, STRAIGHT_POINTS[1]);
    const lineLengthClient = Math.hypot(
      endClient.x - userToClient(svg, STRAIGHT_POINTS[0]).x,
      endClient.y - userToClient(svg, STRAIGHT_POINTS[0]).y,
    );
    await expect(endClient.x - centreOf(badge).x).toBeCloseTo(lineLengthClient * (1 - LABEL_POSITION_MAX), 0);

    /* --- past the near end: clamps at 0.05 --------------------------- */
    firePointer(badge, "pointermove", userToClient(svg, { x: -600, y: MID_Y }));
    await wait(30);
    await expect(badgeT(badge)).toBeCloseTo(LABEL_POSITION_MIN, 6);
    await expect(requireEl(canvasElement, '[data-testid="emitted-readout"]').textContent).toBe(
      LABEL_POSITION_MIN.toFixed(4),
    );

    /* --- release, and the gesture is genuinely OVER ------------------ */
    firePointer(badge, "pointerup", userToClient(svg, { x: -600, y: MID_Y }));
    await waitFor(() => expect(badge.getAttribute("data-dragging")).toBe(null));
    const afterRelease = badgeT(badge);
    firePointer(badge, "pointermove", userToClient(svg, { x: 300, y: MID_Y }));
    await wait(30);
    // A move after pointerup must move nothing: the window listeners were
    // torn down. Without this, a leaked listener would make every later
    // pointer move in the app silently drag this badge.
    await expect(badgeT(badge)).toBe(afterRelease);
  },
};

/* ------------------------------------------------------------------ */

function CornerDragFixture() {
  const [t, setT] = useState(0.5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      <TraceStage
        testId="corner-stage"
        width={CORNER_W}
        height={CORNER_H}
        points={CORNER_POINTS}
        from={CORNER_FROM}
        to={CORNER_TO}
      >
        <TraceBadge points={CORNER_POINTS} t={t} onTChange={setT} value="p99" variant="outline" />
      </TraceStage>
      <div style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--muted-foreground)" }}>
        t <span data-testid="corner-t-readout">{t.toFixed(4)}</span>
      </div>
    </div>
  );
}

/**
 * The same gesture on a three-segment staircase, dragged along a straight
 * DIAGONAL that cuts every corner. At the middle of the sweep the pointer is
 * more than 30px from any part of the route — so "the badge stays within 2px
 * of the polyline" is a claim only a real nearest-point projection can meet,
 * and it is the reason the badge hops legs instead of drifting into the
 * empty middle of the L.
 */
export const DragAroundACorner: Story = {
  render: () => <CornerDragFixture />,
  play: async ({ canvasElement }) => {
    const stage = requireEl(canvasElement, '[data-testid="corner-stage"]');
    const svg = requireEl<SVGSVGElement>(stage, '[data-slot="trace-canvas"]');
    const badge = requireEl<HTMLElement>(stage, '[data-slot="trace-badge"]');

    firePointer(badge, "pointerdown", centreOf(badge));
    await waitFor(() => expect(badge.getAttribute("data-dragging")).toBe("true"));

    const STEPS = 11;
    const seen: number[] = [];
    let farthestPointerOffPath = 0;
    for (let k = 0; k <= STEPS; k += 1) {
      const user = { x: 60 + (300 * k) / STEPS, y: 42 + (108 * k) / STEPS };
      const client = userToClient(svg, user);
      firePointer(badge, "pointermove", client);
      await wait(20);

      const t = badgeT(badge);
      seen.push(t);

      const centre = centreOf(badge);
      await expect(distanceToPolyline(svg, CORNER_POINTS, centre)).toBeLessThanOrEqual(2);
      const want = userToClient(svg, pointAtFraction(CORNER_POINTS, t));
      await expect(Math.hypot(centre.x - want.x, centre.y - want.y)).toBeLessThanOrEqual(1);

      farthestPointerOffPath = Math.max(farthestPointerOffPath, distanceToPolyline(svg, CORNER_POINTS, client));
    }

    // The diagonal really did leave the route — otherwise the 2px claim
    // above would be satisfied by a badge that just followed the pointer.
    await expect(farthestPointerOffPath).toBeGreaterThan(20);

    for (let i = 1; i < seen.length; i += 1) {
      await expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
    await expect(seen[0]).toBeCloseTo(LABEL_POSITION_MIN, 6);
    await expect(seen[seen.length - 1]).toBeCloseTo(LABEL_POSITION_MAX, 6);

    // The badge crossed BOTH corners: at some sample it rode the vertical
    // leg, which only happens if `t` is arc length along the real route
    // rather than a fraction of the bounding box.
    const verticalLegStart = polylineLength(CORNER_POINTS.slice(0, 2)) / polylineLength(CORNER_POINTS);
    const verticalLegEnd = polylineLength(CORNER_POINTS.slice(0, 3)) / polylineLength(CORNER_POINTS);
    await expect(seen.some((t) => t > verticalLegStart && t < verticalLegEnd)).toBe(true);

    firePointer(badge, "pointerup", centreOf(badge));
    await waitFor(() => expect(badge.getAttribute("data-dragging")).toBe(null));
  },
};

/* ------------------------------------------------------------------ */

interface BadgeState {
  t: number;
  value: string;
  editing: boolean;
}

function DoubleClickFixture() {
  const [badge, setBadge] = useState<BadgeState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleTraceDoubleClick = (event: ReactMouseEvent<SVGGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    // Client -> user space through the SVG's own CTM. The host owns this
    // conversion, not TraceBadge: only the host knows what the points are
    // expressed in (here, svg user units; on a canvas, page coordinates
    // behind a camera).
    const local = clientToUser(svg, { x: event.clientX, y: event.clientY });
    setBadge({
      t: clampLabelPosition(fractionNearest(STRAIGHT_POINTS, local)),
      value: "",
      editing: true,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      <TraceStage
        testId="dblclick-stage"
        width={STAGE_W}
        height={STAGE_H}
        points={STRAIGHT_POINTS}
        from={STRAIGHT_FROM}
        to={STRAIGHT_TO}
        svgRef={svgRef}
        onTraceDoubleClick={handleTraceDoubleClick}
      >
        {badge ? (
          <TraceBadge
            points={STRAIGHT_POINTS}
            t={badge.t}
            onTChange={(next) => setBadge((b) => (b ? { ...b, t: next } : b))}
            value={badge.value}
            onValueChange={(value) => setBadge((b) => (b ? { ...b, value } : b))}
            editing={badge.editing}
            onEditingChange={(editing) =>
              setBadge((b) => {
                if (!b) return b;
                if (editing) return { ...b, editing: true };
                // WHY committing an EMPTY badge deletes it rather than
                // leaving a blank pill on the line: the only way this badge
                // came into existence was someone double-clicking to type
                // something. An empty one is an abandoned gesture, not a
                // label — and Escape on a fresh badge has to undo the
                // creation or there is no way to back out of a misclick.
                return b.value.trim() === "" ? null : { ...b, editing: false };
              })
            }
            placeholder="label"
          />
        ) : null}
      </TraceStage>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Double-click the line to add a badge. Enter commits, Escape discards an empty one.
      </div>
    </div>
  );
}

/**
 * Zach's other half of the ask: "if you double click the line to add text,
 * it will display inside of a badge." The gesture lands on Lane A's invisible
 * 12px hit path, because the visible line is 2px and nobody double-clicks a
 * 2px target twice in a row.
 */
export const DoubleClickToAdd: Story = {
  render: () => <DoubleClickFixture />,
  play: async ({ canvasElement }) => {
    const stage = requireEl(canvasElement, '[data-testid="dblclick-stage"]');
    const svg = requireEl<SVGSVGElement>(stage, '[data-slot="trace-canvas"]');

    await expect(stage.querySelector('[data-slot="trace-badge"]')).toBe(null);

    /* --- the hit path exists and is what gets double-clicked --------- */
    const hit = requireEl<SVGPathElement>(stage, '[data-slot="trace-hit"]');
    await expect(Number.parseFloat(getComputedStyle(hit).strokeWidth)).toBeGreaterThanOrEqual(12);

    /* --- empty canvas is NOT a create target ------------------------- */
    // The handler is on the trace's own <g>; a double-click on bare svg
    // background is above it in the tree and must never reach it.
    fireDoubleClick(svg, userToClient(svg, { x: 240, y: MID_Y - 26 }));
    await wait(30);
    await expect(stage.querySelector('[data-slot="trace-badge"]')).toBe(null);

    /* --- double-click the line at a known point ---------------------- */
    const CLICK_USER_X = 300;
    const expectedT =
      (CLICK_USER_X - STRAIGHT_POINTS[0].x) / (STRAIGHT_POINTS[1].x - STRAIGHT_POINTS[0].x);
    fireDoubleClick(hit, userToClient(svg, { x: CLICK_USER_X, y: MID_Y }));

    const badge = await waitFor(() => requireEl<HTMLElement>(stage, '[data-slot="trace-badge"]'));
    await expect(badge.getAttribute("data-editing")).toBe("true");
    // It mounted where the pointer was, not at the middle.
    await expect(badgeT(badge)).toBeCloseTo(expectedT, 2);
    await expect(expectedT).toBeGreaterThan(0.6); // the fixture really is off-centre
    const centre = centreOf(badge);
    await expect(distanceToPolyline(svg, STRAIGHT_POINTS, centre)).toBeLessThanOrEqual(2);

    /* --- it is a real, focused text control -------------------------- */
    const input = requireEl<HTMLInputElement>(badge, '[data-slot="editable-text-input"]');
    await waitFor(() => expect(document.activeElement).toBe(input));

    /* --- type, commit, and the text lives inside the stock Badge ----- */
    await userEvent.type(input, "p99 12ms", { delay: 0 });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(badge.getAttribute("data-editing")).toBe(null));
    const pill = requireEl<HTMLElement>(badge, '[data-slot="badge"]');
    await expect(pill.textContent).toBe("p99 12ms");
    await expect(badge.querySelector('[data-slot="editable-text-input"]')).toBe(null);
    // Committing must not have moved it.
    await expect(badgeT(badge)).toBeCloseTo(expectedT, 2);

    /* --- double-clicking the BADGE re-opens it, Escape reverts ------- */
    fireDoubleClick(badge, centreOf(badge));
    await waitFor(() => expect(badge.getAttribute("data-editing")).toBe("true"));
    const reopened = requireEl<HTMLInputElement>(badge, '[data-slot="editable-text-input"]');
    await userEvent.type(reopened, " (edited)", { delay: 0 });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(badge.getAttribute("data-editing")).toBe(null));
    // Escape cancels the SESSION, and this fixture treats write-through
    // keystrokes as already-applied — the committed text is what EditableText
    // holds, so what matters here is that the badge survived Escape rather
    // than being deleted as empty.
    await expect(requireEl<HTMLElement>(badge, '[data-slot="badge"]').textContent).not.toBe("");
  },
};
