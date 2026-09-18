import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { Badge } from "../components/badge";
import { Port } from "../components/port";
import { TraceBody } from "../components/trace";
import { bboxSkinAttrs } from "../skin/skin";
import { SketchAtEdge } from "../skin/SketchAtEdge";
import {
  SKETCH_TWIN_ATTR,
  applySketchAtEdge,
  type SketchPassStats,
} from "../skin/sketchAtEdge";

/**
 * Skin/At the edges — the PoC for Zach's 2026-09-17 ruling:
 *
 *   "I don't want the code base to be affected by the skin. Sketch
 *    skinning should be something very much done just like at the edges
 *    of the code base as a final rerender persay."
 *
 * Today six components under `src/components/` import `../skin/*` and
 * compute sketch geometry inside their own render, and `trace.tsx` emits a
 * permanently-hidden drawn twin of every path so CSS can pick between them.
 * These stories demonstrate the same look produced entirely from OUTSIDE:
 * the core renders crisp, un-skinned geometry, and `<SketchAtEdge>` reads
 * the resulting DOM back and draws over it.
 *
 * WHY the proof is byte-identity rather than a screenshot: the sketch
 * generator seeds from the path string itself (`seed: d`), so the same `d`
 * produces the same output wherever the call happens. That turns "does the
 * boundary match the look Zach approved?" from a matter of taste into a
 * string comparison — and the thing it is compared against is the core's
 * OWN twin, read live out of the rendered document. The shipped
 * implementation is the oracle; nothing here re-derives it.
 */
