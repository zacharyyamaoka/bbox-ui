// src/engineFree.test.ts — the engine wall, stated as a test (docs/
// SYSTEMSKETCH-REBUILD-PLAN.md §2, "The core imports no canvas engine").
//
// `components/layering.test.ts` already walls `components/` off from the
// scene kit. This file walls the THREE engine-free kits — `components/`,
// `scene/`, `editor/` — off from BOTH canvas engines (`presets/` was a fourth
// until 2026-09-22; presets now live with the component they configure).
// The rebuild (`apps/systemsketch`) imports these directories through one
// alias and mounts them inside tldraw; the day one of them imports `tldraw`
// or `@xyflow/react` the "bbox-ui + stock tldraw" claim silently becomes
// "tldraw + tldraw", and nothing but this file would notice.
//
// Only `hosts/` (which now contains the tldraw benches, `hosts/detach/`) and
// the app itself may import an engine. Deliberately textual, like layering.test.ts: the rule is "no such
// SPECIFIER appears in non-test source", cheap and legible as a grep.
// Comments mentioning an engine by name do not match (the pattern needs the
// `from "…"` clause), which is exactly right — `controlValue.ts` cites a
// tldraw type in prose and imports nothing.
//
// ---------------------------------------------------------------------------
// WHY there are now TWO walls, a direct one and a transitive one (2026-09-21)
//
// The specifier grep above reads ONE file at a time, so it only ever saw
// DIRECT imports. A kit file that imported a neighbour which imported an
// engine passed clean while pulling the engine in anyway — the wall had a
// hole exactly one hop wide, and every hop after that was free. Measured on
// the tree the day this was written, eight story files under `scene/` and
// `presets/` reached `@xyflow/react` through `hosts/reactFlowHost`, and the
// grep called all eight green.
//
// So the direct check stays (it is the rule about VOCABULARY: a kit file may
// not name an engine, not even for a type — ARCHITECTURE.md, "No React, no
// DOM, no engine, not even their types"), and a second check walks the local
// import graph and asks the different question: can this file REACH an
// engine at all?
//
// The walk is still textual — it greps the same specifiers out of the same
// sources and follows the relative ones. It does not typecheck, resolve
// `node_modules`, or honour a tsconfig path alias. Two carve-outs, both
// deliberate, both mutation-tested below:
//
//   1. `import type` / `export type` edges are NOT followed. They erase at
//      build time, so they cannot drag an engine into a bundle, and the
//      direct check already bans a kit file from naming an engine's types
//      itself. Following them would flag `editor/recordingViewer.tsx`
//      for what its neighbour's neighbour says: it takes `import type
//      { RecordingBundle }` from `recording/recordingClient.ts`, which takes
//      `import type { RecordingPayload }` from `recording/flightRecorder.ts`,
//      which is the one module deliberately outside the wall (it reads
//      tldraw through `editor.on`). Nothing of tldraw survives to runtime
//      down that chain, and nothing of tldraw's vocabulary reaches the
//      component. The INLINE form (`import { type T } from …`) is followed
//      anyway, conservatively — a stricter walk is the safe direction.
//   2. A `.stories.tsx` file's walk does not descend into `hosts/`. A story
//      is a BENCH, and mounting two engine hosts side by side is its job —
//      it is how "one scene, two hosts" stops being an aspiration and
//      becomes a measurement (ARCHITECTURE.md: "One host cannot falsify a
//      contract; two can"). Banning it would delete the proof the
//      architecture rests on. A story that imports an engine DIRECTLY is
//      still caught, at depth 0, by the first wall.
//
// The honest statement of what is still open: a NON-story kit file may not
// launder an engine through `hosts/` (that walk does descend, and is green
// today), but a story may reach anything `hosts/` can reach. That is the
// price of keeping the three-host benches, and it is named here rather than
// left to be discovered.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/** The kits that must stay engine-free. `hosts/` is NOT here on purpose —
 *  it is where every engine-touching file lives, including `hosts/detach/`.
 *
 *  WHY `layout/` left this list (2026-09-21, the kit refactor): it did not
 *  lose its wall, it stopped existing. `layout/fitToContent.ts` is pure fit
 *  math reused across components, so it moved into `scene/` — which is on
 *  this list — and the directory drained to empty. Leaving the name here
 *  would fail the existsSync sanity check below; deleting it costs nothing
 *  because the file it protected is still behind the wall. */
