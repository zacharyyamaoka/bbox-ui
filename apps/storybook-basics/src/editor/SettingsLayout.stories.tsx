// src/editor/SettingsLayout.stories.tsx — acceptance for the 2026-09-22
// rebuild: P1 (Obsidian's shape from stock parts) + P2 (search).
//
// Zach, 2026-09-22, on the panel that shipped:
//   1. Seems to skinny.
//      1. there shouldnt be a scroll bar at the bottom
//   2. All the section son the left navigator should have icons
//   The height should be limited in this modal view. and the scroll bar should
//   be more intergrated see how it looks in obsidan...
//   - Generally I feel the entire settings thing is really unprofessionaly done.
//
// EVERY assertion here MEASURES with `getBoundingClientRect` or a layout
// property. DOM presence proves nothing about any of his four complaints: an
// icon can be present and 0px, a row can carry the right `data-slot` and still
// be stacked, and a pane can hold a horizontal scrollbar with every element
// exactly where the markup says. The one thing that made the old panel feel
// unprofessional — the stacked row — is invisible to every presence check.
//
// The vitest browser frame here is 1200x900 — MEASURED 2026-09-22 by a
// throwaway probe story, not assumed. (`SettingsView.stories.tsx` carried a
// "414x896" comment that was stale; it is corrected there too.) That frame is
// wide enough for the real rule to resolve to its ideal 1040x720, which is why
// `WindowTakesTheSpaceButStaysBounded` can assert the shipped rule directly —
// but it cannot BE a 720-tall window, so the short-window case states its
// window size through `popupClassName`, the component's existing host seam.
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";
import { Cable, Info, Keyboard, MousePointer2, Palette, SlidersHorizontal } from "lucide-react";

import { SettingsView, type SettingsCategory } from "./settingsView";

