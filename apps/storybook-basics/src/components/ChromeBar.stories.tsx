import { useState } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";
import { Copy as CopyIcon, PanelRight } from "lucide-react";

import {
  BranchChip,
  type BranchChipProps,
  type DraftSummary,
} from "./branchChip";
import { Bar } from "./bar";
import { Button } from "./button";
import {
  ChromeBar,
  ChromeBarIcons,
  StatusDot,
  type ChromeBarProps,
  type Crumb,
  type MenuAction,
  type MenuSpec,
} from "./chromeBar";
import { Toolbar, ToolbarButton } from "./toolbar";

/**
 * The top-left chrome bar (docs/menus/screenshots/05-chrome-bar.png, 09's
 * bottom row) plus its draft/branch selector. Ported from
 * `/home/bam/systemsketch/src/chrome/TitleBar.tsx` and
 * `/home/bam/systemsketch/src/drafts/DraftsControl.tsx` — every callback
 * below is a plain `fn()`, the way a real host would wire its own (no
 * router, no history stack, no keybindings: MENU-KIT-DESIGN.md §4's "Chrome
 * bar" host contract).
 */
const fileActions: MenuAction[] = [
  { id: "root", label: "Return to board root", icon: ChromeBarIcons.root, run: fn() },
  { id: "rename", label: "Rename", icon: ChromeBarIcons.rename, shortcut: "F2", run: fn() },
  { id: "save-as", label: "Save As…", icon: ChromeBarIcons.saveAs, run: fn() },
  { id: "copy-path", label: "Copy Absolute Path", icon: ChromeBarIcons.copyPath, run: fn() },
  { id: "reveal", label: "Show in Files", icon: ChromeBarIcons.reveal, run: fn() },
  {
    id: "trash",
    label: "Move to Trash…",
    icon: ChromeBarIcons.trash,
    destructive: true,
    run: fn(),
  },
];

/** The burger's own `MenuSpec` — a nested group to prove `DropdownMenuSub`
 *  composition works even though neither screenshot shows one open (see
 *  `chromeBar.tsx`'s `BurgerMenuEntry` WHY). */
