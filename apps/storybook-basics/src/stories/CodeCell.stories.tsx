import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort, type BlockEdgeSpec } from "../components/blockPort";
import { CodeCellFace, type CodeCellFaceView } from "../components/codeCellFace";
import type { PortEdgeItem } from "../components/portEdge";
import type { BlockSide } from "../components/port.layout";
import { WireLayer } from "../components/wireLayer";
import type { Wire } from "../components/wiring";
import { codeCellHeader, collapseToCode, expandCode, isCodeCell } from "../scene/codeCell";
import { CODE_ORIGIN_STATES, ORIGIN_BADGE } from "../scene/codeOrigin";
import { definitionsToScene, REFERENCE_EDGE_TYPE, type DefinitionNodeData, type DefinitionsView, type ReferenceEdgeData } from "../scene/definitionsToScene";
import type { PortDirectionOf } from "../scene/lint";
import { descendantsOf } from "../scene/region";
import { childrenOf, wiredPorts, type BlockScene, type SceneData, type SceneNode } from "../scene/scene";
import { sceneWires, withWiredState, type WireStyleData } from "../scene/sceneWires";
import STEREO_DEFINITIONS from "../../../../docs/acceptance/pyblocks/stereo_definitions.expected.json";

/**
 * Blocks/Scene/Code Cell — Rung A of the source-code view
 * (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §4/§5): collapse a selection into
 * ONE region wearing a code face, expand it back exactly, and the pure
 * adapter that turns pyblocks' definitions view into a scene of grain-1
 * cells.
 *
 * This file owns its own HOST ADAPTER — positioned divs, `BlockPort`/`Block`
 * for a plain node, `CodeCellFace` for a region carrying `data.codeCell`,
 * and `WireLayer` fed by `sceneWires` — the same division of labour
 * `Scene.stories.tsx` and `EdgeDropMenu.stories.tsx` already established.
 * Nothing under `src/hosts/` is touched: the control-flow stream is adding
 * region rendering there in parallel, and a story-local adapter is what
 * keeps the two lanes from meeting in one file.
 *
 * The scene fixture is `collapse.test.ts`'s (and `codeCell.test.ts`'s) own —
 * the scene those tests already proved round-trips — with only the two
 * exterior nodes moved up the bench so the whole thing fits one screen.
 * Positions are `data` to the algebra; the topology is untouched.
 */

