/**
 * Control Flow/Region Views/Mirror (ReactFlow ⇄ DOM Canvas) — Zach's
 * "w/ ports" region (sketch 4, `presets/RegionViews.stories.tsx`) through
 * both hosts, sharing ONE scene: the static DOM canvas on the left, its React
 * Flow twin on the right, where the boxes drag. Drag a box in React Flow and
 * its cables re-route live in both panes, and the wall-crossing circles
 * follow the cables.
 *
 * WHY the drag lives in the React Flow pane and never in the DOM one
 * (docs/peps/0005-dom-canvas-stays-static.md): Zach, 2026-09-22, "ok its
 * settled 100% lets use reactflow than." The DOM canvas stays the static
 * control; anything that moves across the canvas gets a React Flow twin.
 * The twin is honest only because its cables are the kit's own — the same
 * `WireLayer` derivation, measured in flow space — so the two panes differ
 * in host, not in router (`hosts/cableParity.ts` measures that here too).
 *
 * Every drawing is a real prop or a real derivation, nothing story-only:
 *   • the region, its corner card and its members are `SceneNodeView`'s,
 *     exactly as each host renders any region node;
 *   • the circles are `Region.crossings`, handed in through the hosts'
 *     `decorate` seam (`SceneNodeDecoration.crossings`);
 *   • their positions are `regionViews.layout.ts`'s `wallCrossings` over the
 *     polyline each host reports it DREW (`onWireGeometry`) against the
 *     frame's measured box — `hosts/regionCrossings.ts`, one glue for both.
 *
 * Out of scope, by the same decision: dragging a cable's CORNER. React Flow
 * ships nothing for it (0 exports in @xyflow/react 12.11.6); it belongs in
 * the kit — `components/traceEditor.tsx` already does straight cables, and
 * an elbow mode there would work in every host, this one included.
 */
