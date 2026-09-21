import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { EditableText } from "./editableText";

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
 *
 * `lines`/`placeholder`/`style` are optional and default to `ClickToEdit`'s/
 * `EscapeCancels`' original shape (single-line, no placeholder, no style) —
 * `Placeholder` and `Multiline` below are the only callers that reach past
 * the defaults, so neither existing story's behaviour changes.
 */
function ControlledEditableText({
  initial,
  placeholder,
  lines = "single",
  size,
  justify,
  style,
}: {
  initial: string;
  placeholder?: string;
  lines?: "single" | "multi";
  size?: "sm" | "md" | "lg" | "xl";
  justify?: "left" | "middle" | "right";
  style?: CSSProperties;
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef(initial);
  return (
    <EditableText
      lines={lines}
      placeholder={placeholder}
      size={size}
      justify={justify}
      style={style}
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

/**
 * G-9 (verify-round-2c, "the edges of the EditableText... are being cut
 * off"): a text `<input>`/`<textarea>`'s VALUE has no DOM text node a
 * `Range` can measure — `getBoundingClientRect()` isn't literally callable
 * on "the rendered text" the way it is on `editable-text-content`'s `<span>`
 * (the RESTING, non-editing render). Canvas `measureText`, fed the control's
 * own computed font, is the documented proxy — the exact technique used live
 * to find the bug editableText.tsx's `CONTROL_INK_MARGIN_PX` fixes: a
 * leading `(` renders with a NEGATIVE `actualBoundingBoxLeft` (ink starting
 * left of the control's own text origin), and the control's forced
 * `overflow: clip` (browsers ignore author `overflow` on text form controls
 * entirely — measured live) then shaves it. `actualBoundingBoxLeft`/`Right`
 * are offsets from the text origin (the control's content-box left edge,
 * left-aligned); adding them to that origin gives the ink's absolute edges
 * to compare against the control's own (clip) box.
 */
function measureControlInkBounds(control: HTMLInputElement | HTMLTextAreaElement) {
  const style = getComputedStyle(control);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("expected a 2d canvas context");
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = ctx.measureText(control.value);
  const controlRect = control.getBoundingClientRect();
  const textOriginX = controlRect.left + parseFloat(style.paddingLeft);
  return {
    controlRect,
    inkLeft: textOriginX + metrics.actualBoundingBoxLeft,
    inkRight: textOriginX + metrics.actualBoundingBoxRight,
  };
}

const meta = {
  title: "Basics/EditableText",
  tags: ["area:basics", "lane:baseline"],
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

/**
 * Empty with a placeholder — the dimmed placeholder text, not a blank box —
 * and CLICKABLE straight into editing (Zach: "I like the idea of maybe it
 * hinting... show a story... of it kinda showing like the placeholders for
 * the editable text. and then I can click it and type in what I really want
 * it to be"). Two shapes, the fields a simple header/body actually needs: a
 * Title/Type pair and a Title/Description/Type triple. Plain `EditableText`
 * instances laid out with a bare flex column, not `Bar`/`Block` — his own
 * sequencing is EditableText's stories first, the Block integration later,
 * in a lane that isn't this one.
 */
export const Placeholder: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div data-testid="title-type" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <ControlledEditableText initial="" placeholder="Untitled" />
        <ControlledEditableText initial="" placeholder="Type" />
      </div>
      <div data-testid="title-description-type" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <ControlledEditableText initial="" placeholder="Untitled" />
        <ControlledEditableText
          initial=""
          placeholder="Description"
          lines="multi"
          justify="left"
          style={{ width: 220 }}
        />
        <ControlledEditableText initial="" placeholder="Type" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const fields = canvasElement.querySelectorAll('[data-slot="editable-text"]');
    await expect(fields.length).toBe(5);
    for (const field of Array.from(fields)) {
      const placeholderEl = field.querySelector("[data-placeholder]");
      await expect(placeholderEl).not.toBeNull();
    }

    // Click the pair's Title field: its own placeholder is replaced by the
    // editing control, the OTHER four fields (still at rest) are untouched.
    const titleField = canvasElement.querySelector('[data-testid="title-type"] [data-slot="editable-text"]');
    if (!(titleField instanceof HTMLElement)) throw new Error("expected the Title field");
    await userEvent.click(titleField);

    const input = await waitFor(() => {
      const el = titleField.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });
    await expect(input.value).toBe("");
    await expect(titleField.querySelector("[data-placeholder]")).toBeNull();
    await expect(canvasElement.querySelectorAll("[data-placeholder]").length).toBe(4);
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

/**
 * G-9a: type a string whose glyphs are known to bleed ink past their own
 * advance width (leading/trailing parens, at this component's largest
 * rung) and measure that ink stays inside the control's own box the whole
 * time it is focused — not just after settling. Regression pin for
 * `CONTROL_INK_MARGIN_PX` (editableText.tsx).
 */
export const TypingKeepsEdgesVisible: Story = {
  render: () => <ControlledEditableText initial="Renamed" size="xl" />,
  play: async ({ canvasElement }) => {
    const resting = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');
    await userEvent.click(resting);

    const input = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });

    await userEvent.clear(input);
    await userEvent.type(input, "(label)", { delay: 0 });
    await expect(input.value).toBe("(label)");

    const { controlRect, inkLeft, inkRight } = measureControlInkBounds(input);
    await expect(inkLeft).toBeGreaterThanOrEqual(controlRect.left);
    await expect(inkRight).toBeLessThanOrEqual(controlRect.right);
  },
};

/**
 * G-9b: a short string's first and last characters stay fully inside the
 * box once the field is focused — the ring itself (`outline` + `outlineOffset`,
 * editableText.tsx's `style`) paints outside the control's own border box so
 * it never competes with this measurement; what's checked is the ink.
 */
export const ShortLabelStaysInBounds: Story = {
  render: () => <ControlledEditableText initial="Hi" />,
  play: async ({ canvasElement }) => {
    const resting = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');
    await userEvent.click(resting);

    const input = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLInputElement)) throw new Error("expected the editing <input> to mount");
      return el;
    });
    await expect(document.activeElement).toBe(input);

    const { controlRect, inkLeft, inkRight } = measureControlInkBounds(input);
    await expect(inkLeft).toBeGreaterThanOrEqual(controlRect.left);
    await expect(inkRight).toBeLessThanOrEqual(controlRect.right);
  },
};

