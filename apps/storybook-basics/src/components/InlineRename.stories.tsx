import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { InlineRename } from "./inlineRename";

/**
 * One text field replacing the two duplicated editors
 * (`DraftModeBar.tsx:394-423`, `DraftsControl.tsx:46-115` in the donor).
 * Renders: draft rename (bar + row), the frames-panel row rename, and the
 * branch chip (docs/menus/screenshots/05-chrome-bar.png). No F2 keybinding
 * lives here — that global gesture is host-owned, wired onto whatever
 * "begin renaming this thing" callback mounts this component.
 */
const meta = {
  title: "Basics/InlineRename",
  component: InlineRename,
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof InlineRename>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Enter commits the new value. */
export const CommitOnEnter: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Draft 2{Enter}");
    await expect(args.onCommit).toHaveBeenCalledWith("Draft 2");
  },
};

/** Blur also commits — the same contract as Enter, not a second path. */
export const CommitOnBlur: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    input.blur();
    await expect(args.onCommit).toHaveBeenCalledWith("Renamed");
  },
};

/** Escape reverts and calls `onCancel` — the typed text never commits. */
export const CancelOnEscape: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.type(input, " and more");
    await userEvent.keyboard("{Escape}");
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onCommit).not.toHaveBeenCalled();
  },
};

/** Committing with the value unchanged cancels rather than firing a no-op
 *  write (ported, DraftsControl.tsx:76). */
export const UnchangedValueCancels: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onCommit).not.toHaveBeenCalled();
  },
};

/** The default validator refuses an empty name with "Give this draft a
 *  name." and keeps editing open — neither callback fires. */
export const EmptyNameRefused: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByText("Give this draft a name.")).toBeInTheDocument();
    await expect(args.onCommit).not.toHaveBeenCalled();
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

/** A host-supplied `validate` swaps the policy without touching the
 *  Enter/Escape/blur mechanics — the file-rename call site wants its own
 *  wording, not a second component. */
export const CustomValidation: Story = {
  args: {
    value: "board",
    onCommit: fn(),
    onCancel: fn(),
    validate: (next: string) => (next.length < 3 ? "Name must be at least 3 characters." : null),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "ab{Enter}");
    await expect(canvas.getByText("Name must be at least 3 characters.")).toBeInTheDocument();
    await expect(args.onCommit).not.toHaveBeenCalled();
  },
};

/**
 * A controlled `error` (an async commit that failed after Enter already
 * ran) overrides the local validation message.
 */
function AsyncErrorDemo() {
  const [error, setError] = useState<string | null>(null);
  return (
    <InlineRename
      value="Draft 1"
      error={error}
      onCommit={(next) => setError(`"${next}" is already taken.`)}
      onCancel={() => setError(null)}
    />
  );
}

export const AsyncCommitError: Story = {
  render: () => <AsyncErrorDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Draft 2{Enter}");
    await waitFor(() => expect(canvas.getByText('"Draft 2" is already taken.')).toBeInTheDocument());
  },
};

/** The two size rungs side by side — `"bar"` (chrome bar, draft-mode bar)
 *  denser than `"row"` (frames panel, list rows). */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      {(["bar", "row"] as const).map((size) => (
        <div key={size} className="flex flex-col items-start gap-1">
          <InlineRename value="Draft 1" size={size} onCommit={fn()} onCancel={fn()} />
          <span className="text-muted-foreground text-xs">{size}</span>
        </div>
      ))}
    </div>
  ),
};
