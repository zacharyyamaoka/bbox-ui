import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { HistoryList, type HistoryRecord } from "./historyList";

/**
 * The Compare dialog's HISTORY rail and the Block inspector's History tab
 * (docs/menus/screenshots/08-compare-changes.png — the rail on the left).
 * One component, two densities: `comfortable` is the Compare rail's own
 * width, `compact` is the inspector's narrower panel.
 */
const meta = {
  title: "Basics/HistoryList",
  component: HistoryList,
  // Every story below overrides `render`; these are just the dummy
  // defaults CSF3 typing needs to cover HistoryList's required props.
  args: { records: [], selectedId: null, testidPrefix: "history" },
} satisfies Meta<typeof HistoryList>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();

/** Exactly the Compare dialog's rail with nothing to page through yet —
 *  the screenshot's own state: one entry, the live board, pinned AFTER and
 *  undisabled-but-unpickable (it is the fixed endpoint, not a choice). */
function CompareRailDemo() {
  const records: HistoryRecord[] = [
    { id: "live", title: "Current version", description: undefined, timestamp: now - 20_000, author: null, badge: "•", tone: "current", isCurrent: true },
  ];
  const [beforeId, setBeforeId] = useState<string | null>(null);
  return (
    <div className="w-64 rounded-md border border-border bg-card p-2">
      <HistoryList
        records={records}
        selectedId={beforeId}
        onSelect={setBeforeId}
        density="comfortable"
        testidPrefix="rail"
        emptyCopy="No versions found beside this board."
        isDisabled={(record) => record.isCurrent}
        pinOf={(record) => (record.isCurrent ? "after" : record.id === beforeId ? "before" : null)}
      />
    </div>
  );
}

export const CompareRailSingleVersion: Story = {
  render: () => <CompareRailDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("rail-title-live")).toHaveTextContent("Current version");
    await expect(canvas.getByTestId("rail-meta-live")).toHaveTextContent("just now");
    // The live board is an endpoint, never a choice.
    await expect(canvas.getByTestId("rail-pick-live")).toBeDisabled();
  },
};

/** The same component with a real ladder of versions beside it — several
 *  tones, an author-attributed entry (the day identity lands), one with a
 *  description, `before` picked and `after` pinned to the live board. */
const LADDER_RECORDS: HistoryRecord[] = [
  { id: "live", title: "Current version", timestamp: now - 20_000, author: null, badge: "•", tone: "current", isCurrent: true },
  {
    id: "v5",
    title: "3 added · 1 edited",
    description: "run_predict gained a threshold input; the frame_source title was corrected.",
    timestamp: now - 7 * 60_000,
    author: null,
    badge: "v5",
    tone: "mixed",
    isCurrent: false,
  },
  { id: "v4", title: "1 edited", timestamp: now - 3 * 3_600_000, author: { id: "u1", name: "Mitch" }, badge: "v4", tone: "modified", isCurrent: false },
  { id: "v3", title: "2 removed", timestamp: now - 2 * 86_400_000, author: null, badge: "v3", tone: "removed", isCurrent: false },
  { id: "v2", title: "1 added", timestamp: now - 9 * 86_400_000, author: null, badge: "v2", tone: "added", isCurrent: false },
  { id: "v1", title: "Initial board", timestamp: now - 40 * 86_400_000, author: null, badge: "v1", tone: "none", isCurrent: false },
];

function InspectorHistoryDemo() {
  const [selectedId, setSelectedId] = useState<string | null>("v4");
  return (
    <div className="w-56 rounded-md border border-border bg-card p-2">
      <HistoryList
        records={LADDER_RECORDS}
        selectedId={selectedId}
        onSelect={setSelectedId}
        density="compact"
        testidPrefix="inspector"
        isDisabled={(record) => record.isCurrent}
        pinOf={(record) => (record.isCurrent ? "after" : record.id === selectedId ? "before" : null)}
      />
    </div>
  );
}

export const InspectorHistoryLadder: Story = {
  render: () => <InspectorHistoryDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // v5 carries a description; its chevron is present and its prose is
    // collapsed until clicked — the row stays identical to every other row
    // at rest.
    await expect(canvas.queryByTestId("inspector-description-v5")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByTestId("inspector-disclose-v5"));
    await expect(canvas.getByTestId("inspector-description-v5")).toHaveTextContent("threshold input");
    // Selecting a different entry moves `before`; the live board never
    // becomes selectable.
    await userEvent.click(canvas.getByTestId("inspector-pick-v2"));
    await expect(canvas.getByTestId("inspector-row-v2")).toHaveAttribute("data-selected", "true");
    await expect(canvas.getByTestId("inspector-pick-live")).toBeDisabled();
  },
};

/** Every tone side by side, comfortable and compact, with and without an
 *  author — the reference sheet for what the avatar slot can hold. */
export const ToneAndDensityReference: Story = {
  render: () => {
    const tones: HistoryRecord["tone"][] = ["added", "removed", "modified", "mixed", "current", "none"];
    const withoutAuthor: HistoryRecord[] = tones.map((tone, index) => ({
      id: `t-${tone}`,
      title: `${tone[0]!.toUpperCase()}${tone.slice(1)} version`,
      timestamp: now - (index + 1) * 3_600_000,
      author: null,
      badge: tone === "current" ? "•" : `v${index + 1}`,
      tone,
      isCurrent: tone === "current",
    }));
    const withAuthor: HistoryRecord[] = [
      { id: "a-1", title: "Renamed run_inference", timestamp: now - 90_000, author: { id: "u1", name: "Mitch" }, badge: "v2", tone: "modified", isCurrent: false },
      { id: "a-2", title: "😀nimated onboarding pass", timestamp: now - 2 * 86_400_000, author: { id: "u2", name: "😀 Yuki" }, badge: "v1", tone: "added", isCurrent: false },
    ];
    return (
      <div className="flex flex-wrap gap-6">
        <div className="w-56 rounded-md border border-border bg-card p-2">
          <p className="mb-1 px-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Comfortable · no author</p>
          <HistoryList records={withoutAuthor} selectedId={null} density="comfortable" testidPrefix="tones-comfortable" />
        </div>
        <div className="w-48 rounded-md border border-border bg-card p-2">
          <p className="mb-1 px-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Compact · no author</p>
          <HistoryList records={withoutAuthor} selectedId={null} density="compact" testidPrefix="tones-compact" />
        </div>
        <div className="w-56 rounded-md border border-border bg-card p-2">
          {/* An author's name is rendered verbatim, code-point-safe first
           *  initial included — an emoji-led name still gets a real glyph
           *  in the circle instead of half a surrogate pair. */}
          <p className="mb-1 px-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">With author</p>
          <HistoryList records={withAuthor} selectedId={null} density="comfortable" testidPrefix="authored" />
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("authored-row-a-2")).toHaveTextContent("Yuki");
  },
};

/** The rail with genuinely nothing beside this board — the amber notice in
 *  the screenshot's shell lives one level up (`compareReview.tsx`), but the
 *  rail itself still needs its own honest empty copy underneath it. */
export const EmptyHistory: Story = {
  render: () => (
    <div className="w-56 rounded-md border border-border bg-card p-2">
      <HistoryList
        records={[]}
        selectedId={null}
        density="comfortable"
        testidPrefix="empty-rail"
        emptyCopy="No versions found beside this board."
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("empty-rail-empty")).toHaveTextContent("No versions found beside this board.");
  },
};
