import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import {
  CompareReview,
  type CompareDock,
  type CompareMode,
  type CompareReviewProps,
  type CompareTab,
} from "../components/compareReview";
import { compareBoards, type CompareChange, type RecordMap } from "../components/compareModel";
import type { HistoryRecord } from "../components/historyList";
import { cn } from "../lib/utils";

/**
 * The full Compare-changes review surface
 * (docs/menus/MENU-KIT-DESIGN.md §3.3, screenshot
 * docs/menus/screenshots/08-compare-changes.png): lane K's `HistoryList`,
 * `PropertyTable` and `CodeView` composed with lane B's `tabs.tsx` and
 * `toggle-group.tsx` into the HISTORY rail, the two centre panes, the
 * Properties|Code detail rail, and the bottom mode/fullscreen bar.
 *
 * It is HEADLESS — no `Dialog`, no fixed positioning, no z-index (see the
 * component's own header note). Every story below supplies its own
 * bordered box and its own `renderBefore`/`renderAfter` board mocks,
 * exactly the way a real host (the tldraw adapter) would wrap it in a
 * modal and hand it two `BoardRender`s — this gallery is that host,
 * standing in for one that doesn't exist in this kit.
 */
const meta = {
  title: "Basics/CompareReview",
  component: CompareReview,
  // Every story below overrides `render`; these are just the dummy
  // defaults CSF3 typing needs to cover CompareReview's required props
  // (the same pattern PropertyTable.stories.tsx uses).
  args: {
    comparison: null,
    renderBefore: () => null,
    renderAfter: () => null,
    selectedChangeId: null,
    onSelectChange: () => {},
    mode: "side-by-side",
    onModeChange: () => {},
    blend: 0,
    onBlendChange: () => {},
    fullscreen: false,
    onFullscreenChange: () => {},
    dock: "right",
    onDockChange: () => {},
    tab: "properties",
    onTabChange: () => {},
    layout: "figma",
    gitHighlight: false,
  },
} satisfies Meta<typeof CompareReview>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = Date.now();

/* ------------------------------------------------------------------ */
/* Fixtures — a real `BoardCompare` computed by the ported `compareBoards`,
   the same pattern `PropertyTable.stories.tsx` uses, so this gallery
   exercises the same data path a host does rather than hand-typed rows. */
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

const BEFORE_BOARD: RecordMap = Object.fromEntries([
  block("shape:predict", { title: "run_inference", blockType: "model", inputs: [port("in-frames", "frames")] }),
  block("shape:overlay", { title: "Debug Overlay", blockType: "widget" }),
]);

const AFTER_BOARD: RecordMap = Object.fromEntries([
  block("shape:predict", {
    title: "run_predict",
    blockType: "model",
    inputs: [port("in-frames", "frames"), port("in-threshold", "threshold", "float", "0.5")],
  }),
  block("shape:source", { title: "Frame Source", blockType: "input" }),
]);

/** The board that actually changed — three changes, all three kinds. */
const COMPARISON = compareBoards(BEFORE_BOARD, AFTER_BOARD);
/** The SAME after-board diffed against itself — a real `total: 0`, not a stub. */
const IDENTICAL_COMPARISON = compareBoards(AFTER_BOARD, AFTER_BOARD);

/** `block:shape:predict` — `compareModel.ts`'s own `` `block:${blockId}` ``
 *  id shape (see `PropertyTable.stories.tsx`'s `ByElementLayout` for the
 *  same fixed id, same reason). */
const PREDICT_ELEMENT_TESTID = "compare-element-block:shape:predict";

const LIVE_RECORD: HistoryRecord = {
  id: "live",
  title: "Current version",
  timestamp: now - 20_000,
  author: null,
  badge: "•",
  tone: "current",
  isCurrent: true,
};

const V1_RECORD: HistoryRecord = {
  id: "v1",
  title: "3 changes",
  description: "run_predict gained a threshold input; Debug Overlay was replaced by Frame Source.",
  timestamp: now - 3 * 3_600_000,
  author: null,
  badge: "v1",
  tone: "mixed",
  isCurrent: false,
};

