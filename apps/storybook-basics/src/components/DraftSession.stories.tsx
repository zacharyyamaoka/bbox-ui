// src/components/DraftSession.stories.tsx — the draft view as one working
// surface: `BranchChip` and `DraftBar` (already in this kit) driven by the
// real `draftModel` reducers and the real `draftChanges` merge gate.
//
// WHY this story exists beside ChromeBar.stories.tsx's `BranchChip*` group
// and DraftBar.stories.tsx: those prove each component against hand-written
// props, which is the right way to story a controlled component and says
// nothing about whether the STATE MACHINE behind it produces those props.
// This one wires the two halves together — clicking "New draft" really runs
// `createDraft`, Exit really runs `activateDraft(state, null)`, Merge really
// runs `mergeDraft` — so a change that breaks the seam between the model and
// the chrome fails here rather than in the app.
//
// The `DraftSession` harness below is deliberately a STORY, not a kit
// export: it is the host recipe (docs/menus/MENU-KIT-DESIGN.md §7,
// "Persistence of any kind … storage is a documented host-adapter recipe").
// `apps/systemsketch` writes the same ~60 lines against `window.localStorage`
// and a real serialized board; this writes them against a `Map` and a
// three-record stub, which is what lets the whole journey run headless.
import { useCallback, useMemo, useState } from "react";
import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { BranchChip } from "./branchChip";
import { DraftBar, type MenuAction } from "./draftBar";
import { hasUnpromotedEdits, resolveMergeGate } from "./draftChanges";
import {
  MAIN_SNAPSHOT_SLOT,
  activateDraft,
  activeDraftOf,
  createDraft,
  currentVersionLabel,
  deleteDraftSnapshot,
  discardDraft,
  draftBaseSlot,
  draftSummaries,
  EMPTY_DRAFT_STATE,
  mergeDraft,
  nextDraftName,
  readDraftSnapshot,
  renameDraft,
  snapshotDigest,
  writeDraftSnapshot,
  type DocumentDraftState,
  type DraftStorage,
} from "./draftModel";

const DOC = "/boards/pose_pipeline.systemsketch";

// ---------------------------------------------------------------------------
// The host's two jobs, stubbed: somewhere to keep bytes, and a board to edit.
// ---------------------------------------------------------------------------

function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

interface StubRecord {
  id: string;
  x: number;
  y: number;
  props: { title: string };
}

const INITIAL_BOARD: StubRecord[] = [
  { id: "shape:detect", x: 0, y: 0, props: { title: "detect" } },
  { id: "shape:grasp", x: 200, y: 0, props: { title: "grasp" } },
];

const serialize = (records: StubRecord[]) => JSON.stringify({ records });
const parse = (source: string | null): StubRecord[] => {
  if (!source) return [];
  try {
    return (JSON.parse(source) as { records?: StubRecord[] }).records ?? [];
  } catch {
    return [];
  }
};

/**
 * The host's change COUNT — the number behind "Compare N Changes".
 *
 * WHY this stub diffs `props` and deliberately ignores `x`/`y`: that is the
 * shape of the real engine (`components/compareModel.ts`, which only diffs
 * the fields in `BLOCK_COMPARE_FIELDS`/`PORT_COMPARE_FIELDS`/
 * `CABLE_COMPARE_FIELDS` — all inside `props`), and reproducing that blind
 * spot honestly is what makes `PureMoveStaysMergeable` below a real
 * regression test rather than a staged one. A real host calls
 * `compareBoards(before, after).total` and never writes this function; this
 * story does not import it, so the Compare lane owns that file alone.
 */
function changeCount(before: string | null, after: string | null): number {
  const a = new Map(parse(before).map((r) => [r.id, r]));
  const b = new Map(parse(after).map((r) => [r.id, r]));
  let total = 0;
  for (const [id, record] of b) {
    const prev = a.get(id);
    if (!prev) total++;
    else if (JSON.stringify(prev.props) !== JSON.stringify(record.props)) total++;
  }
  for (const id of a.keys()) if (!b.has(id)) total++;
  return total;
}

// ---------------------------------------------------------------------------
// The harness — the ~60 lines a host writes to join the model to the chrome.
// ---------------------------------------------------------------------------

