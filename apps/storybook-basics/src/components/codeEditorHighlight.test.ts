/**
 * src/components/codeEditorHighlight.test.ts — `codeEditorHighlightStyle`
 * (codeEditorHighlight.ts's own WHY) as pure @lezer/highlight logic. No DOM
 * here (the "unit" node project — see vitest.config.ts's own WHY); the
 * computed-colour claims this class data actually produces are measured in
 * a real browser by CodeEditor.stories.tsx's `SyntaxThemes` play function.
 *
 * `pnpm exec vitest --project=unit run`
 */
import { javascriptLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import type { LRLanguage } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";

import { codeEditorHighlightStyle } from "./codeEditorHighlight";

interface Span {
  text: string;
  classes: Set<string>;
}

function highlightSpans(language: LRLanguage, code: string, highlighter: Parameters<typeof highlightTree>[1]): Span[] {
  const tree = language.parser.parse(code);
  const spans: Span[] = [];
  highlightTree(tree, highlighter, (from, to, classes) => {
    spans.push({ text: code.slice(from, to), classes: new Set(classes.split(" ").filter(Boolean)) });
  });
  return spans;
}

const PYTHON_SAMPLE = `def summarize_readings(readings: list[float], window_size: int = 5) -> list[float]:
    """Roll a window and aggregate."""
    if not readings:
        return []
    results: list[float] = []
    for index in range(len(readings)):
        span = readings[index : index + window_size]
        if len(span) > 2:
            results.append(sum(span) / len(span))
        elif index == 0:
            results.append(max(span))
        else:
            raise ValueError(f"bad span: {span!r}")
    return results
`;

const JS_SAMPLE = `class Router {
  move(target) {
    if (target) {
      return target;
    } else {
      for (let i = 0; i < 3; i++) {
        console.log(i);
      }
    }
  }
}
function plan(a, b) { return a + b; }
const obj = { greet() { return 1; }, name: "x" };
let y = plan(1, 2);
obj.greet();
import { a } from "b";
export const c = 1;
`;

const JSON_SAMPLE = `{"a": 1, "b": true, "c": null, "d": [1, 2], "e": {"f": "g"}}`;

const SAMPLES: { label: string; language: LRLanguage; code: string }[] = [
  { label: "Python", language: pythonLanguage, code: PYTHON_SAMPLE },
  { label: "JavaScript", language: javascriptLanguage, code: JS_SAMPLE },
  { label: "JSON", language: jsonLanguage, code: JSON_SAMPLE },
];

describe("codeEditorHighlightStyle — H1: no token loses a class", () => {
  for (const { label, language, code } of SAMPLES) {
    it(`is a superset of classHighlighter's own output, token by token (${label})`, () => {
      const oldSpans = highlightSpans(language, code, classHighlighter);
      const newSpans = highlightSpans(language, code, codeEditorHighlightStyle);
      expect(newSpans.length).toBe(oldSpans.length);
      for (let i = 0; i < oldSpans.length; i++) {
        const oldSpan = oldSpans[i];
        const newSpan = newSpans[i];
        expect(newSpan.text).toBe(oldSpan.text);
        const missing = [...oldSpan.classes].filter((cls) => !newSpan.classes.has(cls));
        expect(missing, `${JSON.stringify(oldSpan.text)} lost ${JSON.stringify(missing)}`).toEqual([]);
      }
    });
  }
});

describe("codeEditorHighlightStyle — H2: the previously-collapsed tags", () => {
  function classesFor(text: string, language: LRLanguage, code: string): Set<string> {
    const spans = highlightSpans(language, code, codeEditorHighlightStyle);
    const match = spans.find((span) => span.text === text);
    if (!match) throw new Error(`no span for ${JSON.stringify(text)} in sample`);
    return match.classes;
  }

  it("Python `if` (a controlKeyword) carries tok-controlKeyword", () => {
    expect(classesFor("if", pythonLanguage, PYTHON_SAMPLE).has("tok-controlKeyword")).toBe(true);
  });

  it("the name in `def summarize_readings(...)` carries tok-function", () => {
    expect(classesFor("summarize_readings", pythonLanguage, PYTHON_SAMPLE).has("tok-function")).toBe(true);
  });

  it("a bare function call (`range(...)`) also carries tok-function", () => {
    expect(classesFor("range", pythonLanguage, PYTHON_SAMPLE).has("tok-function")).toBe(true);
  });

  it("a method call (`.append(...)`) also carries tok-function", () => {
    expect(classesFor("append", pythonLanguage, PYTHON_SAMPLE).has("tok-function")).toBe(true);
  });

  it("Python `import`/`from` (moduleKeyword-ish) and `def` (definitionKeyword) still keep tok-keyword", () => {
    // "def" is a definitionKeyword — confirms the union design (H1's own
    // guarantee), not a fresh claim: still carries the class classHighlighter
    // gave it, PLUS the specific one.
    const defClasses = classesFor("def", pythonLanguage, PYTHON_SAMPLE);
    expect(defClasses.has("tok-keyword")).toBe(true);
    expect(defClasses.has("tok-definitionKeyword")).toBe(true);
  });
});
