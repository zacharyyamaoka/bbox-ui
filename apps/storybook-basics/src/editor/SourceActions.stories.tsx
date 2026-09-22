import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";

import { Block } from "../components/block";
import { BlockPort, type BlockEdgeSpec } from "../components/blockPort";
import { CodeCellFace } from "../components/codeCellFace";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../components/context-menu";
import type { BlockSide } from "../components/port.layout";
import type { PortEdgeItem } from "../components/portEdge";
import { WireLayer } from "../components/wireLayer";
import { PYBLOCKS_BACKEND_KIND, sourceActionsFor, type SourceBackendRef } from "./sourceActions";
import { collapseToCode, expandCode, isCodeCell } from "../scene/codeCell";
import { codeOriginState, ORIGIN_BADGE } from "../scene/codeOrigin";
import type { PortDirectionOf } from "../scene/lint";
import { descendantsOf } from "../scene/region";
import { childrenOf, wiredPorts, type BlockScene, type SceneData, type SceneNode } from "../scene/scene";
import { sceneWires, withWiredState, type WireStyleData } from "../scene/sceneWires";

/**
 * Editor/SourceActions — the pyblocks gate, rendered
 * (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §5.5, §7 Lane C).
 *
 * `editor/sourceActions.ts` is pure: given a backend and a selection it
 * returns `MenuAction`-shaped rows, or none. This bench is the half that
 * shows what "none" LOOKS like — right-click with the switch on `none` and
 * the two source rows are simply not in the menu, beside stock rows that
 * are. Absent, never disabled (`editor/edgeDropMenu.tsx`'s one-gate rule),
 * because a greyed-out row teaches a gesture and then refuses to say why it
 * will not run.
 *
 * The bench owns its own HOST ADAPTER — positioned divs, `BlockPort`/
 * `Block` for a plain node, `CodeCellFace` for a region carrying
 * `data.codeCell`, `WireLayer` fed by `sceneWires`. It is `CodeCell.
 * stories.tsx`'s adapter, copied rather than imported: nothing under
 * `src/hosts/` is touched, which is what keeps this lane and the
 * control-flow stream out of one file.
 *
 * EVERYTHING IS A BLOCK: converting does not mint a new node KIND — it
 * collapses a selection into a `region` wearing a code face, ports and all,
 * and expanding gives the same blocks back.
 * NEVER MIX DATA AND CONTROL: the two rows here run the region algebra and
 * nothing else. No line is minted, no arm is drawn; the cell's ports are
 * exactly the data cables that crossed the selection.
 */
