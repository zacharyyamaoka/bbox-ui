import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { SplitButton } from "./splitButton";

/**
 * "Merge ▾" (docs/menus/screenshots/09-draft-title-bar.png) — GitHub's
 * merge-button shape, "the shape Zach specifically asked for" (donor
 * comment, DraftModeBar.tsx:102-103): a solid primary segment plus a
 * chevron opening a small menu of alternates, composed from this kit's own
 * `Button` + `DropdownMenu` rather than the donor's hand-rolled
 * `useOutsideDismiss` popup.
 */
const meta = {
  title: "Basics/SplitButton",
  component: SplitButton,
  args: {
    label: "Merge",
    onPrimary: fn(),
    items: [{ id: "rebase", label: "Rebase", onSelect: fn() }],
  },
} satisfies Meta<typeof SplitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const rebaseItem = { id: "rebase", label: "Rebase", onSelect: fn() };

/** The normal state — both segments live, both fully accented. */
export const Normal: Story = {
  args: {
    label: "Merge",
    onPrimary: fn(),
    items: [rebaseItem],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Merge" }));
    await expect(args.onPrimary).toHaveBeenCalledTimes(1);
  },
};

/**
 * The blocked state — ported verbatim from drafts.css:632-655's own WHY:
 * `hasConflict` is only ever advisory, so the primary segment stays
 * genuinely clickable even while it reads as muted; the chevron keeps its
 * accent specifically to point at Rebase as the way forward. This is a
 * LOOK, not a lock — see the click assertion below.
 */
export const Blocked: Story = {
  args: {
    label: "Merge",
    onPrimary: fn(),
    items: [rebaseItem],
    state: "blocked",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const primary = canvas.getByRole("button", { name: "Merge" });
    const chevron = canvas.getByRole("button", { name: "Merge options" });

    // Blocked is advisory, not a lock: the primary segment is NOT disabled.
    await expect(primary).toBeEnabled();
    await userEvent.click(primary);
    await expect(args.onPrimary).toHaveBeenCalledTimes(1);

    // The muted/accent split IS the "points at Rebase" affordance: the
    // primary segment drops to the muted `secondary` look while blocked,
    // but the chevron segment keeps `default`'s accent fill.
    await expect(primary.className).toContain("bg-secondary");
    await expect(chevron.className).toContain("bg-primary");
  },
};

/** The disabled state — both segments greyed, neither responds. */
export const Disabled: Story = {
  args: {
    label: "Merge",
    onPrimary: fn(),
    items: [rebaseItem],
    state: "disabled",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Merge" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Merge options" })).toBeDisabled();
  },
};

/** All three states side by side — the comparison the review actually
 *  needs, not one story per state read in isolation. */
export const AllStates: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["normal", "blocked", "disabled"] as const).map((state) => (
        <div key={state} className="flex flex-col items-center gap-1">
          <SplitButton label="Merge" onPrimary={fn()} items={[{ id: "rebase", label: "Rebase", onSelect: fn() }]} state={state} />
          <span className="text-muted-foreground text-xs">{state}</span>
        </div>
      ))}
    </div>
  ),
};

/** The chevron opens a real `DropdownMenu` — Escape closes it, selecting an
 *  item both closes the menu and fires that item's own callback. */
function InteractiveDemo() {
  const [status, setStatus] = useState("idle");
  return (
    <div className="flex flex-col items-start gap-2">
      <SplitButton
        label="Merge"
        onPrimary={() => setStatus("merged")}
        items={[{ id: "rebase", label: "Rebase", onSelect: () => setStatus("rebased") }]}
      />
      <span className="text-muted-foreground text-xs">status: {status}</span>
    </div>
  );
}

export const MenuInteraction: Story = {
  render: () => <InteractiveDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const chevron = canvas.getByRole("button", { name: "Merge options" });

    await userEvent.click(chevron);
    await waitFor(() => expect(body.getByText("Rebase")).toBeInTheDocument());

    await userEvent.click(body.getByText("Rebase"));
    await waitFor(() => expect(canvas.getByText("status: rebased")).toBeInTheDocument());
    // The popup's own `data-closed:animate-out` (dropdown-menu.tsx) keeps the
    // node mounted for its exit transition — `waitFor` here, same as every
    // other close assertion in this suite (DropdownMenu.stories.tsx,
    // ContextMenu.stories.tsx), rather than asserting synchronously against
    // an animation still in flight.
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    });
  },
};

/** Every `size` rung side by side (`ButtonToggleSize`, barSize.tsx). */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["sm", "default", "lg"] as const).map((size) => (
        <SplitButton key={size} label="Merge" onPrimary={fn()} items={[{ id: "rebase", label: "Rebase", onSelect: fn() }]} size={size} />
      ))}
    </div>
  ),
};