/**
 * G-12: `lines="multi"` — Zach: "it works just like a normal text box
 * right...?" Yes. WHY no hand-rolled wrapping: `EditableTextControl`
 * (editableText.tsx) already renders a stock `<textarea>` for
 * `lines="multi"`; a `<textarea>` wraps on its own and, with `field-sizing:
 * content` (this file's own control style, applied to both single- and
 * multi-line), grows its own height as lines wrap — neither reimplemented
 * here. Enter/Ctrl+Enter mirror `CodeEditor`'s own `multiline` contract
 * (codeEditor.tsx: plain Enter inserts, Ctrl/Cmd+Enter exits) so the two
 * components in this kit agree on what Enter means.
 */
export const Multiline: Story = {
  render: () => <ControlledEditableText initial="Short" lines="multi" justify="left" style={{ width: 220 }} />,
  play: async ({ canvasElement }) => {
    const resting = canvasElement.querySelector('[data-slot="editable-text"]');
    if (!(resting instanceof HTMLElement)) throw new Error('expected a [data-slot="editable-text"]');
    await expect(resting.getAttribute("data-lines")).toBe("multi");
    await userEvent.click(resting);

    const textarea = await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text-input"]');
      if (!(el instanceof HTMLTextAreaElement)) throw new Error("expected the editing <textarea> to mount");
      return el;
    });
    const heightBeforeWrap = textarea.getBoundingClientRect().height;

    await userEvent.clear(textarea);
    await userEvent.type(
      textarea,
      "This description is intentionally longer than the box so it has to wrap onto several lines.",
      { delay: 0 },
    );

    await waitFor(() => {
      const heightNow = textarea.getBoundingClientRect().height;
      if (!(heightNow > heightBeforeWrap)) {
        throw new Error(`expected the textarea to grow taller as it wraps (was ${heightBeforeWrap}, now ${heightNow})`);
      }
    });
    // Wrapped, not overflowing sideways: the scrollable width never exceeds
    // the visible width (the +1 absorbs sub-pixel layout rounding).
    await expect(textarea.scrollWidth).toBeLessThanOrEqual(textarea.clientWidth + 1);

    // Plain Enter inserts a newline — the field stays in edit mode.
    await userEvent.type(textarea, "{Enter}Second line", { delay: 0 });
    await expect(textarea.value).toContain("\nSecond line");
    await expect(canvasElement.querySelector('[data-slot="editable-text"]')?.getAttribute("data-editing")).toBe(
      "true",
    );

    // Ctrl/Cmd+Enter is the exit: it commits and leaves edit mode.
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => {
      const el = canvasElement.querySelector('[data-slot="editable-text"]');
      if (!(el instanceof HTMLElement) || el.getAttribute("data-editing") !== "false") {
        throw new Error("expected Ctrl+Enter to commit and exit editing");
      }
    });
  },
};