function DraftSession({
  /** Extra records on Main, written AFTER the draft forks — the story's way
   *  of saying "someone else pushed to Main while you were drafting". */
  driftMainOnMount = false,
  /** A `--primary` override for `ThemedLikeTheDonor` below. */
  accent,
}: {
  driftMainOnMount?: boolean;
  accent?: string;
}) {
  const storage = useMemo(() => {
    const store = memoryStorage();
    writeDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, serialize(INITIAL_BOARD), store);
    return store;
  }, []);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [state, setState] = useState<DocumentDraftState>(EMPTY_DRAFT_STATE);
  // Bumped whenever a snapshot slot is rewritten, so the derived numbers
  // below recompute. A real host re-reads on the editor's own change events.
  const [revision, setRevision] = useState(0);

  const active = activeDraftOf(state);

  const onCreate = useCallback(() => {
    const mainSource = readDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, storage);
    const next = createDraft(
      state,
      nextDraftName(state),
      currentVersionLabel(state),
      snapshotDigest(mainSource),
    );
    // Fork: the draft's immutable base AND its live head both start as Main.
    writeDraftSnapshot(DOC, draftBaseSlot(next.draft.id), mainSource ?? "", storage);
    writeDraftSnapshot(DOC, next.draft.id, mainSource ?? "", storage);
    if (driftMainOnMount) {
      writeDraftSnapshot(
        DOC,
        MAIN_SNAPSHOT_SLOT,
        serialize([...INITIAL_BOARD, { id: "shape:log", x: 400, y: 0, props: { title: "log" } }]),
        storage,
      );
    }
    setState(next.state);
    setRevision((r) => r + 1);
  }, [state, storage, driftMainOnMount]);

  const editDraft = useCallback(
    (edit: (records: StubRecord[]) => StubRecord[]) => {
      if (!active) return;
      const head = parse(readDraftSnapshot(DOC, active.id, storage));
      writeDraftSnapshot(DOC, active.id, serialize(edit(head)), storage);
      setRevision((r) => r + 1);
    },
    [active, storage],
  );

  const mainSource = readDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, storage);
  const baseSource = active ? readDraftSnapshot(DOC, draftBaseSlot(active.id), storage) : null;
  const headSource = active ? readDraftSnapshot(DOC, active.id, storage) : null;
  void revision;

  // The two measured facts the gate takes. `mainDrift` is the SHAPE-level
  // question ("re-serializing an unchanged Main is not a conflict"); the
  // stub `changeCount` stands in for the real engine here too.
  const gate = resolveMergeGate({
    hasUnpromotedEdits: hasUnpromotedEdits(baseSource, headSource),
    mainDrift: active ? changeCount(baseSource, mainSource) : null,
  });

  const overflowItems: MenuAction[] = active
    ? [
        {
          id: "discard",
          label: "Discard draft",
          destructive: true,
          run: () => {
            deleteDraftSnapshot(DOC, active.id, storage);
            deleteDraftSnapshot(DOC, draftBaseSlot(active.id), storage);
            setState(discardDraft(state, active.id));
          },
        },
      ]
    : [];

  return (
    <div
      // A callback ref, not `useRef`: `BranchChip`'s popover portals its
      // content out of this tree, and `container` has to be a real element
      // on the render that mounts the popup — a `useRef` still reads null
      // then. Passing it is what keeps the portaled popover inside this
      // wrapper's CSS-variable scope, which is the whole point of `accent`.
      ref={setRoot}
      className="flex w-[880px] flex-col gap-3"
      style={accent ? ({ "--primary": accent } as React.CSSProperties) : undefined}
    >
      {active ? (
        <DraftBar
          draftName={active.name}
          onExit={() => setState(activateDraft(state, null))}
          rename={{ onCommit: (next) => setState(renameDraft(state, active.id, next)) }}
          overflowItems={overflowItems}
          conflict={gate.conflict}
          changeCount={changeCount(mainSource, headSource)}
          onCompare={() => {}}
          canMerge={gate.canMerge}
          mergeState={gate.mergeState}
          onMerge={() => {
            writeDraftSnapshot(DOC, MAIN_SNAPSHOT_SLOT, headSource ?? "", storage);
            setState(mergeDraft(state, active.id));
            setRevision((r) => r + 1);
          }}
          mergeMenuItems={[{ id: "rebase", label: "Rebase on Main", onSelect: () => {} }]}
          className="rounded-md border"
        />
      ) : null}

      <div className="flex items-center gap-3 rounded-full border px-3 py-1.5">
        <span className="text-sm font-medium">pose_pipeline</span>
        <BranchChip
          isDraftMode={active !== null}
          draftCount={state.drafts.length}
          activeDraftName={active?.name ?? null}
          drafts={draftSummaries(state)}
          activeDraftId={state.activeDraftId}
          onSwitchTo={(id) => setState(activateDraft(state, id))}
          onCreate={onCreate}
          onRename={(id, name) => setState(renameDraft(state, id, name))}
          onDiscard={(id) => setState(discardDraft(state, id))}
          container={root}
        />
      </div>

      {/* The "editor" — a host's real canvas; here, two buttons. */}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="stub-add-block"
          disabled={!active}
          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
          onClick={() =>
            editDraft((records) => [
              ...records,
              { id: `shape:new-${records.length}`, x: 0, y: 200, props: { title: "retry" } },
            ])
          }
        >
          Add a block
        </button>
        <button
          type="button"
          data-testid="stub-move-block"
          disabled={!active}
          className="rounded border px-2 py-1 text-xs disabled:opacity-40"
          onClick={() =>
            editDraft((records) =>
              records.map((r) => (r.id === "shape:grasp" ? { ...r, x: r.x + 40 } : r)),
            )
          }
        >
          Move a block
        </button>
      </div>
    </div>
  );
}

