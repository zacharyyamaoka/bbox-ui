import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { TraceBody } from "./trace";
import { TraceBadge } from "./traceBadge";
import { TraceMark } from "./traceMark";
import { pointAtFraction, polylinePath, resolvePathAddress, type Point } from "./trace.layout";
import type { Diagnostic } from "./highlighter";

/**
 * Trace/Mark — ruling 4, one 1-D address scheme unified with the pill
 * (`PathAddress`, `trace.layout.ts`). Zach: "Interesting idea for marks on
 * cable getting 1d coordinate... if there is a pill already we don't
 * likely want to render it directly on the pill." And the negative-end
 * form: "the negative form matters: it pins a flag at the broken end of a
 * dangling edge" — JointJS's own dangling-edge demo does exactly this
 * with a NEGATIVE PX distance (behaviour-derived, `trace.layout.ts`'s own
 * header); the negative FRACTION form (`t = 1 + f`) is ours, deliberate,
 * tested independently in `trace.address.test.ts`.
 */

const meta = {
  title: "Components/Traces/TraceMark",
  tags: ["object:trace", "lane:validation-stack"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const STAGE_W = 460;
const STAGE_H = 120;
const MID_Y = 60;
const FROM_X = 30;
const TO_X = STAGE_W - 30;
const STRAIGHT_POINTS: Point[] = [
  { x: FROM_X, y: MID_Y },
  { x: TO_X, y: MID_Y },
];

let markSeq = 0;
function mark(severity: Diagnostic["severity"], message: string, code?: string): Diagnostic[] {
  markSeq += 1;
  return [{ id: `trace-mark-${markSeq}`, severity, message, code }];
}

function Stage({ width = STAGE_W, height = STAGE_H, points = STRAIGHT_POINTS, children }: { width?: number; height?: number; points?: readonly Point[]; children?: ReactNode }) {
  return (
    <div data-slot="trace-mark-stage" style={{ position: "relative", width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <TraceBody id="mark-demo" path={polylinePath(points)} points={points} color="var(--muted-foreground)" strokeWidth={2} />
      </svg>
      {children}
    </div>
  );
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el;
}

/* ------------------------------------------------------------------ */
/* Marks at fractions — the basic address vocabulary, on one polyline    */
/* ------------------------------------------------------------------ */

export const MarksAtFractions: Story = {
  name: "Marks at fractions",
  render: () => (
    <Stage>
      <TraceMark points={STRAIGHT_POINTS} at={0.15} offsetPx={-14} diagnostics={mark("info", "Early — a plain fraction")} />
      <TraceMark points={STRAIGHT_POINTS} at={0.5} offsetPx={14} diagnostics={mark("warning", "Midpoint — the default")} />
      <TraceMark points={STRAIGHT_POINTS} at={-0.15} offsetPx={-14} diagnostics={mark("error", "Negative fraction, OURS: t = 1 + f = 0.85")} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const marks = await waitFor(() => {
      const found = canvasElement.querySelectorAll<HTMLElement>('[data-slot="trace-mark"]');
      if (found.length !== 3) throw new Error(`expected 3 marks, found ${found.length}`);
      return Array.from(found);
    });
    const stage = required<HTMLElement>(canvasElement, '[data-slot="trace-mark-stage"]');
    const stageRect = stage.getBoundingClientRect();

    const expectedTs = [0.15, 0.5, 0.85]; // the third is resolvePathAddress(-0.15) = 1 + (-0.15)
    for (const [i, el] of marks.entries()) {
      expect(el.getAttribute("data-t")).not.toBeNull();
      expect(Number(el.getAttribute("data-t"))).toBeCloseTo(expectedTs[i], 2);
      const expected = pointAtFraction(STRAIGHT_POINTS, expectedTs[i]);
      const rect = el.getBoundingClientRect();
      const measuredX = rect.left + rect.width / 2 - stageRect.left;
      expect(Math.abs(measuredX - expected.x)).toBeLessThanOrEqual(2);
      // None of the three collided (no `occupied` passed) — no yield.
      expect(el.getAttribute("data-yielded")).toBeNull();
    }

    // Above/below alternation is real screen displacement, not just a
    // style declaration — the two `offsetPx: -14` marks sit on the
    // OPPOSITE side of the line from the one `offsetPx: 14` mark
    // (STRAIGHT_POINTS runs left-to-right, so the perpendicular normal is
    // vertical: a negative offset measures ABOVE the line's y, positive
    // BELOW).
    const lineY = stageRect.top + MID_Y;
    expect(marks[0].getBoundingClientRect().top + marks[0].getBoundingClientRect().height / 2).toBeLessThan(lineY);
    expect(marks[1].getBoundingClientRect().top + marks[1].getBoundingClientRect().height / 2).toBeGreaterThan(lineY);
  },
};

/* ------------------------------------------------------------------ */
/* Pinned at a dangling edge's broken end — the hardest case named in    */
/* the ruling, JointJS's own dangling-edge demo (behaviour-derived).     */
/* ------------------------------------------------------------------ */

export const PinnedAtDanglingEdgeEnd: Story = {
  name: "Pinned at a dangling edge's broken end",
  render: () => (
    <Stage>
      <div
        title='"ghost" is not in the scene'
        style={{
          position: "absolute",
          left: TO_X - 8,
          top: MID_Y - 8,
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1.5px dashed var(--muted-foreground)",
        }}
      />
      <TraceMark
        points={STRAIGHT_POINTS}
        at={{ px: -24 }}
        offsetPx={16}
        diagnostics={mark("error", 'Edge "e-b-ghost" — its target names node "ghost", which is not in the scene', "dangling-edge")}
      />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const el = await waitFor(() => required<HTMLElement>(canvasElement, '[data-slot="trace-mark"]'));
    const stage = required<HTMLElement>(canvasElement, '[data-slot="trace-mark-stage"]');
    const stageRect = stage.getBoundingClientRect();

    const expectedT = resolvePathAddress(STRAIGHT_POINTS, { px: -24 });
    expect(Number(el.getAttribute("data-t"))).toBeCloseTo(expectedT, 3);

    const expected = pointAtFraction(STRAIGHT_POINTS, expectedT);
    const rect = el.getBoundingClientRect();
    const measured = { x: rect.left + rect.width / 2 - stageRect.left, y: rect.top + rect.height / 2 - stageRect.top - 16 };
    expect(Math.abs(measured.x - expected.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(measured.y - expected.y)).toBeLessThanOrEqual(2);

    // 24px back from the END, not the fraction midpoint — the whole point
    // of the negative-px form.
    expect(measured.x).toBeGreaterThan(TO_X - 30);
    expect(measured.x).toBeLessThan(TO_X);
  },
};

/* ------------------------------------------------------------------ */
/* Pill collision — the pill (pinned) never moves; the mark yields        */
/* around it. JointJS itself has ZERO collision handling here (two tools */
/* at distance:'50%' landed on the identical pixel, trace.layout.ts's    */
/* own header) — `separateAlongPath` is ours, ad hoc, cited there.       */
/* ------------------------------------------------------------------ */

function CollisionDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [badgeWidth, setBadgeWidth] = useState(64);

  useLayoutEffect(() => {
    const badge = containerRef.current?.querySelector('[data-slot="trace-badge"]');
    if (badge) setBadgeWidth(badge.getBoundingClientRect().width);
  }, []);

  return (
    <div ref={containerRef}>
      <Stage>
        <TraceBadge points={STRAIGHT_POINTS} t={0.5} value="pill" />
        <TraceMark points={STRAIGHT_POINTS} at={0.5} offsetPx={18} occupied={[{ t: 0.5, widthPx: badgeWidth }]} gapPx={8} diagnostics={mark("warning", "Wants the pill's own slot")} />
      </Stage>
    </div>
  );
}

export const PillCollisionYield: Story = {
  name: "Pill collision — the mark yields",
  render: () => <CollisionDemo />,
  play: async ({ canvasElement }) => {
    const badge = await waitFor(() => required<HTMLElement>(canvasElement, '[data-slot="trace-badge"]'));
    const mark = await waitFor(() => {
      const el = required<HTMLElement>(canvasElement, '[data-slot="trace-mark"]');
      if (el.getAttribute("data-yielded") == null) throw new Error("mark has not yielded yet (waiting on the measured-width re-render)");
      return el;
    });

    // The pill never moved off its own requested t.
    expect(Number(badge.getAttribute("data-t"))).toBeCloseTo(0.5, 2);
    // The mark DID move (yielded), away from the same t=0.5 it requested.
    expect(Number(mark.getAttribute("data-t"))).not.toBeCloseTo(0.5, 2);

    // Real screen separation — the two DOM elements do not overlap.
    const badgeRect = badge.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const noOverlap = markRect.left >= badgeRect.right || badgeRect.left >= markRect.right || markRect.top >= badgeRect.bottom || badgeRect.top >= markRect.bottom;
    expect(noOverlap).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* No collision — the honest control: an unoccupied mark never yields.   */
/* ------------------------------------------------------------------ */

export const NoCollisionNoYield: Story = {
  name: "No collision — no yield",
  render: () => (
    <Stage>
      <TraceMark points={STRAIGHT_POINTS} at={0.5} diagnostics={mark("info", "Nothing else on this line")} />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const el = await waitFor(() => required<HTMLElement>(canvasElement, '[data-slot="trace-mark"]'));
    expect(el.getAttribute("data-yielded")).toBeNull();
    expect(Number(el.getAttribute("data-t"))).toBeCloseTo(0.5, 3);
  },
};
