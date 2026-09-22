import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { Badge } from "../components/badge";
import { Port } from "../components/port";
import { PORT_VARIANTS, portVariantRingExpansion } from "./portVariants";
import { TraceBody } from "../components/trace";
import { bboxSkinAttrs } from "./skin";
import { SketchAtEdge } from "./SketchAtEdge";
import {
  SKETCH_TWIN_ATTR,
  applySketchAtEdge,
  type SketchPassStats,
} from "./sketchAtEdge";

/**
 * Skin/SkinAtTheEdges — the PoC for Zach's 2026-09-17 ruling:
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
  title: "Skin/SkinAtTheEdges",
  tags: ["object:skin"],
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

function boundaryTwins(root: HTMLElement): SVGPathElement[] {
  return [...root.querySelectorAll<SVGPathElement>(`path[${SKETCH_TWIN_ATTR}]`)];
}

/* ------------------------------------------------------------------ */
/* 1. The byte-identity proof                                          */
/* ------------------------------------------------------------------ */

/**
 * The exact `d` strings the CORE's own hidden twin produced for
 * `TRACE_CASES` (straight, elbow, curved), untunnelled then tunnelled —
 * captured live off the rendered DOM immediately before
 * docs/SKIN-AT-THE-EDGES-MIGRATION.md's M1 deleted that mechanism from
 * `trace.tsx`.
 *
 * WHY hardcoded strings and not a live comparison: `BoundaryMatchesCoreExactly`
 * used to read the core's OWN twin out of the DOM and diff the boundary's
 * twin against it, live, in the same frame — an oracle with no risk of
 * having been re-derived by the same hand that wrote the boundary. M1
 * deleted the thing that oracle read (`trace.tsx` no longer renders a
 * twin at all), so the evidence would be lost with it. These are that
 * oracle's OUTPUT, frozen at the moment before deletion — not a
 * re-implementation, a capture. Reproduce by checking out the commit
 * before M1 and reading `path[data-slot="trace-line"][data-sketch="true"]`
 * off this same `BoxStage`/`TraceStage` fixture.
 */
