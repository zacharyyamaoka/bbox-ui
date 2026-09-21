import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ArrowLeft, ArrowRight, Box, Frame, GitBranch, Home, Menu, MousePointer, Pencil, Plus, Square } from "lucide-react";

import { Bar, BAR_SIZES } from "./bar";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarLink, ToolbarSeparator } from "./toolbar";

/**
 * `Toolbar` is the roving-focus container underneath three of the nine
 * surfaces (docs/menus/screenshots): the bottom tool dock (04), the
 * top-left chrome bar (05), and — paired with `popover.tsx` — the floating
 * pill and rich-text row (01/02, see `Popover.stories.tsx`). This gallery
 * shows the container itself: grouping, separators, orientation, the size
 * cascade, and the roving-tabindex/arrow-key contract Base UI's
 * `Toolbar.Root` provides that a plain `<div className="flex">` of buttons
 * does not.
 */
const meta = {
  title: "Basics/Toolbar",
  component: Toolbar,
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Two groups, one separator, five buttons. Tab reaches the toolbar ONCE
 * (roving tabindex — only the active button is a tab stop); arrow keys move
 * focus between buttons without a second Tab press. This is the behavior a
 * plain flex row of `Button`s does not have.
 */
export const Default: Story = {
  render: () => (
    <Toolbar aria-label="Example toolbar">
      <ToolbarGroup>
        <ToolbarButton aria-label="Select" aria-pressed>
          <MousePointer />
        </ToolbarButton>
        <ToolbarButton aria-label="Frame">
          <Frame />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <ToolbarButton aria-label="Rectangle">
          <Square />
        </ToolbarButton>
        <ToolbarButton aria-label="Pencil">
          <Pencil />
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("button", { name: "Select" });
    const frame = canvas.getByRole("button", { name: "Frame" });
    const rectangle = canvas.getByRole("button", { name: "Rectangle" });

    // Roving tabindex: only the (first, absent an explicit pressed item)
    // button is a tab stop — every other button starts at tabindex="-1".
    await expect(select.getAttribute("tabindex")).toBe("0");
    await expect(frame.getAttribute("tabindex")).toBe("-1");

    select.focus();
    await expect(select).toHaveFocus();

    // ArrowRight moves focus WITHOUT a second Tab, crossing the
    // ToolbarSeparator between the two groups.
    await userEvent.keyboard("{ArrowRight}");
    await expect(frame).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(rectangle).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}");
    await expect(frame).toHaveFocus();
  },
};

/**
 * docs/menus/screenshots/04-bottom-tool-toolbar.png — the Figma-style dock.
 * `aria-pressed` on the active tool (Select, shown blue) is the only state
 * this needs; `toolbar.tsx`'s `ToolbarButton` styles `aria-pressed:` for
 * free, the same convention `toggle.tsx` already uses.
 */
export const BottomToolDock: Story = {
  render: () => (
    <Toolbar aria-label="Tools">
      <ToolbarGroup>
        <ToolbarButton aria-label="Select" aria-pressed>
          <MousePointer />
        </ToolbarButton>
        <ToolbarButton aria-label="Frame">
          <Frame />
        </ToolbarButton>
        <ToolbarButton aria-label="Insert shape">
          <Box />
        </ToolbarButton>
        <ToolbarButton aria-label="Rectangle">
          <Square />
        </ToolbarButton>
        <ToolbarButton aria-label="Pencil">
          <Pencil />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarButton aria-label="Add">
        <Plus />
      </ToolbarButton>
    </Toolbar>
  ),
};

/**
 * docs/menus/screenshots/05-chrome-bar.png — the top-left chrome bar.
 * `Toolbar` composes INSIDE a `Bar` slot (MENU-KIT-DESIGN.md §5: "`Toolbar`
 * composes INSIDE a Bar slot, never replaces it"), so this renders it as
 * `Bar`'s `left` content rather than standalone — back/forward is
 * `disabled`/`focusableWhenDisabled` on the boundary case (no history yet).
 */