const meta = {
  title: "Blocks/Scene/Code Cell",
  tags: ["area:blocks", "lane:scv-rung-a-scene"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/* The bench's own vocabulary                                          */
/* ------------------------------------------------------------------ */

/** What this bench stores per node. The scene does not know `name` exists —
 *  it is `data` to it, and `codeCell` is put there by `collapseToCode`. */
type BenchData = SceneData & { name?: string };

type BenchScene = BlockScene<BenchData, WireStyleData>;

const SELECTION = ["a", "b", "c"];

const CELL_WIDTH = 340;
const BLOCK_WIDTH = 120;
const BLOCK_HEIGHT = 64;

function fixture(): BenchScene {
  return {
    nodes: [
      { id: "src", position: { x: 0, y: 110 }, data: { name: "Source" } },
      { id: "a", position: { x: 200, y: 40 }, data: { name: "A" } },
      { id: "b", position: { x: 380, y: 120 }, data: { name: "B" } },
      { id: "c", position: { x: 340, y: 240 }, data: { name: "C" } },
      { id: "sink", position: { x: 620, y: 120 }, data: { name: "Sink" } },
      { id: "other", position: { x: 0, y: 360 }, data: { name: "Other" } },
      { id: "other2", position: { x: 200, y: 360 }, data: { name: "Other2" } },
    ],
    edges: [
      { id: "e1", source: "src", sourceHandle: "out", target: "a", targetHandle: "in" },
      { id: "e2", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e3", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
      { id: "e4", source: "b", sourceHandle: "out", target: "sink", targetHandle: "in" },
      { id: "e5", source: "other", sourceHandle: "out", target: "other2", targetHandle: "in" },
    ],
  };
}

/** `lint.ts`'s own `source`/`sink` vocabulary, so the collapse promotes
 *  ports with a real polarity rather than guessing. */
const directionOf: PortDirectionOf = ({ portId }) => (portId === "out" ? "source" : portId === "in" ? "sink" : undefined);

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

function nameOf(node: SceneNode<SceneData>): string {
  return typeof node.data.name === "string" ? node.data.name : node.id;
}

function portItems(ids: readonly string[]): PortEdgeItem[] {
  return ids.map((id) => ({ id, label: id }));
}

/**
 * A node's ports, DERIVED from the edges that name them — inputs on the
 * left wall, outputs on the right.
 *
 * WHY derived and not authored per node: after a collapse the cell's ports
 * are whatever `promoteBoundary` minted (`a/in`, `b/out`, …), and the bench
 * has no way to know them ahead of time. Reading them back off the scene is
 * the only thing that works for BOTH the loose selection and the cell it
 * becomes, which is precisely the claim this story is here to show.
 */
function portsFor<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  wired: ReadonlySet<string>,
): Partial<Record<BlockSide, BlockEdgeSpec>> {
  // WHY the INTERIOR half of a split edge is skipped: a collapse leaves
  // BOTH halves of every crossing cable in the scene (collapse.ts's header)
  // — the outer one re-pointed at the container's port, and a stub from
  // that same port to the member behind it. Read naively, one promoted port
  // is therefore both an input and an output of the cell and lands on both
  // walls at once (measured: `a/in` and `b/out` each drew twice). The stub
  // is the port's inside, not a second port, so only the half whose other
  // end is OUTSIDE this node decides which wall it sits on.
  const interior = descendantsOf(scene, [nodeId]);
  const outside = (otherId: string) => otherId !== nodeId && !interior.has(otherId);
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const edge of scene.edges) {
    if (edge.target === nodeId && edge.targetHandle && outside(edge.source) && !inputs.includes(edge.targetHandle)) inputs.push(edge.targetHandle);
    if (edge.source === nodeId && edge.sourceHandle && outside(edge.target) && !outputs.includes(edge.sourceHandle)) outputs.push(edge.sourceHandle);
  }
  const edges: Partial<Record<BlockSide, BlockEdgeSpec>> = {};
  if (inputs.length > 0) edges.left = { items: withWiredState(portItems(inputs), nodeId, wired) };
  if (outputs.length > 0) edges.right = { items: withWiredState(portItems(outputs), nodeId, wired) };
  return edges;
}

/* ------------------------------------------------------------------ */
/* The host adapter — one scene node, one rendered face                */
/* ------------------------------------------------------------------ */

function BenchNode({
  scene,
  node,
  wired,
  view,
  onSourceWrite,
}: {
  scene: BenchScene;
  node: SceneNode<BenchData>;
  wired: ReadonlySet<string>;
  view: CodeCellFaceView;
  onSourceWrite?(cellId: string, next: string): void;
}) {
  const ports = portsFor(scene, node.id, wired);
  // `isCodeCell` is the WHOLE dispatch: a cell is a region with one extra
  // fact on its data, so every other node — region or not — keeps the face
  // it always had. No second node kind, no registry.
  if (isCodeCell(node)) {
    const members = childrenOf(scene, node.id).map((kid) => ({
      id: kid.id,
      content: <BenchNode scene={scene} node={kid} wired={wired} view="opaque" />,
    }));
    return (
      <CodeCellFace
        id={node.id}
        name={nameOf(node)}
        cell={node.data.codeCell}
        view={view}
        members={members}
        ports={ports}
        width={CELL_WIDTH}
        onSourceWrite={onSourceWrite ? (next) => onSourceWrite(node.id, next) : undefined}
      />
    );
  }
  return (
    <BlockPort id={node.id} view="port" edges={ports}>
      <Block header={nameOf(node)} width={BLOCK_WIDTH} height={BLOCK_HEIGHT} />
    </BlockPort>
  );
}

function Positioned({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

const CAPTION: CSSProperties = { fontSize: 12, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" };

const BUTTON: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  background: "var(--card)",
  color: "var(--card-foreground)",
  cursor: "pointer",
};

/* ------------------------------------------------------------------ */
/* RoundTrip                                                           */
/* ------------------------------------------------------------------ */

function RoundTripBench() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<BenchScene>(fixture);
  const [report, setReport] = useState<string>("nothing expanded yet");
  const wired = wiredPorts(scene);
  const wires = useMemo(() => sceneWires(scene), [scene]);
  const cell = scene.nodes.find((node) => isCodeCell(node));

  const collapse = () =>
    setScene((current) => {
      const result = collapseToCode(current, SELECTION, { mintId: counter("cell"), directionOf, regionData: { name: "Code cell" } });
      return result.ok ? result.scene : current;
    });

  // WHY `Expand` stays rendered with no cell on the board: `expandCode` is
  // total — an id it does not know returns the SAME scene object — so the
  // button has nothing to guard against, and a control that vanishes and
  // reappears is harder to aim at than one that is simply a no-op. The
  // "absent, never disabled" rule this repo applies to MENU actions
  // (editor/edgeDropMenu.tsx) is about offering an action that cannot work;
  // this one always works.
  const expand = () =>
    setScene((current) => {
      const target = current.nodes.find((node) => isCodeCell(node));
      if (!target) return current;
      const result = expandCode(current, target.id);
      setReport(
        result.textWasEdited
          ? `expanded · the text had been edited — ${JSON.stringify(result.discardedText)} was discarded`
          : "expanded · the text was still the generated header, nothing lost",
      );
      return result.scene;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px 32px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" style={BUTTON} onClick={collapse}>
          Collapse to code
        </button>
        <button type="button" style={BUTTON} onClick={expand}>
          Expand
        </button>
        <span style={CAPTION}>{report}</span>
      </div>
      <div
        data-slot="wire-bench"
        data-bench="code-cell-round-trip"
        // The whole record, published so a play function can assert the
        // round trip is the IDENTITY rather than merely "looks the same".
        data-scene={JSON.stringify(scene)}
        ref={containerRef}
        style={{ position: "relative", width: 800, height: 440 }}
      >
        {scene.nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => (
            <Positioned key={node.id} x={node.position.x} y={node.position.y}>
              <BenchNode scene={scene} node={node} wired={wired} view="opaque" onSourceWrite={undefined} />
            </Positioned>
          ))}
        <WireLayer wires={wires} containerRef={containerRef} layoutKey={cell?.id ?? ""} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared play-function helpers                                        */
/* ------------------------------------------------------------------ */

function required<T extends Element>(root: ParentNode, selector: string, what: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${what} (\`${selector}\`)`);
  return found;
}

function benchOf(canvasElement: HTMLElement, bench: string): HTMLElement {
  return required<HTMLElement>(canvasElement, `[data-slot="wire-bench"][data-bench="${bench}"]`, `the \`${bench}\` bench`);
}

async function waitForSelector<T extends Element>(root: ParentNode, selector: string, what: string): Promise<T> {
  return await waitFor(() => required<T>(root, selector, what));
}

export const RoundTrip: Story = {
  render: () => <RoundTripBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const collapse = await canvas.findByRole("button", { name: "Collapse to code" });
    const bench = benchOf(canvasElement, "code-cell-round-trip");
    const before = bench.getAttribute("data-scene");
    await expect(before).toBeTruthy();
    await expect(bench.querySelector('[data-slot="code-cell-face"]')).toBeNull();

    await userEvent.click(collapse);
    const face = await waitForSelector<HTMLElement>(bench, '[data-slot="code-cell-face"]', "the collapsed cell's face");
    await expect(face.getAttribute("data-view")).toBe("opaque");
    // The collapsed members left the top level — they are UNDER the cell
    // now, which is the whole reason expand can replay them.
    for (const id of SELECTION) await expect(bench.querySelector(`[data-block-id="${id}"]`)).toBeNull();
    // …and the two blocks outside the selection did not move.
    await expect(bench.querySelector('[data-block-id="src"]')).not.toBeNull();
    await expect(bench.querySelector('[data-block-id="sink"]')).not.toBeNull();

    await userEvent.click(await canvas.findByRole("button", { name: "Expand" }));
    await waitFor(() => expect(bench.getAttribute("data-scene")).toBe(before));
    await expect(bench.querySelector('[data-slot="code-cell-face"]')).toBeNull();
    for (const id of SELECTION) await expect(bench.querySelector(`[data-block-id="${id}"]`)).not.toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* OpaqueAndExpanded                                                   */
/* ------------------------------------------------------------------ */

function collapsedFixture(): BenchScene {
  // `regionData` rides BESIDE the face, untouched — the cell is named the
  // way any other node is, and `collapseToCode` only adds `codeCell` to it.
  const result = collapseToCode(fixture(), SELECTION, { mintId: counter("cell"), directionOf, regionData: { name: "Code cell" } });
  if (!result.ok) throw new Error(`collapseToCode refused: ${result.refusal.message}`);
  return result.scene;
}

function OpaqueAndExpandedBench() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Built in a state initialiser, never at module scope: a throwing body
  // at collection time takes the whole FILE down, and this story file also
  // carries the ones that would have told you why.
  const [scene, setScene] = useState<BenchScene>(collapsedFixture);
  const [view, setView] = useState<CodeCellFaceView>("opaque");
  const wired = wiredPorts(scene);
  const wires = useMemo(() => sceneWires(scene), [scene]);

  const writeSource = (cellId: string, next: string) =>
    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === cellId && isCodeCell(node) ? { ...node, data: { ...node.data, codeCell: { ...node.data.codeCell, source: next } } } : node,
      ),
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px 32px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" style={BUTTON} onClick={() => setView((current) => (current === "opaque" ? "expanded" : "opaque"))}>
          {view === "opaque" ? "Show blocks" : "Show code"}
        </button>
        <span style={CAPTION}>one node, two faces — the text is annotation, the blocks are the truth</span>
      </div>
      <div
        data-slot="wire-bench"
        data-bench="code-cell-faces"
        ref={containerRef}
        style={{ position: "relative", width: 800, height: 440 }}
      >
        {scene.nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => (
            <Positioned key={node.id} x={node.position.x} y={node.position.y}>
              <BenchNode scene={scene} node={node} wired={wired} view={view} onSourceWrite={writeSource} />
            </Positioned>
          ))}
        <WireLayer wires={wires} containerRef={containerRef} layoutKey={view} />
      </div>
    </div>
  );
}

export const OpaqueAndExpanded: Story = {
  render: () => <OpaqueAndExpandedBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: "Show blocks" });
    const bench = benchOf(canvasElement, "code-cell-faces");
    const view = () => required<HTMLElement>(bench, '[data-slot="code-cell-face"]', "the cell's face").getAttribute("data-view");

    await expect(view()).toBe("opaque");
    await expect(bench.querySelector('[data-block-id="a"]')).toBeNull();

    await userEvent.click(toggle);
    await waitFor(() => expect(view()).toBe("expanded"));
    for (const id of SELECTION) await waitForSelector(bench, `[data-block-id="${id}"]`, `member \`${id}\``);

    // Back again — the same node, not a rebuilt one.
    await userEvent.click(await canvas.findByRole("button", { name: "Show code" }));
    await waitFor(() => expect(view()).toBe("opaque"));
    await expect(bench.querySelector('[data-block-id="a"]')).toBeNull();
  },
};