const GOLDEN_TRACE_D = [
  // Untunnelled: straight, elbow, curved.
  "M8 24Q24.52 24.56 32.51 23.98Q40.5 23.4 47.87 23.7Q55.24 24 63.62 23.6Q72 23.21 80.34 24.08Q88.67 24.95 96.54 23.88Q104.41 22.81 112.21 23.08Q120.01 23.35 127.53 23.31Q135.05 23.28 143.92 24.17Q152.8 25.07 160.56 25.19Q168.33 25.3 175.99 24.89Q183.65 24.48 191.38 23.92Q199.11 23.37 207.37 23.9Q215.62 24.44 223.81 24.22L232 24 M8 24Q24.1 24.89 32.45 24.7Q40.81 24.51 48.51 24.68Q56.22 24.85 63.87 24.06Q71.53 23.28 79.34 23.55Q87.16 23.82 95.6 23.55Q104.04 23.27 111.77 23.95Q119.5 24.63 128.38 24.54Q137.27 24.46 144.14 24.32Q151 24.18 159.1 24.5Q167.2 24.81 175.06 24.79Q182.92 24.77 191.17 24.51Q199.43 24.25 207.81 23.99Q216.2 23.74 224.1 23.87L232 24",
  "M8 16Q24.65 15.17 32.33 15.37Q40.01 15.57 48.12 15.86Q56.22 16.16 63.61 16.25Q70.99 16.34 80.02 16.36Q89.05 16.39 96.66 15.79Q104.27 15.19 112.7 15.62Q121.14 16.05 121.08 22.54Q121.03 29.04 120.52 35.36Q120.02 41.69 120.19 48.87Q120.36 56.05 128.21 56.39Q136.06 56.73 144.35 56.05Q152.64 55.38 159.83 55.97Q167.01 56.56 175.86 56.67Q184.72 56.78 191.85 56.82Q198.98 56.86 206.96 56.11Q214.93 55.35 223.46 55.68L232 56 M8 16Q24.01 14.83 32.31 15.58Q40.6 16.34 48.08 16.01Q55.56 15.68 64.25 16.15Q72.94 16.62 80.26 15.89Q87.59 15.15 96.29 15.17Q104.98 15.18 112.14 15.07Q119.29 14.96 119.09 22.4Q118.89 29.84 119.27 36.22Q119.65 42.6 119.73 49.68Q119.81 56.77 128.37 56.6Q136.94 56.44 144.56 56.82Q152.17 57.21 160.37 56.16Q168.56 55.12 176.69 55.8Q184.81 56.48 192.88 56.05Q200.96 55.63 208.1 55.78Q215.24 55.93 223.62 55.97L232 56",
  "M8 16Q23.25 16.38 30.95 17.3Q38.64 18.22 46.94 19.2Q55.24 20.17 62.45 21.04Q69.65 21.9 77.44 24.19Q85.23 26.48 91.95 28.02Q98.67 29.56 106.15 31.42Q113.63 33.28 119.77 35.61Q125.91 37.94 133.81 39.71Q141.71 41.48 148.47 43.47Q155.23 45.46 162.35 47.29Q169.48 49.12 177.55 50.6Q185.62 52.09 192.95 52.72Q200.27 53.35 208.31 55.01Q216.34 56.66 224.17 56.33L232 56 M8 16Q23.58 16.05 31.19 16.83Q38.79 17.6 46.72 18.67Q54.64 19.73 62.61 21.04Q70.57 22.35 76.96 24.06Q83.35 25.78 91.15 27.38Q98.95 28.98 105.32 31.8Q111.7 34.62 120.04 36.51Q128.39 38.4 134.59 39.91Q140.79 41.43 148.45 43.14Q156.11 44.85 162.8 47.3Q169.5 49.75 177.68 50.48Q185.87 51.21 192.69 52.84Q199.5 54.47 207.95 55.13Q216.4 55.8 224.2 55.9L232 56",
  // Tunnelled: straight, elbow, curved — two mouths x two passes each.
  "M8 24Q20.03 25.1 24.98 24.54Q29.93 23.99 35.97 24L42 24 M198 24Q208.9 24.87 214.54 24.91Q220.17 24.94 226.09 24.47L232 24 M8 24Q19.49 25.39 24.7 24.9Q29.9 24.42 35.95 24.21L42 24 M198 24Q209.59 23.24 215.69 23.64Q221.79 24.05 226.89 24.02L232 24",
  "M8 16Q19.22 17.1 25.05 16.46Q30.89 15.81 36.44 15.91L42 16 M198 56Q209.13 56.63 215.41 56.1Q221.68 55.56 226.84 55.78L232 56 M8 16Q18.65 16.98 24.84 16.72Q31.03 16.47 36.52 16.23L42 16 M198 56Q209.56 55.65 214.68 55.53Q219.8 55.41 225.9 55.7L232 56",
  "M8 16Q18.73 18.82 24.87 19.6Q31.02 20.39 36.24 21.18L41.47 21.98 M198.53 50.02Q210.25 52.25 215.82 53.36Q221.4 54.46 226.7 55.23L232 56 M8 16Q18.98 18.78 25.11 19.31Q31.23 19.84 36.35 20.91L41.47 21.98 M198.53 50.02Q209.3 51.73 214.65 53.07Q220 54.42 226 55.21L232 56",
] as const;

/**
 * The BoUNDARY's twin against the FROZEN golden strings above — the
 * byte-identity proof, kept alive after M1 deleted the core's half of the
 * comparison. See `GOLDEN_TRACE_D`'s own header for why these are literals
 * rather than a second live read.
 */
