import { useMemo, useRef, useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { compareScenes, compareTally } from "./sceneCompare";
import {
  DIFF_MARK_BORDER,
  DIFF_MARK_INSET,
  SceneDiffMarks,
  SCENE_NODE_ATTRIBUTE,
  diffMarksForSide,
} from "./sceneDiffMarks";
import { CompareDialog } from "../components/compareDialog";
import type { CompareChange } from "../components/compareModel";
import { DomCanvas } from "../hosts/domCanvas";
import type { HostScene } from "../hosts/hostScene";
import type { ScenePortsOf } from "../scene/sceneDiff";

/**
 * Editor/SceneCompare — the compare SURFACE driven by the scene kit's own
 * diff engine.
 *
 * `components/CompareDialog.stories.tsx` already drives this modal from
 * `compareModel.ts`'s record-map differ. These stories drive the SAME modal
 * from `scene/sceneDiff.ts`'s `diffScene` through `./sceneCompare.ts`, which
 * is the path a host with a `BlockScene` takes — every host in this repo, and
 * the bbox studio app (`apps/systemsketch/src/chrome/CompareView/`), which
 * mounts exactly this composition over its own document projection.
 *
 * WHY the panes are real `DomCanvas` benches and not placeholders: the
 * dialog's `renderBefore`/`renderAfter` slots exist so the engine stays out of
 * the kit, and a story that filled them with grey boxes would prove only that
 * two grey boxes fit. The whole claim being tested here is that a person SEES
 * which block changed, which means the marks have to land on real rendered
 * blocks — measured, below, against `DIFF_MARK_INSET` rather than a literal.
 */
const meta = {
  title: "Editor/SceneCompare",
  tags: ["area:editor", "lane:compare-view"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/* The fixture — one board, two states                                  */
/* ------------------------------------------------------------------ */

/**
 * Before: three blocks, two wires.
 *
 * After, and every difference is deliberate so each assertion below has
 * exactly one cause:
 *   `reader`  — renamed to `ingest`            → modified (a field)
 *   `filter`  — gains a `cfg` port on the left → a PORT row, not a node row
 *   `sink`    — deleted                        → removed
 *   `store`   — new                            → added
 *   `w-2`     — re-pointed from sink to store  → modified (an edge field)
 */
const BEFORE: HostScene = {
  nodes: [
    { id: "reader", type: "block", position: { x: 24, y: 24 }, data: { name: "reader", view: "port", w: 120, h: 64, ports: { right: ["out"] } } },
    { id: "filter", type: "block", position: { x: 220, y: 24 }, data: { name: "filter", view: "port", w: 120, h: 64, ports: { left: ["in"], right: ["out"] } } },
    { id: "sink", type: "block", position: { x: 420, y: 24 }, data: { name: "sink", view: "port", w: 120, h: 64, ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "w-1", source: "reader", sourceHandle: "out", target: "filter", targetHandle: "in" },
    { id: "w-2", source: "filter", sourceHandle: "out", target: "sink", targetHandle: "in" },
  ],
};

const AFTER: HostScene = {
  nodes: [
    { id: "reader", type: "block", position: { x: 24, y: 24 }, data: { name: "ingest", view: "port", w: 120, h: 64, ports: { right: ["out"] } } },
    {
      id: "filter",
      type: "block",
      position: { x: 220, y: 24 },
      data: { name: "filter", view: "port", w: 120, h: 64, ports: { left: ["in", "cfg"], right: ["out"] } },
    },
    { id: "store", type: "block", position: { x: 420, y: 24 }, data: { name: "store", view: "port", w: 120, h: 64, ports: { left: ["in"] } } },
  ],
  edges: [
    { id: "w-1", source: "reader", sourceHandle: "out", target: "filter", targetHandle: "in" },
    { id: "w-2", source: "filter", sourceHandle: "out", target: "store", targetHandle: "in" },
  ],
};

/** The port vocabulary, one resolver per side — `diffScene`'s own contract.
 *  A scene names ports on its nodes' `data`, so this is a read, not a guess. */
function portsOfScene(scene: HostScene): (nodeId: string) => readonly string[] | undefined {
  return (nodeId) => {
    const node = scene.nodes.find((candidate) => candidate.id === nodeId);
    if (!node?.data.ports) return undefined;
    return Object.values(node.data.ports).flatMap((ids) => ids ?? []);
  };
}

const PORTS_OF: ScenePortsOf = { before: portsOfScene(BEFORE), after: portsOfScene(AFTER) };

/**
 * The compare options this host family uses, in one place so the stories and
 * the app cannot drift apart on them.
 *
 * `omitNodeFields: ["ports"]` because `HostNodeData` keeps the port vocabulary
 * in `data` — see `sceneCompare.ts`'s own doc on that option. Without it,
 * adding `filter.cfg` reports twice: once readably as a port row, once as a
 * JSON blob under `ports`.
 */
const COMPARE_OPTIONS = { portsOf: PORTS_OF, omitNodeFields: ["ports"] } as const;

const PANE_WIDTH = 600;
const PANE_HEIGHT = 240;

/* ------------------------------------------------------------------ */
/* The pane — the composition a host repeats                            */
/* ------------------------------------------------------------------ */

function ComparePane({
  scene,
  changes,
  side,
  selectedChangeId,
}: {
  scene: HostScene;
  changes: readonly CompareChange[];
  side: "before" | "after";
  selectedChangeId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marks = useMemo(() => diffMarksForSide(changes, side), [changes, side]);
  const selected = changes.find((change) => change.id === selectedChangeId) ?? null;
  const selectedAnchor = selected ? (side === "before" ? selected.anchorBefore : selected.anchorAfter) : null;
  return (
    <div ref={containerRef} data-testid={`pane-${side}`} style={{ position: "relative", overflow: "auto", height: "100%" }}>
      <DomCanvas scene={scene} width={PANE_WIDTH} height={PANE_HEIGHT}>
        <SceneDiffMarks
          marks={marks}
          containerRef={containerRef}
          selectedId={selectedAnchor}
          layoutKey={scene}
          testIdPrefix={`marks-${side}`}
        />
      </DomCanvas>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. The panes on their own — where the geometry is measured           */
/* ------------------------------------------------------------------ */

/**
 * Two benches, the diff painted on both. No modal, so the marks can be
 * measured against the blocks they sit on without a portal in the way.
 */
export const MarksOnTheBoards: Story = {
  render: () => {
    const comparison = compareScenes(BEFORE, AFTER, COMPARE_OPTIONS);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <section>
          <h3 style={{ font: "600 12px ui-sans-serif, sans-serif", margin: "0 0 8px" }}>Before</h3>
          <ComparePane scene={BEFORE} changes={comparison.changes} side="before" selectedChangeId={null} />
        </section>
        <section>
          <h3 style={{ font: "600 12px ui-sans-serif, sans-serif", margin: "0 0 8px" }}>After</h3>
          <ComparePane scene={AFTER} changes={comparison.changes} side="after" selectedChangeId={null} />
        </section>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A mark is drawn only where its node actually IS. `sink` was deleted, so
    // it exists to be outlined on the before side and nowhere else; `store` is
    // new, so the mirror holds. This is the claim that makes the layer usable
    // on both panes with no per-side filtering by the caller.
    await waitFor(() => expect(canvas.getByTestId("marks-before-sink")).toBeInTheDocument());
    await expect(canvas.queryByTestId("marks-after-sink")).toBeNull();
    await expect(canvas.getByTestId("marks-after-store")).toBeInTheDocument();
    await expect(canvas.queryByTestId("marks-before-store")).toBeNull();

    // The operation reaches the paint, not just the model.
    await expect(canvas.getByTestId("marks-before-sink")).toHaveAttribute("data-operation", "removed");
    await expect(canvas.getByTestId("marks-after-store")).toHaveAttribute("data-operation", "added");
    await expect(canvas.getByTestId("marks-after-reader")).toHaveAttribute("data-operation", "modified");

    // SPATIAL: the mark is the node's own rendered box, inflated by the
    // component's own exported inset — measured on both, compared to the
    // constant, never to a literal.
    const pane = canvasElement.querySelector<HTMLElement>('[data-testid="pane-after"]')!;
    const node = pane.querySelector<HTMLElement>(`[${SCENE_NODE_ATTRIBUTE}="store"]`)!;
    const mark = canvas.getByTestId("marks-after-store");
    await waitFor(() => {
      const nodeBox = node.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      expect(markBox.width).toBeCloseTo(nodeBox.width + DIFF_MARK_INSET * 2, 0);
      expect(markBox.height).toBeCloseTo(nodeBox.height + DIFF_MARK_INSET * 2, 0);
      expect(nodeBox.left - markBox.left).toBeCloseTo(DIFF_MARK_INSET, 0);
      expect(nodeBox.top - markBox.top).toBeCloseTo(DIFF_MARK_INSET, 0);
    });
    await expect(mark).toHaveStyle({ borderWidth: `${DIFF_MARK_BORDER}px` });

    // A port added under a block that otherwise did not change earns a PORT
    // row, so it draws no node outline of its own — `filter` is marked
    // because of the port row's anchor, and its operation is the port's.
    await expect(canvas.getByTestId("marks-after-filter")).toHaveAttribute("data-operation", "added");
  },
};

/* ------------------------------------------------------------------ */
/* 2. The whole dialog, fed by diffScene                                */
/* ------------------------------------------------------------------ */

function DialogHost({ children }: { children?: ReactNode }) {
  return <div style={{ padding: 12, font: "12px ui-sans-serif, sans-serif" }}>{children}</div>;
}

export const DialogOverTwoScenes: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
    const comparison = useMemo(() => compareScenes(BEFORE, AFTER, COMPARE_OPTIONS), []);
    return (
      <DialogHost>
        <p data-testid="total">{comparison.total}</p>
        <CompareDialog
          open={open}
          onOpenChange={setOpen}
          comparison={comparison}
          sourceNote={{ beforeLabel: "Baseline", afterLabel: "Current board" }}
          selectedChangeId={selectedChangeId}
          onSelectChange={setSelectedChangeId}
          // Two independent DOM benches have two independent origins, so a
          // blend of them would be a picture of nothing. Said out loud rather
          // than left to look broken — the dialog disables the option.
          canOverlay={false}
          testIdPrefix="ss-compare"
          renderBefore={() => (
            <ComparePane scene={BEFORE} changes={comparison.changes} side="before" selectedChangeId={selectedChangeId} />
          )}
          renderAfter={() => (
            <ComparePane scene={AFTER} changes={comparison.changes} side="after" selectedChangeId={selectedChangeId} />
          )}
        />
      </DialogHost>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const modal = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-testid="ss-compare-dialog"]');
      expect(found).not.toBeNull();
      return found!;
    });

    // The tallies are the engine's, arithmetic done once: one added node
    // (`store`), one removed node (`sink`), one modified node (`reader`'s
    // name) plus one modified edge (`w-2`'s target), and one added port
    // (`filter.cfg`). `compareTally` and the titlebar must agree, because
    // they are the same numbers reached two ways.
    const comparison = compareScenes(BEFORE, AFTER, COMPARE_OPTIONS);
    await expect(compareTally(comparison, "added")).toBe(2);
    await expect(compareTally(comparison, "removed")).toBe(1);
    await expect(compareTally(comparison, "modified")).toBe(2);
    await expect(within(canvasElement).getByTestId("total")).toHaveTextContent("5");

    await expect(within(modal).getByTestId("ss-compare-badge-added")).toHaveTextContent("2 added");
    await expect(within(modal).getByTestId("ss-compare-badge-removed")).toHaveTextContent("1 removed");
    await expect(within(modal).getByTestId("ss-compare-badge-modified")).toHaveTextContent("2 modified");

    // The pair note replaces the version rail — this compare has two named
    // endpoints, not a file history to page through.
    await expect(within(modal).getByTestId("ss-compare-history-source-panel")).toHaveTextContent("Baseline");

    // The rename reaches the detail rail as a FIELD of the element, with the
    // element carrying its current name. A row saying only "reader changed"
    // would be the collapse `sceneDiff.ts` exists to prevent.
    await expect(within(modal).getAllByText("ingest").length).toBeGreaterThan(0);

    // Both panes render, and they are side by side — measured, not assumed.
    const before = modal.querySelector<HTMLElement>('[data-testid="pane-before"]')!;
    const after = modal.querySelector<HTMLElement>('[data-testid="pane-after"]')!;
    await waitFor(() => {
      expect(before.getBoundingClientRect().right).toBeLessThanOrEqual(after.getBoundingClientRect().left + 1);
    });

    // Overlay is refused rather than lying about two unlinked cameras.
    await expect(within(modal).getByTestId("ss-compare-mode-overlay")).toBeDisabled();

    // Closing is the host's, through the dialog's own close control.
    await userEvent.click(within(modal).getByTestId("ss-compare-close"));
    await waitFor(() => expect(document.querySelector('[data-testid="ss-compare-dialog"]')).toBeNull());
    await expect(body.queryByTestId("ss-compare-dialog")).toBeNull();
  },
};
