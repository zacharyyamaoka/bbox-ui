import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "./domCanvas";
import { dragFrom } from "./hostGestures";
import { HOST_SCENE, topLevelNodes, type HostScene } from "./hostScene";
import { ReactFlowHost } from "./reactFlowHost";
import { TldrawHost } from "./tldrawHost";
// WHY: the retired `TRACE_TERMINAL_GAP` ruler measured how far a wire
// pulled back from a FIXED constant; since 2026-09-22 a host ends a wire
// ON its dot's painted ring, so the oracle re-measures that ring instead
// (`wireEnds.acceptance.ts`'s `paintedPullBackPx`) — a reconstruction that
// still used the constant would pass against the wrong ruler.
import { paintedPullBackPx } from "../presets/wireEnds.acceptance";

/**
 * Blocks/Scene/In A Host (tldraw) — the SAME `HOST_SCENE` literal the DOM
 * Canvas and React Flow benches render (SceneHosts.stories.tsx), now
 * through tldraw, which turns H1's "one scene, two hosts" into a genuine
 * three-host proof. Story names carry the host tag, matching the existing
 * convention; the three-column story is the review surface.
 *
 * These stories live in their OWN file rather than in SceneHosts.stories.tsx
 * because that file sits inside another lane's read-fence right now
 * (2026-09-17); folding the two together later is mechanical.
 *
 * tldraw licence note: tldraw 5 renders without a key on localhost only —
 * which is exactly where Storybook and the vitest browser run. Never mount
 * this host on a public page (CLAUDE.md's own rule).
 */