export const ChromeBar: Story = {
  render: () => (
    <Bar
      left={
        <Toolbar aria-label="Navigation">
          <ToolbarButton aria-label="Menu">
            <Menu />
          </ToolbarButton>
          <ToolbarSeparator />
          <ToolbarButton aria-label="Back" disabled>
            <ArrowLeft />
          </ToolbarButton>
          <ToolbarButton aria-label="Forward">
            <ArrowRight />
          </ToolbarButton>
          <ToolbarButton aria-label="Home">
            <Home />
          </ToolbarButton>
        </Toolbar>
      }
      right={
        <Toolbar aria-label="Branch">
          <ToolbarButton aria-label="Main branch">
            <GitBranch />
            Main
          </ToolbarButton>
        </Toolbar>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const back = canvas.getByRole("button", { name: "Back" });
    // `focusableWhenDisabled` (Base UI's default, verified against
    // useFocusableWhenDisabled.js) keeps a disabled toolbar button as a
    // real, focusable `<button>` — it deliberately does NOT set the native
    // `disabled` attribute (that would drop it from the tab/arrow-key
    // sequence entirely), it sets `aria-disabled` instead so assistive tech
    // still hears "disabled" while arrow-key navigation keeps working.
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(back).not.toBeDisabled();
  },
};

/**
 * `orientation="vertical"` flips arrow-key axis to up/down, and
 * `ToolbarSeparator`'s own default flips WITH it — Base UI's contract is
 * "a horizontal toolbar renders vertical separators [and vice versa]"
 * (verified against ToolbarSeparator.d.ts), so the exact same
 * `<ToolbarSeparator />` markup as every horizontal story above draws a
 * horizontal rule here without any prop change.
 */
export const Vertical: Story = {
  render: () => (
    <Toolbar aria-label="Vertical toolbar" orientation="vertical">
      <ToolbarButton aria-label="Select" aria-pressed>
        <MousePointer />
      </ToolbarButton>
      <ToolbarButton aria-label="Frame">
        <Frame />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton aria-label="Pencil">
        <Pencil />
      </ToolbarButton>
    </Toolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("button", { name: "Select" });
    const frame = canvas.getByRole("button", { name: "Frame" });

    select.focus();
    // Vertical orientation flips the navigation axis: ArrowDown (not
    // ArrowRight) moves focus, matching a real up/down tool rail.
    await userEvent.keyboard("{ArrowDown}");
    await expect(frame).toHaveFocus();
  },
};

/**
 * `ToolbarLink` — the one non-`<button>` roving-focus item (Base UI's
 * `Toolbar.Link` renders an `<a>`). A toolbar mixing a real navigation link
 * with tool buttons — e.g. a "docs"/"help" link pinned at the end of a
 * dock — still gets ONE arrow-key sequence across both element types.
 */
export const WithLink: Story = {
  render: () => (
    <Toolbar aria-label="Toolbar with a link">
      <ToolbarButton aria-label="Select" aria-pressed>
        <MousePointer />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarLink href="https://example.com/docs">Docs</ToolbarLink>
    </Toolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByRole("button", { name: "Select" });
    const docs = canvas.getByRole("link", { name: "Docs" });

    select.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(docs).toHaveFocus();
  },
};

/**
 * Zach's size-cascade ask (bar.tsx, barSize.tsx): a `Toolbar`'s buttons
 * read their touch-target size off the ambient `Bar` they sit inside —
 * NONE of the four `ToolbarButton`s below pass their own `size` prop, only
 * the enclosing `Bar` does.
 */
export const SizeCascade: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {BAR_SIZES.map((size) => (
        <Bar
          key={size}
          size={size}
          left={
            <Toolbar aria-label={`${size} toolbar`}>
              <ToolbarButton aria-label={`${size} select`} aria-pressed>
                <MousePointer />
              </ToolbarButton>
              <ToolbarButton aria-label={`${size} frame`}>
                <Frame />
              </ToolbarButton>
            </Toolbar>
          }
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sm = canvas.getByRole("button", { name: "sm select" });
    const xl = canvas.getByRole("button", { name: "xl select" });
    // `sm` maps to Button's own `sm` rung, `xl` clamps to its largest (`lg`)
    // rung — barSize.tsx's `BAR_SIZE_TO_BUTTON_SIZE` table, same clamp
    // `button.tsx` itself already applies.
    await expect(sm.dataset.size).toBe("sm");
    await expect(xl.dataset.size).toBe("lg");
  },
};