const meta = {
  title: "Editor/Panels & Dialogs/SettingsView/Layout & Search",
  tags: ["object:chrome", "lane:settings-panel-rebuild"],
  component: SettingsView,
  args: { open: false, onOpenChange: fn(), presentation: "dialog" as const, categories: [] },
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "layout-settings";

/**
 * Six categories in two nav groups, with the same SHAPE the real app's
 * `buildSettingsCategories` produces: long descriptions, a grouped run, a
 * mix of narrow controls (switch, select) and wide ones (radio, slider).
 * `settingsInventory.test.ts` pins the real list; this pins the layout.
 */
function CATEGORIES(state: {
  paste: boolean;
  setPaste(v: boolean): void;
  binding: string;
  setBinding(v: string): void;
}): SettingsCategory[] {
  return [
    {
      id: "general",
      label: "General",
      group: "Options",
      icon: <SlidersHorizontal />,
      sections: [
        {
          id: "file-navigation",
          title: "File navigation",
          description: "Which dialog Open… and Save As… use.",
          control: {
            kind: "radio",
            value: "app",
            options: [
              { value: "app", label: "SystemSketch file browser" },
              { value: "native", label: "System file dialog" },
            ],
            onValueChange: () => {},
          },
        },
        {
          id: "allow-any-path",
          title: "Allow opening files anywhere",
          description:
            "Lets a board link, Save As, or Rename reach any path on this computer — not just your workspace folder. On by default, since boards routinely come from an agent worktree or another drive.",
          control: { kind: "switch", checked: true, onCheckedChange: () => {} },
        },
      ],
    },
    { id: "appearance", label: "Appearance", group: "Options", icon: <Palette />, sections: [
      {
        id: "interface-scale",
        title: "Interface scale",
        description: "Make menus, panels and the toolbar easier to see on high-resolution displays.",
        control: {
          kind: "slider", value: 100, min: 80, max: 160, step: 5, commit: "exit",
          format: (v) => `${v}%`, presets: [80, 100, 125, 150], resetTo: 100,
          onValueChange: () => {},
        },
      },
    ] },
    {
      id: "pointer",
      label: "Mouse and scrolling",
      group: "Options",
      icon: <MousePointer2 />,
      sections: [
        {
          id: "paste-under-cursor",
          title: "Copy/paste under cursor",
          group: "Pointer",
          groupDescription: "Where a paste or duplicate lands.",
          description: "On: paste and duplicate land at the pointer. Off: they land at the viewport centre.",
          control: { kind: "switch", checked: state.paste, onCheckedChange: state.setPaste },
        },
        {
          id: "wheel-binding-wheelDown",
          title: "Scroll wheel down",
          group: "Wheel gestures",
          groupDescription: "What each wheel gesture does.",
          control: {
            kind: "select",
            value: state.binding,
            options: [
              { value: "pan-down", label: "Pan down" },
              { value: "zoom-out", label: "Zoom out" },
            ],
            onValueChange: state.setBinding,
          },
        },
      ],
    },
    { id: "connections", label: "Connections", group: "Options", icon: <Cable />, sections: [
      {
        id: "allowFanIn",
        title: "Several cables into one input",
        description: "Off, an input takes a single producer. Currently refused: A → C, B → C.",
        control: { kind: "switch", checked: false, onCheckedChange: () => {} },
      },
    ] },
    { id: "hotkeys", label: "Hotkeys and aliases", group: "Options", icon: <Keyboard />, sections: [
      {
        id: "tool-aliases",
        title: "Tool aliases",
        description: "Give any searchable tool the names you use.",
        control: { kind: "custom", render: <p>alias editor</p> },
      },
    ] },
    { id: "about", label: "About", group: "App", icon: <Info />, sections: [
      { id: "build", title: "SystemSketch", control: { kind: "custom", render: <p>bbox-ui + stock tldraw</p> } },
    ] },
  ];
}

/**
 * Window sizes, expressed as the SHIPPED rule with `100vh`/`100vw` substituted
 * for a stated window size, and applied AT MOUNT through `popupClassName`.
 *
 * WHY at mount, and not changed from a play function — measured 2026-09-22,
 * because this file tried both of the obvious things first and both failed
 * silently:
 *   - Writing `popup.style.height` from the play function loses. Base UI
 *     writes its own inline styles on the Popup and the ScrollArea viewport
 *     (the viewport carries `style="overflow: scroll; --scroll-area-…"`), and
 *     a test setting the same attribute is racing the library.
 *   - Changing `popupClassName` on an ALREADY-MOUNTED popup also loses, which
 *     is the surprising one. With the new class verifiably on the element
 *     (`className` contains `h-[min(720px,calc(720px-4rem))]`), `max-height:
 *     none`, and no inline height, the popup still computed `720px` — while a
 *     bare probe div carrying the identical two classes, created in the same
 *     document at the same moment, measured 1040x656. So the rule is right and
 *     live; the mounted popup simply does not re-resolve its box. The same
 *     effect is why `SettingsView.stories.tsx`'s presentation switch had to
 *     start polling its measurement.
 * Mounting with the class avoids all of it, and is how `AsAPage` has always
 * verified the page presentation.
 *
 * WHY the rule is re-stated instead of hardcoding `h-[656px]`: hardcoding the
 * answer would test this file's arithmetic. Substituting only the viewport
 * term keeps the `min(…, calc(… - 4rem))` shape under test, so a future change
 * to the gutter or the ideal size fails here. The classes are written out
 * literally because Tailwind scans source text — a template string would
 * generate nothing.
 *
 * `WindowTakesTheSpaceButStaysBounded` covers the un-substituted rule against
 * the live frame; these cover the window sizes the frame cannot be. The real
 * 1280x800 and 1366x720 browser windows are captured separately, by
 * `docs/capture_settings_panel_real.mjs` driving a real Storybook.
 */
const SHORT_WINDOW = "w-[min(1040px,calc(1366px-4rem))] h-[min(720px,calc(720px-4rem))] max-w-none max-h-none";
const SMALL_WINDOW = "w-[min(1040px,calc(900px-4rem))] h-[min(720px,calc(640px-4rem))] max-w-none max-h-none";
/** A phone-narrow popup, for the horizontal-overflow sweep's worst case. */
const NARROW_WINDOW = "w-[420px] max-w-none";
/** Short enough that any category's content overflows it. */
const FORCE_OVERFLOW = "h-[240px] max-h-none";

function Harness({ searchable = true, popupClassName }: { searchable?: boolean; popupClassName?: string }) {
  const [open, setOpen] = useState(true);
  const [paste, setPaste] = useState(false);
  const [binding, setBinding] = useState("pan-down");
  return (
    <SettingsView
      open={open}
      onOpenChange={setOpen}
      presentation="dialog"
      searchable={searchable}
      popupClassName={popupClassName}
      categories={CATEGORIES({ paste, setPaste, binding, setBinding })}
      testIdPrefix={P}
    />
  );
}

/** Every category's rows, swept, asserting whatever the caller checks. */
async function forEachCategory(check: (label: string) => Promise<void>): Promise<void> {
  const labels = navRows().map((r) => r.textContent ?? "");
  for (let i = 0; i < labels.length; i++) {
    await userEvent.click(navRows()[i]);
    await waitFor(() => expect(all('[data-slot="settings-section"]').length).toBeGreaterThan(0));
    await check(labels[i]);
  }
}

/** The pane never scrolls sideways, and nothing pokes out of its right edge. */
async function expectNoSidewaysScroll(where: string): Promise<void> {
  const viewport = paneViewport();
  // Base UI writes `overflow: scroll` INLINE on its viewport (measured), so the
  // clamp needs Tailwind's important modifier to outrank it — a plain
  // `overflow-x-hidden` utility loses to the inline declaration and the pane
  // silently keeps a horizontal scroller. That is precisely the bug this file
  // exists to prevent, so it is asserted, not assumed.
  await expect(getComputedStyle(viewport).overflowX, `overflow-x at ${where}`).toBe("hidden");
  await expect(viewport.scrollWidth - viewport.clientWidth, `horizontal overflow at ${where}`).toBe(0);
  const right = viewport.getBoundingClientRect().right;
  const worst = Math.max(
    0,
    ...Array.from(viewport.querySelectorAll("*")).map((el) => el.getBoundingClientRect().right - right),
  );
  await expect(worst, `widest overhang at ${where}`).toBeLessThanOrEqual(1);
}

const view = () => document.querySelector<HTMLElement>(`[data-testid="${P}"]`)!;
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(`[data-testid="${P}"] ${sel}`);
const all = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${P}"] ${sel}`));
const navRows = () => all('[data-slot="settings-nav"] button[data-slot="button"]');
/** The element that actually scrolls — ScrollArea's viewport, not its root. */
const paneViewport = () =>
  q<HTMLElement>('[data-slot="settings-pane"]')!.closest('[data-slot="scroll-area"]')!
    .querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;

async function mounted() {
  // findBy-style wait first: every negative assertion after this would pass
  // vacuously against an unmounted story (CLAUDE.md, "A play function's first
  // testing-library call should be findBy*").
  await waitFor(() => expect(document.querySelector(`[data-testid="${P}"]`)).not.toBeNull());
  await waitFor(() => expect(navRows().length).toBeGreaterThan(0));
}

/**
 * Complaint 2 — "All the section son the left navigator should have icons".
 * Measured, not counted: an `<svg>` can be present and 0x0, which is exactly
 * how this would regress if a future pass dropped the icon's sizing class.
 */
export const EveryNavRowHasAVisibleIcon: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    const rows = navRows();
    await expect(rows).toHaveLength(6);
    for (const row of rows) {
      const svg = row.querySelector("svg");
      await expect(svg, `${row.textContent} has no icon`).not.toBeNull();
      const box = svg!.getBoundingClientRect();
      await expect(box.width, `${row.textContent} icon is ${box.width}px wide`).toBeGreaterThanOrEqual(12);
      await expect(box.height).toBeGreaterThanOrEqual(12);
      // The icon leads the row: its left edge is left of the label's.
      const label = row.querySelector("span")!.getBoundingClientRect();
      await expect(box.left).toBeLessThan(label.left);
    }
  },
};

