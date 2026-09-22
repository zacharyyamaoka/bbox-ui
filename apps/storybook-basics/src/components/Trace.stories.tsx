import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Trace, TraceBody, traceGeometry, traceRingGapPx, type TraceProps, type TraceRouteRequest } from "./trace";
import {
  ASYNC_CADENCE_PX,
  DATA_MARCH_CLASS,
  DATA_MARCH_DASHOFFSET_PX,
  DIR_VECTOR,
  TRACE_DIRS,
  polylinePath,
  safeElementId,
  type Point,
  type TraceDir,
} from "./trace.layout";
import { TRACE_TERMINAL_RADIUS, TRACE_TERMINAL_RING_PX, TraceTerminal } from "./traceTerminal";
import { elbowPath, routeElbow } from "./elbow/index";
import { elbowInputFromTerminals, routePoints } from "./elbow/traceContract";

/* ------------------------------------------------------------------ */
/* The fixture: one straight line between two terminals, exactly as    */
/* Zach's screenshot shows. Source on the left with the flow going     */
/* right; target on the right, also flowing right (the classic case).  */
/* ------------------------------------------------------------------ */

const ROW_W = 460;
const ROW_H = 44;
const MID_Y = ROW_H / 2;
/** Terminal centres. The line ends ON each terminal's ring — the same
 * pull-back `Trace` now applies by default (`traceRingGapPx`). It used to
 * stop 16px short to leave the chevron room; since 2026-09-22 a trace draws
 * no head unless asked (Zach: "because its DAG, we already know the
 * order!"), and a 16px stop with nothing in it is exactly the "spacing
 * which is not desirable". */
const FROM_X = 26;
const TO_X = ROW_W - 26;
const LINE_GAP = traceRingGapPx(TRACE_TERMINAL_RADIUS + TRACE_TERMINAL_RING_PX / 2);

const FROM_TERMINAL = { x: FROM_X, y: MID_Y, dir: "right" as TraceDir };
const TO_TERMINAL = { x: TO_X, y: MID_Y, dir: "right" as TraceDir };

const LINE_POINTS: Point[] = [
  { x: FROM_X + LINE_GAP, y: MID_Y },
  { x: TO_X - LINE_GAP, y: MID_Y },
];
const LINE_PATH = polylinePath(LINE_POINTS);
/** 386px — comfortably past one async cadence (74px), so the Async row
 * shows the repeating carrier/packet rhythm rather than the centred
 * single-packet fallback `asyncDashOffsetForLength` exists for. */
const LINE_LENGTH = LINE_POINTS[1].x - LINE_POINTS[0].x;

/**
 * Zach's five style names, and nothing more: a flat table, NOT a preset
 * family or an appearance cascade (this app's standing rule). Two of the
 * five are the same `variant` differing only by a plain prop — which is the
 * point of keeping colour and animation ungoverned.
 */
interface TraceStyle {
  key: string;
  label: string;
  caption: string;
  props: Partial<TraceProps>;
}

const TRACE_STYLES: TraceStyle[] = [
  { key: "data", label: "Data", caption: "plain grey, solid", props: { variant: "data" } },
  { key: "async", label: "Async", caption: "carrier + packet dashes", props: { variant: "async" } },
  {
    key: "animated",
    label: "Animated",
    caption: "marching ants — it moves",
    props: { variant: "data", animated: true },
  },
  {
    key: "red",
    label: "Red",
    caption: "colour is a plain prop",
    props: { variant: "data", color: "var(--destructive)" },
  },
  { key: "dotted", label: "Dotted", caption: 'variant "delayed"', props: { variant: "delayed" } },
];