const burgerMenu: MenuSpec = {
  id: "file-settings",
  label: "File and settings",
  groups: [
    {
      id: "file",
      label: "File",
      items: [
        { id: "new", label: "New board", run: fn() },
        { id: "open", label: "Open…", shortcut: "⌘O", run: fn() },
        {
          submenu: {
            id: "export",
            label: "Export as",
            groups: [
              {
                id: "formats",
                items: [
                  { id: "png", label: "PNG", run: fn() },
                  { id: "svg", label: "SVG", run: fn() },
                  { id: "pdf", label: "PDF", run: fn() },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: [
        { id: "preferences", label: "Preferences…", shortcut: "⌘,", run: fn() },
        { id: "keybindings", label: "Keyboard Shortcuts", run: fn() },
      ],
    },
  ],
};

function crumb(id: string, name: string, depth: number, extra?: Partial<Crumb>): Crumb {
  return { id, name, isCurrent: false, canFocus: true, depth, ...extra };
}

const noDrafts: DraftSummary[] = [];

const mainChip: ComponentProps<typeof ChromeBar>["draftChip"] = (
  <BranchChip
    isDraftMode={false}
    draftCount={0}
    activeDraftName={null}
    drafts={noDrafts}
    activeDraftId={null}
    onSwitchTo={fn()}
    onCreate={fn()}
    onRename={fn()}
    onDiscard={fn()}
  />
);

const baseArgs: ChromeBarProps = {
  menu: burgerMenu,
  history: { canGoBack: true, canGoForward: false, onBack: fn(), onForward: fn() },
  identity: { title: "series_a_pose_pipeline_v7", statusTone: "ok", statusLabel: "All changes saved" },
  rename: { active: false, onBegin: fn(), onCommit: fn(), onCancel: fn() },
  crumbs: [],
  depth: 0,
  onReturnToRoot: fn(),
  onJumpToLevel: fn(),
  fileActions,
  draftChip: mainChip,
  testIdPrefix: "chrome-bar",
};

const meta = {
  title: "Basics/ChromeBar",
  component: ChromeBar,
  args: baseArgs,
} satisfies Meta<typeof ChromeBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Screenshot 05 verbatim — at the board root, "Main", depth `0`. */
export const MainBranchAtRoot: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("series_a_pose_pipeline_v7")).toBeInTheDocument();
    await expect(canvas.getByText("Main")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Forward" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeEnabled();
  },
};

/**
 * Screenshot 09's bottom row, plus the page-level right cluster the
 * screenshot also shows (avatar, copy, panel toggle, Share). That cluster is
 * deliberately NOT a `ChromeBar` prop — Zach named exactly four parts for
 * this component (breadcrumb, draft selector, forward/backward, burger file
 * settings) and the avatar/copy/panel/share row is page chrome the HOST
 * composes beside it, the same way `Bar`'s own doc says "Toolbar composes
 * INSIDE a Bar slot, never replaces it". This story proves that composition
 * at the fidelity of the real screenshot without adding scope to the
 * component itself.
 */
function DraftModePageChrome() {
  return (
    <Bar
      size="lg"
      left={
        <ChromeBar
          {...baseArgs}
          rename={{ active: false, onBegin: fn(), onCommit: fn(), onCancel: fn() }}
          draftChip={
            <BranchChip
              isDraftMode
              draftCount={1}
              activeDraftName="Draft 1"
              drafts={[{ id: "d1", name: "Draft 1", secondaryLabel: "based on Main · 2 minutes ago" }]}
              activeDraftId="d1"
              onSwitchTo={fn()}
              onCreate={fn()}
              onRename={fn()}
              onDiscard={fn()}
            />
          }
        />
      }
      right={
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            Z
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Copy link">
            <CopyIcon aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Toggle right panel">
            <PanelRight aria-hidden="true" />
          </Button>
          <Button variant="default" size="sm">
            Share
          </Button>
        </div>
      }
    />
  );
}

export const DraftModeWithPageChrome: Story = {
  render: () => <DraftModePageChrome />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The blue-outlined "Draft 1 (1) ▾" chip.
    const chip = canvas.getByRole("button", { name: "Draft Draft 1" });
    await expect(chip).toHaveAttribute("data-active");
    await expect(canvas.getByText("1")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Share" })).toBeInTheDocument();
  },
};

// WHY these five names in particular (not shorter placeholders): the
// 150-character budget only bites once `pathLength` — the root name plus
// every crumb plus a 3-char separator each — actually exceeds it. Short
// stand-ins ("Frame 12", "Pipeline Group", …) sum to well under the budget
// and `compactDepthBreadcrumbs` returns them UNCOMPACTED, which would make
// this story silently test nothing. These sum, with the root, to 185
// characters — verified against `breadcrumbCompact.ts`'s own `pathLength`,
// run for real, not estimated: the algorithm's loop checks the budget
// BEFORE deleting each candidate, so it stops the instant the remaining set
// already fits — dropping just "Frame 12 — Wide Angle Capture" alone
// already brings the total to 147, under budget, so a first fixture that
// stopped at "Pipeline Group — Preprocessing" (30 chars) left that crumb
// VISIBLE and failed this exact assertion. Padding it to "…Preprocessing
// Stage" (37 chars) pushes the post-first-deletion total back over budget
// (153), so the algorithm removes it too before the third check (114)
// breaks — the algorithm removes "Frame 12 — Wide Angle Capture" and
// "Pipeline Group — Preprocessing Stage" (in that order, from the front)
// before the running total drops back under 150, leaving exactly those two
// behind the `…`.
const deepCrumbs: Crumb[] = [
  crumb("frame-12", "Frame 12 — Wide Angle Capture", 1),
  crumb("pipeline-group", "Pipeline Group — Preprocessing Stage", 2),
  crumb("vision-stack", "Vision Stack — Calibrated Cameras", 3),
  crumb("calibration", "Calibration Targets — ChArUco Board", 4),
  crumb("camera-block", "Camera Block", 5, { isCurrent: true }),
];
const HIDDEN_BY_COMPACTION = ["Frame 12 — Wide Angle Capture", "Pipeline Group — Preprocessing Stage"];
const VISIBLE_AFTER_COMPACTION = ["Vision Stack — Calibrated Cameras", "Calibration Targets — ChArUco Board", "Camera Block"];

/**
 * Five levels deep, well past `compactDepthBreadcrumbs`'s 150-character
 * budget — the root, the current scope, and enough immediate parents
 * survive to stay useful as a location cue; the earliest two collapse
 * behind a real `…` menu (MENU-KIT-DESIGN.md §5: "never dropping the last
 * two", "the `…` is a real menu of hidden levels").
 */
export const DeepPathCompacted: Story = {
  args: { crumbs: deepCrumbs, depth: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    // WHY the FIRST assertion is `findByText` and not `getByText`, while the
    // rest of this play function keeps the synchronous form: `getBy*` demands
    // the element on the very first tick, so a story that has not finished
    // mounting fails instantly — observed 2026-09-18 running both vitest
    // projects together, where CPU contention slowed the render past the
    // first tick and the DOM still held Storybook's `sb-preparing-story`
    // loader. `findBy*` retries instead, and still fails if the text never
    // arrives, so nothing is weakened.
    //
    // It also makes the NEGATIVE loop below sound. `queryByText(...).not
    // .toBeInTheDocument()` passes trivially against an empty DOM, so on an
    // unmounted story the compaction assertions were not merely fragile —
    // they were vacuously true, and would have reported a component that
    // rendered nothing at all as correctly compacted. Awaiting one real
    // element first is what gives every assertion after it something to be
    // false about.
    for (const name of VISIBLE_AFTER_COMPACTION) {
      await expect(await canvas.findByText(name)).toBeInTheDocument();
    }
    for (const name of HIDDEN_BY_COMPACTION) {
      await expect(canvas.queryByText(name)).not.toBeInTheDocument();
    }

    const ellipsis = canvas.getByRole("button", { name: /hidden$/ });
    await userEvent.click(ellipsis);

    // Truthful-rendering guarantee: nothing the `…` hides is unreachable.
    // `findByText`, for the same reason as the first assertion above: the
    // dropdown's content mounts on a later tick than the click, and under
    // the combined-project load (2026-09-18, 1 failure in 1453) `getByText`
    // asked for it before it existed.
    for (const name of HIDDEN_BY_COMPACTION) {
      await expect(await body.findByText(name)).toBeInTheDocument();
    }

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    });
  },
};

/**
 * The trailing depth badge is itself a menu — every level, elided or not,
 * with a `Check` on the current one and its raw depth as the shortcut
 * column (ported, TitleBar.tsx:572-623). Assertions are scoped to the
 * MENU itself (`findByTestId` + `within`), not the whole document — three
 * of these five names are ALSO the live breadcrumb text sitting right next
 * to it, and an unscoped `getByText` would find both and fail as ambiguous.
 */
export const StructuralPathMenu: Story = {
  args: { crumbs: deepCrumbs, depth: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: /structural path/i }));

    const menu = within(await body.findByTestId("chrome-bar-path"));
    await expect(menu.getByText("Structural path · 5 levels")).toBeInTheDocument();
    // Every level is listed, not just the ones the compacted breadcrumb kept.
    for (const name of [...HIDDEN_BY_COMPACTION, ...VISIBLE_AFTER_COMPACTION]) {
      await expect(menu.getByText(name)).toBeInTheDocument();
    }
    await expect(menu.getByRole("menuitem", { name: /Camera Block/ })).toHaveAttribute("aria-current", "page");
  },
};