/* ------------------------------------------------------------------ */
/* OriginBadgeStates                                                   */
/* ------------------------------------------------------------------ */

const PSEUDO_SOURCE = codeCellHeader(["A", "B", "C"]);
const ORIGIN_SAMPLE = "def run(self, left, right):\n    return estimate_pair(left, right)\n";

function OriginBadgeStatesBench() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 32px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Who owns the bytes</h3>
      <span style={CAPTION}>
        all four states of `scene/codeOrigin.ts`, computed by `codeOriginState` and painted by `OriginBadge` — never stored on the cell
      </span>
      <div data-slot="origin-gallery" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {CODE_ORIGIN_STATES.map((state) => (
          <CodeCellFace
            key={state}
            id={`origin-${state}`}
            name={state === "pseudo" ? "pseudo cell" : "stereo.py · Pipeline.run"}
            cell={{ language: state === "pseudo" ? "plaintext" : "python", source: state === "pseudo" ? PSEUDO_SOURCE : ORIGIN_SAMPLE }}
            origin={{ state, spec: ORIGIN_BADGE[state] }}
            view="opaque"
            width={260}
          />
        ))}
      </div>
    </div>
  );
}

export const OriginBadgeStates: Story = {
  render: () => <OriginBadgeStatesBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Who owns the bytes" });
    const badges = await waitFor(() => {
      const found = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-slot="origin-badge"]'));
      if (found.length !== CODE_ORIGIN_STATES.length) throw new Error(`expected ${CODE_ORIGIN_STATES.length} origin badges, saw ${found.length}`);
      return found;
    });
    const states = badges.map((badge) => badge.getAttribute("data-state"));
    await expect(states).toEqual([...CODE_ORIGIN_STATES]);
    await expect(new Set(states).size).toBe(CODE_ORIGIN_STATES.length);
    await expect(badges.map((badge) => badge.textContent)).toEqual(CODE_ORIGIN_STATES.map((state) => ORIGIN_BADGE[state].label));
  },
};