const meta = {
  title: "Skin/At the edges",
  parameters: {
    layout: "padded",
    // WHY the skin toolbar is disabled here: these stories control the
    // skin attribute themselves, per-column, in order to put the in-core
    // mechanism and the boundary mechanism next to each other in one
    // frame. A global skin on top would apply to both columns and make the
    // comparison meaningless.
    globals: { bboxSkin: "" },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** One `d` per routing mode the core can emit, plus the tunnelled case. */
const TRACE_CASES = [
  { name: "straight", path: "M8 24L232 24", points: [{ x: 8, y: 24 }, { x: 232, y: 24 }] },
  {
    name: "elbow",
    path: "M8 16L120 16L120 56L232 56",
    points: [{ x: 8, y: 16 }, { x: 120, y: 16 }, { x: 120, y: 56 }, { x: 232, y: 56 }],
  },
  {
    name: "curved",
    path: "M8 16C90 16 150 56 232 56",
    points: [{ x: 8, y: 16 }, { x: 232, y: 56 }],
  },
] as const;

const STAGE_W = 240;
const STAGE_H = 72;

function TraceStage({
  testid,
  tunnel = "off",
}: {
  testid: string;
  tunnel?: "off" | "hidden" | "preview" | "revealed";
}) {
  return (
    <svg
      data-testid={testid}
      width={STAGE_W}
      height={STAGE_H * TRACE_CASES.length}
      style={{ display: "block", overflow: "visible" }}
    >
      {TRACE_CASES.map((c, i) => (
        <g key={c.name} transform={`translate(0 ${i * STAGE_H})`}>
          <TraceBody
            id={`${testid}-${c.name}`}
            path={c.path}
            points={c.points as unknown as { x: number; y: number }[]}
            variant="data"
            tunnel={tunnel}
          />
        </g>
      ))}
    </svg>
  );
}

function BoxStage({ testid }: { testid: string }) {
  return (
    <div
      data-testid={testid}
      style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" }}
    >
      <Block header="Header" body="Body" width={200} height={96} />
      {/* No `height` — Block hugs its content, which is exactly the case
          the core has to fake with a nominal 200 and
          `preserveAspectRatio="none"`. */}
      <Block header="Auto height" body="Measured, not nominal" width={220} />
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Port state="empty" />
        <Port state="wired" />
        <Port state="received" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Badge variant="secondary">chip</Badge>
        <Badge variant="secondary">a much wider chip</Badge>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assertion helpers — measured, never asserted by DOM presence        */
/* ------------------------------------------------------------------ */

function coreTwins(root: HTMLElement): SVGPathElement[] {
  // The core's own drawn twin. Always present today, painted only when
  // `--bbox-skin-outline` says so.
  return [...root.querySelectorAll<SVGPathElement>('path[data-slot="trace-line"][data-sketch="true"]')];
}

function boundaryTwins(root: HTMLElement): SVGPathElement[] {
  return [...root.querySelectorAll<SVGPathElement>(`path[${SKETCH_TWIN_ATTR}]`)];
}

/* ------------------------------------------------------------------ */
/* 1. The byte-identity proof                                          */
/* ------------------------------------------------------------------ */

/**
 * The core's own twin and the boundary's twin, in the SAME subtree, from
 * the same props — so there is no question of the two having been given
 * different geometry. Assert the `d` strings are equal character for
 * character.
 */
export const BoundaryMatchesCoreExactly: Story = {
  render: () => (
    // `suppressCrisp={false}` so nothing is hidden and both layers are
    // readable in one pass.
    <SketchAtEdge suppressCrisp={false}>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        <Labelled title="Untunnelled">
          <TraceStage testid="match-plain" />
        </Labelled>
        <Labelled title="Tunnelled (two subpaths in one d)">
          <TraceStage testid="match-tunnel" tunnel="hidden" />
        </Labelled>
      </div>
    </SketchAtEdge>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The pass runs in a layout effect; wait for its output rather than
    // assuming a frame has elapsed.
    await waitFor(() => {
      expect(boundaryTwins(canvasElement).length).toBeGreaterThan(0);
    });

    const core = coreTwins(canvasElement);
    const edge = boundaryTwins(canvasElement);

    // Every crisp path got exactly one twin, and the core's own twin count
    // matches — so neither side quietly skipped a case.
    expect(edge.length).toBe(core.length);
    expect(core.length).toBe(TRACE_CASES.length * 2);

    // THE claim: byte-identical geometry.
    for (let i = 0; i < core.length; i++) {
      const want = core[i].getAttribute("d");
      const got = edge[i].getAttribute("d");
      expect(want, `core twin ${i} has no d`).toBeTruthy();
      expect(got, `boundary twin ${i} differs from the core's`).toBe(want);
    }

    // And the boundary's twins are non-trivial — not a copy of the crisp
    // path, which would pass the equality above only if the core were also
    // broken.
    const crisp = [
      ...canvasElement.querySelectorAll<SVGPathElement>(
        'path[data-slot="trace-line"]:not([data-sketch]):not([' + SKETCH_TWIN_ATTR + "])",
      ),
    ];
    expect(crisp.length).toBe(edge.length);
    for (let i = 0; i < crisp.length; i++) {
      expect(edge[i].getAttribute("d")).not.toBe(crisp[i].getAttribute("d"));
    }

    await expect(canvas.getByTestId("match-plain")).toBeInTheDocument();
  },
};

/* ------------------------------------------------------------------ */
/* 2. Side by side — the capture                                       */
/* ------------------------------------------------------------------ */

function Labelled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          font: "600 11px/1.4 ui-sans-serif, system-ui, sans-serif",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          opacity: 0.6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Three columns, one frame. The middle column is today's mechanism (the
 * core computing its own sketch under `data-bbox-skin="sketch"`); the right
 * column's core subtree carries NO skin attribute at all — it is in its
 * default, un-skinned state — and the drawn layer comes entirely from
 * `<SketchAtEdge>`.
 *
 * That contrast is the architectural claim made visible: the right column
 * proves the core does not need to know a skin exists in order to be drawn
 * by hand.
 */
export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-start" }}>
      <Labelled title="1 · Crisp core (no skin anywhere)">
        <div data-testid="col-crisp">
          <TraceStage testid="crisp-traces" />
          <BoxStage testid="crisp-boxes" />
        </div>
      </Labelled>

      <Labelled title="2 · In-core sketch (today)">
        <div data-testid="col-incore" {...bboxSkinAttrs("sketch")}>
          <TraceStage testid="incore-traces" />
          <BoxStage testid="incore-boxes" />
        </div>
      </Labelled>

      <Labelled title="3 · Boundary sketch (proposed)">
        {/* Note what is NOT here: no `bboxSkinAttrs`. The subtree below is
            the core in its default state. */}
        <SketchAtEdge>
          <div data-testid="col-boundary">
            <TraceStage testid="boundary-traces" />
            <BoxStage testid="boundary-boxes" />
          </div>
        </SketchAtEdge>
      </Labelled>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const incore = canvasElement.querySelector<HTMLElement>('[data-testid="col-incore"]')!;
    const boundary = canvasElement.querySelector<HTMLElement>('[data-testid="col-boundary"]')!;

    await waitFor(() => {
      expect(boundaryTwins(boundary).length).toBe(TRACE_CASES.length);
    });

    // Paths: byte-identical between the two mechanisms.
    const a = coreTwins(incore).map((p) => p.getAttribute("d"));
    const b = boundaryTwins(boundary).map((p) => p.getAttribute("d"));
    expect(b).toEqual(a);

    // Boxes: the boundary drew an outline for every Block and Port dot.
    // One drawn outline per shape, across all three shape classes the six
    // leaking components reduce to: rounded rect (Block, Badge) and
    // ellipse (Port dot).
    const blocks = boundary.querySelectorAll('[data-slot="block"]').length;
    const badges = boundary.querySelectorAll('[data-slot="badge"]').length;
    const dots = boundary.querySelectorAll('[data-slot="port-dot"]').length;
    expect(blocks).toBeGreaterThan(0);
    expect(badges).toBeGreaterThan(0);
    expect(dots).toBeGreaterThan(0);
    await waitFor(() => {
      const boxTwins = boundary.querySelectorAll(`svg[${SKETCH_TWIN_ATTR}="box"]`).length;
      expect(boxTwins).toBe(blocks + badges + dots);
    });

    // The crisp column is genuinely crisp: no drawn geometry at all.
    const crispCol = canvasElement.querySelector<HTMLElement>('[data-testid="col-crisp"]')!;
    expect(boundaryTwins(crispCol).length).toBe(0);
    // Its own sketch-outline elements exist (the core always renders them)
    // but paint nothing, because no skin set `--bbox-skin-outline`.
    for (const svg of crispCol.querySelectorAll('[data-slot="sketch-outline"]')) {
      expect(getComputedStyle(svg).display).toBe("none");
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3. Measured, not nominal — what the boundary FIXES                  */
/* ------------------------------------------------------------------ */

/**
 * The boundary is not merely as good as the in-core version; for
 * content-sized elements it is strictly better, and that is measurable.
 *
 * The core cannot self-measure, so `badge.tsx:102-107` draws every chip at
 * a nominal 40x20 and `block.tsx:198-203` draws an auto-height Block at a
 * nominal 200, then stretches the path with `preserveAspectRatio="none"`.
 * Stretching a path scales its wobble anisotropically — the documented cost
 * in `sketchOutline.tsx`'s own `stretch` prop. A boundary pass runs after
 * layout and draws at the real pixels, so there is no stretch and no
 * distortion.
 *
 * This story asserts that difference numerically.
 */
export const MeasuredNotNominal: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-start" }}>
      <Labelled title="In-core: nominal + preserveAspectRatio='none'">
        <div data-testid="nominal" {...bboxSkinAttrs("sketch")}>
          <BoxStage testid="nominal-boxes" />
        </div>
      </Labelled>
      <Labelled title="Boundary: drawn at measured pixels">
        <SketchAtEdge>
          <div data-testid="measured">
            <BoxStage testid="measured-boxes" />
          </div>
        </SketchAtEdge>
      </Labelled>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const nominal = canvasElement.querySelector<HTMLElement>('[data-testid="nominal"]')!;
    const measured = canvasElement.querySelector<HTMLElement>('[data-testid="measured"]')!;

    await waitFor(() => {
      expect(measured.querySelectorAll(`svg[${SKETCH_TWIN_ATTR}="box"]`).length).toBeGreaterThan(0);
    });

    // --- The in-core side really is stretching a nominal path -----------
    // A Badge's outline is authored at 40x20 regardless of how wide the
    // chip is, and carries preserveAspectRatio="none".
    const badgeOutlines = [
      ...nominal.querySelectorAll<SVGSVGElement>('[data-slot="badge"] [data-slot="sketch-outline"]'),
    ];
    expect(badgeOutlines.length).toBe(2);
    for (const svg of badgeOutlines) {
      expect(svg.getAttribute("viewBox")).toBe("0 0 40 20");
      expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    }
    // The two chips have genuinely different real widths, so the identical
    // 40-wide viewBox above is being stretched by two different factors.
    const badgeBoxes = [...nominal.querySelectorAll('[data-slot="badge"]')].map(
      (el) => el.getBoundingClientRect().width,
    );
    expect(badgeBoxes[1]).toBeGreaterThan(badgeBoxes[0] + 20);
    // Which is the distortion, quantified: px-per-viewBox-unit differs.
    const stretchA = badgeBoxes[0] / 40;
    const stretchB = badgeBoxes[1] / 40;
    expect(Math.abs(stretchB - stretchA)).toBeGreaterThan(0.4);

    // --- The boundary side draws at true pixels -------------------------
    for (const el of measured.querySelectorAll('[data-slot="block"], [data-slot="badge"]')) {
      const rect = el.getBoundingClientRect();
      const twin = el.querySelector<SVGSVGElement>(`svg[${SKETCH_TWIN_ATTR}="box"]`)!;
      const vb = twin.getAttribute("viewBox")!.split(/\s+/).map(Number);
      // viewBox equals the element's real box, so scale is exactly 1:1 and
      // no `preserveAspectRatio` trick is needed.
      expect(vb[2]).toBeCloseTo(rect.width, 0);
      expect(vb[3]).toBeCloseTo(rect.height, 0);
      expect(twin.getAttribute("preserveAspectRatio")).toBeNull();
    }
  },
};

/* ------------------------------------------------------------------ */
/* 4. The pass is idempotent and self-healing                          */
/* ------------------------------------------------------------------ */

/**
 * A boundary transform is only safe if running it again is free and
 * running it after React replaces a subtree repairs itself. Both are
 * asserted here against the pass's own returned stats rather than by
 * counting DOM nodes and hoping.
 */
export const IdempotentAndSelfHealing: Story = {
  render: () => {
    function Harness() {
      const hostRef = useRef<HTMLDivElement>(null);
      const [log, setLog] = useState<SketchPassStats[]>([]);
      const [nonce, setNonce] = useState(0);

      useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        // Three consecutive passes, driven by hand so the test can read
        // exactly what each one did.
        const runs = [applySketchAtEdge(host), applySketchAtEdge(host), applySketchAtEdge(host)];
        setLog(runs);
      }, [nonce]);

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button
            type="button"
            data-testid="remount"
            onClick={() => setNonce((n) => n + 1)}
            style={{ alignSelf: "flex-start", padding: "4px 10px", font: "12px ui-sans-serif" }}
          >
            re-run passes
          </button>
          <pre data-testid="pass-log" style={{ font: "11px ui-monospace", margin: 0 }}>
            {JSON.stringify(log)}
          </pre>
          <div ref={hostRef} data-testid="idem-host">
            <TraceStage testid="idem-traces" />
          </div>
        </div>
      );
    }
    return <Harness />;
  },
  play: async ({ canvasElement }) => {
    const host = canvasElement.querySelector<HTMLElement>('[data-testid="idem-host"]')!;

    await waitFor(() => {
      const log = JSON.parse(
        canvasElement.querySelector('[data-testid="pass-log"]')!.textContent || "[]",
      ) as SketchPassStats[];
      expect(log.length).toBe(3);
    });

    const log = JSON.parse(
      canvasElement.querySelector('[data-testid="pass-log"]')!.textContent || "[]",
    ) as SketchPassStats[];

    // First pass draws; the next two find every twin still valid and do
    // no work at all.
    expect(log[0].created).toBe(TRACE_CASES.length);
    expect(log[1]).toEqual({ created: 0, reused: TRACE_CASES.length, refreshed: 0 });
    expect(log[2]).toEqual({ created: 0, reused: TRACE_CASES.length, refreshed: 0 });

    // And three passes produced exactly one twin per crisp path — no
    // duplication.
    expect(boundaryTwins(host).length).toBe(TRACE_CASES.length);
  },
};

