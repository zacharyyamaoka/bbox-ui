import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Block } from "./block";
import { BlockPort } from "./blockPort";
import { RAIL_GAP_PX } from "./blockPort.layout";
import type { BlockSide } from "./port.layout";
import type { PortEdgeItem, PortEdgeProps } from "./portEdge";
import type { Distribution } from "./portEdge.layout";
import { ASYNC_PACKET_DASHARRAY, type TraceRouting } from "./trace.layout";
import { WireLayer } from "./wireLayer";
import { type SceneEdge, wiredPorts } from "../scene/scene";
import { sceneWires, withWiredState, type WireStyleData } from "../scene/sceneWires";

/**
 * Components/Blocks/Region/Async — phase B2 of docs/BLOCK-PORT-EDGES-PLAN.md §7: the
 * async-region communication gallery, ported as a SPEC, never as layout
 * code. Every placement below is a `PortEdge` configuration
 * (`groups`+`groupMode:"grouped"` per family, on the wall facing the
 * counterpart) — nothing from the donor's `portPlacementInference.ts`
 * crosses; that file is only the oracle this fixture was checked against.
 *
 * Families drawn: Stream, Service, Action — the donor's own three drawable
 * patterns (`COMMUNICATION_DRAW_FAMILIES`, `communicationAuthoring.ts:32`).
 * `topic` is deliberately absent — it's the parser's fallback reading of any
 * plain data edge, not something anyone draws — and the legend below says so
 * in one line rather than silently dropping a fourth row.
 */

/* ------------------------------------------------------------------ */
/* Donor vocabulary, ported BY VALUE — fixture data, not layout code    */
/* ------------------------------------------------------------------ */

type DrawFamily = "stream" | "service" | "action";

/** `COMMUNICATION_FAMILY_PAINT.ink` (`communicationProjection.ts:99-108`) —
 *  ink only; `soft`/`monogram` paint a whiteboard surface this app has no
 *  equivalent of. `topic`'s `#118b6d` is omitted along with the row itself. */
const FAMILY_INK: Record<DrawFamily, string> = {
  stream: "#7558d7",
  service: "#3971dd",
  action: "#d27a0a",
};

/** `COMMUNICATION_PROTOCOL_LEGS` (`communicationAuthoring.ts:64-76`): which
 *  phases each family expands into, and which way each leg's arrow points
 *  ("for Service it names the client, for Action the component that sends
 *  the goal", `:40-45`). `forward` = initiator → responder; `back` = the
 *  reverse. Action deliberately generates no `cancel` leg (the donor's own
 *  WHY, `:56-63`). */
const PROTOCOL_LEGS: Record<DrawFamily, { phase: string; direction: "forward" | "back" }[]> = {
  stream: [{ phase: "stream", direction: "forward" }],
  service: [
    { phase: "request", direction: "forward" },
    { phase: "response", direction: "back" },
  ],
  action: [
    { phase: "goal", direction: "forward" },
    { phase: "feedback", direction: "back" },
    { phase: "result", direction: "back" },
  ],
};

/* ------------------------------------------------------------------ */
/* Measurement (mirrors BlockWiring.stories.tsx's own conventions)      */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(canvasElement: HTMLElement, benchId: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="wire-bench"][data-bench="${benchId}"]`, `the \`${benchId}\` bench`);
}

