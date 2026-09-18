// src/stories/TraceInteractive.stories.tsx — D5 of
// docs/TRACE-CONTROL-POINTS-PLAN.md, Zach's own ask by name: "right now the
// galleries are like static, but now this can make it interactive so we can
// see how it works." Every other `Trace*.stories.tsx` in this folder draws a
// route and stops; these five mount `TraceEditor` and let a real pointer (or
// a play function's synthetic one) move it.
//
// Every spatial claim in the play functions below is MEASURED off the
// mounted `SVGPathElement`'s `d` — exact `L`-command counts for A7/A8, the
// exact `M` substring for A9 — never inferred from a handle circle merely
// being present in the DOM (this repo's own standing rule, restated in
// `TraceRouting.stories.tsx`'s header).

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { expect, waitFor } from "storybook/test";

import { TraceEditor } from "../components/traceEditor";
import type { Point, TraceRouting, TraceTerminalSpec } from "../components/trace.layout";

/* ------------------------------------------------------------------ */
/* Shared page scaffolding                                              */
/* ------------------------------------------------------------------ */

function Caption({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 640 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted-foreground)" }}>{text}</div>
    </div>
  );
}

function Canvas({
  testId,
  width,
  height,
  children,
}: {
  testId: string;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      data-testid={testId}
      data-slot="story-canvas"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{
        aspectRatio: `${width} / ${height}`,
        background: "var(--muted)",
        borderRadius: 8,
        overflow: "visible",
      }}
    >
      {children}
    </svg>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24, background: "var(--background)" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurement helpers — same technique `TraceBadge.stories.tsx`        */
/* established (`firePointer`'s own doc there explains the `isPrimary`/ */
/* `button` fields real handlers check).                                */
/* ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

function centreOf(el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function userToClient(svg: SVGGraphicsElement, p: Point): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("svg has no screen CTM");
  const d = new DOMPoint(p.x, p.y).matrixTransform(ctm);
  return { x: d.x, y: d.y };
}

/** A genuine pointer gesture, not a style-only stand-in — dispatched with
 * `bubbles: true` so it reaches the `window` listeners `traceEditor.tsx`
 * actually attaches (its own header explains why it is `window` and not the
 * handle element: capture is best-effort against a synthetic pointerId). */
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

function countL(d: string): number {
  return (d.match(/L/g) ?? []).length;
}

/** Parses `"M x y L x y ..."` -> just the leading `"M x y"`, i.e. the start
 * point as `polylinePath` writes it — the exact substring A9 compares. */
function leadingM(d: string): string {
  const spaceL = d.indexOf(" L");
  return spaceL === -1 ? d : d.slice(0, spaceL);
}

/** The two endpoints of the CURRENT (un-bent) rendered chord, in SVG user
 * space, read off the DOM rather than re-derived from props — so a test
 * point computed from this is guaranteed to land where the component itself
 * thinks the chord is, gap pull-back included. */
function chordEndpoints(d: string): { start: Point; end: Point } {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 4) throw new Error(`not a 2-point chord: ${d}`);
  const [sx, sy, ex, ey] = numbers.map(Number);
  return { start: { x: sx, y: sy }, end: { x: ex, y: ey } };
}

/* ------------------------------------------------------------------ */
/* 1. StraightWithBends — the hero                                      */
/* ------------------------------------------------------------------ */

const HERO_FROM: TraceTerminalSpec = { x: 60, y: 190, dir: "right" };
const HERO_TO: TraceTerminalSpec = { x: 500, y: 70, dir: "right" };

/* ------------------------------------------------------------------ */
/* Meta — every story below supplies its own full `render`, never reads */
/* `args`; these are dummy placeholders only to satisfy the required    */
/* `id`/`from`/`to` props on `Meta<typeof TraceEditor>` (same idiom      */
/* `TraceElbow.stories.tsx`'s `args: { id: "elbow", path: "" }` uses for */
/* `TraceBody`).                                                        */
/* ------------------------------------------------------------------ */