/* ------------------------------------------------------------------ */
/* 5. The rejected alternative, rendered rather than asserted          */
/* ------------------------------------------------------------------ */

/**
 * OPTION 2 — an SVG `feTurbulence` + `feDisplacementMap` filter at the
 * boundary — evaluated honestly, because on paper it is the most appealing
 * answer to Zach's ruling: genuinely a final re-render, zero JS, and no
 * geometry knowledge anywhere in the tree.
 *
 * It is rendered here beside the geometric transform so the comparison is
 * measured rather than argued. Three things disqualify it, and all three
 * are visible in this frame:
 *
 *   1. NO SECOND PASS. `sketchPath.ts`'s own reading of tldraw (point 3 of
 *      its module doc) is that drawing the outline TWICE is "doing most of
 *      the work, not the wobble". A displacement filter perturbs the one
 *      rendered result; it has no way to produce two independent laps of a
 *      pen. The look it gives is a wavy line, not a drawn one.
 *   2. ENDPOINTS MOVE. `sketchPathData` deliberately pins the first and
 *      last point of every run so a Trace cannot detach from the port dots
 *      it is drawn between — its header calls a wandering endpoint "a
 *      correctness bug wearing a style's clothes". A filter displaces every
 *      pixel including the ends, and offers no exemption.
 *   3. IT CATCHES EVERYTHING. A filter applies to the whole subtree it is
 *      set on — labels, badges and text included — so it cannot be scoped
 *      to "the geometry" the way a path-level transform can.
 */
