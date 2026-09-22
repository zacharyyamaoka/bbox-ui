import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  classifyBoundary,
  crossingGeometryPolicy,
  DAG_HEURISTIC_LIMIT,
  type BoundaryClass,
  type PromotedPort,
} from "./boundary";
import { collapseToRegion, dissolveRegion, type CollapseSuccess } from "./collapse";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import type { SceneEdge } from "./scene";
import { DomCanvas } from "../hosts/domCanvas";
import type { HostNodeData, HostScene } from "../hosts/hostScene";
import type { BlockSide } from "../components/port.layout";
import type { WireStyleData } from "./sceneWires";

/**
 * Scene/Grouping — `collapseToRegion`/`dissolveRegion` (collapse.ts),
 * `classifyBoundary`/`promoteBoundary` (boundary.ts) and the v1-vs-measured
 * promotion policies, DRAWN.
 *
 * WHY this file imports components (through `DomCanvas`) when its previous
 * version deliberately imported none: Zach, 2026-09-21 — "a lot of those
 * tests basically operate on the model and the model we can visualize using
 * the components." A scene story IS a host: it may read the scene kit and
 * render it with the component kit, which is exactly the direction the
 * dependency DAG allows (`editor`/host-side code imports both; `components`
 * still imports no scene — that wall is untouched here). The rule the old
 * header stated ("this file imports NO component") was a WRITE-SET fence
 * from the lane that wrote it — `src/components/**` was being edited by a
 * concurrent lane at the time — not an architectural rule, and keeping it
 * left four stories whose entire subject is geometry rendered as tables of
 * strings.
 *
 * What changed, story by story:
 *   1. RoundTrip       — three real benches, not three tables of positions.
 *   2. BoundaryClasses — every cable INKED by its class, on the board.
 *   3. PromotedPorts   — the region's dots on its real walls, not an SVG
 *                        hand-drawing of where they would go.
 *   4. V1LimitFeedbackEdge — the same collapse under both policies, side by
 *                        side, so the disputed port visibly changes wall.
 *
 * The GRAPH below — every node id, every edge id and both its ends — is
 * still copied verbatim from `collapse.test.ts`, so the scene on screen is
 * the scene the unit tests already proved round-trips. What this file adds
 * is the VIEW data that test has none of (which wall each port sits on,
 * how big a block is) plus one placement change: the exterior pair sits at
 * y=430 rather than y=600, because 600px of empty board between the graph
 * and its own control makes the picture unreadable and no assertion, here
 * or in that test, reads those two coordinates.
 */

const meta = {
  title: "Scene/Grouping",
  tags: ["object:scene", "host:dom", "lane:grouping"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Story chrome                                                        */
/* ------------------------------------------------------------------ */

function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        background: "var(--card)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontWeight: 600, fontSize: 12 }}>{title}</div>
      {note && <div style={{ fontFamily: "ui-sans-serif, sans-serif", color: "var(--muted-foreground)", maxWidth: 680 }}>{note}</div>}
      {children}
    </div>
  );
}

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Fixture — the graph verbatim from collapse.test.ts, dressed for a    */
/* host (walls, sizes) the way every other bench in this repo does      */
/* ------------------------------------------------------------------ */

/**
 *   src ──e1──► [ a ──e2──► b ──e3──► c ]                  (selection)
 *                          └──e4──────────────► sink
 *   other ──e5──► other2                                   (exterior)
 *
 * e1 inbound, e2/e3 interior, e4 outbound, e5 exterior.
 */
function block(
  id: string,
  name: string,
  x: number,
  y: number,
  ports: Partial<Record<BlockSide, string[]>>,
  size: { w: number; h: number } = { w: 100, h: 62 },
): HostScene["nodes"][number] {
  return { id, type: "block", position: { x, y }, data: { name, view: "port", w: size.w, h: size.h, ports } };
}

