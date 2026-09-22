import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { CodeView } from "./codeView";
import { compareBoards, type CompareChange, type RecordMap } from "./compareModel";

/**
 * The Compare dialog's Code tab (docs/menus/screenshots/08-compare-changes.png
 * shows its sibling, Properties, selected — this is the other half of that
 * same tab strip). Real `CompareChange[]` from Lane E's `compareBoards`, so
 * the serialized JSON on screen is the actual evidence the Properties table
 * was computed from, not a fabricated snippet.
 */
const meta = {
  title: "Components/Text & Marks/CodeView",
  tags: ["object:text-marks"],
  component: CodeView,
  // Every story below overrides `render`; this is just the dummy default
  // CSF3 typing needs to cover CodeView's one required prop.
  args: { change: null },
} satisfies Meta<typeof CodeView>;

export default meta;
type Story = StoryObj<typeof meta>;

function block(id: string, props: Record<string, unknown>): [string, RecordMap[string]] {
  return [id, { id, typeName: "shape", type: "block", props: { title: "", description: "", blockType: "", ...props } }];
}

function findChange(changes: readonly CompareChange[], predicate: (change: CompareChange) => boolean): CompareChange {
  const found = changes.find(predicate);
  if (!found) throw new Error("fixture change not found");
  return found;
}

/** One Block renamed and given a longer description — enough real fields
 *  that `collapseContext` has both a change to keep and a long unchanged
 *  stretch to elide around it. */
const RENAME_CHANGES = compareBoards(
  Object.fromEntries([
    block("shape:predict", {
      title: "run_inference",
      blockType: "model",
      description: "Runs the pose model over the incoming frame and emits normalized keypoints for the tracker downstream.",
    }),
  ]),
  Object.fromEntries([
    block("shape:predict", {
      title: "run_predict",
      blockType: "model",
      description: "Runs the pose model over the incoming frame and emits normalized keypoints for the tracker downstream.",
    }),
  ]),
).changes;

const ADD_REMOVE_CHANGES = compareBoards(
  Object.fromEntries([block("shape:overlay", { title: "Old Debug Overlay", blockType: "widget" })]),
  Object.fromEntries([block("shape:source", { title: "Frame Source", blockType: "input" })]),
).changes;

export const AddedModifiedRemoved: Story = {
  render: () => {
    const added = findChange(ADD_REMOVE_CHANGES, (change) => change.kind === "added");
    const removed = findChange(ADD_REMOVE_CHANGES, (change) => change.kind === "removed");
    const modified = findChange(RENAME_CHANGES, (change) => change.kind === "modified");
    return (
      <div className="flex flex-wrap gap-4">
        {[
          { label: "added", change: added },
          { label: "removed", change: removed },
          { label: "modified", change: modified },
        ].map(({ label, change }) => (
          <div key={label} className="w-[360px] overflow-hidden rounded-md border border-border bg-card">
            <CodeView change={change} />
          </div>
        ))}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Removed lines print before the added lines that replaced them — the
    // way `git diff` orders a replacement pair, top to bottom.
    const removedLines = canvas.getAllByTestId("compare-code-removed");
    const addedLines = canvas.getAllByTestId("compare-code-added");
    await expect(removedLines.length).toBeGreaterThan(0);
    await expect(addedLines.length).toBeGreaterThan(0);
  },
};

/**
 * Selecting a different row in the Properties table re-points this tab at
 * a different record — the interactive loop a host actually drives, since
 * `CodeView` itself has no notion of "selection", only of `change`.
 */
function SwitchRecordDemo() {
  const options = [
    { id: "modified", label: "run_predict (renamed)", change: findChange(RENAME_CHANGES, (change) => change.kind === "modified") },
    { id: "added", label: "Frame Source (added)", change: findChange(ADD_REMOVE_CHANGES, (change) => change.kind === "added") },
  ];
  const [selected, setSelected] = useState(options[0]!.id);
  const active = options.find((option) => option.id === selected)!;
  return (
    <div className="w-[420px]">
      <div className="mb-2 flex gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            data-testid={`pick-${option.id}`}
            className="rounded-md border border-border px-2 py-1 text-xs data-[active=true]:bg-muted"
            data-active={option.id === selected}
            onClick={() => setSelected(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <CodeView change={active.change} />
      </div>
    </div>
  );
}

export const SwitchesWithTheSelectedRow: Story = {
  render: () => <SwitchRecordDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("compare-code-view")).toHaveTextContent("run_predict");
    await userEvent.click(canvas.getByTestId("pick-added"));
    await expect(canvas.getByTestId("compare-code-view")).toHaveTextContent("Frame Source");
  },
};

/** Nothing selected yet — the row this tab is scoped to hasn't been picked. */
export const NoRowSelected: Story = {
  render: () => (
    <div className="w-[360px] overflow-hidden rounded-md border border-border bg-card">
      <CodeView change={null} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("compare-code-empty")).toHaveTextContent("Select a row to see the record it was computed from.");
  },
};
