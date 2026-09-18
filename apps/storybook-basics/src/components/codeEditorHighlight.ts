// src/components/codeEditorHighlight.ts — the highlighter codeEditor.tsx
// mounts, replacing `syntaxHighlighting(classHighlighter)`.
//
// WHY a hand-written `HighlightStyle` and not `classHighlighter` (the stock
// @lezer/highlight highlighter this replaces): `classHighlighter`'s own
// rule table (node_modules/@lezer/highlight/dist/index.js) has no entry for
// `controlKeyword`, `definitionKeyword`, `moduleKeyword`, `operatorKeyword`,
// or either `function(...)` combination, so @lezer/highlight's own
// specificity fallback (a tag's `.set`, most-specific first) walks past all
// of them to the nearest ancestor tag that DOES have one. Measured on this
// exact tree (@lezer/highlight 1.2.3, @codemirror/lang-python 6.2.1):
//   controlKeyword / definitionKeyword / moduleKeyword / operatorKeyword
//     all collapse to plain `tags.keyword` -> "tok-keyword"
//   a call site, `function(variableName)` (e.g. `range(x)`), collapses to
//     `tok-variableName`; a method call, `function(propertyName)`
//     (e.g. `obj.foo()`), collapses to `tok-propertyName`
//   a Python/JS function DEFINITION is `function(definition(variableName))`
//     — its `.set` chain visits `definition(variableName)` (which DOES
//     have a classHighlighter rule, "tok-variableName tok-definition")
//     BEFORE it ever reaches plain `function(variableName)`, so it collapses
//     there and never reaches a "tok-function" class at all, at any
//     specificity level `classHighlighter` covers.
// In Dark Modern (Zach: "its important that people can set it to what they
// are used to") that means `if`/`return`/`for` render keyword-blue
// (#569cd6) instead of the correct control-purple (#c586c0), and a function
// name renders variable-blue (#9cdcfe) instead of the correct yellow
// (#dcdcaa) — the two most recognisable VS Code colours, both wrong. See
// codeEditorTheme.ts's own WHY on `--bbox-tok-control-keyword`/
// `--bbox-tok-function`, which have carried the right values the whole time
// with nothing ever emitting a class to hang them on.
//
// This file is `classHighlighter`'s own rule list (transcribed verbatim
// below, one rule per line matching its source order) PLUS the missing
// rules, each one UNIONING its class string with whatever `classHighlighter`
// already produced for that exact tag rather than replacing it — never
// "tok-controlKeyword" alone, always "tok-keyword tok-controlKeyword". Two
// reasons, both load-bearing:
//   1. `HighlightStyle`/`tagHighlighter` picks ONE map entry per token — the
//      first match walking that token's tag `.set` from most to least
//      specific — so a rule for the exact composed tag (e.g.
//      `function(definition(variableName))`) must be its own entry with
//      every class the token needs; you cannot "layer" two separate,
//      differently-specific entries and get both.
//   2. codeEditor.css's selectors were written expecting `classHighlighter`-
//      shaped input (a bare token gets exactly one ancestor's class) and
//      groups `tok-keyword`/`tok-operatorKeyword`/`tok-definitionKeyword`/
//      `tok-moduleKeyword` under ONE rule for exactly this reason — keeping
//      the old class present alongside the new one means every rule that
//      already worked keeps working unchanged, with the new, more specific
//      selector (`tok-controlKeyword`, `tok-function`) simply winning the
//      cascade tie by appearing later in that file. Dropping the old class
//      would also fail this file's own H1 unit test, which asserts the new
//      highlighter's class set is a strict superset of `classHighlighter`'s
//      for every token in real Python/JS/JSON source.
import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeEditorHighlightStyle = HighlightStyle.define([
  // --- verbatim from @lezer/highlight's classHighlighter (1.2.3), same order ---
  { tag: tags.link, class: "tok-link" },
  { tag: tags.heading, class: "tok-heading" },
  { tag: tags.emphasis, class: "tok-emphasis" },
  { tag: tags.strong, class: "tok-strong" },
  { tag: tags.keyword, class: "tok-keyword" },
  { tag: tags.atom, class: "tok-atom" },
  { tag: tags.bool, class: "tok-bool" },
  { tag: tags.url, class: "tok-url" },
  { tag: tags.labelName, class: "tok-labelName" },
  { tag: tags.inserted, class: "tok-inserted" },
  { tag: tags.deleted, class: "tok-deleted" },
  { tag: tags.literal, class: "tok-literal" },
  { tag: tags.string, class: "tok-string" },
  { tag: tags.number, class: "tok-number" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2" },
  { tag: tags.variableName, class: "tok-variableName" },
  { tag: tags.local(tags.variableName), class: "tok-variableName tok-local" },
  { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
  { tag: tags.special(tags.variableName), class: "tok-variableName2" },
  { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
  { tag: tags.typeName, class: "tok-typeName" },
  { tag: tags.namespace, class: "tok-namespace" },
  { tag: tags.className, class: "tok-className" },
  { tag: tags.macroName, class: "tok-macroName" },
  { tag: tags.propertyName, class: "tok-propertyName" },
  { tag: tags.operator, class: "tok-operator" },
  { tag: tags.comment, class: "tok-comment" },
  { tag: tags.meta, class: "tok-meta" },
  { tag: tags.invalid, class: "tok-invalid" },
  { tag: tags.punctuation, class: "tok-punctuation" },

  // --- the rules classHighlighter is missing (this file's own WHY above) ---
  // Bare keyword subtags: each already falls under codeEditor.css's shared
  // `.tok-keyword, .tok-operatorKeyword, .tok-definitionKeyword,
  // .tok-moduleKeyword` selector, so keeping "tok-keyword" alongside the
  // specific class changes nothing about which rule matches for these
  // three — only `tok-controlKeyword` has its own separate CSS rule.
  { tag: tags.controlKeyword, class: "tok-keyword tok-controlKeyword" },
  { tag: tags.definitionKeyword, class: "tok-keyword tok-definitionKeyword" },
  { tag: tags.moduleKeyword, class: "tok-keyword tok-moduleKeyword" },
  { tag: tags.operatorKeyword, class: "tok-keyword tok-operatorKeyword" },
  // A function name at a call site (`range(x)`, `obj.foo()`): the bare
  // `function(...)` tag, one level more specific than classHighlighter's
  // own `variableName`/`propertyName` entries above.
  { tag: tags.function(tags.variableName), class: "tok-variableName tok-function" },
  { tag: tags.function(tags.propertyName), class: "tok-propertyName tok-function" },
  // A function/method DEFINITION (`def move(...)`, `function move(...)`):
  // its own most-specific entry, since `function(definition(variableName))`'s
  // `.set` chain reaches `definition(variableName)` (mapped above) before it
  // ever reaches the bare `function(variableName)` rule two lines up — see
  // this file's own WHY, point 1.
  {
    tag: tags.function(tags.definition(tags.variableName)),
    class: "tok-variableName tok-definition tok-function",
  },
  {
    tag: tags.function(tags.definition(tags.propertyName)),
    class: "tok-propertyName tok-definition tok-function",
  },
]);
