import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/**
 * Stock shadcn `base-nova` Dialog (components/dialog.tsx) — the shell the
 * Settings surface (settings-kit) mounts as its centred "dialog" mode. This
 * story only exercises the primitive itself: open on trigger click, the
 * title/description pair, and Escape closing it — settingsView.tsx owns
 * the actual settings content.
 */
const meta = {
  title: "Components/Stock/Dialog",
  tags: ["object:stock", "lane:baseline"],
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename board</DialogTitle>
          <DialogDescription>Give this board a new name.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    });
    await expect(document.body.querySelector('[data-slot="dialog-title"]')?.textContent).toBe("Rename board");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });
  },
};
