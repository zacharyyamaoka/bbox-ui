import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { controlNames, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import {
  CodeBlock,
  CODE_BLOCK_DEFAULT_VALUE,
  CODE_BLOCK_FIELDS,
  CODE_BLOCK_PRESETS,
  resolveCodeBlockPresentation,
  type CodeBlockGrammar,
  type CodeBlockLanguage,
  type CodeBlockLine,
  type CodeBlockLook,
  type CodeBlockOverflow,
  type CodeBlockReference,
  type CodeBlockSize,
} from "@bbox-ui/core";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";

/**
 * `CodeBlock`, end to end — `argTypes`/`args` GENERATED from
 * `CODE_BLOCK_FIELDS` (packages/bbox-ui/src/codeBlock.fields.ts), the same
 * array the generic product inspector reads. Add a field there and both
 * surfaces pick it up.
 *
 * UNLIKE `TextBox` (an uncontrolled box that happens to accept `editing`),
 * `CodeBlock` is CONTROLLED end to end: `value` + a required `onWrite`.
 * Every story below therefore renders through `Controlled`, a small wrapper
 * that holds `value` in local state seeded from `args.value` and writes
 * every keystroke back into it — the meta's own default `render`, so a
 * story only needs its own `render` when it wants something ELSE (a
 * gallery, the host-owned `editing` demo, `mode="rendered"`).
 */
const meta = {
  title: "Components/CodeBlock",
  component: CodeBlock,
  args: defaultArgs(CODE_BLOCK_FIELDS, CODE_BLOCK_PRESETS) as Partial<ComponentProps<typeof CodeBlock>>,
  argTypes: toArgTypes(CODE_BLOCK_FIELDS),
  render: (args) => <Controlled {...(args as Partial<ComponentProps<typeof CodeBlock>>)} />,
} satisfies Meta<typeof CodeBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

const LOOK_FIELD = CODE_BLOCK_FIELDS.find((f) => f.id === "look")!;
const LANGUAGE_FIELD = CODE_BLOCK_FIELDS.find((f) => f.id === "language")!;
const SIZE_FIELD = CODE_BLOCK_FIELDS.find((f) => f.id === "size")!;
const OVERFLOW_FIELD = CODE_BLOCK_FIELDS.find((f) => f.id === "overflow")!;

/**
 * The bridge every story renders through. `value` is destructured out
 * (each caller supplies its own) and the rest of `args` passes straight to
 * `CodeBlock` — including the Controls panel's own live edits, which land
 * here as a prop change and get mirrored into state on the next render.
 */
function Controlled({
  value: initialValue,
  ...rest
}: Partial<ComponentProps<typeof CodeBlock>> & { value?: string }) {
  const [value, setValue] = useState(initialValue ?? CODE_BLOCK_DEFAULT_VALUE);
  useEffect(() => setValue(initialValue ?? CODE_BLOCK_DEFAULT_VALUE), [initialValue]);
  return <CodeBlock {...(rest as ComponentProps<typeof CodeBlock>)} value={value} onWrite={setValue} />;
}

/**
 * A gallery story sweeps ONE field and takes every other field from `args`,
 * so the Controls panel still drives it live — `TextBox.stories.tsx`'s own
 * idiom, unchanged.
 */
const sweep = (fieldId: string) => ({
  controls: { exclude: controlNames(CODE_BLOCK_FIELDS, [fieldId]) },
});

/**
 * THE STORY THAT CARRIES THE PLAY FUNCTION. `lineNumbers`/`lines`/the
 * padding four are GOVERNED by `look` (`codeBlock.presets.ts`) and omitted
 * from `defaultArgs` on purpose (`storybook.ts`'s own WHY) — comparing
 * against `args.lineNumbers` directly would compare against `undefined`.
 * `resolveCodeBlockPresentation` is the exact function the component itself
 * calls to fold `look` in, so asserting against ITS output is asserting
 * against what actually painted, not a stale echo of the raw args.
 */
export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const box = canvasElement.querySelector('[data-slot="code-block"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="code-block"] element in the DOM');
    }
    const presentation = resolveCodeBlockPresentation(args as Parameters<typeof resolveCodeBlockPresentation>[0]);
    await expect(box.getAttribute("data-look")).toBe(presentation.look);
    await expect(box.getAttribute("data-language")).toBe(args.language);
    await expect(box.getAttribute("data-size")).toBe(args.size);
    await expect(box.getAttribute("data-lines")).toBe(presentation.lines);
    await expect(box.getAttribute("data-line-numbers")).toBe(String(presentation.lineNumbers));
    await expect(box.getAttribute("data-overflow")).toBe(presentation.overflow);
    await expect(box.style.paddingLeft).toBe(`${presentation.paddingLeft}px`);

    await expect(box.querySelector(".cm-editor")).toBeInTheDocument();
    const gutters = box.querySelector(".cm-gutters");
    if (presentation.lineNumbers) {
      await expect(gutters).toBeInTheDocument();
    } else {
      await expect(gutters).not.toBeInTheDocument();
    }
  },
};