export const BoundaryMatchesCoreExactly: Story = {
  render: () => (
    <SketchAtEdge>
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

    const edge = boundaryTwins(canvasElement);
    expect(edge.length).toBe(TRACE_CASES.length * 2);

    // THE claim: byte-identical to what the core's own mechanism drew,
    // frozen the moment before this migration deleted it.
    for (let i = 0; i < edge.length; i++) {
      const got = edge[i].getAttribute("d");
      expect(got, `boundary twin ${i} differs from the frozen golden path`).toBe(GOLDEN_TRACE_D[i]);
    }

    // And the boundary's twins are non-trivial — not a copy of the crisp
    // path, which would pass the equality above only by coincidence.
    const crisp = [
      ...canvasElement.querySelectorAll<SVGPathElement>(
        'path[data-slot="trace-line"]:not([' + SKETCH_TWIN_ATTR + "])",
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
 * Three columns, one frame.
 *
 * WHY there are three, not the four this story used to render: it used to
 * put the CORE's own in-core mechanism (a middle "today" column) beside the
 * boundary's, specifically so their outputs could be diffed live in one
 * frame. Migration M1-M5b deleted that mechanism outright — there is no
 * "today" left to render — so that column is gone rather than left empty.
 * What replaces the live diff is `GOLDEN_TRACE_D` above: the core's last
 * output, captured before deletion, is the oracle these columns are
 * checked against instead.
 *
 * The two that remain make the SAME architectural claim
 * `BoundaryMatchesCoreExactly` makes for traces, extended to boxes and
 * Port rings: the core does not need to know a skin exists in order to be
 * drawn by hand.
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

      {/*
       * Column 2 is the REAL production configuration, and the distinction
       * matters: the skin ATTRIBUTE is still stamped here, because the
       * token half of a skin (no fill, the informal font, the radius, the
       * 2px stroke width) is edge-driven CSS and docs/peps/0001 keeps it
       * exactly as it is. What SketchAtEdge supplies is GEOMETRY: no
       * component in this subtree computes a wobble, and there is no
       * core-rendered outline left for the pass's CSS to suppress — the
       * elements it hides now are the crisp originals themselves.
       */}
      <Labelled title="2 · Boundary sketch (production configuration)">
        <SketchAtEdge>
          <div data-testid="col-boundary" {...bboxSkinAttrs("sketch")}>
            <TraceStage testid="boundary-traces" />
            <BoxStage testid="boundary-boxes" />
          </div>
        </SketchAtEdge>
      </Labelled>

      {/* And the independence claim on its own: geometry from the edge with
          NO skin attribute anywhere in the subtree. The core does not know a
          skin exists; it is simply being drawn over. */}
      <Labelled title="3 · Boundary geometry, core fully un-skinned">
        <SketchAtEdge>
          <div data-testid="col-naked">
            <TraceStage testid="naked-traces" />
            <BoxStage testid="naked-boxes" />
          </div>
        </SketchAtEdge>
      </Labelled>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const boundary = canvasElement.querySelector<HTMLElement>('[data-testid="col-boundary"]')!;

    await waitFor(() => {
      expect(boundaryTwins(boundary).length).toBe(TRACE_CASES.length);
    });

    // Paths: byte-identical to the frozen golden strings, not to a live
    // "today" column that no longer exists (see this story's own WHY).
    // Only the first TRACE_CASES.length golden entries apply — this
    // column's TraceStage renders untunnelled only (no `tunnel` prop),
    // unlike BoundaryMatchesCoreExactly's two stages.
    const b = boundaryTwins(boundary).map((p) => p.getAttribute("d"));
    expect(b).toEqual(GOLDEN_TRACE_D.slice(0, TRACE_CASES.length));

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

    // Port rings: the boundary derives the ring's centre-line from the
    // element's own published data-bbox-ring-expand/-pen (port.tsx, M4) —
    // GAP*2 + RING*3 and RING — the SAME formula docs/peps/0001-sketch-
    // skin-at-the-boundary.md verified against the (now-deleted) core
    // mechanism. Every `BoxStage` Port is the DEFAULT diameter, so every
    // dot in this story shares one answer.
    // 2026-09-19 (lane `ports`): the default is now the v1 variant
    // (src/skin/portVariants.ts) — a 6px box with a 1px gap and a 1.5px
    // ring — so expand = 1*2 + 1.5*3 = 6.5 and the twin's viewBox is
    // 6 + 6.5 = "0 0 12.5 12.5" with pen "1.5". Was "0 0 25 25"/"3" for the
    // old 12px `md` box with 2/3 rings (expand 13). Same derivation, same
    // attributes, new default size — read from the registry that now owns
    // the painted rings (`PORT_SURFACE_RING_PX`/`PORT_STATE_RING_PX` are the
    // reserved allowance since this change, not the paint).
    const v1 = PORT_VARIANTS.v1;
    const expected = portVariantRingExpansion(v1);
    const expectedSize = v1.dot.diameter + expected.expand;
    const dotGeom = [...boundary.querySelectorAll('[data-slot="port-dot"]')].map((el) => {
      const svg = el.querySelector<SVGSVGElement>(`svg[${SKETCH_TWIN_ATTR}="box"]`);
      return {
        vb: svg?.getAttribute("viewBox"),
        pen: svg?.querySelector("path")?.getAttribute("stroke-width"),
      };
    });
    expect(dotGeom.length).toBeGreaterThan(0);
    for (const g of dotGeom) {
      expect(g.vb).toBe(`0 0 ${expectedSize} ${expectedSize}`);
      expect(g.pen).toBe(String(expected.pen));
    }

    // Column 3 is the independence claim, asserted: drawn geometry present,
    // and no skin attribute anywhere above it in that subtree. This is the
    // one that says the core does not need to know a skin exists.
    const naked = canvasElement.querySelector<HTMLElement>('[data-testid="col-naked"]')!;
    await waitFor(() => {
      expect(boundaryTwins(naked).length).toBe(TRACE_CASES.length);
    });
    expect(naked.closest("[data-bbox-skin]")).toBeNull();
    expect(naked.querySelector("[data-bbox-skin]")).toBeNull();
    // Same geometry as the skinned column — the tokens change the paint,
    // never the path.
    expect(boundaryTwins(naked).map((p) => p.getAttribute("d"))).toEqual(b);

    // The crisp column is genuinely crisp: no drawn geometry at all.
    const crispCol = canvasElement.querySelector<HTMLElement>('[data-testid="col-crisp"]')!;
    expect(boundaryTwins(crispCol).length).toBe(0);
  },
};

/* ------------------------------------------------------------------ */
/* 3. Measured, not nominal — what the boundary FIXES                  */
/* ------------------------------------------------------------------ */

/**
 * The boundary is not merely as good as the in-core version; for
 * content-sized elements it was strictly better, and that was measured
 * before the in-core version existed to compare against.
 *
 * WHY there is only one column now, where this story used to render two:
 * the "in-core: nominal + preserveAspectRatio='none'" column rendered
 * `badge.tsx`'s and `block.tsx`'s OWN drawn outline — code migration M3/M2
 * deleted. Recreating that DOM here would mean un-deleting the defect this
 * whole migration exists to remove, just to have something to diff
 * against, which defeats the point more than it proves it.
 *
 * The comparison is preserved as a MEASUREMENT instead, taken before
 * deletion and recorded in docs/peps/0001-sketch-skin-at-the-boundary.md:
 * the core could not self-measure, so `badge.tsx` drew every chip's
 * outline at a nominal 40x20 viewBox with `preserveAspectRatio="none"`,
 * regardless of the chip's real width. Two `Badge`s in one row —
 * 41.7px and 121.2px wide — both got that same 40-wide viewBox, giving
 * x-scales of 1.04 and 3.03 against a y-scale of 1.10 either way: the
 * wider chip's "hand-drawn" wobble was stretched 2.75x more horizontally
 * than vertically, a real distortion no eye would call hand-drawn. A
 * boundary pass runs after layout, where `getBoundingClientRect()` is
 * ordinary, and draws every shape's viewBox equal to its own real box —
 * scale exactly 1:1, asserted below.
 */
export const MeasuredNotNominal: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-start" }}>
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
    const measured = canvasElement.querySelector<HTMLElement>('[data-testid="measured"]')!;

    await waitFor(() => {
      expect(measured.querySelectorAll(`svg[${SKETCH_TWIN_ATTR}="box"]`).length).toBeGreaterThan(0);
    });

    // The two Badges here are genuinely different real widths — the SAME
    // fixture the deleted in-core mechanism would have stretched a shared
    // 40-wide viewBox across (see this story's own WHY).
    const badgeBoxes = [...measured.querySelectorAll('[data-slot="badge"]')].map(
      (el) => el.getBoundingClientRect().width,
    );
    expect(badgeBoxes.length).toBe(2);
    expect(badgeBoxes[1]).toBeGreaterThan(badgeBoxes[0] + 20);

    // --- REGRESSION GUARD: the twin's RENDERED box, not just its attrs ---
    // A boundary-injected node lives in the host's cascade. A `Badge`
    // carries shadcn's `[&>svg]:size-3` (for icons inside a chip), which
    // beats an SVG's width/height ATTRIBUTES and silently collapsed this
    // outline to 12x12 — declared 121.2x22, rendered 12x12, capsule gone.
    // Attributes alone would have asserted green through that, so this
    // measures `getBoundingClientRect` on the twin itself.
    for (const el of measured.querySelectorAll('[data-slot="badge"]')) {
      const twin = el.querySelector<SVGSVGElement>(`svg[${SKETCH_TWIN_ATTR}="box"]`)!;
      const want = el.getBoundingClientRect();
      const got = twin.getBoundingClientRect();
      expect(got.width, "twin collapsed — host CSS beat the width attribute").toBeCloseTo(
        want.width,
        0,
      );
      expect(got.height).toBeCloseTo(want.height, 0);
    }

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
