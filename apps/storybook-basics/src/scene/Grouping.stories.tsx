import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  classifyBoundary,
  crossingGeometryPolicy,
  DAG_HEURISTIC_LIMIT,
  type PromotedPort,
} from "./boundary";
import { collapseToRegion, dissolveRegion } from "./collapse";
import type { PortDirectionOf, PortTypeOf } from "./lint";
import type { BlockScene, SceneEdge, SceneNode } from "./scene";

/**
 * Blocks/Scene/Grouping — `collapseToRegion`/`dissolveRegion` (collapse.ts),
 * `classifyBoundary`/`promoteBoundary` (boundary.ts) and the v1-vs-measured
 * promotion policies, rendered with story-local markup only.
 *
 * IMPORTANT — this file imports NO component, same rule as
 * `SceneDiff.stories.tsx`: every table/svg/row below is throwaway story
 * markup, not a preview of a paint layer. It exists so the scene-grouping
 * math is something a person can look at today.
 *
 * `fixture()`, `directionOf`, `typeOf` and `counter()` below are copied
 * VERBATIM from `collapse.test.ts` on purpose — the scene this story shows
 * is the exact scene the unit tests already proved round-trips, not a
 * second one invented for the screenshot. The feedback-edge fixture in
 * `V1LimitFeedbackEdge` is likewise copied from that file's "the swappable
 * policy is really swappable" describe block.
 */

const meta = {
  title: "Blocks/Scene/Grouping",
  tags: ["area:blocks", "lane:grouping"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* Shared story chrome — plain markup, no bbox components               */
/* ------------------------------------------------------------------ */

function Gallery({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>{children}</div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        minWidth: 260,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        background: "var(--card)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ fontFamily: "ui-sans-serif, sans-serif", fontWeight: 600, fontSize: 12 }}>{title}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fixture — copied verbatim from collapse.test.ts                     */
/* ------------------------------------------------------------------ */

/**
 *   src ──e1──► [ a ──e2──► b ──e3──► c ]                  (selection)
 *                          └──e4──────────────► sink
 *   other ──e5──► other2                                   (exterior)
 *
 * e1 inbound, e2/e3 interior, e4 outbound, e5 exterior.
 */
function fixture(): BlockScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 100 }, data: { name: "Source" } },
      { id: "a", position: { x: 200, y: 40 }, data: { name: "A" } },
      { id: "b", position: { x: 340, y: 120 }, data: { name: "B" } },
      { id: "c", position: { x: 300, y: 260 }, data: { name: "C" } },
      { id: "sink", position: { x: 600, y: 120 }, data: { name: "Sink" } },
      { id: "other", position: { x: 0, y: 600 }, data: { name: "Other" } },
      { id: "other2", position: { x: 200, y: 600 }, data: { name: "Other2" } },
    ],
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in", data: { colour: "teal" } },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

const SELECTION = ["a", "b", "c"];

/** Every `out` port emits, every `in` port receives. `lint.ts`'s own
 *  `source`/`sink` vocabulary, not a third spelling. */
const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);

const typeOf: PortTypeOf = ({ portId }) => (portId === "out" || portId === "in" ? ["pose"] : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

/** A container's box, for a geometry policy — copied from the same
 *  describe block. */
const BOXES: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 200, y: 40, w: 120, h: 60 },
  b: { x: 340, y: 120, w: 120, h: 60 },
  c: { x: 300, y: 260, w: 120, h: 60 },
};

/* ------------------------------------------------------------------ */
/* Small scene-rendering helpers shared by more than one story          */
/* ------------------------------------------------------------------ */