function dotOf(bench: HTMLElement, blockId: string, portId: string): HTMLElement {
  const block = required<HTMLElement>(bench, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  const direct = block.querySelector<HTMLElement>(`[data-port-id="${portId}"]`);
  if (direct) return direct;
  for (const collapsed of Array.from(block.querySelectorAll<HTMLElement>("[data-collapsed-ports]"))) {
    if ((collapsed.getAttribute("data-collapsed-ports") ?? "").split(",").includes(portId)) return collapsed;
  }
  throw new Error(`expected a dot for ${blockId}/${portId}`);
}

async function waitForWireGroup(bench: HTMLElement, wireId: string): Promise<SVGGElement> {
  await waitFor(() => expect(bench.querySelector(`[data-wire-id="${wireId}"]`)).not.toBeNull(), { timeout: 3000 });
  return required<SVGGElement>(bench, `[data-wire-id="${wireId}"]`, `the rendered trace for wire \`${wireId}\``);
}

function traceLineOf(group: SVGGElement): SVGPathElement {
  return required<SVGPathElement>(group, '[data-slot="trace-line"]', "the trace's visible line");
}

function toScreen(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM");
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  return point.matrixTransform(ctm);
}

function dotCentre(dot: HTMLElement): { x: number; y: number } {
  const r = dot.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Plain rect overlap — no tolerance, since "touching but not overlapping"
 *  (`a.right === b.left`) is not a collision. */
function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

/**
 * The defect this file's own header-clearance fix (see `headerClearOverridesFor`/
 * `headerClearDistributionFor` below) exists for: every port label's rect,
 * measured against its OWN block's header text rect — never DOM presence,
 * the two numbers. Scoped `[data-slot="block-port"]` by `[data-slot="block-port"]`
 * so a label is only ever checked against the header of the block it
 * actually sits on, not any other bench's.
 */
function assertNoLabelHeaderCollisions(canvasElement: HTMLElement): { checked: number } {
  let checked = 0;
  for (const blockPort of Array.from(canvasElement.querySelectorAll('[data-slot="block-port"]'))) {
    const header = blockPort.querySelector('[data-slot="block-header"]');
    if (!header) continue;
    const headerRect = header.getBoundingClientRect();
    const labels = Array.from(blockPort.querySelectorAll('[data-slot="port-label"]'));
    for (const label of labels) {
      checked++;
      const labelRect = label.getBoundingClientRect();
      if (rectsIntersect(headerRect, labelRect)) {
        throw new Error(
          `label "${label.textContent}" (${JSON.stringify(labelRect)}) intersects header "${header.textContent}" (${JSON.stringify(headerRect)}) on block \`${blockPort.getAttribute("data-block-id")}\``,
        );
      }
    }
  }
  return { checked };
}

/** B4 — measured from the RENDERED path, not assumed from a prop: which
 *  literal endpoint of the drawn line carries `marker-end`, and which port
 *  that endpoint actually sits nearest to. `Trace` always paints the marker
 *  on the segment ending at its own `to` — so the proof is geometric:
 *  whichever endpoint is closer to `expectedMarkerDot` must be the one
 *  wearing the marker. */
function expectMarkerAtDot(svg: SVGSVGElement, line: SVGPathElement, expectedMarkerDot: HTMLElement, otherDot: HTMLElement, what: string): void {
  const markerAttr = line.getAttribute("marker-end");
  if (!markerAttr) throw new Error(`${what} — the line carries no marker-end at all`);
  const total = line.getTotalLength();
  const p0 = toScreen(svg, line.getPointAtLength(0).x, line.getPointAtLength(0).y);
  const p1 = toScreen(svg, line.getPointAtLength(total).x, line.getPointAtLength(total).y);
  const expected = dotCentre(expectedMarkerDot);
  const other = dotCentre(otherDot);
  const distTo = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
  // The path's LAST point (getPointAtLength(total)) is where `marker-end`
  // paints, by SVG's own definition of the property.
  const markerEndPoint = p1;
  const distExpected = distTo(markerEndPoint, expected);
  const distOther = distTo(markerEndPoint, other);
  if (!(distExpected < distOther)) {
    throw new Error(
      `${what} — the marker-end point (${markerEndPoint.x.toFixed(1)}, ${markerEndPoint.y.toFixed(1)}) is ${distExpected.toFixed(1)}px from the expected dot and ${distOther.toFixed(1)}px from the other one — the marker is at the WRONG end`,
    );
  }
  // And the line's FIRST point (p0) should be the far end, confirming this
  // is a real geometric read and not a coincidence of a short line.
  if (!(distTo(p0, other) < distTo(p0, expected))) {
    throw new Error(`${what} — the line's start point does not sit nearer the OTHER port; this specimen cannot actually distinguish the two ends`);
  }
}

/* ------------------------------------------------------------------ */
/* The gallery fixture — one relationship, one pair of blocks, per specimen */
/* ------------------------------------------------------------------ */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Specimen {
  key: string;
  family: DrawFamily;
  name: string;
  initiatorId: string;
  responderId: string;
  /** The wall on the INITIATOR that faces the responder. Varied across
   *  specimens (not derived from a single shared hub) is what makes "across
   *  four edges" a fact about the GALLERY rather than one crowded block —
   *  see the module note on why a four-wall hub was abandoned. */
  initiatorEdge: BlockSide;
  bench: { width: number; height: number };
  initiatorBox: Box;
  responderBox: Box;
  caption: string;
}

const OPPOSITE_EDGE: Record<BlockSide, BlockSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

const SPECIMENS: Specimen[] = [
  {
    key: "move",
    family: "action",
    name: "move",
    initiatorId: "ui",
    responderId: "controller",
    initiatorEdge: "bottom",
    // Wide enough for three grouped labels ("move.goal"/"move.feedback"/
    // "move.result") side by side without colliding — three IS the widest
    // any wall gets here (Action's own leg count), so this is the specimen
    // that sets the floor.
    bench: { width: 340, height: 400 },
    initiatorBox: { x: 20, y: 10, w: 300, h: 150 },
    responderBox: { x: 20, y: 240, w: 300, h: 150 },
    caption: "Action · move — goal forward, feedback + result back (no cancel leg — the donor's own exclusion)",
  },
  {
    key: "health",
    family: "service",
    name: "health",
    initiatorId: "dashboard",
    responderId: "battery",
    initiatorEdge: "right",
    bench: { width: 470, height: 160 },
    initiatorBox: { x: 20, y: 35, w: 150, h: 90 },
    responderBox: { x: 300, y: 35, w: 150, h: 90 },
    caption: "Service · health — request forward, response back",
  },
  {
    key: "camera",
    family: "stream",
    name: "camera",
    initiatorId: "perception",
    responderId: "planner",
    initiatorEdge: "bottom",
    bench: { width: 220, height: 260 },
    initiatorBox: { x: 30, y: 10, w: 160, h: 90 },
    responderBox: { x: 30, y: 170, w: 160, h: 80 },
    caption: "Stream · camera — one forward leg; no `groups` line (a group of one is just an ungrouped port)",
  },
  {
    key: "power",
    family: "service",
    name: "power",
    initiatorId: "charger",
    responderId: "grid",
    // The initiator sits on the RIGHT of the pair here (responderBox is the
    // smaller x) — its LEFT wall is what faces the responder, the one edge
    // `health` (above) never exercises as an INITIATOR wall.
    initiatorEdge: "left",
    bench: { width: 470, height: 160 },
    initiatorBox: { x: 300, y: 35, w: 150, h: 90 },
    responderBox: { x: 20, y: 35, w: 150, h: 90 },
    caption: "Service · power — same family as health, mirrored — the initiator's LEFT wall this time",
  },
];

function legPortId(spec: Specimen, legIndex: number): string {
  return `${spec.name}.${PROTOCOL_LEGS[spec.family][legIndex].phase}`;
}

function railItemsFor(spec: Specimen): PortEdgeItem[] {
  return PROTOCOL_LEGS[spec.family].map((_, i) => ({ id: legPortId(spec, i), label: legPortId(spec, i) }));
}

function railGroupsFor(spec: Specimen): string {
  // A lone leg (Stream) is deliberately not grouped — the parser drops a
  // group naming fewer than two ids, and PortEdge already renders a single
  // ungrouped port with no enclosing outline, which is the donor's own look.
  const ids = railItemsFor(spec).map((i) => i.id);
  return ids.length > 1 ? ids.join(", ") : "";
}

/* ------------------------------------------------------------------ */
/* Header clearance — a real defect found while building this gallery,  */
/* worked around at the FIXTURE, not in the component (see the report). */
/* ------------------------------------------------------------------ */

/**
 * `BlockPort`'s "simple" view rail (`blockPort.layout.ts`'s `railPlanFor`,
 * the "spread-on-simple" branch) gives every populated edge a `band:
 * "block"` content box — spanning the Block's FULL height/width, header
 * included — with no header-aware alternative. Every wall in this gallery
 * hits it, measured live in the real Storybook (`getBoundingClientRect`,
 * not eyeballed): a `top`-edge rail's inward label sits a small FIXED
 * offset off its dot, itself pinned to the border line, so NO distribution
 * can move it — `move.goal`/`move.feedback`/`move.result` land squarely on
 * `controller`'s 36px-tall header, `camera.stream` on `planner`'s. A
 * `left`/`right` rail's FIRST port starts a fixed 18px from the block's own
 * top regardless of block height (`space-between`'s own first-position
 * formula), which also lands inside that 36px header band —
 * `health.request`/`health.response` on `dashboard` AND `battery`,
 * `power.request`/`power.response` on `charger` AND `grid`.
 *
 * This is a genuine gap in `railPlanFor` (no `body`-band, header-aware
 * option for "simple" view) — flagged in the report rather than patched
 * there, since this lane owns stories only. Worked around here with the
 * TWO override seams `BlockPort` actually exposes to a caller:
 * `BlockEdgeSpec.distribution` (`blockPort.tsx`: "an explicit per-edge
 * distribution from the caller always wins") re-packs a left/right rail
 * clear of the header; `portEdgeProps.textLayout` (never touched by
 * `BlockPortRail`'s own JSX, so a caller's value survives the spread) flips
 * a top-edge rail's label OUTWARD — into the gap toward the other block —
 * since its position is otherwise immovable by distribution alone. A
 * `bottom`-edge rail (ui, perception) needs neither: its inward label
 * already flows UP into its OWN body, nowhere near a header or footer.
 */
const HEADER_HEIGHT_PX = 36; // measured: Block's `px-3 py-2` header at text-sm.
// blockPort.layout.ts's own `RAIL_END_MARGIN_PX` (not exported for reuse —
// restated by value; it's the donor's own constant and unlikely to drift
// silently, since GroupedSpacing/ClassicDag already pin it elsewhere) is
// still added on TOP of this `edgePadding` (`alignedFirstCentrePx`'s own
// formula: `bandStart + endMarginPx + edgePadding + slotMainPx / 2`), so
// this only needs to make up the REST of the clearance past the header,
// plus a few px for the label's own half-height (~13.5px) — checked live
// against the header/label rects this file's own report captures.
const RAIL_END_MARGIN_PX_LOCAL = 18;
const HEADER_CLEAR_EDGE_PADDING_PX = HEADER_HEIGHT_PX - RAIL_END_MARGIN_PX_LOCAL + 8;

/** Whether `edge` needs a header-clearance override in THIS gallery, and
 *  which kind — `undefined` for the one edge (`bottom`) that already clears
 *  everything on its own. */
function headerClearOverridesFor(edge: BlockSide): Partial<PortEdgeProps> | undefined {
  if (edge === "top") return { textLayout: "top" }; // outward — into the gap, off the header.
  if (edge === "left" || edge === "right") return undefined; // handled via `distribution`, not `textLayout`.
  return undefined; // "bottom" — inward already flows into the block's OWN body, clear of any header.
}

/** Same predicate, the `distribution` half — `BlockEdgeSpec`'s own
 *  higher-precedence override seam (see the module doc above). */
function headerClearDistributionFor(edge: BlockSide): Distribution | undefined {
  if (edge !== "left" && edge !== "right") return undefined;
  return { mode: "aligned", anchor: "start", gap: RAIL_GAP_PX, edgePadding: HEADER_CLEAR_EDGE_PADDING_PX };
}

/** `source`/`target` per leg, honouring the donor's arrow rule (§7,
 *  finding 2): `forward` points initiator→responder; `back` always
 *  reverses that. A scene edge now (docs/SCENE-KIT.md), with the view
 *  styling riding in `data` for `sceneWires` to read — the record itself
 *  is engine vocabulary, not paint. */
function edgeForLeg(spec: Specimen, legIndex: number, routing: TraceRouting): SceneEdge<WireStyleData> {
  const leg = PROTOCOL_LEGS[spec.family][legIndex];
  const portId = legPortId(spec, legIndex);
  const [source, target] = leg.direction === "forward" ? [spec.initiatorId, spec.responderId] : [spec.responderId, spec.initiatorId];
  return {
    id: `${spec.key}-${leg.phase}`,
    source,
    sourceHandle: portId,
    target,
    targetHandle: portId,
    // D-B6: the async region's whole meaning is "new wires default to
    // async" (`asyncRegionModel.ts:96-123`).
    data: { variant: "async", color: FAMILY_INK[spec.family], routing },
  };
}

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

/**
 * One relationship, one bench — a deliberate departure from an earlier
 * single-hub layout that put all four families' ports on one small block:
 * `LabeledPort`'s inward text flows toward the block's own centre from
 * EVERY populated wall at once, and four walls converging on one box
 * collided into unreadable text regardless of how big the box was made.
 * Each specimen owning its own pair of blocks is both truer to the donor
 * (a real relationship IS two components, not one hub with many faces) and
 * is what actually keeps every label legible.
 */
function RelationshipBench({ spec, routing }: { spec: Specimen; routing: TraceRouting }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const edges = useMemo(() => PROTOCOL_LEGS[spec.family].map((_, i) => edgeForLeg(spec, i, routing)), [spec, routing]);
  const wires = useMemo(() => sceneWires({ edges }), [edges]);
  const wiredSet = wiredPorts({ edges });
  const items = railItemsFor(spec);
  const groups = railGroupsFor(spec);
  const groupMode = groups ? "grouped" : "off";
  const responderEdge = OPPOSITE_EDGE[spec.initiatorEdge];

  // Header-clearance override, per edge — see the module doc above. Folded
  // into one spec builder so the initiator/responder walls (which don't
  // share an edge, only the override RULE) read identically.
  function edgeSpec(edge: BlockSide, blockId: string) {
    return {
      items: withWiredState(items, blockId, wiredSet),
      portEdgeProps: { groups, groupMode, ...headerClearOverridesFor(edge) },
      distribution: headerClearDistributionFor(edge),
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div data-slot="wire-bench" data-bench={`comm-${spec.key}`} ref={containerRef} style={{ position: "relative", width: spec.bench.width, height: spec.bench.height }}>
        <Positioned x={spec.initiatorBox.x} y={spec.initiatorBox.y}>
          <BlockPort id={spec.initiatorId} view="simple" collapsePorts={false} edges={{ [spec.initiatorEdge]: edgeSpec(spec.initiatorEdge, spec.initiatorId) }}>
            <Block header={spec.initiatorId} width={spec.initiatorBox.w} height={spec.initiatorBox.h} showHeaderDivider={false} />
          </BlockPort>
        </Positioned>
        <Positioned x={spec.responderBox.x} y={spec.responderBox.y}>
          <BlockPort id={spec.responderId} view="simple" collapsePorts={false} edges={{ [responderEdge]: edgeSpec(responderEdge, spec.responderId) }}>
            <Block header={spec.responderId} width={spec.responderBox.w} height={spec.responderBox.h} showHeaderDivider={false} />
          </BlockPort>
        </Positioned>
        <WireLayer wires={wires} containerRef={containerRef} layoutKey={routing} />
      </div>
      <div data-slot="comm-caption" data-specimen={spec.key} style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: spec.bench.width }}>
        {spec.caption}
      </div>
    </div>
  );
}

function CommunicationGallery({ routing }: { routing: TraceRouting }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      {SPECIMENS.map((spec) => (
        <RelationshipBench key={spec.key} spec={spec} routing={routing} />
      ))}
    </div>
  );
}