const ENGINE_FREE_DIRS = ["components", "scene", "editor"] as const;

const ENGINE_IMPORT_PATTERN = /from\s+["'](?:tldraw|@tldraw\/[^"']+|@xyflow\/[^"']+)["']/g;

/** One local module edge, as it is written in the source. */
type Edge = { specifier: string; typeOnly: boolean };

/** `import … from "x"`, `import "x"`, and the type-only spellings of the
 *  first. `[^"']*?` cannot cross a quote, so the lazy middle can never run
 *  past one statement's `from "…"` clause into the next statement's. */
const IMPORT_EDGE_PATTERN = /(?:^|\n)[ \t]*import\s+(type\s+)?(?:([^"']*?)\bfrom\s+)?["']([^"']+)["']/g;

/** `export … from "x"` — a re-export is a real runtime edge, and `index.ts`
 *  barrels are made of them. The `\bfrom\s+` is required (unlike the import
 *  form) so `export const path = "./somewhere"` is not read as an edge. */
const REEXPORT_EDGE_PATTERN = /(?:^|\n)[ \t]*export\s+(type\s+)?[^"']*?\bfrom\s+["']([^"']+)["']/g;

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

const sourceCache = new Map<string, string>();
function commentFreeSource(file: string): string {
  let cached = sourceCache.get(file);
  if (cached === undefined) {
    cached = withoutComments(readFileSync(file, "utf8"));
    sourceCache.set(file, cached);
  }
  return cached;
}

/** Every local (relative) module edge out of `source`, as written. */
function localEdges(source: string): Edge[] {
  const edges: Edge[] = [];
  IMPORT_EDGE_PATTERN.lastIndex = 0;
  for (let m = IMPORT_EDGE_PATTERN.exec(source); m; m = IMPORT_EDGE_PATTERN.exec(source)) {
    if (m[3].startsWith(".")) edges.push({ specifier: m[3], typeOnly: Boolean(m[1]) });
  }
  REEXPORT_EDGE_PATTERN.lastIndex = 0;
  for (let m = REEXPORT_EDGE_PATTERN.exec(source); m; m = REEXPORT_EDGE_PATTERN.exec(source)) {
    if (m[2].startsWith(".")) edges.push({ specifier: m[2], typeOnly: Boolean(m[1]) });
  }
  return edges;
}

/** TypeScript's own resolution order, minus the parts nothing here uses.
 *  Returns null for a non-module asset (`./x.css`, `./fixture.json?raw`) —
 *  the completeness test below proves that is the ONLY reason it ever does. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ""));
  for (const candidate of [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The chain of files from `entry` to the first one that imports an engine,
 *  or null if it cannot reach one. `stopAtHosts` implements carve-out 2. */
function engineChain(entry: string, stopAtHosts: boolean): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const source = commentFreeSource(file);
    ENGINE_IMPORT_PATTERN.lastIndex = 0;
    if (ENGINE_IMPORT_PATTERN.test(source)) return [file];
    for (const edge of localEdges(source)) {
      if (edge.typeOnly) continue;
      const next = resolveLocal(file, edge.specifier);
      if (!next) continue;
      if (stopAtHosts && relative(SRC, next).startsWith("hosts/")) continue;
      const rest = walk(next);
      if (rest) return [file, ...rest];
    }
    return null;
  };
  return walk(entry);
}

function kitEntryPoints(): string[] {
  return ENGINE_FREE_DIRS.flatMap((dir) => sourceFilesUnder(join(SRC, dir)));
}

describe("engine wall — the kits the rebuild imports never import a canvas engine", () => {
  it("scans real directories (a wrong path would vacuously pass)", () => {
    for (const dir of ENGINE_FREE_DIRS) {
      expect(existsSync(join(SRC, dir)), `${dir} exists`).toBe(true);
    }
    // At least the files the rebuild leans on hardest.
    const files = new Set(ENGINE_FREE_DIRS.flatMap((dir) => sourceFilesUnder(join(SRC, dir))).map((f) => relative(SRC, f)));
    for (const expected of ["components/block.tsx", "components/codeEditor.tsx", "components/trace.tsx", "editor/toolDock.tsx", "editor/chromeBar.tsx", "scene/region.branch.ts"]) {
      expect(files.has(expected), expected).toBe(true);
    }
  });

  it("no non-test file under components/, scene/, editor/ imports tldraw or @xyflow/react", () => {
    const offenders: { file: string; specifier: string }[] = [];
    for (const dir of ENGINE_FREE_DIRS) {
      for (const file of sourceFilesUnder(join(SRC, dir))) {
        const matches = withoutComments(readFileSync(file, "utf8")).match(ENGINE_IMPORT_PATTERN);
        if (matches) for (const specifier of matches) offenders.push({ file: relative(SRC, file), specifier });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("…nor REACHES one through a chain of local imports", () => {
    const offenders: string[] = [];
    for (const file of kitEntryPoints()) {
      const chain = engineChain(file, /\.stories\.tsx$/.test(file));
      if (chain) offenders.push(chain.map((f) => relative(SRC, f)).join(" -> "));
    }
    expect(offenders).toEqual([]);
  });

  /** WHY this sits beside the walk: the walk's only failure mode is going
   *  QUIET. A specifier it cannot resolve is a branch it never follows, so a
   *  resolution gap reads as a pass. Pin the gap instead — every local
   *  specifier in the whole tree resolves to a module, or it is a non-module
   *  asset and says so in its own extension. */
  it("the walk resolves every local module specifier (an unresolved one is a branch it silently skips)", () => {
    const unresolved: string[] = [];
    for (const dir of [...ENGINE_FREE_DIRS, "hosts"]) {
      for (const file of sourceFilesUnder(join(SRC, dir))) {
        for (const edge of localEdges(commentFreeSource(file))) {
          if (resolveLocal(file, edge.specifier)) continue;
          if (/\.(css|json|svg|png|txt|md|systemsketch|bbox)(\?\w+)?$/.test(edge.specifier)) continue;
          unresolved.push(`${relative(SRC, file)} -> ${edge.specifier}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
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

  it("the edge parser is sensitive too (regression guard for the WALK's teeth)", () => {
    const edges = (src: string) => localEdges(withoutComments(src));

    // The shapes the walk must follow.
    expect(edges('import { a } from "./neighbour";')).toEqual([{ specifier: "./neighbour", typeOnly: false }]);
    expect(edges('import "./sideEffect";')).toEqual([{ specifier: "./sideEffect", typeOnly: false }]);
    expect(edges('export { a } from "./barrel";')).toEqual([{ specifier: "./barrel", typeOnly: false }]);
    // A multi-line import is one edge, and the lazy middle does not run past
    // the preceding statement's `from` clause into this one.
    expect(edges('import React from "react";\nimport {\n  a,\n  b,\n} from "./multi";')).toEqual([
      { specifier: "./multi", typeOnly: false },
    ]);

    // The shapes it must NOT follow, or must mark type-only (carve-out 1).
    expect(edges('import type { A } from "./types";')).toEqual([{ specifier: "./types", typeOnly: true }]);
    expect(edges('export type { A } from "./types";')).toEqual([{ specifier: "./types", typeOnly: true }]);
    expect(edges('import { a } from "tldraw";')).toEqual([]); // bare specifiers are not local edges
    expect(edges('export const dir = "./not-an-import";')).toEqual([]);
    // Conservative on purpose: the INLINE type modifier is followed anyway.
    expect(edges('import { type A } from "./types";')).toEqual([{ specifier: "./types", typeOnly: false }]);
  });

  it("the walk actually walks (a one-hop chain is found, a type-only hop is not)", () => {
    // Driven against real files rather than a fixture, so the assertion dies
    // if the tree stops looking like this rather than passing on a mock.
    const host = join(SRC, "hosts", "reactFlowHost.tsx");
    const story = join(SRC, "components", "ControlFlowGallery.stories.tsx");
    expect(existsSync(host) && existsSync(story), "the fixtures for this assertion still exist").toBe(true);

    // With the stories carve-out OFF, the bench's engine is visible — proof
    // the walk traverses, and proof carve-out 2 is what lets it pass above.
    const found = engineChain(story, false);
    expect(found, "the walk follows components/ -> hosts/ -> @xyflow/react").not.toBeNull();
    expect(found!.map((f) => relative(SRC, f))).toEqual([
      "components/ControlFlowGallery.stories.tsx",
      "hosts/reactFlowHost.tsx",
    ]);
    expect(engineChain(story, true), "…and stops at hosts/ when the carve-out is on").toBeNull();

    // Carve-out 1, on the real chain that motivated it.
    expect(engineChain(join(SRC, "editor", "recordingViewer.tsx"), false)).toBeNull();
  });
});