function StyleRow({ style }: { style: TraceStyle }) {
  return (
    <div
      data-testid={`trace-row-${style.key}`}
      style={{ display: "flex", alignItems: "center", gap: 20 }}
    >
      <div style={{ width: 160, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{style.label}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{style.caption}</div>
      </div>
      <svg
        data-slot="trace-canvas"
        width={ROW_W}
        height={ROW_H}
        viewBox={`0 0 ${ROW_W} ${ROW_H}`}
        style={{ overflow: "visible" }}
      >
        <TraceBody
          id={`trace-${style.key}`}
          path={LINE_PATH}
          points={LINE_POINTS}
          {...style.props}
        />
        <TraceTerminal {...FROM_TERMINAL} />
        <TraceTerminal {...TO_TERMINAL} />
      </svg>
    </div>
  );
}

const meta = {
  title: "Trace",
  tags: ["area:trace", "lane:trace-defaults"],
  component: TraceBody,
  // `id` and `path` are required props, so every story below would
  // otherwise have to restate them just to satisfy the type — these are
  // the fixture defaults each `render` already draws with.
  args: { id: "trace", path: LINE_PATH, points: LINE_POINTS },
} satisfies Meta<typeof TraceBody>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Measurement helpers — every spatial/paint claim below is measured    */
/* off the real rendered element, never inferred from DOM presence.     */
/* ------------------------------------------------------------------ */

/** Chromium serialises a computed `stroke-dasharray` with units
 * ("56px, 4px, 10px, 4px") and `none` when there is no dash. Parsing to
 * numbers compares the VALUES rather than one browser's spelling of
 * them — stricter than a string match, not looser. */
function dashNumbers(value: string): number[] {
  if (!value || value === "none") return [];
  return value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => Number.parseFloat(token));
}

/** The resolved paint a CSS variable actually produces here — read off a
 * throwaway SVG element in the live document, so the comparison is
 * "same resolved colour", never "same source text". */
function resolvedStroke(host: SVGSVGElement, cssColor: string): string {
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
  probe.style.stroke = cssColor;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).stroke;
  probe.remove();
  return resolved;
}

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`expected ${selector}`);
  return el as T;
}

/** Screen-space centre of an SVG user-space point, via the real CTM — so
 * it stays correct under any viewBox scaling. */
function toScreen(svg: SVGGraphicsElement, x: number, y: number): DOMPoint {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("element has no screen CTM");
  return new DOMPoint(x, y).matrixTransform(ctm);
}

/**
 * The arc-length centroid of a path, in SCREEN coordinates.
 *
 * WHY the centroid and not "the farthest point": the arrow's tip only
 * out-reaches its tail by ~0.9px, so a max-distance probe would hang the
 * whole direction check on a sub-pixel margin. The centroid uses every
 * sampled point's mass — it sits ~1.6px on the tip's side of the ring
 * centre and cannot be flipped by float noise.
 */
function pathCentroidOnScreen(path: SVGPathElement, samples = 200): DOMPoint {
  const ctm = path.getScreenCTM();
  if (!ctm) throw new Error("path has no screen CTM");
  const total = path.getTotalLength();
  let sx = 0;
  let sy = 0;
  for (let i = 0; i <= samples; i += 1) {
    const p = path.getPointAtLength((total * i) / samples);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(ctm);
    sx += screen.x;
    sy += screen.y;
  }
  return new DOMPoint(sx / (samples + 1), sy / (samples + 1));
}

