// src/shapes/code/languages.ts — `ss-code`'s four-value `language` enum
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3) turned into the CodeMirror
// `LanguageSupport` the trunk's `CodeEditor` takes.
//
// WHY THIS FILE EXISTS AT ALL, and why the specifier looks like that.
//
// `apps/systemsketch/package.json` does not depend on `@codemirror/*` — only
// `tldraw`, `react`, `lucide-react` and the trunk. Under pnpm's strict
// node_modules that is not a detail: `import { python } from
// "@codemirror/lang-python"` written in THIS app fails outright, measured
// here on 2026-09-18 as
//
//     src/shapes/code/__probe_a.ts(1,24): error TS2307: Cannot find module
//     '@codemirror/lang-python' or its corresponding type declarations.
//
// while the same import written in `apps/storybook-basics` resolves (that is
// where `codeEditor.tsx` itself imports `@codemirror/view` from). So the
// lane brief's first option — "import them from the trunk's package names" —
// is measurably not available, and this is its stated fallback: one tiny
// module that reaches the packages through the trunk's own `node_modules`
// and re-exports the result, so exactly ONE file in this app carries the
// unusual specifier.
//
// `@trunk` is the alias for `apps/storybook-basics/src` (vite.config.ts,
// tsconfig.json). Both resolvers replace the prefix textually, so
// `@trunk/../node_modules/<pkg>` is literally "the trunk app's own
// node_modules" — the same physical package the `CodeEditor` that consumes
// this value was built against, which is the property that matters: one
// `@codemirror/state` instance, not two.
//
// OWED, and deliberately NOT done here: the honest fix is three lines in
// `apps/systemsketch/package.json` (`@codemirror/lang-python`,
// `-javascript`, `-json`) plus a `pnpm install`. package.json and the
// lockfile are shared, orchestrator-owned resources in this repo
// (CLAUDE.md: "agents declare deps, never install") and neither is in this
// lane's write set, so this lane DECLARES the dependency here and leaves
// the install to the dispatcher. When those three lines land, every
// `@trunk/../node_modules/` below becomes a plain package name and nothing
// else in this file changes.
import { javascript } from "@trunk/../node_modules/@codemirror/lang-javascript";
import { json } from "@trunk/../node_modules/@codemirror/lang-json";
import { python } from "@trunk/../node_modules/@codemirror/lang-python";

import type { CodeLanguage } from "./CodeShapeUtil";

type LanguageSupport = ReturnType<typeof python>;

/**
 * Built once per language, on first sight.
 *
 * WHY memoized rather than `python()` at the call site: `CodeEditor`
 * reconfigures its language compartment in a `useLayoutEffect` keyed on the
 * `language` PROP IDENTITY (components/codeEditor.tsx's
 * `languageCompartment.reconfigure`), so a fresh `LanguageSupport` object on
 * every render would dispatch a CodeMirror transaction on every keystroke —
 * a parser rebuild per character typed.
 */
const built = new Map<CodeLanguage, LanguageSupport | undefined>();

const FACTORIES: Record<CodeLanguage, (() => LanguageSupport) | null> = {
  python,
  javascript,
  json,
  // `plaintext` is an honest absence, not a missing case: `CodeEditor`'s
  // `language` is optional and omitting it is how the trunk spells "no
  // syntax parser" (codeEditor.tsx:110).
  plaintext: null,
};

export function languageSupportFor(language: CodeLanguage): LanguageSupport | undefined {
  if (!built.has(language)) {
    const factory = FACTORIES[language];
    built.set(language, factory ? factory() : undefined);
  }
  return built.get(language);
}
