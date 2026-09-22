/**
 * The Storybook sidebar's shape, held mechanically (Zach picked proposal B,
 * 2026-09-22: "top level same as repo and then families beneath").
 *
 * WHY a test and not a convention: every title used to be a free string each
 * lane chose locally, and 151 reasonable local choices added up to 11
 * sections, four of them holding one thing, and six components living in two
 * places (reports/media/storybook-org-2026-09-22.html). A rule only a reviewer
 * remembers drifts; this one fails `pnpm test`.
 *
 * Titles and tags are read with Storybook's OWN CSF parser (the one that builds
 * the index), never a regex — a story arg that happens to be called `title`
 * must not be mistaken for the meta's.
 *
 * What it can hold: the section equals the file's top-level folder, the family
 * is from the closed list, tags are from the closed vocabulary, and `host:`
 * tags match what the file really imports. What it cannot: whether a component
 * is in the RIGHT family — that stays a judgement, made where the family list
 * below is edited.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCsf } from "storybook/internal/csf-tools";

const SRC = path.dirname(fileURLToPath(import.meta.url));

/** Section -> the src/ folder its stories live in. Same words as ARCHITECTURE.md:121. */
const SECTIONS: Record<string, string> = {
  Components: "components",
  Scene: "scene",
  Editor: "editor",
  Hosts: "hosts",
  Presets: "presets",
  Skin: "skin",
};

/**
 * The sections that carry a family level, each with its closed list. Add a
 * family here, deliberately — never by typing a new one into a title.
 * WHY Scene has families at 14 entries (under the 15 below): Zach, 2026-09-22,
 * "Lets keep the grouping I think we will be adding more functinality in the
 * future" — the split is by what an operation DOES (his L191 note: layout
 * operations, validation operations…), so new scene functions have a place.
 */
const FAMILIES: Record<string, string[]> = {
  Components: ["Ports", "Blocks", "Traces", "Text & Marks", "Menus & Bars", "Panels & Dialogs", "Stock"],
  Scene: ["Model & Diff", "Wiring", "Validation", "Layout & Drag"],
};

/**
 * WHY 15: a section with no family level must fit one screen of the sidebar.
 * Past that, a section gets a family list above — it does not grow a longer
 * flat list.
 *
 * Family lists are deliberately NOT capped: Stock holds 22 and Panels &
 * Dialogs 18. A family is the last level before the component itself, and
 * splitting either would add a fourth level to reach a Button — the depth
 * this layout exists to avoid. Stock is vendored shadcn, browsed rarely.
 */
const MAX_FLAT_SECTION = 15;

/** `object:` carries the axis the tree does not show — what a story is about. */
const OBJECTS = ["port", "block", "trace", "region", "scene", "text-marks", "chrome", "stock", "skin"];

type StoryFile = { rel: string; title: string; tags: string[] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.tsx?$/.test(f));
const storyFiles: StoryFile[] = sourceFiles
  .filter((f) => f.endsWith(".stories.tsx"))
  .map((f) => {
    const csf = loadCsf(readFileSync(f, "utf8"), { makeTitle: (t?: string) => t ?? "", fileName: f }).parse();
    return { rel: path.relative(SRC, f), title: csf.meta.title ?? "", tags: csf.meta.tags ?? [] };
  });

// ---- which host engines a file reaches, by walking its relative imports ----
// The same statement-bounded patterns as src/engineFree.test.ts's engine wall
// (IMPORT_EDGE_PATTERN / REEXPORT_EDGE_PATTERN): `[^"']*?` cannot cross a
// quote, so the lazy middle never runs past one statement's `from "…"` into the
// next — which is what a semicolon-bounded pattern did in the 18 files here
// written without semicolons, swallowing the real import after a type-only one.
const IMPORT_EDGE = /(?:^|\n)[ \t]*import\s+(type\s+)?(?:([^"']*?)\bfrom\s+)?["']([^"']+)["']/g;
const REEXPORT_EDGE = /(?:^|\n)[ \t]*export\s+(type\s+)?[^"']*?\bfrom\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const withoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

/** Runtime edges only. WHY skip `import type` / `export type`: they erase at
 *  build time, so a story reaching a host only through one does not render in
 *  it and must not be told to claim it (the engine wall's carve-out 1). */
function runtimeSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT_EDGE)) if (!m[1]) out.push(m[3]);
  for (const m of source.matchAll(REEXPORT_EDGE)) if (!m[1]) out.push(m[2]);
  for (const m of source.matchAll(DYNAMIC_IMPORT)) out.push(m[1]);
  return out;
}

function resolveRelative(from: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find(
    (c) => sourceFiles.includes(c),
  );
}

const edges = new Map<string, { local: string[]; packages: string[] }>();
for (const file of sourceFiles) {
  const local: string[] = [];
  const packages: string[] = [];
  for (const spec of runtimeSpecifiers(withoutComments(readFileSync(file, "utf8")))) {
    if (spec.startsWith(".")) {
      const target = resolveRelative(file, spec);
      if (target) local.push(target);
    } else packages.push(spec);
  }
  edges.set(file, { local, packages });
}

const DOM_HOST = path.join(SRC, "hosts/domCanvas.tsx");

function hostsReached(entry: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file === DOM_HOST) out.add("host:dom");
    const node = edges.get(file);
    if (!node) continue;
    for (const p of node.packages) {
      if (p.startsWith("@xyflow/")) out.add("host:react-flow");
      if (p === "tldraw" || p.startsWith("@tldraw/")) out.add("host:tldraw");
    }
    stack.push(...node.local);
  }
  return [...out].sort();
}

describe("story organisation (proposal B)", () => {
  it("finds the stories", () => {
    expect(storyFiles.length).toBeGreaterThan(100);
  });

  it.each(storyFiles)("$rel sits in the section named for its folder", ({ rel, title }) => {
    const [section] = title.split("/");
    expect(Object.keys(SECTIONS), `unknown section "${section}"`).toContain(section);
    expect(rel.split(path.sep)[0], `"${title}" belongs in src/${SECTIONS[section]}/`).toBe(SECTIONS[section]);
  });

  it.each(storyFiles.filter((s) => s.title.split("/")[0] in FAMILIES))(
    "$rel names a family from its section's closed list",
    ({ title }) => {
      const [section, family] = title.split("/");
      expect(FAMILIES[section], `"${title}"`).toContain(family);
    },
  );

  it("keeps every section without a family level to one screen", () => {
    const children = new Map<string, Set<string>>();
    for (const { title } of storyFiles) {
      const [section, next] = title.split("/");
      if (section in FAMILIES || !next) continue;
      children.set(section, (children.get(section) ?? new Set()).add(next));
    }
    for (const [section, set] of children) {
      expect(set.size, `${section} has ${set.size} entries — give it a family level`).toBeLessThanOrEqual(
        MAX_FLAT_SECTION,
      );
    }
  });

  it.each(storyFiles)("$rel carries one object: tag and no area: tag", ({ tags }) => {
    const objects = tags.filter((t) => t.startsWith("object:"));
    expect(objects).toHaveLength(1);
    expect(OBJECTS).toContain(objects[0].slice("object:".length));
    expect(tags.filter((t) => t.startsWith("area:"))).toEqual([]);
  });

  it.each(storyFiles)("$rel has host: tags that match what it imports", ({ rel, tags }) => {
    const declared = tags.filter((t) => t.startsWith("host:")).sort();
    expect(declared).toEqual(hostsReached(path.join(SRC, rel)));
  });
});
