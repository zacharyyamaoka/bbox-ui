/**
 * Control Flow/Region Views — Zach's six sketches of 2026-09-22, one cell
 * each, captioned with his own words.
 *
 * The ask, verbatim: "Please create stories that show region in different
 * views. Simple: not support — but there is port and expanded, and expanded
 * opaque."
 *
 * Every drawing here is a PROP of the trunk `Region` (`components/
 * region.tsx`): `headerStyle`, `view="port"`, `opaqueFace="frame"`, the
 * square `onToggleView` toggle, `controlPorts` / `boundaryPorts` and the
 * wall-crossing `crossings`. Nothing is drawn by this file except the
 * outside blocks the cables come from.
 *
 * Where the numbers come from, so nothing here is a story-only invention:
 *   • the ORDINARY ports of the port view and of the opaque face are the
 *     region's boundary ports as `scene/regionView.ts`'s
 *     `projectOpaqueRegions` derives them — one `PromotedPort` per crossing
 *     cable, on the wall its inner end's polarity says — and the cables are
 *     the projection's own re-pointed edges;
 *   • the toggle drives `hosts/regionScene.ts`'s `toggleRegionView` on a real
 *     `HostScene`, so clicking the square flips ONE field and the projection
 *     does the rest;
 *   • the wall-crossing circles are `regionViews.layout.ts`'s `wallCrossings`
 *     over the polyline each wire was actually drawn on (`WireLayer`'s
 *     `onWireGeometry`), against the frame's measured box.
 *
 * The play function MEASURES (`getBoundingClientRect`, `getComputedStyle`).
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import type { BlockMember } from "../components/blockMembers";
import { BlockPort } from "../components/blockPort";
import type { PortEdgeItem } from "../components/portEdge";
import { Region, REGION_CORNER_BLOCK_STYLE, type RegionArm, type RegionHeaderStyle, type RegionHeading, type RegionPoint } from "../components/region";
import { REGION_CORNER_WIDTH_PX } from "../components/region.layout";
import { regionRailBandPx, wallCrossings } from "../components/regionViews.layout";
import type { Point } from "../components/trace.layout";
import { WireLayer } from "../components/wireLayer";
import type { Wire } from "../components/wiring";
import { hostPolarityOf, type HostNodeData, type HostScene } from "../hosts/hostScene";
import { regionViewOf, toggleRegionView } from "../hosts/regionScene";
import { REGION_NODE_TYPE } from "../scene/region";
import { projectOpaqueRegions } from "../scene/regionView";
import type { SceneNode } from "../scene/scene";

const meta = {
  title: "Control Flow/Region Views",
  tags: ["area:control-flow", "lane:region-views"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* Vocabulary — Zach's sketches label everything "Title", "Type" and    */
/* "port Any", so the gallery does too                                  */
/* ------------------------------------------------------------------ */

const HEADING: RegionHeading = { glyph: "lucide:circle", title: "Title", type: "Type" };
const TITLE_ONLY: RegionHeading = { title: "Title" };

const anyPort = (id: string): PortEdgeItem => ({ id, label: "port", type: "Any" });

/** "Child Member" — the plain box his expanded sketches fill a frame with. */
function childMember(id: string, x: number, y = 16): BlockMember {
  return { id, x, y, content: <Block width={112} header="Child Member" /> };
}

const THREE_CHILDREN = [childMember("c1", 16), childMember("c2", 144), childMember("c3", 272)];

/* ------------------------------------------------------------------ */
/* A cell                                                              */
/* ------------------------------------------------------------------ */

