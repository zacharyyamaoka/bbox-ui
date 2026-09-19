import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Frame as FrameIcon, GitFork } from "lucide-react";

import {
  FramesPanel,
  type FramesItem,
  type FramesKindMeta,
  type FramesPanelMode,
} from "../components/framesPanel";
import { PanelShell } from "../components/panelShell";

const meta = {
  title: "Basics/FramesPanel",
  component: FramesPanel,
  // WHY base `args`: `items`/`kinds`/`mode`/`onModeChange`/`onFocus`/
  // `onRename` have no sensible default, so CSF3 typegen requires them
  // here. Every story below supplies its own real data via `render`'s
  // closure instead of reading `args` — this fixture only exists to
  // satisfy the required-args contract.
  args: {
    items: [],
    kinds: {},
    mode: "cards",
    onModeChange: fn(),
    onFocus: fn(),
    onRename: fn(async () => ({ ok: true })),
  },
} satisfies Meta<typeof FramesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `kinds` is what fixes the donor's raw `"EXPANDED-BLOCK"`
 * (`item.target.kind.toUpperCase()`, BoardOverview.tsx:53) into real words —
 * see `framesPanel.tsx`'s own header comment and design decision #6's
 * sibling note under §8. Two kinds mirrors the two the screenshot shows.
 */
const KINDS: Record<string, FramesKindMeta> = {
  branch: { icon: <GitFork />, caption: "Branch point" },
  "expanded-block": { icon: <FrameIcon />, caption: "Expanded block" },
};

function thumb(seed: number): FramesItem["preview"] {
  const w = 400 + (seed % 3) * 120;
  const h = 220 + (seed % 2) * 80;
  return {
    viewport: { x: 0, y: 0, w, h },
    shapes: [
      { x: 20, y: 20, w: w * 0.4, h: h * 0.3 },
      { x: w * 0.5, y: h * 0.4, w: w * 0.35, h: h * 0.25 },
    ],
  };
}

/** The screenshot's own run list (docs/menus/screenshots/06), condensed. */
const SCREENSHOT_ITEMS: FramesItem[] = [
  { key: "shape:1", kind: "branch", label: "Branch", caption: "BRANCH", preview: thumb(1) },
  { key: "shape:2", kind: "branch", label: "Branch", caption: "BRANCH", preview: thumb(2) },
  { key: "shape:3", kind: "expanded-block", label: "run_09_branch()", caption: "EXPANDED-BLOCK", preview: thumb(3) },
  { key: "shape:4", kind: "expanded-block", label: "run_09_branch()", caption: "EXPANDED-BLOCK", preview: thumb(4) },
  { key: "shape:5", kind: "expanded-block", label: "run_09_branch()", caption: "EXPANDED-BLOCK", preview: thumb(5) },
  { key: "shape:6", kind: "expanded-block", label: "run_08_anonymous_intermediate", caption: "EXPANDED-BLOCK", preview: thumb(6) },
  { key: "shape:7", kind: "expanded-block", label: "run()", caption: "EXPANDED-BLOCK", preview: thumb(7) },
  { key: "shape:8", kind: "expanded-block", label: "verify()", caption: "EXPANDED-BLOCK", preview: thumb(8) },
  { key: "shape:9", kind: "expanded-block", label: "merge()", caption: "EXPANDED-BLOCK", preview: thumb(9) },
];

function Shell({ children, title = "Frames" }: { children: ReactNode; title?: string }) {
  return (
    <div style={{ height: 560, width: 320 }}>
      <PanelShell eyebrow="RIGHT PANEL" title={title} onClose={fn()}>
        {children}
      </PanelShell>
    </div>
  );
}

/** The exact screenshot 06 composition: cards mode, a save-view form, reorderable rows. */
export const Default: Story = {
  render: function Render() {
    const [items, setItems] = useState(SCREENSHOT_ITEMS);
    const [mode, setMode] = useState<FramesPanelMode>("cards");
    return (
      <Shell>
        <FramesPanel
          items={items}
          kinds={KINDS}
          mode={mode}
          onModeChange={setMode}
          onFocus={fn()}
          onRename={(key, next) => {
            setItems((current) => current.map((item) => (item.key === key ? { ...item, label: next } : item)));
            return { ok: true };
          }}
          onDelete={(key) => setItems((current) => current.filter((item) => item.key !== key))}
          saveView={{
            suggestedName: "View 1",
            onSave: (name) => {
              setItems((current) => [
                ...current,
                { key: `landmark:${Date.now()}`, kind: "expanded-block", label: name, caption: "SAVED CAMERA VIEW" },
              ]);
              return { ok: true };
            },
          }}
          reorder={{ onReorder: (nextKeys) => setItems((current) => [...current].sort((a, b) => nextKeys.indexOf(a.key) - nextKeys.indexOf(b.key))) }}
        />
      </Shell>
    );
  },
};

