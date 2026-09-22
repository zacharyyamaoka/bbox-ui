import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "./domCanvas";
import type { Decorate, SceneNodeDecoration } from "./nodeViews";
import type { HostScene } from "./hostScene";
import { VALIDATION_SCENE, validationDirectionOf, validationPortsOf, validationTypeOf } from "./validationScene";
import { connectionAvailability, type PortAvailability } from "../scene/availability";
import { typesIntersect } from "../scene/lint";
import { portKey, type ScenePortRef } from "../scene/scene";

/**
 * Hosts/ValidityPreview — ruling 5, "Show the legal move set
 * during the gesture, not the error after it... Drag time validity
 * preview! actually even langflow has this. yes 100% lets implement this
 * feature... should be on by default!" (Zach, 2026-09-17).
 *
 * `connectionAvailability` (scene/availability.ts) is computed ONCE at
 * drag-start and held for the whole gesture — [OBSERVATION WINS], JointJS
 * `markAvailable`'s own lifecycle (see that file's header) — never
 * recomputed on pointermove. This story is the host adapter that turns
 * that map into `Port.availability` paint via the `decorate` seam
 * (`src/hosts/nodeViews.tsx`) and draws the would-be edge as a `Trace`
 * whose `color`/`strokeWidth` swap on the CURRENT hover target's
 * precomputed verdict (a lookup, not a re-validation) — maxGraph's own
 * green+3px/valid vs red+1px/invalid dual channel (App. B), zero new
 * `Trace` props (it already exposes both — `trace.tsx:200,210`).
 *
 * "Still keep the at-rest grammar": `SINK` starts with TWO producers
 * already wired into its one input (`num1`, `num2`) — a real many-to-one
 * lint finding, decorated onto the port exactly like `Lint.stories.tsx`
 * does, but through the HOST's `decorate` seam this time. It stays marked
 * throughout every gesture below — prevention is additive, not a
 * replacement (ruling 5's second half).
 *
 * No green design token exists anywhere in this kit (`src/globals.css`
 * only defines `--bbox-danger`/`--bbox-warning`/`--bbox-accent` — grepped)
 * so "legal" reuses a plain literal here rather than inventing a new
 * shared token unasked; "illegal" reuses the real `--bbox-danger` token
 * `diagnosticColorVar("error")` already resolves to.
 */