/** The nav is grouped, the way Obsidian's is, and a heading sits above the
 *  rows it opens rather than anywhere else in the column. */
export const NavIsGrouped: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    const headings = all('[data-slot="settings-nav-group"]');
    await expect(headings.map((h) => h.textContent)).toEqual(["Options", "App"]);
    const rows = navRows();
    const optionsTop = headings[0].getBoundingClientRect().top;
    const appTop = headings[1].getBoundingClientRect().top;
    // Five categories under Options, About under App.
    await expect(rows[0].getBoundingClientRect().top).toBeGreaterThan(optionsTop);
    await expect(rows[4].getBoundingClientRect().top).toBeLessThan(appTop);
    await expect(rows[5].getBoundingClientRect().top).toBeGreaterThan(appTop);
    await expect(rows[5].textContent).toContain("About");
  },
};

/**
 * THE row — the complaint Zach did not name and the one that made the panel
 * read as unfinished. For a narrow control the name sits LEFT of the control
 * and their vertical bands overlap; for a wide one the control sits BELOW.
 */
export const RowPutsTheControlBesideTheName: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    await userEvent.click(navRows()[3]); // Connections — one switch row
    await waitFor(() => expect(q('[data-section-id="allowFanIn"]')).not.toBeNull());

    const row = q<HTMLElement>('[data-section-id="allowFanIn"]')!;
    const name = row.querySelector<HTMLElement>('[data-slot="field-content"]')!.getBoundingClientRect();
    const control = row.querySelector<HTMLElement>('[data-slot="settings-control"]')!.getBoundingClientRect();

    // Beside, not below: the control starts to the RIGHT of the name column's
    // right edge, and the two share vertical space.
    await expect(control.left).toBeGreaterThanOrEqual(name.right - 1);
    await expect(Math.min(name.bottom, control.bottom) - Math.max(name.top, control.top)).toBeGreaterThan(0);
    // The name column takes the bulk of the row — Obsidian's proportion.
    await expect(name.width).toBeGreaterThan(control.width * 2);
    await expect(row.querySelector('[data-slot="field"]')).toHaveAttribute("data-orientation", "horizontal");

    // A WIDE control (the radio stack in General) stacks instead.
    await userEvent.click(navRows()[0]);
    await waitFor(() => expect(q('[data-section-id="file-navigation"]')).not.toBeNull());
    const wide = q<HTMLElement>('[data-section-id="file-navigation"]')!;
    const wideName = wide.querySelector<HTMLElement>('[data-slot="field-content"]')!.getBoundingClientRect();
    const wideCtl = wide.querySelector<HTMLElement>('[data-slot="settings-control"]')!.getBoundingClientRect();
    await expect(wideCtl.top).toBeGreaterThanOrEqual(wideName.bottom - 1);
    await expect(wide.querySelector('[data-slot="field"]')).toHaveAttribute("data-orientation", "vertical");

    // ...and the switch row's own switch is still operable after the relayout.
    await userEvent.click(navRows()[2]);
    await waitFor(() => expect(q('[data-section-id="paste-under-cursor"]')).not.toBeNull());
    const toggle = q<HTMLElement>('[data-section-id="paste-under-cursor"] [role="switch"]')!;
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(q('[data-section-id="paste-under-cursor"] [role="switch"]')).toHaveAttribute("aria-checked", "true"),
    );
  },
};