const meta = {
  title: "Basics/DraftSession",
  tags: ["area:basics", "lane:draft-compare-2026-09-19"],
  component: DraftSession,
  parameters: { layout: "centered" },
} satisfies Meta<typeof DraftSession>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `BranchChip`'s popover portals to `document.body`, so every popup
 *  assertion below reads from there rather than from `canvasElement` — the
 *  same correction ChromeBar.stories.tsx records on its own New-draft story. */
const popup = () => within(document.body);

/**
 * Screenshot 05: on Main, nothing forked yet. The chip reads "Main", carries
 * no count badge, and its popover offers Main (current) plus "New draft".
 */
export const MainWithNoDrafts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole("button", { name: "Drafts · Main" });
    await expect(trigger).not.toHaveAttribute("data-active");
    await expect(trigger).toHaveTextContent("Main");

    await userEvent.click(trigger);
    const mainRow = await popup().findByTestId("branch-chip-select-main");
    await expect(mainRow).toHaveAttribute("data-current");
    await expect(popup().getByTestId("branch-chip-new-draft")).toBeInTheDocument();
    // No draft exists, so no draft row and no bar.
    await expect(canvas.queryByTestId("draft-bar")).not.toBeInTheDocument();
  },
};

/**
 * Screenshot 09: "New draft" runs the real `createDraft`, so the chip
 * becomes "Draft 1" with a `1` badge and the outlined draft-mode treatment,
 * and the draft bar appears reading "Compare 0 Changes" with Merge disabled
 * — nothing has been edited yet.
 */
export const CreateADraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    await userEvent.click(await popup().findByTestId("branch-chip-new-draft"));

    const trigger = await canvas.findByRole("button", { name: "Draft Draft 1" });
    await expect(trigger).toHaveAttribute("data-active");
    await expect(trigger).toHaveTextContent("Draft 1");
    await expect(trigger).toHaveTextContent("1");

    await expect(canvas.getByText("Compare 0 Changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeDisabled();
  },
};

/**
 * The full round trip: fork, edit, merge. One real edit takes the bar to
 * "Compare 1 Change" and enables Merge; merging runs `mergeDraft`, which
 * drops the draft, clears the active id and pins a version — so the chip
 * falls back to "Main" with no badge and the bar disappears.
 */
export const EditThenMerge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    await userEvent.click(await popup().findByTestId("branch-chip-new-draft"));

    await userEvent.click(await canvas.findByTestId("stub-add-block"));
    await expect(await canvas.findByText("Compare 1 Change")).toBeInTheDocument();

    const merge = canvas.getByRole("button", { name: "Merge" });
    await expect(merge).toBeEnabled();
    await userEvent.click(merge);

    const backOnMain = await canvas.findByRole("button", { name: "Drafts · Main" });
    await expect(backOnMain).not.toHaveAttribute("data-active");
    await expect(backOnMain).not.toHaveTextContent("Draft 1");
    await expect(canvas.queryByText(/Compare \d+ Change/)).not.toBeInTheDocument();
  },
};

/**
 * The rejected alternative, made visible: a draft whose only edit is a MOVE
 * reports "Compare 0 Changes" — the diff engine structurally cannot see
 * x/y — and Merge is still enabled, because the gate reads
 * `hasUnpromotedEdits` (a digest) and never the change count.
 */