const meta = {
  title: "Trace/Interactive",
  component: TraceEditor,
  parameters: { layout: "fullscreen" },
  args: { id: "trace-interactive", from: HERO_FROM, to: HERO_TO },
} satisfies Meta<typeof TraceEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StraightWithBends: Story = {
  render: () => (
    <Page>
      <Caption
        title="Straight, with bends"
        text="Hover the line and drag the small dot at a segment's middle to add a corner. Drag a corner back onto the line to remove it, or double-click a corner to remove it outright."
      />
      <Canvas testId="hero-canvas" width={560} height={260}>
        <TraceEditor id="hero" from={HERO_FROM} to={HERO_TO} routing="straight" defaultBends={[]} />
      </Canvas>
    </Page>
  ),
};

/* ------------------------------------------------------------------ */
/* 2. ManyBends — N is not 1                                            */
/* ------------------------------------------------------------------ */

export const ManyBends: Story = {
  render: () => (
    <Page>
      <Caption
        title="Many bends"
        text="Seeded with three control points, not the historical one — a straight trace's bend model is N points, chord-relative, in array order."
      />
      <Canvas testId="many-canvas" width={560} height={260}>
        <TraceEditor
          id="many"
          from={HERO_FROM}
          to={HERO_TO}
          routing="straight"
          defaultBends={[
            { t: 0.18, o: -55 },
            { t: 0.5, o: 60 },
            { t: 0.82, o: -35 },
          ]}
        />
      </Canvas>
    </Page>
  ),
};

/* ------------------------------------------------------------------ */
/* 3. LockedEndpoints — A9                                              */
/* ------------------------------------------------------------------ */