const meta = {
  title: "Blocks/Scene/In A Host (tldraw)",
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function StatefulTldraw({ initial, width, height }: { initial: HostScene; width?: number; height?: number }) {
  const [scene, setScene] = useState(initial);
  return <TldrawHost scene={scene} onSceneChange={setScene} width={width} height={height} />;
}

/** The per-scene-node presence claim, restated over the tldraw host — the
 *  same assertions SceneHosts.stories.tsx's `expectSceneRendered` makes
 *  (private there, so restated rather than imported): every top-level node
 *  is a host-level element, every member renders INSIDE its parent, and all
 *  four host-facing faces are on the bench. */
async function expectSceneRendered(root: HTMLElement) {
  const topLevel = topLevelNodes(HOST_SCENE);
  await waitFor(
    () => {
      expect(root.querySelectorAll("[data-scene-node]")).toHaveLength(topLevel.length);
    },
    { timeout: 5000 },
  );
  for (const node of topLevel) {
    required(root, `[data-scene-node="${node.id}"]`, `host node \`${node.id}\``);
  }
  required(root, `[data-scene-node="proc"] [data-block-id="kid"]`, "kid rendered inside proc");
  expect(root.querySelector('[data-scene-node="kid"]')).toBeNull();
  required(root, '[data-scene-node="logo"] [data-slot="glyph"]', "the Glyph face");
  required(root, '[data-scene-node="prog"] [data-slot="code-editor"]', "the Code face");
  required(root, '[data-scene-node="proc"][data-block-id="proc"], [data-scene-node="proc"] [data-block-id="proc"]', "the Block face");
  required(root, '[data-scene-node="gain"] [data-block-id="gain"], [data-scene-node="gain"][data-block-id="gain"]', "the Value face");
}

/** A path endpoint in SCREEN coordinates — spatial claims get measured,
 *  never DOM-presence-asserted (same helper shape as SceneHosts.stories.tsx's
 *  `screenPointAt`, private there). */
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

function dotElement(host: HTMLElement, blockId: string, portId: string): HTMLElement {
  const wrap = required<HTMLElement>(host, `[data-block-id="${blockId}"] [data-port-id="${portId}"]`, `${blockId}/${portId}'s dot`);
  return wrap.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? wrap;
}

function dotCentre(dot: HTMLElement): { x: number; y: number } {
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

/** Where a wire's drawn path should START/END for a dot on `side`: since
 *  2026-09-22 the pull-back is the dot's own rendered ring, not a fixed
 *  constant, so the caller passes `paintedPullBackPx(dot, path)` — the
 *  measured claim is "path endpoint ≈ dot centre + the dot's own ring
 *  radius along the wall normal", not "on the dot". */
function pulledBack(dot: { x: number; y: number }, side: string, pullBackPx: number): { x: number; y: number } {
  return { x: dot.x + DIR_VECTOR[side].x * pullBackPx, y: dot.y + DIR_VECTOR[side].y * pullBackPx };
}

/** Every scene edge, resolved and drawn: the layer's unresolved channel is
 *  empty and each wire's visible path exists with real length. */
async function expectWiresResolved(host: HTMLElement) {
  await waitFor(
    () => {
      const layer = host.querySelector<SVGSVGElement>('[data-slot="wire-layer"]');
      if (!layer) throw new Error("no wire layer yet");
      expect(layer.getAttribute("data-unresolved-wires")).toBe("");
      for (const edge of HOST_SCENE.edges) {
        const path = layer.querySelector<SVGPathElement>(`[data-wire-id="${edge.id}"] [data-slot="trace-line"]`);
        if (!path) throw new Error(`edge ${edge.id} has no rendered path yet`);
        expect(path.getTotalLength()).toBeGreaterThan(0);
      }
    },
    { timeout: 5000 },
  );
}

/* ------------------------------------------------------------------ */
/* H1, the tldraw half — same literal, real anchors                     */
/* ------------------------------------------------------------------ */

export const SceneTldraw: Story = {
  name: "Scene (tldraw)",
  render: () => <StatefulTldraw initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await expectSceneRendered(host);
    await expectWiresResolved(host);

    /* The anchor oracle: the wire GEOMETRY (computed from stored anchors ×
     * shape transforms, no DOM read at paint time) must land where the
     * RENDERED dots actually are — measured from the real path against the
     * real dot, in screen px. e-set runs proc/out (right wall) → gain/set
     * (left wall). */
    await waitFor(() => {
      const path = required<SVGPathElement>(host, '[data-wire-id="e-set"] [data-slot="trace-line"]', "e-set's path");
      const start = screenPointAt(path, 0);
      const outDot = dotElement(host, "proc", "out");
      const expectedStart = pulledBack(dotCentre(outDot), "right", paintedPullBackPx(outDot, path));
      expect(distance(start, expectedStart)).toBeLessThanOrEqual(0.5);

      const end = screenPointAt(path, path.getTotalLength());
      const setDot = dotElement(host, "gain", "set");
      const expectedEnd = pulledBack(dotCentre(setDot), "left", paintedPullBackPx(setDot, path));
      expect(distance(end, expectedEnd)).toBeLessThanOrEqual(0.5);
    });

    /* The async variant survives the trip: e-cfg's data rode the scene
     * record into the trunk's own paint (React Flow's bench drops this on
     * the floor — its stock bezier reads no edge data). */
    const cfg = required<SVGPathElement>(host, '[data-wire-id="e-cfg"] [data-slot="trace-line"]', "e-cfg's path");
    expect(cfg.getAttribute("stroke-dasharray")).not.toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* The three-column proof — one literal, three engines                  */
/* ------------------------------------------------------------------ */

export const ThreeHosts: Story = {
  name: "Same Scene, Three Hosts",
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ font: "12px system-ui", opacity: 0.7, marginBottom: 4 }}>DOM Canvas (control)</div>
        <StatefulDomCanvas initial={HOST_SCENE} />
      </div>
      <div>
        <div style={{ font: "12px system-ui", opacity: 0.7, marginBottom: 4 }}>React Flow</div>
        <StatefulReactFlow initial={HOST_SCENE} />
      </div>
      <div>
        <div style={{ font: "12px system-ui", opacity: 0.7, marginBottom: 4 }}>tldraw</div>
        <StatefulTldraw initial={HOST_SCENE} width={640} height={360} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    /* One record, three engines, every face on every bench. */
    const dom = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM host");
    const rf = required<HTMLElement>(canvasElement, '[data-host="react-flow"]', "the React Flow host");
    const tl = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    for (const host of [dom, rf, tl]) {
      await expectSceneRendered(host);
    }
    /* Edges resolve in the two hosts that paint the trunk's wires directly… */
    await expectWiresResolved(dom);
    await expectWiresResolved(tl);
    /* …and in React Flow's own idiom: React Flow owns the endpoints and
     * geometry (`getBezierPath`, via `TraceEdge` — host-fixes lane, defect
     * 3), but the paint is the SAME `TraceBody` the other two hosts use, so
     * the check here is the trunk's own `[data-slot="trace-line"]`, not the
     * stock `react-flow__edge-path` class a plain `<BaseEdge>` would carry
     * (`:not([data-sketch="true"])` excludes the sketch-skin overlay
     * `TraceBody` paints alongside the crisp line). */
    await waitFor(
      () => {
        for (const edge of HOST_SCENE.edges) {
          const path = rf.querySelector<SVGPathElement>(
            `.react-flow__edge[data-id="${edge.id}"] [data-slot="trace-line"]:not([data-sketch="true"])`,
          );
          if (!path) throw new Error(`RF edge ${edge.id} has no rendered path yet`);
          expect(path.getTotalLength()).toBeGreaterThan(0);
        }
      },
      { timeout: 5000 },
    );
  },
};

