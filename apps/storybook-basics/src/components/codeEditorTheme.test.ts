/**
 * src/components/codeEditorTheme.test.ts — `codeEditorThemeVars`'s
 * resolution rules as pure logic: an id resolves, a bad id degrades to no
 * theme rather than throwing, and a theme object passed directly is used
 * as-is. No DOM here (the "unit" node project — see vitest.config.ts's own
 * WHY); the computed-colour claims this data actually produces are
 * measured in a real browser by CodeEditor.stories.tsx's `SyntaxThemes`.
 */
import { describe, expect, it } from "vitest";

import { CODE_EDITOR_THEMES, codeEditorThemeVars } from "./codeEditorTheme";

describe("CODE_EDITOR_THEMES", () => {
  it("ships exactly the four VS Code themes named in the plan", () => {
    expect(CODE_EDITOR_THEMES.map((t) => t.id)).toEqual([
      "dark-modern",
      "light-modern",
      "monokai",
      "solarized-dark",
    ]);
  });

  it("every theme carries a var for every row of the published table", () => {
    const keys = [
      "--bbox-tok-bg",
      "--bbox-tok-fg",
      "--bbox-tok-keyword",
      "--bbox-tok-control-keyword",
      "--bbox-tok-string",
      "--bbox-tok-number",
      "--bbox-tok-comment",
      "--bbox-tok-type",
      "--bbox-tok-function",
      "--bbox-tok-variable",
      "--bbox-tok-operator",
    ];
    for (const theme of CODE_EDITOR_THEMES) {
      expect(Object.keys(theme.vars).sort()).toEqual(keys.sort());
    }
  });

  it("dark-modern matches the plan's published table exactly", () => {
    const darkModern = CODE_EDITOR_THEMES.find((t) => t.id === "dark-modern");
    expect(darkModern?.vars).toEqual({
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
    });
  });
});

describe("codeEditorThemeVars", () => {
  it("resolves a known id to that theme's vars", () => {
    expect(codeEditorThemeVars("dark-modern")).toMatchObject({ "--bbox-tok-keyword": "#569cd6" });
  });

  it("resolves a theme object passed directly, without a CODE_EDITOR_THEMES lookup", () => {
    const custom = {
      id: "custom",
      label: "Custom",
      appearance: "dark" as const,
      vars: { "--bbox-tok-keyword": "#ff00ff" },
    };
    expect(codeEditorThemeVars(custom)).toEqual({ "--bbox-tok-keyword": "#ff00ff" });
  });

  it("returns no vars (falls through to the CSS literal) for undefined", () => {
    expect(codeEditorThemeVars(undefined)).toEqual({});
  });

  it("returns no vars, and does not throw, for an unknown theme id (A-2d)", () => {
    expect(() => codeEditorThemeVars("not-a-real-theme")).not.toThrow();
    expect(codeEditorThemeVars("not-a-real-theme")).toEqual({});
  });
});