function CommunicationPatternsStory() {
  const [routing, setRouting] = useState<TraceRouting>("curved");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="comm-routing" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          routing
        </label>
        <select
          id="comm-routing"
          data-testid="comm-routing"
          value={routing}
          onChange={(e) => setRouting(e.target.value as TraceRouting)}
          style={{ fontSize: 12 }}
        >
          <option value="curved">Curve</option>
          <option value="straight">Straight</option>
          <option value="elbow">Elbow</option>
        </select>
      </div>
      <CommunicationGallery routing={routing} />
      {/* Each bench already carries its OWN caption (`RelationshipBench`) —
       *  this is only the one line no bench can state: the family that was
       *  deliberately left out. */}
      <div data-slot="comm-caption-omission" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Topic — not drawn here: it's the parser's fallback reading of any un-annotated data edge, not a pattern anyone authors (`communicationAuthoring.ts:26-31`).
      </div>
    </div>
  );
}

const meta = {
  title: "Components/Blocks/Region/Async",
  tags: ["object:region", "lane:baseline"],
  component: WireLayer,
  args: { wires: [], containerRef: { current: null } },
} satisfies Meta<typeof WireLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ==================================================================== */
/* CommunicationPatterns                                                 */
/* ==================================================================== */

export const CommunicationPatterns: Story = {
  render: () => <CommunicationPatternsStory />,
  play: async ({ canvasElement }) => {
    // B3 — specimen count asserted against the authored list: total legs
    // across every relationship's own bench, not just "a wire exists
    // somewhere".
    const totalLegs = SPECIMENS.reduce((sum, s) => sum + PROTOCOL_LEGS[s.family].length, 0);
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-wire-id]")).toHaveLength(totalLegs));

    // Captions: one per specimen, plus the topic-omission line.
    const captions = canvasElement.querySelectorAll('[data-slot="comm-caption"]');
    await expect(captions).toHaveLength(SPECIMENS.length);
    const omission = required<HTMLElement>(canvasElement, '[data-slot="comm-caption-omission"]', "the topic-omission caption");
    await expect(omission.textContent).toContain("Topic");

    // All four `BlockSide`s genuinely appear as a POPULATED wall somewhere
    // in the gallery — the literal "across four edges" claim, checked
    // against the rails that actually rendered rather than assumed from
    // the fixture's own field names.
    const edgesSeen = new Set(Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-slot="block-port-rail"]')).map((r) => r.getAttribute("data-edge")));
    for (const edge of ["top", "right", "bottom", "left"]) {
      await expect(edgesSeen.has(edge)).toBe(true);
    }

    // I4 (docs/FEEDBACK-2026-09-17c-PLAN.md, Lane I, job 3): no port
    // label's rect may intersect its own block's header text rect. Every
    // label in the gallery, not a sample — see `assertNoLabelHeaderCollisions`.
    const { checked } = assertNoLabelHeaderCollisions(canvasElement);
    await expect(checked).toBe(16); // 6 (move) + 4 (health) + 2 (camera) + 4 (power)

    for (const spec of SPECIMENS) {
      const bench = benchOf(canvasElement, `comm-${spec.key}`);
      const svg = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
      const legs = PROTOCOL_LEGS[spec.family];
      // Leg count correct for this family (1 / 2 / 3, split style).
      const groupIds = legs.map((leg) => `${spec.key}-${leg.phase}`);
      for (const id of groupIds) {
        const group = await waitForWireGroup(bench, id);
        const line = traceLineOf(group);
        // Async dasharray on every wire (D-B6).
        await expect(line.getAttribute("stroke-dasharray")).toBe(ASYNC_PACKET_DASHARRAY);
        // Family ink.
        await expect(line.getAttribute("stroke")).toBe(FAMILY_INK[spec.family]);
      }
      await expect(bench.querySelectorAll("[data-wire-id]")).toHaveLength(legs.length);

      // B4 — the forward (carrier) leg's arrowhead sits at the RESPONDER,
      // never the initiator, measured from the rendered path.
      const forwardLeg = legs.find((l) => l.direction === "forward")!;
      const forwardGroup = await waitForWireGroup(bench, `${spec.key}-${forwardLeg.phase}`);
      const forwardLine = traceLineOf(forwardGroup);
      const portId = legPortId(spec, legs.indexOf(forwardLeg));
      expectMarkerAtDot(svg, forwardLine, dotOf(bench, spec.responderId, portId), dotOf(bench, spec.initiatorId, portId), `${spec.key} · forward leg arrowhead`);
    }

    // Routing switchable — read a live `data-routing` off `Trace`'s own
    // inner `[data-slot="trace-route"]` group (my own `[data-wire-id]`
    // wrapper carries no routing fact itself), never a static prop. One
    // control drives EVERY bench's `layoutKey`, so `move`'s bench is a
    // representative sample, not a special case.
    const moveBench = benchOf(canvasElement, "comm-move");
    const routingOf = (): string | null =>
      required<SVGGElement>(moveBench, '[data-wire-id="move-goal"] [data-slot="trace-route"]', "move-goal's trace-route group").getAttribute("data-routing");

    await waitForWireGroup(moveBench, "move-goal");
    await expect(routingOf()).toBe("curved");

    const select = required<HTMLSelectElement>(canvasElement, '[data-testid="comm-routing"]', "the routing control");
    await userEvent.selectOptions(select, "elbow");
    await waitFor(() => expect(routingOf()).toBe("elbow"));

    await userEvent.selectOptions(select, "straight");
    await waitFor(() => expect(routingOf()).toBe("straight"));
  },
};