export const LockedEndpoints: Story = {
  render: () => (
    <Page>
      <Caption
        title="Locked endpoints"
        text="The terminals here belong to a Port, not to you — dragging start/end is disabled. Interior bends still drag freely."
      />
      <Canvas testId="locked-canvas" width={560} height={260}>
        <TraceEditor
          id="locked"
          from={HERO_FROM}
          to={HERO_TO}
          routing="straight"
          defaultBends={[{ t: 0.5, o: 45 }]}
          lockEndpoints
          revealed
        />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    const cell = requireEl(canvasElement, '[data-testid="locked-canvas"]');
    const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');
    const start = requireEl<SVGCircleElement>(cell, '[data-handle-id="start"]');

    await expect(start.getAttribute("data-handle-locked")).toBe("true");
    const before = leadingM(line.getAttribute("d")!);

    // A9: a FULL pointer drag on the locked `start` handle.
    const from = centreOf(start);
    const to = { x: from.x + 140, y: from.y - 90 };
    firePointer(start, "pointerdown", from);
    await wait(20);
    for (let i = 1; i <= 5; i += 1) {
      const t = i / 5;
      firePointer(start, "pointermove", { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      await wait(10);
    }
    firePointer(start, "pointerup", to);
    await wait(20);

    const after = leadingM(line.getAttribute("d")!);
    await expect(after).toBe(before);
  },
};

/* ------------------------------------------------------------------ */
/* 4. AllRoutings — the static gallery, made live                       */
/* ------------------------------------------------------------------ */

const GRID_FROM: TraceTerminalSpec = { x: 40, y: 130, dir: "right" };
const GRID_TO: TraceTerminalSpec = { x: 240, y: 60, dir: "right" };

const ROUTING_CASES: { key: string; routing: TraceRouting; caption: string }[] = [
  { key: "straight", routing: "straight", caption: "drag the dot to bend it" },
  { key: "slanted", routing: "slanted", caption: "terminal handles only — bends are straight-only" },
  { key: "curved", routing: "curved", caption: "terminal handles only — same reason" },
  { key: "elbow", routing: "elbow", caption: "terminal handles only — elbow has its own rail model" },
];

export const AllRoutings: Story = {
  render: () => (
    <Page>
      <Caption
        title="Every routing, live"
        text="The same routings TraceRouting.stories.tsx draws statically, each now mounted through TraceEditor. straight is the only one bends apply to — the other three are truthfully terminal-only, not a gap: a virtual dot on them would promise a drag routeTrace throws away."
      />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {ROUTING_CASES.map((item) => (
          <div key={item.key} style={{ display: "flex", flexDirection: "column", gap: 6, width: 260 }}>
            <Canvas testId={`all-${item.key}`} width={280} height={190}>
              <TraceEditor id={`all-${item.key}`} from={GRID_FROM} to={GRID_TO} routing={item.routing} revealed />
            </Canvas>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{item.routing}</div>
            <div style={{ fontSize: 11, lineHeight: 1.35, color: "var(--muted-foreground)" }}>{item.caption}</div>
          </div>
        ))}
      </div>
    </Page>
  ),
};

/* ------------------------------------------------------------------ */
/* 5. AddAndRemove — A7 / A8, measured                                  */
/* ------------------------------------------------------------------ */

const AR_FROM: TraceTerminalSpec = { x: 40, y: 100, dir: "right" };
const AR_TO: TraceTerminalSpec = { x: 440, y: 100, dir: "right" };

export const AddAndRemove: Story = {
  render: () => (
    <Page>
      <Caption
        title="Add and remove, measured"
        text="This story's play function drags the midpoint dot out (A7: one drag, one new corner), then drags that corner back onto the line (A8: it collapses away)."
      />
      <Canvas testId="add-remove-canvas" width={480} height={200}>
        <TraceEditor id="add-remove" from={AR_FROM} to={AR_TO} routing="straight" defaultBends={[]} revealed />
      </Canvas>
    </Page>
  ),
  play: async ({ canvasElement }) => {
    // `Canvas` puts `data-testid` on the `<svg>` itself, so this IS the svg
    // — not a wrapper to query a nested one out of.
    const cell = requireEl<SVGSVGElement>(canvasElement, '[data-testid="add-remove-canvas"]');
    const svg = cell;
    const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');

    // Starts as a plain 2-point chord: 1 `L`.
    await expect(countL(line.getAttribute("d")!)).toBe(1);
    const { start: chordStart, end: chordEnd } = chordEndpoints(line.getAttribute("d")!);
    const chordMid: Point = { x: (chordStart.x + chordEnd.x) / 2, y: (chordStart.y + chordEnd.y) / 2 };

    /* ---- A7: one drag of the virtual handle adds exactly one bend ---- */
    const virtual = requireEl<SVGCircleElement>(cell, '[data-handle-id="virtual:0"]');
    const grabAt = centreOf(virtual);
    const growTarget = userToClient(svg, { x: chordMid.x, y: chordMid.y - 70 });

    firePointer(virtual, "pointerdown", grabAt);
    await wait(20);
    for (let i = 1; i <= 3; i += 1) {
      const t = i / 3;
      firePointer(virtual, "pointermove", {
        x: grabAt.x + (growTarget.x - grabAt.x) * t,
        y: grabAt.y + (growTarget.y - grabAt.y) * t,
      });
      await wait(10);
    }
    firePointer(virtual, "pointerup", growTarget);
    await waitFor(() => expect(countL(line.getAttribute("d")!)).toBe(2));

    /* ---- A8: dragging that bend back onto the chord removes it ------- */
    const bend = requireEl<SVGCircleElement>(cell, '[data-handle-id="bend:0"]');
    const bendAt = centreOf(bend);
    const backOnChord = userToClient(svg, chordMid);

    firePointer(bend, "pointerdown", bendAt);
    await wait(20);
    for (let i = 1; i <= 3; i += 1) {
      const t = i / 3;
      firePointer(bend, "pointermove", {
        x: bendAt.x + (backOnChord.x - bendAt.x) * t,
        y: bendAt.y + (backOnChord.y - bendAt.y) * t,
      });
      await wait(10);
    }
    firePointer(bend, "pointerup", backOnChord);
    await waitFor(() => expect(countL(line.getAttribute("d")!)).toBe(1));
  },
};
