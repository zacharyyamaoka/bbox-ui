import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { python } from "@codemirror/lang-python";
import type { EditorView } from "@codemirror/view";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { CodeEditor } from "../components/codeEditor";
import { CODE_EDITOR_THEMES } from "../components/codeEditorTheme";

/**
 * `CodeEditor` is controlled — the host owns `value` — so every interactive
 * story wraps it in a small stateful component, same pattern
 * EditableText.stories.tsx's `ControlledEditableText` uses. `onWrite` is
 * write-through (fires on every keystroke, codeEditor.tsx's one write
 * policy), so a play function can read the committed text straight off
 * `value` state via the rendered `[data-testid="value"]` probe below rather
 * than reaching into CodeMirror's own document.
 */
function ControlledCodeEditor({
  initial,
  ...props
}: Omit<ComponentProps<typeof CodeEditor>, "value" | "onWrite"> & { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <CodeEditor {...props} value={value} onWrite={setValue} />
      <div data-testid="value" style={{ display: "none" }}>
        {value}
      </div>
    </div>
  );
}

/**
 * `@testing-library/user-event`'s `.type()`/`.keyboard()` cannot put text
 * into CodeMirror's `contenteditable` document — verified live (headless
 * Chrome, not jsdom): Chromium only performs its native contenteditable
 * text-insertion behaviour for TRUSTED keystrokes, and every event
 * user-event dispatches is a synthetic, untrusted `KeyboardEvent`, so it
 * never mutates the DOM and CodeMirror (which reads real edits off its own
 * `contenteditable` via `input`/mutation observation) sees nothing happen.
 * `document.execCommand('insertText', …)` is deprecated but still performs
 * a REAL DOM mutation and fires a genuine `input` event with
 * `inputType: "insertText"` — CodeMirror's input handling observes that
 * exactly as it would a real keystroke, so this exercises the same code
 * path a person typing would, just without the trusted-event requirement
 * testing-library can't satisfy. Key-only interactions (Enter/Escape/
 * Ctrl+End) don't have this problem: CodeMirror reads those directly off
 * the `KeyboardEvent` object at `keydown` (either this component's own
 * `domEventHandlers.keydown`, or a `defaultKeymap` COMMAND), which a
 * synthetic event delivers just fine — `userEvent.keyboard()` stays the
 * right tool for those below.
 */
function typeIntoCodeEditor(field: HTMLElement, text: string) {
  const content = field.querySelector(".cm-content");
  if (!(content instanceof HTMLElement)) throw new Error("expected a .cm-content element");
  content.focus();
  document.execCommand("insertText", false, text);
}

const meta = {
  title: "Basics/CodeEditor",
  component: CodeEditor,
  // Every story below supplies its own `render` (CodeEditor is controlled,
  // so each wraps it in `ControlledCodeEditor`) — these are just the
  // required-prop defaults `Meta` needs to typecheck, never actually used.
  args: { value: "", onWrite: () => {} },
} satisfies Meta<typeof CodeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The port-label shape: one line, no gutter, `multiline` off. A pasted (or
 * otherwise inserted) newline can never split it into two lines —
 * `singleLineGuard` (codeEditorGuards.ts) is a `transactionFilter`, so this
 * is tested by dispatching a transaction directly against the live
 * `EditorView` (captured via `onViewReady`) rather than faking a browser
 * clipboard paste, which headless CI often can't grant permission for
 * anyway — the guard's own contract is "by ANY path", and a raw transaction
 * exercises the filter exactly the same way a real paste would.
 */
