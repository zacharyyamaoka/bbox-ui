import { useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { ReactFlowHost } from "../hosts/reactFlowHost";
import { TldrawHost } from "../hosts/tldrawHost";
import type { Decorate } from "../hosts/nodeViews";
import type { HostScene } from "../hosts/hostScene";
import { connectionAvailability, type PortAvailability } from "../scene/availability";
import { typesIntersect, type PortTypeOf, type PortsOf } from "../scene/lint";
import { portKey, type ScenePortRef } from "../scene/scene";

/**
 * Blocks/Scene/Validation In A Host — ruling 8, Zach's own success
 * criteria verbatim: "success looks like many different stories of DOM
 * canvas for some of the static considerations, but then also the same
 * examples in a host reactflow/tldraw so I can check that the gestures
 * still transfer."
 *
 * The SAME fixture (`VH_SCENE`, structurally the same three-node "which
 * targets are legal" shape `ValidityPreview.stories.tsx` runs on the DOM
 * Canvas) through TWO more engines, via the host `decorate` seam
 * (`src/hosts/nodeViews.tsx`) this lane added — zero component-kit code
 * changes, zero scene-kit awareness of either engine.
 *
 * React Flow gets the GESTURE-adjacent story: a real pointer sequence,
 * same `connectionAvailability`-once-at-drag-start contract as the DOM
 * bench. tldraw gets a CONTROL-DRIVEN story instead, labelled honestly —
 * this app's tldraw host (`tldrawHost.tsx`) wires shape drag/pan/zoom but
 * no cable-drawing gesture at all (grepped: no `pointerdown`-driven edge
 * creation exists anywhere in that file), so simulating one here would be
 * fabricating behaviour the host does not have. What DOES transfer
 * honestly is the PAINT half: the exact same `decorate` seam, the exact
 * same `connectionAvailability` map, applied through a plain Storybook
 * control instead of a drag.
 */

const meta = {
  title: "Blocks/Scene/Validation In A Host",
  tags: ["area:blocks", "lane:validation-stack"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const VH_SCENE: HostScene = {
  nodes: [
    { id: "num1", type: "block", position: { x: 24, y: 24 }, data: { name: "num1", view: "port", w: 132, h: 60, ports: { right: ["out"] } } },
    { id: "str", type: "block", position: { x: 24, y: 120 }, data: { name: "str", view: "port", w: 132, h: 60, ports: { right: ["out"] } } },
    { id: "sink", type: "block", position: { x: 380, y: 72 }, data: { name: "sink", view: "port", w: 132, h: 60, ports: { left: ["in"] } } },
  ],
  edges: [],
};

const TYPE_OF: PortTypeOf = (ref) => {
  if (ref.nodeId === "num1") return ["number"];
  if (ref.nodeId === "str") return ["string"];
  if (ref.nodeId === "sink") return ["number"];
  return undefined;
};

const PORTS_OF: PortsOf = (nodeId) => {
  const node = VH_SCENE.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return undefined;
  return Object.values(node.data.ports ?? {}).flat();
};

function decorateFromAvailability(availability: Map<string, PortAvailability> | null): Decorate {
  return (node) => {
    if (!availability) return undefined;
    const out: Record<string, "available" | "unavailable"> = {};
    for (const portId of Object.values(node.data.ports ?? {}).flat()) {
      const entry = availability.get(portKey(node.id, portId));
      if (entry) out[portId] = entry.verdict.allowed ? "available" : "unavailable";
    }
    return Object.keys(out).length > 0 ? { availability: out } : undefined;
  };
}

function portRefAt(el: Element): ScenePortRef | null {
  const wrap = el.closest<HTMLElement>("[data-port-id]");
  const owner = el.closest<HTMLElement>("[data-block-id]");
  if (!wrap || !owner) return null;
  const portId = wrap.getAttribute("data-port-id");
  const nodeId = owner.getAttribute("data-block-id");
  if (!portId || !nodeId) return null;
  return { nodeId, portId };
}

function dotAt(canvasElement: HTMLElement, nodeId: string, portId: string): HTMLElement {
  const wrap = canvasElement.querySelector<HTMLElement>(`[data-block-id="${nodeId}"] [data-port-id="${portId}"]`);
  if (!wrap) throw new Error(`no dot for ${nodeId}/${portId}`);
  return wrap.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? wrap;
}

function centreOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function firePointer(el: Element | Window, kind: "down" | "move" | "up", x: number, y: number) {
  el.dispatchEvent(new PointerEvent(`pointer${kind}`, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: kind === "up" ? 0 : 1, pointerId: 1, isPrimary: true, view: window }));
}

/* ------------------------------------------------------------------ */
/* React Flow — the gesture-adjacent story: a real drag                 */
/* ------------------------------------------------------------------ */

function ReactFlowGestureDemo() {
  const [scene] = useState<HostScene>(VH_SCENE);
  const [availability, setAvailability] = useState<Map<string, PortAvailability> | null>(null);
  const decorate = useMemo(() => decorateFromAvailability(availability), [availability]);

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      const ref = portRefAt(event.target as Element);
      if (!ref) return;
      const map = connectionAvailability(scene, ref, { portsOf: PORTS_OF, typeOf: TYPE_OF, compatible: typesIntersect });
      setAvailability(map);
      const onUp = () => {
        setAvailability(null);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointerup", onUp);
    },
    [scene],
  );

  return (
    <div onPointerDownCapture={handlePointerDownCapture} style={{ width: 620, height: 220 }}>
      <ReactFlowHost scene={scene} width={620} height={220} defaultViewport={{ x: 0, y: 0, zoom: 1 }} decorate={decorate} />
    </div>
  );
}

export const ReactFlowDragTimePreview: Story = {
  name: "React Flow — drag-time preview (gesture)",
  render: () => <ReactFlowGestureDemo />,
  play: async ({ canvasElement }) => {
    await waitFor(() => dotAt(canvasElement, "sink", "in"));

    const from = dotAt(canvasElement, "num1", "out");
    const p = centreOf(from);
    firePointer(from, "down", p.x, p.y);

    // Same contract as the DOM Canvas bench (ValidityPreview.stories.tsx):
    // computed ONCE at drag start, painted through `decorate` with zero
    // component-kit changes — GESTURE TRANSFERRED, measured.
    await waitFor(() => {
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable");
    });

    const up = centreOf(dotAt(canvasElement, "sink", "in"));
    firePointer(window, "up", up.x, up.y);
    await waitFor(() => {
      expect(canvasElement.querySelectorAll("[data-availability]").length).toBe(0);
    });
  },
};

/* ------------------------------------------------------------------ */
/* tldraw — control-driven, NOT a gesture (labelled honestly)           */
/* ------------------------------------------------------------------ */

interface TldrawArgs {
  from: "none" | "num1/out" | "str/out";
}

function TldrawControlDemo({ from }: TldrawArgs) {
  const availability = useMemo(() => {
    if (from === "none") return null;
    const [nodeId, portId] = from.split("/");
    return connectionAvailability(VH_SCENE, { nodeId, portId }, { portsOf: PORTS_OF, typeOf: TYPE_OF, compatible: typesIntersect });
  }, [from]);
  const decorate = useMemo(() => decorateFromAvailability(availability), [availability]);

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        availability via controls — NOT a gesture; tldraw host has no cable gesture. Use the <code>from</code> control below to
        pick which port's availability map to paint.
      </p>
      <TldrawHost scene={VH_SCENE} width={620} height={260} decorate={decorate} />
    </div>
  );
}

export const TldrawControlDrivenAvailability: StoryObj<TldrawArgs> = {
  name: "tldraw — control-driven (not a gesture)",
  argTypes: { from: { control: "select", options: ["none", "num1/out", "str/out"] } },
  args: { from: "num1/out" },
  render: (args) => <TldrawControlDemo {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => dotAt(canvasElement, "sink", "in"));
    // The control's default (`from: "num1/out"`) already painted the map —
    // no pointer event anywhere in this play function.
    await waitFor(() => {
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable");
    });
  },
};

export const TldrawControlOff: StoryObj<TldrawArgs> = {
  name: "tldraw — control off (no paint)",
  argTypes: { from: { control: "select", options: ["none", "num1/out", "str/out"] } },
  args: { from: "none" },
  render: (args) => <TldrawControlDemo {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => dotAt(canvasElement, "sink", "in"));
    expect(canvasElement.querySelectorAll("[data-availability]").length).toBe(0);
  },
};
