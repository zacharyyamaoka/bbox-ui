import type { JSX } from "react";

/**
 * The canonical Python, highlighted.
 *
 * WHY ~40 lines of regex instead of a highlighter dependency: the corpus is 57
 * short, hand-authored snippets in one dialect — no dunder soup, no f-string
 * nesting, no notebook magics. Shiki/Prism/CodeMirror each arrive with their
 * own theme system and a grammar bundle far heavier than the text it colours,
 * and this app already carries React Flow. The trade is explicit: this is a
 * COLOURER, not a parser, and it is deliberately conservative — anything it
 * cannot classify stays plain text rather than being mis-classified.
 *
 * Truthfulness rule (feedback_truthful_property_rendering): every authored
 * character is emitted exactly once, in order. The scanner below only ever
 * advances by the length of what it consumed and pushes the skipped text
 * verbatim, so it cannot drop, trim or normalise a character even when it
 * fails to recognise one.
 */

const KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
  "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield",
]);

const CONSTANTS = new Set(["True", "False", "None", "self", "cls"]);

const BUILTINS = new Set([
  "abs", "all", "any", "bool", "bytes", "dict", "enumerate", "filter", "float",
  "frozenset", "getattr", "int", "isinstance", "iter", "len", "list", "map",
  "max", "min", "next", "open", "print", "range", "repr", "reversed", "round",
  "set", "setattr", "sorted", "str", "sum", "tuple", "type", "zip",
]);

/** Ordered: the first pattern that matches at the cursor wins, so a string
 *  containing `#` is a string and a comment containing `def` is a comment. */
const TOKEN = new RegExp(
  [
    "(?<comment>#[^\\n]*)",
    "(?<string>[rbfu]{0,2}(?:'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"|'(?:\\\\.|[^'\\\\\\n])*'|\"(?:\\\\.|[^\"\\\\\\n])*\"))",
    "(?<decorator>@[A-Za-z_][\\w.]*)",
    "(?<number>\\b\\d[\\w.]*\\b)",
    "(?<word>\\b[A-Za-z_]\\w*\\b)",
  ].join("|"),
  "g",
);

const CLASS_OF: Record<string, string> = {
  comment: "text-ink-dim2 italic",
  string: "text-ink-ok",
  decorator: "text-ink-purple",
  number: "text-ink-gold",
  keyword: "text-ink-purple",
  constant: "text-ink-accent",
  builtin: "text-ink-accent/80",
  // A name right after `def`/`class` — the thing the scenario is about.
  defname: "text-primary font-semibold",
};

export function PyCode({ code, className = "" }: { code: string; className?: string }): JSX.Element {
  const out: JSX.Element[] = [];
  let cursor = 0;
  let key = 0;
  let afterDef = false;
  const plain = (text: string) => {
    if (text) out.push(<span key={key++}>{text}</span>);
  };

  // A fresh instance per call: `lastIndex` is per-RegExp state, so a shared
  // one would resume mid-snippet on the second call.
  const scanner = new RegExp(TOKEN.source, TOKEN.flags);
  for (let m = scanner.exec(code); m; m = scanner.exec(code)) {
    plain(code.slice(cursor, m.index));
    cursor = m.index + m[0].length;
    const g = m.groups ?? {};
    let kind: string | null = null;
    if (g.comment) kind = "comment";
    else if (g.string) kind = "string";
    else if (g.decorator) kind = "decorator";
    else if (g.number) kind = "number";
    else if (g.word) {
      if (afterDef) kind = "defname";
      else if (KEYWORDS.has(g.word)) kind = "keyword";
      else if (CONSTANTS.has(g.word)) kind = "constant";
      else if (BUILTINS.has(g.word)) kind = "builtin";
      afterDef = g.word === "def" || g.word === "class";
    }
    if (g.word === undefined) afterDef = false;
    out.push(
      kind
        ? <span key={key++} className={CLASS_OF[kind]}>{m[0]}</span>
        : <span key={key++}>{m[0]}</span>,
    );
  }
  plain(code.slice(cursor));

  return (
    <pre
      className={`overflow-x-auto rounded-lg border bg-card px-3 py-2.5 font-mono text-[11.5px] leading-[1.55] whitespace-pre ${className}`}
    >
      <code>{out}</code>
    </pre>
  );
}
