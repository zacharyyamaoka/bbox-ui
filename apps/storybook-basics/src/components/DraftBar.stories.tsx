import { useState } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { DraftBar, type MenuAction } from "../components/draftBar";

/**
 * The draft-mode title bar
 * (docs/menus/screenshots/09-draft-title-bar.png: "← Exit | Draft 1 | ···"
 * on the left, "Compare 0 Changes" and a split "Merge ▾" on the right).
 * Ported from `/home/bam/systemsketch/src/drafts/DraftModeBar.tsx`,
 * composed from this kit's own `Bar`, `SplitButton` and `InlineRename`.
 *
 * The Compare/Merge/Rebase orchestration (opening a diff dialog, computing
 * a rebase preview, the 5s status expiry) is host code and doesn't exist
 * here — every story below wires plain `fn()` callbacks, the way a real
 * host would wire its own.
 */
const discardItem: MenuAction = {
  id: "discard",
  label: "Discard draft",
  destructive: true,
  run: fn(),
};

const rebaseItem = { id: "rebase", label: "Rebase", onSelect: fn() };

const meta = {
  title: "Basics/DraftBar",
  component: DraftBar,
  args: {
    draftName: "Draft 1",
    onExit: fn(),
    rename: { onCommit: fn() },
    overflowItems: [discardItem],
    changeCount: 0,
    onCompare: fn(),
    canMerge: false,
    onMerge: fn(),
    mergeMenuItems: [rebaseItem],
  },
} satisfies Meta<typeof DraftBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Screenshot 09 verbatim: a brand-new draft, nothing changed yet — Compare
 * reads "0 Changes" and Merge is disabled (`canMerge: false`, nothing to
 * merge yet).
 */
export const ZeroChanges: Story = {
  args: { draftName: "Draft 1", changeCount: 0, canMerge: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Compare 0 Changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeDisabled();
  },
};

/** A handful of real edits — Merge lights up. */
export const SomeChanges: Story = {
  args: { draftName: "Draft 2", changeCount: 3, canMerge: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Compare 3 Changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeEnabled();
  },
};

/** A long editing session's worth of changes — the count itself never clamps. */
export const ManyChanges: Story = {
  args: { draftName: "Pose pipeline rework", changeCount: 128, canMerge: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Compare 128 Changes")).toBeInTheDocument();
  },
};

/**
 * `canMerge` and `changeCount` are DELIBERATELY independent props
 * (docs/menus/MENU-KIT-DESIGN.md §3.3, `draftBar.tsx`'s own WHY): a draft
 * that's purely a MOVE has no display-diff rows the compare engine can
 * show, and is still perfectly mergeable. This story is the proof — zero
 * changes, Merge still enabled.
 */
export const PureMoveStillMergeable: Story = {
  args: { draftName: "Draft 3", changeCount: 0, canMerge: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Compare 0 Changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeEnabled();
  },
};

/**
 * `hasConflict` in the donor (ported here as `mergeState="blocked"` +
 * `conflict`) is a LOOK, not a lock — the primary Merge segment stays
 * genuinely clickable (see `SplitButton`'s own `Blocked` story); this just
 * points the eye at Rebase, behind the chevron, as the way forward.
 */
export const Blocked: Story = {
  args: {
    draftName: "Draft 1",
    changeCount: 2,
    canMerge: true,
    mergeState: "blocked",
    conflict: "Main changed since this draft — review before merging",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const merge = canvas.getByRole("button", { name: "Merge" });
    await expect(merge).toBeEnabled();
    await expect(merge.className).toContain("bg-secondary");
  },
};

/**
 * The conflict banner truncates to one line — ported (drafts.css:516-548):
 * an un-truncated banner used to push the Merge▾ chevron off-screen at
 * ordinary widths. The full, UNALTERED string is still on `title` —
 * truthful rendering, not a substring.
 */
export const LongConflictText: Story = {
  args: {
    draftName: "Draft 1",
    changeCount: 5,
    canMerge: true,
    mergeState: "blocked",
    conflict:
      "Main changed since this draft was created — three of the ports you rewired were also renamed upstream, review carefully before merging",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByTitle(
      "Main changed since this draft was created — three of the ports you rewired were also renamed upstream, review carefully before merging",
    );
    await expect(banner).toBeInTheDocument();
  },
};

