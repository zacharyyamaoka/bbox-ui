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
  title: "Components/Text & Marks/InlineRename",
  tags: ["object:text-marks"],
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

/**
 * Authored whitespace survives, and an untouched field with whitespace in it
 * still counts as untouched.
 *
 * This is the regression test the suite did not have. Every other story here
 * uses a value with no leading or trailing space, so none of them could see
 * that `commit()` validated and committed the same `.trim()`ed string: open a
 * rename on `"  Draft 1  "`, press Enter having typed nothing, and it fired
 * `onCommit("Draft 1")` — destroying characters the user authored, on a field
 * they never edited, because the trimmed draft compared unequal to the
 * untrimmed value and defeated the unchanged-cancels guard.
 *
 * Found by an independent Codex judge (2026-09-18) building its own fixture,
 * not by this suite. The two assertions below are deliberately BOTH here:
 * one pins the truthful-rendering rule (nothing silently edits what you
 * typed), the other pins the guard that the same bug broke.
 */
export const WhitespaceIsAuthoredText: Story = {
  args: {
    value: "  Draft 1  ",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox");
    // The field shows exactly what is stored — no normalization on the way in.
    await expect(input).toHaveValue("  Draft 1  ");

    // Untouched Enter is a dismiss, not a rename.
    await userEvent.keyboard("{Enter}");
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onCommit).not.toHaveBeenCalled();
  },
};

/**
 * A real edit keeps every character the user typed, trailing space included.
 * A host that wants names trimmed does it in its own `onCommit`, where it is
 * a visible decision rather than one this component made silently.
 */
export const EditedTextCommitsVerbatim: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "  Renamed  ");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCommit).toHaveBeenCalledWith("  Renamed  ");
  },
};

/**
 * Validation still reads the trimmed draft, so a name of pure whitespace is
 * refused exactly like an empty one — the half of the old `.trim()` that was
 * doing real work, kept.
 */
export const WhitespaceOnlyNameRefused: Story = {
  args: {
    value: "Draft 1",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "   ");
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByText("Give this draft a name.")).toBeInTheDocument();
    await expect(args.onCommit).not.toHaveBeenCalled();
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

/**
 * A name the editor cannot represent is refused, not flattened.
 *
 * A single-line `<input>` drops line breaks: assign "Frame\nTwo" and the
 * element reports "FrameTwo". Before this, appending one character committed
 * the flattened string — the user edited one character and silently lost
 * another. Documenting that in a comment protected nobody, since the person
 * losing the data never reads the source. Reproduced by an independent judge
 * (2026-09-18).
 */
export const LineBreakRefused: Story = {
  args: {
    value: "Frame\nTwo",
    onCommit: fn(),
    onCancel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox");
    await expect(canvas.getByText("This name contains a line break and can't be edited here.")).toBeInTheDocument();

    // The point is the REFUSAL: an edit that would commit the flattened
    // string must not reach the host at all.
    await userEvent.type(input, "!");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCommit).not.toHaveBeenCalled();
    await expect(args.onCancel).not.toHaveBeenCalled();
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
