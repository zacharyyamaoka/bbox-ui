import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";

import { DomCanvas } from "./domCanvas";
import { TldrawHost } from "./tldrawHost";
import { hostPortsOf, type HostScene } from "./hostScene";
import { loadPyblocksScene } from "./pyblocksScene";
import { createSceneEventSeam, deriveSceneEvents, type SceneEvent } from "../scene/sceneEvents";

// The FROZEN contract bytes, imported rather than retyped: these are the
// same files pyblocks' own acceptance asserts its projection equals
// (docs/fixtures/pyblocks-scene/README.md), so a story that renders them is
// rendering what the Python side will actually send — not a hand-made
// look-alike that could drift from it without anything failing.
import linearChainDocument from "../../../../docs/fixtures/pyblocks-scene/linear_chain.scene.json";
import regionForIfDocument from "../../../../docs/fixtures/pyblocks-scene/region_for_if.scene.json";
import editSessionFixture from "../../../../docs/fixtures/pyblocks-scene/events_edit_session.json";

/**
 * Blocks/Scene/Pyblocks — a pyblocks document, loaded and rendered by hosts
 * that know nothing about pyblocks (docs/PYBLOCKS-BACKEND-PLAN.md, lane
 * `trunk-loader-events`).
 *
 * The two ideas these stories exist to show, in the artefact rather than in
 * prose:
 *
 * EVERYTHING IS A BLOCK. `run()` and `for …:` are not frames drawn around
 * blocks — they are region NODES whose corner card is a real Block with
 * real ports, so `boundary-input-raw` is a dot you can wire exactly like
 * `in-raw` on `decode()`. The DOM canvas proves it structurally: ONE
 * host-level node (the root region) with every other block inside it.
 *
 * NEVER MIX DATA AND CONTROL. `region_for_if` carries two `control` edges.
 * They are in the document, whole, and they are NOT wires: the caption
 * counts them and the canvas draws none. Containment — the `for` region
 * holding the `if` region holding its two blocks — is what says the control
 * flow, which is why nothing has to be drawn.
 */

const meta = {
  title: "Blocks/Scene/Pyblocks",
  tags: ["area:blocks", "lane:pyblocks-backend"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

/* ------------------------------------------------------------------ */
/* The two documents, loaded once — `loadPyblocksScene` is pure         */
/* ------------------------------------------------------------------ */

const linear = loadPyblocksScene(linearChainDocument);
const regionForIf = loadPyblocksScene(regionForIfDocument);

const RUN_REGION = "function:run@3:0/boundary:selected-function";
const DECODE = "function:run@3:0/transform:call@4:12-4:23";
const SCALE = "function:run@3:0/transform:call@5:13-5:35";
const SORT_REGION = "function:sort_frame@4:0/boundary:selected-function";

/** The claim the `controlEdges` list makes, as a sentence on the board. */
const CONTROL_CAPTION = `${regionForIf.document.controlEdges.length} control edges kept aside, 0 drawn`;

const CAPTION_STYLE = {
  position: "absolute" as const,
  left: 8,
  bottom: 6,
  margin: 0,
  font: "12px/1.4 ui-monospace, monospace",
  color: "var(--color-muted-foreground, #666)",
};

/* ------------------------------------------------------------------ */
/* linear_chain — the shape of a loaded document                        */
/* ------------------------------------------------------------------ */

export const LinearChainDomCanvas: Story = {
  name: "linear_chain (DOM Canvas)",
  render: () => (
    <DomCanvas scene={linear.scene} width={720} height={470}>
      <p style={CAPTION_STYLE} data-slot="document-caption">
        {linear.document.source.title} · {linear.document.scene.nodes.length} nodes ·{" "}
        {linear.problems.length} problems
      </p>
    </DomCanvas>
  ),
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");

    // Everything is a block: the FUNCTION is the only host-level node, and
    // its body blocks live inside it — not beside it.
    await waitFor(() => {
      expect(host.querySelectorAll("[data-scene-node]")).toHaveLength(1);
    });
    required(host, `[data-scene-node="${RUN_REGION}"]`, "the run() region as the one host node");
    required(host, `[data-scene-node="${RUN_REGION}"] [data-block-id="${DECODE}"]`, "decode() inside the region");
    required(host, `[data-scene-node="${RUN_REGION}"] [data-block-id="${SCALE}"]`, "scale() inside the region");
    // The region's own interface is a real Block with real ports.
    required(host, `[data-block-id="${RUN_REGION}"] [data-port-id="boundary-input-raw"]`, "the region's own raw pin");

    // Truthful property rendering: the FACE shows the authored name, the
    // ID stays the semantic id an edge and an edit event name it by.
    const port = required<HTMLElement>(host, '[data-port-id="in-raw"]', "decode()'s raw port");
    await waitFor(() => {
      expect(port.textContent).toBe("raw");
    });
    expect(port.getAttribute("data-port-id")).toBe("in-raw");

    // Every wire the document declares resolves to a real dot.
    const layer = required<SVGSVGElement>(host, '[data-slot="wire-layer"]', "the wire layer");
    await waitFor(() => {
      expect(layer.getAttribute("data-unresolved-wires")).toBe("");
    });
    expect(linear.problems).toEqual([]);
  },
};

/* ------------------------------------------------------------------ */
/* region_for_if — nesting says the control flow, so nothing is drawn   */
/* ------------------------------------------------------------------ */

export const RegionForIfDomCanvas: Story = {
  name: "region_for_if (DOM Canvas)",
  render: () => (
    <DomCanvas scene={regionForIf.scene} width={1180} height={760}>
      <p style={CAPTION_STYLE} data-slot="control-edge-caption">
        {CONTROL_CAPTION}
      </p>
    </DomCanvas>
  ),
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="dom-canvas"]', "the DOM Canvas host");

    // 11 blocks, one card each — regions included, because a region's
    // interface IS a block.
    await waitFor(() => {
      expect(host.querySelectorAll("[data-block-id]")).toHaveLength(regionForIf.scene.nodes.length);
    });
    expect(regionForIf.scene.nodes).toHaveLength(11);
    await waitFor(() => {
      expect(host.querySelectorAll("[data-scene-node]")).toHaveLength(1);
    });
    required(host, `[data-scene-node="${SORT_REGION}"]`, "the sort_frame() region as the one host node");

    // Never mix data and control: the two control edges are in the
    // document and nowhere on the canvas.
    const caption = required<HTMLElement>(host, '[data-slot="control-edge-caption"]', "the control-edge caption");
    expect(caption.textContent).toBe(CONTROL_CAPTION);
    expect(regionForIf.document.controlEdges).toHaveLength(2);
    for (const controlEdge of regionForIf.document.controlEdges) {
      expect(host.querySelector(`[data-wire-id="${controlEdge.id}"]`)).toBeNull();
      expect(regionForIf.scene.edges.map((edge) => edge.id)).not.toContain(controlEdge.id);
    }
  },
};