export const PureMoveStaysMergeable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    await userEvent.click(await popup().findByTestId("branch-chip-new-draft"));

    await userEvent.click(await canvas.findByTestId("stub-move-block"));
    await expect(await canvas.findByText("Compare 0 Changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeEnabled();
  },
};

/**
 * Main moved under the draft. The bar shows the advisory banner and Merge
 * takes the `blocked` look — greyed primary, live chevron — rather than
 * being disabled, because the chevron is what opens Rebase.
 */
export const MainMovedUnderTheDraft: Story = {
  args: { driftMainOnMount: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    await userEvent.click(await popup().findByTestId("branch-chip-new-draft"));
    await userEvent.click(await canvas.findByTestId("stub-add-block"));

    await expect(
      await canvas.findByText("Main changed since this draft — review before merging"),
    ).toBeInTheDocument();
    const merge = canvas.getByRole("button", { name: "Merge" });
    await expect(merge).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Merge options" })).toBeEnabled();
  },
};

/**
 * Exit is not discard. Leaving a draft returns to Main with the draft still
 * on the list (chip badge `1`), and picking it out of the popover resumes
 * it — the donor's "one path for both", `activateDraft(state, id | null)`.
 */
export const ExitAndResume: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    await userEvent.click(await popup().findByTestId("branch-chip-new-draft"));
    await userEvent.click(await canvas.findByRole("button", { name: /Exit/ }));

    const onMain = await canvas.findByRole("button", { name: "Drafts · Main" });
    await expect(onMain).toHaveTextContent("1");
    await expect(canvas.queryByText(/Compare \d+ Change/)).not.toBeInTheDocument();

    await userEvent.click(onMain);
    // The unpinned fork honestly says so instead of inventing "based on v0.1".
    await expect(await popup().findByText("Forked from Main")).toBeInTheDocument();
    await userEvent.click(popup().getByRole("button", { name: "Draft 1, Forked from Main" }));

    await expect(await canvas.findByRole("button", { name: "Draft Draft 1" })).toHaveAttribute(
      "data-active",
    );
    await expect(canvas.getByText("Compare 0 Changes")).toBeInTheDocument();
  },
};

/**
 * The same surface under the donor app's own accent, and the reason nothing
 * in `branchChip.tsx` names a colour.
 *
 * In Zach's reference capture the current row's dot and edge bar are BLUE.
 * This trunk's stock theme (`globals.css`) is fully neutral — every token is
 * chroma 0 — so the identical component paints them near-white here. That is
 * not a porting gap: `branchChip.tsx`'s own WHY already commits to it
 * ("draft-mode-active is DATA, the pixels are the theme's"), and hardcoding
 * a blue would be inventing a colour outside the token system, which is
 * exactly what `draftBar.tsx`'s ConflictBanner comment agonises over
 * avoiding. This story sets ONE variable — `--primary` to
 * `hsl(217 89% 61%)`, the archived app's own `--ss-accent`
 * (/home/bam/systemsketch/src/theme/tokens.css:311) — and reproduces the
 * reference exactly.
 *
 * The assertion is MEASURED off the painted element, not read from the DOM:
 * a `data-slot` being present would pass against a dot painted any colour at
 * all, including the neutral one this story exists to distinguish from.
 */
export const ThemedLikeTheDonor: Story = {
  args: { accent: "hsl(217 89% 61%)" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Drafts · Main" }));
    const mainRow = await popup().findByTestId("branch-chip-select-main");

    const dot = mainRow.querySelector('[data-slot="branch-chip-current-dot"]');
    const bar = mainRow.querySelector('[data-slot="branch-chip-current-bar"]');
    await expect(dot).not.toBeNull();
    await expect(bar).not.toBeNull();

    const painted = getComputedStyle(dot as Element).backgroundColor;
    // Both marks take the colour from the one variable; neither names a
    // colour of its own, so they must agree exactly.
    await expect(getComputedStyle(bar as Element).backgroundColor).toBe(painted);

    // WHY blue-dominance rather than a golden RGB string: a golden would
    // have to be either predicted (fabrication) or pasted from a run, and it
    // would then break on any accent change while proving nothing extra.
    // THIS assertion is the one that cannot pass on the stock theme, which
    // is the whole claim — every token in globals.css is chroma 0, so a
    // neutral dot has r === g === b and no amount of lightness gets it here.
    const [r, g, b] = (painted.match(/\d+/g) ?? []).map(Number);
    await expect(b).toBeGreaterThan(r + 40);
    await expect(b).toBeGreaterThan(g + 40);
  },
};
