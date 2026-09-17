import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { EditableText } from "../components/editableText";

/**
 * `EditableText` is controlled — the host owns `editing`/the value — so every
 * interactive story here wraps it in a small stateful component, same
 * pattern Block.stories.tsx's `ComposedWithBar` uses for real DOM assertions.
 *
 * `onChange` is write-through (fires on every keystroke, per editableText.tsx's
 * own contract) — so "Escape cancels" is a REVERT, not a no-op, and reverting
 * is explicitly the host's job (editableText.tsx: "The host decides what
 * reverting means"). `snapshotRef` holds the value from the moment editing
 * STARTED; `onCancel` restores it. Without this, Escape only closed the
 * editor while leaving whatever had already been typed in place — caught by
 * this file's own `EscapeCancels` play function actually running in the
 * browser, not by typechecking or a static render.
 */
function ControlledEditableText({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef(initial);
  return (
    <EditableText
      editing={editing}
      onChange={setValue}
      onCommit={(next) => {
        setValue(next);
        setEditing(false);
      }}
      onCancel={() => {
        setValue(snapshotRef.current);
        setEditing(false);
      }}
      onClick={() => {
        snapshotRef.current = value;
        setEditing(true);
      }}
    >
      {value}
    </EditableText>
  );
}

const meta = {
  title: "Basics/EditableText",
  component: EditableText,
  args: { children: "Title" },
} satisfies Meta<typeof EditableText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Resting state — looks like normal text, not editing. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');
    await expect(el.getAttribute("data-editing")).toBe("false");
    await expect(el.querySelector("input, textarea")).toBeNull();
  },
};

/** Empty with a placeholder — the dimmed placeholder text, not a blank box. */
export const Placeholder: Story = {
  args: { children: undefined, placeholder: "Untitled" },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector("[data-placeholder]");
    await expect(el).not.toBeNull();
    await expect(el?.textContent).toBe("Untitled");
  },
};

/**
 * The real click-to-edit loop: click the resting text → an in-place
 * `<input>` mounts → type → Enter commits the new value → the box goes
 * back to resting state showing the committed text.
 */
export const ClickToEdit: Story = {
  render: () => <ControlledEditableText initial="Title" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const resting = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');
    await expect(resting.getAttribute("data-editing")).toBe("false");

    await userEvent.click(resting);

    const input = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });

    await userEvent.clear(input);
    await userEvent.type(input, "Renamed", { delay: 0 });
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text"]');
      if (!(el instanceof HTMLElement) || el.getAttribute("data-editing") !== "false") {
        throw new Error("expected the box to return to resting state after commit");
      }
    });
    await expect(canvas.getByText("Renamed")).toBeInTheDocument();
  },
};

/**
 * Escape cancels: type a change, then Escape — the box reverts to resting
 * state showing the ORIGINAL text, the typed change discarded.
 */
export const EscapeCancels: Story = {
  render: () => <ControlledEditableText initial="Original" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resting = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');

    await userEvent.click(resting);
    const input = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });
    await userEvent.clear(input);
    await userEvent.type(input, "Discarded", { delay: 0 });
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text"]');
      if (!(el instanceof HTMLElement) || el.getAttribute("data-editing") !== "false") {
        throw new Error("expected the box to return to resting state after cancel");
      }
    });
    await expect(canvas.getByText("Original")).toBeInTheDocument();
  },
};