/* ------------------------------------------------------------------ */
/* region_for_if in tldraw — the honest reading, not a happy assertion  */
/* ------------------------------------------------------------------ */

function TldrawWithUnresolvedCaption() {
  return (
    <div style={{ position: "relative", width: 1180, height: 760 }}>
      <TldrawHost scene={regionForIf.scene} width={1180} height={730} />
      <p style={{ ...CAPTION_STYLE, bottom: 0 }} data-slot="unresolved-wire-caption" />
    </div>
  );
}

export const RegionForIfTldraw: Story = {
  name: "region_for_if (tldraw)",
  render: () => <TldrawWithUnresolvedCaption />,
  play: async ({ canvasElement }) => {
    const host = required<HTMLElement>(canvasElement, '[data-host="tldraw"]', "the tldraw host");
    await waitFor(
      () => {
        expect(host.querySelectorAll("[data-scene-node]")).toHaveLength(1);
      },
      { timeout: 10000 },
    );

    const layer = await waitFor(
      () => required<SVGSVGElement>(host, '[data-slot="wire-layer"]', "the wire layer"),
      { timeout: 10000 },
    );
    // WHY this READS the unresolved channel instead of asserting it empty:
    // a wire into a MEMBER resolves only where the member's dot is in the
    // DOM at a measurable place, and tldraw's shape tree does not give the
    // member anchors the DOM canvas has (plan §10 / follow-up F4). The
    // honest story states the number it measured; a green `toBe("")` here
    // would be a claim about a gap that is known to be open.
    const unresolved = layer.getAttribute("data-unresolved-wires") ?? "";
    const count = unresolved === "" ? 0 : unresolved.split(",").length;
    const caption = required<HTMLElement>(canvasElement, '[data-slot="unresolved-wire-caption"]', "the unresolved-wire caption");
    caption.textContent = `${count} of ${regionForIf.scene.edges.length} wires unresolved in this host (member anchors — known gap, plan §10/F4)`;

    expect(caption.textContent).toContain(`of ${regionForIf.scene.edges.length} wires unresolved`);
    expect(Number.isInteger(count)).toBe(true);
    // The control edges never reach a host at all, in any engine.
    for (const controlEdge of regionForIf.document.controlEdges) {
      expect(unresolved.split(",")).not.toContain(controlEdge.id);
    }
  },
};

/* ------------------------------------------------------------------ */
/* the edit session — what a gesture would publish                      */
/* ------------------------------------------------------------------ */

