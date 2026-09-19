import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Button } from "../components/button";
import { Trace, TraceBody } from "../components/trace";
import {
  ASYNC_CARRIER_PX,
  asyncDashOffsetForLength,
  polylineLength,
  polylinePath,
  type Point,
} from "../components/trace.layout";
import { TraceTerminal } from "../components/traceTerminal";
import {
  CROSSING_CASING_WIDTH,
  DEFAULT_CROSSING_MARK,
  type CrossingMark,
} from "../components/trace.crossing";
import {
  TUNNEL_STUB_LENGTH,
  tunnelDisplayState,
  type TunnelDisplayState,
} from "../components/tunnel";
import { SketchAtEdge } from "../skin/SketchAtEdge";
import { SKETCH_TWIN_ATTR } from "../skin/sketchAtEdge";
import type { BlockScene } from "../scene/scene";
import { canonicalSceneLayer, edgeLayer, edgeTunnels, sceneLayers, type SceneLayerData } from "../scene/layers";

/* ------------------------------------------------------------------ *
 * Fixtures — one long horizontal cable, long enough to have a middle
 * worth hiding (TUNNEL_MIN_PATH_LENGTH is 84; these are ~400).
 * ------------------------------------------------------------------ */

const ROW_W = 460;
const ROW_H = 56;
const MID_Y = ROW_H / 2;
const FROM_X = 26;
const TO_X = ROW_W - 26;
const LINE_GAP = 16;

const FROM: Point = { x: FROM_X + LINE_GAP, y: MID_Y };
const TO: Point = { x: TO_X - LINE_GAP, y: MID_Y };
const LINE: Point[] = [FROM, TO];
const LINE_PATH = polylinePath(LINE);
const ROUTE_LENGTH = polylineLength(LINE);

/* ------------------------------------------------------------------ *
 * DOM helpers — every spatial claim below is MEASURED off the mounted
 * element, never read back off a prop.
 * ------------------------------------------------------------------ */

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** Every path command letter in a `d`, however many coordinate pairs each
 * carries. Counts the WHOLE alphabet on purpose — a count restricted to one
 * letter can be invariant while the geometry changes underneath it. */
function commandCount(d: string): number {
  return (d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? []).length;
}

/** Subpaths, i.e. tunnel mouths: one per move-to. */
function subpaths(d: string): string[] {
  return d.split(/(?=[Mm])/).map((part) => part.trim()).filter(Boolean);
}