/**
 * Every real `CodeBlockLook`. `field` gets a realistic one-line value —
 * what it actually holds inside a Port's label slot — rather than the
 * multi-line `block` default overflowing a box that wants one line.
 */
export const AllLooks: Story = {
  parameters: sweep("look"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {LOOK_FIELD.options!.map((option) => (
        <Controlled
          {...args}
          key={option.value}
          look={option.value as CodeBlockLook}
          value={option.value === "field" ? "get_aruco: ArucoSrv" : String(args.value ?? CODE_BLOCK_DEFAULT_VALUE)}
        />
      ))}
    </div>
  ),
};

/** One short snippet per `CodeBlockLanguage` that actually fits its own
 * parser — a JSON string in the Python slot proves nothing about whether
 * the language extension swapped. */
const LANGUAGE_SNIPPETS: Record<CodeBlockLanguage, string> = {
  plaintext: "just some text",
  python: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"',
  javascript: "function greet(name) {\n  return `Hello, ${name}!`;\n}",
  typescript: "function greet(name: string): string {\n  return `Hello, ${name}!`;\n}",
  json: '{ "greeting": "hello" }',
  html: "<p>Hello, world!</p>",
  css: ".greeting {\n  color: red;\n}",
  sql: "SELECT * FROM greetings;",
  markdown: "# Hello\n\nA greeting.",
};

/** Every real `CodeBlockLanguage`; `lineNumbers` (and everything else)
 * still comes from `args`, so the Controls panel keeps driving the gutter
 * live across the whole row. */
export const AllLanguages: Story = {
  parameters: sweep("language"),
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {LANGUAGE_FIELD.options!.map((option) => (
        <Controlled
          {...args}
          key={option.value}
          language={option.value as CodeBlockLanguage}
          value={LANGUAGE_SNIPPETS[option.value as CodeBlockLanguage]}
        />
      ))}
    </div>
  ),
};

/** Every real `CodeBlockSize`, `TextBox.stories.tsx`'s own descending-ladder
 * gallery pattern — "custom" included, at whatever `sizePx` Controls holds. */
export const AllSizes: Story = {
  parameters: sweep("size"),
  render: (args) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
      {SIZE_FIELD.options!.map((option) => (
        <Controlled {...args} key={option.value} size={option.value as CodeBlockSize} />
      ))}
    </div>
  ),
};

/**
 * Every real `CodeBlockOverflow`, on a deliberately long single line inside
 * a fixed, deliberately-too-narrow 260px wrapper — the one geometry where
 * clip/wrap/scroll/grow actually disagree (a line that already fits its box
 * looks identical under all four). `grow` is allowed to exceed the
 * wrapper's own 260px — that IS the point of the option (`codeBlock.tsx`'s
 * own `width: max-content` WHY), so this story does not clip it back.
 */