export const SingleLine: Story = {
  render: () => <SingleLineHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvasElement.querySelector('[data-slot="code-editor"]');
    if (!(field instanceof HTMLElement)) throw new Error('expected a [data-slot="code-editor"]');
    await expect(field.getAttribute("data-multiline")).toBe("false");
    await expect(field.querySelector(".cm-gutters")).toBeNull();

    await userEvent.click(field);
    typeIntoCodeEditor(field, "hello");
    await waitFor(async () => {
      await expect(canvas.getByTestId("value").textContent).toBe("hello");
    });

    // Enter commits (onEnter) rather than inserting a newline.
    await userEvent.keyboard("{Enter}");
    await waitFor(async () => {
      await expect(canvas.getByTestId("committed").textContent).toBe("hello");
    });
    await expect(canvas.getByTestId("value").textContent).not.toContain("\n");

    // A pasted/inserted newline is stripped, not split into a second line —
    // dispatched directly against the live view (see this story's own WHY).
    const harness = capturedView;
    if (!harness) throw new Error("expected the EditorView to have been captured via onViewReady");
    harness.dispatch({
      changes: { from: 2, to: 2, insert: "a\nb" },
    });
    await waitFor(async () => {
      // "he" + "ab" (the "a\nb" insert, newline stripped) + "llo".
      await expect(canvas.getByTestId("value").textContent).toBe("heabllo");
    });
    await expect(canvasElement.querySelectorAll(".cm-line").length).toBe(1);
  },
};

/** The live `EditorView` of whichever interactive story is currently
 * mounted — module-scoped rather than threaded through props, since only
 * one story's `onViewReady` ever fires between a play function's own
 * `render` and its assertions. */
let capturedView: EditorView | null = null;

function SingleLineHarness() {
  const [committed, setCommitted] = useState("");
  return (
    <div>
      <ControlledCodeEditor
        initial=""
        style={{ width: 160 }}
        testId="single-line"
        onViewReady={(view) => {
          capturedView = view;
        }}
        onEnter={() => {
          const el = document.querySelector('[data-testid="value"]');
          setCommitted(el?.textContent ?? "");
        }}
      />
      <div data-testid="committed" style={{ display: "none" }}>
        {committed}
      </div>
    </div>
  );
}

/**
 * The multiline-port-editor shape: several lines, `lineHeightPx` pinned so
 * rows sit on a fixed pitch. Enter inserts a real line here (the opposite
 * of `SingleLine`'s guard) — a `defaultKeymap` COMMAND CodeMirror runs off
 * the raw `KeyboardEvent`, not native contenteditable text insertion, so
 * (unlike literal character typing) a synthetic key event is enough.
 */