function fixture(): HostScene {
  return {
    nodes: [
      block("src", "Source", 0, 100, { right: ["out"] }),
      block("a", "A", 200, 40, { left: ["in"], right: ["out"] }),
      block("b", "B", 340, 120, { left: ["in"], right: ["out"] }),
      block("c", "C", 300, 260, { left: ["in"] }),
      block("sink", "Sink", 600, 120, { left: ["in"] }),
      block("other", "Other", 0, 430, { right: ["out"] }),
      block("other2", "Other2", 200, 430, { left: ["in"] }),
    ],
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in", data: {} },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

const SELECTION = ["a", "b", "c"];

const BENCH = { width: 740, height: 520 } as const;

/** Every `out` port emits, every `in` port receives. `lint.ts`'s own
 *  `source`/`sink` vocabulary, not a third spelling. */
const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);

const typeOf: PortTypeOf = ({ portId }) => (portId === "out" || portId === "in" ? ["pose"] : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

/** A container's box, for a geometry policy — copied from the same
 *  describe block in collapse.test.ts. */
const BOXES: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 200, y: 40, w: 120, h: 60 },
  b: { x: 340, y: 120, w: 120, h: 60 },
  c: { x: 300, y: 260, w: 120, h: 60 },
};

/* ------------------------------------------------------------------ */
/* The one host adaptation a collapse needs                             */
/* ------------------------------------------------------------------ */

/**
 * `collapseToRegion` returns the container's ports as DATA (`PromotedPort[]`
 * — which wall, which polarity, which inner endpoint). It does not write
 * them onto the node, and it should not: the scene names ports, the HOST
 * places them (ARCHITECTURE.md's measurement rule, applied to walls). This
 * is that placement, and it is the whole adapter — eight lines, no
 * region-specific rendering anywhere, because `RegionNodeView` already
 * builds a region's card from `data.ports` with the identical
 * `edgeSpecsOf` call a plain block gets.
 */
function withPromotedWalls(result: CollapseSuccess<HostNodeData, WireStyleData>): HostScene {
  const ports: Partial<Record<BlockSide, string[]>> = {};
  for (const port of result.ports) (ports[port.side] ??= []).push(port.id);
  return {
    ...result.scene,
    nodes: result.scene.nodes.map((node) => (node.id === result.regionId ? { ...node, data: { ...node.data, ports } } : node)),
  };
}

/** The region node's own view data, handed to `collapseToRegion` as
 *  `regionData` so the minted node arrives already dressed. */
const REGION_DATA: HostNodeData = {
  name: "Region",
  region: { kind: "group", view: "expanded" },
  w: 268,
  h: 368,
};

function collapseSelection(scene: HostScene, options: Parameters<typeof collapseToRegion<HostNodeData, WireStyleData>>[2]) {
  const result = collapseToRegion<HostNodeData, WireStyleData>(scene, SELECTION, options);
  if (!result.ok) throw new Error(`collapse refused: ${result.refusal.message}`);
  return result;
}

/* ------------------------------------------------------------------ */
/* 1. Round trip — collapse then dissolve is the identity               */
/* ------------------------------------------------------------------ */

function Bench({ scene, label }: { scene: HostScene; label: string }) {
  // Stateful so the region's own chevron works: a reviewer can fold the
  // region to the opaque card and watch the same promoted ports carry the
  // same cables. Read-only benches would make the picture a still.
  const [live, setLive] = useState(scene);
  return (
    <div data-slot="grouping-bench" data-bench={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontSize: 11, color: "var(--muted-foreground)" }}>{label}</div>
      <DomCanvas scene={live} onSceneChange={setLive} width={BENCH.width} height={BENCH.height} />
    </div>
  );
}

