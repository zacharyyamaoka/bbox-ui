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

/** The family level under Components — closed. Add a family here, deliberately, not in a title. */
const COMPONENT_FAMILIES = [
  "Ports",
  "Blocks",
  "Traces",
  "Text & Marks",
  "Menus & Bars",
  "Panels & Dialogs",
  "Stock",
];

/**
 * WHY 15: a section with no family level must fit one screen of the sidebar.
 * Components (79 entries) is the only section over it; Hosts sits at 13 —
 * thirteen "X in a host" boards read better flat than as five families of two.
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
const SPECIFIER = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const withoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

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
  for (const m of withoutComments(readFileSync(file, "utf8")).matchAll(SPECIFIER)) {
    const spec = m[1] ?? m[2] ?? m[3];
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

  it.each(storyFiles.filter((s) => s.title.startsWith("Components/")))(
    "$rel names a Components family from the closed list",
    ({ title }) => {
      expect(COMPONENT_FAMILIES).toContain(title.split("/")[1]);
    },
  );

  it("keeps every section without a family level to one screen", () => {
    const children = new Map<string, Set<string>>();
    for (const { title } of storyFiles) {
      const [section, next] = title.split("/");
      if (section === "Components" || !next) continue;
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
