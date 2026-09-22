import { useCallback, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";

import { Port } from "../components/port";
import { catalogFor, type NodeCatalogEntry } from "./nodeCatalog";
import { EdgeDropMenu } from "./edgeDropMenu";
import { validateConnection, type ConnectionVerdict } from "../scene/edgeValidation";
import type { LintScene, PortDirection } from "../scene/lint";
import type { SceneEdgeEnds } from "../scene/scene";

/**
 * Blocks/Editor/Edge Drop Menu — card 14: "a cable that landed on nothing
 * is a question, not a mistake." Zach: "agree this is nice. Let's please
 * add this to editor-components. We already have the implementation in
 * SystemSketch." Ported (as behaviour, not code — see
 * `../editor/edgeDropMenu.tsx`'s own header) from
 * `/home/bam/systemsketch/src/blocks/ui/OnCanvasBlockPicker.tsx` and its
 * caller `ConnectionShapeUtil.tsx:2652-2700` (`offerBlockForLooseTerminal`).
 *
 * This file is the story-local HOST adapter — the same division of labour
 * `FocusView.stories.tsx` already established for `editor/focusControls.tsx`:
 * the kit component (`EdgeDropMenu`) takes plain props and callbacks; this
 * file owns the pointer gesture, the demo catalog, and — the one piece
 * card 23 makes non-negotiable — the `judge` callback wired to the REAL
 * `validateConnection`, not a stand-in. `judgeVerdict` below is exactly
 * the "one line" fix `batchWireJudge.ts`'s own header quotes Zach asking
 * for: `const judge = (c) => validateConnection(scene, c)`.
 *
 * The demo: one node (`producer`) with a single SOURCE port typed
 * `number`. Four catalog entries: a `transform` (untyped, always
 * compatible), a `number-sink` (typed `number`, compatible), a
 * `string-sink` (typed `string`, DELIBERATELY incompatible — this is the
 * entry the judge must refuse), and a `source-only` entry with no input
 * at all (filtered out earlier, by `catalogFor`'s own polarity check,
 * before the judge ever sees it). Two different reasons an entry can be
 * missing, both exercised.
 */

const meta = {
  title: "Editor/EdgeDropMenu",
  tags: ["object:trace", "lane:edge-drop-menu"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* The demo catalog and scene                                          */
/* ------------------------------------------------------------------ */

const ANCHOR_NODE_ID = "producer";
const ANCHOR_PORT_ID = "out";
const ANCHOR_TYPES: readonly string[] = ["number"];

const CATALOG: readonly NodeCatalogEntry[] = [
  { id: "transform", label: "Transform", kind: "demo", icon: "lucide:arrow-right-left", inputs: 1, outputs: 1 },
  { id: "number-sink", label: "Number Sink", kind: "demo", icon: "lucide:hash", inputs: 1, outputs: 0, types: ["number"] },
  // Deliberately incompatible: accepts only "string", the anchored port
  // emits "number". Present after `catalogFor` (it DOES have an input),
  // absent after the judge (`validateConnection`'s type-mismatch gate).
  { id: "string-sink", label: "String Sink", kind: "demo", icon: "lucide:type", inputs: 1, outputs: 0, types: ["string"] },
  // No input at all — filtered by catalogFor's polarity check, never
  // reaches the judge. The other reason an entry can be absent.
  { id: "source-only", label: "Source Only", kind: "demo", icon: "lucide:zap", inputs: 0, outputs: 1 },
];

interface DemoScene extends LintScene {
  nodes: { id: string }[];
  edges: (SceneEdgeEnds & { id: string })[];
}

const INITIAL_SCENE: DemoScene = { nodes: [{ id: ANCHOR_NODE_ID }], edges: [] };

function catalogEntry(nodeId: string): NodeCatalogEntry | undefined {
  return CATALOG.find((entry) => entry.id === nodeId);
}

function typeOf(ref: { nodeId: string; portId: string }): readonly string[] | undefined {
  if (ref.nodeId === ANCHOR_NODE_ID) return ANCHOR_TYPES;
  return catalogEntry(ref.nodeId)?.types;
}

function directionOf(ref: { nodeId: string; portId: string }): PortDirection | undefined {
  if (ref.nodeId === ANCHOR_NODE_ID) return "source";
  const entry = catalogEntry(ref.nodeId);
  if (!entry) return undefined;
  return entry.inputs > 0 ? "sink" : "source";
}

function portsOf(nodeId: string): readonly string[] | undefined {
  if (nodeId === ANCHOR_NODE_ID) return [ANCHOR_PORT_ID];
  const entry = catalogEntry(nodeId);
  if (!entry) return undefined;
  return entry.inputs > 0 ? ["in"] : ["out"];
}

/**
 * CARD 23's rule, made real: the same judge a raw press would run
 * through, wired to `validateConnection` — not a re-implemented filter.
 * Builds the hypothetical scene (the candidate entry's node, provisionally
 * added) and the candidate edge exactly as a host's real drop handler
 * would, then asks the one engine that gates every connection in this
 * repo. Nothing here decides compatibility on its own.
 */
function judgeVerdict(scene: DemoScene, entry: NodeCatalogEntry): ConnectionVerdict {
  const hypothetical: DemoScene = { nodes: [...scene.nodes, { id: entry.id }], edges: scene.edges };
  const candidate: SceneEdgeEnds & { id: string } = {
    id: `candidate-${entry.id}`,
    source: ANCHOR_NODE_ID,
    sourceHandle: ANCHOR_PORT_ID,
    target: entry.id,
    targetHandle: "in",
  };
  return validateConnection(hypothetical, candidate, { portsOf, directionOf, typeOf });
}

/* ------------------------------------------------------------------ */
/* The host adapter — drag from the port, drop on empty canvas          */
/* ------------------------------------------------------------------ */

const CANVAS_W = 480;
const CANVAS_H = 220;

interface Offer {
  anchor: { x: number; y: number };
}

function EdgeDropMenuDemo({ portX, portY }: { portX: number; portY: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [scene, setScene] = useState<DemoScene>(INITIAL_SCENE);
  const [offer, setOffer] = useState<Offer | null>(null);

  // The anchored port is a SOURCE, so the offer must supply the OPPOSITE
  // polarity — a SINK — same derivation as the donor's `needed =
  // oppositePolarity(anchoredPolarity)` (`ConnectionShapeUtil.tsx:2670`).
  const candidates = useMemo(() => catalogFor(CATALOG, { direction: "sink" as PortDirection }), []);

  const onPortPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Capture so a release over empty canvas still reaches this element's
    // own pointerup handler — without it the browser would target
    // whatever sits under the cursor at release time. Guarded: some
    // synthetic-dispatch test environments raise on a capture call with
    // no matching real hardware pointer session; this demo harness (not
    // the kit component) can afford to no-op there.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic dispatch in a play function — see comment above */
    }
    dragStart.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPortPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    // A tiny release-near-press is a click, not a drag that landed
    // anywhere — same distinction `interaction/dragIntent.ts` draws for
    // node dragging, re-derived here rather than imported (this harness
    // is sensing a CABLE drop, not a node move — a different gesture with
    // its own, much simpler, threshold).
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOffer({ anchor: { x: event.clientX - rect.left, y: event.clientY - rect.top } });
  }, []);

  const judge = useCallback((entry: NodeCatalogEntry) => judgeVerdict(scene, entry).allowed, [scene]);

  const onPick = useCallback(
    (entry: NodeCatalogEntry) => {
      const verdict = judgeVerdict(scene, entry);
      if (!verdict.allowed) return; // defensive only — the judge already filtered this list
      setScene((prev) => ({
        // The demo reuses the catalog entry's own id as the new node's id
        // for simplicity — a real host mints a fresh one (card 13's
        // `instantiate` is the sibling of that minting; out of this
        // lane's scope, see `nodeCatalog.ts`'s own header).
        nodes: [...prev.nodes, { id: entry.id }],
        edges: [...prev.edges, { id: `edge-${entry.id}`, ...verdict.oriented.ends }],
      }));
      setOffer(null);
    },
    [scene],
  );

  return (
    <div
      ref={containerRef}
      data-testid="edge-drop-canvas"
      onPointerDown={(event) => {
        // A press on the bare canvas backdrop (not the port, not the
        // menu — the menu stops its own pointerdown from bubbling this
        // far, see EdgeDropMenu's own outside-press listener) — nothing
        // to do here itself; this exists only so the element is a real
        // pointerdown target for the "outside press declines" play step.
        void event;
      }}
      style={{
        position: "relative",
        width: CANVAS_W,
        height: CANVAS_H,
        overflow: "hidden",
        // `outline`, not `border`: a border shifts the containing block's
        // padding edge, which would put every `position: absolute` child
        // (the port, the menu) 1px off from the plain client-coordinate
        // math the play function below checks pixel-for-pixel against.
        outline: "1px dashed color-mix(in srgb, currentColor 30%, transparent)",
        outlineOffset: -1,
        fontFamily: "ui-sans-serif, sans-serif",
        fontSize: 12,
      }}
    >
      <div style={{ position: "absolute", left: portX, top: portY }} data-testid="anchor-port-wrap">
        <Port data-testid="anchor-port" state="empty" onPointerDown={onPortPointerDown} onPointerUp={onPortPointerUp} />
      </div>
      <div style={{ position: "absolute", left: portX + 20, top: portY + 16, color: "var(--muted-foreground, #888)" }}>
        {ANCHOR_NODE_ID}/{ANCHOR_PORT_ID}
      </div>
      {scene.nodes
        .filter((node) => node.id !== ANCHOR_NODE_ID)
        .map((node, index) => (
          <div
            key={node.id}
            data-testid={`committed-node-${node.id}`}
            style={{ position: "absolute", right: 12, top: 12 + index * 20 }}
          >
            {node.id}
          </div>
        ))}
      {scene.edges.map((edge) => (
        <span key={edge.id} data-testid={`committed-edge-${edge.id}`} hidden>
          {edge.source}/{edge.sourceHandle}-{edge.target}/{edge.targetHandle}
        </span>
      ))}
      {offer && (
        <EdgeDropMenu
          anchor={offer.anchor}
          viewport={{ width: CANVAS_W, height: CANVAS_H }}
          entries={candidates}
          judge={judge}
          onPick={onPick}
          onDismiss={() => setOffer(null)}
          preferSide="end"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Play-function helpers                                                */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function firePointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }),
  );
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Press on the anchor port, glide to `(dropX, dropY)` (viewport/client
 *  coordinates), release — the "press on an output port, move to empty
 *  canvas, release" gesture the acceptance criteria names. */
async function dragFromAnchorPort(canvasElement: HTMLElement, dropX: number, dropY: number): Promise<void> {
  const port = required<HTMLElement>(canvasElement, '[data-testid="anchor-port"]', "the anchor port");
  const startRect = port.getBoundingClientRect();
  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top + startRect.height / 2;
  firePointer(port, "pointerdown", startX, startY);
  await tick(10);
  firePointer(port, "pointermove", (startX + dropX) / 2, (startY + dropY) / 2);
  await tick(10);
  firePointer(port, "pointerup", dropX, dropY);
  await tick(10);
}

async function waitForMenu(canvasElement: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => {
    const menu = canvasElement.querySelector('[data-testid="edge-drop-menu"]');
    if (!menu) throw new Error("expected the edge-drop menu to be open");
    if (!menu.getAttribute("data-side")) throw new Error("expected the menu's placement to have been measured");
  });
  return required<HTMLElement>(canvasElement, '[data-testid="edge-drop-menu"]', "the edge-drop menu");
}

async function waitForMenuClosed(canvasElement: HTMLElement): Promise<void> {
  await waitFor(() => {
    if (canvasElement.querySelector('[data-testid="edge-drop-menu"]')) throw new Error("expected the edge-drop menu to be closed");
  });
}

/* ------------------------------------------------------------------ */
/* Default — comfortably inside the canvas, no flip needed              */
/* ------------------------------------------------------------------ */

export const Default: Story = {
  render: () => <EdgeDropMenuDemo portX={40} portY={90} />,
  play: async ({ canvasElement }) => {
    // Nothing open at rest.
    expect(canvasElement.querySelector('[data-testid="edge-drop-menu"]')).toBeNull();

    const canvasRect = required<HTMLElement>(canvasElement, '[data-testid="edge-drop-canvas"]', "the canvas").getBoundingClientRect();
    const dropX = canvasRect.left + 220;
    const dropY = canvasRect.top + 110;

    await dragFromAnchorPort(canvasElement, dropX, dropY);
    const menu = await waitForMenu(canvasElement);

    // Anchored to the loose end: preferSide="end" fits here (plenty of
    // room to the right), so the menu opens flush against the drop point
    // and is vertically centred on it.
    expect(menu.getAttribute("data-side")).toBe("end");
    const menuRect = menu.getBoundingClientRect();
    expect(Math.round(menuRect.left)).toBe(Math.round(dropX));
    expect(Math.abs(menuRect.top + menuRect.height / 2 - dropY)).toBeLessThan(2);

    // Judge-filtered offer: the type-compatible entries render, the
    // deliberately-incompatible one (string-sink, refused by
    // validateConnection's type-mismatch gate) is ABSENT from the DOM —
    // not disabled, not present-but-greyed, genuinely not rendered — and
    // source-only (no input port at all) never even reached the judge,
    // filtered earlier by catalogFor.
    expect(canvasElement.querySelector('[data-testid="edge-drop-menu-item-transform"]')).not.toBeNull();
    expect(canvasElement.querySelector('[data-testid="edge-drop-menu-item-number-sink"]')).not.toBeNull();
    expect(canvasElement.querySelector('[data-testid="edge-drop-menu-item-string-sink"]')).toBeNull();
    expect(canvasElement.querySelector('[data-testid="edge-drop-menu-item-source-only"]')).toBeNull();

    // Escape dismisses without committing anything.
    await userEvent.keyboard("{Escape}");
    await waitForMenuClosed(canvasElement);
    expect(canvasElement.querySelectorAll('[data-testid^="committed-node-"]').length).toBe(0);

    // Re-open, then a press on the bare canvas backdrop (outside the
    // menu) declines the offer, again without committing.
    await dragFromAnchorPort(canvasElement, dropX, dropY);
    await waitForMenu(canvasElement);
    firePointer(required(canvasElement, '[data-testid="edge-drop-canvas"]', "the canvas"), "pointerdown", canvasRect.left + 10, canvasRect.top + 10);
    await waitForMenuClosed(canvasElement);
    expect(canvasElement.querySelectorAll('[data-testid^="committed-node-"]').length).toBe(0);

    // Re-open, pick "Transform" — commits exactly one node and one edge,
    // oriented exactly as the judge's own verdict said (producer/out ->
    // transform/in, not reversed — the anchored end really is the
    // source).
    await dragFromAnchorPort(canvasElement, dropX, dropY);
    await waitForMenu(canvasElement);
    await userEvent.click(required(canvasElement, '[data-testid="edge-drop-menu-item-transform"]', "the Transform entry"));
    await waitForMenuClosed(canvasElement);
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-testid^="committed-node-"]').length).toBe(1);
    });
    expect(canvasElement.querySelector('[data-testid="committed-node-transform"]')).not.toBeNull();
    const committedEdge = required<HTMLElement>(canvasElement, '[data-testid="committed-edge-edge-transform"]', "the committed edge");
    expect(committedEdge.textContent).toBe("producer/out-transform/in");
  },
};