/* ------------------------------------------------------------------ */
/* DefinitionsFromStereo                                               */
/* ------------------------------------------------------------------ */

/** The frozen cross-repo fixture, read STATICALLY — the same bytes
 *  `definitionsToScene.test.ts` reads off disk and pyblocks' own
 *  `test_definition_graph.py` asserts its output equals. The cast is the
 *  one TypeScript cannot avoid: `resolveJsonModule` widens every literal
 *  (`1` → `number`, `"call"` → `string`), so the JSON's inferred type is
 *  strictly wider than the contract it satisfies. */
const STEREO = STEREO_DEFINITIONS as unknown as DefinitionsView;

/** Where each definition sits on the bench. Authored by ANCHOR rather than
 *  computed, so the reference wires read left-to-right — a caller's `place`
 *  is exactly the seam the adapter leaves open for this (layout is
 *  host-owned; the adapter's own default is an honest placeholder column). */
const PLACEMENT: Record<string, { x: number; y: number }> = {
  Pipeline: { x: 16, y: 16 },
  "Pipeline.__init__": { x: 0, y: 0 },
  "Pipeline.run": { x: 0, y: 0 },
  estimate_pair: { x: 440, y: 40 },
  EstimatePairOut: { x: 820, y: 16 },
  rectify: { x: 820, y: 280 },
};

