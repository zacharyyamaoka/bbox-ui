import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CodeField,
  completionMenu,
  type CodeFieldGrammar,
  type CompletionMenuAnchor,
  type CompletionMenuAtEnds,
  type CompletionMenuContext,
  type CompletionMenuItem,
} from "@bbox-ui/core";
import "@bbox-ui/core/completionMenu.css";
import { useMemo, useState } from "react";

/**
 * The autocomplete menu (packages/bbox-ui/src/completionMenu.ts) in the
 * plainest host there is: a CodeField with nothing else going on, so every
 * key and every control can be tried by hand. Mounted as a grammar's
 * `language` — the same no-change seam any real field uses today.
 *
 * Every control below is one `completionMenu` option; switching one
 * rebuilds the grammar, which CodeField swaps in through its compartment
 * without remounting the document.
 */

interface AutocompleteMenuArgs {
  anchor: CompletionMenuAnchor;
  atEnds: CompletionMenuAtEnds;
  maxRows: number;
  footer: boolean;
  badges: boolean;
}

const BOARD_TYPES: CompletionMenuItem[] = [
  { label: "Pose", detail: "position + orientation", type: "board-type" },
  { label: "PoseStamped", detail: "deprecated — use Pose", type: "board-type", deprecated: true },
  { label: "Position", detail: "x, y, z", type: "board-type" },
  { label: "Frame", detail: "a named coordinate frame", type: "board-type" },
  { label: "Trajectory", detail: "list[Pose] over time", type: "board-type" },
  { label: "Transform", detail: "Frame → Frame", type: "board-type" },
  { label: "Twist", detail: "linear + angular velocity", type: "board-type" },
  { label: "Type", detail: "a type on this board", type: "board-type" },
];

const BUILTINS: CompletionMenuItem[] = [
  { label: "print", detail: "print(*values, sep=' ', end='\\n', file=None, flush=False)", type: "builtin" },
  {
    label: "print_exception",
    detail: "traceback.print_exception(exc, /, value, tb, limit=None, file=None, chain=True)",
    type: "builtin",
  },
  { label: "property", detail: "property(fget=None, fset=None, fdel=None, doc=None)", type: "builtin" },
  { label: "pow", detail: "pow(base, exp, mod=None)", type: "builtin" },
  { label: "range", detail: "range(start, stop, step=1)", type: "builtin" },
  { label: "repr", detail: "repr(obj)", type: "builtin" },
  { label: "round", detail: "round(number, ndigits=None)", type: "builtin" },
  { label: "len", detail: "len(obj)", type: "builtin" },
  { label: "list", detail: "list(iterable=())", type: "builtin" },
  { label: "isinstance", detail: "isinstance(obj, class_or_tuple)", type: "builtin" },
  { label: "enumerate", detail: "enumerate(iterable, start=0)", type: "builtin" },
  { label: "sorted", detail: "sorted(iterable, /, *, key=None, reverse=False)", type: "builtin" },
  { label: "type", detail: "type(object)", type: "builtin" },
  { label: "tuple", detail: "tuple(iterable=())", type: "builtin" },
  { label: "zip", detail: "zip(*iterables, strict=False)", type: "builtin" },
];

const VOCABULARY = [...BOARD_TYPES, ...BUILTINS];

const BADGES: Record<string, string> = { "board-type": "board type", builtin: "builtin" };

/** Prefix matches first, then inner matches; widened appends everything else. */
function exampleSource({ word, widened }: CompletionMenuContext) {
  const query = word.query.toLowerCase();
  const prefix = VOCABULARY.filter((item) => item.label.toLowerCase().startsWith(query));
  const inner = VOCABULARY.filter(
    (item) => !prefix.includes(item) && item.label.toLowerCase().includes(query),
  );
  const matches = [...prefix, ...inner];
  if (!widened) return { options: matches };
  return { options: [...matches, ...VOCABULARY.filter((item) => !matches.includes(item))] };
}

const SAMPLE = [
  "pose = Pose(Position(0, 0, 0))",
  "traj = Trajectory([pose])",
  "print(traj)",
  "",
].join("\n");

function AutocompletePlayground(args: AutocompleteMenuArgs) {
  const [lane, setLane] = useState(SAMPLE);
  const [line, setLine] = useState("frame: Fr");
  const { anchor, atEnds, footer, badges } = args;
  // Storybook's URL `args=` hands numbers over as strings.
  const maxRows = Number(args.maxRows) || 10;
  const grammar = useMemo<CodeFieldGrammar>(
    () => ({
      language: completionMenu({
        source: exampleSource,
        anchor,
        atEnds,
        maxRows,
        badge: badges ? (type) => BADGES[type] ?? null : undefined,
        footer: footer
          ? { hint: "every type on this board", widenedHint: "back to likely matches" }
          : undefined,
      }),
    }),
    [anchor, atEnds, maxRows, footer, badges],
  );
  return (
    <div
      style={{
        width: 620,
        minHeight: 560,
        padding: 16,
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <p data-testid="autocomplete-instructions" style={{ margin: "0 0 12px", color: "var(--muted-foreground)" }}>
        Type <code>pri</code>, try ↑/↓ at the ends, <kbd>Ctrl Space</kbd> twice, <kbd>Tab</kbd> vs{" "}
        <kbd>Enter</kbd> inside a word, <kbd>Esc</kbd>.
      </p>
      <CodeField
        testId="autocomplete-multiline"
        ariaLabel="Multi-line text box"
        multiline
        value={lane}
        onWrite={setLane}
        grammar={grammar}
        style={{ fontSize: 13, minHeight: 120 }}
      />
      <p style={{ margin: "16px 0 6px", color: "var(--muted-foreground)" }}>Single line</p>
      <CodeField
        testId="autocomplete-single"
        ariaLabel="Single-line text box"
        value={line}
        onWrite={setLine}
        grammar={grammar}
        style={{ fontSize: 13, width: 280 }}
      />
    </div>
  );
}

const meta = {
  title: "Components/AutocompleteMenu",
  render: (args) => <AutocompletePlayground {...args} />,
  args: {
    anchor: "word",
    atEnds: "wrap",
    maxRows: 10,
    footer: true,
    badges: true,
  },
  argTypes: {
    anchor: {
      control: "inline-radio",
      options: ["cursor", "word", "field"],
      description: "Where the popup's left edge is pinned: the caret, the word's start, or the line's start.",
    },
    atEnds: {
      control: "inline-radio",
      options: ["wrap", "caret"],
      description: "↓ on the last item / ↑ on the first: wrap around, or close and move the caret.",
    },
    maxRows: {
      control: { type: "number", min: 1, max: 20, step: 1 },
      description: "Visible rows before the list scrolls.",
    },
    footer: { control: "boolean", description: "The Ctrl Space widen/narrow strip under the list." },
    badges: { control: "boolean", description: "The fixed-width kind-pill column." },
  },
} satisfies Meta<AutocompleteMenuArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