function firstPoint(d: string): Point {
  const m = /[Mm]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/.exec(d);
  if (!m) throw new Error(`no move-to in ${d}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

function lastPoint(d: string): Point {
  const nums = d.match(/-?[\d.]+/g);
  if (!nums || nums.length < 2) throw new Error(`no coordinates in ${d}`);
  return { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) };
}

const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

function Row({
  label,
  note,
  testid,
  children,
  width = ROW_W,
  height = ROW_H,
  skin,
  background,
}: {
  label: string;
  note?: string;
  testid: string;
  children: React.ReactNode;
  width?: number;
  height?: number;
  skin?: "sketch";
  background?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ font: "500 12px/1.3 ui-sans-serif, system-ui", color: "var(--foreground)" }}>{label}</div>
      <div
        data-bbox-skin={skin}
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          // The casing IS the canvas colour; a host that paints its own
          // surface says so with this one variable rather than threading a
          // colour prop through the component (trace.crossing.ts).
          ["--bbox-canvas" as string]: background ?? "var(--background)",
          background: background ?? "var(--background)",
        }}
      >
        <svg data-testid={testid} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
          {children}
        </svg>
      </div>
      {note ? (
        <div style={{ font: "400 11px/1.4 ui-sans-serif, system-ui", color: "var(--muted-foreground)" }}>{note}</div>
      ) : null}
    </div>
  );
}

function StraightTunnel({ state, id }: { state: TunnelDisplayState; id: string }) {
  return (
    <>
      <TraceBody id={id} path={LINE_PATH} points={LINE} tunnel={state} />
      <TraceTerminal x={FROM_X} y={MID_Y} dir="right" />
      <TraceTerminal x={TO_X} y={MID_Y} dir="right" />
    </>
  );
}

const meta = {
  title: "Trace/Tunnel & Halo",
  tags: ["area:trace", "lane:baseline"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ================================================================== *
 * U1 + U2 — the four display states, and the measured short path
 * ================================================================== */

const STATE_NOTES: Record<TunnelDisplayState, string> = {
  off: "An ordinary cable. Nothing is hidden; no mouths are marked.",
  hidden: "Idle. The long run has left the surface — two 34px stubs and two vias remain.",
  preview: "Hover or selection. The whole route is back, and the mouths stay marked.",
  revealed: "Its layer is focused. The whole route, and no mouths at all.",
};

export const DisplayStates: Story = {
  name: "Four display states",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 520 }}>
      {(["off", "hidden", "preview", "revealed"] as TunnelDisplayState[]).map((state) => (
        <Row key={state} label={state} note={STATE_NOTES[state]} testid={`state-${state}`}>
          <StraightTunnel state={state} id={`tunnel-${state}`} />
        </Row>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const drawn: Record<string, string> = {};

    for (const state of ["off", "hidden", "preview", "revealed"] as TunnelDisplayState[]) {
      const cell = requireEl(canvasElement, `[data-testid="state-${state}"]`);
      const group = requireEl(cell, '[data-slot="trace"]');
      await expect(group.getAttribute("data-tunnel")).toBe(state);

      const line = requireEl<SVGPathElement>(cell, '[data-slot="trace-line"]');
      drawn[state] = line.getAttribute("d")!;

      // Vias: `hidden` and `preview` mark their mouths; `off` and
      // `revealed` have none. Asserted BOTH ways so a change in either
      // direction is caught.
      const vias = cell.querySelectorAll('[data-slot="trace-vias"] circle');
      await expect(vias.length).toBe(state === "hidden" || state === "preview" ? 2 : 0);
    }

    /* ---- U2: the DRAWN path of a tunnelled cable is shorter ---- */
    const hiddenCell = requireEl(canvasElement, '[data-testid="state-hidden"]');
    const hiddenLine = requireEl<SVGPathElement>(hiddenCell, '[data-slot="trace-line"]');
    const offCell = requireEl(canvasElement, '[data-testid="state-off"]');
    const offLine = requireEl<SVGPathElement>(offCell, '[data-slot="trace-line"]');

    // Measured off the browser's own path geometry, not off a prop and not
    // off the string. This is the load-bearing claim of the whole feature.
    const hiddenLength = hiddenLine.getTotalLength();
    const offLength = offLine.getTotalLength();
    await expect(offLength).toBeGreaterThan(hiddenLength);
    await expect(near(offLength, ROUTE_LENGTH)).toBe(true);
    await expect(near(hiddenLength, TUNNEL_STUB_LENGTH * 2)).toBe(true);

    // Both mouths present — as structure, not as a count of one letter.
    const mouths = subpaths(drawn.hidden);
    await expect(mouths.length).toBe(2);
    await expect(subpaths(drawn.off).length).toBe(1);

    // TOTAL commands, not one type: the tunnel turns one run into two, so
    // the count moves — and it moves in a direction a bug cannot fake,
    // because the endpoints below pin WHICH two runs they are.
    await expect(commandCount(drawn.hidden)).toBeGreaterThan(commandCount(drawn.off));

    // The mouths are still attached to the real ports. A short path that
    // floated free of its endpoints would pass every length check above.
    const startPoint = firstPoint(mouths[0]);
    const endPoint = lastPoint(mouths[1]);
    await expect(near(startPoint.x, FROM.x)).toBe(true);
    await expect(near(startPoint.y, FROM.y)).toBe(true);
    await expect(near(endPoint.x, TO.x)).toBe(true);
    await expect(near(endPoint.y, TO.y)).toBe(true);

    // `preview` and `revealed` draw the full route — a preview that
    // shortened the path would be indistinguishable from `hidden`.
    await expect(drawn.preview).toBe(drawn.off);
    await expect(drawn.revealed).toBe(drawn.off);
  },
};

/* ================================================================== *
 * U3 — layer focus
 * ================================================================== */

type LayerScene = BlockScene<Record<string, unknown>, SceneLayerData>;

const LAYER_SCENE: LayerScene = {
  nodes: [],
  edges: [
    { id: "e-control", source: "a", target: "b", data: { layer: "Control", tunnel: true } },
    { id: "e-diag", source: "a", target: "b", data: { layer: "Diagnostics", tunnel: true } },
    { id: "e-plain", source: "a", target: "b", data: {} },
  ],
};

const EDGE_LABEL: Record<string, string> = {
  "e-control": "on Control (tunnel)",
  "e-diag": "on Diagnostics (tunnel)",
  "e-plain": "no layer, not a tunnel",
};

function LayerBoard() {
  const [focusedLayer, setFocusedLayer] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const layers = useMemo(() => sceneLayers(LAYER_SCENE), []);

  // The donor's focus TOGGLE, preserved: clicking the focused layer clears
  // focus, which is what makes the picker feel like a filter and not a mode
  // (tunnelLayers.ts:23-26 — the atom set that compares before writing).
  const focus = (layer: string) =>
    setFocusedLayer((current) => {
      const next = canonicalSceneLayer(LAYER_SCENE, layer);
      return current === next ? null : next;
    });

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ font: "500 12px/1.3 ui-sans-serif, system-ui" }}>Focus layer</span>
        {layers.map((layer) => (
          <Button
            key={layer}
            data-testid={`focus-${layer}`}
            data-active={focusedLayer === layer || undefined}
            variant={focusedLayer === layer ? "default" : "outline"}
            size="sm"
            onClick={() => focus(layer)}
          >
            {layer}
          </Button>
        ))}
        <span data-testid="focused-readout" style={{ font: "400 11px/1.4 ui-sans-serif, system-ui", color: "var(--muted-foreground)" }}>
          focused: {focusedLayer ?? "none"}
        </span>
      </div>

      {LAYER_SCENE.edges.map((edge) => {
        const state = tunnelDisplayState({
          enabled: edgeTunnels(edge),
          layer: edgeLayer(edge) ?? "",
          focusedLayer,
          contextFocused: hovered === edge.id,
        });
        return (
          <div
            key={edge.id}
            onPointerEnter={() => setHovered(edge.id)}
            onPointerLeave={() => setHovered(null)}
          >
            <Row label={`${edge.id} — ${EDGE_LABEL[edge.id]} → ${state}`} testid={`layer-${edge.id}`}>
              <StraightTunnel state={state} id={edge.id} />
            </Row>
          </div>
        );
      })}
    </div>
  );
}

export const LayerFocus: Story = {
  name: "Layer focus reveals one, tunnels the rest",
  render: () => <LayerBoard />,
  play: async ({ canvasElement }) => {
    const stateOf = (edgeId: string) =>
      requireEl(canvasElement, `[data-testid="layer-${edgeId}"] [data-slot="trace"]`).getAttribute("data-tunnel");

    // Derived, not authored: the picker only offers layers the scene's own
    // edges name.
    const buttons = [...canvasElement.querySelectorAll('[data-testid^="focus-"]')].map(
      (b) => b.getAttribute("data-testid"),
    );
    await expect(buttons).toEqual(["focus-Control", "focus-Diagnostics"]);

    // Nothing focused: both configured tunnels are idle, the plain edge is off.
    await expect(stateOf("e-control")).toBe("hidden");
    await expect(stateOf("e-diag")).toBe("hidden");
    await expect(stateOf("e-plain")).toBe("off");

    /* ---- U3: focus Control ---- */
    await userEvent.click(requireEl(canvasElement, '[data-testid="focus-Control"]'));
    await expect(stateOf("e-control")).toBe("revealed");
    await expect(stateOf("e-diag")).toBe("hidden");
    // The headline behaviour: focus tunnels an edge that was never
    // configured as a tunnel at all.
    await expect(stateOf("e-plain")).toBe("hidden");

    // And it is genuinely a different picture, not just a different
    // attribute — the revealed edge draws its whole route, the hidden one
    // does not.
    const revealed = requireEl<SVGPathElement>(canvasElement, '[data-testid="layer-e-control"] [data-slot="trace-line"]');
    const tunnelled = requireEl<SVGPathElement>(canvasElement, '[data-testid="layer-e-diag"] [data-slot="trace-line"]');
    await expect(near(revealed.getTotalLength(), ROUTE_LENGTH)).toBe(true);
    await expect(near(tunnelled.getTotalLength(), TUNNEL_STUB_LENGTH * 2)).toBe(true);

    /* ---- the other way round ---- */
    await userEvent.click(requireEl(canvasElement, '[data-testid="focus-Diagnostics"]'));
    await expect(stateOf("e-control")).toBe("hidden");
    await expect(stateOf("e-diag")).toBe("revealed");

    /* ---- the donor's toggle: clicking the focused layer clears it ---- */
    await userEvent.click(requireEl(canvasElement, '[data-testid="focus-Diagnostics"]'));
    await expect(requireEl(canvasElement, '[data-testid="focused-readout"]').textContent).toContain("none");
    await expect(stateOf("e-plain")).toBe("off");
  },
};

/* ================================================================== *
 * U4 — the halo, on cables that genuinely cross
 * ================================================================== */

const X_W = 460;
const X_H = 180;
/** Two cables that really cross, near the middle of both — far from either
 * port, which is exactly the region the casing's 34px lead-in reserves. */
const CROSS_A: Point[] = [{ x: 30, y: 30 }, { x: 430, y: 150 }];
const CROSS_B: Point[] = [{ x: 30, y: 150 }, { x: 430, y: 30 }];

function CrossingPair({ crossing, idPrefix }: { crossing: CrossingMark; idPrefix: string }) {
  return (
    <>
      {/* Paint order IS the algorithm: B is emitted second, so B's casing
          lies across A and B reads as passing over it. */}
      <TraceBody
        id={`${idPrefix}-a`}
        data-cable="a"
        path={polylinePath(CROSS_A)}
        points={CROSS_A}
        crossing={crossing}
        strokeWidth={3}
        color="var(--muted-foreground)"
        markerEnd="none"
      />
      <TraceBody
        id={`${idPrefix}-b`}
        data-cable="b"
        path={polylinePath(CROSS_B)}
        points={CROSS_B}
        crossing={crossing}
        strokeWidth={3}
        color="var(--primary)"
        markerEnd="none"
      />
    </>
  );
}

export const CrossingHalo: Story = {
  name: "Background halo — before / after",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 520 }}>
      <Row
        label={`crossing="none" — before`}
        note="Two cables cross. Which one is in front? Nothing says."
        testid="halo-off"
        width={X_W}
        height={X_H}
      >
        <CrossingPair crossing="none" idPrefix="off" />
      </Row>
      <Row
        label={`crossing="${DEFAULT_CROSSING_MARK}" — after`}
        note="The later cable lays an 11px canvas-coloured casing across the earlier one. No intersection is computed anywhere; paint order answers it."
        testid="halo-on"
        width={X_W}
        height={X_H}
      >
        <CrossingPair crossing="halo" idPrefix="on" />
      </Row>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const off = requireEl(canvasElement, '[data-testid="halo-off"]');
    const on = requireEl(canvasElement, '[data-testid="halo-on"]');

    /* ---- the casing exists only where asked for ---- */
    await expect(off.querySelectorAll('[data-slot="trace-casing"]').length).toBe(0);
    await expect(on.querySelectorAll('[data-slot="trace-casing"]').length).toBe(2);
    await expect(
      requireEl(on, '[data-slot="trace"]').getAttribute("data-crossing"),
    ).toBe("halo");

    /* ---- U4a: it renders BEHIND the cable ---- */
    for (const cable of ["a", "b"]) {
      const group = requireEl(on, `[data-cable="${cable}"]`);
      const casing = requireEl<SVGPathElement>(group, '[data-slot="trace-casing"]');
      const line = requireEl<SVGPathElement>(group, '[data-slot="trace-line"]');
      // DOCUMENT_POSITION_FOLLOWING === 4: the line comes after the casing,
      // so the casing paints under it. SVG has no z-index; this IS the
      // z-order.
      // eslint-disable-next-line no-bitwise
      await expect(casing.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await expect(Number(casing.getAttribute("stroke-width"))).toBe(CROSSING_CASING_WIDTH);
      // Wider than the cable it protects, or it protects nothing.
      await expect(Number(casing.getAttribute("stroke-width"))).toBeGreaterThan(
        Number(line.getAttribute("stroke-width")),
      );
    }

    /* ---- U4b: it does not MOVE the cable — geometry identical ±1px ---- */
    for (const cable of ["a", "b"]) {
      const before = requireEl<SVGPathElement>(off, `[data-cable="${cable}"] [data-slot="trace-line"]`);
      const after = requireEl<SVGPathElement>(on, `[data-cable="${cable}"] [data-slot="trace-line"]`);
      await expect(after.getAttribute("d")).toBe(before.getAttribute("d"));
      await expect(near(after.getTotalLength(), before.getTotalLength())).toBe(true);
      const beforeBox = before.getBBox();
      const afterBox = after.getBBox();
      await expect(near(afterBox.x, beforeBox.x)).toBe(true);
      await expect(near(afterBox.y, beforeBox.y)).toBe(true);
      await expect(near(afterBox.width, beforeBox.width)).toBe(true);
      await expect(near(afterBox.height, beforeBox.height)).toBe(true);
    }

    /* ---- the casing follows the cable, bare at both ports ---- */
    const casingA = requireEl<SVGPathElement>(on, '[data-cable="a"] [data-slot="trace-casing"]');
    const lineA = requireEl<SVGPathElement>(on, '[data-cable="a"] [data-slot="trace-line"]');
    await expect(casingA.getAttribute("d")).toBe(lineA.getAttribute("d"));
    const dash = casingA.getAttribute("stroke-dasharray")!.split(/[\s,]+/).map(Number);
    await expect(dash[0]).toBe(0);
    await expect(dash[1]).toBe(34);
    await expect(dash[3]).toBe(34);
    await expect(near(dash[1] + dash[2] + dash[3], lineA.getTotalLength())).toBe(true);
  },
};

/* ================================================================== *
 * U5 — tunnel composes with the sketch skin
 * ================================================================== */

export const SketchedTunnel: Story = {
  name: "Tunnel under the sketch skin",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 520 }}>
      <Row label="default skin, tunnelled" testid="skin-default" >
        <StraightTunnel state="hidden" id="skin-default" />
      </Row>
      {/* WHY wrapped in <SketchAtEdge>, not `skin="sketch"` alone
          (docs/peps/0001-sketch-skin-at-the-boundary.md): the token half of
          a skin (fill, radius, stroke width) is still CSS, resolved off the
          `data-bbox-skin="sketch"` attribute `Row` sets below — but the
          GEOMETRY (the hand-drawn twin this test reads) is no longer
          computed inside `trace.tsx`. It comes from this boundary pass
          reading the crisp DOM back after layout, which is exactly the
          "U5: tunnel composes with the sketch skin" claim this story makes,
          now proven the way the ruling requires. */}
      <SketchAtEdge>
        <Row
          label="sketch skin, tunnelled"
          note="Both properties on one element: each mouth is its own hand-drawn run, and the long middle is still gone."
          testid="skin-sketch"
          skin="sketch"
        >
          <StraightTunnel state="hidden" id="skin-sketch" />
        </Row>
      </SketchAtEdge>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cell = requireEl(canvasElement, '[data-testid="skin-sketch"]');
    // The pass runs in a layout effect; wait for its twin rather than
    // assuming a frame has already elapsed. WHY the twin carries no
    // `data-slot` (only `${SKETCH_TWIN_ATTR}`): `copyPresentation` in
    // sketchAtEdge.ts copies PAINT attributes only, deliberately excluding
    // `data-slot` — the twin is not a second `"trace-line"`, it is a drawn
    // decoration adjacent to one.
    await waitFor(() => {
      expect(cell.querySelectorAll(`[${SKETCH_TWIN_ATTR}]`).length).toBeGreaterThan(0);
    });
    // The ONE element that carries both claims: the drawn twin, which is
    // the path the sketch skin actually shows.
    const sketched = requireEl<SVGPathElement>(cell, `[${SKETCH_TWIN_ATTR}]`);
    const crisp = requireEl<SVGPathElement>(cell, `[data-slot="trace-line"]:not([${SKETCH_TWIN_ATTR}])`);

    // It is the visible one under this skin — otherwise "it is sketched"
    // would be a claim about an invisible element.
    await expect(getComputedStyle(sketched).display).not.toBe("none");
    await expect(getComputedStyle(crisp).display).toBe("none");

    const d = sketched.getAttribute("d")!;

    /* ---- sketched: curve commands the crisp two-point run cannot have ---- */
    await expect(/[QqCc]/.test(d)).toBe(true);
    await expect(/[QqCc]/.test(crisp.getAttribute("d")!)).toBe(false);
    await expect(commandCount(d)).toBeGreaterThan(commandCount(crisp.getAttribute("d")!));

    /* ---- tunnelled: still two mouths, still shorter than the route ---- */
    // The skin draws each run TWICE (two passes is what reads as a pen
    // going round twice), so 2 mouths x 2 passes = 4 subpaths.
    await expect(subpaths(d).length).toBe(4);
    await expect(sketched.getTotalLength()).toBeLessThan(ROUTE_LENGTH * 2);
    // Two passes over two 34px stubs, plus the wobble's small detour.
    await expect(sketched.getTotalLength()).toBeGreaterThan(TUNNEL_STUB_LENGTH * 3);

    // And the endpoints are still the real ports: `sketchPathData` protects
    // index 0 and index n-1 of every run from jitter precisely so a Trace
    // cannot wander off its terminals.
    const runs = subpaths(d);
    await expect(near(firstPoint(runs[0]).x, FROM.x)).toBe(true);
    await expect(near(lastPoint(runs[1]).x, TO.x)).toBe(true);
  },
};

/* ================================================================== *
 * Composition — tunnel + halo + variant, on the routed `Trace` wrapper
 * ================================================================== */

export const ComposesWithVariants: Story = {
  name: "Composes with variants and curved routing",
  render: () => (
    <div style={{ display: "grid", gap: 20, maxWidth: 520 }}>
      <Row label="async, not tunnelled — the reference" testid="compose-async-off">
        <TraceBody id="compose-async-off" path={LINE_PATH} points={LINE} variant="async" tunnel="off" />
        <TraceTerminal x={FROM_X} y={MID_Y} dir="right" />
        <TraceTerminal x={TO_X} y={MID_Y} dir="right" />
      </Row>
      <Row
        label="async + tunnelled"
        note="Each 34px mouth still carries its packet mark. A stub is shorter than one 74px async cadence, so the dash PHASE is taken from the drawn length — the same short-run centring the variant already had. Borrow stroke-dasharray for the tunnel, as both donors do, and this row is indistinguishable from plain data."
        testid="compose-async"
      >
        <TraceBody id="compose-async" path={LINE_PATH} points={LINE} variant="async" tunnel="hidden" />
        <TraceTerminal x={FROM_X} y={MID_Y} dir="right" />
        <TraceTerminal x={TO_X} y={MID_Y} dir="right" />
      </Row>
      <Row label="curved + tunnelled" note="A curve has no vertices until the browser has one; Trace samples them and the mouths follow the real arc." testid="compose-curved" height={140}>
        <Trace
          id="compose-curved"
          from={{ x: 40, y: 34, dir: "right" }}
          to={{ x: 420, y: 106, dir: "right" }}
          routing="curved"
          tunnel="hidden"
        />
      </Row>
    </div>
  ),
  play: async ({ canvasElement }) => {
    /* ---- the variant's dash survives the tunnel ---- */
    const asyncCell = requireEl(canvasElement, '[data-testid="compose-async"]');
    const asyncLine = requireEl<SVGPathElement>(asyncCell, '[data-slot="trace-line"]');
    const dash = asyncLine.getAttribute("stroke-dasharray");
    await expect(dash).toBeTruthy();
    // Not the tunnel's `stub hidden stub 0` — the async cadence. Both
    // donors lose this: pyblocks' renderer is a ternary that drops the
    // variant dash whenever a tunnel is on.
    await expect(dash).not.toContain(`${TUNNEL_STUB_LENGTH} `);
    await expect(subpaths(asyncLine.getAttribute("d")!).length).toBe(2);
    await expect(near(asyncLine.getTotalLength(), TUNNEL_STUB_LENGTH * 2)).toBe(true);

    // The dash being PRESENT is not the same as the dash being VISIBLE, and
    // the difference is what a capture caught and this assertion did not,
    // first time round: an async cadence is 74px and a mouth is 34px, so
    // phased off the full route BOTH stubs land inside the 56px carrier and
    // the cable renders solid — correct attribute, wrong picture. The phase
    // must be taken from one mouth.
    const offCell = requireEl(canvasElement, '[data-testid="compose-async-off"]');
    const offLine = requireEl<SVGPathElement>(offCell, '[data-slot="trace-line"]');
    await expect(offLine.getAttribute("stroke-dasharray")).toBe(dash);
    const tunnelledOffset = Number(asyncLine.getAttribute("stroke-dashoffset") ?? 0);
    const plainOffset = Number(offLine.getAttribute("stroke-dashoffset") ?? 0);
    await expect(plainOffset).toBe(0);
    await expect(tunnelledOffset).toBe(asyncDashOffsetForLength(TUNNEL_STUB_LENGTH));
    // A phase that puts a gap inside the stub is the whole claim: the mark
    // has to START before the stub ends, or nothing but carrier is drawn.
    await expect(ASYNC_CARRIER_PX - tunnelledOffset).toBeLessThan(TUNNEL_STUB_LENGTH);

    /* ---- a curved route tunnels too, after its measuring pass ---- */
    const curvedCell = requireEl(canvasElement, '[data-testid="compose-curved"]');
    const curvedLine = requireEl<SVGPathElement>(curvedCell, '[data-slot="trace-line"]');
    await expect(subpaths(curvedLine.getAttribute("d")!).length).toBe(2);
    // Sampled off a real cubic, so the mouths are chords of the arc: a
    // little under a stub each, never over.
    await expect(curvedLine.getTotalLength()).toBeLessThanOrEqual(TUNNEL_STUB_LENGTH * 2 + 1);
    await expect(curvedLine.getTotalLength()).toBeGreaterThan(TUNNEL_STUB_LENGTH);
    await expect(requireEl(curvedCell, '[data-slot="trace"]').getAttribute("data-tunnel")).toBe("hidden");
  },
};