/** `canGoBack`/`canGoForward` as plain disabled state, all four
 *  combinations side by side — the whole host contract for this control
 *  (MENU-KIT-DESIGN.md §4). */
export const HistoryStates: Story = {
  render: (args) => {
    const rows: { label: string; history: ChromeBarProps["history"] }[] = [
      { label: "At the start of history", history: { canGoBack: false, canGoForward: false, onBack: fn(), onForward: fn() } },
      { label: "Stepped forward once", history: { canGoBack: true, canGoForward: false, onBack: fn(), onForward: fn() } },
      { label: "Stepped back at least once", history: { canGoBack: true, canGoForward: true, onBack: fn(), onForward: fn() } },
      { label: "Jumped straight back to the oldest view", history: { canGoBack: false, canGoForward: true, onBack: fn(), onForward: fn() } },
    ];
    return (
      <div className="flex flex-col gap-4">
        {rows.map(({ label, history }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <ChromeBar {...args} history={history} testIdPrefix={undefined} />
          </div>
        ))}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const backButtons = canvas.getAllByRole("button", { name: "Back" });
    const forwardButtons = canvas.getAllByRole("button", { name: "Forward" });
    await expect(backButtons[0]).toBeDisabled();
    await expect(forwardButtons[0]).toBeDisabled();
    await expect(backButtons[2]).toBeEnabled();
    await expect(forwardButtons[2]).toBeEnabled();
  },
};

/**
 * The file title's own menu (Rename first via the dropdown's own list order,
 * hoisted to first in the CONTEXT menu — ported, TitleBar.tsx:227-230) and
 * the right-click twin fed by the exact same `fileActions` list so they
 * cannot drift (MENU-KIT-DESIGN.md §5, §9).
 */
export const FileMenuAndContextMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const title = canvas.getByRole("button", { name: /Click for file menu/ });

    await userEvent.click(title);
    // WHY `findByText`, not `getByText` (hardened 2026-09-18): opening this
    // menu resolves through Base UI's Positioner, whose Floating UI
    // `computePosition` is genuinely async (the exact fact
    // `FloatingToolbar.stories.tsx`'s own header already documents for the
    // pill) — a synchronous `getByText` immediately after `click` raced it
    // and intermittently ran before the popup mounted, exactly the
    // flakiness the fix gate flagged as "non-deterministic between runs".
    // `findByText` polls instead of asserting once.
    await expect(await body.findByText("Save As…")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    });

    fireEvent.contextMenu(title);
    const menu = await body.findByTestId("chrome-bar-file-context-menu");
    // Rename is hoisted to the FIRST row in the context menu even though it
    // is the second entry in `fileActions` (`root` comes first for the
    // dropdown's own reading order).
    const items = within(menu).getAllByRole("menuitem");
    await expect(items[0]).toHaveTextContent("Rename");
  },
};