export const RoundTrip: Story = {
  render: () => {
    const before = fixture();
    const collapsed = collapseSelection(before, { mintId: counter("m"), directionOf, typeOf, regionData: REGION_DATA });
    const dissolved = dissolveRegion(collapsed.scene, collapsed.regionId).scene;
    const identical = JSON.stringify(before) === JSON.stringify(dissolved);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel
          title="collapse → dissolve, on the board"
          note={
            <>
              The middle bench is the SAME record as the one above it after <code>collapseToRegion(scene, [a, b, c])</code>: A, B and C
              are now members of a minted region, <code>e1</code> and <code>e4</code> end on its promoted ports instead of on the
              members they used to name, and <code>e2</code>/<code>e3</code> are now wholly interior — press the region's chevron and
              the opaque card hides them and states the count. The bottom bench is that record after <code>dissolveRegion</code>, and
              the verdict under it is the byte comparison, not a resemblance.
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Bench scene={before} label="Before" />
            <Bench scene={withPromotedWalls(collapsed)} label="Collapsed" />
            <Bench scene={dissolved} label="Dissolved" />
          </div>
        </Panel>
        <div data-testid="verdict-row" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
          <span>JSON.stringify(before) === JSON.stringify(dissolved):</span>
          <span data-testid="verdict" style={{ color: identical ? "seagreen" : "var(--destructive)", fontWeight: 700 }}>
            {identical ? "IDENTICAL" : "DIVERGED"}
          </span>
          {identical && <span aria-hidden="true">✓</span>}
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId("verdict").textContent).toBe("IDENTICAL");

    const before = benchOf(canvasElement, "Before");
    const collapsed = benchOf(canvasElement, "Collapsed");
    const dissolved = benchOf(canvasElement, "Dissolved");

    // A, B and C are canvas nodes of their own before the collapse, members
    // of the region after it, and canvas nodes again once it dissolves —
    // measured off the DOM, which is the only place "became a member"
    // actually happens.
    for (const id of SELECTION) {
      expect(topLevel(before, id), `${id} is a top-level node before`).not.toBeNull();
      expect(topLevel(collapsed, id), `${id} stops being a top-level node once collapsed`).toBeNull();
      expect(topLevel(dissolved, id), `${id} is a top-level node again after dissolve`).not.toBeNull();
    }

    // …and "member" means CONTAINED, not merely re-parented in the record:
    // every one of the three sits inside the region frame's client rect.
    const regionId = regionIdOf(collapsed);
    const frame = required<HTMLElement>(collapsed, '[data-slot="region-frame"]', "the region frame");
    for (const id of SELECTION) {
      expectInside(rectOf(collapsed, `[data-block-id="${id}"]`), frame.getBoundingClientRect(), `${id} inside the region frame`);
    }

    // The two crossing cables really moved onto the container. `e1` and
    // `e4` are the SAME edge ids as before — that is the split-edge trick —
    // and their region-side terminal is a dot the region owns.
    for (const [wireId, portId] of [
      ["e1", "a/in"],
      ["e4", "b/out"],
    ] as const) {
      expect(collapsed.querySelector(`[data-wire-id="${wireId}"]`), `${wireId} still renders after the collapse`).not.toBeNull();
      expect(
        collapsed.querySelector(`[data-block-id="${regionId}"] [data-port-id="${portId}"]`),
        `the region carries the promoted port ${portId} that ${wireId} now ends on`,
      ).not.toBeNull();
    }
    // The interior pair is hidden: neither dot they used to join is a
    // top-level node any more, and the wire layer resolved every wire it
    // was handed (no silent "unresolved" escape hatch).
    await expectAllWiresResolved(collapsed);
    await expectAllWiresResolved(dissolved);

    // And the fold the panel's note promises is real, not a screenshot:
    // pressing the region's chevron takes the three members off the board
    // and the card states what it is now holding — while the SAME two
    // promoted ports keep the same two cables, which is the whole point of
    // promoting them rather than remembering them.
    await userEvent.click(required<HTMLElement>(collapsed, '[data-slot="folding-chevron"]', "the region's chevron"));
    await waitFor(() => expect(collapsed.querySelector('[data-block-id="a"]')).toBeNull());
    expect(required<HTMLElement>(collapsed, '[data-slot="region-hidden"]', "the card's footer").textContent).toBe("3 blocks · 4 edges hidden");
    for (const portId of ["a/in", "b/out"]) {
      expect(collapsed.querySelector(`[data-block-id="${regionId}"] [data-port-id="${portId}"]`), `${portId} survives the fold`).not.toBeNull();
    }
    await expectAllWiresResolved(collapsed);
  },
};