const meta = {
  title: "Hosts/ValidityPreview",
  tags: ["object:scene", "host:dom", "lane:validation-stack"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const AVAILABLE_COLOR = "#16a34a"; // no --bbox-success token exists (grepped); a literal, not a new shared token
const UNAVAILABLE_COLOR = "var(--bbox-danger)";
const NEUTRAL_COLOR = "var(--muted-foreground)";

/* ------------------------------------------------------------------ */
/* Fixture — SHARED with `ValidationHosts.stories.tsx` (ruling 8's        */
/* success criterion: the "does the gesture transfer" comparison is only */
/* honest if both host benches judge the SAME named ports). See           */
/* `hosts/validationScene.ts` for the fixture and why it moved there.    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* The host adapter: real pointer gesture -> connectionAvailability     */
/* (once, at drag-start) -> decorate -> Port paint, plus a preview Trace */
/* whose colour is a LOOKUP against the held map, never a re-validate.  */
/* ------------------------------------------------------------------ */

function dotCentre(container: HTMLElement, nodeId: string, portId: string): { x: number; y: number } | null {
  const wrap = container.querySelector<HTMLElement>(`[data-block-id="${nodeId}"] [data-port-id="${portId}"]`);
  if (!wrap) return null;
  const dot = wrap.querySelector<HTMLElement>('[data-slot="port-dot"]') ?? wrap;
  const rect = dot.getBoundingClientRect();
  const host = container.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - host.left, y: rect.top + rect.height / 2 - host.top };
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

function ValidityPreviewDemo({ validityPreview }: { validityPreview: boolean }) {
  const [scene, setScene] = useState<HostScene>(VALIDATION_SCENE);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ from: ScenePortRef; availability: Map<string, PortAvailability> } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // The at-rest grammar (ruling 5's second half): sink/in's many-to-one
  // finding, computed from the CURRENT committed scene — nothing to do
  // with the drag state above, and never cleared by it.
  const restDecoration = useMemo<SceneNodeDecoration | undefined>(() => {
    const producers = scene.edges.filter((e) => e.target === "sink" && e.targetHandle === "in");
    if (producers.length < 2) return undefined;
    return {
      portDiagnostics: { in: [{ id: "lint:many-to-one:port:sink/in", severity: "error", message: `Port "sink/in" has ${producers.length} producers wired in (no region makes them exclusive)`, code: "many-to-one" }] },
    };
  }, [scene.edges]);

  const decorate = useCallback<Decorate>(
    (node) => {
      const rest = node.id === "sink" ? restDecoration : undefined;
      if (!drag) return rest;
      const availability: Record<string, "available" | "unavailable"> = {};
      for (const portId of Object.values(node.data.ports ?? {}).flat()) {
        const entry = drag.availability.get(portKey(node.id, portId));
        if (entry) availability[portId] = entry.verdict.allowed ? "available" : "unavailable";
      }
      if (Object.keys(availability).length === 0) return rest;
      return { ...rest, availability };
    },
    [drag, restDecoration],
  );

  const hoverTarget = useMemo(() => {
    if (!drag || !pointer || !containerRef.current) return null;
    const el = document.elementFromPoint(pointer.x + containerRef.current.getBoundingClientRect().left, pointer.y + containerRef.current.getBoundingClientRect().top);
    if (!el) return null;
    const ref = portRefAt(el);
    if (!ref) return null;
    const entry = drag.availability.get(portKey(ref.nodeId, ref.portId));
    if (!entry) return null;
    return { ref, allowed: entry.verdict.allowed };
  }, [drag, pointer]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const host = containerRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const onUp = (event: PointerEvent) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const ref = el ? portRefAt(el) : null;
      if (ref) {
        const entry = drag.availability.get(portKey(ref.nodeId, ref.portId));
        if (entry?.verdict.allowed) {
          const newEdge = {
            id: `e-preview-${scene.edges.length}-${Date.now()}`,
            source: drag.from.nodeId,
            sourceHandle: drag.from.portId,
            target: ref.nodeId,
            targetHandle: ref.portId,
          };
          setScene((prev) => ({ ...prev, edges: [...prev.edges, newEdge] }));
        }
        // else: the invalid-release indication is exactly THIS — the
        // gesture ends and nothing commits. No separate error state to
        // paint; ruling 2 already produced the reason (unavailable) and a
        // caller is free to show more, this story chooses not to.
      }
      setDrag(null);
      setPointer(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, scene.edges.length]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!validityPreview) return;
    const ref = portRefAt(event.target as Element);
    if (!ref) return;
    const availability = connectionAvailability(scene, ref, { portsOf: validationPortsOf, typeOf: validationTypeOf, compatible: typesIntersect, directionOf: validationDirectionOf });
    setDrag({ from: ref, availability });
    const rect = containerRef.current!.getBoundingClientRect();
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const fromCentre = drag ? dotCentre(containerRef.current!, drag.from.nodeId, drag.from.portId) : null;

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        validityPreview: <code>{String(validityPreview)}</code> — drag from num1/num2's <code>out</code> (legal: sink/in2, same
        type) or str's <code>out</code> (illegal: sink wants "number"). sink/in already carries a many-to-one mark at rest, and
        stays unavailable as a drag target too — with or without a gesture in flight, that survives every drag below.
      </p>
      <div ref={containerRef} onPointerDown={handlePointerDown} style={{ position: "relative", width: 560, height: 320 }}>
        <DomCanvas scene={scene} onSceneChange={setScene} width={560} height={320} decorate={decorate} />
        {drag && pointer && fromCentre && (
          <svg data-slot="validity-preview-overlay" width={560} height={320} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
            <line
              data-slot="preview-trace"
              data-preview-verdict={hoverTarget ? (hoverTarget.allowed ? "allowed" : "refused") : "unresolved"}
              x1={fromCentre.x}
              y1={fromCentre.y}
              x2={pointer.x}
              y2={pointer.y}
              stroke={hoverTarget ? (hoverTarget.allowed ? AVAILABLE_COLOR : UNAVAILABLE_COLOR) : NEUTRAL_COLOR}
              strokeWidth={hoverTarget ? (hoverTarget.allowed ? 3 : 1) : 1.5}
              strokeDasharray={hoverTarget ? undefined : "4 3"}
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play helpers — real pointer sequences, spatial claims measured        */
/* ------------------------------------------------------------------ */

function firePointer(el: Element | Window, kind: "down" | "move" | "up", x: number, y: number) {
  el.dispatchEvent(new PointerEvent(`pointer${kind}`, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: kind === "up" ? 0 : 1, pointerId: 1, isPrimary: true, view: window }));
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

/* ------------------------------------------------------------------ */
/* Interactive — args toggle, DEFAULT true (Zach's own requirement)      */
/* ------------------------------------------------------------------ */

export const Interactive: StoryObj<{ validityPreview: boolean }> = {
  name: "Drag-Time Validity Preview",
  argTypes: { validityPreview: { control: "boolean" } },
  args: { validityPreview: true },
  render: (args) => <ValidityPreviewDemo validityPreview={args.validityPreview} />,
  play: async ({ canvasElement, args }) => {
    await waitFor(() => {
      dotAt(canvasElement, "num1", "out");
      dotAt(canvasElement, "sink", "in");
      dotAt(canvasElement, "sink", "in2");
    });

    // At-rest grammar, present before any gesture starts.
    await waitFor(() => {
      const sinkIn = dotAt(canvasElement, "sink", "in");
      expect(sinkIn.getAttribute("data-diagnostic")).toBe("error");
    });

    if (!args.validityPreview) {
      // Toggle OFF: a full press-move-release changes nothing about
      // availability paint — mechanical proof the gate actually gates.
      const from = dotAt(canvasElement, "num1", "out");
      const to = centreOf(dotAt(canvasElement, "sink", "in2"));
      firePointer(from, "down", ...(Object.values(centreOf(from)) as [number, number]));
      firePointer(window, "move", to.x, to.y);
      firePointer(window, "up", to.x, to.y);
      expect(canvasElement.querySelectorAll("[data-availability]").length).toBe(0);
      return;
    }

    // -- Gesture 1: num1/out -> sink/in2, a LEGAL target -----------------
    const from1 = dotAt(canvasElement, "num1", "out");
    const p1 = centreOf(from1);
    firePointer(from1, "down", p1.x, p1.y);

    // Legal targets marked AT DRAG START (ruling 5). sink/in2 is empty and
    // type-compatible; sink/in is ALREADY many-to-one at rest, so — per
    // lint.ts's own rule — it correctly reads unavailable too (a further
    // wire into an already-oversubscribed port is not "legal" either);
    // str/out is the type-mismatch case; num2/out is the OUTPUT→OUTPUT
    // case (docs/peps/0002-the-judge-owns-edge-orientation.md) — same
    // declared type as num1 ("number"), so before `directionOf` existed
    // on `AvailabilityOptions` this read "available" too. Pinned here so
    // the real host bench — not just the unit tests — proves the fix.
    await waitFor(() => {
      expect(dotAt(canvasElement, "sink", "in2").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "num2", "out").getAttribute("data-availability")).toBe("unavailable");
    });
    // num1's OWN port is never offered to itself.
    expect(dotAt(canvasElement, "num1", "out").getAttribute("data-availability")).toBeNull();

    const sinkIn = centreOf(dotAt(canvasElement, "sink", "in2"));
    firePointer(window, "move", sinkIn.x, sinkIn.y);
    await waitFor(() => {
      const preview = canvasElement.parentElement!.ownerDocument.querySelector('[data-slot="preview-trace"]') ?? canvasElement.querySelector('[data-slot="preview-trace"]');
      if (!preview) throw new Error("preview trace not drawn yet");
      expect(preview.getAttribute("data-preview-verdict")).toBe("allowed");
    });

    const edgesBefore = canvasElement.querySelectorAll("[data-wire-id]").length;
    firePointer(window, "up", sinkIn.x, sinkIn.y);

    // The legal release COMMITTED — a new wire renders, and the map
    // clears (no gesture in flight => zero `data-availability` anywhere).
    await waitFor(() => {
      expect(canvasElement.querySelectorAll("[data-wire-id]").length).toBe(edgesBefore + 1);
      expect(canvasElement.querySelectorAll("[data-availability]").length).toBe(0);
    });

    // -- Gesture 2: num2/out -> str/out, an ILLEGAL target ---------------
    const from2 = dotAt(canvasElement, "num2", "out");
    const p2 = centreOf(from2);
    firePointer(from2, "down", p2.x, p2.y);
    await waitFor(() => expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable"));

    const strOut = centreOf(dotAt(canvasElement, "str", "out"));
    firePointer(window, "move", strOut.x, strOut.y);
    await waitFor(() => {
      const preview = canvasElement.querySelector('[data-slot="preview-trace"]');
      if (!preview) throw new Error("preview trace not drawn yet");
      expect(preview.getAttribute("data-preview-verdict")).toBe("refused");
    });

    const edgesBeforeInvalid = canvasElement.querySelectorAll("[data-wire-id]").length;
    firePointer(window, "up", strOut.x, strOut.y);

    // The invalid-release indication: nothing commits.
    await waitFor(() => {
      expect(canvasElement.querySelectorAll("[data-wire-id]").length).toBe(edgesBeforeInvalid);
    });

    // The at-rest grammar SURVIVED both gestures.
    expect(dotAt(canvasElement, "sink", "in").getAttribute("data-diagnostic")).toBe("error");
  },
};

export const PreviewOff: StoryObj<{ validityPreview: boolean }> = {
  name: "Preview Off (toggled)",
  args: { validityPreview: false },
  render: (args) => <ValidityPreviewDemo validityPreview={args.validityPreview} />,
  play: Interactive.play,
};

/**
 * The output→output regression, held mid-gesture rather than settled —
 * `Interactive`'s own play function releases the pointer and clears the
 * map before it ends, so its OWN screenshot can never show the live paint
 * this story exists to freeze. Report capture (`docs/build_lane_report.py`)
 * screenshots a story's SETTLED state, so a dedicated story that stops
 * after the down (never fires `pointerup`) is what makes the fix a
 * capturable picture: `num2/out` painted unavailable (polarity — another
 * OUTPUT), `sink/in2` available (the legal opposite-polarity target),
 * `sink/in` unavailable (already oversubscribed at rest, unrelated to
 * polarity), `num1/out` never offered to itself.
 * docs/peps/0002-the-judge-owns-edge-orientation.md.
 */
export const OutputToOutputRefused: Story = {
  name: "Output→Output Refused (mid-gesture, for capture)",
  render: () => <ValidityPreviewDemo validityPreview={true} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      dotAt(canvasElement, "num1", "out");
      dotAt(canvasElement, "num2", "out");
      dotAt(canvasElement, "sink", "in2");
    });
    const from = dotAt(canvasElement, "num1", "out");
    const p = centreOf(from);
    firePointer(from, "down", p.x, p.y);
    await waitFor(() => {
      expect(dotAt(canvasElement, "num2", "out").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "sink", "in2").getAttribute("data-availability")).toBe("available");
      expect(dotAt(canvasElement, "sink", "in").getAttribute("data-availability")).toBe("unavailable");
      expect(dotAt(canvasElement, "str", "out").getAttribute("data-availability")).toBe("unavailable");
    });
    // Deliberately no `pointerup` — the drag (and its paint) stays live for
    // the screenshot this story exists to provide.
  },
};