/**
 * Complaint 1b — "there shouldnt be a scroll bar at the bottom".
 *
 * The old pane set `overflow-y-auto` and nothing else, so `overflow-x`
 * computed to `auto` and a classic horizontal bar was one overflow away at any
 * width. This asserts the fix is STRUCTURAL: at six widths from a desktop
 * dialog down to a phone, the content pane's scrollWidth equals its
 * clientWidth exactly, and its computed overflow-x is `hidden`.
 */
export const NothingScrollsSideways: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    // The full-width dialog, every category — including Connections, whose
    // rows carry the longest descriptions in the app.
    await expect(view().getBoundingClientRect().width).toBe(1040);
    await forEachCategory((label) => expectNoSidewaysScroll(`1040px, ${label}`));
  },
};

/**
 * The same claim at a phone-narrow popup, where the 176px nav leaves the pane
 * barely 230px — the width at which a row that pushes instead of wrapping
 * would surface.
 */
export const NothingScrollsSidewaysWhenNarrow: Story = {
  render: () => <Harness popupClassName={NARROW_WINDOW} />,
  play: async () => {
    await mounted();
    const rect = view().getBoundingClientRect();
    // Guard against a vacuous pass: if the mount-time class did not take, this
    // story would silently be a duplicate of the one above.
    await expect(Math.round(rect.width), "narrow mount did not apply").toBe(420);
    await expect(paneViewport().clientWidth).toBeLessThan(280);
    await forEachCategory((label) => expectNoSidewaysScroll(`420px, ${label}`));
    // The nav truncates rather than pushing — the other way a sideways
    // scrollbar gets back in.
    const nav = q<HTMLElement>('[data-slot="settings-sidebar"]')!.getBoundingClientRect();
    for (const row of navRows()) {
      await expect(row.getBoundingClientRect().right, `nav row overhang: ${row.textContent}`)
        .toBeLessThanOrEqual(nav.right + 1);
    }
  },
};