/* ------------------------------------------------------------------ */
/* 2. Boundary classes — Zach's rule, inked on the cables               */
/* ------------------------------------------------------------------ */

const CLASS_COLOR: Record<BoundaryClass, string> = {
  interior: "var(--muted-foreground)",
  inbound: "dodgerblue",
  outbound: "darkorange",
  exterior: "color-mix(in srgb, var(--muted-foreground) 45%, transparent)",
  "port-outer": "var(--foreground)",
  "port-inner": "var(--muted-foreground)",
};

/** The lasso, computed from the selection's own boxes — the picture of
 *  "inside" that `classifyBoundary({ inside })` is given as a list. */
function Lasso({ scene, inside }: { scene: HostScene; inside: readonly string[] }) {
  const boxes = scene.nodes.filter((node) => inside.includes(node.id));
  const pad = 14;
  const x = Math.min(...boxes.map((node) => node.position.x)) - pad;
  const y = Math.min(...boxes.map((node) => node.position.y)) - pad;
  const right = Math.max(...boxes.map((node) => node.position.x + (node.data.w ?? 0))) + pad;
  const bottom = Math.max(...boxes.map((node) => node.position.y + (node.data.h ?? 0))) + pad;
  return (
    <div
      data-testid="lasso"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: right - x,
        height: bottom - y,
        border: "1.5px dashed var(--primary)",
        borderRadius: 10,
        pointerEvents: "none",
      }}
    />
  );
}

