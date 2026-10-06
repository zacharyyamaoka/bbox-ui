// src/shellLift.test.ts — B-SHELL-P1 acceptance, the static half: WHERE the
// chrome's wiring lives after the lift, read from the import graph.
//
// Committed RED by the lane's acceptance author before any builder existed
// (docs/lanes/finish-B-SHELL-P1.md). OFF-LIMITS to the builder.
//
// The runtime half (`shellLift.smoke.test.tsx`, `tldrawHostPort.smoke.test.tsx`,
// `apps/bbox-no-host/scripts/windows.acceptance.mjs`) proves the windows work on
// both hosts. This file proves the thing a runtime test cannot see: that each
// window is MOUNTED by the engine-free shell and no longer by the tldraw app —
// "Whatever lives only in the app is what a second host has to rebuild"
// (CLAUDE.md, "The host apps only host"). L-RF-HOST mounts the same shell next.
//
//   - SHELL-P1/disposition — docs/WORK-ORDER-HOST-LESS-SHELL.md §4.2 rows
//     marked "shell", re-confirmed against this tree in the brief: the seven
//     trunk window components below are mounted by TRUNK/shell and by no app
//     file.
//   - SHELL-P1/residual-scene (static half) — lanes.json B-SHELL-P1 extra 5:
//     no app or shell code calls `useDocumentScene` any more; focusLens,
//     compareView and problems read the port's cached `scene()`.
//
// Comments are stripped before any scan (the same rule, and the same reason,
// as `chromeActionsAreWired.test.ts`'s `codeOnly`): this repo explains itself
// in prose, and a WHY comment that names `useDocumentScene` is not a call.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const APP_SRC = path.dirname(new URL(import.meta.url).pathname);
const SHELL = path.resolve(APP_SRC, "../../storybook-basics/src/shell");

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^.*?\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, " "));
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.(test\.tsx?|stories\.tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

/** One value import (or re-export): its specifier and the VALUE names it
 *  brings in. `import type …`, `export type … from` and `type`-prefixed names
 *  erase at build time, so they are not wiring. A namespace or default import
 *  (`* as X`, `X`) is recorded as `"*"` — it can reach every export. */
export interface ValueImport {
  specifier: string;
  names: string[];
}

export function valueImports(code: string): ValueImport[] {
  const out: ValueImport[] = [];
  // `[^;]` keeps one statement from swallowing the next (an `export type X = …;`
  // must never lend its `type` to a later value import).
  const statement = /\b(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;
  for (const match of code.matchAll(statement)) {
    const [, , typeOnly, clause, specifier] = match;
    if (typeOnly) continue;
    const names: string[] = [];
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const item of braces[1].split(",").map((part) => part.trim()).filter(Boolean)) {
        if (item.startsWith("type ")) continue;
        names.push(item.split(/\s+as\s+/)[0].trim());
      }
    }
    const outside = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    if (outside.length > 0) names.push("*");
    if (names.length > 0) out.push({ specifier, names });
  }
  for (const match of code.matchAll(/\bimport\s*["']([^"']+)["']/g)) out.push({ specifier: match[1], names: [] });
  return out;
}

const APP_FILES = sourceFiles(APP_SRC).map((file) => ({ file: path.relative(APP_SRC, file), code: codeOnly(readFileSync(file, "utf8")) }));
const SHELL_FILES = (() => {
  try {
    return sourceFiles(SHELL).map((file) => ({ file: path.relative(SHELL, file), code: codeOnly(readFileSync(file, "utf8")) }));
  } catch {
    return [];
  }
})();

/**
 * The trunk window components §4.2 marks "shell", as [module, component]. The
 * tldraw app mounts every one of them today (measured on BASE); after the
 * lift the shell does and the app does not. NOT in the list, on purpose:
 *   - `InspectorPanel` — the Inspector surface is host-supplied until
 *     L-INSPECTOR (W4) rebuilds it (`lanes.json` L-INSPECTOR writeSet);
 *   - `floatingToolbar.placement` — a pure module, not a window; whoever
 *     places the pill imports it.
 */
const SHELL_WINDOWS = [
  ["chromeBar", "ChromeBar"],
  ["toolDock", "ToolDock"],
  ["statusStrip", "StatusStrip"],
  ["panelShell", "PanelShell"],
  ["floatingToolbar", "FloatingToolbar"],
  ["framesPanel", "FramesPanel"],
  ["problemsPanel", "ProblemsPanel"],
] as const;

