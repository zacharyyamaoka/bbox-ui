import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { PropertyTable, type ElementReview, type TableLayout } from "./propertyTable";
import { compareBoards, type RecordMap } from "./compareModel";

/**
 * The Compare dialog's Properties view
 * (docs/menus/screenshots/08-compare-changes.png — the right rail). Real
 * `CompareChange[]` computed by Lane E's `compareBoards`, not hand-typed
 * rows, so the gallery exercises the same path a host does.
 */
const meta = {
  title: "Editor/Panels & Dialogs/PropertyTable",
  tags: ["object:chrome"],
  component: PropertyTable,
  // Every story below overrides `render`; these are just the dummy
  // defaults CSF3 typing needs to cover PropertyTable's required props.
  args: {
    changes: [],
    selectedId: null,
    onSelect: () => {},
    gitHighlight: false,
    onGitHighlightChange: () => {},
    layout: "columns",
    onLayoutChange: () => {},
    selectedElementId: null,
    onSelectElement: () => {},
  },
} satisfies Meta<typeof PropertyTable>;

export default meta;
type Story = StoryObj<typeof meta>;

function port(id: string, name: string, type = "", defaultValue = "") {
  return { id, name, type, defaultValue };
}

function block(id: string, props: Record<string, unknown>): [string, RecordMap[string]] {
  return [
    id,
    { id, typeName: "shape", type: "block", props: { title: "", description: "", blockType: "", inputs: [], outputs: [], ...props } },
  ];
}

function binding(id: string, cableId: string, terminal: "start" | "end", toId: string, portId: string): [string, RecordMap[string]] {
  return [id, { id, typeName: "binding", type: "connection", fromId: cableId, toId, props: { terminal, portId } }];
}

/**
 * One board that gained a port, renamed a Block, added a Block, removed a
 * Block, and rewired a cable's endpoint — enough variety that every glyph
 * `elementIcon` knows about (block, port, cable) and all three states
 * (added/removed/modified) appear at once, exactly the mix the screenshot's
 * own board produces at scale.
 */
function buildChanges() {
  const before: RecordMap = Object.fromEntries([
    block("shape:predict", { title: "run_inference", blockType: "model", inputs: [port("in-frames", "frames")] }),
    block("shape:overlay", { title: "Old Debug Overlay", blockType: "widget" }),
    ["shape:cable-a", { id: "shape:cable-a", typeName: "shape", type: "connection", props: {} }],
    binding("binding:a-start", "shape:cable-a", "start", "shape:predict", "in-frames"),
    binding("binding:a-end", "shape:cable-a", "end", "shape:overlay", "out-view"),
  ]);
  const after: RecordMap = Object.fromEntries([
    block("shape:predict", {
      title: "run_predict",
      blockType: "model",
      inputs: [port("in-frames", "frames"), port("in-threshold", "threshold", "float", "0.5")],
    }),
    block("shape:source", { title: "Frame Source", blockType: "input" }),
    ["shape:cable-a", { id: "shape:cable-a", typeName: "shape", type: "connection", props: {} }],
    binding("binding:a-start", "shape:cable-a", "start", "shape:predict", "in-frames"),
    binding("binding:a-end", "shape:cable-a", "end", "shape:source", "in-source"),
  ]);
  return compareBoards(before, after).changes;
}

const CHANGES = buildChanges();

/** Full interactive loop — the header controls live INSIDE this component
 *  (see the file's own header note on why that moved from the donor's
 *  dialog shell), so this is the whole "Properties view" a host mounts. */
function InteractiveDemo({ initialLayout = "columns" as TableLayout }: { initialLayout?: TableLayout }) {
  const [gitHighlight, setGitHighlight] = useState(false);
  const [layout, setLayout] = useState<TableLayout>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(CHANGES[0]?.id ?? null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(CHANGES[0]?.elementId ?? null);
  return (
    <div className="h-[420px] w-[640px] overflow-hidden rounded-md border border-border bg-card">
      <PropertyTable
        changes={CHANGES}
        selectedId={selectedId}
        onSelect={setSelectedId}
        gitHighlight={gitHighlight}
        onGitHighlightChange={setGitHighlight}
        layout={layout}
        onLayoutChange={setLayout}
        selectedElementId={selectedElementId}
        onSelectElement={setSelectedElementId}
      />
    </div>
  );
}

export const FlatTableWordDiffToggle: Story = {
  render: () => <InteractiveDemo initialLayout="columns" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The rewired cable, the renamed Block and the gained port all show up
    // as their own rows, each with the right badge.
    await expect(canvas.getByTestId("compare-property-table")).toHaveAttribute("data-layout", "columns");
    const modifiedBadges = canvas.getAllByText("Modified");
    await expect(modifiedBadges.length).toBeGreaterThan(0);

    // Off by default ("like Figma") — the value cells carry no <mark>.
    const checkbox = canvas.getByTestId("compare-highlight-checkbox");
    await expect(checkbox).not.toBeChecked();

    // Flipping it on paints the intra-value ink without touching row
    // selection or the layout switch.
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
  },
};

