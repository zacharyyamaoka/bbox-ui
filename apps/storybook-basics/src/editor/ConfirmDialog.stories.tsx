import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "../components/button";
import { ConfirmDialog, useConfirm } from "./confirmDialog";

/**
 * The trunk's confirmation surface — the "are you sure?" every host needs
 * before a destructive file command (Move to Trash, Replace, discard).
 *
 * WHY it lives here and not in `apps/systemsketch`: Zach, 2026-09-19 — "all of
 * the feedback regarding the chrome should be made in bbox-ui
 * editor-components, not in system sketch, system sketch should just be kinda
 * like importing these stock menus and doing a light bit of configuration".
 * The app used to author this dialog's header, body, footer, both buttons and
 * its dismissal itself; now it passes a message and gets a promise.
 *
 * ACCEPTANCE for the judge's P2-7. The part this story exists to pin is not
 * the markup — it is the LATCH: a dismissal (Escape, the ×, the backdrop) and
 * a click must settle the promise exactly once, because the caller is a file
 * command and a double-settle is a file command that runs twice.
 */
const meta = {
  title: "Editor/Panels & Dialogs/ConfirmDialog",
  tags: ["object:chrome", "lane:chrome-files-settings"],
  component: ConfirmDialog,
  args: {
    open: false,
    onOpenChange: () => {},
    onConfirm: () => {},
    title: "Move to Trash?",
    body: "“02_literal_argument.tldr” moves to the Trash.",
    confirmLabel: "Move to Trash",
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const P = "confirm";
const popup = () => document.querySelector<HTMLElement>(`[data-testid="${P}"]`);
const button = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${P}-${id}"]`);

/** A host exactly as thin as the real one: a message in, a boolean out. */
function HookHarness({ settled }: { settled: boolean[] }) {
  const { confirm, dialog } = useConfirm({ testIdPrefix: P });
  return (
    <>
      <Button
        onClick={() => {
          void confirm({
            title: "Move to Trash?",
            body: "“02_literal_argument.tldr” moves to the Trash.",
            confirmLabel: "Move to Trash",
            destructive: true,
          }).then((answer) => settled.push(answer));
        }}
      >
        Move to Trash…
      </Button>
      {dialog}
    </>
  );
}

const SETTLED: boolean[] = [];

/** The whole contract of the hook: message in, one boolean out, dialog gone. */
export const ConfirmResolvesTrueOnce: Story = {
  render: () => <HookHarness settled={SETTLED} />,
  play: async ({ canvasElement }) => {
    SETTLED.length = 0;
    await expect(popup()).toBeNull();
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Move to Trash…" }));

    const dialog = await waitFor(() => {
      const found = popup();
      expect(found).not.toBeNull();
      return found!;
    });
    await expect(dialog.querySelector('[data-slot="dialog-title"]')).toHaveTextContent("Move to Trash?");
    await expect(dialog.querySelector('[data-slot="dialog-description"]')).toHaveTextContent(
      "“02_literal_argument.tldr” moves to the Trash.",
    );
    await expect(button("cancel")).toHaveTextContent("Cancel");
    await expect(button("confirm")).toHaveTextContent("Move to Trash");

    await userEvent.click(button("confirm")!);
    await waitFor(() => expect(SETTLED).toEqual([true]));
    await waitFor(() => expect(popup()).toBeNull());
    // The latch: nothing else arrives after the dialog has gone.
    await new Promise((done) => setTimeout(done, 50));
    await expect(SETTLED).toEqual([true]);
  },
};

const DISMISSED: boolean[] = [];

/** Cancel, Escape and the × are three doors to the same single `false`. */
export const EveryDismissalResolvesFalseExactlyOnce: Story = {
  render: () => <HookHarness settled={DISMISSED} />,
  play: async ({ canvasElement }) => {
    DISMISSED.length = 0;
    const open = within(canvasElement).getByRole("button", { name: "Move to Trash…" });

    await userEvent.click(open);
    await waitFor(() => expect(popup()).not.toBeNull());
    await userEvent.click(button("cancel")!);
    await waitFor(() => expect(DISMISSED).toEqual([false]));
    await waitFor(() => expect(popup()).toBeNull());

    await userEvent.click(open);
    await waitFor(() => expect(popup()).not.toBeNull());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(DISMISSED).toEqual([false, false]));
    await waitFor(() => expect(popup()).toBeNull());

    await userEvent.click(open);
    const dialog = await waitFor(() => {
      const found = popup();
      expect(found).not.toBeNull();
      return found!;
    });
    await userEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => expect(DISMISSED).toEqual([false, false, false]));

    // Three prompts, three answers — never a fourth from a double-settle.
    await new Promise((done) => setTimeout(done, 50));
    await expect(DISMISSED).toEqual([false, false, false]);
  },
};

/** The component on its own: pure props, no hook — the data-driven surface. */
function ControlledHarness() {
  const [open, setOpen] = useState(true);
  const [answer, setAnswer] = useState<string>("pending");
  return (
    <>
      <p data-testid="answer">{answer}</p>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAnswer("cancelled");
        }}
        title="Replace “02_literal_argument.tldr”?"
        body="A file with that name already exists in this folder."
        confirmLabel="Replace"
        cancelLabel="Keep both"
        destructive
        testIdPrefix={P}
        onConfirm={() => {
          setAnswer("replaced");
          setOpen(false);
        }}
      />
    </>
  );
}

export const Controlled: Story = {
  render: () => <ControlledHarness />,
  play: async ({ canvasElement }) => {
    const dialog = await waitFor(() => {
      const found = popup();
      expect(found).not.toBeNull();
      return found!;
    });
    await expect(dialog.querySelector('[data-slot="dialog-title"]')).toHaveTextContent("Replace");
    await expect(button("cancel")).toHaveTextContent("Keep both");
    // `destructive` is the stock Button VARIANT, never a bespoke colour: the
    // class string is the registry's own (components/button.tsx `destructive`).
    await expect(button("confirm")!.className).toMatch(/bg-destructive\/10 text-destructive/);
    await expect(button("confirm")).toHaveAttribute("data-slot", "button");

    await userEvent.click(button("confirm")!);
    await waitFor(() => expect(within(canvasElement).getByTestId("answer")).toHaveTextContent("replaced"));
    await waitFor(() => expect(popup()).toBeNull());
  },
};
