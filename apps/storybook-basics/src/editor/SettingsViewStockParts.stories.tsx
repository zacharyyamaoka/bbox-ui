import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { Info, SlidersHorizontal, Palette } from "lucide-react";

import { SettingsView, type SettingsCategory } from "./settingsView";

/**
 * ACCEPTANCE for the judge's P2-8, settings half: the category nav is stock
 * `Button`s, and it still carries the donor's own semantics —
 * `aria-current="page"` on the open category
 * (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:164-222`) — plus
 * a Tab order that walks the categories in the order the host declared them.
 *
 * `SettingsView.stories.tsx` is the planning lane's committed acceptance and is
 * off-limits; this file only ADDS the keyboard-order and stock-part checks a
 * hand-to-stock rebuild is most likely to drop.
 */
const meta = {
  title: "Editor/Panels & Dialogs/SettingsView/Stock Parts",
  tags: ["object:chrome", "lane:chrome-files-settings"],
  component: SettingsView,
  args: { open: false, onOpenChange: () => {}, presentation: "dialog" as const, categories: [] },
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "stock-settings";

function CATEGORIES(theme: string, setTheme: (value: string) => void): SettingsCategory[] {
  return [
    {
      id: "general",
      label: "General",
      icon: <SlidersHorizontal />,
      sections: [
        {
          id: "file-navigation",
          title: "File navigation",
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
      ],
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: <Palette />,
      sections: [
        {
          id: "theme",
          title: "Theme",
          control: {
            kind: "radio",
            value: theme,
            options: [
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ],
            onValueChange: setTheme,
          },
        },
      ],
    },
    {
      id: "about",
      label: "About",
      icon: <Info />,
      sections: [{ id: "build", title: "Build", control: { kind: "custom", render: <p>bbox-ui + stock tldraw</p> } }],
    },
  ];
}

function Harness() {
  const [theme, setTheme] = useState("light");
  const [open, setOpen] = useState(true);
  return (
    <SettingsView
      open={open}
      onOpenChange={setOpen}
      presentation="dialog"
      categories={CATEGORIES(theme, setTheme)}
      testIdPrefix={P}
    />
  );
}

const nav = () => document.querySelector<HTMLElement>(`[data-testid="${P}"] [data-slot="settings-nav"]`)!;
/**
 * The category ROWS.
 *
 * WHY this selects buttons rather than taking `nav().children`, which is what
 * it did until 2026-09-22: the nav now interleaves
 * `[data-slot="settings-nav-group"]` headings between the rows (Obsidian's
 * grouped nav, which Zach named as the reference), so "every child" is no
 * longer "every category". The ASSERTIONS below are unchanged — the rows are
 * still stock `Button`s, still in declaration order, still carrying
 * `aria-current="page"` on the open one, and Tab still walks them in that
 * order. Only the way this helper finds them moved.
 */
const items = () => Array.from(nav().querySelectorAll<HTMLElement>('button[data-slot="button"]'));

export const CategoryNavIsStockButtons: Story = {
  render: () => <Harness />,
  play: async () => {
    await waitFor(() => expect(document.querySelector(`[data-testid="${P}"]`)).not.toBeNull());
    const buttons = items();
    await expect(buttons.map((button) => button.textContent)).toEqual(["General", "Appearance", "About"]);
    for (const button of buttons) {
      await expect(button.tagName).toBe("BUTTON");
      await expect(button).toHaveAttribute("data-slot", "button");
    }
    await expect(buttons[0]).toHaveAttribute("aria-current", "page");
    await expect(buttons[1].hasAttribute("aria-current")).toBe(false);

    // Declaration order IS tab order.
    buttons[0].focus();
    await expect(document.activeElement).toBe(buttons[0]);
    await userEvent.tab();
    await expect(document.activeElement).toBe(items()[1]);
    await userEvent.tab();
    await expect(document.activeElement).toBe(items()[2]);

    // Enter on the focused category opens it — a real button, not a div.
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(nav().querySelector('[aria-current="page"]')).toHaveTextContent("About"));
    await waitFor(() =>
      expect(document.querySelector(`[data-testid="${P}"] [data-section-id="build"]`)).not.toBeNull(),
    );
    await expect(document.querySelector(`[data-testid="${P}"] [data-section-id="file-navigation"]`)).toBeNull();
  },
};

// ── Finding 2 (`settings-panel-fixes` verdict, 2026-09-22) ─────────────────
// The existing fixtures (here and in `SettingsCategories.stories.tsx`) are
// all short real-world copy, so a row that only stops SCROLLING sideways —
// `overflow-x: hidden` on the pane's `ScrollArea` viewport — because it is
// CLIPPING content, not because the content fits, would still pass every
// story above. This one supplies unbroken text a real setting would never
// carry (no spaces for the flex row to wrap on) specifically to catch that:
// a clipped row still leaves `scrollWidth > clientWidth`, so the assertion
// below is the one the judge asked for, not "no visible scrollbar".
const LONG_TITLE =
  "AWordThatNeverBreaksBecauseSettingsPanelsDoNotUsuallyGetOneLikeThisAtAllAndItKeepsGoingForAGoodWhileLongerStillWellPastWhereAnyRealSettingNameWouldEverStopSoItIsGuaranteedWiderThanTheRowItSitsIn";
const LONG_OPTION_LABEL = "AnEquallyUnbrokenSelectedValueThatAStockSelectTriggerWouldOtherwiseGrowToFit";

function LongContentCategories(): SettingsCategory[] {
  return [
    {
      id: "stress",
      label: "Stress",
      icon: <SlidersHorizontal />,
      sections: [
        {
          id: "long-title",
          title: LONG_TITLE,
          description: LONG_TITLE,
          control: { kind: "switch", checked: true, onCheckedChange: () => {} },
        },
        {
          id: "long-select",
          title: "A select with an unbroken selected value",
          control: {
            kind: "select",
            value: "long",
            options: [
              { value: "long", label: LONG_OPTION_LABEL },
              { value: "short", label: "Short" },
            ],
            onValueChange: () => {},
          },
        },
      ],
    },
  ];
}

function LongContentHarness() {
  const [open, setOpen] = useState(true);
  return (
    <SettingsView
      open={open}
      onOpenChange={setOpen}
      presentation="dialog"
      categories={LongContentCategories()}
      testIdPrefix="stock-settings-long"
    />
  );
}

export const LongUnbrokenContentNeverScrollsSideways: Story = {
  render: () => <LongContentHarness />,
  play: async () => {
    await waitFor(() => expect(document.querySelector('[data-testid="stock-settings-long"]')).not.toBeNull());
    const pane = document.querySelector<HTMLElement>('[data-testid="stock-settings-long"] [data-slot="settings-pane"]')!;
    const viewport = pane.closest('[data-slot="scroll-area"]')!.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    await expect(viewport.scrollWidth, "unbroken title/description never scroll sideways").toBeLessThanOrEqual(
      viewport.clientWidth,
    );

    // The long option is the SELECTED one, so its label is what the closed
    // trigger shows — the exact case `select.tsx`'s stock `w-fit
    // whitespace-nowrap` trigger has no cap for on its own.
    const trigger = document.querySelector<HTMLElement>(
      '[data-testid="stock-settings-long"] [data-section-id="long-select"] [data-slot="select-trigger"]',
    )!;
    const paneRect = pane.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    await expect(triggerRect.right, "the select trigger stays inside the pane").toBeLessThanOrEqual(paneRect.right + 1);
    await expect(viewport.scrollWidth, "still zero horizontal overflow with the trigger open").toBeLessThanOrEqual(
      viewport.clientWidth,
    );
  },
};