/** `mode="list"` — no thumbnails, just grip · icon · name · menu. */
/**
 * Opens the view-options menu and switches mode through it.
 *
 * WHY this story exists at all: that menu CRASHED. `DropdownMenuLabel`
 * renders Base UI's `Menu.GroupLabel`, which throws "MenuGroupContext is
 * missing" without a `Menu.Group` above it, and the label sat outside one —
 * so clicking the trigger threw and unmounted the React root. It shipped and
 * survived a merge because every FramesPanel story rendered the panel and
 * none of them ever opened this menu; an independent judge found it by
 * clicking every trigger on every surface (2026-09-18).
 *
 * The lesson is the test, not the fix: a trigger no story presses is a
 * trigger nobody has run. This one is now pressed on every suite run.
 */
export const ViewMenuOpens: Story = {
  render: function Render() {
    const [mode, setMode] = useState<FramesPanelMode>("cards");
    return (
      <Shell>
        <FramesPanel
          items={SCREENSHOT_ITEMS}
          kinds={KINDS}
          mode={mode}
          onModeChange={setMode}
          onFocus={fn()}
          onRename={() => ({ ok: true })}
        />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Frames panel view options" }));

    // Both radio rows present means the menu actually MOUNTED — the crash
    // left an empty root, so any assertion about panel content would still
    // have passed while this one cannot.
    await expect(await body.findByRole("menuitemradio", { name: "Thumbnail cards" })).toBeInTheDocument();
    const list = await body.findByRole("menuitemradio", { name: "Compact list" });

    // And it works, not merely renders.
    await userEvent.click(list);
    await waitFor(() => expect(canvasElement.querySelector("[data-mode='list']")).not.toBeNull());
  },
};

export const ListMode: Story = {
  render: function Render() {
    const [mode, setMode] = useState<FramesPanelMode>("list");
    return (
      <Shell>
        <FramesPanel
          items={SCREENSHOT_ITEMS}
          kinds={KINDS}
          mode={mode}
          onModeChange={setMode}
          onFocus={fn()}
          onRename={() => ({ ok: true })}
        />
      </Shell>
    );
  },
};

/** Dragging a grip reorders the list — `onReorder` receives the complete next key order. */
export const DragToReorder: Story = {
  render: function Render() {
    const [items, setItems] = useState(SCREENSHOT_ITEMS.slice(0, 4));
    return (
      <Shell>
        <FramesPanel
          items={items}
          kinds={KINDS}
          mode="list"
          onModeChange={fn()}
          onFocus={fn()}
          onRename={() => ({ ok: true })}
          reorder={{
            onReorder: (nextKeys) =>
              setItems((current) => [...current].sort((a, b) => nextKeys.indexOf(a.key) - nextKeys.indexOf(b.key))),
          }}
        />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    // Reordering itself is a real pointer drag (out of scope for a jsdom/
    // Playwright click-based play function without a full drag simulation);
    // this just pins the grip's presence and its keyboard affordance so a
    // regression that removes `useSortable`'s wiring fails loudly here.
    const canvas = within(canvasElement);
    // `findAllBy*`, not `getAllBy*`, as the first call: see CLAUDE.md,
    // "Verifying story play functions" — a `getBy*` demands its element on
    // the first tick and flakes under load before this story finishes
    // mounting.
    const grips = await canvas.findAllByTitle("Drag to reorder");
    await expect(grips.length).toBe(4);
    // WHY "sortable", not "draggable" (fixed 2026-09-18): this pins
    // `useSortable`'s (`@dnd-kit/sortable`) own wiring, and that hook's
    // `announcements` default — `dist/hooks/defaults.d.ts`'s
    // `roleDescription: string` field, `sortable.cjs.development.js:395`'s
    // real value — is literally `"sortable"`, not `@dnd-kit/core`'s plain
    // `useDraggable` default of `"draggable"`. This assertion had assumed
    // the base library's default without checking which hook this
    // component actually calls.
    await expect(grips[0]).toHaveAttribute("aria-roledescription", "sortable");
  },
};

/** `readOnly` — save-view form disabled, rename/delete disabled, no drag grips wired. */
export const ReadOnly: Story = {
  render: () => (
    <Shell>
      <FramesPanel
        items={SCREENSHOT_ITEMS.slice(0, 5)}
        kinds={KINDS}
        mode="cards"
        onModeChange={fn()}
        readOnly
        notices={["This document is read-only. Saved views cannot be changed."]}
        onFocus={fn()}
        onRename={() => ({ ok: false, reason: "This document is read-only." })}
        saveView={{ suggestedName: "View 1", onSave: () => ({ ok: false, reason: "Read-only." }) }}
        reorder={{ onReorder: fn() }}
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Save" })).toBeDisabled();
  },
};

/** `reorderLocked` alone — everything else stays live, only dragging is off (framesOrder.ts's `"protected"` state). */
export const ReorderLocked: Story = {
  render: () => (
    <Shell>
      <FramesPanel
        items={SCREENSHOT_ITEMS.slice(0, 5)}
        kinds={KINDS}
        mode="list"
        onModeChange={fn()}
        reorderLocked
        notices={["Frame ordering uses an unknown format and will not be changed."]}
        onFocus={fn()}
        onRename={() => ({ ok: true })}
        reorder={{ onReorder: fn() }}
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WHY `findAllByLabelText` first, not the `queryByTitle(...)
    // .not.toBeInTheDocument()` below on its own (fixed 2026-09-18, see
    // CLAUDE.md "Verifying story play functions"): a row's "Actions for
    // <label>" menu button renders whether or not dragging is locked, so
    // awaiting it first proves the panel actually mounted its five rows
    // before trusting the grip-absence check below. Without it, a
    // regression that rendered nothing at all — an empty DOM — would have
    // satisfied `.not.toBeInTheDocument()` just as well, and this exact
    // story shipped that way and passed against a blank render.
    await canvas.findAllByLabelText(/^Actions for/);
    // Grips still render (inert) but no sortable wiring is mounted.
    await expect(canvas.queryByTitle("Drag to reorder")).not.toBeInTheDocument();
  },
};

/** `landmarksLocked` disables just the save-view form; existing rows stay fully live. */
export const LandmarksLocked: Story = {
  render: () => (
    <Shell>
      <FramesPanel
        items={SCREENSHOT_ITEMS.slice(0, 3)}
        kinds={KINDS}
        mode="cards"
        onModeChange={fn()}
        landmarksLocked
        notices={["Saved-view metadata uses an unknown format and will not be changed."]}
        onFocus={fn()}
        onRename={() => ({ ok: true })}
        saveView={{ suggestedName: "View 1", onSave: () => ({ ok: true }) }}
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Save" })).toBeDisabled();
  },
};

/** No items yet — the empty state, in both a fresh doc and a filtered-to-nothing shape. */
export const Empty: Story = {
  render: () => (
    <Shell>
      <FramesPanel
        items={[]}
        kinds={KINDS}
        mode="cards"
        onModeChange={fn()}
        onFocus={fn()}
        onRename={() => ({ ok: true })}
        saveView={{ suggestedName: "View 1", onSave: () => ({ ok: true }) }}
      />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("frames-panel-empty")).toBeInTheDocument();
  },
};

const RENAME_DEMO_ITEMS: FramesItem[] = [
  { key: "landmark:a", kind: "expanded-block", label: "Alpha view", caption: "SAVED CAMERA VIEW" },
  { key: "landmark:b", kind: "expanded-block", label: "Beta view", caption: "SAVED CAMERA VIEW" },
];

/**
 * Renaming a row inline — commit on Enter, and the donor's own two-layer
 * validation: `InlineRename`'s OWN default rule blocks an empty name
 * client-side ("Give this draft a name.") before `onRename` is ever called;
 * a non-empty name that the HOST still refuses (a duplicate saved-view name,
 * `BoardOverview.tsx`'s `landmarkFailureMessage`) surfaces through
 * `onRename`'s own `{ok:false, reason}` instead.
 */
export const InlineRenameFailure: Story = {
  render: function Render() {
    const [items, setItems] = useState(RENAME_DEMO_ITEMS);
    return (
      <Shell>
        <FramesPanel
          items={items}
          kinds={KINDS}
          mode="list"
          onModeChange={fn()}
          onFocus={fn()}
          onRename={(key, next) => {
            if (items.some((item) => item.key !== key && item.label === next)) {
              return { ok: false, reason: "Saved-view names must be distinct and contain 1–80 characters." };
            }
            setItems((current) => current.map((item) => (item.key === key ? { ...item, label: next } : item)));
            return { ok: true };
          }}
        />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WHY `body`, not `canvas`, for the "Rename" menu item (fixed
    // 2026-09-18): the row's Actions menu is a `DropdownMenu`
    // (`framesPanel.tsx`'s `RowContent`), which — like every other
    // `DropdownMenuContent` in this kit — portals to `document.body`, not
    // `canvasElement`. `canvas.findByText("Rename")` always threw "unable
    // to find" even with the menu genuinely open; the row's own inline
    // rename field it opens is NOT portaled, so everything after the click
    // stays on `canvas`.
    const body = within(document.body);
    // `findAllBy*`, not `getAllBy*`, as the first call — see CLAUDE.md,
    // "Verifying story play functions".
    await userEvent.click((await canvas.findAllByLabelText(/^Actions for/))[0]);
    await userEvent.click(await body.findByText("Rename"));
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByText("Give this draft a name.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    // Non-empty duplicate: the host's own onRename rejection surfaces instead.
    await userEvent.click(canvas.getAllByLabelText(/^Actions for/)[0]);
    await userEvent.click(await body.findByText("Rename"));
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, RENAME_DEMO_ITEMS[1].label);
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByText(/Saved-view names must be distinct/)).toBeInTheDocument();
  },
};

/** A kind absent from `kinds` still renders — the fallback `item.caption`, no icon. */
export const UnknownKind: Story = {
  render: () => (
    <Shell>
      <FramesPanel
        items={[{ key: "shape:x", kind: "mystery-shape", label: "region_7", caption: "REGION" }]}
        kinds={KINDS}
        mode="cards"
        onModeChange={fn()}
        onFocus={fn()}
        onRename={() => ({ ok: true })}
      />
    </Shell>
  ),
};

/**
 * Every state above, side by side — the comparison this review actually
 * needs (docs/menus/MENU-KIT-DESIGN.md:646), not one story per state read
 * in isolation one at a time. Each cell is the same non-interactive render
 * its single-purpose story above uses; nothing here is faked or resized —
 * a `Shell` is already only 320×560, small enough to lay several out in a
 * wrapping grid without scaling.
 */
export const AllStates: Story = {
  render: () => {
    const cells: { label: string; content: ReactNode }[] = [
      {
        label: "Default — cards mode, save-view form, reorderable rows",
        content: (
          <FramesPanel
            items={SCREENSHOT_ITEMS}
            kinds={KINDS}
            mode="cards"
            onModeChange={fn()}
            onFocus={fn()}
            onRename={() => ({ ok: true })}
            saveView={{ suggestedName: "View 1", onSave: () => ({ ok: true }) }}
            reorder={{ onReorder: fn() }}
          />
        ),
      },
      {
        label: "Empty — no items yet",
        content: (
          <FramesPanel
            items={[]}
            kinds={KINDS}
            mode="cards"
            onModeChange={fn()}
            onFocus={fn()}
            onRename={() => ({ ok: true })}
            saveView={{ suggestedName: "View 1", onSave: () => ({ ok: true }) }}
          />
        ),
      },
      {
        label: "List mode — no thumbnails, just grip · icon · name · menu",
        content: (
          <FramesPanel
            items={SCREENSHOT_ITEMS}
            kinds={KINDS}
            mode="list"
            onModeChange={fn()}
            onFocus={fn()}
            onRename={() => ({ ok: true })}
          />
        ),
      },
      {
        label: "Read-only — save-view/rename/delete disabled, no drag grips wired",
        content: (
          <FramesPanel
            items={SCREENSHOT_ITEMS.slice(0, 5)}
            kinds={KINDS}
            mode="cards"
            onModeChange={fn()}
            readOnly
            notices={["This document is read-only. Saved views cannot be changed."]}
            onFocus={fn()}
            onRename={() => ({ ok: false, reason: "This document is read-only." })}
            saveView={{ suggestedName: "View 1", onSave: () => ({ ok: false, reason: "Read-only." }) }}
            reorder={{ onReorder: fn() }}
          />
        ),
      },
      {
        label: "Reorder-locked — everything else stays live, only dragging is off",
        content: (
          <FramesPanel
            items={SCREENSHOT_ITEMS.slice(0, 5)}
            kinds={KINDS}
            mode="list"
            onModeChange={fn()}
            reorderLocked
            notices={["Frame ordering uses an unknown format and will not be changed."]}
            onFocus={fn()}
            onRename={() => ({ ok: true })}
            reorder={{ onReorder: fn() }}
          />
        ),
      },
      {
        label: "Unknown kind — fallback caption, no icon",
        content: (
          <FramesPanel
            items={[{ key: "shape:x", kind: "mystery-shape", label: "region_7", caption: "REGION" }]}
            kinds={KINDS}
            mode="cards"
            onModeChange={fn()}
            onFocus={fn()}
            onRename={() => ({ ok: true })}
          />
        ),
      },
    ];

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 }}>
        {cells.map(({ label, content }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "12px monospace", opacity: 0.6 }}>{label}</span>
            <div style={{ height: 560, width: 320 }}>
              <PanelShell eyebrow="RIGHT PANEL" title="Frames" onClose={fn()}>
                {content}
              </PanelShell>
            </div>
          </div>
        ))}
      </div>
    );
  },
};