function RenameDemo() {
  const [name, setName] = useState("Draft 1");
  return (
    <DraftBar
      draftName={name}
      onExit={fn()}
      rename={{ onCommit: setName }}
      overflowItems={[discardItem]}
      changeCount={0}
      onCompare={fn()}
      canMerge={false}
      onMerge={fn()}
      mergeMenuItems={[rebaseItem]}
    />
  );
}

/**
 * Click the name to open `InlineRename` in its place — same
 * Enter-commits/Escape-cancels/blur-commits contract as
 * `InlineRename.stories.tsx`, plus focus returning to the (re-mounted)
 * name trigger once the field closes (ported, DraftModeBar.tsx
 * `commitRename`/`cancelRename`).
 */
export const RenameInProgress: Story = {
  render: () => <RenameDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Draft 1. Click to rename." }),
    );

    const input = await canvas.findByRole("textbox", { name: "Rename draft" });
    await expect(input).toHaveFocus();

    await userEvent.clear(input);
    await userEvent.type(input, "Renamed draft{Enter}");

    const trigger = await canvas.findByRole("button", {
      name: "Renamed draft. Click to rename.",
    });
    await expect(trigger).toHaveFocus();
  },
};

/**
 * A name long enough to need eliding. Purely visual (CSS `truncate`) — the
 * full, untouched string still renders and is still what `title` carries;
 * nothing about the characters themselves is dropped or substituted.
 */
const LONG_NAME =
  "series_a_pose_pipeline_v7_reprocessed_with_new_calibration_and_extra_metadata";

export const LongDraftName: Story = {
  args: { draftName: LONG_NAME, changeCount: 12, canMerge: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTitle(LONG_NAME);
    await expect(trigger).toBeInTheDocument();
    await expect(trigger.textContent).toBe(LONG_NAME);
  },
};

/** A self-clearing status line (a Rebase result, mostly) — controlled; the
 *  5s auto-expiry is the host's timer, not this component's. */
export const WithStatus: Story = {
  args: {
    draftName: "Draft 1",
    changeCount: 0,
    canMerge: false,
    status: "Rebased onto the latest Main.",
  },
};

/** The "···" overflow menu — Discard lives here as a host-supplied slot,
 *  never hardcoded. */
export const OverflowMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Draft options" }),
    );
    const discard = await body.findByText("Discard draft");
    await expect(discard).toBeInTheDocument();

    await userEvent.click(discard);
    await waitFor(() => {
      expect(
        document.body.querySelector('[data-slot="dropdown-menu-content"]'),
      ).toBeNull();
    });
  },
};

/** Every state the gallery covers, side by side — the comparison a review
 *  actually needs, not one story per state read in isolation. */
export const AllStates: Story = {
  render: () => {
    const rows: {
      label: string;
      props: Partial<ComponentProps<typeof DraftBar>>;
    }[] = [
      {
        label: "Zero changes (screenshot 09)",
        props: { changeCount: 0, canMerge: false },
      },
      { label: "Some changes", props: { changeCount: 3, canMerge: true } },
      { label: "Many changes", props: { changeCount: 128, canMerge: true } },
      {
        label: "Blocked — conflict since branching",
        props: {
          changeCount: 2,
          canMerge: true,
          mergeState: "blocked",
          conflict: "Main changed since this draft — review before merging",
        },
      },
      {
        label: "Long draft name",
        props: { draftName: LONG_NAME, changeCount: 12, canMerge: true },
      },
    ];

    return (
      <div className="flex w-[840px] flex-col gap-4 rounded-lg border p-3">
        {rows.map(({ label, props }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <DraftBar
              draftName="Draft 1"
              onExit={fn()}
              rename={{ onCommit: fn() }}
              overflowItems={[discardItem]}
              onCompare={fn()}
              onMerge={fn()}
              mergeMenuItems={[rebaseItem]}
              changeCount={0}
              canMerge={false}
              {...props}
            />
          </div>
        ))}
      </div>
    );
  },
};
