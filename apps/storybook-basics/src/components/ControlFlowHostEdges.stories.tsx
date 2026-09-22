/**
 * Components/Blocks/Region/Host Edges — the gap docs/CONTROL-FLOW-PLAN.md §1 marks with
 * two ⚠️ rows, closed and measured.
 *
 * Every interesting control-flow cable lands on a block INSIDE something: a
 * value entering a loop's body, a branch arm's block feeding a consumer
 * outside. Until this lane neither canvas host could draw one.
 * `hostScene.ts:75-82` had already recorded why, as a finding rather than a
 * fix: "an edge into a member … has no React Flow rendering — members are
 * drawn INSIDE their parent by the view kit, so they are not React Flow
 * nodes", and tldraw's `endPoint` looked up `anchors[blockId]` +
 * `shapeIdForNode(blockId)`, neither of which a member has.
 *
 * ONE seam closed it for both engines — `portDotSightings.ts`'s
 * `{ members: true }`. The member's dot is already rendered, inside its
 * parent's box; sighting it yields an anchor of the node that DRAWS it,
 * named `portKey(member, port)`. React Flow mounts a `<Handle>` there and
 * re-points the edge end at the ancestor (`reactFlowHost.tsx`'s
 * `anchorEnd`); tldraw walks the same ancestor chain in `endPoint` and looks
 * the anchor up by the same key. Neither engine learned anything about
 * regions, and the SCENE RECORD IS UNTOUCHED — `e-kid-in` still says
 * `target: "kid"`, `wiredPorts` still marks `kid/in` wired, and the DOM host
 * still resolves it by `[data-block-id]`. The wire's MEANING never moved;
 * only its anchor did.
 *
 * What is asserted here is spatial, so it is measured: the rendered path's
 * own END point (`getPointAtLength(getTotalLength())`, converted to screen
 * space) against the member dot's own `getBoundingClientRect` centre. A
 * `data-id` present in the DOM proves React Flow kept the edge object, not
 * that it drew it anywhere near the dot — which is exactly the failure this
 * lane exists to rule out.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { TRACE_TERMINAL_GAP } from "./trace";
import { dragFrom } from "../hosts/hostGestures";
import { HOST_SCENE, type HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import { expectMemberInside } from "./region.acceptance";

const meta = {
  title: "Components/Blocks/Region/Host Edges",
  tags: ["object:region", "host:react-flow", "host:tldraw", "lane:control-flow"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/**
 * How close the painted end has to sit to the dot it claims to land on.
 *
 * 14px is a hair under one port card's height and well under the ~36px
 * member gutter — a wire anchored to the PARENT's box instead of the
 * member's (the bug this lane fixes) misses by tens of px, so this cannot
 * pass by accident. It is not zero because the two hosts arrive at the dot
 * by different geometry: React Flow's bezier ends on the measured handle
 * centre, tldraw's `Trace` stops `TRACE_TERMINAL_GAP` short of the terminal
 * so its arrowhead and disc stay visible (trace.tsx:604-617).
 */
const MEMBER_ANCHOR_TOLERANCE_PX = 14;

/**
 * `HOST_SCENE`, plus exactly the thing that fixture deliberately lacks.
 *
 * Its own doc explains the omission: "Every edge connects TOP-LEVEL,
 * port-bearing nodes on purpose … the shared fixture stays inside what BOTH
 * hosts can honor." That was honest when neither host could route to a
 * member. It is also what makes it the right baseline to EXTEND here rather
 * than edit (`hostScene.ts` belongs to lanes A/E this round, and
 * `SceneHosts.stories.tsx` pins its exact node/edge set): same nodes, same
 * three edges, plus a `src` block and the two crossing cables — one INTO the
 * member (`src/out → kid/in`) and one OUT of it (`kid/out → sink/cfg`).
 *
 * `kid` gains a right wall so it can source a cable as well as sink one;
 * that is a port id in this story's own copy of the node, not a change to
 * the shared literal.
 */
