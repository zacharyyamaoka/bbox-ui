// src/engineFree.test.ts — the engine wall, stated as a test (docs/
// SYSTEMSKETCH-REBUILD-PLAN.md §2, "The core imports no canvas engine").
//
// `components/layering.test.ts` already walls `components/` off from the
// scene kit. This file walls the FOUR engine-free kits — `components/`,
// `scene/`, `editor/`, `presets/`, `layout/` — off from BOTH canvas engines.
// The rebuild (`apps/systemsketch`) imports these directories through one
// alias and mounts them inside tldraw; the day one of them imports `tldraw`
// or `@xyflow/react` the "bbox-ui + stock tldraw" claim silently becomes
// "tldraw + tldraw", and nothing but this file would notice.
//
// Only `hosts/`, `detach/` (tldraw benches) and the app itself may import an
// engine. Deliberately textual, like layering.test.ts: the rule is "no such
// SPECIFIER appears in non-test source", cheap and legible as a grep.
// Comments mentioning an engine by name do not match (the pattern needs the
// `from "…"` clause), which is exactly right — `controlValue.ts` cites a
// tldraw type in prose and imports nothing.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/** The kits that must stay engine-free. `hosts/` and `detach/` are NOT here on purpose. */
const ENGINE_FREE_DIRS = ["components", "scene", "editor", "presets", "layout"] as const;

const ENGINE_IMPORT_PATTERN = /from\s+["'](?:tldraw|@tldraw\/[^"']+|@xyflow\/[^"']+)["']/g;

/** Comments are prose, not imports — `controlValue.ts:10` quotes a tldraw
 *  type's import line in a `//` comment while importing nothing, and that is
 *  exactly the kind of citation the provenance rule asks for. Same device as
 *  the archive's `_without_comments` (tests/test_stock_boundary.py:13-21). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?:^|\n)[ \t]*\/\/.*(?=\n|$)/g, "");
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

describe("engine wall — the kits the rebuild imports never import a canvas engine", () => {
  it("scans real directories (a wrong path would vacuously pass)", () => {
    for (const dir of ENGINE_FREE_DIRS) {
      expect(existsSync(join(SRC, dir)), `${dir} exists`).toBe(true);
    }
    // At least the files the rebuild leans on hardest.
    const files = new Set(sourceFilesUnder(join(SRC, "components")).map((f) => relative(SRC, f)));
    for (const expected of ["components/block.tsx", "components/codeEditor.tsx", "components/trace.tsx", "components/toolDock.tsx", "components/chromeBar.tsx"]) {
      expect(files.has(expected), expected).toBe(true);
    }
  });

  it("no non-test file under components/, scene/, editor/, presets/, layout/ imports tldraw or @xyflow/react", () => {
    const offenders: { file: string; specifier: string }[] = [];
    for (const dir of ENGINE_FREE_DIRS) {
      for (const file of sourceFilesUnder(join(SRC, dir))) {
        const matches = withoutComments(readFileSync(file, "utf8")).match(ENGINE_IMPORT_PATTERN);
        if (matches) for (const specifier of matches) offenders.push({ file: relative(SRC, file), specifier });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern is sensitive (regression guard for this test's own teeth)", () => {
    expect('import { T } from "tldraw";'.match(ENGINE_IMPORT_PATTERN)).not.toBeNull();
    expect("import type { Node } from '@xyflow/react';".match(ENGINE_IMPORT_PATTERN)).not.toBeNull();
    expect('import { x } from "@tldraw/tlschema";'.match(ENGINE_IMPORT_PATTERN)).not.toBeNull();
    // Prose that names an engine is not an import — even prose that quotes an import line.
    expect("// the same rule tldraw's `markEventAsHandled` applies".match(ENGINE_IMPORT_PATTERN)).toBeNull();
    expect(withoutComments("// SharedStyle } from 'tldraw'` — the one borrowed type\nconst x = 1;").match(ENGINE_IMPORT_PATTERN)).toBeNull();
    expect(withoutComments("/* from 'tldraw' */ import { T } from \"tldraw\";").match(ENGINE_IMPORT_PATTERN)).toHaveLength(1);
  });
});
