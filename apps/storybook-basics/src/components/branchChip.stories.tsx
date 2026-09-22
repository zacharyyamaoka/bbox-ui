import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { BranchChip, type DraftSummary } from "./branchChip";

/**
 * `BranchChip` (branchChip.tsx), colocated — the "Main ▾" / "Draft 1 (1) ▾"
 * selector beside the file title, ported from SystemSketch's
 * `DraftsControl.tsx`.
 *
 * WHY this file exists beside src/editor/ChromeBar.stories.tsx, which also
 * renders it: that page asks "does the chip compose into the chrome bar,
 * and does it re-skin through `renderTrigger`". This one is the component's
 * own INTERNAL contract — the row marks, the explicit accessible name, the
 * two-step discard and its blur reset, the rename round-trip — the parts a
 * host never touches but a refactor can quietly break. Every story here
 * drives the real popover; nothing is a redraw.
 *
 * `popover.tsx` portals its content to `document.body`, so every assertion
 * about an OPEN popover queries `document.body`, never `canvasElement`.
 */

const threeDrafts: DraftSummary[] = [
  { id: "d1", name: "Draft 1", secondaryLabel: "based on Main · 2 minutes ago" },
  { id: "d2", name: "Pose retry", secondaryLabel: "based on Main · yesterday" },
  { id: "d3", name: "Calibration fix", secondaryLabel: "based on Main · 3 days ago" },
];

const meta = {
  title: "Components/Text & Marks/BranchChip",
  tags: ["object:text-marks"],
  component: BranchChip,
  args: {
    isDraftMode: false,
    draftCount: 0,
    activeDraftName: null,
    drafts: [],
    activeDraftId: null,
    onSwitchTo: fn(),
    onCreate: fn(),
    onRename: fn(),
    onDiscard: fn(),
  },
} satisfies Meta<typeof BranchChip>;

export default meta;
type Story = StoryObj<typeof meta>;

function all(selector: string): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(selector));
}

function requireEl<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`expected ${selector}`);
  return found;
}

/**
 * No drafts have ever been made. The popover still opens, still says
 * DRAFTS, and still offers the one action that CREATES something — the list
 * is empty, not the surface.
 *
 * The play function also pins the "you are here" vocabulary: with nothing
 * but Main, there is exactly ONE current dot and exactly ONE accent bar on
 * the whole surface. Two of either would mean the mark had started
 * describing something other than where you are.
 */
export const MainWithNoDrafts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Drafts · Main" }));

    await expect(body.getByTestId("branch-chip-select-main")).toBeInTheDocument();
    await expect(body.getByText("Drafts")).toBeInTheDocument();
    await expect(all('[data-slot="branch-chip-row"]')).toHaveLength(0);
    await expect(all('[data-slot="branch-chip-current-dot"]')).toHaveLength(1);
    await expect(all('[data-slot="branch-chip-current-bar"]')).toHaveLength(1);
    await expect(body.getByTestId("branch-chip-new-draft")).toBeInTheDocument();

    // Choosing Main reports `null` — the absence of a draft, not a draft
    // named "Main" — and closes the popover behind itself.
    await userEvent.click(body.getByTestId("branch-chip-select-main"));
    await expect(args.onSwitchTo).toHaveBeenCalledWith(null);
    await waitFor(async () => {
      await expect(all('[data-slot="branch-chip-list"]')).toHaveLength(0);
    });
  },
};

/**
 * The count badge is a summary of what EXISTS, so it is absent at zero
 * rather than showing "0" — the trigger reads "Main" alone until there is
 * something to count.
 */
export const TriggerCountBadge: Story = {
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <BranchChip {...args} />
      <BranchChip
        {...args}
        isDraftMode
        draftCount={threeDrafts.length}
        activeDraftName="Pose retry"
        drafts={threeDrafts}
        activeDraftId="d2"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvas.getByRole("button", { name: "Drafts · Main" });
    const draft = canvas.getByRole("button", { name: "Draft Pose retry" });

    await expect(main.querySelectorAll('[data-slot="badge"]')).toHaveLength(0);
    await expect(main).toHaveTextContent("Main");

    const badge = requireEl(draft, '[data-slot="badge"]');
    await expect(badge.textContent).toBe("3");
    await expect(draft).toHaveTextContent("Pose retry");

    // `data-active` is presence-only on purpose (branchChip.tsx's own WHY:
    // Tailwind's bare `data-active:` variant matches `"false"` too), so the
    // off-draft chip must not carry the attribute at all.
    await expect(main.hasAttribute("data-active")).toBe(false);
    await expect(draft.getAttribute("data-active")).toBe("true");
  },
};

/**
 * Three drafts, the second one current. The row mark, the accent bar and
 * the accessible name are all checked against the row they belong to, not
 * merely counted.
 *
 * The bar is SPATIAL — it is the left edge of the current row and nothing
 * else — so it is measured: flush with the row's own left edge, ~3px wide,
 * and inset vertically so it reads as a mark on the row rather than a
 * divider between rows.
 */