export const MultiLine: Story = {
  render: () => (
    <ControlledCodeEditor
      initial={"first\nsecond"}
      multiline
      lineHeightPx={20}
      testId="multi-line"
      style={{ width: 240 }}
      onViewReady={(view) => {
        capturedView = view;
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvasElement.querySelector('[data-slot="code-editor"]');
    if (!(field instanceof HTMLElement)) throw new Error('expected a [data-slot="code-editor"]');
    await expect(field.getAttribute("data-multiline")).toBe("true");

    const lines = canvasElement.querySelectorAll(".cm-line");
    await expect(lines.length).toBe(2);
    for (const line of Array.from(lines)) {
      await expect(getComputedStyle(line).height).toBe("20px");
    }

    if (!capturedView) throw new Error("expected the EditorView to have been captured via onViewReady");
    const content = field.querySelector(".cm-content");
    if (!(content instanceof HTMLElement)) throw new Error("expected a .cm-content element");
    content.focus();
    capturedView.dispatch({ selection: { anchor: capturedView.state.doc.length } });

    await userEvent.keyboard("{Enter}");
    typeIntoCodeEditor(field, "third");

    await waitFor(async () => {
      await expect(canvas.getByTestId("value").textContent).toBe("first\nsecond\nthird");
    });
    await waitFor(async () => {
      await expect(canvasElement.querySelectorAll(".cm-line").length).toBe(3);
    });
    for (const line of Array.from(canvasElement.querySelectorAll(".cm-line"))) {
      await expect(getComputedStyle(line).height).toBe("20px");
    }
  },
};

/**
 * Zach's screenshot: Python, line numbers, ~100-character width, no
 * wrapping, a horizontal scrollbar once a line runs past that width — the
 * "code block / text editor mode" `LabeledPort`'s multiline editor wants.
 * `columns={100}` drives the box's pixel width through the recovered
 * `codeEditorWidthPx` maths (codeEditorLayout.ts) rather than a guessed px
 * number. The seeded source has one line well past 100 columns so the
 * scrollbar this story exists to prove is actually reachable, not just
 * theoretically wired.
 */
const PSEUDO_CODE = `def summarize_readings(readings: list[float], window_size: int = 5, aggregation: str = "mean", *, drop_outliers: bool = True) -> list[float]:
    """Roll a window across \`readings\` and aggregate each span using \`aggregation\`."""
    if not readings:
        return []

    results: list[float] = []
    for index in range(len(readings)):
        start = max(0, index - window_size + 1)
        span = readings[start : index + 1]
        if drop_outliers and len(span) > 2:
            span = sorted(span)[1:-1]
        if aggregation == "mean":
            results.append(sum(span) / len(span))
        elif aggregation == "max":
            results.append(max(span))
        else:
            raise ValueError(f"unknown aggregation: {aggregation!r}")
    return results
`;

export const PseudoCode: Story = {
  render: () => (
    <ControlledCodeEditor
      initial={PSEUDO_CODE}
      multiline
      language={python()}
      lineNumbers
      columns={100}
      overflow="scroll"
      testId="pseudo-code"
    />
  ),
  play: async ({ canvasElement }) => {
    const field = canvasElement.querySelector('[data-slot="code-editor"]');
    if (!(field instanceof HTMLElement)) throw new Error('expected a [data-slot="code-editor"]');

    // Gutter: present and opaque (the fix recovered from codeBlock.css).
    const gutters = field.querySelector(".cm-gutters");
    if (!(gutters instanceof HTMLElement)) throw new Error("expected a .cm-gutters element");
    const gutterBg = getComputedStyle(gutters).backgroundColor;
    await expect(gutterBg).not.toBe("transparent");
    await expect(gutterBg).not.toBe("rgba(0, 0, 0, 0)");

    // ~100 columns wide: the box's own inline width comes from columns→px.
    const widthPx = field.getBoundingClientRect().width;
    await expect(widthPx).toBeGreaterThan(600); // 100 cols * ~13px*0.61 + gutter+padding
    await expect(widthPx).toBeLessThan(900);

    // No soft wrap: CodeMirror's own base theme puts `white-space: pre` on
    // `.cm-content` (measured live — see codeEditor.css's own WHY for why
    // this file doesn't fight that cascade tie), and `pre` itself never
    // wraps; `cm-lineWrapping` is the class/`pre-wrap` pair that WOULD mean
    // wrapping is active, so its absence is the real "no soft wrap" check.
    const content = field.querySelector(".cm-content");
    if (!(content instanceof HTMLElement)) throw new Error("expected a .cm-content element");
    await expect(content.classList.contains("cm-lineWrapping")).toBe(false);
    await expect(getComputedStyle(content).whiteSpace).not.toBe("pre-wrap");

    // A horizontal scrollbar is genuinely reachable: the seeded `def` line
    // is wider than the box, so the scroller's content overflows it.
    const scroller = field.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) throw new Error("expected a .cm-scroller element");
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);

    // Syntax highlighting is live: Python tokens actually receive tok-* classes.
    const tokens = field.querySelectorAll('[class*="tok-"]');
    await expect(tokens.length).toBeGreaterThan(0);
    const keywordToken = field.querySelector(".tok-keyword, .tok-definitionKeyword");
    await expect(keywordToken).not.toBeNull();

    // Scroll horizontally: the gutter stays pinned (sticky) and does not
    // move with the content, and its background stays opaque so the
    // scrolled text cannot bleed through behind the numbers.
    const gutterRectBefore = gutters.getBoundingClientRect();
    scroller.scrollLeft = 300;
    await waitFor(async () => {
      await expect(scroller.scrollLeft).toBeGreaterThan(0);
    });
    const gutterRectAfter = gutters.getBoundingClientRect();
    await expect(gutterRectAfter.left).toBe(gutterRectBefore.left);
    await expect(getComputedStyle(gutters).backgroundColor).toBe(gutterBg);
  },
};

/** All three modes side by side — the shape a port label, a lane row, and the pseudo-code editor each want. */
export const Gallery: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.6 }}>SingleLine — port label</div>
        <ControlledCodeEditor initial="port_name" style={{ width: 200 }} />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.6 }}>MultiLine — lane rows</div>
        <ControlledCodeEditor initial={"one\ntwo\nthree"} multiline lineHeightPx={20} style={{ width: 240 }} />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.6 }}>PseudoCode — text editor mode</div>
        <ControlledCodeEditor
          initial={PSEUDO_CODE}
          multiline
          language={python()}
          lineNumbers
          columns={100}
          overflow="scroll"
        />
      </div>
    </div>
  ),
};