/* ==================================================================== */
/* SummaryVsSplit — the donor's two cable styles, one fixture            */
/* ==================================================================== */

/**
 * `CommunicationCableStyle` (`communicationProjection.ts:52`): `split`
 * paints every protocol leg (what `CommunicationPatterns` already shows);
 * `summary` collapses a whole relationship onto its CARRIER leg
 * (`CARRIER_PHASE`, `portPlacementInference.ts:57-62`: service→request,
 * action→goal, stream→stream). Same Service relationship, two renders.
 */
function SummaryVsSplitBench({ style }: { style: "split" | "summary" }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const items: PortEdgeItem[] = [
    { id: "health.request", label: "health.request" },
    { id: "health.response", label: "health.response" },
  ];
  const edges = useMemo(() => {
    const all: SceneEdge<WireStyleData>[] = [
      { id: "sv-request", source: "client", sourceHandle: "health.request", target: "server", targetHandle: "health.request", data: { variant: "async", color: FAMILY_INK.service } },
      { id: "sv-response", source: "server", sourceHandle: "health.response", target: "client", targetHandle: "health.response", data: { variant: "async", color: FAMILY_INK.service } },
    ];
    return style === "split" ? all : all.filter((e) => e.id === "sv-request"); // request = the service carrier
  }, [style]);
  const wires = useMemo(() => sceneWires({ edges }), [edges]);
  const wiredSet = wiredPorts({ edges });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-foreground)" }}>{style}</div>
      <div data-slot="wire-bench" data-bench={`sv-${style}`} ref={containerRef} style={{ position: "relative", width: 340, height: 140 }}>
        <Positioned x={16} y={30}>
          <BlockPort id="client" view="port" edges={{ right: { items: withWiredState(items, "client", wiredSet), portEdgeProps: { groups: "health.request, health.response", groupMode: "grouped" } } }}>
            <Block header="client" width={130} height={80} />
          </BlockPort>
        </Positioned>
        <Positioned x={200} y={30}>
          <BlockPort id="server" view="port" edges={{ left: { items: withWiredState(items, "server", wiredSet), portEdgeProps: { groups: "health.request, health.response", groupMode: "grouped" } } }}>
            <Block header="server" width={130} height={80} />
          </BlockPort>
        </Positioned>
        <WireLayer wires={wires} containerRef={containerRef} />
      </div>
    </div>
  );
}

export const SummaryVsSplit: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, padding: "24px 32px" }}>
      <SummaryVsSplitBench style="split" />
      <SummaryVsSplitBench style="summary" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const split = benchOf(canvasElement, "sv-split");
    await waitFor(() => expect(split.querySelectorAll("[data-wire-id]")).toHaveLength(2));
    await expect(split.querySelector('[data-wire-id="sv-request"]')).not.toBeNull();
    await expect(split.querySelector('[data-wire-id="sv-response"]')).not.toBeNull();

    const summary = benchOf(canvasElement, "sv-summary");
    await waitFor(() => expect(summary.querySelectorAll("[data-wire-id]")).toHaveLength(1));
    // The ONE wire summary keeps is the carrier (request), never the response.
    await expect(summary.querySelector('[data-wire-id="sv-request"]')).not.toBeNull();
    await expect(summary.querySelector('[data-wire-id="sv-response"]')).toBeNull();
  },
};
