import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor } from "storybook/test";
import { Play } from "lucide-react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

/**
 * Every icon-only control in this app (the kebab, the blackbox `Toggle`,
 * this play `Button`) has no visible label — a hover hint is the standard
 * fix. `TooltipProvider` wraps the trigger/content pair per Base UI's
 * contract (it owns the shared open-delay); a real app would mount one
 * provider near its root instead of per-tooltip.
 */
const meta = {
  title: "Components/Stock/Tooltip",
  tags: ["object:stock", "lane:baseline"],
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnIconButton: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Play">
              <Play />
            </Button>
          }
        />
        <TooltipContent>Play</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector('[data-slot="tooltip-trigger"]');
    if (!(trigger instanceof HTMLElement)) throw new Error('expected a [data-slot="tooltip-trigger"]');

    await expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    await userEvent.hover(trigger);
    await waitFor(
      () => {
        expect(document.body.querySelector('[data-slot="tooltip-content"]')).not.toBeNull();
      },
      { timeout: 3000 },
    );
    await expect(document.body.querySelector('[data-slot="tooltip-content"]')?.textContent).toBe("Play");

    await userEvent.unhover(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    });
  },
};