/**
 * A-2 (docs/FEEDBACK-2026-09-17b-PLAN.md, Zach: "I like using dark modern
 * … its important that people can set it to what they are used to"; and,
 * asking for this specific story: "can you please create a story that
 * shows how you can change the syntax highlighting color for the Pseudo
 * Code code editor view?"). Exercises every row of the theme table
 * `codeEditorTheme.ts` ships — keyword / control keyword / string / number
 * / comment / type(class) / variable / function / operator — across the
 * "every theme" gallery below (`THEME_SAMPLE`, kept short and readable
 * side by side four times) and the live theme-switching editor above it,
 * which is the actual `PseudoCode` view (same props, same `PSEUDO_CODE`
 * document as the `PseudoCode` story below) rather than a shorter
 * unrelated sample: that view is what Zach named, and `PSEUDO_CODE`
 * exercises `if`/`elif`/`else`/`for`/`return`/`raise` (all
 * `controlKeyword`) and a real `def summarize_readings(...)` function name
 * — precisely the two tags `codeEditorHighlight.ts` had to add (its own
 * WHY), so this story is the visible proof of that fix, not a demo beside it.
 */
const THEME_SAMPLE = `class Router:  # a comment
    """Follow a path and stop within tolerance."""
    def move(self, target: Pose, speed: float = 1.5) -> bool:
        if target is None:
            return False
        distance = target.x - self.x
        return distance < speed
`;

function ThemeSwatch({ id, label, testId }: { id?: string; label: string; testId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <ControlledCodeEditor
        initial={THEME_SAMPLE}
        multiline
        language={python()}
        theme={id}
        lineNumbers
        columns={44}
        testId={testId}
      />
    </div>
  );
}

/**
 * The SAME shape as the `PseudoCode` story below (multiline, Python,
 * gutter, 100 columns, a horizontal scrollbar) over the SAME `PSEUDO_CODE`
 * document — not a shorter stand-in — because that is the exact view Zach
 * asked to see themed, and its control keywords / function name are the
 * two tokens this whole feature exists to fix (this story's own WHY above).
 */
function LiveThemedEditor() {
  const [themeId, setThemeId] = useState<string>(CODE_EDITOR_THEMES[0].id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <select
        data-testid="theme-select"
        value={themeId}
        onChange={(event) => setThemeId(event.target.value)}
      >
        {CODE_EDITOR_THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label}
          </option>
        ))}
      </select>
      <ControlledCodeEditor
        initial={PSEUDO_CODE}
        multiline
        language={python()}
        theme={themeId}
        lineNumbers
        columns={100}
        overflow="scroll"
        testId="theme-live"
      />
    </div>
  );
}