const meta = {
  title: "Editor/SourceActions",
  tags: ["object:scene", "lane:scv-origin-and-actions"],
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

// Wide enough that the promoted port's label (`b/out`, drawn inward off the
// right wall) clears the generated header's first line — the collision is
// legible-but-ugly at 320.
const CELL_WIDTH = 430;
const BLOCK_WIDTH = 120;
const BLOCK_HEIGHT = 64;

/** A→B→C, one chain. Collapsing `A, B` leaves exactly one crossing cable
 *  (`b/out → c/in`) for `collapse.ts` to promote into the cell's one port —
 *  small enough to read at a glance, big enough that the promotion is real. */
function fixture(): BenchScene {
  return {
    nodes: [
      { id: "a", position: { x: 20, y: 40 }, data: { name: "A" } },
      { id: "b", position: { x: 220, y: 150 }, data: { name: "B" } },
      { id: "c", position: { x: 470, y: 250 }, data: { name: "C" } },
    ],
    edges: [
      { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
      { id: "e2", source: "b", sourceHandle: "out", target: "c", targetHandle: "in" },
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
 * left wall, outputs on the right. Copied from `CodeCell.stories.tsx`
 * together with the reason it skips the interior half of a split edge: a
 * collapse leaves BOTH halves of every crossing cable in the scene, so read
 * naively one promoted port lands on both walls at once.
 */
function portsFor<N extends SceneData, E extends SceneData>(
  scene: BlockScene<N, E>,
  nodeId: string,
  wired: ReadonlySet<string>,
): Partial<Record<BlockSide, BlockEdgeSpec>> {
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
  onSourceWrite,
}: {
  scene: BenchScene;
  node: SceneNode<BenchData>;
  wired: ReadonlySet<string>;
  onSourceWrite?(cellId: string, next: string): void;
}) {
  const ports = portsFor(scene, node.id, wired);
  // `isCodeCell` is the WHOLE dispatch: a cell is a region with one extra
  // fact on its data, so every other node keeps the face it always had.
  if (isCodeCell(node)) {
    // WHY the badge is COMPUTED here rather than read off the cell: the four
    // states are a judgement about (binding, what a host resolved right now)
    // — `scene/codeOrigin.ts` never stores one. This bench resolves nothing,
    // so a Rung-A cell (`origin: null`) reads `pseudo`: the board owns the
    // bytes.
    const state = codeOriginState(node.data.codeCell.origin, undefined);
    const members = childrenOf(scene, node.id).map((kid) => ({
      id: kid.id,
      content: <BenchNode scene={scene} node={kid} wired={wired} />,
    }));
    return (
      <CodeCellFace
        id={node.id}
        name={nameOf(node)}
        cell={node.data.codeCell}
        origin={{ state, spec: ORIGIN_BADGE[state] }}
        view="opaque"
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

function Positioned({
  x,
  y,
  selected,
  onSelect,
  children,
}: {
  x: number;
  y: number;
  selected: boolean;
  onSelect(): void;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="bench-node"
      data-selected={selected ? "" : undefined}
      onClick={onSelect}
      style={{
        position: "absolute",
        left: x,
        top: y,
        borderRadius: 10,
        outline: selected ? "2px solid var(--primary)" : undefined,
        outlineOffset: 4,
      }}
    >
      {children}
    </div>
  );
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

const SWITCH_DOCK: CSSProperties = {
  position: "absolute",
  right: 24,
  bottom: 18,
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  color: "var(--muted-foreground)",
};

/* ------------------------------------------------------------------ */
/* The bench                                                           */
/* ------------------------------------------------------------------ */

function SourceActionsBench() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mintId = useRef(counter("cell")).current;
  const [scene, setScene] = useState<BenchScene>(fixture);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [backendKind, setBackendKind] = useState<string>("none");
  const [report, setReport] = useState("nothing converted yet");

  const wired = wiredPorts(scene);
  const wires = useMemo(() => sceneWires(scene), [scene]);
  const nodeById = (id: string) => scene.nodes.find((node) => node.id === id);

  // WHY a `SourceBackendRef` literal and not the string itself: the kit reads
  // ONE field off whatever object the pyblocks-backend stream hands a host
  // (plan §5.5), so the bench models that object rather than the switch's
  // value — a richer backend has to pass here structurally too.
  const backend: SourceBackendRef = { kind: backendKind };

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

  const convertToCode = (nodeIds: readonly string[]) => {
    const result = collapseToCode(scene, nodeIds, { mintId, directionOf, regionData: { name: "Code cell" } });
    if (!result.ok) {
      setReport(`refused: ${result.refusal.message}`);
      return;
    }
    setScene(result.scene);
    // WHY the new cell becomes the selection: it is the thing the gesture
    // just made, and the NEXT row the menu should offer is its expand. A
    // selection left pointing at nodes that are now children of the cell
    // would offer `convert-to-code` on blocks that are already inside one.
    setSelected([result.regionId]);
    setReport(`converted ${nodeIds.length} blocks into ${result.regionId} · ${result.ports.length} promoted port(s)`);
  };

  const expandToBlocks = (cellId: string) => {
    const result = expandCode(scene, cellId);
    // WHY `confirm` only on `textWasEdited`: `expandCode` hands back what it
    // discarded AND whether it was ever more than the generated header
    // (`scene/codeCell.ts`). Prompting on every expand would train the user
    // to dismiss a dialog that almost never has anything to say.
    if (result.textWasEdited && !window.confirm("This cell's text was edited. Expanding discards it. Continue?")) return;
    setScene(result.scene);
    setSelected([]);
    setReport(
      result.textWasEdited
        ? `expanded ${cellId} · edited text discarded (${JSON.stringify(result.discardedText)})`
        : `expanded ${cellId} · the text was still the generated header, nothing lost`,
    );
  };

  const writeSource = (cellId: string, next: string) =>
    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === cellId && isCodeCell(node) ? { ...node, data: { ...node.data, codeCell: { ...node.data.codeCell, source: next } } } : node,
      ),
    }));

  const actions = sourceActionsFor(
    backend,
    { nodeIds: selected, isCodeCell: (id) => { const node = nodeById(id); return node !== undefined && isCodeCell(node); } },
    { convertToCode, expandToBlocks },
  );

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10, padding: "24px 32px 56px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" style={BUTTON} onClick={() => setSelected(["a", "b"])}>
          Select A, B
        </button>
        <button type="button" style={BUTTON} onClick={() => setSelected([])}>
          Clear selection
        </button>
        <span style={CAPTION} data-testid="selection-readout">
          selected: {selected.length > 0 ? selected.join(", ") : "(nothing)"}
        </span>
        <span style={CAPTION} aria-hidden>
          ·
        </span>
        <span style={CAPTION} data-testid="source-actions-report">
          {report}
        </span>
      </div>

      <ContextMenu>
        <ContextMenuTrigger>
          <div
            data-slot="wire-bench"
            data-bench="source-actions"
            // The whole record, published so a play function can assert the
            // convert→expand round trip is the IDENTITY rather than merely
            // "looks the same".
            data-scene={JSON.stringify(scene)}
            ref={containerRef}
            style={{ position: "relative", width: 760, height: 420 }}
          >
            {scene.nodes
              .filter((node) => node.parentId === undefined)
              .map((node) => (
                <Positioned
                  key={node.id}
                  x={node.position.x}
                  y={node.position.y}
                  selected={selected.includes(node.id)}
                  onSelect={() => toggle(node.id)}
                >
                  <BenchNode scene={scene} node={node} wired={wired} onSourceWrite={writeSource} />
                </Positioned>
              ))}
            <WireLayer wires={wires} containerRef={containerRef} layoutKey={scene.nodes.map((node) => node.id).join("|")} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="bench-context-menu">
          {/* The stock rows a board already has. They are here so "the source
              group is absent" is a claim about a menu that EXISTS — a menu
              that never opened would satisfy the same query vacuously. */}
          <ContextMenuGroup>
            <ContextMenuItem data-testid="stock-action-rename">Rename</ContextMenuItem>
            <ContextMenuItem data-testid="stock-action-delete" variant="destructive">
              Delete
            </ContextMenuItem>
          </ContextMenuGroup>
          {actions.length > 0 ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuGroup data-slot="source-actions">
                {actions.map((action) => (
                  <ContextMenuItem key={action.id} data-testid={`source-action-${action.id}`} onClick={action.run}>
                    {action.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuGroup>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>

      {/* WHY a drop-down in the corner of the app and not a URL flag
          (feedback 2026-09-09, "prototype switch in app"): a reviewer must
          be able to see both sides of a gate without typing a query string
          and reloading, and a flag he has to be told about is a gate nobody
          checks. Temporary, and it lives where a prototype switch lives —
          bottom right. */}
      <div style={SWITCH_DOCK}>
        <label htmlFor="backend-switch">source backend</label>
        <select
          id="backend-switch"
          data-slot="backend-switch"
          value={backendKind}
          onChange={(event) => setBackendKind(event.target.value)}
          style={{ ...BUTTON, padding: "3px 6px" }}
        >
          <option value="none">none</option>
          <option value={PYBLOCKS_BACKEND_KIND}>pyblocks</option>
        </select>
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

function benchOf(canvasElement: HTMLElement): HTMLElement {
  return required<HTMLElement>(canvasElement, '[data-slot="wire-bench"][data-bench="source-actions"]', "the source-actions bench");
}

/** Base UI portals the popup to `document.body` and mounts it only while
 *  open, so every menu assertion queries the document, not the canvas. */
async function openMenuOn(target: Element): Promise<HTMLElement> {
  fireEvent.contextMenu(target);
  return await waitFor(() => required<HTMLElement>(document.body, '[data-slot="context-menu-content"]', "the open context menu"));
}

async function closeMenu(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(document.body.querySelector('[data-slot="context-menu-content"]')).toBeNull());
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/**
 * Backend OFF — right-click and the menu is the board's own two rows. The
 * source group is not rendered disabled; it is not rendered.
 */
export const BackendOff: Story = {
  render: () => <SourceActionsBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await canvas.findByRole("button", { name: "Select A, B" });
    const bench = benchOf(canvasElement);

    // Selection qualifies for `convert-to-code` — the ONLY thing withholding
    // the row is the gate, which is what makes the negative below mean
    // something.
    await userEvent.click(canvas.getByRole("button", { name: "Select A, B" }));
    await waitFor(() => expect(canvas.getByTestId("selection-readout")).toHaveTextContent("selected: a, b"));

    await openMenuOn(bench);

    // The menu is really there and really populated…
    await expect(body.getByTestId("stock-action-rename")).toBeInTheDocument();
    await expect(body.getByTestId("stock-action-delete")).toBeInTheDocument();
    // …and the source group is absent from it. Not disabled — absent.
    await expect(document.body.querySelector('[data-slot="source-actions"]')).toBeNull();
    await expect(document.body.querySelector('[data-testid="source-action-convert-to-code"]')).toBeNull();
    await expect(document.body.querySelector('[data-testid="source-action-expand-to-blocks"]')).toBeNull();

    await closeMenu();
  },
};

/**
 * Backend ON — the same two right-clicks, one before and one after the
 * conversion. Which row appears is a function of the selection, and the row
 * that does not apply is never there to be clicked.
 */
export const BackendOn: Story = {
  render: () => <SourceActionsBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await canvas.findByRole("button", { name: "Select A, B" });
    const bench = benchOf(canvasElement);

    await userEvent.selectOptions(canvas.getByLabelText("source backend"), PYBLOCKS_BACKEND_KIND);
    await userEvent.click(canvas.getByRole("button", { name: "Select A, B" }));
    await waitFor(() => expect(canvas.getByTestId("selection-readout")).toHaveTextContent("selected: a, b"));

    await openMenuOn(bench);
    await expect(body.getByTestId("stock-action-rename")).toBeInTheDocument();
    await expect(document.body.querySelector('[data-slot="source-actions"]')).not.toBeNull();
    const convert = body.getByTestId("source-action-convert-to-code");
    await expect(convert).toHaveTextContent("Convert to code");
    // Two blocks selected, neither of them a cell → no expand on offer.
    await expect(document.body.querySelector('[data-testid="source-action-expand-to-blocks"]')).toBeNull();

    await userEvent.click(convert);
    const face = await waitFor(() => required<HTMLElement>(bench, '[data-slot="code-cell-face"]', "the new cell's face"));
    await waitFor(() => expect(document.body.querySelector('[data-slot="context-menu-content"]')).toBeNull());
    // A cell is a region wearing a code face — its origin is null, so the
    // badge the face paints is the `pseudo` one: the board owns the bytes.
    await expect(required<HTMLElement>(face, '[data-slot="origin-badge"]', "the cell's origin badge").getAttribute("data-state")).toBe("pseudo");
    await expect(bench.querySelector('[data-block-id="a"]')).toBeNull();

    // Right-click the cell itself. The selection is the new cell, so the
    // menu swaps one row for the other.
    await openMenuOn(face);
    await expect(body.getByTestId("source-action-expand-to-blocks")).toHaveTextContent("Expand to blocks");
    await expect(document.body.querySelector('[data-testid="source-action-convert-to-code"]')).toBeNull();

    await closeMenu();
  },
};

/**
 * The round trip through the menu: convert, then expand, and the scene is
 * the one we started with — array index included, not merely "looks the
 * same" (docs/peps/0003).
 */
export const ConvertThenExpand: Story = {
  render: () => <SourceActionsBench />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await canvas.findByRole("button", { name: "Select A, B" });
    const bench = benchOf(canvasElement);
    const before = bench.getAttribute("data-scene");
    await expect(before).toBeTruthy();

    // The text is never touched here, so `expandCode` reports
    // `textWasEdited: false` and the host must NOT prompt. Stubbed so the
    // claim is measured rather than assumed — and so a regression that
    // prompts unconditionally fails instead of hanging the tab.
    const confirmed = fn(() => true);
    const realConfirm = window.confirm;
    window.confirm = confirmed as unknown as typeof window.confirm;

    try {
      await userEvent.selectOptions(canvas.getByLabelText("source backend"), PYBLOCKS_BACKEND_KIND);
      await userEvent.click(canvas.getByRole("button", { name: "Select A, B" }));

      await openMenuOn(bench);
      await userEvent.click(body.getByTestId("source-action-convert-to-code"));
      const face = await waitFor(() => required<HTMLElement>(bench, '[data-slot="code-cell-face"]', "the new cell's face"));
      await expect(bench.getAttribute("data-scene")).not.toBe(before);

      await openMenuOn(face);
      await userEvent.click(body.getByTestId("source-action-expand-to-blocks"));

      await waitFor(() => expect(bench.getAttribute("data-scene")).toBe(before));
      await expect(bench.querySelector('[data-slot="code-cell-face"]')).toBeNull();
      for (const id of ["a", "b", "c"]) await expect(bench.querySelector(`[data-block-id="${id}"]`)).not.toBeNull();
      await expect(confirmed).not.toHaveBeenCalled();
      await expect(canvas.getByTestId("source-actions-report")).toHaveTextContent("the text was still the generated header");
    } finally {
      window.confirm = realConfirm;
    }
  },
};