function SceneNodesTable({ nodes }: { nodes: readonly SceneNode[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--muted-foreground)" }}>
          <th style={{ paddingRight: 10 }}>id</th>
          <th style={{ paddingRight: 10 }}>parent</th>
          <th>position</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node) => (
          <tr key={node.id}>
            <td style={{ paddingRight: 10 }}>{node.id}</td>
            <td style={{ paddingRight: 10, color: "var(--muted-foreground)" }}>{node.parentId ?? "—"}</td>
            <td>
              {node.position.x}, {node.position.y}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SceneEdgesList({ edges, highlight }: { edges: readonly SceneEdge[]; highlight?: ReadonlySet<string> }) {
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
      {edges.map((edge) => (
        <li
          key={edge.id}
          style={
            highlight?.has(edge.id)
              ? { background: "color-mix(in srgb, seagreen 18%, transparent)", color: "seagreen", fontWeight: 600 }
              : undefined
          }
        >
          {edge.id}: {edge.source}/{edge.sourceHandle ?? ""} → {edge.target}/{edge.targetHandle ?? ""}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Round trip — collapse then dissolve is the identity               */
/* ------------------------------------------------------------------ */

export const RoundTrip: Story = {
  render: () => {
    const before = fixture();
    const collapsed = collapseToRegion(before, SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const dissolved = dissolveRegion(collapsed.scene, collapsed.regionId).scene;

    // Which edges were RE-POINTED at the region's own port, as opposed to
    // the freshly minted interior stubs — "port-outer" is exactly that:
    // the original edge (e1, e4), same id and `data`, now ending at the
    // container instead of the child it used to name.
    const report = classifyBoundary(collapsed.scene, { containerId: collapsed.regionId });
    const repointed = new Set(report.edges.filter((hit) => hit.kind === "port-outer").map((hit) => hit.edge.id));

    const identical = JSON.stringify(before) === JSON.stringify(dissolved);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Gallery>
          <Panel title="Before">
            <SceneNodesTable nodes={before.nodes} />
            <SceneEdgesList edges={before.edges} />
          </Panel>
          <Panel title="Collapsed">
            <SceneNodesTable nodes={collapsed.scene.nodes} />
            <SceneEdgesList edges={collapsed.scene.edges} highlight={repointed} />
          </Panel>
          <Panel title="Dissolved">
            <SceneNodesTable nodes={dissolved.nodes} />
            <SceneEdgesList edges={dissolved.edges} />
          </Panel>
        </Gallery>
        <div
          data-testid="verdict-row"
          style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        >
          <span>JSON.stringify(before) === JSON.stringify(dissolved):</span>
          <span
            data-testid="verdict"
            style={{ color: identical ? "seagreen" : "var(--destructive)", fontWeight: 700 }}
          >
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
  },
};

/* ------------------------------------------------------------------ */
/* 2. Boundary classes — Zach's rule, one row per edge                  */
/* ------------------------------------------------------------------ */

const CLASS_COLOR: Record<string, string> = {
  interior: "var(--muted-foreground)",
  inbound: "dodgerblue",
  outbound: "darkorange",
  exterior: "color-mix(in srgb, var(--muted-foreground) 55%, transparent)",
  "port-outer": "var(--foreground)",
  "port-inner": "var(--muted-foreground)",
};

export const BoundaryClasses: Story = {
  render: () => {
    // Judged as a LOOSE selection, exactly what `collapseToRegion` judges
    // before there is any container — so every one of Zach's six classes
    // that CAN appear here does: no container yet means no port-outer/
    // port-inner, only interior/inbound/outbound/exterior.
    const report = classifyBoundary(fixture(), { inside: SELECTION });

    return (
      <Panel title="classifyBoundary — every edge in the fixture, against the loose selection [a, b, c]">
        <blockquote
          data-testid="zach-rule"
          style={{
            margin: "0 0 12px",
            padding: "2px 0 2px 12px",
            borderLeft: "3px solid var(--border)",
            color: "var(--muted-foreground)",
            fontStyle: "italic",
            fontFamily: "ui-sans-serif, sans-serif",
          }}
        >
          "any traces going to ports on the parent block itself, AS WELL AS any traces going from
          outside members to inside members. From inside member to inside member those can all be
          hidden."
        </blockquote>
        <table style={{ borderCollapse: "collapse", width: "100%" }} data-testid="boundary-table">
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
                <td
                  data-testid="boundary-class"
                  style={{ paddingRight: 12, color: CLASS_COLOR[hit.kind], fontWeight: 600 }}
                >
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
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const classes = canvas.getAllByTestId("boundary-class").map((cell) => cell.textContent);
    expect(classes.filter((kind) => kind === "inbound")).toHaveLength(1);
    expect(classes.filter((kind) => kind === "outbound")).toHaveLength(1);
    expect(classes.filter((kind) => kind === "interior")).toHaveLength(2);
    expect(classes.filter((kind) => kind === "exterior")).toHaveLength(1);
  },
};

/* ------------------------------------------------------------------ */
/* 3. Promoted ports — the container's own port list, drawn on the wall */
/* ------------------------------------------------------------------ */

const SVG_WIDTH = 220;
const SVG_HEIGHT = 120;

function wallPosition(ports: readonly PromotedPort[], port: PromotedPort): number {
  const onSameWall = ports.filter((candidate) => candidate.side === port.side);
  const index = onSameWall.indexOf(port);
  return ((index + 1) / (onSameWall.length + 1)) * SVG_HEIGHT;
}

export const PromotedPorts: Story = {
  render: () => {
    const collapsed = collapseToRegion(fixture(), SELECTION, { mintId: counter("m"), directionOf, typeOf });
    if (!collapsed.ok) throw new Error("collapse refused");
    const ports = collapsed.ports;

    return (
      <Gallery>
        <Panel title="the region, ports drawn on the wall their promotion picked">
          {/* WHY the gutter is 165px and not the 60 this started at: the
              widest label is `source · header · polarity` — 26 monospace
              characters at 9px, ≈145px — and a 60px gutter CLIPPED it to
              `· polarity` with no ellipsis and no way to recover the value.
              That is exactly the silent-truncation failure Zach's truthful-
              rendering rule forbids, and it was caught by looking at the
              capture, not by any assertion. The viewBox is kept at 1:1 with
              the rendered size so the text is never scaled either. */}
          <svg
            viewBox={`-165 -14 ${SVG_WIDTH + 330} ${SVG_HEIGHT + 40}`}
            width={SVG_WIDTH + 330}
            height={SVG_HEIGHT + 40}
            data-testid="promoted-ports-svg"
          >
            <rect x={0} y={0} width={SVG_WIDTH} height={SVG_HEIGHT} fill="none" stroke="var(--border)" rx={6} />
            {ports.map((port) => {
              const x = port.side === "left" ? 0 : port.side === "right" ? SVG_WIDTH : SVG_WIDTH / 2;
              const y = port.side === "top" || port.side === "bottom" ? SVG_HEIGHT / 2 : wallPosition(ports, port);
              const anchor: "end" | "start" = port.side === "left" ? "end" : "start";
              const labelX = port.side === "left" ? x - 8 : x + 8;
              return (
                <g key={port.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill={port.direction === "source" ? "seagreen" : "dodgerblue"}
                    data-testid="promoted-port-dot"
                    data-side={port.side}
                  />
                  <text x={labelX} y={y - 8} textAnchor={anchor} fontSize={10} fontFamily="ui-monospace, monospace" fill="var(--foreground)">
                    {port.id}
                  </text>
                  <text
                    x={labelX}
                    y={y + 14}
                    textAnchor={anchor}
                    fontSize={9}
                    fontFamily="ui-monospace, monospace"
                    fill="var(--muted-foreground)"
                  >
                    {port.direction} · {port.seat} · {port.by}
                  </text>
                </g>
              );
            })}
          </svg>
        </Panel>
        <Panel title="PromotedPort — the data contract the rendering lane consumes">
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
    const canvas = within(canvasElement);
    const dots = canvas.getAllByTestId("promoted-port-dot");
    expect(dots.some((dot) => dot.dataset.side === "right")).toBe(true);
    expect(dots.some((dot) => dot.dataset.side === "left")).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* 4. The falsifier — v1 and geometry disagree on a feedback edge       */
/* ------------------------------------------------------------------ */

export const V1LimitFeedbackEdge: Story = {
  render: () => {
    const scene = fixture();
    // `b` feeds back into `src` from its own `loop` port — copied verbatim
    // from collapse.test.ts's "v1 and geometry DISAGREE" case.
    scene.edges.push({ id: "fb", source: "b", sourceHandle: "loop", target: "src", targetHandle: "in" });
    const loopDirection: PortDirectionOf = (ref) => (ref.portId === "loop" ? "source" : directionOf(ref));
    const feedbackGeometry = { start: { x: 350, y: 150 }, end: { x: 20, y: 130 } };

    const v1 = collapseToRegion(scene, SELECTION, { mintId: counter("m"), directionOf: loopDirection });
    if (!v1.ok) throw new Error("collapse refused");
    const v1Feedback = v1.ports.find((port) => port.edgeIds.includes("fb"))!;

    const measured = collapseToRegion(scene, SELECTION, {
      mintId: counter("g"),
      directionOf: loopDirection,
      policy: crossingGeometryPolicy,
      boxOf: (id) => BOXES[id],
      geometryOf: (id) => (id === "fb" ? feedbackGeometry : undefined),
    });
    if (!measured.ok) throw new Error("collapse refused");
    const measuredFeedback = measured.ports.find((port) => port.edgeIds.includes("fb"))!;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Gallery>
          <Panel title="dagPolarityPolicy (v1, default)">
            <table style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>side</td>
                  <td data-testid="v1-side" style={{ fontWeight: 700 }}>
                    {v1Feedback.side}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>direction</td>
                  <td data-testid="v1-direction">{v1Feedback.direction}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>by</td>
                  <td>{v1Feedback.by}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="crossingGeometryPolicy (measured off the cable)">
            <table style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>side</td>
                  <td data-testid="geometry-side" style={{ fontWeight: 700 }}>
                    {measuredFeedback.side}
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>direction</td>
                  <td data-testid="geometry-direction">{measuredFeedback.direction}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 12, color: "var(--muted-foreground)" }}>by</td>
                  <td>{measuredFeedback.by}</td>
                </tr>
              </tbody>
            </table>
          </Panel>
        </Gallery>
        <div
          data-testid="dag-limit-caption"
          style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 640, fontFamily: "ui-sans-serif, sans-serif" }}
        >
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
  },
};