function Cell({ id, caption, note, children }: { id: string; caption: string; note?: ReactNode; children: ReactNode }) {
  return (
    <figure data-cell={id} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <figcaption style={{ fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>{caption}</span>
        {note !== undefined && <span className="text-muted-foreground"> — {note}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/** A frame whose square toggle flips it expanded ⇄ opaque. No scene: these
 *  sketches have no cables, so the flip is one local field. */
function ToggleableRegion({
  id,
  headerStyle,
  heading,
  initiallyOpaque = false,
  members,
  arms,
  width = 416,
  height,
}: {
  id: string;
  headerStyle: RegionHeaderStyle;
  heading: RegionHeading;
  initiallyOpaque?: boolean;
  members?: BlockMember[];
  arms?: RegionArm[];
  width?: number;
  height?: number;
}) {
  const [opaque, setOpaque] = useState(initiallyOpaque);
  return (
    <Region
      id={id}
      view={opaque ? "opaque" : "expanded"}
      opaqueFace="frame"
      headerStyle={headerStyle}
      heading={heading}
      members={members}
      arms={arms}
      width={width}
      height={height}
      onToggleView={() => setOpaque((value) => !value)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Wired regions — a real HostScene, projected                          */
/* ------------------------------------------------------------------ */

function portItems(node: SceneNode<HostNodeData>, side: "left" | "right"): PortEdgeItem[] {
  return (node.data.ports?.[side] ?? []).map(anyPort);
}

/** An ordinary block — the members inside, and the blocks outside the
 *  cables come from. Same body-band device `nodeViews.tsx` uses, so its
 *  dots sit inside the card, not under it. */
function SceneBlock({ node }: { node: SceneNode<HostNodeData> }) {
  const left = portItems(node, "left");
  const right = portItems(node, "right");
  const slots = Math.max(left.length, right.length);
  return (
    <BlockPort
      id={node.id}
      view="port"
      edges={{ ...(left.length > 0 ? { left: { items: left } } : null), ...(right.length > 0 ? { right: { items: right } } : null) }}
    >
      <Block width={node.data.w ?? 112} header={node.data.name} body={slots > 0 ? <div style={{ height: regionRailBandPx(slots) }} /> : undefined} />
    </BlockPort>
  );
}

/** Today's corner card (sketch 4-left): "Title Type", its left port and its
 *  two right ports — `REGION_CORNER_BLOCK_STYLE`, exactly as the hosts
 *  build it. */
function CornerCard({ node }: { node: SceneNode<HostNodeData> }) {
  const left = portItems(node, "left");
  const right = portItems(node, "right");
  return (
    <BlockPort id={node.id} view="port" edges={{ left: { items: left }, right: { items: right } }}>
      <Block
        width={REGION_CORNER_WIDTH_PX}
        header={
          <span>
            <span style={{ fontWeight: 600 }}>Title</span> <span className="text-muted-foreground">Type</span>
          </span>
        }
        body={<div style={{ height: regionRailBandPx(Math.max(left.length, right.length)) }} />}
        style={REGION_CORNER_BLOCK_STYLE}
      />
    </BlockPort>
  );
}

function sameCrossings(a: readonly RegionPoint[], b: readonly RegionPoint[]): boolean {
  return a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 0.01 && Math.abs(p.y - b[i].y) < 0.01);
}

/**
 * The frame-local wall crossings of every live wire. Host glue, not kit:
 * it reads the DOM (the frame's box) and the drawn polylines `WireLayer`
 * reports, and hands `wallCrossings`' answer to the Region. Runs after
 * every render and settles by value, so a re-route or a re-layout is
 * picked up without a dependency list to get wrong.
 */
function useWallCrossings(benchRef: RefObject<HTMLDivElement | null>, regionId: string, liveWireIds: readonly string[], active: boolean) {
  const [paths, setPaths] = useState<Record<string, readonly Point[]>>({});
  const [crossings, setCrossings] = useState<RegionPoint[]>([]);
  // `null` is `WireLayer`'s retraction — the wire is no longer drawn — so
  // the entry is DELETED, never stored as a tombstone the lookup below
  // would have to step around.
  const onWireGeometry = useCallback((wireId: string, points: readonly Point[] | null) => {
    setPaths((previous) => {
      if (points) return { ...previous, [wireId]: points };
      if (!(wireId in previous)) return previous;
      const { [wireId]: _dropped, ...rest } = previous;
      return rest;
    });
  }, []);
  useLayoutEffect(() => {
    const bench = benchRef.current;
    const frame = bench?.querySelector<HTMLElement>(`[data-slot="region-frame"][data-region-id="${regionId}"]`);
    let next: RegionPoint[] = [];
    if (active && bench && frame) {
      const benchBox = bench.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const rect = { x: frameBox.left - benchBox.left, y: frameBox.top - benchBox.top, w: frameBox.width, h: frameBox.height };
      next = liveWireIds.flatMap((wireId) => (paths[wireId] ? wallCrossings(paths[wireId], rect) : []));
    }
    setCrossings((previous) => (sameCrossings(previous, next) ? previous : next));
  });
  return { crossings, onWireGeometry };
}

interface WiredSpec {
  scene: HostScene;
  regionId: string;
  headerStyle: RegionHeaderStyle;
  /** Sketch 1: the region drawn as a block. No toggle in that view. */
  port?: boolean;
  bench: { w: number; h: number };
}

function WiredRegion({ spec }: { spec: WiredSpec }) {
  const [scene, setScene] = useState(spec.scene);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const node = scene.nodes.find((candidate) => candidate.id === spec.regionId)!;
  const view = spec.port ? "port" : regionViewOf(node);

  // The projection is the whole source of the ordinary ports AND of the
  // painted cables: an opaque (or port-view) region's crossing edges are
  // re-pointed at its promoted ports, its interior and port-inner edges
  // dropped.
  const projection = useMemo(
    () =>
      projectOpaqueRegions(scene, {
        isOpaque: (candidate) => candidate.id === spec.regionId && view !== "expanded",
        directionOf: hostPolarityOf(scene),
      }),
    [scene, spec.regionId, view],
  );
  const wires: Wire[] = useMemo(
    () =>
      projection.edges.map((edge) => ({
        id: edge.id,
        from: { blockId: edge.source, portId: edge.sourceHandle ?? "" },
        to: { blockId: edge.target, portId: edge.targetHandle ?? "" },
        routing: "curved",
      })),
    [projection],
  );
  const promoted = projection.regions[0]?.ports ?? [];
  const boundaryPorts = {
    left: promoted.filter((port) => port.side === "left").map((port) => anyPort(port.id)),
    right: promoted.filter((port) => port.side === "right").map((port) => anyPort(port.id)),
  };
  const { crossings, onWireGeometry } = useWallCrossings(
    benchRef,
    spec.regionId,
    wires.map((wire) => wire.id),
    view === "expanded",
  );

  const outside = scene.nodes.filter((candidate) => candidate.parentId === undefined && candidate.id !== spec.regionId);
  const members: BlockMember[] = scene.nodes
    .filter((candidate) => candidate.parentId === spec.regionId)
    .map((kid) => ({ id: kid.id, x: kid.position.x, y: kid.position.y, width: "own", content: <SceneBlock node={kid} /> }));

  return (
    <div ref={benchRef} data-bench={spec.regionId} style={{ position: "relative", width: spec.bench.w, height: spec.bench.h }}>
      {outside.map((block) => (
        <div key={block.id} style={{ position: "absolute", left: block.position.x, top: block.position.y }}>
          <SceneBlock node={block} />
        </div>
      ))}
      <div style={{ position: "absolute", left: node.position.x, top: node.position.y }}>
        <Region
          id={spec.regionId}
          view={view}
          opaqueFace="frame"
          headerStyle={spec.headerStyle}
          heading={HEADING}
          corner={<CornerCard node={node} />}
          controlPorts={portItems(node, "left")}
          boundaryPorts={boundaryPorts}
          members={members}
          width={node.data.w}
          height={node.data.h}
          crossings={crossings}
          onToggleView={spec.port ? undefined : () => setScene((current) => toggleRegionView(current, spec.regionId))}
        />
      </div>
      <WireLayer wires={wires} containerRef={benchRef} layoutKey={view} onWireGeometry={onWireGeometry} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const block = (id: string, x: number, y: number, ports: HostNodeData["ports"], parentId?: string): SceneNode<HostNodeData> => ({
  id,
  type: "block",
  position: { x, y },
  ...(parentId === undefined ? null : { parentId }),
  data: { name: parentId === undefined ? "Outside" : "Child Member", view: "port", w: parentId === undefined ? 112 : 150, ports },
});

/**
 * Sketch 1 — "Port". One cable in from the left, two out to the right, and
 * one into the region's control port: the projection promotes the first
 * three to one left and two right boundary ports; the control port is the
 * region's own.
 */
const PORT_SCENE: WiredSpec = {
  regionId: "rp",
  headerStyle: "corner-card",
  port: true,
  bench: { w: 560, h: 260 },
  scene: {
    nodes: [
      { id: "rp", type: REGION_NODE_TYPE, position: { x: 170, y: 30 }, data: { name: "Title", region: { kind: "loop" }, ports: { left: ["c"] }, w: 420, h: 220 } },
      block("rp-a", 20, 20, { left: ["i"], right: ["o"] }, "rp"),
      block("rp-b", 200, 20, { left: ["i"], right: ["o", "p"] }, "rp"),
      block("rp-ctl", 0, 0, { right: ["o"] }),
      block("rp-src", 0, 130, { right: ["o"] }),
      block("rp-dst1", 440, 30, { left: ["i"] }),
      block("rp-dst2", 440, 150, { left: ["i"] }),
    ],
    edges: [
      { id: "rp-e-ctl", source: "rp-ctl", sourceHandle: "o", target: "rp", targetHandle: "c" },
      { id: "rp-e-in", source: "rp-src", sourceHandle: "o", target: "rp-a", targetHandle: "i" },
      { id: "rp-e-mid", source: "rp-a", sourceHandle: "o", target: "rp-b", targetHandle: "i" },
      { id: "rp-e-out1", source: "rp-b", sourceHandle: "o", target: "rp-dst1", targetHandle: "i" },
      { id: "rp-e-out2", source: "rp-b", sourceHandle: "p", target: "rp-dst2", targetHandle: "i" },
    ],
  },
};

/**
 * Sketch 4 — "w/ ports": today's corner card (a left control port, two
 * right ports feeding the inside), two wired members, and two cables that
 * cross the frame from outside: one in through the left wall, one out
 * through the right.
 */
function sketch4Scene(regionId: string, view: "expanded" | "opaque"): HostScene {
  const kid = (id: string) => `${regionId}-${id}`;
  return {
    nodes: [
      {
        id: regionId,
        type: REGION_NODE_TYPE,
        position: { x: 140, y: 10 },
        data: { name: "Title", region: { kind: "loop", view }, ports: { left: ["c"], right: ["i1", "i2"] }, w: 520, h: 300 },
      },
      block(kid("m1"), 170, 16, { left: ["a", "b"], right: ["o"] }, regionId),
      block(kid("m2"), 340, 40, { left: ["a", "b"], right: ["o"] }, regionId),
      block(kid("ctl"), 0, 16, { right: ["o"] }),
      block(kid("src"), 0, 200, { right: ["o"] }),
      block(kid("dst"), 700, 210, { left: ["i"] }),
    ],
    edges: [
      { id: kid("e-ctl"), source: kid("ctl"), sourceHandle: "o", target: regionId, targetHandle: "c" },
      { id: kid("e-i1"), source: regionId, sourceHandle: "i1", target: kid("m1"), targetHandle: "a" },
      { id: kid("e-i2"), source: regionId, sourceHandle: "i2", target: kid("m2"), targetHandle: "b" },
      { id: kid("e-mid"), source: kid("m1"), sourceHandle: "o", target: kid("m2"), targetHandle: "a" },
      { id: kid("e-in"), source: kid("src"), sourceHandle: "o", target: kid("m1"), targetHandle: "b" },
      { id: kid("e-out"), source: kid("m2"), sourceHandle: "o", target: kid("dst"), targetHandle: "i" },
    ],
  };
}

/**
 * Sketch 6 — the full-width header with `controlCount` control ports
 * stacked at its left end (the first one wired from outside), two wired
 * members, a cable in through the left wall and one out through the right.
 */
function sketch6Scene(regionId: string, controlCount: number): HostScene {
  const kid = (id: string) => `${regionId}-${id}`;
  const control = Array.from({ length: controlCount }, (_, index) => `c${index + 1}`);
  const top = 20 + Math.max(controlCount, 1) * 42;
  return {
    nodes: [
      {
        id: regionId,
        type: REGION_NODE_TYPE,
        position: { x: 140, y: 10 },
        data: { name: "Title", region: { kind: "group" }, ports: controlCount > 0 ? { left: control } : {}, w: 460, h: top + 140 },
      },
      block(kid("m1"), 60, 24, { left: ["a"], right: ["o"] }, regionId),
      block(kid("m2"), 270, 24, { left: ["a"], right: ["o"] }, regionId),
      ...(controlCount > 0 ? [block(kid("ctl"), 0, 0, { right: ["o"] })] : []),
      block(kid("src"), 0, top + 30, { right: ["o"] }),
      block(kid("dst"), 640, top + 30, { left: ["i"] }),
    ],
    edges: [
      ...(controlCount > 0 ? [{ id: kid("e-ctl"), source: kid("ctl"), sourceHandle: "o", target: regionId, targetHandle: "c1" }] : []),
      { id: kid("e-mid"), source: kid("m1"), sourceHandle: "o", target: kid("m2"), targetHandle: "a" },
      { id: kid("e-in"), source: kid("src"), sourceHandle: "o", target: kid("m1"), targetHandle: "a" },
      { id: kid("e-out"), source: kid("m2"), sourceHandle: "o", target: kid("dst"), targetHandle: "i" },
    ],
  };
}

/** Every wired cell's cables that cross the frame — an edge with exactly one
 *  end inside the region. Counted off the FIXTURE, independently of the
 *  geometry, so "one marker per crossing" has something to be wrong about. */
function crossingEdgeCount(scene: HostScene, regionId: string): number {
  const inside = new Set(scene.nodes.filter((node) => node.parentId === regionId).map((node) => node.id));
  return scene.edges.filter((edge) => inside.has(edge.source) !== inside.has(edge.target) && edge.source !== regionId && edge.target !== regionId).length;
}

const WIRED_CELLS = {
  "w-ports": { regionId: "r4", headerStyle: "corner-card", bench: { w: 820, h: 320 }, scene: sketch4Scene("r4", "expanded") },
  "w-opaque": { regionId: "r4o", headerStyle: "corner-card", bench: { w: 820, h: 320 }, scene: sketch4Scene("r4o", "opaque") },
  "fw": { regionId: "r6a", headerStyle: "full-width", bench: { w: 760, h: 230 }, scene: sketch6Scene("r6a", 0) },
  "fw-1": { regionId: "r6b", headerStyle: "full-width", bench: { w: 760, h: 230 }, scene: sketch6Scene("r6b", 1) },
  "fw-3": { regionId: "r6c", headerStyle: "full-width", bench: { w: 760, h: 320 }, scene: sketch6Scene("r6c", 3) },
} satisfies Record<string, WiredSpec>;

/* ------------------------------------------------------------------ */
/* The gallery                                                         */
/* ------------------------------------------------------------------ */

function BranchesRegion() {
  const [open, setOpen] = useState<Record<string, boolean>>({ a: true, b: true, c: false });
  const arm = (id: string, title: string, members: BlockMember[], bodyHeight: number): RegionArm => ({
    id,
    title,
    open: open[id],
    onOpenChange: (next) => setOpen((current) => ({ ...current, [id]: next })),
    bodyHeight,
    members,
  });
  return (
    <ToggleableRegion
      id="r5"
      headerStyle="full-width"
      heading={HEADING}
      arms={[
        arm("a", "branch A", [childMember("a1", 16, 12), childMember("a2", 144, 12), childMember("a3", 272, 12)], 76),
        arm("b", "branch B", [], 56),
        arm("c", "branch C", [], 56),
      ]}
    />
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start" }}>{children}</div>;
}

function Gallery() {
  return (
    <div data-slot="region-views-gallery" style={{ display: "flex", flexDirection: "column", gap: 56, padding: 8 }}>
      <Row>
        <Cell id="port" caption="Port" note="control ports, a line, then the ordinary ports">
          <WiredRegion spec={PORT_SCENE} />
        </Cell>
        <Cell id="simple" caption="Simple — not supported for regions" note={'Zach, 2026-09-22: "Simple: not support". Use Port.'}>
          <p data-slot="region-view-unsupported" className="text-muted-foreground" style={{ margin: 0, maxWidth: 260, fontSize: 13 }}>
            A region has no Simple view. There is deliberately nothing to render here — the collapsed form of a region is the Port view.
          </p>
        </Cell>
      </Row>
      <Row>
        <Cell id="tab" caption="Expanded (Title tab)">
          <ToggleableRegion id="r2a" headerStyle="corner-tab" heading={TITLE_ONLY} members={THREE_CHILDREN} height={150} />
        </Cell>
        <Cell id="tab-full" caption="With icon and type">
          <ToggleableRegion id="r2b" headerStyle="corner-tab-full" heading={HEADING} members={THREE_CHILDREN} height={150} />
        </Cell>
        <Cell id="full" caption="w/ Full Width Header">
          <ToggleableRegion id="r2c" headerStyle="full-width" heading={HEADING} members={THREE_CHILDREN} height={150} />
        </Cell>
        <Cell id="opaque" caption="Expanded Opaque" note="w/ opaque toggled">
          <ToggleableRegion id="r3" headerStyle="corner-tab-full" heading={HEADING} members={THREE_CHILDREN} height={150} initiallyOpaque />
        </Cell>
      </Row>
      <Row>
        <Cell id="w-ports" caption="w/ ports">
          <WiredRegion spec={WIRED_CELLS["w-ports"]} />
        </Cell>
        <Cell id="w-opaque" caption="w/ opaque toggled" note="Line here shows visible split of control ports vs input ports">
          <WiredRegion spec={WIRED_CELLS["w-opaque"]} />
        </Cell>
      </Row>
      <Row>
        <Cell id="branches" caption="With Branches" note="w/ Full Width Block Header">
          <BranchesRegion />
        </Cell>
      </Row>
      <Row>
        <Cell id="fw" caption="w/ full width header">
          <WiredRegion spec={WIRED_CELLS.fw} />
        </Cell>
        <Cell id="fw-1" caption="w/ full width header and ports" note="×1">
          <WiredRegion spec={WIRED_CELLS["fw-1"]} />
        </Cell>
        <Cell id="fw-3" caption="w/ full width header and ports" note="×3">
          <WiredRegion spec={WIRED_CELLS["fw-3"]} />
        </Cell>
      </Row>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Measurements                                                        */
/* ------------------------------------------------------------------ */

const PX = 1;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function cellOf(root: ParentNode, id: string): HTMLElement {
  return required<HTMLElement>(root, `[data-cell="${id}"]`, `cell ${id}`);
}

function regionIn(cell: ParentNode): HTMLElement {
  return required<HTMLElement>(cell, '[data-slot="region"]', "a region");
}

function frameIn(cell: ParentNode): DOMRect {
  return required<HTMLElement>(cell, '[data-slot="region-frame"]', "the frame").getBoundingClientRect();
}

function faceIn(cell: ParentNode): DOMRect {
  return required<HTMLElement>(cell, '[data-slot="region-opaque-face"] [data-slot="block"]', "the opaque face").getBoundingClientRect();
}

function toggleIn(cell: ParentNode): HTMLElement {
  return required<HTMLElement>(cell, '[data-slot="region-view-toggle"]', "the view toggle");
}

function toggleFill(cell: ParentNode): string {
  return getComputedStyle(required<SVGElement>(toggleIn(cell), "svg", "the toggle's square")).fill;
}

function centre(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The dots of `regionId`'s own interface, by port id. */
function dotsOf(cell: ParentNode, regionId: string, portIds: readonly string[]): DOMRect[] {
  const card = required<HTMLElement>(cell, `[data-block-id="${regionId}"]`, `the interface card of ${regionId}`);
  return portIds.map((portId) => required<HTMLElement>(card, `[data-port-id="${portId}"]`, `dot ${portId}`).getBoundingClientRect());
}

/** Tab styles: the tab is IN the frame's top-left corner and much smaller than it. */
function expectTabInCorner(cell: ParentNode): void {
  const frame = frameIn(cell);
  const tab = required<HTMLElement>(cell, '[data-slot="region-tab"]', "the tab").getBoundingClientRect();
  expect(Math.abs(tab.left - frame.left)).toBeLessThanOrEqual(PX);
  expect(Math.abs(tab.top - frame.top)).toBeLessThanOrEqual(PX);
  expect(tab.width).toBeLessThan(frame.width / 2);
  expect(tab.height).toBeLessThan(frame.height / 3);
}

/** Full width: the header card spans the frame edge to edge (±1px), from its top. */
function expectFullWidthHeader(cell: ParentNode, regionId: string): void {
  const frame = frameIn(cell);
  const header = required<HTMLElement>(cell, `[data-slot="region-corner"] [data-block-id="${regionId}"] [data-slot="block"]`, "the full-width header").getBoundingClientRect();
  expect(Math.abs(header.left - frame.left)).toBeLessThanOrEqual(PX);
  expect(Math.abs(header.right - frame.right)).toBeLessThanOrEqual(PX);
  expect(Math.abs(header.top - frame.top)).toBeLessThanOrEqual(PX);
  // The id rule: ONE `[data-block-id=<region>]` under the region, and it is
  // the header — never the root or the frame.
  const region = regionIn(cell);
  expect(region.querySelectorAll(`[data-block-id="${regionId}"]`).length).toBe(1);
  expect(region.hasAttribute("data-block-id")).toBe(false);
  expect(required<HTMLElement>(region, '[data-slot="region-frame"]', "the frame").hasAttribute("data-block-id")).toBe(false);
}

/** The toggle sits in the top-right of `box`, within its top band. */
function expectToggleTopRight(cell: ParentNode, box: DOMRect, bandPx: number): void {
  const toggle = toggleIn(cell).getBoundingClientRect();
  expect(toggle.right).toBeLessThanOrEqual(box.right + PX);
  expect(box.right - toggle.right).toBeLessThanOrEqual(8);
  expect(toggle.top).toBeGreaterThanOrEqual(box.top - PX);
  expect(toggle.bottom).toBeLessThanOrEqual(box.top + Math.max(bandPx, toggle.height + 8) + PX);
}

/** Opaque face: no member is rendered, and glyph/Title/Type sit centred. */
function expectOpaqueFace(cell: ParentNode, regionId: string): void {
  const region = regionIn(cell);
  expect(region.getAttribute("data-region-view")).toBe("opaque");
  expect(region.querySelector('[data-slot="region-frame"]')).toBeNull();
  expect(region.querySelector('[data-slot="block-members"]')).toBeNull();
  // One block — the face itself; no member card survives.
  expect(region.querySelectorAll('[data-slot="block"]').length).toBe(1);
  expect(region.querySelectorAll("[data-block-id]").length).toBe(1);
  expect(region.querySelector(`[data-block-id="${regionId}"]`)).not.toBeNull();
  const face = centre(faceIn(cell));
  const title = centre(required<HTMLElement>(region, '[data-slot="block-opaque-title"]', "the opaque title").getBoundingClientRect());
  expect(Math.abs(title.x - face.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(title.y - face.y)).toBeLessThanOrEqual(2);
}

/** The split line lies strictly between the control dots and every
 *  ordinary dot, on both walls. */
function expectSplitBetween(cell: ParentNode, control: DOMRect[], ordinary: DOMRect[]): DOMRect {
  const line = required<HTMLElement>(cell, '[data-slot="region-control-split"]', "the split line").getBoundingClientRect();
  const splitY = line.bottom - PX / 2;
  // A painted line, not a zero-width box: it spans the section it splits.
  expect(line.width).toBeGreaterThan(40);
  for (const dot of control) expect(dot.bottom).toBeLessThan(splitY);
  for (const dot of ordinary) expect(dot.top).toBeGreaterThan(splitY);
  return line;
}

/** Every marker's centre is on the frame's border (±1px), one per crossing. */
function expectMarkersOnWalls(cell: ParentNode, expected: number): void {
  const frame = frameIn(cell);
  const markers = [...cell.querySelectorAll<HTMLElement>('[data-slot="region-crossing"]')];
  expect(markers.length).toBe(expected);
  for (const marker of markers) {
    const { x, y } = centre(marker.getBoundingClientRect());
    const onVertical = (Math.abs(x - frame.left) <= PX || Math.abs(x - frame.right) <= PX) && y >= frame.top - PX && y <= frame.bottom + PX;
    const onHorizontal = (Math.abs(y - frame.top) <= PX || Math.abs(y - frame.bottom) <= PX) && x >= frame.left - PX && x <= frame.right + PX;
    expect(onVertical || onHorizontal, `marker at (${x.toFixed(1)}, ${y.toFixed(1)}) is not on the frame border ${JSON.stringify(frame)}`).toBe(true);
    // Decorative: never a port, never bindable.
    expect(marker.closest("[data-port-id]")).toBeNull();
    expect(getComputedStyle(marker.parentElement!).pointerEvents).toBe("none");
  }
}

function expectWiresResolved(cell: ParentNode): void {
  expect(required<SVGElement>(cell, '[data-slot="wire-layer"]', "the wire layer").getAttribute("data-unresolved-wires")).toBe("");
}

export const Gallery_: Story = {
  name: "Gallery",
  render: () => <Gallery />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Simple — not supported for regions");

    await step("Port: control ports, then the split line, then the ordinary ports", async () => {
      const cell = cellOf(canvasElement, "port");
      await waitFor(() => {
        expect(regionIn(cell).getAttribute("data-region-view")).toBe("port");
        const control = dotsOf(cell, "rp", ["c"]);
        const ordinary = dotsOf(cell, "rp", ["rp-a/i", "rp-b/o", "rp-b/p"]);
        expectSplitBetween(cell, control, ordinary);
        expectWiresResolved(cell);
      });
    });

    await step("Tabs sit in the top-left corner and are smaller than the frame", async () => {
      await waitFor(() => {
        expectTabInCorner(cellOf(canvasElement, "tab"));
        expectTabInCorner(cellOf(canvasElement, "tab-full"));
      });
      // The plain tab carries the title alone; the full one glyph + title + type.
      expect(cellOf(canvasElement, "tab").querySelector('[data-slot="region-heading-type"]')).toBeNull();
      expect(cellOf(canvasElement, "tab-full").querySelector('[data-slot="region-heading-type"]')).not.toBeNull();
    });

    await step("Full-width headers span the frame ±1px and own the region's one block id", async () => {
      await waitFor(() => {
        expectFullWidthHeader(cellOf(canvasElement, "full"), "r2c");
        expectFullWidthHeader(cellOf(canvasElement, "branches"), "r5");
        expectFullWidthHeader(cellOf(canvasElement, "fw"), "r6a");
        expectFullWidthHeader(cellOf(canvasElement, "fw-1"), "r6b");
        expectFullWidthHeader(cellOf(canvasElement, "fw-3"), "r6c");
      });
      // The control ports live INSIDE the header bar, and resolve.
      for (const [id, regionId, ports] of [
        ["fw-1", "r6b", ["c1"]],
        ["fw-3", "r6c", ["c1", "c2", "c3"]],
      ] as const) {
        const cell = cellOf(canvasElement, id);
        const header = required<HTMLElement>(cell, `[data-block-id="${regionId}"] [data-slot="block"]`, "the header").getBoundingClientRect();
        for (const dot of dotsOf(cell, regionId, ports)) {
          expect(centre(dot).y).toBeGreaterThan(header.top);
          expect(centre(dot).y).toBeLessThan(header.bottom);
          expect(Math.abs(centre(dot).x - header.left)).toBeLessThanOrEqual(PX);
        }
        await waitFor(() => expectWiresResolved(cell));
      }
    });

    await step("The toggle: top-right, hollow while expanded, filled while opaque", async () => {
      for (const id of ["tab", "tab-full", "w-ports"]) expectToggleTopRight(cellOf(canvasElement, id), frameIn(cellOf(canvasElement, id)), 32);
      for (const id of ["full", "fw", "fw-3"]) {
        const cell = cellOf(canvasElement, id);
        const header = required<HTMLElement>(cell, '[data-slot="region-corner"] [data-slot="block"]', "the header").getBoundingClientRect();
        expectToggleTopRight(cell, frameIn(cell), header.height);
      }
      for (const id of ["opaque", "w-opaque"]) expectToggleTopRight(cellOf(canvasElement, id), faceIn(cellOf(canvasElement, id)), 32);
      const hollow = toggleFill(cellOf(canvasElement, "tab"));
      const filled = toggleFill(cellOf(canvasElement, "opaque"));
      expect(hollow).toBe("none");
      expect(filled).not.toBe("none");
      expect(filled).not.toBe(hollow);
      expect(toggleIn(cellOf(canvasElement, "tab")).getAttribute("data-state")).toBe("expanded");
      expect(toggleIn(cellOf(canvasElement, "opaque")).getAttribute("data-state")).toBe("opaque");
    });

    await step("Expanded Opaque: no member, the title centred", async () => {
      expectOpaqueFace(cellOf(canvasElement, "opaque"), "r3");
    });

    await step("w/ opaque toggled: the L split boxes the control port; crossings are wall ports", async () => {
      const cell = cellOf(canvasElement, "w-opaque");
      await waitFor(() => {
        expectOpaqueFace(cell, "r4o");
        const control = dotsOf(cell, "r4o", ["c"]);
        const ordinary = dotsOf(cell, "r4o", ["r4o-m1/b", "r4o-m2/o"]);
        const line = expectSplitBetween(cell, control, ordinary);
        // The L's upright is right of the control dot: the dot is IN the box.
        for (const dot of control) expect(centre(dot).x).toBeLessThan(line.right);
        const face = faceIn(cell);
        // The two crossings became real ports ON the walls: left and right.
        expect(Math.abs(centre(ordinary[0]).x - face.left)).toBeLessThanOrEqual(PX);
        expect(Math.abs(centre(ordinary[1]).x - face.right)).toBeLessThanOrEqual(PX);
        expectWiresResolved(cell);
      });
    });

    await step("Crossing markers: one per crossing, centred on the frame border", async () => {
      for (const id of ["w-ports", "fw", "fw-1", "fw-3"] as const) {
        const spec = WIRED_CELLS[id];
        const expected = crossingEdgeCount(spec.scene, spec.regionId);
        expect(expected).toBe(2);
        await waitFor(() => expectMarkersOnWalls(cellOf(canvasElement, id), expected));
      }
      // The opaque face has no crossings — they are ports now.
      expect(cellOf(canvasElement, "w-opaque").querySelectorAll('[data-slot="region-crossing"]').length).toBe(0);
    });

    await step("With Branches: branch C is folded to its header row", async () => {
      const cell = cellOf(canvasElement, "branches");
      const row = (armId: string) => required<HTMLElement>(cell, `[data-arm-id="${armId}"]`, `arm ${armId}`);
      const header = required<HTMLElement>(row("c"), '[data-slot="region-arm-header"]', "C's header").getBoundingClientRect();
      const c = row("c").getBoundingClientRect();
      expect(row("c").getAttribute("data-open")).toBe("false");
      expect(row("c").querySelector('[data-slot="region-arm-body"]')).toBeNull();
      expect(Math.abs(c.height - header.height)).toBeLessThanOrEqual(PX);
      expect(c.height).toBeLessThan(row("b").getBoundingClientRect().height);
      expect(row("a").querySelectorAll('[data-slot="block"]').length).toBe(3);
      expect(row("b").querySelectorAll('[data-slot="block"]').length).toBe(0);
    });

    await step("Clicking the square flips w/ ports to opaque and back (toggleRegionView)", async () => {
      const cell = cellOf(canvasElement, "w-ports");
      await userEvent.click(toggleIn(cell));
      await waitFor(() => {
        expectOpaqueFace(cell, "r4");
        expect(toggleFill(cell)).not.toBe("none");
        expectWiresResolved(cell);
        expect(cell.querySelectorAll('[data-slot="region-crossing"]').length).toBe(0);
      });
      await userEvent.click(toggleIn(cell));
      await waitFor(() => {
        expect(regionIn(cell).getAttribute("data-region-view")).toBe("expanded");
        expect(toggleFill(cell)).toBe("none");
        expectMarkersOnWalls(cell, 2);
      });
    });
  },
};