const OVERFLOW_DEMO_VALUE = "x_very_long_identifier_that_does_not_fit_the_box_at_all = 1234567890";
export const AllOverflows: Story = {
  parameters: sweep("overflow"),
  render: (args) => (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
      {OVERFLOW_FIELD.options!.map((option) => (
        <div key={option.value} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "#888" }}>{option.label}</span>
          <div style={{ width: 260 }}>
            <Controlled
              {...args}
              overflow={option.value as CodeBlockOverflow}
              value={OVERFLOW_DEMO_VALUE}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

/**
 * The `expandable` ⤢ button (`codeBlock.tsx`'s own doc: "the host opens a
 * larger view") — the core only ever ASKS via `onExpand`; this story proves
 * the button exists and fires it exactly once per click, nothing about what
 * a "larger view" looks like (that is `BenchCodeBlock`'s own job on
 * /create, `packages/panel/src/bench.tsx`).
 */
export const Expandable: Story = {
  args: { expandable: true, onExpand: fn() },
  play: async ({ canvasElement, args }) => {
    const box = canvasElement.querySelector('[data-slot="code-block"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="code-block"] element in the DOM');
    }
    const expandButton = box.querySelector('[data-slot="code-block-expand"]');
    if (!(expandButton instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="code-block-expand"] button');
    }
    await userEvent.click(expandButton);
    await expect(args.onExpand).toHaveBeenCalledOnce();
  },
};

/**
 * The host-owned `editing` half of the contract (`codeBlock.tsx`'s own
 * doc): bridges a Storybook boolean into local state exactly like
 * `TextBox.stories.tsx`'s `EditableDemo`, since `editing` is host wiring,
 * never a `CODE_BLOCK_FIELDS` entry. At rest (`editing=false`) the block
 * carries neither the `bbox-interactive` class nor `data-bbox-interactive`;
 * clicking "Edit" flips both on, the same marker pair React Flow/tldraw gate
 * drag/pan/wheel by.
 */
function EditableCodeBlockDemo({
  editing: editingArg,
  value: initialValue,
  ...rest
}: Partial<ComponentProps<typeof CodeBlock>> & { editing: boolean }) {
  const [value, setValue] = useState(initialValue ?? CODE_BLOCK_DEFAULT_VALUE);
  const [editing, setEditing] = useState(editingArg);
  useEffect(() => setEditing(editingArg), [editingArg]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {!editing && (
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
      <CodeBlock
        {...(rest as ComponentProps<typeof CodeBlock>)}
        value={value}
        onWrite={setValue}
        editing={editing}
        onEscape={() => setEditing(false)}
      />
    </div>
  );
}

export const Editing: Story = {
  args: { editing: false },
  argTypes: { editing: { control: "boolean", name: "editing" } },
  render: (args) => <EditableCodeBlockDemo {...args} editing={Boolean(args.editing)} />,
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector('[data-slot="code-block"]');
    if (!(box instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="code-block"] element in the DOM');
    }
    await expect(box.className).not.toContain("bbox-interactive");
    await expect(box.hasAttribute("data-bbox-interactive")).toBe(false);

    const editButton = within(canvasElement).getByRole("button", { name: "Edit" });
    await userEvent.click(editButton);

    await expect(box.className).toContain("bbox-interactive");
    await expect(box.getAttribute("data-bbox-interactive")).toBe("");
  },
};

/**
 * A tiny inline grammar for the RENDERED half of the `mode` toggle —
 * `grammar.lines` splits each `name: Type` line into a bold name, a muted
 * `": "`, and an accent (reference) type; `resolveReference` knows exactly
 * one type, `"Pose"`, and offers it two child fields to expand into.
 */
function demoLines(text: string): CodeBlockLine[] {
  return text.split("\n").map((raw, index) => {
    const colon = raw.indexOf(":");
    if (colon < 0) {
      return { line: index, lineStart: 0, indent: 0, segments: [{ text: raw }] };
    }
    const name = raw.slice(0, colon);
    const type = raw.slice(colon + 1).trimStart();
    return {
      line: index,
      lineStart: 0,
      indent: 0,
      segments: [
        { text: name, role: "name" },
        { text: ": ", role: "punct" },
        { text: type, role: "type", isReference: true },
      ],
    };
  });
}

function demoResolveReference(name: string): CodeBlockReference | null {
  if (name !== "Pose") return null;
  return {
    kind: "known",
    onJump() {
      // A real host navigates to the type's own definition; the story only
      // has to prove the reference resolved and is clickable.
    },
    expandLines: () => [
      { line: 0, lineStart: 0, indent: 1, segments: [{ text: "x", role: "name" }, { text: ": ", role: "punct" }, { text: "float", role: "type" }] },
      { line: 1, lineStart: 0, indent: 1, segments: [{ text: "y", role: "name" }, { text: ": ", role: "punct" }, { text: "float", role: "type" }] },
    ],
  };
}

const DEMO_RENDERED_GRAMMAR: CodeBlockGrammar = { lines: demoLines, resolveReference: demoResolveReference };

export const Rendered: Story = {
  args: { value: "origin: Pose\nsamples: int" },
  render: (args) => <Controlled {...args} mode="rendered" grammar={DEMO_RENDERED_GRAMMAR} />,
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelector('[data-slot="code-block-rows"]');
    if (!(rows instanceof HTMLElement)) {
      throw new Error('expected a [data-slot="code-block-rows"] element in the DOM');
    }
    const chevron = rows.querySelector('[role="button"]');
    if (!(chevron instanceof HTMLElement)) {
      throw new Error('expected a chevron [role="button"] on the resolvable "Pose" reference');
    }
  },
};
