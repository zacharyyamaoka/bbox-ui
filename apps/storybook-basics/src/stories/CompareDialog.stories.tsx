import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { CompareDialog } from "../components/compareDialog";
import { compareBoards, type CompareChange, type RecordMap } from "../components/compareModel";
import {
  discoverHistory,
  historyProblem,
  versionRecords,
  type CompareVersion,
} from "../components/compareSource";
import type { HistoryRecord } from "../components/historyList";
import { cn } from "../lib/utils";

/**
 * Compare changes — the whole modal, the way Zach's screenshot shows it
 * (`/home/bam/zach_brain/Pasted image 20260919183300.png`): a near-
 * fullscreen dark dialog titled **Compare changes** over a HISTORY rail, two
 * board panes, a Properties|Code detail rail and a Side by side|Overlay +
 * Fullscreen bar.
 *
 * `CompareReview.stories.tsx` covers the BODY, which is headless by design.
 * This file covers the thing above it: the stock `Dialog` shell, the
 * titlebar and its tally badges, and — the part neither the donor nor the
 * body could show — the `<name>.vN.systemsketch` discovery in
 * `compareSource.ts` actually feeding the rail.
 *
 * Every story drives the dialog through a host that owns exactly what a
 * real host owns: which version is `before`, what the diff of those two
 * files came out as, and what goes in the two board slots. The dialog owns
 * everything else, which is the whole reason it exists — see its header
 * note on uncontrolled fallbacks.
 */
const meta = {
  title: "Basics/CompareDialog",
  tags: ["area:basics", "lane:draft-compare"],
  component: CompareDialog,
  // Dummy defaults so `StoryObj<typeof meta>` does not demand a full prop
  // set per story; every story below supplies its own `render`.
  args: {
    open: false,
    onOpenChange: fn(),
    comparison: null,
    renderBefore: () => null,
    renderAfter: () => null,
  },
} satisfies Meta<typeof CompareDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);
const dialog = () => document.querySelector<HTMLElement>('[data-testid="compare-dialog"]');

/* ------------------------------------------------------------------ */
/* Fixtures — real diffs from the real `compareBoards`, never hand-typed
   rows, so these stories exercise the same data path a host does.      */
/* ------------------------------------------------------------------ */

function port(id: string, name: string, type = "", defaultValue = "") {
  return { id, name, type, defaultValue };
}

function block(id: string, props: Record<string, unknown>): [string, RecordMap[string]] {
  return [
    id,
    { id, typeName: "shape", type: "block", props: { title: "", description: "", blockType: "", inputs: [], outputs: [], ...props } },
  ];
}

const V1_BOARD: RecordMap = Object.fromEntries([
  block("shape:predict", { title: "run_inference", blockType: "model", inputs: [port("in-frames", "frames", "Frame")] }),
  block("shape:overlay", { title: "Debug Overlay", blockType: "widget" }),
]);

const LIVE_BOARD: RecordMap = Object.fromEntries([
  block("shape:predict", {
    title: "run_predict",
    blockType: "model",
    inputs: [port("in-frames", "frames", "Image"), port("in-threshold", "threshold", "float", "0.5")],
  }),
  block("shape:source", { title: "Frame Source", blockType: "input" }),
]);

/** v1 → live: an addition, a deletion and two modifications. */
const CHANGED = compareBoards(V1_BOARD, LIVE_BOARD);
/** The live board against itself — a real `total: 0`, not a stub. */
const IDENTICAL = compareBoards(LIVE_BOARD, LIVE_BOARD);

/** `compareModel.ts`'s own `block:${shapeId}` element id. */
const PREDICT_ELEMENT_TESTID = "compare-element-block:shape:predict";

/* ------------------------------------------------------------------ */
/* History, discovered rather than declared.                           */
/* ------------------------------------------------------------------ */

const BOARD_PATH = "/home/bam/boards/pipeline.systemsketch";

/** A workspace where `pipeline.v1.systemsketch` exists beside the board. */
const WITH_V1 = async (path: string) => (path === "/home/bam/boards/pipeline.v1.systemsketch" ? "{}" : null);
/** A brand-new board: nothing beside it at all. This is the common case. */
const BARE = async () => null;

/**
 * Discovery runs for real inside the harness — `discoverHistory` is async,
 * the same way a host's filesystem probe is, so a story that pre-computed
 * its rail would skip the one state a reviewer sees most (the rail before
 * the probe has answered).
 */