/** The burger — the one menu in this kit built from `MenuSpec` data rather
 *  than JSX, nested submenu included. */
export const BurgerMenuWithSubmenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "File and settings" }));
    // `findByText`, same reason as `FileMenuAndContextMenu` above.
    await expect(await body.findByText("Open…")).toBeInTheDocument();

    await userEvent.click(body.getByText("Export as"));
    await waitFor(() => expect(body.getByText("SVG")).toBeInTheDocument());
  },
};

/** Double-click the title (or open its menu then Rename) to edit in place —
 *  same Enter/Escape/blur contract as `InlineRename.stories.tsx`. No F2
 *  keybinding lives in the component; the host wires that onto `onBegin`. */
function RenameDemo() {
  const [title, setTitle] = useState("series_a_pose_pipeline_v7");
  const [active, setActive] = useState(false);
  return (
    <ChromeBar
      {...baseArgs}
      identity={{ title, statusTone: "ok", statusLabel: "All changes saved" }}
      rename={{
        active,
        onBegin: () => setActive(true),
        onCommit: (next) => {
          setTitle(next);
          setActive(false);
        },
        onCancel: () => setActive(false),
      }}
    />
  );
}

export const RenamingActive: Story = {
  render: () => <RenameDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getByRole("button", { name: /Click for file menu/ }));

    const input = await canvas.findByRole("textbox", { name: "Rename series_a_pose_pipeline_v7" });
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, "series_a_pose_pipeline_v8{Enter}");

    await expect(canvas.getByText("series_a_pose_pipeline_v8")).toBeInTheDocument();
  },
};

/** `statusTone` — the dot beside the title. Both screenshots show `ok`;
 *  `pending`/`error` exist for a save-in-flight or a failed write. */
export const StatusTones: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      {(["ok", "pending", "error"] as const).map((tone) => (
        <div key={tone} className="flex items-center gap-2 text-sm">
          <StatusDot tone={tone} label={`${tone} status`} />
          <span className="text-muted-foreground">{tone}</span>
        </div>
      ))}
    </div>
  ),
};

// ---------------------------------------------------------------------------
// BranchChip — the "Main ▾" / "Draft 1 (1) ▾" selector on its own, outside
// any ChromeBar/Toolbar (it has no opinion on either — see its own header).
// ---------------------------------------------------------------------------

function branchChipArgs(overrides: Partial<BranchChipProps> = {}): BranchChipProps {
  return {
    isDraftMode: false,
    draftCount: 0,
    activeDraftName: null,
    drafts: [],
    activeDraftId: null,
    onSwitchTo: fn(),
    onCreate: fn(),
    onRename: fn(),
    onDiscard: fn(),
    ...overrides,
  };
}

