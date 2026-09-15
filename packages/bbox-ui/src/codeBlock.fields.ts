/**
 * packages/bbox-ui/src/codeBlock.fields.ts
 *
 * `CodeBlock`'s controllable props as data — the declaration half of the
 * schema-driven loop (`textBox.fields.ts`'s own pattern). Every `id` below
 * is a REAL `CodeBlockProps` key (see `./codeBlock.tsx`); every enum and
 * default mirrors `./codeBlock.layout.ts` / `./codeBlock.presets.ts` — this
 * file adds no new vocabulary, it only describes the vocabulary that
 * already exists.
 *
 * `editing`/`onWrite`/`onEditEnd`/`onEscape`/`grammar`/`mode` are NOT
 * fields — they are host wiring, never properties a person sets
 * (docs/TEXTBOX-EDITING-SPEC.md §1 draws the same line for TextBox).
 */
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";

import {
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_LANGUAGE_LABELS,
  CODE_BLOCK_LINES,
  CODE_BLOCK_LOOKS,
  CODE_BLOCK_LOOK_LABELS,
  CODE_BLOCK_OVERFLOWS,
  CODE_BLOCK_OVERFLOW_LABELS,
  CODE_BLOCK_SIZES,
  type CodeBlockSize,
} from "./codeBlock.layout";
import { CODE_BLOCK_PRESETS, codeBlockLookValues } from "./codeBlock.presets";

/** Descending display order, "custom" last — `textBox.fields.ts`'s own
 * reasoning: custom is the escape from the ladder, not a rung of it. */
const SIZE_ORDER: CodeBlockSize[] = ["xl", "lg", "md", "sm", "custom"];
const SIZE_OPTIONS = SIZE_ORDER.map((size) =>
  size === "custom" ? { value: size, label: "custom" } : { value: size, label: `${size} · ${CODE_BLOCK_SIZES[size]}px` },
);

const LOOK_OPTIONS = CODE_BLOCK_LOOKS.map((look) => ({ value: look, label: CODE_BLOCK_LOOK_LABELS[look] }));
const LANGUAGE_OPTIONS = CODE_BLOCK_LANGUAGES.map((language) => ({
  value: language,
  label: CODE_BLOCK_LANGUAGE_LABELS[language],
}));
const LINES_OPTIONS = CODE_BLOCK_LINES.map((lines) => ({ value: lines, label: lines }));
const OVERFLOW_OPTIONS = CODE_BLOCK_OVERFLOWS.map((overflow) => ({
  value: overflow,
  label: CODE_BLOCK_OVERFLOW_LABELS[overflow],
}));

/** The specimen every surface opens with — SystemSketch's own
 * `CODE_DEFAULT_TEXT`, the two lines in the screenshot this primitive was
 * asked for against. */
export const CODE_BLOCK_DEFAULT_VALUE = `def greet(name: str) -> str:
    return f"Hello, {name}!"`;

// The default look's own values ARE the fields' defaults, so the default
// layer and the `block` preset can never disagree about what a bare
// `<CodeBlock>` looks like. `codeBlock.fields.test.ts` pins this.
const BLOCK = codeBlockLookValues("block");

/**
 * `CodeBlock`'s controllable props, in panel order. Every `defaultValue`
 * equals that prop's real resolved default in `codeBlock.tsx` —
 * `test/codeBlock.fields.test.ts` pins this so the two files cannot drift.
 */
export const CODE_BLOCK_FIELDS: FieldSpec[] = [
  {
    id: "look",
    label: "Look",
    kind: "segments",
    defaultValue: "block",
    options: LOOK_OPTIONS,
    tier: "simple",
    hint: "block: gutter, many lines, a surface's padding. field: the compact one-line box a Port label uses. Same component either way.",
  },
  {
    id: "language",
    label: "Language",
    kind: "segments",
    defaultValue: "python",
    options: LANGUAGE_OPTIONS,
    tier: "simple",
  },
  {
    id: "size",
    label: "Size",
    kind: "segments",
    defaultValue: "md",
    options: SIZE_OPTIONS,
    group: "size",
    tier: "advanced",
  },
  {
    // Paired with `size` on one row (group) for the same reason TextBox's
    // is: it only DOES anything when `size === "custom"`.
    id: "sizePx",
    label: "Size (px)",
    kind: "number",
    defaultValue: 16,
    min: 6,
    step: 1,
    unit: "px",
    group: "size",
    hint: 'Font size when Size is "custom"; ignored otherwise.',
  },
  {
    id: "lineNumbers",
    label: "Line numbers",
    kind: "toggle",
    defaultValue: BLOCK.lineNumbers,
    tier: "advanced",
    hint: "Governed by Look; set it here to override the look.",
  },
  {
    id: "lines",
    label: "Lines",
    kind: "segments",
    defaultValue: BLOCK.lines,
    options: LINES_OPTIONS,
    tier: "advanced",
    hint: "single: a typed or pasted newline is dropped. multi: a real document; Ctrl/Cmd+Enter exits.",
  },
  {
    id: "overflow",
    label: "Overflow",
    kind: "segments",
    defaultValue: BLOCK.overflow,
    options: OVERFLOW_OPTIONS,
    tier: "advanced",
    hint: "A line wider than the box: clip at the edge, wrap onto new lines, scroll (a bar), or grow the box to fit the text. Governed by Look.",
  },
  {
    id: "expandable",
    label: "Expand button",
    kind: "toggle",
    defaultValue: false,
    tier: "advanced",
    hint: "A ⤢ button in the top-right corner; the host opens a larger view (onExpand).",
  },
  {
    id: "columns",
    label: "Width",
    kind: "number",
    defaultValue: 0,
    min: 0,
    step: 1,
    unit: "ch",
    hint: "Characters across (SystemSketch's 72 / 80 / 100 presets). 0 fills whatever the host gives.",
  },
  { group: "padding", id: "paddingTop", label: "Padding: Top", kind: "number", defaultValue: BLOCK.paddingTop, min: 0, step: 1, unit: "px" },
  { group: "padding", id: "paddingBot", label: "Padding: Bottom", kind: "number", defaultValue: BLOCK.paddingBot, min: 0, step: 1, unit: "px" },
  { group: "padding", id: "paddingLeft", label: "Padding: Left", kind: "number", defaultValue: BLOCK.paddingLeft, min: 0, step: 1, unit: "px" },
  { group: "padding", id: "paddingRight", label: "Padding: Right", kind: "number", defaultValue: BLOCK.paddingRight, min: 0, step: 1, unit: "px" },
  {
    id: "placeholder",
    label: "Placeholder",
    kind: "text",
    defaultValue: "",
    hint: "Shown when the value is empty.",
  },
  {
    id: "value",
    label: "Code",
    // "textarea", not "text": the value is a document that carries
    // newlines (packages/schema/src/field.ts §2).
    kind: "textarea",
    defaultValue: CODE_BLOCK_DEFAULT_VALUE,
    tier: "simple",
    hint: "The document. Written per keystroke while editing.",
  },
];

/** Re-exported beside the fields so a consumer that reads one reads both;
 * `assertDisjointPresets` is what `codeBlock.fields.test.ts` runs on it. */
export const CODE_BLOCK_PRESET_LIST: PresetSpec[] = CODE_BLOCK_PRESETS;