function useDiscoveredHistory(read: (path: string) => Promise<string | null>, changeCount: number) {
  const [versions, setVersions] = useState<readonly CompareVersion[]>([]);
  useEffect(() => {
    let live = true;
    void discoverHistory(BOARD_PATH, read).then((found) => {
      if (live) setVersions(found);
    });
    return () => {
      live = false;
    };
  }, [read]);

  const records: HistoryRecord[] = versionRecords(versions, {
    // "Titles are measured by diffing the files" — the rail's own footer.
    titleOf: (version) =>
      version.isCurrent ? "Current version" : `${changeCount} ${changeCount === 1 ? "change" : "changes"}`,
    timestampOf: (version) => (version.isCurrent ? Date.now() - 20_000 : Date.now() - 3 * 3_600_000),
  });
  return { records, problem: versions.length > 0 ? historyProblem(versions) : null };
}

/* ------------------------------------------------------------------ */
/* Board slots — a host's `BoardRender` stands here. See the seam note on
   `CompareDialog`: the trunk takes a ReactNode, never an engine.       */
/* ------------------------------------------------------------------ */

function BoardMock({ slot, side }: { slot: { highlight: CompareChange | null; label: string }; side: "before" | "after" }) {
  return (
    <div
      data-testid={`board-slot-${side}`}
      className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(45deg,transparent,transparent_11px,var(--color-muted)_11px,var(--color-muted)_12px)]"
    >
      <div className="grid grid-cols-2 gap-3 p-4">
        {[0, 1, 2, 3].map((cell) => (
          <div
            key={cell}
            className={cn(
              "h-14 w-24 rounded-md border bg-card shadow-sm",
              slot.highlight && cell === 0 ? "border-blue-600 ring-2 ring-blue-600/40 dark:border-blue-400" : "border-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The before pane with nothing in it. Figma's own sentence, and the
 * screenshot's: a board that has never been saved beside a `.v1` has no
 * second endpoint to draw, and says so rather than drawing an empty canvas
 * that reads as "this version was blank".
 */
function NoSnapshotSlot() {
  return (
    <p
      data-testid="compare-no-snapshot"
      className="m-0 grid h-full place-items-center px-4 text-center text-xs text-muted-foreground"
    >
      No snapshot loaded.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* One harness, configured per story — the same shape a wiring lane will
   write in `apps/systemsketch`.                                        */
/* ------------------------------------------------------------------ */

interface HarnessProps {
  read?: (path: string) => Promise<string | null>;
  /** Which comparison a picked version yields. Null until one is picked. */
  comparisonWhenPicked?: typeof CHANGED | null;
  initialVersionId?: string | null;
  onOpenChange?: (open: boolean) => void;
}

function Harness({ read = BARE, comparisonWhenPicked = CHANGED, initialVersionId = null, onOpenChange }: HarnessProps) {
  const [open, setOpen] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(initialVersionId);
  const { records, problem } = useDiscoveredHistory(read, comparisonWhenPicked?.total ?? 0);

  // The host owns "what has actually been loaded": a comparison exists only
  // once a `before` has been picked, which is exactly why "No snapshot
  // loaded." is the day-one state.
  const comparison = selectedVersionId ? comparisonWhenPicked : null;

  return (
    <CompareDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      comparison={comparison}
      versions={records}
      selectedVersionId={selectedVersionId}
      onSelectVersion={setSelectedVersionId}
      problem={problem}
      renderBefore={(slot) => (comparison ? <BoardMock slot={slot} side="before" /> : <NoSnapshotSlot />)}
      renderAfter={(slot) => <BoardMock slot={slot} side="after" />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/**
 * **Zach's screenshot, exactly.** A brand-new board: the probe found no
 * `.vN` sibling, so HISTORY holds one row — the live board, badged `after`
 * and not pickable — the before pane says "No snapshot loaded.", the amber
 * notice names the convention, and both detail empty states are on screen
 * at once.
 *
 * This is the state Zach will see on day one, because the
 * `<name>.v1.systemsketch` convention means a board usually has no prior
 * version.
 */
export const NoPriorVersions: Story = {
  render: () => <Harness read={BARE} />,
  play: async () => {
    const modal = await body().findByRole("dialog");
    await expect(modal).toHaveAttribute("data-testid", "compare-dialog");
    await expect(within(modal).getByText("Compare changes")).toBeInTheDocument();

    // The rail: one entry, marked as the fixed `after` endpoint and
    // disabled, because the current board is a status, not a choice.
    await waitFor(() => expect(body().getByTestId("compare-history-row-current")).toBeInTheDocument());
    await expect(body().getByTestId("compare-history-row-current")).toHaveAttribute("data-current", "true");
    await expect(body().getByTestId("compare-history-pick-current")).toBeDisabled();
    await expect(within(modal).getByText(/Titles are measured by diffing the files/)).toBeInTheDocument();
    await expect(within(modal).getByText(/SystemSketch records no author/)).toBeInTheDocument();

    // The three empty states of the screenshot.
    await expect(body().getByTestId("compare-no-snapshot")).toHaveTextContent("No snapshot loaded.");
    await expect(body().getByTestId("compare-problem")).toHaveTextContent(
      "No prior versions found beside this board. Save a `<name>.v1.systemsketch` next to it to compare against.",
    );
    await expect(body().getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
    await expect(body().getByTestId("compare-figma-empty")).toHaveTextContent("Select an edited element to compare changes");

    // No comparison → no tally badges. A "0 added" chip over a board
    // nothing has been compared against would be a measurement nobody made.
    await expect(body().queryByTestId("compare-summary")).not.toBeInTheDocument();

    // Both panes are headed, and the after pane is always the live board.
    await expect(within(modal).getByText("Previous version")).toBeInTheDocument();
    await expect(within(modal).getByText("Current version", { selector: "figcaption" })).toBeInTheDocument();
  },
};

/**
 * Picking an entry sets it as **before** — the rail's own footer sentence,
 * driven. The current board stays `after` and stays unpickable, so the two
 * endpoints can never both be files.
 */
export const SelectingAVersionSetsItAsBefore: Story = {
  render: () => <Harness read={WITH_V1} />,
  play: async () => {
    await body().findByRole("dialog");
    await waitFor(() => expect(body().getByTestId("compare-history-pick-v1")).toBeInTheDocument());

    // Before: nothing picked, so nothing has been compared.
    await expect(body().getByTestId("compare-no-snapshot")).toBeInTheDocument();
    await expect(body().queryByTestId("compare-summary")).not.toBeInTheDocument();
    await expect(body().getByTestId("compare-history-pick-v1")).not.toHaveAttribute("aria-current", "true");

    await userEvent.click(body().getByTestId("compare-history-pick-v1"));

    // After: v1 is `before`, its title heads the left pane, and the
    // titlebar reports the measured tally.
    await waitFor(() => expect(body().getByTestId("compare-history-pick-v1")).toHaveAttribute("aria-current", "true"));
    await expect(body().getByTestId("board-slot-before")).toBeInTheDocument();
    await expect(body().queryByTestId("compare-no-snapshot")).not.toBeInTheDocument();
    // Two additions (a new Block AND a new port on an existing one), one
    // deletion, two modifications — every subject's count summed, which is
    // what `tallyOf` exists to do.
    await expect(body().getByTestId("compare-badge-added")).toHaveTextContent("2 added");
    await expect(body().getByTestId("compare-badge-removed")).toHaveTextContent("1 removed");
    await expect(body().getByTestId("compare-badge-modified")).toHaveTextContent("2 modified");

    // The live board is still the `after` endpoint and still refuses to be
    // picked as `before`.
    await expect(body().getByTestId("compare-history-pick-current")).toBeDisabled();
    await expect(body().getByTestId("compare-history-pick-current")).not.toHaveAttribute("aria-current", "true");
  },
};

/** Two versions that turn out to be the same file: a real `total: 0`. */
export const IdenticalVersions: Story = {
  render: () => <Harness read={WITH_V1} comparisonWhenPicked={IDENTICAL} />,
  play: async () => {
    await body().findByRole("dialog");
    await waitFor(() => expect(body().getByTestId("compare-history-pick-v1")).toBeInTheDocument());
    await userEvent.click(body().getByTestId("compare-history-pick-v1"));

    await waitFor(() => expect(body().getByTestId("compare-summary")).toBeInTheDocument());
    await expect(body().getByTestId("compare-badge-added")).toHaveTextContent("0 added");
    await expect(body().getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
    // The convention notice is gone: a prior version WAS found, it simply
    // matched.
    await expect(body().queryByTestId("compare-problem")).not.toBeInTheDocument();
  },
};

/**
 * "Select an edited element to compare changes" → an element's rows, and
 * back. The By element layout is the default, the way the screenshot shows
 * it.
 */
export const SelectAnEditedElement: Story = {
  render: () => <Harness read={WITH_V1} initialVersionId="v1" />,
  play: async () => {
    await body().findByRole("dialog");
    await waitFor(() => expect(body().getByTestId("compare-figma-layout")).toBeInTheDocument());
    await expect(body().getByTestId("compare-figma-empty")).toHaveTextContent("Select an edited element to compare changes");

    await userEvent.click(body().getByTestId(PREDICT_ELEMENT_TESTID));
    await waitFor(() => expect(body().getByTestId(PREDICT_ELEMENT_TESTID)).toHaveAttribute("data-selected", "true"));
    await expect(body().queryByTestId("compare-figma-empty")).not.toBeInTheDocument();
    await expect(body().getByTestId("compare-property-table")).toHaveAttribute("data-layout", "figma");
  },
};

/** The detail rail's tab strip: Properties ↔ Code, and back. */
export const PropertiesAndCode: Story = {
  render: () => <Harness read={WITH_V1} initialVersionId="v1" />,
  play: async () => {
    await body().findByRole("dialog");
    await waitFor(() => expect(body().getByTestId(PREDICT_ELEMENT_TESTID)).toBeInTheDocument());
    // The Code tab reads ONE CHANGE's raw record, and selecting an element
    // is not selecting a change — so a row has to be picked, not just the
    // element it sits under. Doing it by clicking (rather than seeding
    // `selectedChangeId`) is also what proves the dialog's uncontrolled
    // fallback for that prop actually reaches the review.
    await userEvent.click(body().getByTestId(PREDICT_ELEMENT_TESTID));
    await expect(body().getByTestId("compare-property-table")).toBeInTheDocument();
    const row = document.querySelector<HTMLElement>('[data-testid^="compare-row-"]');
    await expect(row).not.toBeNull();
    await userEvent.click(row!);

    await userEvent.click(body().getByTestId("compare-tab-code"));
    await waitFor(() => expect(body().getByTestId("compare-code-view")).toBeInTheDocument());
    await expect(body().queryByTestId("compare-property-table")).not.toBeInTheDocument();

    await userEvent.click(body().getByTestId("compare-tab-properties"));
    await waitFor(() => expect(body().getByTestId("compare-property-table")).toBeInTheDocument());
    await expect(body().queryByTestId("compare-code-view")).not.toBeInTheDocument();
  },
};

/**
 * The two detail-rail controls from the screenshot: the **Word-level diff
 * highlighting** checkbox (captioned "off · like Figma") and the **By
 * element | Flat table** switch.
 */
export const HighlightingAndLayout: Story = {
  render: () => <Harness read={WITH_V1} initialVersionId="v1" />,
  play: async () => {
    await body().findByRole("dialog");
    await waitFor(() => expect(body().getByTestId("compare-highlight-checkbox")).toBeInTheDocument());

    const checkbox = body().getByTestId("compare-highlight-checkbox");
    await expect(checkbox).not.toBeChecked();
    await expect(body().getByTestId("compare-highlight-toggle")).toHaveTextContent("off · like Figma");
    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());

    // By element is the default; Flat table is the other half of the same
    // switch, and the highlight setting survives the flip.
    await expect(body().getByTestId("compare-figma-layout")).toBeInTheDocument();
    await userEvent.click(body().getByTestId("compare-layout-columns"));
    await waitFor(() => expect(body().getByTestId("compare-property-table")).toHaveAttribute("data-layout", "columns"));
    await expect(body().queryByTestId("compare-figma-layout")).not.toBeInTheDocument();
    await expect(body().getByTestId("compare-highlight-checkbox")).toBeChecked();

    await userEvent.click(body().getByTestId("compare-layout-figma"));
    await waitFor(() => expect(body().getByTestId("compare-figma-layout")).toBeInTheDocument());
  },
};

/**
 * The bottom bar: **Side by side | Overlay**, and **Fullscreen**. Overlay
 * adds the blend slider that side-by-side has nothing to use.
 */
export const SideBySideOverlayAndFullscreen: Story = {
  render: () => <Harness read={WITH_V1} initialVersionId="v1" />,
  play: async () => {
    const modal = await body().findByRole("dialog");
    await expect(body().getByTestId("compare-mode-side-by-side")).toHaveAttribute("data-pressed");
    await expect(body().queryByTestId("compare-blend")).not.toBeInTheDocument();

    await userEvent.click(body().getByTestId("compare-mode-overlay"));
    await waitFor(() => expect(body().getByTestId("compare-mode-overlay")).toHaveAttribute("data-pressed"));
    await expect(body().getByTestId("compare-blend")).toBeInTheDocument();

    await userEvent.click(body().getByTestId("compare-mode-side-by-side"));
    await waitFor(() => expect(body().queryByTestId("compare-blend")).not.toBeInTheDocument());

    // Fullscreen is the dialog's own state — no host prop was passed, so
    // this is the uncontrolled fallback doing its job.
    await expect(modal).not.toHaveAttribute("data-fullscreen");
    await userEvent.click(body().getByTestId("compare-expand"));
    await waitFor(() => expect(dialog()).toHaveAttribute("data-fullscreen", "true"));
    await userEvent.click(body().getByTestId("compare-collapse"));
    await waitFor(() => expect(dialog()).not.toHaveAttribute("data-fullscreen"));
  },
};

/**
 * Escape unwinds ONE layer at a time (donor `CompareDialog.tsx:666-676`):
 * from fullscreen it restores the chrome, and only the second press closes
 * the modal. A reviewer who got to fullscreen deliberately does not lose a
 * selection and a camera to one keystroke.
 */
export const EscapeUnwindsOneLayer: Story = {
  render: function EscapeStory() {
    const [closed, setClosed] = useState(false);
    return (
      <>
        <p data-testid="closed-flag">{closed ? "closed" : "open"}</p>
        <Harness read={WITH_V1} initialVersionId="v1" onOpenChange={(open) => setClosed(!open)} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    await body().findByRole("dialog");
    await userEvent.click(body().getByTestId("compare-expand"));
    await waitFor(() => expect(dialog()).toHaveAttribute("data-fullscreen", "true"));

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog()).not.toHaveAttribute("data-fullscreen"));
    await expect(dialog()).toBeInTheDocument();
    await expect(within(canvasElement).getByTestId("closed-flag")).toHaveTextContent("open");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(within(canvasElement).getByTestId("closed-flag")).toHaveTextContent("closed"));
  },
};

/**
 * The close button. A plain review closes and applies nothing — this modal
 * is a lens, not a transaction, unless a host hands it an `action`.
 */
export const CloseReturnsToTheBoard: Story = {
  render: function CloseStory() {
    const [closed, setClosed] = useState(false);
    return (
      <>
        <p data-testid="closed-flag">{closed ? "closed" : "open"}</p>
        <Harness read={BARE} onOpenChange={(open) => setClosed(!open)} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    await body().findByRole("dialog");
    await userEvent.click(body().getByTestId("compare-close"));
    await waitFor(() => expect(within(canvasElement).getByTestId("closed-flag")).toHaveTextContent("closed"));
    await waitFor(() => expect(dialog()).toBeNull());
  },
};

/**
 * With an `action`, the same modal is titled by the verb that opened it —
 * IcePanel's rule, kept from the donor (`CompareDialog.tsx:684-687`): the
 * heading is the only thing telling a reviewer whether this window is going
 * to DO something when they are two clicks deep into a diff.
 */
export const TitledByItsVerb: Story = {
  render: function ActionStory() {
    const [open, setOpen] = useState(true);
    return (
      <CompareDialog
        open={open}
        onOpenChange={setOpen}
        comparison={CHANGED}
        versions={versionRecords(
          [
            { id: "v1", label: "Version 1", note: "pipeline.v1.systemsketch", path: "/p.v1.systemsketch", isCurrent: false },
            { id: "current", label: "Current version", note: "pipeline.systemsketch", path: BOARD_PATH, isCurrent: true },
          ],
          { titleOf: (version) => (version.isCurrent ? "Current version" : `${CHANGED.total} changes`) },
        )}
        selectedVersionId="v1"
        action={{
          label: "Merge",
          confirmLabel: (count) => `Merge ${count} ${count === 1 ? "change" : "changes"}`,
          onConfirm: async () => ({ ok: true }),
        }}
        renderBefore={(slot) => <BoardMock slot={slot} side="before" />}
        renderAfter={(slot) => <BoardMock slot={slot} side="after" />}
      />
    );
  },
  play: async () => {
    const modal = await body().findByRole("dialog");
    await expect(within(modal).getByText("Merge changes")).toBeInTheDocument();
    await expect(within(modal).queryByText("Compare changes")).not.toBeInTheDocument();
    await expect(modal).toHaveAttribute("data-action", "merge");
    await expect(body().getByTestId("compare-action-confirm")).toHaveTextContent(`Merge ${CHANGED.total} changes`);
  },
};