export const SyntaxThemes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.6 }}>
          Flip the theme live — the SAME editor, only the palette changes
        </div>
        <LiveThemedEditor />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.6 }}>Every theme, side by side</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ThemeSwatch label="No theme (default)" testId="swatch-none" />
          <ThemeSwatch id="not-a-real-theme" label="Unknown id (typo)" testId="swatch-unknown" />
          {CODE_EDITOR_THEMES.map((theme) => (
            <ThemeSwatch key={theme.id} id={theme.id} label={theme.label} testId={`swatch-${theme.id}`} />
          ))}
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tokenColor = (testId: string, selector: string) => {
      const field = canvasElement.querySelector(`[data-testid="${testId}"]`);
      if (!(field instanceof HTMLElement)) throw new Error(`expected [data-testid="${testId}"]`);
      const token = field.querySelector(selector);
      if (!(token instanceof HTMLElement)) throw new Error(`expected a ${selector} token in ${testId}`);
      return getComputedStyle(token).color;
    };
    const keywordColor = (testId: string) => tokenColor(testId, ".tok-keyword");
    const rootBg = (testId: string) => {
      const field = canvasElement.querySelector(`[data-testid="${testId}"]`);
      if (!(field instanceof HTMLElement)) throw new Error(`expected [data-testid="${testId}"]`);
      return getComputedStyle(field).backgroundColor;
    };
    // A reusable off-DOM probe: append a span with a literal `color`,
    // read its computed value back, remove it. Lets an assertion compare
    // against an exact CSS formula rather than a hand-copied rgb() literal,
    // which would also bake in this browser's own colour-space rounding.
    const literalColor = (color: string) => {
      const probe = document.createElement("span");
      probe.style.color = color;
      canvasElement.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };

    // A-2a: with NO theme, `tok-keyword`'s computed colour is
    // byte-identical to what it was before this change. Rather than a
    // hardcoded computed-pixel literal (which would also encode the
    // browser's colour-space quirks, not just this file's own claim), the
    // reference element below inlines the EXACT pre-edit CSS literal —
    // codeEditor.css's `.tok-keyword` rule read verbatim before A-2 — so
    // this assertion is "does the var()'s fallback still equal today's
    // literal", which is the actual claim A-2a makes.
    const referenceColor = literalColor("color-mix(in srgb, #4f6ee5 78%, var(--color-foreground))");
    await expect(keywordColor("swatch-none")).toBe(referenceColor);

    // A-2b: dark-modern's published token colours, exactly.
    await expect(keywordColor("swatch-dark-modern")).toBe("rgb(86, 156, 214)");
    await expect(rootBg("swatch-dark-modern")).toBe("rgb(31, 31, 31)");

    // A-2d: an unknown theme id ("not-a-real-theme", a typo) renders the
    // default palette (same colour as no theme at all) and throws nothing
    // getting here — the render above already had to succeed for this
    // play function to run at all.
    await expect(keywordColor("swatch-unknown")).toBe(referenceColor);

    // H4: with NO theme, the fix must not have moved anything that was
    // already correct — `class`/`def` (definitionKeyword, folded under the
    // same `.tok-keyword` rule as before — codeEditorHighlight.ts's own
    // WHY) and `if`/`return` (controlKeyword, its own selector but the
    // SAME literal fallback formula, verified in that file's own WHY)
    // still match the exact pre-fix `.tok-keyword` literal above; `move`
    // (a function definition) still matches `.tok-variableName`'s own
    // literal, because codeEditor.css's `.tok-function` fallback was
    // edited to match it byte-for-byte (that rule's own WHY) specifically
    // so turning the class "on" couldn't repaint every function name the
    // moment no theme is set.
    await expect(tokenColor("swatch-none", ".tok-definitionKeyword")).toBe(referenceColor);
    await expect(tokenColor("swatch-none", ".tok-controlKeyword")).toBe(referenceColor);
    const variableReferenceColor = literalColor("#4f6ee5");
    await expect(tokenColor("swatch-none", ".tok-function")).toBe(variableReferenceColor);
    // `Router` (a class name) touches none of this fix's rules — confirms
    // the untouched path really is untouched, not just assumed so.
    const typeReferenceColor = literalColor("color-mix(in srgb, #4f6ee5 55%, var(--color-foreground))");
    await expect(tokenColor("swatch-none", ".tok-className")).toBe(typeReferenceColor);

    // H3: with the live editor's initial theme (dark-modern) over the
    // REAL PseudoCode view, a control keyword is VS Code's control-purple
    // and the function name is VS Code's function-yellow — the two colours
    // the bug collapsed to keyword-blue / variable-blue (this story's own
    // WHY, and codeEditorHighlight.ts's).
    await expect(tokenColor("theme-live", ".tok-controlKeyword")).toBe("rgb(197, 134, 192)");
    await expect(tokenColor("theme-live", ".tok-function")).toBe("rgb(220, 220, 170)");

    // A-2c: the live select actually drives the SAME editor's colour.
    const before = keywordColor("theme-live"); // dark-modern, the select's first option
    const select = canvasElement.querySelector('[data-testid="theme-select"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('expected the theme <select>');
    await userEvent.selectOptions(select, "monokai");
    await waitFor(async () => {
      const after = keywordColor("theme-live");
      await expect(after).not.toBe(before);
      await expect(after).toBe("rgb(249, 38, 114)"); // monokai's #f92672
    });
  },
};
