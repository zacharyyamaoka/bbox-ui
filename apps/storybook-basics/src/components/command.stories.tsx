import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

/**
 * Stock shadcn `base-nova` Command (components/command.tsx — cmdk inside Base
 * UI's Dialog). `quickSwitcher.tsx` is the app's consumer and turns cmdk's own
 * filter OFF (`shouldFilter={false}`) so the token-aware matching rule in
 * `commandModel.ts` can own the result set. These stories are the opposite
 * end: the bare primitive with cmdk's stock behaviour left on, so the parts
 * the app leans on — roving selection, the built-in filter, the empty state,
 * what `CommandDialog` portals — are pinned somewhere.
 */
const meta = {
  title: "Components/Stock/Command",
  tags: ["object:stock", "lane:baseline"],
  component: Command,
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

function Palette() {
  return (
    <Command className="w-80 border border-border">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Boards">
          <CommandItem>Arm teleop</CommandItem>
          <CommandItem>Sorting line</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Commands">
          <CommandItem>
            Zoom to fit
            <CommandShortcut>⇧1</CommandShortcut>
          </CommandItem>
          <CommandItem disabled>
            Undo
            <CommandShortcut>⌘Z</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** Grouped rows, a separator, shortcuts, a disabled row — and cmdk's roving
 *  selection, which is the bookkeeping the donor palette hand-rolled. */
export const Grouped: Story = {
  render: () => <Palette />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = [...canvasElement.querySelectorAll("[cmdk-group-heading]")].map(
      (heading) => heading.textContent,
    );
    await expect(headings).toEqual(["Boards", "Commands"]);
    await expect(canvas.getByRole("option", { name: /Zoom to fit/ })).toHaveTextContent("⇧1");
    await expect(canvas.getByRole("option", { name: /Undo/ })).toHaveAttribute("data-disabled", "true");

    // cmdk selects the first row on mount and moves that selection with the
    // arrow keys, on its own listbox — nothing here tracks an active index.
    await expect(canvas.getByRole("option", { name: /Arm teleop/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const input = canvas.getByRole("combobox");
    input.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(canvas.getByRole("option", { name: /Sorting line/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  },
};

/** cmdk's built-in filter and the `CommandEmpty` fallback — the behaviour
 *  `quickSwitcher.tsx` opts out of, kept honest here. */
export const Filtering: Story = {
  render: () => <Palette />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");

    await userEvent.click(input);
    await userEvent.type(input, "zoom");
    // A filtered-out row is GONE, not merely dimmed.
    await waitFor(() => expect(canvas.queryByText("Arm teleop")).toBeNull());
    await expect(canvas.getByRole("option", { name: /Zoom to fit/ })).toBeInTheDocument();
    await expect(canvas.queryByText("No results found.")).toBeNull();

    await userEvent.clear(input);
    await userEvent.type(input, "xyzzy");
    await waitFor(() => expect(canvas.getByText("No results found.")).toBeInTheDocument());
    await expect(canvas.queryAllByRole("option")).toHaveLength(0);
  },
};

/** `CommandDialog` — the palette shape: the same list, portalled into a
 *  Base UI dialog with the title/description pair kept screen-reader-only. */
export const InADialog: Story = {
  render: () => (
    <CommandDialog defaultOpen title="Board actions" description="Search boards and commands.">
      <Palette />
    </CommandDialog>
  ),
  play: async () => {
    await waitFor(() =>
      expect(document.body.querySelector('[data-slot="dialog-content"]')).not.toBeNull(),
    );
    const content = document.body.querySelector('[data-slot="dialog-content"]');
    if (!(content instanceof HTMLElement)) {
      throw new Error("expected CommandDialog to portal a dialog popup");
    }
    const popup = within(content);
    await expect(popup.getByRole("combobox")).toBeInTheDocument();
    await expect(popup.getByRole("option", { name: /Arm teleop/ })).toBeInTheDocument();

    // The title reaches assistive tech only — the visible surface is the list.
    const title = document.body.querySelector('[data-slot="dialog-title"]');
    await expect(title?.textContent).toBe("Board actions");
    await expect(title?.closest('[data-slot="dialog-header"]')?.className).toContain("sr-only");

    // Stock default: `showCloseButton` is false, so there is no X in the
    // corner — the palette closes on Escape or on a pick, like the donor's.
    await expect(content.querySelector('[data-slot="dialog-close"]')).toBeNull();
  },
};