/**
 * WHY the COMPONENT name and not the whole module: the app keeps importing
 * small parts of these modules from files outside this lane's write set —
 * `files/session.tsx` takes `ChromeBarIcons`, `backend/BackendSettings.tsx`
 * takes `StatusDot`, and the host-supplied pill content takes `PILL_POPOVER`
 * / `PILL_SURFACE_HEX` (measured on BASE). Those are parts, not the window.
 * Mounting the window is what moves.
 */
function mountsWindow(imports: ValueImport[], module: string, component: string, from: "shell" | "app"): boolean {
  return imports.some(({ specifier, names }) => {
    const sameModule =
      from === "app"
        ? specifier === `@trunk/editor/${module}`
        : specifier === `@trunk/editor/${module}` || specifier.endsWith(`/editor/${module}`);
    return sameModule && (names.includes(component) || names.includes("*"));
  });
}

describe("B-SHELL-P1 — where the chrome is wired", () => {
  it("non-vacuity: both trees are really scanned", () => {
    expect(APP_FILES.length, "app source files scanned").toBeGreaterThan(40);
    expect(APP_FILES.map((entry) => entry.file)).toContain("App.tsx");
    expect(SHELL_FILES.map((entry) => entry.file), `TRUNK/shell scanned at ${SHELL}`).toContain("BboxShell.tsx");
  });

  it.each(SHELL_WINDOWS)("SHELL-P1/disposition: @trunk/editor/%s's %s is mounted by TRUNK/shell, and by no tldraw-app file", (module, component) => {
    const inShell = SHELL_FILES.filter((entry) => mountsWindow(valueImports(entry.code), module, component, "shell")).map((entry) => entry.file);
    const inApp = APP_FILES.filter((entry) => mountsWindow(valueImports(entry.code), module, component, "app")).map((entry) => entry.file);
    expect(inShell, `no file under TRUNK/shell mounts ${component} — it has not been lifted`).not.toEqual([]);
    expect(inApp, `the tldraw app still mounts ${component} itself — the shell should, and the app only supply the port`).toEqual([]);
  });

  it("SHELL-P1/residual-scene: no app or shell code calls useDocumentScene — the chrome reads the port's cached scene()", () => {
    const callers: string[] = [];
    for (const { file, code } of [...APP_FILES, ...SHELL_FILES.map((entry) => ({ ...entry, file: `@trunk/shell/${entry.file}` }))]) {
      // The definition itself (document/sceneFromStore.ts, outside this lane's
      // write set) is not a call.
      const calls = code.replace(/\bfunction\s+useDocumentScene\s*\(/g, "").match(/\buseDocumentScene\s*\(/g) ?? [];
      if (calls.length > 0) callers.push(`${file} ×${calls.length}`);
    }
    expect(callers, "useDocumentScene rebuilds the scene on every store tick (camera, pointer, selection)").toEqual([]);
  });

  it("the import reader itself: value names count; type-only imports, type names and parts of a window module do not", () => {
    const sample = [
      "export type Earlier = number;",
      'import { ChromeBar } from "@trunk/editor/chromeBar";',
      'import type { ToolItem } from "@trunk/editor/toolDock";',
      'import { type ToolSection } from "@trunk/editor/toolDock";',
      'import { StatusStrip, type StatusStripItem as Item } from "@trunk/editor/statusStrip";',
      'export { PanelShell } from "../editor/panelShell";',
      'import "./side-effect.css";',
    ].join("\n");
    expect(valueImports(sample)).toEqual([
      { specifier: "@trunk/editor/chromeBar", names: ["ChromeBar"] },
      { specifier: "@trunk/editor/statusStrip", names: ["StatusStrip"] },
      { specifier: "../editor/panelShell", names: ["PanelShell"] },
      { specifier: "./side-effect.css", names: [] },
    ]);
    expect(mountsWindow(valueImports('import { StatusDot } from "@trunk/editor/chromeBar";'), "chromeBar", "ChromeBar", "app")).toBe(false);
    expect(mountsWindow(valueImports('import * as kit from "@trunk/editor/chromeBar";'), "chromeBar", "ChromeBar", "app")).toBe(true);
    expect(mountsWindow(valueImports('import { ChromeBar } from "../editor/chromeBar";'), "chromeBar", "ChromeBar", "shell")).toBe(true);
  });
});