import { useCallback, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "../components/button";
import { expectSameCables, recordedWirePoints, useWireGeometryRecorder } from "./cableParity";
import { DomCanvas } from "./domCanvas";
import { dragSteps } from "./hostGestures";
import type { HostNodeData, HostScene } from "./hostScene";
import type { Decorate } from "./nodeViews";
import { ReactFlowHost } from "./reactFlowHost";
import { useRegionWallCrossings } from "./regionCrossings";
import { REGION_NODE_TYPE } from "../scene/region";
import type { SceneNode } from "../scene/scene";

const meta = {
  title: "Control Flow/Region Views/Mirror (ReactFlow ⇄ DOM Canvas)",
  tags: ["area:control-flow", "lane:reactflow-parity", "host:dom", "host:react-flow"],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* The fixture — sketch 4, "w/ ports"                                   */
/* ------------------------------------------------------------------ */

const REGION_ID = "rm";
const kid = (id: string) => `${REGION_ID}-${id}`;

const block = (id: string, x: number, y: number, ports: HostNodeData["ports"], parentId?: string): SceneNode<HostNodeData> => ({
  id,
  type: "block",
  position: { x, y },
  ...(parentId === undefined ? null : { parentId }),
  data: { name: parentId === undefined ? "Outside" : "Child Member", view: "port", w: parentId === undefined ? 112 : 150, ports },
});

/**
 * The same literal as `RegionViews.stories.tsx`'s `sketch4Scene` (a left
 * control port and two right ports on the corner card feeding two wired
 * members, one cable in through the left wall, one out through the right),
 * restated rather than imported: a story file is not a module other stories
 * import from.
 */
const MIRROR_SCENE: HostScene = {
  nodes: [
    {
      id: REGION_ID,
      type: REGION_NODE_TYPE,
      position: { x: 140, y: 10 },
      data: { name: "Title", region: { kind: "loop" }, ports: { left: ["c"], right: ["i1", "i2"] }, w: 520, h: 300 },
    },
    block(kid("m1"), 170, 16, { left: ["a", "b"], right: ["o"] }, REGION_ID),
    block(kid("m2"), 340, 40, { left: ["a", "b"], right: ["o"] }, REGION_ID),
    block(kid("ctl"), 0, 16, { right: ["o"] }),
    block(kid("src"), 0, 200, { right: ["o"] }),
    block(kid("dst"), 700, 210, { left: ["i"] }),
  ],
  edges: [
    { id: kid("e-ctl"), source: kid("ctl"), sourceHandle: "o", target: REGION_ID, targetHandle: "c" },
    { id: kid("e-i1"), source: REGION_ID, sourceHandle: "i1", target: kid("m1"), targetHandle: "a" },
    { id: kid("e-i2"), source: REGION_ID, sourceHandle: "i2", target: kid("m2"), targetHandle: "b" },
    { id: kid("e-mid"), source: kid("m1"), sourceHandle: "o", target: kid("m2"), targetHandle: "a" },
    { id: kid("e-in"), source: kid("src"), sourceHandle: "o", target: kid("m1"), targetHandle: "b" },
    { id: kid("e-out"), source: kid("m2"), sourceHandle: "o", target: kid("dst"), targetHandle: "i" },
  ],
};

const WIRE_IDS = MIRROR_SCENE.edges.map((edge) => edge.id);
const PANE = { w: 830, h: 330 };

/* ------------------------------------------------------------------ */
/* The mirror                                                          */
/* ------------------------------------------------------------------ */

function decorateWith(crossings: ReturnType<typeof useRegionWallCrossings>["crossings"]): Decorate {
  return (node) => (node.id === REGION_ID ? { crossings } : undefined);
}

/** `edgeId` with its target handle dropped: it now wires the NODE, which no
 *  rendered dot carries (`sceneWires`' own rule), so no host can kit-route it. */
function withoutHandle(scene: HostScene, edgeId: string): HostScene {
  return { ...scene, edges: scene.edges.map((edge) => (edge.id === edgeId ? { ...edge, targetHandle: undefined } : edge)) };
}

function Mirror({ edits = false }: { edits?: boolean }) {
  // ONE scene: the React Flow pane writes drags back into it, and the DOM
  // pane re-renders from it — static, but never stale.
  const [scene, setScene] = useState(MIRROR_SCENE);

  const [domPane, setDomPane] = useState<HTMLDivElement | null>(null);
  const [reactFlowPane, setReactFlowPane] = useState<HTMLDivElement | null>(null);
  const domCrossings = useRegionWallCrossings(() => domPane?.querySelector('[data-host="dom-canvas"]'), REGION_ID, WIRE_IDS);
  const reactFlowCrossings = useRegionWallCrossings(() => reactFlowPane?.querySelector(".react-flow__viewport"), REGION_ID, WIRE_IDS);
  const domRecorder = useWireGeometryRecorder(domCrossings.onWireGeometry);
  const reactFlowRecorder = useWireGeometryRecorder(reactFlowCrossings.onWireGeometry);

  const domDecorate = useMemo(() => decorateWith(domCrossings.crossings), [domCrossings.crossings]);
  const reactFlowDecorate = useMemo(() => decorateWith(reactFlowCrossings.crossings), [reactFlowCrossings.crossings]);
  const domRef = useCallback((element: HTMLDivElement | null) => {
    domRecorder.ref.current = element;
    setDomPane(element);
  }, [domRecorder.ref]);
  const reactFlowRef = useCallback((element: HTMLDivElement | null) => {
    reactFlowRecorder.ref.current = element;
    setReactFlowPane(element);
  }, [reactFlowRecorder.ref]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
      {edits && (
        <div data-slot="mirror-edits" style={{ display: "flex", gap: 8, flexBasis: "100%" }}>
          {/* The two ways a cable stops being kit-routed while its id lives
              on or vanishes: its end loses its handle (React Flow falls back
              to the stock path, WireLayer reports it unresolved), or the
              edge leaves the scene. */}
          <Button size="sm" variant="outline" onClick={() => setScene((current) => withoutHandle(current, kid("e-out")))}>
            Unhandle e-out
          </Button>
          <Button size="sm" variant="outline" onClick={() => setScene((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== kid("e-in")) }))}>
            Remove e-in
          </Button>
        </div>
      )}
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 13, marginBottom: 8 }}>
          <span style={{ fontWeight: 600 }}>DOM Canvas</span>
          <span className="text-muted-foreground"> — static, the control</span>
        </figcaption>
        <div ref={domRef} data-pane="dom" style={{ border: "1px solid var(--border)" }}>
          <DomCanvas scene={scene} onSceneChange={setScene} width={PANE.w} height={PANE.h} decorate={domDecorate} onWireGeometry={domRecorder.onWireGeometry} />
        </div>
      </figure>
      <figure style={{ margin: 0 }}>
        <figcaption style={{ fontSize: 13, marginBottom: 8 }}>
          <span style={{ fontWeight: 600 }}>React Flow</span>
          <span className="text-muted-foreground"> — the twin: drag a box by its header</span>
        </figcaption>
        <div ref={reactFlowRef} data-pane="react-flow" style={{ border: "1px solid var(--border)" }}>
          <ReactFlowHost
            scene={scene}
            onSceneChange={setScene}
            width={PANE.w}
            height={PANE.h}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            decorate={reactFlowDecorate}
            onWireGeometry={reactFlowRecorder.onWireGeometry}
          />
        </div>
      </figure>
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

function frameOf(pane: ParentNode): DOMRect {
  return required<HTMLElement>(pane, `[data-slot="region-frame"][data-region-id="${REGION_ID}"]`, "the frame").getBoundingClientRect();
}