const MEMBER_EDGE_SCENE: HostScene = {
  nodes: [
    ...HOST_SCENE.nodes.map((node) =>
      node.id === "kid" ? { ...node, data: { ...node.data, ports: { left: ["in"], right: ["out"] } } } : node,
    ),
    // Below proc, in the one strip clear of BOTH hosts' own chrome: React
    // Flow's `Controls` panel occupies the bottom-left corner and tldraw's
    // toolbar the bottom-centre, so a wider or further-left `src` renders its
    // own `out` dot underneath one of them and the capture stops being
    // readable. Measured against both hosts at zoom 1, not guessed.
    { id: "src", type: "block", position: { x: 44, y: 300 }, data: { name: "src", view: "port", w: 72, h: 56, ports: { right: ["out"] } } },
  ],
  edges: [
    ...HOST_SCENE.edges,
    { id: "e-kid-in", source: "src", sourceHandle: "out", target: "kid", targetHandle: "in" },
    { id: "e-kid-out", source: "kid", sourceHandle: "out", target: "sink", targetHandle: "cfg" },
  ],
};

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={720} height={400} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

function StatefulTldraw({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <TldrawHost scene={scene} onSceneChange={setScene} width={720} height={400} />;
}

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/** A point on a rendered path, in SCREEN px — `getScreenCTM` carries every
 *  transform between the path's user space and the viewport (React Flow's
 *  viewport div, tldraw's camera layer), which is why the comparison against
 *  a `getBoundingClientRect` centre is apples to apples. Same device as
 *  `controlFlow.acceptance.ts`'s own `sampledPoints`. */
function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const ctm = path.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the path mounted?");
  const local = path.getPointAtLength(length);
  const screen = new DOMPoint(local.x, local.y).matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

/**
 * The rendered dot's own centre — the oracle. Read from the DOM the view kit
 * stamped, never from the numbers the host measured, or the host would be
 * grading its own measurement.
 *
 * WHY the ownership walk instead of the one-line
 * `[data-block-id=X] [data-port-id=p]` every earlier host story uses: once a
 * MEMBER has ports, that selector is ambiguous — kid is drawn inside proc, so
 * `[data-block-id="proc"] [data-port-id="out"]` matches kid's `out` dot too,
 * and `querySelector` hands back whichever comes first in document order.
 * Measured while writing this file: it resolved proc/out to kid's dot, 105px
 * away, and the assertion failed for a reason that had nothing to do with the
 * wire. Same rule `portDotSightings.ts`'s `dotOwnerId` and
 * `wireLayer.tsx:80-92` apply — the NEAREST `[data-block-id]` owns the dot.
 */
function dotCentre(host: HTMLElement, blockId: string, portId: string): { x: number; y: number } {
  const block = required<HTMLElement>(host, `[data-block-id="${blockId}"]`, `block \`${blockId}\``);
  const wrap = Array.from(block.querySelectorAll<HTMLElement>(`[data-port-id="${portId}"]`)).find(
    (candidate) => candidate.closest("[data-block-id]") === block,
  );
  if (!wrap) throw new Error(`expected ${blockId}/${portId}'s own dot`);
  const dot = wrap.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? wrap;
  const rect = dot.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const DIR_VECTOR: Record<string, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Where tldraw's painted line is CONTRACTUALLY supposed to stop for a dot
 *  on `side`: `TRACE_TERMINAL_GAP` back along the wall normal, so the
 *  arrowhead and the opaque terminal disc stay visible (trace.tsx:604-617).
 *  `SceneHostsTldraw.stories.tsx` uses the identical correction for every
 *  top-level wire it measures; a member's wire is measured the same way,
 *  which is the point — it is an ordinary wire now. */
function pulledBack(dot: { x: number; y: number }, side: keyof typeof DIR_VECTOR): { x: number; y: number } {
  return { x: dot.x + DIR_VECTOR[side].x * TRACE_TERMINAL_GAP, y: dot.y + DIR_VECTOR[side].y * TRACE_TERMINAL_GAP };
}

/** React Flow's own edge element, down to the TRUNK's paint — `TraceEdge`
 *  hands `TraceBody` a finished `d`, so the drawn line is
 *  `[data-slot="trace-line"]`, not the stock `react-flow__edge-path` a bare
 *  `<BaseEdge>` would carry. `:not([data-sketch="true"])` drops the sketch-
 *  skin overlay `TraceBody` paints alongside the crisp line (the same
 *  selector `SceneHostsTldraw.stories.tsx`'s three-host story established). */
function rfEdgePath(host: HTMLElement, edgeId: string): SVGPathElement {
  return required<SVGPathElement>(
    host,
    `.react-flow__edge[data-id="${edgeId}"] [data-slot="trace-line"]:not([data-sketch="true"])`,
    `React Flow's edge \`${edgeId}\``,
  );
}

function tldrawEdgePath(host: HTMLElement, edgeId: string): SVGPathElement {
  return required<SVGPathElement>(host, `[data-wire-id="${edgeId}"] [data-slot="trace-line"]`, `the overlay trace for \`${edgeId}\``);
}

/* ------------------------------------------------------------------ */
/* React Flow — the end lands on the member's dot                       */
/* ------------------------------------------------------------------ */

export const MemberEdgeReactFlow: Story = {
  name: "Edge Into A Member (ReactFlow)",
  render: () => <StatefulReactFlow initial={MEMBER_EDGE_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    await waitFor(
      () => {
        required(host, '[data-scene-node="proc"] [data-block-id="kid"] [data-port-id="in"]', "kid's in dot");
        expect(rfEdgePath(host, "e-kid-in").getTotalLength()).toBeGreaterThan(0);
        expect(rfEdgePath(host, "e-kid-out").getTotalLength()).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    /* The nesting the scene declares is the nesting the DOM shows: kid is
     * drawn inside proc and is NOT a canvas node of its own — which is
     * precisely why its edge had nowhere to land before this lane. */
    expectMemberInside(host, '[data-scene-node="proc"]', "kid");

    /* The claim, measured: the edge INTO the member ends at the member's
     * own dot. React Flow's `getBezierPath` runs handle-centre to
     * handle-centre, and `MeasuredPortHandles` puts that handle on the dot
     * — so no gap correction applies on this host. */
    await waitFor(() => {
      const end = screenPointAt(rfEdgePath(host, "e-kid-in"), rfEdgePath(host, "e-kid-in").getTotalLength());
      expect(distance(end, dotCentre(host, "kid", "in"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
    });

    /* …and the edge OUT of the member starts at it. Both directions,
     * because `anchorEnd` re-points source and target independently and a
     * fix that only handled one end would still pass the first check. */
    await waitFor(() => {
      const start = screenPointAt(rfEdgePath(host, "e-kid-out"), 0);
      expect(distance(start, dotCentre(host, "kid", "out"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
    });

    /* The control: re-pointing a member's end left every TOP-LEVEL end
     * exactly where it was. e-set is `proc/out → gain/set`, untouched by
     * `anchorEnd` (no `parentId`), and still lands on proc's own dot. */
    await waitFor(() => {
      const start = screenPointAt(rfEdgePath(host, "e-set"), 0);
      expect(distance(start, dotCentre(host, "proc", "out"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
    });
  },
};

/* ------------------------------------------------------------------ */
/* tldraw — the same edge, the other engine's geometry                  */
/* ------------------------------------------------------------------ */

export const MemberEdgeTldraw: Story = {
  name: "Edge Into A Member (tldraw)",
  render: () => <StatefulTldraw initial={MEMBER_EDGE_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await waitFor(
      () => {
        required(host, '[data-scene-node="proc"] [data-block-id="kid"] [data-port-id="in"]', "kid's in dot");
        expect(tldrawEdgePath(host, "e-kid-in").getTotalLength()).toBeGreaterThan(0);
        expect(tldrawEdgePath(host, "e-kid-out").getTotalLength()).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );

    expectMemberInside(host, '[data-scene-node="proc"]', "kid");

    /* Nothing was "skipped, not guessed at": the overlay's own unresolved
     * channel is empty, so both member cables genuinely resolved to an
     * anchor rather than being quietly dropped (before this lane they were
     * the two ids that would appear here). */
    await waitFor(() => {
      const layer = required<SVGElement>(host, '[data-slot="wire-layer"]', "the wire layer");
      expect(layer.getAttribute("data-unresolved-wires")).toBe("");
    });

    await waitFor(() => {
      const path = tldrawEdgePath(host, "e-kid-in");
      const end = screenPointAt(path, path.getTotalLength());
      const dot = dotCentre(host, "kid", "in");
      /* kid's `in` sits on its LEFT wall, so the line stops
       * `TRACE_TERMINAL_GAP` to the left of the dot — by the trunk's own
       * paint rule, identically to every top-level wire on this host. The
       * tight claim is against that contractual stopping point… */
      expect(distance(end, pulledBack(dot, "left"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
      /* …and the raw distance to the dot itself is pinned too, so the gap
       * can never grow into a mis-anchor hiding behind a loose tolerance. */
      expect(distance(end, dot)).toBeLessThanOrEqual(TRACE_TERMINAL_GAP + MEMBER_ANCHOR_TOLERANCE_PX);
    });

    /* Out of the member, same geometry mirrored: kid's `out` is on the
     * RIGHT wall, so the line starts a gap to the right of it. */
    await waitFor(() => {
      const path = tldrawEdgePath(host, "e-kid-out");
      const start = screenPointAt(path, 0);
      const dot = dotCentre(host, "kid", "out");
      expect(distance(start, pulledBack(dot, "right"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
      expect(distance(start, dot)).toBeLessThanOrEqual(TRACE_TERMINAL_GAP + MEMBER_ANCHOR_TOLERANCE_PX);
    });

    /* The control, as on React Flow: a top-level end is unchanged. */
    await waitFor(() => {
      const path = tldrawEdgePath(host, "e-set");
      expect(distance(screenPointAt(path, 0), pulledBack(dotCentre(host, "proc", "out"), "right"))).toBeLessThanOrEqual(
        MEMBER_ANCHOR_TOLERANCE_PX,
      );
    });
  },
};

/* ------------------------------------------------------------------ */
/* The anchor is live, not a mount-time snapshot                        */
/* ------------------------------------------------------------------ */

export const MemberEdgeSurvivesDrag: Story = {
  name: "Member Edge Survives A Parent Drag (ReactFlow)",
  render: () => <StatefulReactFlow initial={MEMBER_EDGE_SCENE} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    await waitFor(
      () => {
        required(host, '[data-scene-node="proc"] [data-block-id="kid"] [data-port-id="in"]', "kid's in dot");
        expect(rfEdgePath(host, "e-kid-in").getTotalLength()).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    expectMemberInside(host, '[data-scene-node="proc"]', "kid");

    const procNode = required<HTMLElement>(host, '.react-flow__node[data-id="proc"]', "proc's RF node");
    /* proc's OWN header, not kid's — `[data-slot="block-header"]` alone
     * matches a member's too, which is the defect `OwnDragHandleMarker`
     * exists for (`MemberHeaderDoesNotDragParent` in SceneHosts.stories).
     * The `>`-scoped chain here is the same one that story uses. */
    const procHeader = required<HTMLElement>(procNode, '[data-block-id="proc"] > [data-slot="block"] > [data-slot="block-header"]', "proc's own header");

    const before = procNode.getBoundingClientRect();
    const pressAt = { x: before.left + 20, y: before.top + 8 };
    /* Hit-target honesty first (the host-fixes lane's discipline): the
     * header must be the real top element at the press point, or the drag
     * below proves nothing about who owns the gesture. */
    const topAtPress = document.elementFromPoint(pressAt.x, pressAt.y);
    expect(topAtPress && (procHeader === topAtPress || procHeader.contains(topAtPress))).toBe(true);

    await dragFrom(procHeader, { x: pressAt.x + 90, y: pressAt.y + 50 }, { pressAt });
    await waitFor(() => {
      expect(procNode.getBoundingClientRect().left - before.left).toBeGreaterThan(40);
    });

    /* The whole point: the member's dot moved with its parent, and the
     * cable re-measured rather than pointing at where the dot USED to be —
     * `MeasuredPortHandles`' `updateNodeInternals` covers member handles
     * exactly as it always covered own ones. */
    await waitFor(() => {
      const path = rfEdgePath(host, "e-kid-in");
      const end = screenPointAt(path, path.getTotalLength());
      expect(distance(end, dotCentre(host, "kid", "in"))).toBeLessThanOrEqual(MEMBER_ANCHOR_TOLERANCE_PX);
    });
  },
};
