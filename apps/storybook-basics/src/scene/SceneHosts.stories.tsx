import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "../hosts/domCanvas";
import * as domCanvasModule from "../hosts/domCanvas";
import { dragFrom } from "../hosts/hostGestures";
import { HOST_SCENE, topLevelNodes, type HostScene } from "../hosts/hostScene";
import { ReactFlowHost } from "../hosts/reactFlowHost";

/**
 * Scene/Model & Diff/Scene/In A Host — the SAME `HOST_SCENE` literal rendered through
 * both hosts (H1: one scene, two hosts, no per-host fixture). Story names
 * carry the host tag — "(DOM Canvas)" / "(ReactFlow)"; an untagged story
 * anywhere in this app is plain DOM, no host.
 *
 * The DOM Canvas is the CONTROL: deliberately incapable (no viewport, no
 * pan, no zoom — asserted, not promised). The React Flow bench is where
 * viewport-owning interactions live: zoom, node drag, and the dnd-kit
 * boundary fight (H3/H4).
 */

const meta = {
  title: "Scene/Model & Diff/Scene/In A Host",
  tags: ["object:scene", "host:dom", "host:react-flow", "lane:host-fixes"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function StatefulDomCanvas({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

function StatefulReactFlow({ initial, width, height, fitView }: { initial: HostScene; width?: number; height?: number; fitView?: boolean }) {
  const [scene, setScene] = useState(initial);
  return (
    <ReactFlowHost
      scene={scene}
      onSceneChange={setScene}
      width={width}
      height={height}
      fitView={fitView}
      defaultViewport={fitView ? undefined : { x: 0, y: 0, zoom: 1 }}
    />
  );
}

/** The per-scene-node presence claim, shared by both hosts' plays: every
 *  top-level node is a host-level element, every member renders INSIDE its
 *  parent (never as a host node of its own), and all four host-facing
 *  faces are on the bench. */
async function expectSceneRendered(root: HTMLElement) {
  const topLevel = topLevelNodes(HOST_SCENE);
  await waitFor(() => {
    expect(root.querySelectorAll("[data-scene-node]")).toHaveLength(topLevel.length);
  });
  for (const node of topLevel) {
    required(root, `[data-scene-node="${node.id}"]`, `host node \`${node.id}\``);
  }
  // The nesting: kid is a member drawn inside proc, in the view kit's own
  // DOM — and NOT a host-level node.
  required(root, `[data-scene-node="proc"] [data-block-id="kid"]`, "kid rendered inside proc");
  expect(root.querySelector('[data-scene-node="kid"]')).toBeNull();
  // All four host-facing faces (H6, at scene level): Glyph, Code, Block, Value.
  required(root, '[data-scene-node="logo"] [data-slot="glyph"]', "the Glyph face");
  required(root, '[data-scene-node="prog"] [data-slot="code-editor"]', "the Code face");
  required(root, '[data-scene-node="proc"][data-block-id="proc"], [data-scene-node="proc"] [data-block-id="proc"]', "the Block face");
  required(root, '[data-scene-node="gain"] [data-block-id="gain"], [data-scene-node="gain"][data-block-id="gain"]', "the Value face");
}

/* ------------------------------------------------------------------ */
/* H1 + H2 — the DOM Canvas control                                     */
/* ------------------------------------------------------------------ */

export const SceneDomCanvas: Story = {
  name: "Scene (DOM Canvas)",
  render: () => <StatefulDomCanvas initial={HOST_SCENE} width={640} height={280} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");
    await expectSceneRendered(host);

    /* H1 (DOM half): every edge the scene declares resolves — WireLayer's
     * own unresolved channel must read empty, and each wire renders. */
    const layer = required<SVGSVGElement>(host, '[data-slot="wire-layer"]', "the wire layer");
    await waitFor(() => {
      expect(layer.getAttribute("data-unresolved-wires")).toBe("");
      for (const edge of HOST_SCENE.edges) {
        expect(host.querySelector(`[data-wire-id="${edge.id}"]`)).not.toBeNull();
      }
    });

    /* H2: the control is provably incapable. No viewport transform on the
     * host root… */
    expect(getComputedStyle(host).transform).toBe("none");
    /* …and no zoom/pan/viewport API anywhere in the module's export
     * surface. The tripwire is mechanical: the day someone adds one, this
     * enumeration fails before any story can depend on it. */
    const exported = Object.keys(domCanvasModule);
    expect(exported.filter((name) => /zoom|pan|viewport|scale|fit/i.test(name))).toEqual([]);
  },
};

/* ------------------------------------------------------------------ */
/* H1 — the React Flow half                                             */
/* ------------------------------------------------------------------ */

export const SceneReactFlow: Story = {
  name: "Scene (ReactFlow)",
  render: () => <StatefulReactFlow initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    await expectSceneRendered(host);

    /* Host-level node count in React Flow's own terms. */
    await waitFor(() => {
      expect(host.querySelectorAll(".react-flow__node")).toHaveLength(topLevelNodes(HOST_SCENE).length);
    });

    /* H1 (RF half): every edge endpoint resolves. The handles are
     * MEASURED off the rendered dots (async), so the edges appear once
     * measurement lands: each edge renders a real path, and both handle
     * ids exist inside the node the edge names.
     *
     * The path itself is the trunk's own `TraceBody` paint (`TraceEdge`,
     * host-fixes lane defect 3), not React Flow's stock bezier — hence
     * `[data-slot="trace-line"]`, not the `react-flow__edge-path` class a
     * plain `<BaseEdge>` would carry. `:not([data-sketch="true"])` excludes
     * `TraceBody`'s own sketch-skin overlay, the same crisp/sketch pair
     * `wireLayer.tsx`'s DOM host paints. */
    await waitFor(
      () => {
        for (const edge of HOST_SCENE.edges) {
          const path = host.querySelector<SVGPathElement>(
            `.react-flow__edge[data-id="${edge.id}"] [data-slot="trace-line"]:not([data-sketch="true"])`,
          );
          if (!path) throw new Error(`edge ${edge.id} has no rendered path yet`);
          expect(path.getTotalLength()).toBeGreaterThan(0);
          const source = required<HTMLElement>(host, `.react-flow__node[data-id="${edge.source}"]`, `source node ${edge.source}`);
          const target = required<HTMLElement>(host, `.react-flow__node[data-id="${edge.target}"]`, `target node ${edge.target}`);
          expect(source.querySelector(`[data-handleid="${edge.sourceHandle}"]`)).not.toBeNull();
          expect(target.querySelector(`[data-handleid="${edge.targetHandle}"]`)).not.toBeNull();
        }
      },
      { timeout: 3000 },
    );

    /* Host-fixes lane, defect 3's other visible consequence: `e-cfg`
     * carries `data: { variant: "async" }` and the stock bezier ignored it
     * entirely (no `edgeTypes` entry ever reads `Edge.data`) — the async
     * wire rendered identically to a plain one. `TraceEdge` threads it
     * through to `TraceBody`, which stamps the variant onto `[data-slot=
     * "trace"]` and gives the line a real dash array — both checked here,
     * not just "some path exists" (which passed before this fix too). */
    await waitFor(() => {
      const group = required<SVGGElement>(host, '[data-id="e-cfg"] [data-slot="trace"]', "e-cfg's trace group");
      expect(group.getAttribute("data-variant")).toBe("async");
      const line = required<SVGPathElement>(host, '[data-id="e-cfg"] [data-slot="trace-line"]:not([data-sketch="true"])', "e-cfg's line");
      expect(line.getAttribute("stroke-dasharray")).toBeTruthy();
    });
  },
};

/* ------------------------------------------------------------------ */
/* H3 — the host's own gestures: node drag, then zoom                   */
/* ------------------------------------------------------------------ */

function viewportScale(host: HTMLElement): number {
  const viewport = required<HTMLElement>(host, ".react-flow__viewport", "the RF viewport");
  const match = /scale\(([\d.eE+-]+)\)/.exec(viewport.style.transform);
  return match ? Number(match[1]) : 1;
}

/** A path endpoint in SCREEN coordinates — spatial claims get measured,
 *  never DOM-presence-asserted. */
function screenPointAt(path: SVGPathElement, length: number): { x: number; y: number } {
  const svg = path.ownerSVGElement!;
  const ctm = svg.getScreenCTM();
  if (!ctm) throw new Error("no screen CTM — is the svg mounted?");
  const local = path.getPointAtLength(length);
  const point = svg.createSVGPoint();
  point.x = local.x;
  point.y = local.y;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
}

function dotCentre(host: HTMLElement, blockId: string, portId: string): { x: number; y: number } {
  const wrap = required<HTMLElement>(host, `[data-block-id="${blockId}"] [data-port-id="${portId}"]`, `${blockId}/${portId}'s dot`);
  const dot = wrap.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? wrap;
  const rect = dot.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export const ZoomAndNodeDrag: Story = {
  name: "Zoom And Node Drag (ReactFlow)",
  render: () => <StatefulReactFlow initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    await waitFor(() => {
      if (!host.querySelector(`.react-flow__edge[data-id="e-set"] [data-slot="trace-line"]:not([data-sketch="true"])`)) throw new Error("edges not rendered yet");
    });

    /* -- Node drag, at zoom 1 so screen px ARE flow px ---------------- */
    const procNode = required<HTMLElement>(host, '.react-flow__node[data-id="proc"]', "proc's RF node");
    const header = required<HTMLElement>(procNode, '[data-block-id="proc"] > [data-slot="block"] > [data-slot="block-header"]', "proc's header (the drag handle)");
    const before = procNode.getBoundingClientRect();
    const grip = header.getBoundingClientRect();
    await dragFrom(header, { x: grip.left + grip.width / 2 + 70, y: grip.top + grip.height / 2 + 30 });

    /* The node moved by the drag delta… */
    await waitFor(() => {
      const after = procNode.getBoundingClientRect();
      expect(Math.abs(after.left - before.left - 70)).toBeLessThanOrEqual(10);
      expect(Math.abs(after.top - before.top - 30)).toBeLessThanOrEqual(10);
    });

    /* …and the scene-derived edge FOLLOWED: e-set's source endpoint sits
     * on proc/out's dot at its new place — measured from the real path,
     * against the real dot. */
    await waitFor(() => {
      const path = required<SVGPathElement>(
        host,
        '.react-flow__edge[data-id="e-set"] [data-slot="trace-line"]:not([data-sketch="true"])',
        "e-set's path",
      );
      const start = screenPointAt(path, 0);
      const dot = dotCentre(host, "proc", "out");
      expect(Math.abs(start.x - dot.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(start.y - dot.y)).toBeLessThanOrEqual(10);
    });

    /* -- Zoom, driven through the host's own stock control ------------ */
    const scaleBefore = viewportScale(host);
    const widthBefore = procNode.getBoundingClientRect().width;
    required<HTMLButtonElement>(host, ".react-flow__controls-zoomin", "the stock zoom-in control").click();
    await waitFor(() => {
      expect(viewportScale(host)).toBeGreaterThan(scaleBefore);
      /* Rendered scale, not just a transform string: the node's on-screen
       * box actually grew. */
      expect(procNode.getBoundingClientRect().width).toBeGreaterThan(widthBefore + 1);
    });
  },
};

/* ------------------------------------------------------------------ */
/* H4 — the boundary fight: dnd-kit inside a hosted node                */
/* ------------------------------------------------------------------ */

export const RailReorderInsideANode: Story = {
  name: "Rail Reorder Inside A Node (ReactFlow)",
  render: () => <StatefulReactFlow initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const procNode = required<HTMLElement>(host, '.react-flow__node[data-id="proc"]', "proc's RF node");
    const rail = required<HTMLElement>(procNode, '[data-block-id="proc"] [data-slot="block-port-rail"][data-edge="right"]', "proc's right rail");
    const orderOf = () => Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
    await waitFor(() => expect(orderOf()).toEqual(["out", "aux"]));

    const nodeBefore = procNode.getBoundingClientRect();
    const viewport = required<HTMLElement>(host, ".react-flow__viewport", "the RF viewport");
    const viewportBefore = viewport.style.transform;

    /* A REAL boundary fight: the gesture helper fires the mouse-event
     * family alongside the pointer family (hostGestures.ts's WHY), so
     * React Flow's d3-based drag genuinely sees this pointerdown and has
     * to be kept out by the dragHandle boundary — not by the simulation
     * conveniently speaking a protocol the host is deaf to. */
    const outCard =
      required<HTMLElement>(rail, '[data-port-id="out"]', "the out port").closest('[data-slot="port-edge-card"]') ??
      required<HTMLElement>(rail, '[data-port-id="out"]', "the out port");
    const auxCard =
      required<HTMLElement>(rail, '[data-port-id="aux"]', "the aux port").closest('[data-slot="port-edge-card"]') ??
      required<HTMLElement>(rail, '[data-port-id="aux"]', "the aux port");
    await dragFrom(outCard, auxCard);

    /* Half one: the reorder LANDED — dnd-kit ran, and the host wrote the
     * new order back into the scene (the re-rendered rail keeps it). */
    await waitFor(() => expect(orderOf()).toEqual(["aux", "out"]));

    /* Half two: the host did NOT also act on the same gesture — the node
     * sits exactly where it was, and the viewport never panned. */
    const nodeAfter = procNode.getBoundingClientRect();
    expect(Math.abs(nodeAfter.left - nodeBefore.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(nodeAfter.top - nodeBefore.top)).toBeLessThanOrEqual(0.5);
    expect(viewport.style.transform).toBe(viewportBefore);
  },
};

/* ------------------------------------------------------------------ */
/* Host-fixes lane, defect 6 — a member's header must not drag its parent */
/* ------------------------------------------------------------------ */

export const MemberHeaderDoesNotDragParent: Story = {
  name: "A Member's Header Does Not Drag Its Parent (ReactFlow)",
  render: () => <StatefulReactFlow initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const procNode = required<HTMLElement>(host, '.react-flow__node[data-id="proc"]', "proc's RF node");

    /* `kid` (a member of `proc`, `parentId: "proc"` in `HOST_SCENE`) also
     * declares a `header` (`nodeViews.tsx`'s `header={node.data.name}` is
     * unconditional), so its own `[data-slot="block-header"]` lives nested
     * inside proc's DOM subtree — the exact shape that used to move the
     * wrong node. Found by `data-block-id`, not by slot alone, so this
     * resolves kid's OWN header even though proc has one too. */
    const kidHeader = required<HTMLElement>(procNode, '[data-block-id="kid"] [data-slot="block-header"]', "kid's own header");
    const procHeader = required<HTMLElement>(procNode, '[data-block-id="proc"] > [data-slot="block"] > [data-slot="block-header"]', "proc's own header");
    expect(kidHeader).not.toBe(procHeader);

    /* Real hit-testing first (the same discipline defect 4 established):
     * a press at kid's header centre must land on kid's header itself,
     * not be intercepted by anything above it. */
    const kr = kidHeader.getBoundingClientRect();
    expect(document.elementsFromPoint(kr.left + kr.width / 2, kr.top + kr.height / 2)[0]).toBe(kidHeader);

    const before = procNode.getBoundingClientRect();
    await dragFrom(kidHeader, { x: kr.left + kr.width / 2 + 60, y: kr.top + kr.height / 2 + 40 });

    /* THE bug: `dragHandle: '[data-slot="block-header"]'` matches ANY
     * element with that slot inside proc's subtree, including kid's own —
     * React Flow's `hasSelector` walk stops at the first match, which is
     * kid's header itself, and starts dragging proc (the React Flow node
     * kid lives inside). Measured before this fix: proc moved by (57, 24)
     * from this exact gesture. Fixed: the press falls through (nothing
     * else claims it either), and proc does not move at all. */
    await tick(150);
    const afterKid = procNode.getBoundingClientRect();
    expect(Math.abs(afterKid.left - before.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterKid.top - before.top)).toBeLessThanOrEqual(1);

    /* The control: proc's OWN header still drags proc normally — this is
     * a scoping fix, not a regression in the real gesture. */
    const pr = procHeader.getBoundingClientRect();
    await dragFrom(procHeader, { x: pr.left + pr.width / 2 + 60, y: pr.top + pr.height / 2 + 40 });
    await waitFor(() => {
      const afterProc = procNode.getBoundingClientRect();
      expect(Math.abs(afterProc.left - before.left)).toBeGreaterThan(40);
    });
  },
};

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* H5 — React Flow's global CSS stays inside the host                   */
/* ------------------------------------------------------------------ */

export const CssContainment: Story = {
  name: "CSS Containment (ReactFlow)",
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <ReactFlowHost scene={HOST_SCENE} width={420} height={300} fitView />
      <div data-probe style={{ width: 120 }}>
        <div data-probe-div>probe</div>
        <svg data-probe-svg width={40} height={40}>
          <circle cx={20} cy={20} r={10} fill="currentColor" />
        </svg>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    required<HTMLElement>(canvasElement, '[data-host="react-flow"] .react-flow', "the mounted host (so its CSS is provably loaded)");

    /* Every style rule React Flow's stylesheet injected is namespaced —
     * no selector exists that could reach an element outside the host.
     * This is the order-independent half: it clears EVERY non-host story
     * at once, because the leak vector (an unprefixed selector) is shown
     * not to exist. */
    const offenders: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (!/react-flow|xyflow|\.xy-/.test(rule.selectorText)) offenders.push(rule.selectorText);
        } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          walk(rule.cssRules);
        }
        /* keyframes/font-face declare names, not element selectors — they
         * cannot restyle a foreign element on their own. */
      }
    };
    let reactFlowSheets = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const text = Array.from(rules)
        .map((rule) => rule.cssText)
        .join("\n");
      if (!text.includes(".react-flow")) continue;
      reactFlowSheets += 1;
      walk(rules);
    }
    expect(reactFlowSheets).toBeGreaterThan(0);
    expect(offenders).toEqual([]);

    /* And the specific-element half: probes OUTSIDE the host keep the
     * values React Flow's own chrome overrides inside it. */
    const probeDiv = required<HTMLElement>(canvasElement, "[data-probe-div]", "the div probe");
    const probeSvg = required<SVGSVGElement>(canvasElement, "[data-probe-svg]", "the svg probe");
    for (const probe of [probeDiv, probeSvg]) {
      const style = getComputedStyle(probe);
      expect(style.pointerEvents).toBe("auto");
      expect(style.position).toBe("static");
      expect(style.transform).toBe("none");
      expect(style.opacity).toBe("1");
    }
  },
};