/** Every marker's centre is on the frame's border (±1px); returns the count. */
function expectMarkersOnWalls(pane: ParentNode): number {
  const frame = frameOf(pane);
  const markers = [...pane.querySelectorAll<HTMLElement>('[data-slot="region-crossing"]')];
  for (const marker of markers) {
    const box = marker.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const onVertical = (Math.abs(x - frame.left) <= PX || Math.abs(x - frame.right) <= PX) && y >= frame.top - PX && y <= frame.bottom + PX;
    const onHorizontal = (Math.abs(y - frame.top) <= PX || Math.abs(y - frame.bottom) <= PX) && x >= frame.left - PX && x <= frame.right + PX;
    expect(onVertical || onHorizontal, `marker at (${x.toFixed(1)}, ${y.toFixed(1)}) is not on the frame border ${JSON.stringify(frame)}`).toBe(true);
  }
  return markers.length;
}

/**
 * How many times the cables cross the frame, counted from the polylines the
 * host REPORTS against the frame's measured box with a plain segment/edge
 * test — independently of `wallCrossings` and of the painted markers, so
 * "one marker per crossing" has something to be wrong about.
 */
function reportedCrossingCount(pane: HTMLElement, space: Element): number {
  const frame = frameOf(pane);
  const origin = space.getBoundingClientRect();
  const left = frame.left - origin.left;
  const right = frame.right - origin.left;
  const top = frame.top - origin.top;
  const bottom = frame.bottom - origin.top;
  const inside = (p: { x: number; y: number }) => p.x > left && p.x < right && p.y > top && p.y < bottom;
  let count = 0;
  for (const points of Object.values(recordedWirePoints(pane))) {
    for (let i = 1; i < points.length; i += 1) if (inside(points[i - 1]) !== inside(points[i])) count += 1;
  }
  return count;
}

function panes(canvasElement: HTMLElement) {
  const dom = required<HTMLElement>(canvasElement, '[data-pane="dom"]', "the DOM pane");
  const reactFlow = required<HTMLElement>(canvasElement, '[data-pane="react-flow"]', "the React Flow pane");
  return { dom, reactFlow, domSpace: required<HTMLElement>(dom, '[data-host="dom-canvas"]', "the DOM host"), flowSpace: required<HTMLElement>(reactFlow, ".react-flow__viewport", "the React Flow viewport") };
}

const DRAG_STEPS = 8;

/** How many times React Flow's kit router has run `resolveWires` so far
 *  (`KitWireRouter` stamps it on the viewport). */
function routePassesOf(pane: ParentNode): number {
  return Number(required<HTMLElement>(pane, ".react-flow__viewport", "the React Flow viewport").dataset.kitRoutePasses ?? 0);
}

/** The node's own header — the one React Flow's `dragHandle` accepts. */
function ownHeader(pane: ParentNode, nodeId: string): HTMLElement {
  return required<HTMLElement>(pane, `[data-scene-node="${nodeId}"] [data-rf-own-header]`, `${nodeId}'s own header`);
}

/** The same mirror with no play function: the play below ends with the
 *  source block already dragged inside, so this is the one to drag yourself
 *  from the rest state. */
export const TryIt: Story = {
  name: "Mirror — drag it yourself",
  render: () => <Mirror />,
};