/**
 * Complaints 1a + 3 — "Seems to skinny" and "The height should be limited in
 * this modal view". One `min()` rule per axis has to satisfy both: take the
 * space when there is space, shrink when there is not, always leave a gutter.
 */
export const WindowTakesTheSpaceButStaysBounded: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    const rect = view().getBoundingClientRect();
    // In this 414x896 frame the width rule resolves to the viewport minus its
    // 4rem gutter, NOT to a 512px constant — which is what "too skinny" was.
    await expect(rect.width).toBe(Math.min(1040, window.innerWidth - 64));
    await expect(rect.height).toBe(Math.min(720, window.innerHeight - 64));
    // Bounded on both axes, with a real gutter, and centred.
    await expect(rect.width).toBeLessThanOrEqual(window.innerWidth - 32);
    await expect(rect.height).toBeLessThanOrEqual(window.innerHeight - 32);
    await expect(Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2)).toBeLessThanOrEqual(2);

    // The pane, not the popup, is what scrolls: content taller than the frame
    // leaves the popup's own height untouched.
    await userEvent.click(navRows()[0]);
    await waitFor(() => expect(q('[data-section-id="allow-any-path"]')).not.toBeNull());
    await expect(view().getBoundingClientRect().height).toBe(rect.height);
    await expect(paneViewport().scrollHeight).toBeGreaterThan(0);
  },
};

/**
 * The SHORT window (1366x720) and the narrow one. The height rule must shrink
 * the popup rather than let it run off the bottom, and the nav must not push
 * the content pane out of the popup at a narrow width.
 */
/** Shared body for the two window-size stories. */
async function expectWindow(label: string, w: number, h: number): Promise<void> {
  await mounted();
  const rect = view().getBoundingClientRect();
  await expect(Math.round(rect.width), `width at ${label}`).toBe(w);
  await expect(Math.round(rect.height), `height at ${label}`).toBe(h);

  // The content pane still exists and still has room.
  const viewport = paneViewport();
  await expect(viewport.clientWidth, `pane width at ${label}`).toBeGreaterThan(200);
  await expect(viewport.scrollWidth - viewport.clientWidth, `overflow at ${label}`).toBe(0);
  // The nav never eats the pane: it stays a minority of the popup.
  const nav = q<HTMLElement>('[data-slot="settings-sidebar"]')!.getBoundingClientRect();
  await expect(nav.width, `nav share at ${label}`).toBeLessThan(rect.width / 2);
  // Every nav row is still fully inside the nav — a label that pushed instead
  // of truncating is how the horizontal scrollbar gets back in.
  for (const row of navRows()) {
    await expect(row.getBoundingClientRect().right, `nav row overhang at ${label}`)
      .toBeLessThanOrEqual(nav.right + 1);
  }
}