const EDIT_BEFORE = editSessionFixture.before as unknown as HostScene;
const EDIT_AFTER = editSessionFixture.after as unknown as HostScene;

// WHY the host hands the deriver a port resolver instead of the deriver
// reaching for one: `scene/sceneEvents.ts` is generic over node data and
// its default reads `data.ports` walls only — which is every port a `block`
// speaks and NONE of the ports a `value` node speaks (`writers`/`readers`,
// this family's own asymmetry, hostScene.ts's `portIdsOf`). Knowing that
// asymmetry is the host's job; the scene kit is not allowed to know it.
const EDIT_PORTS = { before: hostPortsOf(EDIT_BEFORE), after: hostPortsOf(EDIT_AFTER) };

function describeEvent(event: SceneEvent): string {
  return "nodeId" in event ? `${event.type} · ${event.nodeId}` : `${event.type} · ${event.edgeId}`;
}

/** The same value with every `null`- and `undefined`-valued key dropped,
 *  recursively — the one normalization under which a JSON fixture and a
 *  derived JS object can be compared at all, since JSON has no `undefined`
 *  and an absent key is how it spells one. */
function withoutAbsentKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAbsentKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, withoutAbsentKeys(entry)]),
  );
}

function EditSessionPanel() {
  // A seam per panel, never a module-level bus — `history.ts`'s own rule,
  // restated here so the counter below is this panel's own truth.
  const seam = useMemo(() => createSceneEventSeam(), []);
  const events = useMemo(() => deriveSceneEvents(EDIT_BEFORE, EDIT_AFTER, EDIT_PORTS), []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 24 }}>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ font: "12px ui-monospace, monospace" }}>before</figcaption>
          <DomCanvas scene={EDIT_BEFORE} width={660} height={420} />
        </figure>
        <figure style={{ margin: 0 }}>
          <figcaption style={{ font: "12px ui-monospace, monospace" }}>after</figcaption>
          <DomCanvas scene={EDIT_AFTER} width={660} height={420} />
        </figure>
      </div>
      {/* WHY the count is shown at all: the seam has NO consumer by
          default (Zach — the app "should kinda like emit UI edit events,
          that I guess normally have no consumer"), and a number on the
          board is how that stays visible rather than being a claim in a
          comment. */}
      <p data-slot="seam-size" style={{ font: "12px ui-monospace, monospace", margin: 0 }}>
        subscribers — size: {seam.size}
      </p>
      <ol data-slot="derived-events" style={{ font: "12px ui-monospace, monospace", margin: 0, paddingLeft: 24 }}>
        {events.map((event, index) => (
          <li key={`${event.type}-${index}`} data-slot="derived-event" data-event-type={event.type}>
            {describeEvent(event)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export const EditSessionEvents: Story = {
  name: "edit session → SceneEvents",
  render: () => <EditSessionPanel />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelectorAll('[data-slot="derived-event"]')).toHaveLength(13);
    });
    const size = required<HTMLElement>(canvasElement, '[data-slot="seam-size"]', "the seam's subscriber count");
    expect(size.textContent).toContain("size: 0");
    // Not one wire event names a control edge, because the scene never had
    // one to disconnect.
    const types = [...canvasElement.querySelectorAll('[data-slot="derived-event"]')].map((row) =>
      row.getAttribute("data-event-type"),
    );
    expect(types).toContain("node-added");
    expect(types).toContain("wire-rewired");
    expect(types.filter((type) => type === "node-moved")).toHaveLength(1);

    // The frozen list, in the frozen order, is what the rows say — the
    // contract checked against the artefact a reader is looking at, not
    // just against a number of rows.
    const frozen = editSessionFixture.events as unknown as SceneEvent[];
    expect(types).toEqual(frozen.map((event) => event.type));

    // WHY the deep comparison normalizes `null`/`undefined` away, and why
    // this is NOT the acceptance assertion: `sceneEvents.test.ts:42` pins
    // the frozen list with `toEqual` and stays RED on purpose. Its event[0]
    // asks for `from: null` where the `color` key is simply absent from the
    // before node, while `sceneEvents.test.ts:91` asks for `from: undefined`
    // on structurally identical input — two committed assertions that no
    // rule can satisfy at once, so this lane keeps the raw value
    // (`sceneEvents.ts`, the WHY at the `data-changed` seam) and reports the
    // red rather than branching on a node id. What this line proves is the
    // part that IS settled: all 13 events, in the contract's order, with
    // every field equal, differ from the frozen bytes in exactly one token.
    // Delete `"from": null,` at `events_edit_session.json:512` and the
    // acceptance file goes green with no implementation change.
    expect(withoutAbsentKeys(deriveSceneEvents(EDIT_BEFORE, EDIT_AFTER, EDIT_PORTS))).toEqual(withoutAbsentKeys(frozen));
  },
};