function StatefulDomCanvas({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <DomCanvas scene={scene} onSceneChange={setScene} width={640} height={300} />;
}

function StatefulReactFlow({ initial }: { initial: HostScene }) {
  const [scene, setScene] = useState(initial);
  return <ReactFlowHost scene={scene} onSceneChange={setScene} width={640} height={360} defaultViewport={{ x: 0, y: 0, zoom: 1 }} />;
}

/* ------------------------------------------------------------------ */
/* H3, tldraw's own viewport: shape drag, then pan, then zoom           */
/* ------------------------------------------------------------------ */

function htmlLayerScale(host: HTMLElement): number {
  const layer = required<HTMLElement>(host, ".tl-html-layer", "the tldraw html layer");
  const match = /scale\(([\d.eE+-]+)/.exec(layer.style.transform);
  return match ? Number(match[1]) : 1;
}

export const ViewportAndShapeDrag: Story = {
  name: "Viewport And Shape Drag (tldraw)",
  render: () => <StatefulTldraw initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await expectSceneRendered(host);
    await expectWiresResolved(host);

    /* -- Shape drag, by proc's OWN header, at zoom 1 ----------------- */
    const procWrap = required<HTMLElement>(host, '[data-scene-node="proc"]', "proc's shape content");
    const header = required<HTMLElement>(procWrap, '[data-block-id="proc"] > [data-slot="block"] > [data-slot="block-header"]', "proc's own header");
    const grip = header.getBoundingClientRect();
    const pressAt = { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2 };

    /* Hit-target honesty (the RF audit's lesson): the header must be the
     * REAL top target at the press point, not merely present — an occluded
     * drag surface plus element-dispatched events is exactly how a false
     * green happens. */
    const topAtPress = document.elementFromPoint(pressAt.x, pressAt.y);
    expect(topAtPress && (header === topAtPress || header.contains(topAtPress))).toBe(true);

    const before = procWrap.getBoundingClientRect();
    await dragFrom(header, { x: pressAt.x + 70, y: pressAt.y + 30 });
    await waitFor(() => {
      const after = procWrap.getBoundingClientRect();
      expect(Math.abs(after.left - before.left - 70)).toBeLessThanOrEqual(10);
      expect(Math.abs(after.top - before.top - 30)).toBeLessThanOrEqual(10);
    });

    /* …and the wire FOLLOWED the shape: e-set's start sits by proc/out's
     * dot at its new place — anchors × the LIVE transform, measured. */
    await waitFor(() => {
      const path = required<SVGPathElement>(host, '[data-wire-id="e-set"] [data-slot="trace-line"]', "e-set's path");
      const start = screenPointAt(path, 0);
      const outDot = dotElement(host, "proc", "out");
      const expected = pulledBack(dotCentre(outDot), "right", paintedPullBackPx(outDot, path));
      expect(distance(start, expected)).toBeLessThanOrEqual(0.5);
    });

    /* -- Pan, via tldraw's own wheel gesture ------------------------- */
    const canvas = required<HTMLElement>(host, ".tl-canvas", "the tldraw canvas");
    const hostRect = host.getBoundingClientRect();
    const centre = { x: hostRect.left + hostRect.width / 2, y: hostRect.top + hostRect.height / 2 };
    const panBefore = procWrap.getBoundingClientRect().top;
    canvas.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: centre.x, clientY: centre.y, deltaY: 60, deltaMode: 0 }),
    );
    await waitFor(() => {
      /* Camera moved down → content up on screen. */
      expect(procWrap.getBoundingClientRect().top).toBeLessThan(panBefore - 30);
    });

    /* -- Zoom, via ctrl+wheel (tldraw's canonical zoom gesture) ------- */
    const scaleBefore = htmlLayerScale(host);
    const widthBefore = procWrap.getBoundingClientRect().width;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: centre.x,
        clientY: centre.y,
        deltaY: -80,
        deltaMode: 0,
        ctrlKey: true,
      }),
    );
    await waitFor(() => {
      expect(htmlLayerScale(host)).toBeGreaterThan(scaleBefore);
      /* Rendered scale, not just a transform string: the shape's on-screen
       * box actually grew. */
      expect(procWrap.getBoundingClientRect().width).toBeGreaterThan(widthBefore + 1);
    });
  },
};

