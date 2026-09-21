import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";

import { Button } from "./button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./button-group";

/**
 * The back/forward pair (docs/menus/screenshots/05-chrome-bar.png) — plain
 * shadcn `ButtonGroup`, adjacent buttons collapsing their shared border into
 * one hairline and their inner corners into straight edges via the
 * `[&>[data-slot]...]` selectors in `button-group.tsx`, not a bespoke
 * "back-forward pair" component.
 */
const meta = {
  title: "Basics/ButtonGroup",
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Back/forward, `canGoBack`/`canGoForward` as plain disabled state — the
 *  host contract for the chrome bar (MENU-KIT-DESIGN.md §4) never gives
 *  this component more than that. */
export const BackForward: Story = {
  render: () => (
    <ButtonGroup aria-label="History">
      <Button variant="outline" size="icon" aria-label="Back" disabled>
        <ArrowLeft />
      </Button>
      <Button variant="outline" size="icon" aria-label="Forward">
        <ArrowRight />
      </Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Forward" })).toBeEnabled();
  },
};

/** Three-up, an icon-only split-decision toolbar-adjacent cluster. */
export const ThreeUp: Story = {
  render: () => (
    <ButtonGroup aria-label="Alignment">
      <Button variant="outline">Left</Button>
      <Button variant="outline">Center</Button>
      <Button variant="outline">Right</Button>
    </ButtonGroup>
  ),
};

/** `ButtonGroupText` — a non-interactive label segment fused into the same
 *  strip, e.g. a unit or a fixed prefix beside an editable segment. */
export const WithText: Story = {
  render: () => (
    <ButtonGroup aria-label="Zoom">
      <ButtonGroupText>Zoom</ButtonGroupText>
      <Button variant="outline">50%</Button>
      <Button variant="outline" size="icon" aria-label="More">
        <ChevronDown />
      </Button>
    </ButtonGroup>
  ),
};

/** `ButtonGroupSeparator` — an explicit hairline between two sub-clusters
 *  inside one strip, rather than the border-collapsing the adjacent-button
 *  case above relies on. */
export const WithSeparator: Story = {
  render: () => (
    <ButtonGroup aria-label="Grouped actions">
      <Button variant="outline">Cut</Button>
      <Button variant="outline">Copy</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Paste</Button>
    </ButtonGroup>
  ),
};

/** Vertical orientation — corners collapse top/bottom instead of
 *  left/right, and the shared border runs horizontal. */
export const Vertical: Story = {
  render: () => (
    <ButtonGroup aria-label="Stack" orientation="vertical" className="w-24">
      <Button variant="outline">Top</Button>
      <Button variant="outline">Middle</Button>
      <Button variant="outline">Bottom</Button>
    </ButtonGroup>
  ),
};

/** Every segment disabled — the strip reads uniformly muted, not a mix of
 *  disabled and enabled looks fighting each other. */
export const Disabled: Story = {
  render: () => (
    <ButtonGroup aria-label="Disabled example">
      <Button variant="outline" disabled>
        Left
      </Button>
      <Button variant="outline" disabled>
        Right
      </Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Left" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Right" })).toBeDisabled();
  },
};

/** Focus-visible ring on one segment paints above its neighbors
 *  (`*:focus-visible:relative *:focus-visible:z-10` in `button-group.tsx`)
 *  rather than being clipped by the adjacent button's own stacking. */
export const FocusRing: Story = {
  render: () => (
    <ButtonGroup aria-label="Focus demo">
      <Button variant="outline">One</Button>
      <Button variant="outline">Two</Button>
      <Button variant="outline">Three</Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const one = canvas.getByRole("button", { name: "One" });
    one.focus();
    await expect(one).toHaveFocus();
  },
};