const REFERENCE_OUT_PORT = "refs";
const REFERENCE_IN_PORT = "referenced-by";

const DEFINITION_WIDTH = 300;
/** A member sits inside its parent's gutter on both sides
 *  (`BLOCK_MEMBER_INSET_PX`), so an expanded cell has to be wider than the
 *  cells it holds or its own members overflow it. */
const DEFINITION_EXPANDED_WIDTH = DEFINITION_WIDTH + 48;

// The two reference dots carry NO label on purpose: a definition cell's
// walls are already crowded by its source, and a dependency has no port
// name to be truthful about — the port exists so the dashed lane has
// somewhere to land, and the caption says so once instead of twice per
// block.
function definitionPorts(): Partial<Record<BlockSide, BlockEdgeSpec>> {
  return {
    left: { items: [{ id: REFERENCE_IN_PORT, label: "" }] },
    right: { items: [{ id: REFERENCE_OUT_PORT, label: "" }] },
  };
}

function DefinitionNode({
  scene,
  node,
  expandedId,
}: {
  scene: BlockScene<DefinitionNodeData, ReferenceEdgeData>;
  node: SceneNode<DefinitionNodeData>;
  expandedId: string | undefined;
}) {
  const expanded = node.id === expandedId;
  const members = childrenOf(scene, node.id).map((kid) => ({
    id: kid.id,
    content: <DefinitionNode scene={scene} node={kid} expandedId={expandedId} />,
  }));
  return (
    <CodeCellFace
      id={node.id}
      name={node.data.definition.signature}
      cell={node.data.codeCell}
      view={expanded ? "expanded" : "opaque"}
      members={members}
      ports={definitionPorts()}
      width={expanded ? DEFINITION_EXPANDED_WIDTH : DEFINITION_WIDTH}
    />
  );
}