/* ------------------------------------------------------------------ */
/* H4, the boundary fight on tldraw: dnd-kit and the caret              */
/* ------------------------------------------------------------------ */

export const RailReorderAndCaretInsideAShape: Story = {
  name: "Rail Reorder And Caret Inside A Shape (tldraw)",
  render: () => <StatefulTldraw initial={HOST_SCENE} width={720} height={400} />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await expectSceneRendered(host);
    const procWrap = required<HTMLElement>(host, '[data-scene-node="proc"]', "proc's shape content");
    const rail = required<HTMLElement>(procWrap, '[data-block-id="proc"] [data-slot="block-port-rail"][data-edge="right"]', "proc's right rail");
    const orderOf = () => Array.from(rail.querySelectorAll<HTMLElement>("[data-port-id]")).map((el) => el.getAttribute("data-port-id"));
    await waitFor(() => expect(orderOf()).toEqual(["out", "aux"]));

    const nodeBefore = procWrap.getBoundingClientRect();
    const layer = required<HTMLElement>(host, ".tl-html-layer", "the tldraw html layer");
    const cameraBefore = layer.style.transform;

    /* The gesture helper fires BOTH event families (hostGestures.ts's
     * WHY). For tldraw only the pointer family matters — its input stack
     * (`useCanvasEvents`) listens for PointerEvents, with no d3 and no
     * mouse-event listeners — but the mouse half is harmless here and
     * keeps the ONE helper shared across all three hosts. The press lands
     * on a rail card, so `contentOwnsPress` marks it handled and tldraw's
     * select tool must genuinely stand down — not merely never hear it. */
    const outCard =
      required<HTMLElement>(rail, '[data-port-id="out"]', "the out port").closest('[data-slot="port-edge-card"]') ??
      required<HTMLElement>(rail, '[data-port-id="out"]', "the out port");
    const auxCard =
      required<HTMLElement>(rail, '[data-port-id="aux"]', "the aux port").closest('[data-slot="port-edge-card"]') ??
      required<HTMLElement>(rail, '[data-port-id="aux"]', "the aux port");

    /* Hit-target honesty: the card is genuinely reachable at its centre. */
    const cardRect = (outCard as HTMLElement).getBoundingClientRect();
    const topAtCard = document.elementFromPoint(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2);
    expect(topAtCard && (outCard.contains(topAtCard) || outCard === topAtCard)).toBe(true);

    await dragFrom(outCard, auxCard);

    /* Half one: the reorder LANDED — dnd-kit ran, the host wrote the new
     * order back into the scene, and the re-rendered rail keeps it. */
    await waitFor(() => expect(orderOf()).toEqual(["aux", "out"]));

    /* Half two: the host did NOT also act on the same gesture — the shape
     * sits exactly where it was, and the camera never moved. */
    const nodeAfter = procWrap.getBoundingClientRect();
    expect(Math.abs(nodeAfter.left - nodeBefore.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(nodeAfter.top - nodeBefore.top)).toBeLessThanOrEqual(0.5);
    expect(layer.style.transform).toBe(cameraBefore);

    /* And the reorder MOVED the anchors: e-set still starts at proc/out's
     * dot, which now sits where aux used to — geometry re-measured, not
     * cached stale. */
    await waitFor(() => {
      const path = required<SVGPathElement>(host, '[data-wire-id="e-set"] [data-slot="trace-line"]', "e-set's path");
      const start = screenPointAt(path, 0);
      const outDot = dotElement(host, "proc", "out");
      const expected = pulledBack(dotCentre(outDot), "right", paintedPullBackPx(outDot, path));
      expect(distance(start, expected)).toBeLessThanOrEqual(0.5);
    });

    /* -- The caret boundary: a press inside the Code face ------------- */
    const progWrap = required<HTMLElement>(host, '[data-scene-node="prog"]', "prog's shape content");
    const editorEl = required<HTMLElement>(progWrap, '[data-slot="code-editor"]', "the code editor");
    const progBefore = progWrap.getBoundingClientRect();
    /* A full press-move-release INSIDE the editor — the exact gesture that
     * would drag the shape if the boundary failed. */
    const target = editorEl.querySelector<HTMLElement>(".cm-content") ?? editorEl;
    await dragFrom(target, { x: progBefore.left + 30, y: progBefore.top + 12 });
    const progAfter = progWrap.getBoundingClientRect();
    expect(Math.abs(progAfter.left - progBefore.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(progAfter.top - progBefore.top)).toBeLessThanOrEqual(0.5);
  },
};

/* ------------------------------------------------------------------ */
/* H5 — tldraw's global CSS stays inside the host                       */
/* ------------------------------------------------------------------ */

export const CssContainmentTldraw: Story = {
  name: "CSS Containment (tldraw)",
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <TldrawHost scene={HOST_SCENE} width={420} height={300} />
      <div data-probe style={{ width: 120 }}>
        <div data-probe-div>probe</div>
        <svg data-probe-svg width={40} height={40}>
          <circle cx={20} cy={20} r={10} fill="currentColor" />
        </svg>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    required<HTMLElement>(canvasElement, '[data-host="tldraw"] .tl-container', "the mounted host (so its CSS is provably loaded)");

    /* Every style rule tldraw's stylesheet injected must be namespaced —
     * `.tl-` / `.tlui-` classes, tldraw's own attributes or keyframe/font
     * declarations. The walk mirrors SceneHosts.stories.tsx's React Flow
     * containment sweep; offenders are selectors that could reach an
     * element OUTSIDE the host. Splitting respects parentheses: a selector
     * list inside `:is(...)`/`:not(...)` is one compound selector, not a
     * new top-level scope — a naive `.split(",")` flags ten tldraw rules
     * that are in fact fully namespaced (measured 2026-09-17). */
    const topLevelParts = (selector: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let current = "";
      for (const char of selector) {
        if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        if (char === "," && depth === 0) {
          parts.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      parts.push(current);
      return parts;
    };
    const offenders: string[] = [];
    const namespaced = (selector: string) =>
      topLevelParts(selector).every((part) => /\.tl-|\.tlui-|\[data-tldraw|#tl-/.test(part) || part.trim() === "");
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (!namespaced(rule.selectorText)) offenders.push(rule.selectorText);
        } else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          walk(rule.cssRules);
        }
      }
    };
    let tldrawSheets = 0;
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
      if (!text.includes(".tl-container")) continue;
      tldrawSheets += 1;
      walk(rules);
    }
    expect(tldrawSheets).toBeGreaterThan(0);
    /* tldraw's ONE real global leak, pinned exactly so any NEW leak fails
     * this story: tldraw.css:308-312 sets `user-select: text` on every
     * `input`/`[contenteditable]` ON THE PAGE — outside the host included.
     * Blast radius: it can override a page's own `user-select: none` on
     * form fields; it cannot change layout, colour, or stacking. React
     * Flow's stylesheet has no equivalent (its sweep asserts a clean []).
     * This is measured, documented reality, not an allowance — remove the
     * entry the day tldraw scopes the rule, and the story goes green on
     * the empty list. */
    expect(offenders).toEqual(["input, [contenteditable], [contenteditable] *"]);

    /* And the specific-element half: probes OUTSIDE the host keep the
     * values tldraw's own chrome overrides inside it. */
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