export const BoundaryClasses: Story = {
  render: () => {
    // Judged as a LOOSE selection, exactly what `collapseToRegion` judges
    // before there is any container — so every one of Zach's six classes
    // that CAN appear here does: no container yet means no port-outer/
    // port-inner, only interior/inbound/outbound/exterior.
    const scene = fixture();
    const report = classifyBoundary(scene, { inside: SELECTION });
    const classOf = new Map(report.edges.map((hit) => [hit.edge.id, hit.kind]));

    // The ink IS the classification: one pass over the same report, written
    // into each edge's own `data.color`, which `sceneWires` already carries
    // to `Trace`. Nothing bespoke paints a cable here.
    const inked: HostScene = {
      ...scene,
      edges: scene.edges.map(
        (edge): SceneEdge<WireStyleData> => ({ ...edge, data: { ...edge.data, color: CLASS_COLOR[classOf.get(edge.id)!] } }),
      ),
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel
          title="classifyBoundary — the same six classes, as ink on the cables"
          note={
            <blockquote
              data-testid="zach-rule"
              style={{ margin: 0, padding: "2px 0 2px 12px", borderLeft: "3px solid var(--border)", fontStyle: "italic" }}
            >
              "any traces going to ports on the parent block itself, AS WELL AS any traces going from outside members to inside members.
              From inside member to inside member those can all be hidden."
            </blockquote>
          }
        >
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: "ui-sans-serif, sans-serif", fontSize: 11 }}>
            {(["inbound", "outbound", "interior", "exterior"] as const).map((kind) => (
              <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 5 }} data-testid={`legend-${kind}`}>
                <span style={{ width: 22, height: 3, borderRadius: 2, background: CLASS_COLOR[kind] }} />
                {kind}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 22, height: 0, borderTop: "1.5px dashed var(--primary)" }} />
              the selection [a, b, c]
            </span>
          </div>
          <div data-slot="grouping-bench" data-bench="Classified" style={{ position: "relative" }}>
            <DomCanvas scene={inked} width={BENCH.width} height={BENCH.height}>
              <Lasso scene={scene} inside={SELECTION} />
            </DomCanvas>
          </div>
        </Panel>
        <Panel title="the same report, per edge — `surfaces?` and the two endpoints the ink cannot carry">
          <table style={{ borderCollapse: "collapse" }} data-testid="boundary-table">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ paddingRight: 12 }}>edge</th>
                <th style={{ paddingRight: 12 }}>class</th>
                <th style={{ paddingRight: 12 }}>surfaces?</th>
                <th style={{ paddingRight: 12 }}>inner</th>
                <th>outer</th>
              </tr>
            </thead>
            <tbody>
              {report.edges.map((hit) => (
                <tr key={hit.edge.id} data-testid="boundary-row">
                  <td style={{ paddingRight: 12 }}>{hit.edge.id}</td>
                  <td data-testid="boundary-class" style={{ paddingRight: 12, color: CLASS_COLOR[hit.kind], fontWeight: 600 }}>
                    {hit.kind}
                  </td>
                  <td style={{ paddingRight: 12 }}>{hit.surfaces ? "yes" : "no"}</td>
                  <td style={{ paddingRight: 12 }}>{hit.inner ? `${hit.inner.nodeId}/${hit.inner.portId}` : "—"}</td>
                  <td>{hit.outer ? `${hit.outer.nodeId}/${hit.outer.portId}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const classes = canvas.getAllByTestId("boundary-class").map((cell) => cell.textContent);
    expect(classes.filter((kind) => kind === "inbound")).toHaveLength(1);
    expect(classes.filter((kind) => kind === "outbound")).toHaveLength(1);
    expect(classes.filter((kind) => kind === "interior")).toHaveLength(2);
    expect(classes.filter((kind) => kind === "exterior")).toHaveLength(1);

    // The ink reached the PAINT, not just the table: each cable's rendered
    // stroke is the colour its class names. Read off the drawn path, so a
    // classification that never made it through `sceneWires` fails here.
    const bench = benchOf(canvasElement, "Classified");
    await expectAllWiresResolved(bench);
    for (const [wireId, kind] of [
      ["e1", "inbound"],
      ["e4", "outbound"],
      ["e2", "interior"],
      ["e5", "exterior"],
    ] as const) {
      const line = required<SVGPathElement>(bench, `[data-wire-id="${wireId}"] [data-slot="trace-line"]`, `${wireId}'s drawn line`);
      expect(getComputedStyle(line).stroke, `${wireId} is inked ${kind}`).toBe(resolved(bench, CLASS_COLOR[kind]));
    }
    // e3 is the second interior cable and reads the same grey as e2 — the
    // "from inside member to inside member those can all be hidden" half of
    // Zach's rule, which is one class, not two.
    expect(getComputedStyle(required<SVGPathElement>(bench, '[data-wire-id="e3"] [data-slot="trace-line"]', "e3")).stroke).toBe(
      getComputedStyle(required<SVGPathElement>(bench, '[data-wire-id="e2"] [data-slot="trace-line"]', "e2")).stroke,
    );
    // inbound and outbound are genuinely DIFFERENT ink — the assertion the
    // old table version could not make, because two rows reading different
    // strings prove nothing about two cables reading the same grey.
    const inbound = getComputedStyle(required<SVGPathElement>(bench, '[data-wire-id="e1"] [data-slot="trace-line"]', "e1")).stroke;
    const outbound = getComputedStyle(required<SVGPathElement>(bench, '[data-wire-id="e4"] [data-slot="trace-line"]', "e4")).stroke;
    expect(inbound).not.toBe(outbound);

    // The lasso really contains the selection and really excludes the rest.
    const lasso = canvas.getByTestId("lasso").getBoundingClientRect();
    for (const id of SELECTION) expectInside(rectOf(bench, `[data-block-id="${id}"]`), lasso, `${id} inside the lasso`);
    for (const id of ["src", "sink", "other", "other2"]) {
      const box = rectOf(bench, `[data-block-id="${id}"]`);
      expect(box.left >= lasso.left && box.right <= lasso.right && box.top >= lasso.top && box.bottom <= lasso.bottom, `${id} is outside the lasso`).toBe(
        false,
      );
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3. Promoted ports — on the container's real walls                    */
/* ------------------------------------------------------------------ */

export const PromotedPorts: Story = {
  render: () => {
    const collapsed = collapseSelection(fixture(), { mintId: counter("m"), directionOf, typeOf, regionData: REGION_DATA });
    const ports: readonly PromotedPort[] = collapsed.ports;

    return (
      <Gallery>
        <Panel
          title="the region, its ports on the wall their promotion picked"
          note={
            <>
              Nothing here draws a port. <code>promoteBoundary</code> decided a side per crossing edge; the host wrote those sides into{" "}
              <code>data.ports</code> (<code>withPromotedWalls</code>, eight lines) and <code>RegionNodeView</code> built the card with the
              same <code>edgeSpecsOf</code> call a plain block gets. The dots below are therefore the real ones, at their real pitch — a
              hand-drawn SVG of where they WOULD go can never fail.
            </>
          }
        >
          <div data-slot="grouping-bench" data-bench="Promoted">
            <DomCanvas scene={withPromotedWalls(collapsed)} width={BENCH.width} height={BENCH.height} />
          </div>
        </Panel>
        <Panel title="PromotedPort — the data contract behind those dots">
          <table style={{ borderCollapse: "collapse" }} data-testid="promoted-ports-table">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
                <th style={{ paddingRight: 8 }}>id</th>
                <th style={{ paddingRight: 8 }}>side</th>
                <th style={{ paddingRight: 8 }}>direction</th>
                <th style={{ paddingRight: 8 }}>seat</th>
                <th style={{ paddingRight: 8 }}>band</th>
                <th style={{ paddingRight: 8 }}>inner</th>
                <th style={{ paddingRight: 8 }}>outer</th>
                <th style={{ paddingRight: 8 }}>portType</th>
                <th>by</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((port) => (
                <tr key={port.id} data-testid="promoted-port-row">
                  <td style={{ paddingRight: 8 }}>{port.id}</td>
                  <td style={{ paddingRight: 8 }}>{port.side}</td>
                  <td style={{ paddingRight: 8 }}>{port.direction}</td>
                  <td style={{ paddingRight: 8 }}>{port.seat}</td>
                  <td style={{ paddingRight: 8 }}>{port.band}</td>
                  <td style={{ paddingRight: 8 }}>
                    {port.inner.nodeId}/{port.inner.portId}
                  </td>
                  <td style={{ paddingRight: 8 }}>{port.outer.map((ref) => `${ref.nodeId}/${ref.portId}`).join(", ")}</td>
                  <td style={{ paddingRight: 8 }}>{port.portType ?? "—"}</td>
                  <td>{port.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Gallery>
    );
  },
  play: async ({ canvasElement }) => {
    const bench = benchOf(canvasElement, "Promoted");
    const regionId = regionIdOf(bench);
    const card = rectOf(bench, `[data-block-id="${regionId}"] [data-slot="block"]`);

    // The promotion says `a/in` is a sink and goes left, `b/out` is a source
    // and goes right. MEASURED against the card's own centre line — the one
    // claim the old hand-drawn SVG was structurally incapable of making,
    // because it drew the dots from the same `side` string it then asserted.
    const left = rectOf(bench, `[data-block-id="${regionId}"] [data-port-id="a/in"] [data-slot="port-dot"]`);
    const right = rectOf(bench, `[data-block-id="${regionId}"] [data-port-id="b/out"] [data-slot="port-dot"]`);
    const midX = card.left + card.width / 2;
    expect(centre(left).x, "a/in is promoted onto the LEFT wall").toBeLessThan(midX);
    expect(centre(right).x, "b/out is promoted onto the RIGHT wall").toBeGreaterThan(midX);

    // Both dots read WIRED, because a promoted port is only ever minted for
    // a cable that crosses — an unwired promoted port would be a port that
    // stands for nothing.
    for (const key of ["a/in", "b/out"]) {
      const dot = required<HTMLElement>(bench, `[data-block-id="${regionId}"] [data-port-id="${key}"] [data-slot="port-dot"]`, `${key}'s dot`);
      expect(dot.getAttribute("data-state"), `${key} is wired`).toBe("wired");
    }

    // The contract table and the paint agree on the SET of ports: exactly
    // one rendered dot per row, no extras invented by the host.
    const rows = within(canvasElement).getAllByTestId("promoted-port-row");
    const painted = Array.from(bench.querySelectorAll(`[data-block-id="${regionId}"] [data-port-id]`)).map((el) => el.getAttribute("data-port-id"));
    expect(painted.sort()).toEqual(rows.map((row) => row.querySelector("td")?.textContent).sort());
    await expectAllWiresResolved(bench);
  },
};

/* ------------------------------------------------------------------ */
/* 4. The falsifier — v1 and geometry disagree, and you can SEE it      */
/* ------------------------------------------------------------------ */

/** The fixture plus `b`'s feedback outlet and the cable it carries —
 *  copied from collapse.test.ts's "v1 and geometry DISAGREE" case. The two
 *  extra WALLS (`b/loop`, `src/in`) are this bench's, because a port has to
 *  sit somewhere to be drawn and the base fixture has no use for either;
 *  the edge and both its ends are the test's. */
function feedbackFixture(): HostScene {
  const scene = fixture();
  return {
    nodes: scene.nodes.map((node) => {
      if (node.id === "b") return { ...node, data: { ...node.data, h: 86, ports: { ...node.data.ports, right: ["out", "loop"] } } };
      if (node.id === "src") return { ...node, data: { ...node.data, ports: { ...node.data.ports, left: ["in"] } } };
      return node;
    }),
    edges: [...scene.edges, { id: "fb", source: "b", sourceHandle: "loop", target: "src", targetHandle: "in" }],
  };
}

const loopDirection: PortDirectionOf = (ref) => (ref.portId === "loop" ? "source" : directionOf(ref));

export const V1LimitFeedbackEdge: Story = {
  render: () => {
    const scene = feedbackFixture();
    const feedbackGeometry = { start: { x: 350, y: 150 }, end: { x: 20, y: 130 } };

    const v1 = collapseSelection(scene, { mintId: counter("m"), directionOf: loopDirection, regionData: { ...REGION_DATA, name: "Region · v1" } });
    const measured = collapseSelection(scene, {
      mintId: counter("g"),
      directionOf: loopDirection,
      policy: crossingGeometryPolicy,
      boxOf: (id) => BOXES[id],
      geometryOf: (id) => (id === "fb" ? feedbackGeometry : undefined),
      regionData: { ...REGION_DATA, name: "Region · geometry" },
    });
    const v1Feedback = v1.ports.find((port) => port.edgeIds.includes("fb"))!;
    const measuredFeedback = measured.ports.find((port) => port.edgeIds.includes("fb"))!;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel
          title="the same collapse, two policies — watch b/loop change wall"
          note={
            <>
              One scene, one selection, one feedback cable (<code>b/loop → src/in</code>). <code>dagPolarityPolicy</code> reads polarity
              only, so the promoted port is a source and sources go right — and the cable then leaves the region's RIGHT wall to reach
              something on its left. <code>crossingGeometryPolicy</code> measures the cable and puts the same port on the left. Both
              agree it is a source; only the wall is in dispute, and the dispute is a picture.
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Bench scene={withPromotedWalls(v1)} label="dagPolarityPolicy (v1, default)" />
            <Bench scene={withPromotedWalls(measured)} label="crossingGeometryPolicy (measured off the cable)" />
          </div>
        </Panel>
        <Gallery>
          {(
            [
              ["v1", v1Feedback],
              ["geometry", measuredFeedback],
            ] as const
          ).map(([key, port]) => (
            <Panel key={key} title={key === "v1" ? "dagPolarityPolicy" : "crossingGeometryPolicy"}>
              <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>side</td>
                    <td data-testid={`${key}-side`} style={{ fontWeight: 700 }}>
                      {port.side}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>direction</td>
                    <td data-testid={`${key}-direction`}>{port.direction}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>by</td>
                    <td>{port.by}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          ))}
        </Gallery>
        <div data-testid="dag-limit-caption" style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 680, fontFamily: "ui-sans-serif, sans-serif" }}>
          {DAG_HEURISTIC_LIMIT.why}
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId("v1-side").textContent).toBe("right");
    expect(canvas.getByTestId("geometry-side").textContent).toBe("left");
    // Both agree on polarity — only the SIDE is in dispute.
    expect(canvas.getByTestId("v1-direction").textContent).toBe("source");
    expect(canvas.getByTestId("geometry-direction").textContent).toBe("source");

    // And the dispute is REAL on the board: the same promoted port sits on
    // opposite sides of the same card in the two benches. The old version of
    // this story asserted two strings that its own render had just printed;
    // this reads the painted geometry back.
    const sides: Record<string, number> = {};
    for (const [label, bench] of [
      ["v1", benchOf(canvasElement, "dagPolarityPolicy (v1, default)")],
      ["geometry", benchOf(canvasElement, "crossingGeometryPolicy (measured off the cable)")],
    ] as const) {
      const regionId = regionIdOf(bench);
      const card = rectOf(bench, `[data-block-id="${regionId}"] [data-slot="block"]`);
      const dot = rectOf(bench, `[data-block-id="${regionId}"] [data-port-id="b/loop"] [data-slot="port-dot"]`);
      sides[label] = centre(dot).x - (card.left + card.width / 2);
      await expectAllWiresResolved(bench);
    }
    expect(sides.v1, "v1 puts b/loop right of the card's centre").toBeGreaterThan(0);
    expect(sides.geometry, "the geometry policy puts the same port left of it").toBeLessThan(0);
  },
};

/* ------------------------------------------------------------------ */
/* Measurement helpers — shared by the play functions above             */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(root: ParentNode, label: string): HTMLElement {
  return required<HTMLElement>(root, `[data-slot="grouping-bench"][data-bench="${label}"]`, `the \`${label}\` bench`);
}

/** A node the HOST placed on the canvas — `DomCanvas` stamps
 *  `data-scene-node` only on top-level nodes, so this is literally the
 *  "is it a canvas node or a member" question. */
function topLevel(bench: HTMLElement, id: string): HTMLElement | null {
  return bench.querySelector<HTMLElement>(`[data-host="dom-canvas"] > [data-scene-node="${id}"]`);
}

function rectOf(root: ParentNode, selector: string): DOMRect {
  return required<HTMLElement>(root, selector, selector).getBoundingClientRect();
}

function centre(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function expectInside(inner: DOMRect, outer: DOMRect, what: string): void {
  if (!(inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5)) {
    throw new Error(
      `${what} — [${inner.left.toFixed(1)}, ${inner.top.toFixed(1)}, ${inner.right.toFixed(1)}, ${inner.bottom.toFixed(1)}] escapes [${outer.left.toFixed(
        1,
      )}, ${outer.top.toFixed(1)}, ${outer.right.toFixed(1)}, ${outer.bottom.toFixed(1)}]`,
    );
  }
}

/** `WireLayer`'s own "skipped, not guessed at" channel. Empty means every
 *  wire the scene declared found both of its dots. */
async function expectAllWiresResolved(bench: HTMLElement): Promise<void> {
  const layer = required<HTMLElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
  await waitFor(() => expect(layer.getAttribute("data-unresolved-wires")).toBe(""), { timeout: 3000 });
}

/** The minted region's id, read back off the paint rather than guessed from
 *  the `mintId` prefix — `Region` stamps it on its frame, and reading it is
 *  what keeps these assertions honest if the minting ever changes. */
function regionIdOf(bench: HTMLElement): string {
  const frame = required<HTMLElement>(bench, "[data-region-id]", "the rendered region");
  return frame.getAttribute("data-region-id")!;
}

/** A CSS colour as the browser computes it, so a `var(--…)` or a
 *  `color-mix()` in the expectation is compared against the same resolved
 *  `rgb(...)` the paint carries. */
function resolved(bench: HTMLElement, color: string): string {
  const probe = document.createElement("span");
  probe.style.color = color;
  bench.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed;
}