export const CurrentDraftIsMarked: Story = {
  args: {
    isDraftMode: true,
    draftCount: threeDrafts.length,
    activeDraftName: "Pose retry",
    drafts: threeDrafts,
    activeDraftId: "d2",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Draft Pose retry" }));

    const rows = await waitFor(() => {
      const found = all('[data-slot="branch-chip-row"]');
      if (found.length !== threeDrafts.length) throw new Error(`expected ${threeDrafts.length} rows, saw ${found.length}`);
      return found;
    });

    // Exactly one row is current, and it is the bound one.
    const current = rows.filter((row) => row.hasAttribute("data-current"));
    await expect(current).toHaveLength(1);
    await expect(current[0].querySelector('[data-testid="branch-chip-select-d2"]')).not.toBeNull();
    // Main is NOT current while a draft is.
    await expect(body.getByTestId("branch-chip-select-main").hasAttribute("data-current")).toBe(false);

    // The dot REPLACES the branch glyph on the current row, and appears
    // nowhere else (branchChip.tsx's `RowMark` WHY).
    await expect(all('[data-slot="branch-chip-current-dot"]')).toHaveLength(1);
    await expect(current[0].querySelector('[data-slot="branch-chip-current-dot"]')).not.toBeNull();

    // The explicit accessible name, comma-joined — the ported guard against
    // `<b>`/`<small>` concatenating to "Pose retrybased on Main · yesterday".
    await expect(body.getByRole("button", { name: "Pose retry, based on Main · yesterday" })).toBeInTheDocument();

    // Measured geometry for the accent bar.
    const bar = requireEl(current[0], '[data-slot="branch-chip-current-bar"]');
    const barBox = bar.getBoundingClientRect();
    const rowBox = current[0].getBoundingClientRect();
    await expect(Math.abs(barBox.left - rowBox.left)).toBeLessThan(1);
    await expect(barBox.width).toBeGreaterThan(2);
    await expect(barBox.width).toBeLessThan(4);
    await expect(barBox.top).toBeGreaterThan(rowBox.top);
    await expect(barBox.bottom).toBeLessThan(rowBox.bottom);
  },
};

/**
 * Rename in place. The pencil swaps the row for an `InlineRename` seeded
 * with the draft's current name; Enter commits it back through
 * `onRename(id, name)` — the id, so a host never has to match on the old
 * string it is in the middle of replacing.
 */
export const RenameARow: Story = {
  args: {
    isDraftMode: true,
    draftCount: threeDrafts.length,
    activeDraftName: "Draft 1",
    drafts: threeDrafts,
    activeDraftId: "d1",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Draft Draft 1" }));

    await userEvent.click(body.getByRole("button", { name: "Rename Pose retry" }));

    const input = await body.findByRole("textbox", { name: "Rename Pose retry" });
    await expect(input).toHaveValue("Pose retry");

    // WHY `skipClick` (inlineRename.tsx's `RENAME_MOUSEDOWN_GUARD_MS`): the
    // field swallows its own `mousedown` for a moment after mounting so a
    // rapid second click cannot collapse the selection it just made. The
    // field is already focused here, so clicking it again would only be
    // testing that guard's timing, not the rename.
    await userEvent.clear(input);
    await userEvent.type(input, "Pose retry v2{Enter}", { skipClick: true });

    await expect(args.onRename).toHaveBeenCalledWith("d2", "Pose retry v2");
  },
};

/**
 * Discard is a two-step confirm INLINE in the row — never a dialog (the
 * popover is already floating chrome above the canvas). The step that
 * usually goes untested is the reset: a half-armed "Discard?" must not
 * survive the row losing focus, or a later stray click lands on a confirm
 * the user forgot they armed.
 */
export const DiscardIsTwoStepAndResetsOnBlur: Story = {
  args: {
    isDraftMode: true,
    draftCount: threeDrafts.length,
    activeDraftName: "Draft 1",
    drafts: threeDrafts,
    activeDraftId: "d1",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole("button", { name: "Draft Draft 1" }));

    // 1. Arming it relabels the SAME button and gives it words.
    await userEvent.click(body.getByRole("button", { name: "Discard Calibration fix" }));
    const armed = await body.findByRole("button", { name: "Confirm discard Calibration fix" });
    await expect(armed).toHaveTextContent("Discard?");
    await expect(args.onDiscard).not.toHaveBeenCalled();

    // 2. Focus leaves the row → the confirm disarms itself.
    await userEvent.tab();
    await waitFor(async () => {
      await expect(body.getByRole("button", { name: "Discard Calibration fix" })).toBeInTheDocument();
    });
    await expect(body.queryByRole("button", { name: "Confirm discard Calibration fix" })).toBeNull();

    // 3. Two deliberate clicks discard exactly one draft, by id.
    await userEvent.click(body.getByRole("button", { name: "Discard Calibration fix" }));
    await userEvent.click(await body.findByRole("button", { name: "Confirm discard Calibration fix" }));
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
    await expect(args.onDiscard).toHaveBeenCalledWith("d3");
  },
};
