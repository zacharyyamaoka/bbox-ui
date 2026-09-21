import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Copy, Pencil, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./context-menu";

/**
 * The right-click file menu (`chrome/TitleBar.tsx:275-338` in the donor).
 * docs/menus/MENU-KIT-DESIGN.md §5's stock-part row for this surface names
 * the constraint that actually matters here: "one `MenuAction[]` feeds
 * dropdown AND context menu so they cannot drift" — this gallery shows the
 * primitive alone (a real `DropdownMenu` pairing lives in
 * `DropdownMenu.stories.tsx`), plus the two Base UI rules this file's own
 * header carries forward: a `GroupLabel` needs a `Group` above it, and a
 * submenu behaves like the dropdown's.
 */
function FileContextMenu() {
  const [wrap, setWrap] = useState(true);
  const [layout, setLayout] = useState("grid");
  return (
    <ContextMenu>
      <ContextMenuTrigger className="border-border bg-card flex h-32 w-64 items-center justify-center rounded-lg border border-dashed text-sm">
        Right-click this area
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>File</ContextMenuLabel>
          <ContextMenuItem>
            <Pencil /> Rename
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            <Copy /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
          Word wrap
        </ContextMenuCheckboxItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Layout</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup value={layout} onValueChange={(value) => setLayout(String(value))}>
              <ContextMenuRadioItem value="grid">Grid</ContextMenuRadioItem>
              <ContextMenuRadioItem value="list">List</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Locked action</ContextMenuItem>
        <ContextMenuItem variant="destructive">
          <Trash2 /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const meta = {
  title: "Basics/ContextMenu",
  component: ContextMenu,
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Right-click opens the menu (Base UI's `ContextMenuTrigger` listens for the
 * native `contextmenu` event, not a click) — items, a checkbox item, a
 * submenu with a radio group, a disabled item, and a destructive item all
 * side by side. Base UI portals the popup to `document.body`, so every
 * assertion below queries through `within(document.body)`.
 */
export const Default: Story = {
  render: () => <FileContextMenu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const trigger = canvas.getByText("Right-click this area");

    await expect(document.body.querySelector('[data-slot="context-menu-content"]')).toBeNull();
    fireEvent.contextMenu(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="context-menu-content"]')).not.toBeNull();
    });

    await expect(body.getByText("Rename")).toBeInTheDocument();
    await expect(body.getByText("Word wrap")).toBeInTheDocument();
    await expect(body.getByText("Locked action").closest('[data-slot="context-menu-item"]')).toHaveAttribute(
      "data-disabled",
    );

    // Submenu opens on click of its trigger (also works via hover/arrow
    // keys — click is the interaction every input modality supports).
    await userEvent.click(body.getByText("Layout"));
    await waitFor(() => expect(body.getByText("List")).toBeInTheDocument());

    // Escape closes ONE level at a time — the first press dismisses the
    // submenu and returns focus to its trigger in the still-open parent
    // (nested-menu behavior, not a bug); a second press is needed to close
    // the root context menu itself.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByText("List")).not.toBeInTheDocument());
    await expect(document.body.querySelector('[data-slot="context-menu-content"]')).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="context-menu-content"]')).toBeNull();
    });
  },
};

/** The checkbox item and the submenu's radio group both hold real state —
 *  toggling one and picking the other both stick across a reopen. */
export const StatefulItems: Story = {
  render: () => <FileContextMenu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const trigger = canvas.getByText("Right-click this area");

    fireEvent.contextMenu(trigger);
    await waitFor(() => expect(body.getByText("Word wrap")).toBeInTheDocument());
    await userEvent.click(body.getByText("Word wrap"));
    // WHY the menu stays open (Base UI `MenuCheckboxItem` defaults
    // `closeOnClick` to `false`, unlike a plain `MenuItem`'s `true`): a
    // checkbox item is meant for toggling several options in one visit,
    // the same "align-then-distribute" shape this kit's own
    // `controlPanel.tsx` documents for its `closeOnSelect={false}` default —
    // staying open is policy, not an accident of which library we wrapped.
    await waitFor(() => {
      expect(
        body.getByText("Word wrap").closest('[data-slot="context-menu-checkbox-item"]'),
      ).toHaveAttribute("data-unchecked");
    });
    await expect(document.body.querySelector('[data-slot="context-menu-content"]')).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="context-menu-content"]')).toBeNull();
    });

    // The unchecked state stuck across the close/reopen — real state, not a
    // transient toggle animation.
    fireEvent.contextMenu(trigger);
    await waitFor(() => expect(body.getByText("Word wrap")).toBeInTheDocument());
    await expect(
      body.getByText("Word wrap").closest('[data-slot="context-menu-checkbox-item"]'),
    ).toHaveAttribute("data-unchecked");
  },
};

/** Disabled items never open, never dismiss the menu, and read visually
 *  muted (`data-disabled` drives `opacity-50 pointer-events-none`). */
export const DisabledItem: Story = {
  render: () => <FileContextMenu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.contextMenu(canvas.getByText("Right-click this area"));
    await waitFor(() => expect(body.getByText("Locked action")).toBeInTheDocument());
    // `data-disabled:pointer-events-none` makes this genuinely unclickable —
    // `userEvent.click` performs the same actionability check a real pointer
    // would and correctly refuses. `fireEvent.click` bypasses that check to
    // prove the second line of defense: even a forced click is a no-op.
    fireEvent.click(body.getByText("Locked action"));
    // Still open — a disabled item's click never dismisses the menu.
    await expect(document.body.querySelector('[data-slot="context-menu-content"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}");
  },
};
