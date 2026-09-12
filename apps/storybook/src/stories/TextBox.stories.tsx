import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  TextBox,
  TEXT_BOX_FIELDS,
  TEXT_BOX_PRESETS,
  type TextBoxFont,
  type TextBoxHorizontalAlign,
  type TextBoxSize,
  type TextBoxVerticalAlign,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";

/**
 * T1 Lane X: TextBox, end to end. `argTypes`/`args` below are GENERATED
 * from `TEXT_BOX_FIELDS` (packages/bbox-ui/src/textBox.fields.ts) — the
 * SAME array the generic product inspector (demos/inspector) reads. Add a
 * field there and both surfaces pick it up; nothing here is kept in sync
 * by hand.
 *
 * The cast on `args` is deliberate: `defaultArgs` returns the generic
 * `Record<string, FieldValue>` shape every schema-driven component shares
 * — one degree looser than `TextBox`'s own literal-union prop types.
 * `textBox.fields.test.ts` is what actually proves the values line up.
 *
 * No `Presets` story: `TEXT_BOX_PRESETS` is empty — no board evidence
 * gives TextBox a state axis, it is pure typography (docs/T1-SPEC.md §4.2).
 */
const meta = {
  title: "Components/TextBox",
  component: TextBox,
  args: defaultArgs(TEXT_BOX_FIELDS, TEXT_BOX_PRESETS) as Partial<ComponentProps<typeof TextBox>>,
  argTypes: toArgTypes(TEXT_BOX_FIELDS),
} satisfies Meta<typeof TextBox>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZE_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "size")!;
const FONT_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "font")!;
const ALIGN_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "align")!;
const JUSTIFY_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "justify")!;
const LINES_FIELD = TEXT_BOX_FIELDS.find((f) => f.id === "lines")!;

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. TextBox has no natural
 * "click the dot" interaction (docs/T1-SPEC.md §6 point 2), so this
 * asserts the rendered DOM matches `args` instead: the painted text, its
 * font size and family, and its padding on all four sides all equal what
 * this story was actually rendered with, in whichever host is active.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const box = canvasElement.querySelector('[data-slot="text-box"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="text-box"] element in the DOM');
    }
    await expect(box.getAttribute("data-size")).toBe(args.size);
    await expect(box.getAttribute("data-font")).toBe(args.font);
    await expect(box.getAttribute("data-align")).toBe(args.align);
    await expect(box.getAttribute("data-justify")).toBe(args.justify);
    await expect(box.style.paddingTop).toBe(`${args.paddingTop}px`);
    await expect(box.style.paddingBottom).toBe(`${args.paddingBot}px`);
    await expect(box.style.paddingLeft).toBe(`${args.paddingLeft}px`);
    await expect(box.style.paddingRight).toBe(`${args.paddingRight}px`);
    if (args.children != null) {
      await expect(canvas.getByText(String(args.children))).toBeInTheDocument();
    }
  },
};

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live. The swept field's own control
 * is disabled, because a story that paints every option at once cannot
 * honour a single value and a control that silently does nothing reads as
 * broken (Zach, 2026-09-10: "the controls didn't work for the other
 * things").
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(TEXT_BOX_FIELDS, [fieldId]) },
});

