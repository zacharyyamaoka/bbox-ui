// src/components/codeEditorTheme.ts — the palette-swap half of syntax
// theming (docs/FEEDBACK-2026-09-17b-PLAN.md A-2). `codeEditor.tsx` mounts
// `syntaxHighlighting(classHighlighter)` once and never touches it again;
// `classHighlighter` (@lezer/highlight) emits stable, colourless `tok-*`
// classes, and codeEditor.css is the one place those get a colour — under
// selectors that read `var(--bbox-tok-*, <today's literal>)`. A theme is
// therefore nothing but a map of those custom-property names to hex
// strings, applied inline on the editor root: no second highlighter, no
// per-theme `EditorView.theme()`. Pure data + one small resolver, no React
// import needed beyond the `CSSProperties` return type.
//
// WHY a palette swap and not a CodeMirror theme extension: `EditorView.theme()`
// reconfigures CodeMirror's own stylesheet machinery per instance — four
// themes would mean four compartmented extensions, reconciled against
// whatever `classHighlighter` already painted, fighting the same cascade
// this file's sibling CSS already resolved once (codeEditor.css's own WHY
// on selector specificity). A CSS variable is one inline `style` write, no
// CodeMirror reconfiguration, and it composes with a caller's own `style`
// override for free.
import type { CSSProperties } from "react";

export interface CodeEditorTheme {
  /** Stable id — what a `theme` prop or a `<select>`'s `value` carries. */
  id: string;
  /** Human label, e.g. "Dark Modern". */
  label: string;
  appearance: "dark" | "light";
  /** CSS custom properties (`--bbox-tok-*`), applied inline to the editor root. */
  vars: Record<string, string>;
}

/**
 * Published token colours, read straight off each theme's own page at
 * https://code.visualstudio.com/docs/configure/themes (docs/FEEDBACK-2026-09-17b-PLAN.md
 * A-2's table). `controlKeyword` and `function` are carried even though
 * `classHighlighter` never actually emits `tok-controlKeyword`/`tok-function`
 * for any language this app ships (see CodeEditor.stories.tsx's `SyntaxThemes`
 * story doc comment) — keyword and control-keyword both collapse to
 * `tok-keyword`, and a function name collapses to `tok-variableName` (a def)
 * or `tok-propertyName` (a call), because @lezer/highlight's own
 * `classHighlighter` rule table has no entry for either subtag and falls
 * back to the nearest ancestor tag that does. Shipping the variable anyway
 * costs nothing and themes it correctly the day that changes.
 */
export const CODE_EDITOR_THEMES: readonly CodeEditorTheme[] = [
  {
    id: "dark-modern",
    label: "Dark Modern",
    appearance: "dark",
    vars: {
      "--bbox-tok-bg": "#1f1f1f",
      "--bbox-tok-fg": "#cccccc",
      "--bbox-tok-keyword": "#569cd6",
      "--bbox-tok-control-keyword": "#c586c0",
      "--bbox-tok-string": "#ce9178",
      "--bbox-tok-number": "#b5cea8",
      "--bbox-tok-comment": "#6a9955",
      "--bbox-tok-type": "#4ec9b0",
      "--bbox-tok-function": "#dcdcaa",
      "--bbox-tok-variable": "#9cdcfe",
      "--bbox-tok-operator": "#d4d4d4",
    },
  },
  {
    id: "light-modern",
    label: "Light Modern",
    appearance: "light",
    vars: {
      "--bbox-tok-bg": "#ffffff",
      "--bbox-tok-fg": "#3b3b3b",
      "--bbox-tok-keyword": "#0000ff",
      "--bbox-tok-control-keyword": "#af00db",
      "--bbox-tok-string": "#a31515",
      "--bbox-tok-number": "#098658",
      "--bbox-tok-comment": "#008000",
      "--bbox-tok-type": "#267f99",
      "--bbox-tok-function": "#795e26",
      "--bbox-tok-variable": "#001080",
      "--bbox-tok-operator": "#000000",
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    appearance: "dark",
    vars: {
      "--bbox-tok-bg": "#272822",
      "--bbox-tok-fg": "#f8f8f2",
      "--bbox-tok-keyword": "#f92672",
      "--bbox-tok-control-keyword": "#f92672",
      "--bbox-tok-string": "#e6db74",
      "--bbox-tok-number": "#ae81ff",
      "--bbox-tok-comment": "#75715e",
      "--bbox-tok-type": "#66d9ef",
      "--bbox-tok-function": "#a6e22e",
      "--bbox-tok-variable": "#f8f8f2",
      "--bbox-tok-operator": "#f92672",
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    appearance: "dark",
    vars: {
      "--bbox-tok-bg": "#002b36",
      "--bbox-tok-fg": "#839496",
      "--bbox-tok-keyword": "#859900",
      "--bbox-tok-control-keyword": "#859900",
      "--bbox-tok-string": "#2aa198",
      "--bbox-tok-number": "#d33682",
      "--bbox-tok-comment": "#586e75",
      "--bbox-tok-type": "#b58900",
      "--bbox-tok-function": "#268bd2",
      "--bbox-tok-variable": "#839496",
      "--bbox-tok-operator": "#839496",
    },
  },
];

/**
 * Resolves a `theme` prop (an id, a full `CodeEditorTheme`, or `undefined`)
 * to the inline style `CodeEditor` applies to its root. An id that doesn't
 * match `CODE_EDITOR_THEMES` — a typo, a stale saved value — falls back to
 * `{}` (no vars at all, i.e. every `tok-*` rule's own CSS-literal fallback)
 * SILENTLY: a bad id must not blank the editor's colours, only leave them
 * at the ambient default.
 */
export function codeEditorThemeVars(theme?: CodeEditorTheme | string): CSSProperties {
  const resolved = typeof theme === "string" ? CODE_EDITOR_THEMES.find((t) => t.id === theme) : theme;
  return resolved ? (resolved.vars as CSSProperties) : {};
}