export const ByElementLayout: Story = {
  render: () => <InteractiveDemo initialLayout="figma" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("compare-figma-layout")).toBeInTheDocument();
    // `run_predict` (the Block that changed AND gained a port) is Edited,
    // never a whole-object Added/Removed row.
    // WHY `block:` prefixed (fixed 2026-09-18): `compareModel.ts` builds
    // every own-Block change id as `` `block:${blockId}` `` (its own
    // `changeId = \`block:${blockId}\`` at three call sites), and
    // `elementSummaries` (propertyRows.ts) keys each `ElementSummary` by
    // that SAME id for an own-Block change (`elementId: change.parentId ??
    // change.id`, `parentId` null here) — so the real testid this row
    // renders under is `compare-element-block:shape:predict`, never the
    // bare record id `compare-element-shape:predict` this assertion had
    // assumed.
    const predict = canvas.getByTestId("compare-element-block:shape:predict");
    await expect(predict).toHaveAttribute("data-status", "edited");
  },
};

/** Selecting a different element in the left list re-scopes the right
 *  table WITHOUT touching the flat table's row selection — two different
 *  pieces of state, on purpose (only one of them survives a layout swap). */
export const SwitchElementInFigmaLayout: Story = {
  render: () => <InteractiveDemo initialLayout="figma" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `block:` prefix — same reason as `ByElementLayout` above.
    await userEvent.click(canvas.getByTestId("compare-element-block:shape:source"));
    await expect(canvas.getByTestId("compare-element-block:shape:source")).toHaveAttribute("data-selected", "true");
    await expect(canvas.getByTestId("compare-property-table")).toHaveAttribute("data-layout", "figma");
  },
};

/** Nothing selected yet in the `figma` layout — Figma's own sentence,
 *  copied rather than paraphrased, because this view exists to be judged
 *  against the tool it came from. */
export const SelectAnElementPrompt: Story = {
  render: () => {
    function Demo() {
      const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [gitHighlight, setGitHighlight] = useState(false);
      return (
        <div className="h-[360px] w-[640px] overflow-hidden rounded-md border border-border bg-card">
          <PropertyTable
            changes={CHANGES}
            selectedId={selectedId}
            onSelect={setSelectedId}
            gitHighlight={gitHighlight}
            onGitHighlightChange={setGitHighlight}
            layout="figma"
            onLayoutChange={() => {}}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </div>
      );
    }
    return <Demo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("compare-figma-empty")).toHaveTextContent("Select an edited element to compare changes");
  },
};

/** Two boards with nothing between them — "These two versions are
 *  identical.", in both layouts, Figma's own wording. */
export const IdenticalVersions: Story = {
  render: () => {
    function Demo() {
      const [layout, setLayout] = useState<TableLayout>("columns");
      const [gitHighlight, setGitHighlight] = useState(false);
      return (
        <div className="h-[280px] w-[560px] overflow-hidden rounded-md border border-border bg-card">
          <PropertyTable
            changes={[]}
            selectedId={null}
            onSelect={() => {}}
            gitHighlight={gitHighlight}
            onGitHighlightChange={setGitHighlight}
            layout={layout}
            onLayoutChange={setLayout}
            selectedElementId={null}
            onSelectElement={() => {}}
          />
        </div>
      );
    }
    return <Demo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
    await userEvent.click(canvas.getByTestId("compare-layout-figma"));
    await expect(canvas.getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
  },
};

/** Action mode: a `review` prop draws the accept/reject checkbox, one per
 *  ELEMENT (never per property row) — a Block whose title and a port both
 *  changed is one thing a reviewer decides about, not two. Absent `review`
 *  (every other story here), the table draws no checkbox at all — not a
 *  disabled one, not a hidden one. */
function ReviewModeDemo() {
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(() => new Set(CHANGES.map((change) => change.elementId)));
  const [selectedId, setSelectedId] = useState<string | null>(CHANGES[0]?.id ?? null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(CHANGES[0]?.elementId ?? null);
  const review: ElementReview = {
    isAccepted: (id) => accepted.has(id),
    onToggle: (id, next) =>
      setAccepted((current) => {
        const set = new Set(current);
        if (next) set.add(id);
        else set.delete(id);
        return set;
      }),
  };
  return (
    <div className="h-[420px] w-[640px] overflow-hidden rounded-md border border-border bg-card">
      <PropertyTable
        changes={CHANGES}
        selectedId={selectedId}
        onSelect={setSelectedId}
        gitHighlight={false}
        onGitHighlightChange={() => {}}
        layout="figma"
        onLayoutChange={() => {}}
        selectedElementId={selectedElementId}
        onSelectElement={setSelectedElementId}
        review={review}
      />
    </div>
  );
}

export const ReviewModeAcceptReject: Story = {
  render: () => <ReviewModeDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `block:` prefix — same reason as `ByElementLayout` above (`review`'s
    // `accepted` set is keyed by `change.elementId`, the same `block:`-
    // prefixed id `compare-accept-${element.id}`/`compare-element-
    // ${element.id}` render under).
    const box = canvas.getByTestId("compare-accept-block:shape:overlay");
    await expect(box).toBeChecked();
    await userEvent.click(box);
    await expect(box).not.toBeChecked();
    // Unticking an element's box must not also move the boards — the row
    // it sits on stays whatever it already was.
    await expect(canvas.getByTestId("compare-element-block:shape:overlay")).toBeInTheDocument();
  },
};