/**
 * THE short window: 720 tall minus the 4rem gutter is 656, so the rule must
 * SHRINK the popup rather than let a 720px dialog run off the bottom of a
 * 720px screen. Zach: "The height should be limited in this modal view."
 */
export const AtAShortWindow: Story = {
  render: () => <Harness popupClassName={SHORT_WINDOW} />,
  play: async () => {
    await expectWindow("1366x720", 1040, 656);
  },
};

/** A small window on both axes — the width rule gives up its ideal too. */
export const AtASmallWindow: Story = {
  render: () => <Harness popupClassName={SMALL_WINDOW} />,
  play: async () => {
    await expectWindow("900x640", 836, 576);
  },
};

/**
 * P2 — search. Filters rows in place, counts per category, highlights the hit,
 * hides categories with nothing, and restores exactly on clear.
 */
export const SearchFiltersRowsInPlace: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    const before = navRows().map((r) => r.textContent);
    await expect(before).toHaveLength(6);
    await expect(all('[data-slot="settings-nav-count"]')).toHaveLength(0);

    const box = q<HTMLInputElement>('[data-slot="settings-search-input"]')!;
    await expect(box.placeholder).toBe("Search settings…");
    await userEvent.click(box);
    await userEvent.keyboard("alias");

    // Only the category that has a match survives, and it says how many.
    await waitFor(() => expect(navRows()).toHaveLength(1));
    await expect(navRows()[0].textContent).toContain("Hotkeys and aliases");
    const counts = all('[data-slot="settings-nav-count"]');
    await expect(counts).toHaveLength(1);
    await expect(counts[0].textContent).toBe("1");

    // The pane followed, even though "Hotkeys" was never clicked.
    await waitFor(() => expect(q('[data-section-id="tool-aliases"]')).not.toBeNull());
    await expect(all('[data-slot="settings-section"]')).toHaveLength(1);

    // The hit is marked, and the mark is inside the title, visible and non-zero.
    const mark = q<HTMLElement>('[data-slot="settings-match"]')!;
    await expect(mark.textContent).toBe("alias");
    await expect(mark.getBoundingClientRect().width).toBeGreaterThan(0);

    // A query matching a group name pulls its whole run.
    await userEvent.clear(box);
    await userEvent.keyboard("wheel");
    await waitFor(() => expect(q('[data-section-id="wheel-binding-wheelDown"]')).not.toBeNull());
    await expect(navRows().map((r) => r.textContent?.replace(/\d+$/, ""))).toEqual(["Mouse and scrolling"]);

    // Nothing at all → one honest empty state, no sections.
    await userEvent.clear(box);
    await userEvent.keyboard("zzzznothing");
    await waitFor(() => expect(q('[data-slot="settings-empty"]')).not.toBeNull());
    await expect(all('[data-slot="settings-section"]')).toHaveLength(0);
    await expect(navRows()).toHaveLength(0);

    // Clearing restores every category AND the counts disappear.
    await userEvent.clear(box);
    await waitFor(() => expect(navRows()).toHaveLength(6));
    await expect(navRows().map((r) => r.textContent)).toEqual(before);
    await expect(all('[data-slot="settings-nav-count"]')).toHaveLength(0);
    await expect(q('[data-slot="settings-match"]')).toBeNull();
  },
};

/**
 * Searching must not steal the category you chose, and Escape in the box
 * clears the box rather than closing the dialog.
 */
