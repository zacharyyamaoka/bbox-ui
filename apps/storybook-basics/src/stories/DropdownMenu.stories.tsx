import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EllipsisVertical } from "lucide-react";

import { Button } from "../components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";

/**
 * The burger/kebab menu — React Flow UI's own "Node With Actions" demo
 * composes it from plain shadcn: `DropdownMenuTrigger asChild` wrapping a
 * ghost icon `Button`, an `EllipsisVertical` glyph, `DropdownMenuContent` for
 * the popup body. Items are the honest ones given SystemSketch's real block
 * menu does Duplicate + Step into/out.
 *
 * WHY `DropdownMenuLabel` sits inside a `DropdownMenuGroup`: Base UI 1.8's
 * `Menu.GroupLabel` throws ("MenuGroupContext is missing") when rendered
 * outside `<Menu.Group>` — the copied shadcn registry component assumes
 * that wrapping, it just isn't in the snippet, so real usage supplies it.
 */
function KebabMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="More options">
            <EllipsisVertical />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Block</DropdownMenuLabel>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuItem>Step into</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: "Basics/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Click the kebab, see the realistic menu appear, press Escape, see it
 * close. Base UI's `DropdownMenuContent` portals to `document.body` (see
 * `MenuPrimitive.Portal` in dropdown-menu.tsx), so the popup never lands
 * inside `canvasElement` — every DOM query below goes through
 * `within(document.body)` instead.
 */
export const Default: Story = {
  render: () => <KebabMenu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const trigger = canvas.getByRole("button", { name: "More options" });
    await expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();

    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull();
    });
    await expect(body.getByText("Duplicate")).toBeInTheDocument();
    await expect(body.getByText("Step into")).toBeInTheDocument();
    await expect(body.getByText("Delete")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    });
  },
};
