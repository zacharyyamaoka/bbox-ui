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
  title: "Components/Panels & Dialogs/SettingsView/Stock Parts",
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
const items = () => Array.from(nav().children) as HTMLElement[];

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