export const SearchRestoresYourCategoryAndEscapeClearsIt: Story = {
  render: () => <Harness />,
  play: async () => {
    await mounted();
    await userEvent.click(navRows()[3]); // Connections
    await waitFor(() => expect(q('[data-section-id="allowFanIn"]')).not.toBeNull());

    const box = q<HTMLInputElement>('[data-slot="settings-search-input"]')!;
    await userEvent.click(box);
    await userEvent.keyboard("alias");
    // The filter moved the pane off Connections, because Connections has no hit.
    await waitFor(() => expect(q('[data-section-id="tool-aliases"]')).not.toBeNull());

    // Escape clears the box and the dialog stays open...
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(box.value).toBe(""));
    await expect(document.querySelector(`[data-testid="${P}"]`)).not.toBeNull();
    // ...and we are back on the category we picked, not stranded on Hotkeys.
    await waitFor(() => expect(q('[data-section-id="allowFanIn"]')).not.toBeNull());
    await expect(navRows()[3]).toHaveAttribute("aria-current", "page");

    // A second Escape, with the box already empty, closes as it always has.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector(`[data-testid="${P}"]`)).toBeNull());
  },
};

/** `searchable` is opt-in: a host with three settings gets no search box. */
export const SearchIsOptIn: Story = {
  render: () => <Harness searchable={false} />,
  play: async () => {
    await mounted();
    await expect(q('[data-slot="settings-search"]')).toBeNull();
    await expect(navRows()).toHaveLength(6);
    // Everything else is identical — the nav still groups and still has icons.
    await expect(all('[data-slot="settings-nav-group"]')).toHaveLength(2);
    await expect(all('[data-slot="settings-nav"] button svg')).toHaveLength(6);
  },
};

/**
 * The scrollbar is the stock ScrollArea's, and it is REAL — the
 * `data-horizontal:`/`data-vertical:` trap in the donor ships one that is 0px
 * wide, which no presence check would catch.
 */
export const ScrollbarIsStockAndHasWidth: Story = {
  // Base UI mounts a scrollbar only when that axis actually overflows
  // (measured: with content shorter than the pane, `[data-slot=
  // scroll-area-scrollbar]` has ZERO instances). So the popup is mounted
  // SHORT — otherwise this story would assert against an empty DOM and pass
  // vacuously, which is exactly the failure mode it exists to catch.
  render: () => <Harness popupClassName={FORCE_OVERFLOW} />,
  play: async () => {
    await mounted();
    await userEvent.click(navRows()[0]);
    await waitFor(() => expect(q('[data-section-id="allow-any-path"]')).not.toBeNull());

    const viewport = paneViewport();
    await waitFor(() => expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight));

    const bar = await waitFor(() => {
      const el = q<HTMLElement>('[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]');
      expect(el).not.toBeNull();
      return el!;
    });
    // THE assertion. The donor styles this behind `data-horizontal:` /
    // `data-vertical:`, which never match Base UI's `data-orientation=…` DOM,
    // so an uncorrected copy ships a scrollbar 0px wide — present in the DOM,
    // invisible on screen, and green under any presence check. `w-2.5` is 10px.
    await expect(bar.getBoundingClientRect().width).toBeGreaterThanOrEqual(8);
    await expect(q('[data-slot="scroll-area-thumb"]')).not.toBeNull();
    await expect(q<HTMLElement>('[data-slot="scroll-area-thumb"]')!.getBoundingClientRect().height)
      .toBeGreaterThan(0);

    // Overlaid, not gutter-stealing — Obsidian's treatment, and the reason the
    // old classic scrollbar felt bolted on. The viewport keeps its full width.
    await expect(viewport.offsetWidth - viewport.clientWidth).toBe(0);
    // And it never produces a HORIZONTAL bar, whatever the vertical one does.
    await expect(all('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]')).toHaveLength(0);
  },
};