const threeDrafts: DraftSummary[] = [
  { id: "d1", name: "Draft 1", secondaryLabel: "based on Main · 2 minutes ago" },
  { id: "d2", name: "Pose retry", secondaryLabel: "based on Main · yesterday" },
  { id: "d3", name: "Calibration fix", secondaryLabel: "based on Main · 3 days ago" },
];

/** Off-draft ("Main"), and draft mode active ("Draft 1", count badge, the
 *  blue `data-active` outline) — screenshots 05 and 09's chip, side by
 *  side. */
export const BranchChipMainVsDraftMode: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <BranchChip {...branchChipArgs()} />
      <BranchChip
        {...branchChipArgs({
          isDraftMode: true,
          draftCount: 1,
          activeDraftName: "Draft 1",
          drafts: [threeDrafts[0]],
          activeDraftId: "d1",
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvas.getByRole("button", { name: "Drafts · Main" });
    const draft = canvas.getByRole("button", { name: "Draft Draft 1" });
    await expect(main).not.toHaveAttribute("data-active");
    await expect(draft).toHaveAttribute("data-active");
  },
};

/**
 * Multiple drafts in the popover: rename inline (hover-revealed pencil),
 * and the two-step "Discard?" confirm (ported, DraftsControl.tsx:195-207)
 * that resets if the row loses focus before the second click.
 */
export const BranchChipMultipleDraftsPopover: Story = {
  render: () => (
    <BranchChip
      {...branchChipArgs({
        isDraftMode: true,
        draftCount: threeDrafts.length,
        activeDraftName: "Draft 1",
        drafts: threeDrafts,
        activeDraftId: "d1",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Draft Draft 1" }));

    await expect(body.getByText("Pose retry")).toBeInTheDocument();
    await expect(body.getByText("based on Main · yesterday")).toBeInTheDocument();

    const discard = body.getByRole("button", { name: "Discard Calibration fix" });
    await userEvent.click(discard);
    await expect(body.getByRole("button", { name: "Confirm discard Calibration fix" })).toHaveTextContent("Discard?");
  },
};

/**
 * `renderTrigger` — the proven re-skin seam (DraftsControl.tsx:213-224): a
 * host composes its OWN trigger (here, the same `ToolbarButton`/`Button`
 * chain `chromeBar.tsx` uses for every other control) without forking the
 * popover body.
 */
export const BranchChipCustomTrigger: Story = {
  // WHY the `<Toolbar>` wrapper (fixed 2026-09-18): `branchChip.tsx`'s own
  // header on `renderTrigger` says the seam exists so a host can compose
  // the trigger "with `ToolbarButton`/`DropdownMenuTrigger` the way
  // `chromeBar.tsx` composes every other bar control" — but also that
  // `BranchChip` itself "has no opinion on whether it lives inside a
  // `Toolbar` at all". This story exercises exactly the `ToolbarButton`
  // half of that seam, so IT (not `BranchChip`) owns providing the
  // ancestor `Toolbar.Root` context `ToolbarButton` requires — rendering
  // it bare threw "ToolbarRootContext is missing" because nothing in the
  // story tree was a `Toolbar`.
  render: () => (
    <Toolbar aria-label="Demo toolbar">
      <BranchChip
        {...branchChipArgs({ isDraftMode: true, draftCount: 1, activeDraftName: "Draft 1", drafts: [threeDrafts[0]], activeDraftId: "d1" })}
        renderTrigger={({ activeDraftName }) => (
          <ToolbarButton
            render={
              <Button variant="secondary" size="sm">
                Custom trigger · {activeDraftName}
              </Button>
            }
          />
        )}
      />
    </Toolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Custom trigger · Draft 1/ })).toBeInTheDocument();
  },
};

/** New draft — the popover's own trailing action, never folded into the
 *  drafts list itself. */
export const BranchChipCreateNewDraft: Story = {
  render: () => <BranchChip {...branchChipArgs({ drafts: [threeDrafts[0]], activeDraftId: null, draftCount: 1 })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WHY `body`, not `canvas` (fixed 2026-09-18): `popover.tsx` portals its
    // content to `document.body` (see every other popup assertion in this
    // file), so the drafts list — and its "New draft" row — never lands
    // inside `canvasElement`. `canvas.getByTestId` here always threw
    // "unable to find", even with the popover genuinely open.
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Drafts · Main" }));
    await expect(body.getByTestId("branch-chip-new-draft")).toBeInTheDocument();
  },
};
