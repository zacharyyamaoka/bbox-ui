import { useCallback, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { ReactFlowHost } from "./reactFlowHost";
import { TldrawHost } from "./tldrawHost";
import type { Decorate } from "./nodeViews";
import type { HostScene } from "./hostScene";
import { VALIDATION_SCENE, validationDirectionOf, validationPortsOf, validationTypeOf } from "./validationScene";
import { connectionAvailability, type PortAvailability } from "../scene/availability";
import { typesIntersect } from "../scene/lint";
import { portKey, type ScenePortRef } from "../scene/scene";

/**
 * Hosts/Validation — ruling 8, Zach's own success
 * criteria verbatim: "success looks like many different stories of DOM
 * canvas for some of the static considerations, but then also the same
 * examples in a host reactflow/tldraw so I can check that the gestures
 * still transfer."
 *
 * The SAME fixture (`VALIDATION_SCENE`, `hosts/validationScene.ts`) that
 * `ValidityPreview.stories.tsx` runs on the DOM Canvas, through TWO more
 * engines, via the host `decorate` seam (`src/hosts/nodeViews.tsx`) this
 * lane added — zero component-kit code changes, zero scene-kit awareness
 * of either engine.
 *
 * WHY the fixture moved out of this file (2026-09-18,
 * docs/peps/0002-the-judge-owns-edge-orientation.md): it used to be a
 * SEPARATE three-node `VH_SCENE`, structurally similar to but not the SAME
 * RECORD as `ValidityPreview.stories.tsx`'s own fixture — `sink/in` was
 * wired to zero producers here and to two (the at-rest many-to-one
 * grammar) there. The two benches were judging a different scene under
 * the same port name, so "does the gesture transfer" proved nothing:
 * `sink/in` read `"available"` in this file and `"unavailable"` in that
 * one, for the identical gesture. One shared literal fixes that — here
 * `sink/in` reads exactly what it reads on the DOM Canvas (already
 * oversubscribed, so unavailable as a further target too), and `sink/in2`
 * is the legal drag target in every host.
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
  title: "Hosts/Validation",
  tags: ["object:scene", "host:react-flow", "host:tldraw", "lane:validation-stack"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

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
  const [scene] = useState<HostScene>(VALIDATION_SCENE);
  const [availability, setAvailability] = useState<Map<string, PortAvailability> | null>(null);
  const decorate = useMemo(() => decorateFromAvailability(availability), [availability]);

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent) => {
      const ref = portRefAt(event.target as Element);
      if (!ref) return;
      const map = connectionAvailability(scene, ref, { portsOf: validationPortsOf, typeOf: validationTypeOf, compatible: typesIntersect, directionOf: validationDirectionOf });
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
    await waitFor(() => {
      dotAt(canvasElement, "sink", "in");
      dotAt(canvasElement, "sink", "in2");
    });

    const from = dotAt(canvasElement, "num1", "out");
    const p = centreOf(from);
    firePointer(from, "down", p.x, p.y);

    // Same contract as the DOM Canvas bench (ValidityPreview.stories.tsx),
    // now the SAME fixture too — GESTURE TRANSFERRED, measured, on the
    // named ports that actually agree between the two hosts:
    //   sink/in2  legal, empty, type-compatible          -> available
    //   sink/in   already at 2 producers at rest          -> unavailable
    //   str/out   type-mismatch (wants "number", is "string") -> unavailable
    //   num2/out  OUTPUT->OUTPUT — ruling docs/peps/0002    -> unavailable
    await waitFor(() => {
      expect(dotAt(canvasElement, "sink", "in2").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "num2", "out").getAttribute("data-availability")).toBe("unavailable");
    });

    const up = centreOf(dotAt(canvasElement, "sink", "in2"));
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
    return connectionAvailability(VALIDATION_SCENE, { nodeId, portId }, { portsOf: validationPortsOf, typeOf: validationTypeOf, compatible: typesIntersect, directionOf: validationDirectionOf });
  }, [from]);
  const decorate = useMemo(() => decorateFromAvailability(availability), [availability]);

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        availability via controls — NOT a gesture; tldraw host has no cable gesture. Use the <code>from</code> control below to
        pick which port's availability map to paint.
      </p>
      <TldrawHost scene={VALIDATION_SCENE} width={620} height={320} decorate={decorate} />
    </div>
  );
}

export const TldrawControlDrivenAvailability: StoryObj<TldrawArgs> = {
  name: "tldraw — control-driven (not a gesture)",
  argTypes: { from: { control: "select", options: ["none", "num1/out", "str/out"] } },
  args: { from: "num1/out" },
  render: (args) => <TldrawControlDemo {...args} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      dotAt(canvasElement, "sink", "in");
      dotAt(canvasElement, "sink", "in2");
    });
    // The control's default (`from: "num1/out"`) already painted the map —
    // no pointer event anywhere in this play function.
    await waitFor(() => {
      expect(dotAt(canvasElement, "sink", "in2").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("unavailable");
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