function DefinitionsBench() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const result = useMemo(
    () =>
      definitionsToScene(STEREO, {
        rootAnchor: "<module>",
        mintId: counter("def"),
        uri: "stereo.py",
        place: (definition) => PLACEMENT[definition.anchor] ?? { x: 24, y: 24 },
      }),
    [],
  );

  if (!result.ok) return <div style={CAPTION}>refused: {result.refusal.message}</div>;
  const { scene, nodeIdByAnchor } = result;
  const pipelineId = nodeIdByAnchor["Pipeline"];

  // WHY the reference edges are re-anchored onto their OWN pair of ports
  // and painted in the dashed (`delayed`) variant: a reference is a
  // DEPENDENCY — plan §6's third lane — so it must be impossible to mistake
  // for a data cable at a glance OR by DOM resolution. The adapter emits it
  // as a node-level edge with no handles precisely so a host decides; this
  // host decides "its own dots, its own dash". The variant is chosen for
  // the look (`traceStrokeStyle`'s only dashed rows are `async` and
  // `delayed`), not for its `z⁻¹` meaning — the paint vocabulary has no
  // dependency variant, and inventing one is the wire kit's call, not a
  // story's.
  const wires: Wire[] = scene.edges
    .filter((edge) => edge.type === REFERENCE_EDGE_TYPE)
    .map((edge) => ({
      id: edge.id,
      from: { blockId: edge.source, portId: REFERENCE_OUT_PORT },
      to: { blockId: edge.target, portId: REFERENCE_IN_PORT },
      variant: "delayed" as const,
      color: "var(--muted-foreground)",
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px 32px" }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>stereo.py — definitions</h3>
      <span style={CAPTION}>
        {scene.nodes.length} definition cells · {wires.length} dashed reference edges · no badge: the four origin states are computed by
        `codeOriginState`, which lands with lane C
      </span>
      <div
        data-slot="wire-bench"
        data-bench="definitions-from-stereo"
        ref={containerRef}
        style={{ position: "relative", width: 1180, height: 620 }}
      >
        {scene.nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => (
            <Positioned key={node.id} x={node.position.x} y={node.position.y}>
              <DefinitionNode scene={scene} node={node} expandedId={pipelineId} />
            </Positioned>
          ))}
        <WireLayer wires={wires} containerRef={containerRef} />
      </div>
    </div>
  );
}

export const DefinitionsFromStereo: Story = {
  render: () => <DefinitionsBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "stereo.py — definitions" });
    const bench = benchOf(canvasElement, "definitions-from-stereo");

    // Six cells: four at the top level, and `Pipeline`'s two methods as its
    // members — the nesting the adapter wrote as `parentId`.
    await waitFor(() => expect(bench.querySelectorAll('[data-slot="code-cell-face"]')).toHaveLength(6));
    await waitFor(() => expect(bench.querySelectorAll('[data-slot="code-cell-face"][data-view="expanded"]')).toHaveLength(1));

    // Four reference wires, and every one of them RESOLVED — an unresolved
    // wire renders no group at all, so counting the groups is the check.
    await waitFor(() => expect(bench.querySelectorAll('[data-slot="wire-layer"] [data-wire-id]')).toHaveLength(4));
    const layer = required<SVGSVGElement>(bench, '[data-slot="wire-layer"]', "the wire layer");
    await expect(layer.getAttribute("data-unresolved-wires")).toBe("");
  },
};