/** Every real TextBoxSize, board's own descending order (44/36/24/18px). */
export const AllSizes: Story = {
  parameters: sweep("size"),
  render: (args) => (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <TextBox {...args} key={option.value} size={option.value as TextBoxSize}>
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/** Every real TextBoxFont (sans/sketch/mono). */
export const AllFonts: Story = {
  parameters: sweep("font"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {FONT_FIELD.options!.map((option) => (
        <TextBox {...args} key={option.value} font={option.value as TextBoxFont}>
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * Vertical align only becomes visible once the box has an explicit height
 * — this gallery gives every cell one so the sweep is honest, not a no-op.
 */
export const AllAligns: Story = {
  parameters: sweep("align"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      {ALIGN_FIELD.options!.map((option) => (
        <TextBox
          {...args}
          key={option.value}
          align={option.value as TextBoxVerticalAlign}
          style={{ height: 96, outline: "1px dashed var(--tl-color-muted-1, #ccc)" }}
        >
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * Horizontal justify only becomes visible once the box has an explicit
 * width — same honest-sweep reasoning as `AllAligns`.
 */
export const AllJustifies: Story = {
  parameters: sweep("justify"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {JUSTIFY_FIELD.options!.map((option) => (
        <TextBox
          {...args}
          key={option.value}
          justify={option.value as TextBoxHorizontalAlign}
          style={{ width: 240, outline: "1px dashed var(--tl-color-muted-1, #ccc)" }}
        >
          {args.children ?? option.label}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * The one real way to get a truly empty box: omit `children` entirely —
 * `TEXT_BOX_FIELDS`'s own `"Text Box"` default is a demoable placeholder,
 * never a fact about the component (see `textBox.fields.ts`'s comment on
 * that field and `textBox.fields.test.ts`'s explicit assertion of this
 * deviation).
 */
export const Empty: Story = {
  args: { children: undefined },
};

/**
 * Rest × single/multi (docs/TEXTBOX-EDITING-SPEC.md §1). Each cell gets an
 * explicit `maxWidth` — like `AllAligns`/`AllJustifies`, single's own
 * `nowrap`/ellipsis has nothing to truncate against on a `w-fit` box with no
 * ancestor constraint, so an honest sweep needs one.
 */
export const AllLines: Story = {
  parameters: sweep("lines"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {LINES_FIELD.options!.map((option) => (
        <TextBox
          {...args}
          key={option.value}
          lines={option.value as "single" | "multi"}
          style={{ maxWidth: 160, outline: "1px dashed var(--tl-color-muted-1, #ccc)" }}
        >
          {option.value === "multi"
            ? "A longer line that actually wraps onto more than one row of text."
            : "A longer line that actually overflows and gets cut off with an ellipsis."}
        </TextBox>
      ))}
    </div>
  ),
};

/**
 * The editing half of the frozen contract (docs/TEXTBOX-EDITING-SPEC.md §1):
 * `editing` is controlled, so a story that wants a LIVE Storybook toggle has
 * to bridge the Controls-panel boolean into its own `useState` — `editing`
 * isn't a `TEXT_BOX_FIELDS` entry (it's host wiring, not a settable
 * property), so this bridge, not `toArgTypes`, is what puts a control on it
 * for this one story only.
 */
function EditableDemo({
  lines,
  editing: editingArg,
  placeholder,
  initialText,
}: {
  lines: "single" | "multi";
  editing: boolean;
  placeholder?: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(editingArg);
  // Mirrors the Controls-panel toggle into local state on every flip, without
  // fighting the box's OWN transitions (Enter/Escape/blur set `editing` back
  // to false locally, and the next unrelated args change must not re-open it).
  useEffect(() => setEditing(editingArg), [editingArg]);

  return (
    <TextBox
      lines={lines}
      editing={editing}
      placeholder={placeholder}
      onChange={setText}
      onCommit={(value) => {
        setText(value);
        setEditing(false);
      }}
      onCancel={() => setEditing(false)}
    >
      {text}
    </TextBox>
  );
}

/** Single-line editing: Enter commits, Escape reverts, blur commits. */
export const EditingSingleLine: Story = {
  args: { editing: true, placeholder: "Type something…" },
  argTypes: { editing: { control: "boolean", name: "editing" } },
  render: (args) => (
    <EditableDemo
      lines="single"
      editing={Boolean(args.editing)}
      placeholder={args.placeholder}
      initialText="Edit me"
    />
  ),
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector('[data-slot="text-box-input"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('expected an <input data-slot="text-box-input"> — editing defaults to true here');
    }
    await expect(input.tagName).toBe("INPUT");
    await expect(input.className).toContain("bbox-interactive");
    await expect(input.getAttribute("data-bbox-interactive")).toBe("");
  },
};

/** Multi-line editing: Ctrl/Cmd+Enter commits, plain Enter is a real newline. */
export const EditingMultiLine: Story = {
  args: { editing: true, placeholder: "Type something…" },
  argTypes: { editing: { control: "boolean", name: "editing" } },
  render: (args) => (
    <EditableDemo
      lines="multi"
      editing={Boolean(args.editing)}
      placeholder={args.placeholder}
      initialText={"First line\nSecond line"}
    />
  ),
  play: async ({ canvasElement }) => {
    const textarea = canvasElement.querySelector('[data-slot="text-box-input"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('expected a <textarea data-slot="text-box-input"> — editing defaults to true here');
    }
    await expect(textarea.tagName).toBe("TEXTAREA");
    await expect(textarea.value).toBe("First line\nSecond line");
  },
};

/**
 * `size="custom"` escapes the named ladder into `sizePx` — both are real
 * `TEXT_BOX_FIELDS` entries (paired with `group: "size"`), so the Controls
 * panel drives this story like any other; nothing custom to wire here.
 */
export const CustomSize: Story = {
  args: { size: "custom", sizePx: 64, children: "Custom size" },
  play: async ({ canvasElement, args }) => {
    const box = canvasElement.querySelector('[data-slot="text-box"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="text-box"] element in the DOM');
    }
    await expect(box.getAttribute("data-size")).toBe("custom");
    await expect(box.style.fontSize).toBe(`${args.sizePx}px`);
  },
};