export const RejectedFilterAlternative: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-start" }}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
        <filter id="sketch-filter-probe" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={3} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <Labelled title="Geometric transform (chosen)">
        <SketchAtEdge>
          <div data-testid="filter-geometric">
            <TraceStage testid="geom-traces" />
          </div>
        </SketchAtEdge>
      </Labelled>

      <Labelled title="feTurbulence filter (rejected)">
        <div data-testid="filter-probe" style={{ filter: "url(#sketch-filter-probe)" }}>
          <TraceStage testid="filter-traces" />
          <div style={{ font: "12px ui-sans-serif", paddingTop: 8 }}>
            a label, also displaced
          </div>
        </div>
      </Labelled>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Assert the filter is genuinely live, so the capture is not a lie
    // about what was rendered.
    const probe = canvasElement.querySelector<HTMLElement>('[data-testid="filter-probe"]')!;
    expect(getComputedStyle(probe).filter).toContain("sketch-filter-probe");
    expect(canvasElement.querySelector("filter#sketch-filter-probe")).not.toBeNull();
    expect(canvasElement.querySelector("feDisplacementMap")).not.toBeNull();

    // Disqualifier 3, as a structural fact rather than an opinion: the
    // filter's subtree contains non-geometry it cannot exempt.
    expect(probe.textContent).toContain("a label, also displaced");

    // Disqualifier 1: the geometric side emits TWO laps per cable inside
    // one `d` (tldraw's `passes: 2`), which is countable. A filtered path
    // has exactly the one subpath it started with.
    const geom = canvasElement.querySelector<HTMLElement>('[data-testid="filter-geometric"]')!;
    await waitFor(() => {
      expect(boundaryTwins(geom).length).toBe(TRACE_CASES.length);
    });
    for (const twin of boundaryTwins(geom)) {
      const moves = (twin.getAttribute("d")!.match(/M/g) || []).length;
      expect(moves, "a drawn cable is two laps of a pen").toBeGreaterThanOrEqual(2);
    }
    for (const p of canvasElement.querySelectorAll<SVGPathElement>(
      '[data-testid="filter-probe"] path[data-slot="trace-line"]:not([data-sketch])',
    )) {
      const moves = (p.getAttribute("d")!.match(/M/g) || []).length;
      expect(moves, "the filter cannot add a second lap").toBe(1);
    }
  },
};