export const Mirror_: Story = {
  name: "Mirror (ReactFlow ⇄ DOM Canvas)",
  render: () => <Mirror />,
  play: async ({ canvasElement, step }) => {
    await waitFor(() => panes(canvasElement), { timeout: 5000 });
    const { dom, reactFlow, domSpace, flowSpace } = panes(canvasElement);

    await step("At rest: both panes draw the same cables and the same two crossings", async () => {
      await waitFor(
        () => {
          expectSameCables(dom, reactFlow, WIRE_IDS);
          // Sketch 4's two crossing cables: `e-in` through the left wall,
          // `e-out` through the right.
          expect(reportedCrossingCount(reactFlow, flowSpace)).toBe(2);
          expect(expectMarkersOnWalls(reactFlow)).toBe(2);
          expect(expectMarkersOnWalls(dom)).toBe(2);
        },
        { timeout: 5000 },
      );
    });

    await step("Drag the outside source block across the left wall, in React Flow", async () => {
      const header = await waitFor(() => ownHeader(reactFlow, kid("src")));
      const frame = frameOf(reactFlow);
      const srcBox = required<HTMLElement>(reactFlow, `[data-scene-node="${kid("src")}"]`, "src").getBoundingClientRect();
      const press = { x: header.getBoundingClientRect().left + 20, y: header.getBoundingClientRect().top + header.getBoundingClientRect().height / 2 };
      // Land the whole block inside the frame's free lower-left corner. The
      // margin is generous on purpose: React Flow starts the node drag at
      // the move that clears `nodeDragThreshold`, not at the press, so the
      // box trails the pointer by roughly the first step.
      const target = { x: press.x + (frame.left + 56 - srcBox.left), y: press.y + (frame.bottom - srcBox.height - 24 - srcBox.top) };
      const midSteps: number[] = [];
      const passesBefore = routePassesOf(reactFlow);
      await dragSteps(header, target, {
        pressAt: press,
        steps: DRAG_STEPS,
        onStep: async () => {
          // Live: mid-gesture, whatever the count is, every marker sits on
          // the wall of the frame as it is drawn right now.
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          midSteps.push(expectMarkersOnWalls(reactFlow));
        },
      });
      expect(midSteps.length).toBe(DRAG_STEPS);
      const routePasses = routePassesOf(reactFlow) - passesBefore;
      // At most one pass per animation frame (`reactFlowHost.tsx`'s
      // `requestRoutePass`): a move is one pass, whatever it invalidated.
      // Measured on this drag: 31 before the coalescing, 8 after.
      expect(routePasses, `resolveWires passes during the ${DRAG_STEPS}-step drag`).toBeGreaterThan(0);
      expect(routePasses, `resolveWires passes during the ${DRAG_STEPS}-step drag`).toBeLessThanOrEqual(DRAG_STEPS + 2);
      await waitFor(
        () => {
          // The drag really moved the box: src's card is inside the frame now.
          const moved = required<HTMLElement>(reactFlow, `[data-scene-node="${kid("src")}"]`, "src").getBoundingClientRect();
          const box = frameOf(reactFlow);
          expect(moved.left).toBeGreaterThan(box.left);
          expect(moved.bottom).toBeLessThan(box.bottom);
          // `e-in` no longer crosses: one crossing left, `e-out`'s.
          expect(reportedCrossingCount(reactFlow, flowSpace)).toBe(1);
          expect(expectMarkersOnWalls(reactFlow)).toBe(1);
        },
        { timeout: 5000 },
      );
    });

    await step("The static DOM pane re-seats from the same scene, and the cables still match", async () => {
      await waitFor(
        () => {
          expect(reportedCrossingCount(dom, domSpace)).toBe(1);
          expect(expectMarkersOnWalls(dom)).toBe(1);
          expectSameCables(dom, reactFlow, WIRE_IDS);
        },
        { timeout: 5000 },
      );
    });
  },
};

/**
 * A cable that stops being drawn takes its crossing marker with it — in both
 * hosts, whether its edge keeps its id and loses a handle (React Flow falls
 * back to the stock path; `WireLayer` reports it unresolved) or leaves the
 * scene. Audit of 7fbf22c: the glue used to keep the last kit polyline by
 * id, so the marker froze on a path neither host painted any more.
 */
export const StaleCrossingsClear: Story = {
  name: "Mirror — a cable that stops being drawn loses its marker",
  render: () => <Mirror edits />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const unhandle = await canvas.findByRole("button", { name: "Unhandle e-out" });
    const { dom, reactFlow } = panes(canvasElement);

    await step("At rest: two crossings in each pane", async () => {
      await waitFor(
        () => {
          expect(expectMarkersOnWalls(reactFlow)).toBe(2);
          expect(expectMarkersOnWalls(dom)).toBe(2);
        },
        { timeout: 5000 },
      );
    });

    await step("e-out loses its handle: it falls off the kit route, and its marker goes", async () => {
      await userEvent.click(unhandle);
      await waitFor(
        () => {
          // The edge still exists — drawn on the stock path in React Flow,
          // skipped by WireLayer — so the marker must go because the ROUTE
          // went, not because the wire did.
          expect(reactFlow.querySelectorAll('[data-edge-route="stock"]').length).toBe(1);
          expect(required(dom, '[data-slot="wire-layer"]', "the wire layer").getAttribute("data-unresolved-wires")).toBe(kid("e-out"));
          expect(recordedWirePoints(reactFlow)[kid("e-out")]).toBeUndefined();
          expect(recordedWirePoints(dom)[kid("e-out")]).toBeUndefined();
          expect(expectMarkersOnWalls(reactFlow)).toBe(1);
          expect(expectMarkersOnWalls(dom)).toBe(1);
        },
        { timeout: 5000 },
      );
    });

    await step("e-in leaves the scene: the last marker goes too", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "Remove e-in" }));
      await waitFor(
        () => {
          expect(recordedWirePoints(reactFlow)[kid("e-in")]).toBeUndefined();
          expect(recordedWirePoints(dom)[kid("e-in")]).toBeUndefined();
          expect(expectMarkersOnWalls(reactFlow)).toBe(0);
          expect(expectMarkersOnWalls(dom)).toBe(0);
        },
        { timeout: 5000 },
      );
    });
  },
};