/* ------------------------------------------------------------------ */
/* Opens Near Viewport Edge — the flip-then-clamp branch, measured       */
/* ------------------------------------------------------------------ */

export const OpensNearViewportEdge: Story = {
  name: "Opens Near Viewport Edge",
  render: () => <EdgeDropMenuDemo portX={40} portY={90} />,
  play: async ({ canvasElement }) => {
    const canvas = required<HTMLElement>(canvasElement, '[data-testid="edge-drop-canvas"]', "the canvas");
    const canvasRect = canvas.getBoundingClientRect();

    // Drop right at the canvas's own right margin: preferSide="end" (224px
    // wide menu, `w-56`) cannot fit — 470 + 224 far exceeds the 480px-wide
    // viewport — so this MUST flip to "start" and then clamp, never
    // spilling past either edge.
    const dropX = canvasRect.left + CANVAS_W - 10;
    const dropY = canvasRect.top + CANVAS_H / 2;

    await dragFromAnchorPort(canvasElement, dropX, dropY);
    const menu = await waitForMenu(canvasElement);

    expect(menu.getAttribute("data-side")).toBe("start");
    const menuRect = menu.getBoundingClientRect();
    // Flipped-then-clamped inside the viewport: measured, not inferred —
    // the menu's own box never crosses either edge of the canvas that IS
    // this story's `viewport` prop.
    expect(menuRect.left).toBeGreaterThanOrEqual(canvasRect.left - 0.5);
    expect(menuRect.right).toBeLessThanOrEqual(canvasRect.right + 0.5);
    expect(menuRect.top).toBeGreaterThanOrEqual(canvasRect.top - 0.5);
    expect(menuRect.bottom).toBeLessThanOrEqual(canvasRect.bottom + 0.5);
  },
};