function angleBetweenDeg(a: Point, b: Point): number {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function eachStyleRule(visit: (rule: CSSStyleRule, media: CSSMediaRule | null) => void): void {
  for (let s = 0; s < document.styleSheets.length; s += 1) {
    let rules: CSSRuleList;
    try {
      rules = document.styleSheets[s].cssRules;
    } catch {
      continue; // cross-origin sheet; nothing of ours lives there
    }
    for (let r = 0; r < rules.length; r += 1) {
      const rule = rules[r];
      if (rule instanceof CSSStyleRule) visit(rule, null);
      if (rule instanceof CSSMediaRule) {
        for (let i = 0; i < rule.cssRules.length; i += 1) {
          const inner = rule.cssRules[i];
          if (inner instanceof CSSStyleRule) visit(inner, rule);
        }
      }
    }
  }
}

function findKeyframes(name: string): CSSKeyframesRule | null {
  for (let s = 0; s < document.styleSheets.length; s += 1) {
    let rules: CSSRuleList;
    try {
      rules = document.styleSheets[s].cssRules;
    } catch {
      continue;
    }
    for (let r = 0; r < rules.length; r += 1) {
      const rule = rules[r];
      if (rule instanceof CSSKeyframesRule && rule.name === name) return rule;
    }
  }
  return null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/**
 * The gallery: Zach's five styles, each a straight trace between two
 * terminals, read as one comparison rather than five specimens.
 */
export const Styles: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 20 }}>
      {TRACE_STYLES.map((style) => (
        <StyleRow key={style.key} style={style} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const traces = canvasElement.querySelectorAll('[data-slot="trace"]');
    await expect(traces).toHaveLength(TRACE_STYLES.length);

    const lineFor = (key: string) =>
      requireEl<SVGPathElement>(
        requireEl(canvasElement, `[data-testid="trace-row-${key}"]`),
        '[data-slot="trace-line"]',
      );
    const svgFor = (key: string) =>
      requireEl<SVGSVGElement>(
        requireEl(canvasElement, `[data-testid="trace-row-${key}"]`),
        '[data-slot="trace-canvas"]',
      );

    /* --- 1. Every row paints exactly one visible line ---------------- */
    // NOTE on the selector: the plan writes this as `[data-slot="trace"]
    // path`, but that also matches the chevron inside <defs><marker>. The
    // slot selector is the same element, named unambiguously — and the
    // count below pins the ambiguity down rather than hiding it.
    for (const style of TRACE_STYLES) {
      const row = requireEl(canvasElement, `[data-testid="trace-row-${style.key}"]`);
      await expect(row.querySelectorAll('[data-slot="trace-line"]:not([data-sketch])')).toHaveLength(1);
      // one crisp line and nothing else — no chevron since the default
      // head went to "none" (2026-09-22), no hit path (`interactive` is
      // off by default). `:not([data-sketch])` for the same reason as
      // above — the skin port (src/skin/**) added a hidden hand-drawn twin
      // beside every crisp trace-line path.
      await expect(row.querySelectorAll('[data-slot="trace"] path:not([data-sketch])')).toHaveLength(1);
    }

    /* --- 2. Dash mechanics, per style -------------------------------- */
    const dataStyle = getComputedStyle(lineFor("data"));
    await expect(dashNumbers(dataStyle.strokeDasharray)).toEqual([]);
    await expect(dataStyle.strokeLinecap).toBe("round");

    const asyncStyle = getComputedStyle(lineFor("async"));
    await expect(dashNumbers(asyncStyle.strokeDasharray)).toEqual([56, 4, 10, 4]);
    await expect(asyncStyle.strokeLinecap).toBe("butt");
    // 386px of line is past one 74px cadence, so no centring phase shift.
    await expect(LINE_LENGTH).toBeGreaterThan(ASYNC_CADENCE_PX);
    await expect(Number.parseFloat(asyncStyle.strokeDashoffset)).toBe(0);

    const animatedStyle = getComputedStyle(lineFor("animated"));
    await expect(dashNumbers(animatedStyle.strokeDasharray)).toEqual([5]);
    await expect(animatedStyle.strokeLinecap).toBe("butt");

    const dottedStyle = getComputedStyle(lineFor("dotted"));
    await expect(dashNumbers(dottedStyle.strokeDasharray)).toEqual([0.1, 6]);
    // A zero-length dash only paints a DISC because the cap is round — a
    // butt cap here would render nothing at all.
    await expect(dottedStyle.strokeLinecap).toBe("round");

    /* --- 3. Colour: default grey, and Red really is --destructive ----- */
    const host = svgFor("data");
    await expect(dataStyle.stroke).toBe(resolvedStroke(host, "var(--muted-foreground)"));
    await expect(getComputedStyle(lineFor("red")).stroke).toBe(
      resolvedStroke(host, "var(--destructive)"),
    );
    // ...and Red is genuinely a different paint from the default row, so
    // the check above cannot pass by both resolving to the same fallback.
    await expect(getComputedStyle(lineFor("red")).stroke).not.toBe(dataStyle.stroke);

    /* --- 4. No head by default, on every style ------------------------ */
    // Zach, 2026-09-22: "by default can you please update the data traces
    // to draw without an arrow? because its DAG, we already know the
    // order!" — every row here states no `markerEnd`, so every row is the
    // default. The head itself (one marker per trace at its collision-free
    // `safeElementId` id, `context-stroke`) is still asserted, by name, in
    // TraceArrowhead.stories.tsx's `Matrix`.
    for (const style of TRACE_STYLES) {
      const row = requireEl(canvasElement, `[data-testid="trace-row-${style.key}"]`);
      await expect(row.querySelectorAll('[data-slot="trace-marker"]')).toHaveLength(0);
      await expect(lineFor(style.key).getAttribute("marker-end")).toBeNull();
    }

    /* --- 5. Animated actually MOVES ---------------------------------- */
    // The environment must not be asking for reduced motion, or the guard
    // below would (correctly) stop the animation and this claim would be
    // untestable here.
    await expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const animatedLine = lineFor("animated");
    await expect(animatedLine.classList.contains(DATA_MARCH_CLASS)).toBe(true);
    await expect(animatedStyle.animationName).toBe(DATA_MARCH_CLASS);

    const animations = animatedLine.getAnimations();
    await expect(animations.length).toBeGreaterThan(0);
    const t0 = animations[0].currentTime;
    const offsetBefore = Number.parseFloat(getComputedStyle(animatedLine).strokeDashoffset);
    await wait(180);
    const t1 = animations[0].currentTime;
    const offsetAfter = Number.parseFloat(getComputedStyle(animatedLine).strokeDashoffset);
    await expect(Number(t1)).toBeGreaterThan(Number(t0));
    // The visible fact, not just the clock: the dash phase itself changed.
    await expect(offsetAfter).not.toBe(offsetBefore);

    // No other row animates — `animated` is opt-in, never a default.
    for (const key of ["data", "async", "red", "dotted"]) {
      await expect(lineFor(key).getAnimations()).toHaveLength(0);
    }

    /* --- 6. The keyframes and the pinned constant still agree --------- */
    const keyframes = findKeyframes(DATA_MARCH_CLASS);
    if (!keyframes) throw new Error(`no @keyframes ${DATA_MARCH_CLASS} in any stylesheet`);
    let fromOffset: string | null = null;
    for (let i = 0; i < keyframes.cssRules.length; i += 1) {
      const frame = keyframes.cssRules[i] as CSSKeyframeRule;
      if (frame.keyText === "0%" || frame.keyText === "from") {
        fromOffset = frame.style.getPropertyValue("stroke-dashoffset").trim();
      }
    }
    await expect(fromOffset).toBe(String(DATA_MARCH_DASHOFFSET_PX));

    /* --- 7. The reduced-motion guard exists AND actually bites -------- */
    const guards: { media: CSSMediaRule; rule: CSSStyleRule }[] = [];
    eachStyleRule((rule, media) => {
      if (!media || !media.conditionText.includes("prefers-reduced-motion")) return;
      if (!rule.selectorText.includes(`.${DATA_MARCH_CLASS}`)) return;
      guards.push({ media, rule });
    });
    await expect(guards).toHaveLength(1);
    const guard = guards[0];
    await expect(guard.media.conditionText).toContain("prefers-reduced-motion: reduce");
    // NOTE: `rule.style.animation` serialises as the full shorthand
    // ("auto ease 0s 1 normal none running none"), so the longhand is the
    // property that actually says what this guard means.
    await expect(guard.rule.style.animationName).toBe("none");

    // Presence in a stylesheet is not proof the guard works. Force its
    // condition on through CSSOM and measure the real element: the
    // animation must genuinely stop, and come back when it is restored.
    // (This is the only lever a play function has — Playwright's
    // `emulateMedia` lives in the runner config, which P3 owns.)
    const originalMedia = guard.media.media.mediaText;
    try {
      guard.media.media.mediaText = "all";
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await expect(getComputedStyle(animatedLine).animationName).toBe("none");
      await expect(animatedLine.getAnimations()).toHaveLength(0);
    } finally {
      guard.media.media.mediaText = originalMedia;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await expect(getComputedStyle(animatedLine).animationName).toBe(DATA_MARCH_CLASS);
    await expect(animatedLine.getAnimations().length).toBeGreaterThan(0);

    /* --- 8. Terminals land exactly on their {x, y} -------------------- */
    for (const style of TRACE_STYLES) {
      const svg = svgFor(style.key);
      const terminals = svg.querySelectorAll('[data-slot="trace-terminal"]');
      await expect(terminals).toHaveLength(2);
      const expected = [FROM_TERMINAL, TO_TERMINAL];
      for (let i = 0; i < expected.length; i += 1) {
        const rect = (terminals[i] as SVGGraphicsElement).getBoundingClientRect();
        const want = toScreen(svg, expected[i].x, expected[i].y);
        await expect(Math.abs(rect.left + rect.width / 2 - want.x)).toBeLessThan(1);
        await expect(Math.abs(rect.top + rect.height / 2 - want.y)).toBeLessThan(1);
      }
    }
  },
};

/**
 * The four terminal glyphs — the whole vocabulary, because (face,
 * polarity) collapses 2-to-1 onto a flow tangent. Each caption names the
 * two port configurations that draw as that one glyph.
 */
const DIR_MEANING: Record<TraceDir, string> = {
  top: "output on top · input on bottom",
  right: "output right · input left",
  bottom: "output on bottom · input on top",
  left: "output left · input right",
};

const CELL = 88;

export const TerminalDirections: Story = {
  render: () => (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 20 }}>
        {TRACE_DIRS.map((dir) => (
          <div
            key={dir}
            data-testid={`terminal-cell-${dir}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: CELL + 40 }}
          >
            <svg
              data-slot="trace-canvas"
              width={CELL}
              height={CELL}
              viewBox={`0 0 ${CELL} ${CELL}`}
              style={{ background: "var(--muted)", borderRadius: 8 }}
            >
              <TraceTerminal x={CELL / 2} y={CELL / 2} dir={dir} radius={16} />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{dir}</div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              {DIR_MEANING[dir]}
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-slot="trace-terminal"]')).toHaveLength(4);

    for (const dir of TRACE_DIRS) {
      const cell = requireEl(canvasElement, `[data-testid="terminal-cell-${dir}"]`);
      const svg = requireEl<SVGSVGElement>(cell, '[data-slot="trace-canvas"]');
      const group = requireEl<SVGGraphicsElement>(cell, '[data-slot="trace-terminal"]');
      const arrow = requireEl<SVGPathElement>(cell, '[data-slot="trace-terminal-arrow"]');

      // The ring centre is where the glyph was asked to sit.
      const rect = group.getBoundingClientRect();
      const want = toScreen(svg, CELL / 2, CELL / 2);
      const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      await expect(Math.abs(centre.x - want.x)).toBeLessThan(1);
      await expect(Math.abs(centre.y - want.y)).toBeLessThan(1);

      // The arrow's own mass sits on the `dir` side of that centre — a
      // measurement of the RENDERED, rotated geometry in screen space, not
      // a read of the data-dir attribute.
      const centroid = pathCentroidOnScreen(arrow);
      const offset = { x: centroid.x - centre.x, y: centroid.y - centre.y };
      await expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(1);
      await expect(angleBetweenDeg(offset, DIR_VECTOR[dir])).toBeLessThan(5);
    }

    // And the four are genuinely distinct rotations, not four copies of one.
    const angles = TRACE_DIRS.map((dir) => {
      const cell = requireEl(canvasElement, `[data-testid="terminal-cell-${dir}"]`);
      const group = requireEl<SVGGraphicsElement>(cell, '[data-slot="trace-terminal"]');
      const arrow = requireEl<SVGPathElement>(cell, '[data-slot="trace-terminal-arrow"]');
      const rect = group.getBoundingClientRect();
      const centroid = pathCentroidOnScreen(arrow);
      return Math.round(
        (Math.atan2(centroid.y - (rect.top + rect.height / 2), centroid.x - (rect.left + rect.width / 2)) * 180) /
          Math.PI,
      );
    });
    await expect(new Set(angles).size).toBe(4);
  },
};

/* ------------------------------------------------------------------ */
/* DelayedSplit — every routing the kit has, not just a straight line   */
/*                                                                      */
/* H-8. The split point is a FRACTION OF ARC LENGTH: `splitDashArrays`  */
/* (`trace.layout.ts`) sets `stroke-dasharray` in `pathLength`-space    */
/* (`fraction * PATH_LENGTH_UNITS`), and SVG's `pathLength` attribute   */
/* remaps that to the path's own REAL rendered length regardless of     */
/* what `length` prop was fed in — so the split lands at the same       */
/* fraction of arc length on a straight line, a curve or a six-point    */
/* elbow alike. `<Trace>` (not `TraceBody`) draws every row below: it   */
/* is the one place that turns a `routing` KIND into geometry, and for  */
/* a curved route it also re-measures the real `getTotalLength()` after */
/* mount — reusing that instead of hand-rolling a Bezier sampler here.  */
/* ------------------------------------------------------------------ */

/** Bounding box of every numeric coordinate pair in an SVG `d` string —
 * the control polygon for a curve, the exact vertices for anything else.
 * A cubic/quadratic Bezier lies inside the convex hull of its control
 * points, so this is a CONSERVATIVE frame (never clips) even though it is
 * not the tight curve bound. Same technique `TracePolarity.stories.tsx`
 * uses for its own shared viewBox; reimplemented locally rather than
 * imported because that file belongs to a different lane. */
function pathPointsBounds(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const numbers = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

interface DelayedSplitSpecimen {
  key: string;
  label: string;
  caption: string;
  request: TraceRouteRequest;
  labelPosition: number;
  /**
   * Pre-built `path`/`points`, when the row cannot be drawn by `<Trace>`
   * dispatching `request` itself. Only the `elbow` specimen below sets
   * this — see its own comment for why.
   */
  override?: { path: string; points: Point[] };
}

/** The obstacle `elbow` below routes around — two hops up and over, four
 * real corners, not the two-point stub a clear corridor would draw. */
const ELBOW_SPLIT_OBSTACLE = { x: 180, y: 20, w: 100, h: 100 };

const ELBOW_SPLIT_FROM = { x: 26, y: 70, dir: "right" as TraceDir };
const ELBOW_SPLIT_TO = { x: 434, y: 70, dir: "right" as TraceDir };

/**
 * H-8's required specimen: the split lands within 2px of an elbow vertex.
 *
 * This is the one specimen `<Trace>` cannot draw as-is. `traceGeometryBetween`
 * (`trace.tsx`, the elbow branch) calls `elbowPath(route)` with no options,
 * so the drawn `d` ALWAYS uses `DEFAULT_ELBOW_OPTIONS.cornerRadius` (8px) —
 * `TraceRouteRequest.elbowOptions` reaches `ElbowRouteInput.options`, which
 * `elbowRouter.ts` never actually reads (`cornerRadius` has no consumer
 * there), and never reaches the `elbowPath()` call at all. Confirmed by
 * measurement, not just reading the source: passing `elbowOptions:
 * {cornerRadius:2}` through `<Trace>` changed nothing — same 2.84px result
 * as the untouched default. At the frozen 8px radius (`CORNER_RADIUS_PX` in
 * `TraceTidy.stories.tsx`), the closest point on a ROUNDED 90° corner sits
 * `r * (sqrt(2) - 1)` ≈ 2.84px from the sharp vertex — a fixed geometric
 * floor for that corner, not a `labelPosition` targeting error, and it
 * matches `TraceTidy.stories.tsx`'s own independently-derived "worst case
 * 2.83px at r=8". No choice of `labelPosition` gets a rounded r=8 corner
 * under a 2px tolerance; this is reported as a real (if minor) `trace.tsx`
 * gap in the lane report rather than fixed here — `trace.tsx` belongs to a
 * component another lane owns, not to `Trace.stories.tsx` or `trace.tidy.ts`.
 *
 * The workaround stays inside this file: call `routeElbow` + `elbowPath`
 * directly — both public, pure functions this repo already calls the same
 * way in `TraceTidy.stories.tsx` and `TraceElbow.stories.tsx` — with a 2px
 * radius (cut ≈ 0.83px, comfortably under 2px) for THIS specimen only. The
 * router's own vertices are untouched; only how tightly the drawn corner is
 * rounded changes.
 */
const ELBOW_SPLIT_INPUT = elbowInputFromTerminals({
  from: ELBOW_SPLIT_FROM,
  to: ELBOW_SPLIT_TO,
  obstacles: [ELBOW_SPLIT_OBSTACLE],
});
const ELBOW_SPLIT_ROUTE = routeElbow(ELBOW_SPLIT_INPUT);
const ELBOW_SPLIT_POINTS = routePoints(ELBOW_SPLIT_ROUTE);
const ELBOW_SPLIT_PATH = elbowPath(ELBOW_SPLIT_ROUTE, { radius: 2 });
const ELBOW_SPLIT_VERTEX_INDEX = 2;
const ELBOW_SPLIT_TARGET_VERTEX = ELBOW_SPLIT_POINTS[ELBOW_SPLIT_VERTEX_INDEX];
const ELBOW_SPLIT_FRACTION = (() => {
  let cumulative = 0;
  let atVertex = 0;
  for (let i = 1; i < ELBOW_SPLIT_POINTS.length; i += 1) {
    cumulative += Math.hypot(
      ELBOW_SPLIT_POINTS[i].x - ELBOW_SPLIT_POINTS[i - 1].x,
      ELBOW_SPLIT_POINTS[i].y - ELBOW_SPLIT_POINTS[i - 1].y,
    );
    if (i === ELBOW_SPLIT_VERTEX_INDEX) atVertex = cumulative;
  }
  return atVertex / cumulative;
})();

const DELAYED_SPLIT_SPECIMENS: DelayedSplitSpecimen[] = [
  {
    key: "straight",
    label: "Straight",
    caption: "labelPosition 0 — clamped up to the 0.05 floor",
    request: { from: { x: 26, y: 70, dir: "right" }, to: { x: 434, y: 70, dir: "right" }, routing: "straight" },
    labelPosition: 0,
  },
  {
    key: "straight-bends",
    label: "Straight, with bends",
    caption: "a bent straight is a real polyline now — the split still tracks the ratio, corners included",
    request: {
      from: { x: 26, y: 70, dir: "right" },
      to: { x: 434, y: 70, dir: "right" },
      routing: "straight",
      bends: [{ t: 0.33, o: -36 }, { t: 0.66, o: 36 }],
    },
    labelPosition: 0.5,
  },
  {
    key: "slanted",
    label: "Slanted",
    caption: "labelPosition 0.35",
    request: { from: { x: 26, y: 104, dir: "right" }, to: { x: 434, y: 32, dir: "right" }, routing: "slanted" },
    labelPosition: 0.35,
  },
  {
    key: "curved",
    label: "Curved",
    caption: "the kit default — a cubic Bezier, no vertices, same fraction rule",
    request: { from: { x: 26, y: 104, dir: "right" }, to: { x: 434, y: 32, dir: "right" }, routing: "curved" },
    labelPosition: 0.6,
  },
  {
    key: "curved-control",
    label: "Curved, with a control point",
    caption: "the dragged waypoint reshapes the curve; the split is still a fraction of its (longer) length",
    request: {
      from: { x: 26, y: 70, dir: "right" },
      to: { x: 434, y: 70, dir: "right" },
      routing: "curved",
      curve: { dx: 0, dy: -70 },
    },
    labelPosition: 0.45,
  },
  {
    key: "elbow",
    label: "Elbow, several corners",
    caption:
      `labelPosition ${ELBOW_SPLIT_FRACTION.toFixed(4)} — chosen so the split lands ON vertex ${ELBOW_SPLIT_VERTEX_INDEX} ` +
      "(the turn back down toward the target): the solid run ends and the dotted run begins right at the corner, " +
      "not mid-leg either side of it. Drawn with a 2px corner radius rather than the 8px default so that corner is " +
      "reachable within 2px at all — see the WHY above ELBOW_SPLIT_ROUTE",
    request: { from: ELBOW_SPLIT_FROM, to: ELBOW_SPLIT_TO, routing: "elbow", obstacles: [ELBOW_SPLIT_OBSTACLE] },
    labelPosition: ELBOW_SPLIT_FRACTION,
    override: { path: ELBOW_SPLIT_PATH, points: ELBOW_SPLIT_POINTS },
  },
];

function DelayedSplitRow({ specimen }: { specimen: DelayedSplitSpecimen }) {
  const path = specimen.override?.path ?? traceGeometry(specimen.request).path;
  const bounds = pathPointsBounds(path);
  const pad = 16;
  const minX = Math.min(bounds.minX, specimen.request.from.x, specimen.request.to.x) - pad;
  const minY = Math.min(bounds.minY, specimen.request.from.y - pad, specimen.request.to.y - pad) - pad;
  const maxX = Math.max(bounds.maxX, specimen.request.from.x, specimen.request.to.x) + pad;
  const maxY = Math.max(bounds.maxY, specimen.request.from.y + pad, specimen.request.to.y + pad) + pad;
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <div data-testid={`split-row-${specimen.key}`} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{specimen.label}</div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{specimen.caption}</div>
      </div>
      <svg
        data-slot="trace-canvas"
        width={ROW_W}
        viewBox={viewBox}
        style={{ display: "block", aspectRatio: `${maxX - minX} / ${maxY - minY}`, overflow: "visible" }}
      >
        {specimen.override ? (
          <>
            <TraceBody
              id={`trace-split-${specimen.key}`}
              path={specimen.override.path}
              points={specimen.override.points}
              variant="delayed"
              splitAtLabel
              labelPosition={specimen.labelPosition}
              // Opted in BY NAME: this specimen asserts where a head goes on
              // a split trace (the `after` run only), and heads are no
              // longer the default (`DEFAULT_TRACE_MARKER_END`).
              markerEnd="arrow"
            />
            <TraceTerminal
              x={specimen.request.from.x}
              y={specimen.request.from.y}
              dir={specimen.request.from.dir}
            />
            <TraceTerminal x={specimen.request.to.x} y={specimen.request.to.y} dir={specimen.request.to.dir} />
          </>
        ) : (
          <Trace
            id={`trace-split-${specimen.key}`}
            {...specimen.request}
            variant="delayed"
            splitAtLabel
            labelPosition={specimen.labelPosition}
            markerEnd="arrow"
          />
        )}
      </svg>
    </div>
  );
}

export const DelayedSplit: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
      {DELAYED_SPLIT_SPECIMENS.map((specimen) => (
        <DelayedSplitRow key={specimen.key} specimen={specimen} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // H8a: every routing the kit has, and nothing silently dropped.
    const rows = canvasElement.querySelectorAll('[data-testid^="split-row-"]');
    await expect(rows).toHaveLength(DELAYED_SPLIT_SPECIMENS.length);

    for (const specimen of DELAYED_SPLIT_SPECIMENS) {
      const row = requireEl(canvasElement, `[data-testid="split-row-${specimen.key}"]`);
      const segments = row.querySelectorAll('[data-slot="trace-line"]:not([data-sketch])');
      // Two real paths, not one path with a clever dash — that is what lets
      // the before/after runs carry different caps and markers.
      await expect(segments, `${specimen.key}: expected 2 trace-line paths`).toHaveLength(2);
      const before = requireEl<SVGPathElement>(row, '[data-trace-segment="before"]');
      const after = requireEl<SVGPathElement>(row, '[data-trace-segment="after"]');

      // The solid run's length in path units IS the split point, and the
      // dotted run starts exactly there — true for every routing, because
      // `pathLength` remaps `fraction * 1000` to the path's OWN real
      // length regardless of what geometry drew it.
      const beforeDash = dashNumbers(getComputedStyle(before).strokeDasharray);
      const afterDash = dashNumbers(getComputedStyle(after).strokeDasharray);
      const expectedSplit = Math.max(0.05, specimen.labelPosition) * 1000;
      await expect(Math.abs(beforeDash[0] - expectedSplit), `${specimen.key}: before dash`).toBeLessThan(0.01);
      await expect(afterDash[0], `${specimen.key}: after dash start`).toBe(0);
      await expect(Math.abs(afterDash[1] - expectedSplit), `${specimen.key}: after dash`).toBeLessThan(0.01);

      // Only the `after` run wears the arrowhead — the head belongs to the
      // trace's end, not to the seam.
      await expect(after.getAttribute("marker-end")).toBe(
        `url(#${safeElementId("bbox-trace-head", `trace-split-${specimen.key}`)})`,
      );
      await expect(before.getAttribute("marker-end")).toBeNull();
    }

    // H8b: on the elbow specimen, the split's actual SCREEN-INDEPENDENT
    // position — read off the real path with `getPointAtLength`, in the
    // path's own local coordinates, which is exactly the space
    // `ELBOW_SPLIT_TARGET_VERTEX` is expressed in — lands within 2px of the
    // router's own vertex. `pathLength` only rescales how the dasharray
    // NUMBERS are interpreted; `getPointAtLength`/`getTotalLength` always
    // use the path's real geometric length, so this is the actual visual
    // transition point, not a proxy for it.
    const elbowRow = requireEl(canvasElement, '[data-testid="split-row-elbow"]');
    const elbowAfter = requireEl<SVGPathElement>(elbowRow, '[data-trace-segment="after"]');
    const totalLength = elbowAfter.getTotalLength();
    const splitPoint = elbowAfter.getPointAtLength(ELBOW_SPLIT_FRACTION * totalLength);
    const distance = Math.hypot(
      splitPoint.x - ELBOW_SPLIT_TARGET_VERTEX.x,
      splitPoint.y - ELBOW_SPLIT_TARGET_VERTEX.y,
    );
    await expect(
      distance,
      `split point (${splitPoint.x.toFixed(1)}, ${splitPoint.y.toFixed(1)}) vs vertex ` +
        `(${ELBOW_SPLIT_TARGET_VERTEX.x}, ${ELBOW_SPLIT_TARGET_VERTEX.y})`,
    ).toBeLessThan(2);
  },
};

/**
 * The invisible hit path (`interactive`) — 12px of transparent stroke that
 * P4's double-click-to-create-a-badge needs, because the visible line is
 * 2px and nobody can hit that. Off by default, so a decorative Trace never
 * silently eats pointer events from whatever sits under it.
 */
export const InteractiveHitPath: Story = {
  render: () => (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      {[false, true].map((interactive) => (
        <div
          key={String(interactive)}
          data-testid={`hit-row-${interactive}`}
          style={{ display: "flex", alignItems: "center", gap: 20 }}
        >
          <div style={{ width: 160, flexShrink: 0, fontSize: 13 }}>
            {interactive ? "interactive" : "default"}
          </div>
          <svg
            data-slot="trace-canvas"
            width={ROW_W}
            height={ROW_H}
            viewBox={`0 0 ${ROW_W} ${ROW_H}`}
          >
            <TraceBody
              id={`trace-hit-${interactive}`}
              path={LINE_PATH}
              points={LINE_POINTS}
              interactive={interactive}
            />
          </svg>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const plain = requireEl(canvasElement, '[data-testid="hit-row-false"]');
    const interactive = requireEl(canvasElement, '[data-testid="hit-row-true"]');
    await expect(plain.querySelectorAll('[data-slot="trace-hit"]')).toHaveLength(0);
    await expect(interactive.querySelectorAll('[data-slot="trace-hit"]')).toHaveLength(1);

    const hit = requireEl<SVGPathElement>(interactive, '[data-slot="trace-hit"]');
    await expect(Number.parseFloat(getComputedStyle(hit).strokeWidth)).toBe(12);

    // It is genuinely hittable, and the plain row at the same spot is not:
    // 5px off the 2px centre line is inside the 12px halo and outside the
    // visible stroke, so this discriminates the hit path from the line.
    const svg = requireEl<SVGSVGElement>(interactive, '[data-slot="trace-canvas"]');
    const probe = toScreen(svg, (FROM_X + TO_X) / 2, MID_Y + 5);
    await expect(document.elementFromPoint(probe.x, probe.y)).toBe(hit);

    const plainSvg = requireEl<SVGSVGElement>(plain, '[data-slot="trace-canvas"]');
    const plainProbe = toScreen(plainSvg, (FROM_X + TO_X) / 2, MID_Y + 5);
    const plainHitEl = document.elementFromPoint(plainProbe.x, plainProbe.y);
    await expect(plainHitEl?.getAttribute("data-slot")).not.toBe("trace-line");
    await expect(plainHitEl?.getAttribute("data-slot")).not.toBe("trace-hit");
  },
};