/* ------------------------------------------------------------------ */
/* Board mocks — the host-supplied `renderBefore`/`renderAfter` slots.
   `compareReview.tsx` knows nothing about boards; these stand in for a
   real `BoardRender`, and are the only place in this file that reaches
   into `slot.highlight`. */
/* ------------------------------------------------------------------ */

function BoardMock({ slot, side }: { slot: { highlight: CompareChange | null; label: string }; side: "before" | "after" }) {
  return (
    <div
      data-testid={`board-mock-${side}`}
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

/** Figma's own sentence for the before pane once no snapshot exists — the
 *  screenshot's own state, not a board at all. */
function NoSnapshotMock() {
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
/* A generic, fully-controlled host — every story below is this same
   component with a different starting configuration, the same way a real
   host owns every one of `CompareReviewProps`'s controlled fields. */
/* ------------------------------------------------------------------ */

interface DemoProps {
  comparison: CompareReviewProps["comparison"];
  versions: readonly HistoryRecord[];
  initialSelectedVersionId?: string | null;
  problem?: string | null;
  noSnapshot?: boolean;
  initialMode?: CompareMode;
  initialTab?: CompareTab;
  initialDock?: CompareDock;
  initialSelectedChangeId?: string | null;
  defaultSelectedElementId?: string | null;
  canOverlay?: boolean;
}

function Demo({
  comparison,
  versions,
  initialSelectedVersionId = null,
  problem = null,
  noSnapshot = false,
  initialMode = "side-by-side",
  initialTab = "properties",
  initialDock = "right",
  initialSelectedChangeId = null,
  defaultSelectedElementId = null,
  canOverlay,
}: DemoProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(initialSelectedVersionId);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(initialSelectedChangeId);
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [blend, setBlend] = useState(60);
  const [fullscreen, setFullscreen] = useState(false);
  const [dock, setDock] = useState<CompareDock>(initialDock);
  const [tab, setTab] = useState<CompareTab>(initialTab);

  return (
    <div className="h-[540px] w-[900px] overflow-hidden rounded-lg border border-border bg-background shadow-sm" data-testid="compare-frame">
      <CompareReview
        defaultSelectedElementId={defaultSelectedElementId}
        comparison={comparison}
        versions={versions}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
        problem={problem}
        renderBefore={(slot) => (noSnapshot ? <NoSnapshotMock /> : <BoardMock slot={slot} side="before" />)}
        renderAfter={(slot) => <BoardMock slot={slot} side="after" />}
        selectedChangeId={selectedChangeId}
        onSelectChange={setSelectedChangeId}
        mode={mode}
        onModeChange={setMode}
        blend={blend}
        onBlendChange={setBlend}
        canOverlay={canOverlay}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        dock={dock}
        onDockChange={setDock}
        tab={tab}
        onTabChange={setTab}
        layout="figma"
        gitHighlight={false}
        testIdPrefix="compare"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

/** The screenshot's own state: a brand-new board, one HISTORY entry (the
 *  live board, pinned AFTER and undisabled-but-unpickable), the amber
 *  notice explaining why, "No snapshot loaded." in the before pane, and
 *  the `figma` layout's two empty sentences side by side. */
export const NoSnapshotLoaded: Story = {
  render: () => (
    <Demo
      comparison={null}
      versions={[LIVE_RECORD]}
      problem="No prior versions found beside this board. Save a `<name>.v1.systemsketch` next to it to compare against."
      noSnapshot
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `findBy*`, not `getBy*`, as the first call — see CLAUDE.md,
    // "Verifying story play functions".
    await expect(await canvas.findByTestId("compare-history-row-live")).toHaveAttribute("data-current", "true");
    await expect(canvas.getByTestId("compare-history-pick-live")).toBeDisabled();
    await expect(canvas.getByTestId("compare-no-snapshot")).toHaveTextContent("No snapshot loaded.");
    await expect(canvas.getByTestId("compare-problem")).toHaveTextContent(/No prior versions found/);
    // No `comparison` at all → PropertyTable falls back to its own empty
    // state, same sentence Figma uses for a genuine like-for-like diff.
    await expect(canvas.getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
    await expect(canvas.getByTestId("compare-figma-empty")).toBeInTheDocument();
  },
};

/** A REAL comparison — the same after-board diffed against itself,
 *  `total: 0` computed rather than stubbed — with a version actually on
 *  the rail to pick. No `problem` notice: there IS a prior version, it
 *  simply matches. */
export const IdenticalVersions: Story = {
  render: () => (
    <Demo comparison={IDENTICAL_COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `findBy*` first — see CLAUDE.md, "Verifying story play functions" —
    // so the `queryByTestId(...).not.toBeInTheDocument()` below has
    // something real to be false about rather than passing against a
    // story that never finished mounting.
    await expect(await canvas.findByTestId("compare-history-pick-v1")).toHaveAttribute("aria-current", "true");
    await expect(canvas.queryByTestId("compare-problem")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("compare-no-changes")).toHaveTextContent("These two versions are identical.");
  },
};

/** A board with real changes — added, removed AND modified all at once —
 *  starting with nothing picked (Figma's own prompt), then an element
 *  clicked in the `figma` layout's left list, which swaps the prompt for
 *  that element's own property rows. */
export const ElementSelected: Story = {
  render: () => <Demo comparison={COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `findBy*` first — see CLAUDE.md, "Verifying story play functions".
    await expect(await canvas.findByTestId("compare-figma-empty")).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId(PREDICT_ELEMENT_TESTID));
    await expect(canvas.getByTestId(PREDICT_ELEMENT_TESTID)).toHaveAttribute("data-selected", "true");
    await expect(canvas.queryByTestId("compare-figma-empty")).not.toBeInTheDocument();
  },
};

/** The bottom bar's toggle: `Side by side` has two boards and no slider;
 *  `Overlay` fades the after pane over the before pane and reveals the
 *  blend control — `canOverlay={false}` disables the option instead of
 *  hiding it (design doc: "overlay only means anything with linked
 *  cameras"), so this gallery shows that gate too. */
export const SideBySideVsOverlay: Story = {
  render: () => <Demo comparison={COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `findBy*` first — see CLAUDE.md, "Verifying story play functions" —
    // so the negative assertion right after it has something real to be
    // false about.
    await expect(await canvas.findByTestId("compare-mode-side-by-side")).toHaveAttribute("data-pressed");
    await expect(canvas.queryByTestId("compare-blend")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByTestId("compare-mode-overlay"));
    await expect(canvas.getByTestId("compare-mode-overlay")).toHaveAttribute("data-pressed");
    await expect(canvas.getByTestId("compare-blend")).toBeInTheDocument();
    // The AFTER pane (the `<figure>`, two DOM levels up from the mock)
    // carries the blend as its own opacity; BEFORE never does.
    const afterFigure = canvas.getByTestId("board-mock-after").parentElement?.parentElement as HTMLElement;
    await expect(afterFigure.style.opacity).not.toBe("");
  },
};

/** `canOverlay={false}` — the disabled variant of the same toggle, gated
 *  because the host has no linked cameras to blend between. */
export const OverlayDisabledWithoutLinkedCameras: Story = {
  render: () => (
    <Demo comparison={COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} canOverlay={false} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("compare-mode-overlay")).toBeDisabled();
  },
};

/** The right/bottom rail's own tab strip — the same `tabs.tsx` primitive
 *  every detail panel in this kit uses ("consistent with what tabs look
 *  like"). Code shows the raw record the Properties row was computed
 *  from; switching tabs never disturbs which row is selected. */
export const PropertiesVsCode: Story = {
  render: () => (
    <Demo
      comparison={COMPARISON}
      versions={[LIVE_RECORD, V1_RECORD]}
      initialSelectedVersionId={V1_RECORD.id}
      initialSelectedChangeId={COMPARISON.changes[0]?.id ?? null}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The `figma` layout's Properties tab only renders a `<table>` once an
    // element is selected in the list beside it (otherwise it's the
    // "Select an edited element" empty state — see `ElementSelected`
    // above); select one here purely to get a properties table on screen
    // for the tab-switch this story actually exercises. `findBy*` first —
    // see CLAUDE.md, "Verifying story play functions".
    await userEvent.click(await canvas.findByTestId(PREDICT_ELEMENT_TESTID));
    await expect(canvas.getByTestId("compare-property-table")).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId("compare-tab-code"));
    await expect(canvas.getByTestId("compare-code-view")).toBeInTheDocument();
    await expect(canvas.queryByTestId("compare-property-table")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByTestId("compare-tab-properties"));
    await expect(canvas.getByTestId("compare-property-table")).toBeInTheDocument();
  },
};

/* ------------------------------------------------------------------ */
/* A second, bespoke host for the two controls no `Demo` story above
   touches: the dock toggle (which moves the WHOLE detail rail, not just a
   prop) and the review-and-apply footer (`action`/`review`, which need
   their own live rejected-set state — `PropertyTable.stories.tsx`'s own
   `ReviewModeDemo` is the same shape). */
/* ------------------------------------------------------------------ */

function DockAndReviewDemo() {
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(COMPARISON.changes[0]?.id ?? null);
  const [dock, setDock] = useState<CompareDock>("right");
  const [fullscreen, setFullscreen] = useState(false);
  const [rejected, setRejected] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <div className="h-[540px] w-[900px] overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <CompareReview
        comparison={COMPARISON}
        versions={[LIVE_RECORD, V1_RECORD]}
        selectedVersionId={V1_RECORD.id}
        onSelectVersion={() => {}}
        renderBefore={(slot) => <BoardMock slot={slot} side="before" />}
        renderAfter={(slot) => <BoardMock slot={slot} side="after" />}
        selectedChangeId={selectedChangeId}
        onSelectChange={setSelectedChangeId}
        mode="side-by-side"
        onModeChange={() => {}}
        blend={50}
        onBlendChange={() => {}}
        fullscreen={fullscreen}
        onFullscreenChange={setFullscreen}
        dock={dock}
        onDockChange={setDock}
        tab="properties"
        onTabChange={() => {}}
        layout="figma"
        gitHighlight={false}
        action={{
          label: "Merge",
          confirmLabel: (n) => `Merge ${n} change${n === 1 ? "" : "s"}`,
          onConfirm: async () => ({ ok: true }),
        }}
        review={{
          rejectedIds: rejected,
          onToggleReject: (id) =>
            setRejected((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            }),
        }}
        testIdPrefix="compare"
      />
    </div>
  );
}

/** The dock toggle rides the detail rail's OWN strip (icon shows the
 *  DESTINATION, never the current side) and moves the whole rail from the
 *  right edge to a bottom band. Fullscreen hides the review-and-apply
 *  footer entirely — "a destructive confirm floating over an otherwise
 *  chrome-less immersive view is exactly the button someone hits by
 *  accident" — and restores it on exit. */
export const DockToggleFullscreenAndReviewFooter: Story = {
  render: () => <DockAndReviewDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // `findBy*` first — see CLAUDE.md, "Verifying story play functions".
    await expect(await canvas.findByTestId("compare")).toHaveAttribute("data-dock", "right");
    await userEvent.click(canvas.getByTestId("compare-dock-toggle"));
    await expect(canvas.getByTestId("compare")).toHaveAttribute("data-dock", "bottom");

    await expect(canvas.getByTestId("compare-action-confirm")).toHaveTextContent(/Merge \d+ changes?/);
    await userEvent.click(canvas.getByTestId("compare-expand"));
    await expect(canvas.getByTestId("compare")).toHaveAttribute("data-fullscreen", "true");
    await expect(canvas.queryByTestId("compare-action-bar")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByTestId("compare-collapse"));
    await expect(canvas.getByTestId("compare")).not.toHaveAttribute("data-fullscreen");
    await expect(canvas.getByTestId("compare-action-bar")).toBeInTheDocument();
  },
};

/**
 * Every state above, side by side (docs/menus/MENU-KIT-DESIGN.md:646) — the
 * comparison a review actually needs, not seven separate story entries
 * clicked through one at a time. Each cell is a REAL `Demo` instance, the
 * same host every single-purpose story above uses — nothing here is a
 * screenshot or a faked snapshot. `Demo`'s own frame is 900×540, so seven
 * of them side by side would need ~6300px of width; each cell is scaled
 * down with CSS `zoom` (a Chromium feature, which is what Storybook's own
 * Playwright runner uses) rather than actually shrinking the component, and
 * the caption says so — the content behind the shrink is identical to its
 * full-size single-purpose story.
 */
export const AllStates: Story = {
  render: () => {
    const cells: { label: string; content: ReactNode }[] = [
      {
        label: "No snapshot loaded",
        content: (
          <Demo
            comparison={null}
            versions={[LIVE_RECORD]}
            problem="No prior versions found beside this board. Save a `<name>.v1.systemsketch` next to it to compare against."
            noSnapshot
          />
        ),
      },
      {
        label: "Identical versions — a real total: 0 diff, not a stub",
        content: <Demo comparison={IDENTICAL_COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} />,
      },
      {
        label: "Element selected — Properties rows for the picked block",
        content: (
          <Demo
            comparison={COMPARISON}
            versions={[LIVE_RECORD, V1_RECORD]}
            initialSelectedVersionId={V1_RECORD.id}
            initialSelectedChangeId={COMPARISON.changes[0]?.id ?? null}
            // WHY this is here and not implied by the line above: selecting a
            // CHANGE does not select an ELEMENT — they are separate concerns,
            // and without this the cell rendered "Select an edited element to
            // compare changes" under a caption promising a table. A caption
            // that describes a state the cell does not render is the one
            // thing a gallery must never do.
            defaultSelectedElementId="block:shape:predict"
          />
        ),
      },
      {
        label: "Side by side — two boards, no blend slider",
        content: <Demo comparison={COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} initialMode="side-by-side" />,
      },
      {
        label: "Overlay — after pane faded over before, blend slider revealed",
        content: <Demo comparison={COMPARISON} versions={[LIVE_RECORD, V1_RECORD]} initialSelectedVersionId={V1_RECORD.id} initialMode="overlay" />,
      },
      {
        label: "Properties tab — the table computed from the selected change",
        content: (
          <Demo
            comparison={COMPARISON}
            versions={[LIVE_RECORD, V1_RECORD]}
            initialSelectedVersionId={V1_RECORD.id}
            initialSelectedChangeId={COMPARISON.changes[0]?.id ?? null}
            // WHY this is here and not implied by the line above: selecting a
            // CHANGE does not select an ELEMENT — they are separate concerns,
            // and without this the cell rendered "Select an edited element to
            // compare changes" under a caption promising a table. A caption
            // that describes a state the cell does not render is the one
            // thing a gallery must never do.
            defaultSelectedElementId="block:shape:predict"
            initialTab="properties"
          />
        ),
      },
      {
        label: "Code tab — the raw record the Properties row was computed from",
        content: (
          <Demo
            comparison={COMPARISON}
            versions={[LIVE_RECORD, V1_RECORD]}
            initialSelectedVersionId={V1_RECORD.id}
            initialSelectedChangeId={COMPARISON.changes[0]?.id ?? null}
            // WHY this is here and not implied by the line above: selecting a
            // CHANGE does not select an ELEMENT — they are separate concerns,
            // and without this the cell rendered "Select an edited element to
            // compare changes" under a caption promising a table. A caption
            // that describes a state the cell does not render is the one
            // thing a gallery must never do.
            defaultSelectedElementId="block:shape:predict"
            initialTab="code"
          />
        ),
      },
    ];

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24 }}>
        {cells.map(({ label, content }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">{label} — scaled to 33% (CSS zoom)</span>
            <div style={{ width: 300, height: 180, overflow: "hidden" }}>
              <div style={{ zoom: 0.3333 }}>{content}</div>
            </div>
          </div>
        ))}
      </div>
    );
  },
};
