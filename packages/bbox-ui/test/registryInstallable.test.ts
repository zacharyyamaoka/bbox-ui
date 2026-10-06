import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as glyphContentPackage from "@bbox-ui/glyph-content";
import { describe, expect, it } from "vitest";

/**
 * ACCEPTANCE for lane L-REG — "every registry item installs"
 * (docs/finish-2026-09-29/lanes.json, lane L-REG; brief:
 * docs/lanes/finish-L-REG.md). Committed RED by the acceptance author before
 * the builder existed; the builder may not edit this file.
 *
 * WHY this half lives here and the install half in
 * `docs/acceptance/registry/test_registry_installs.py`: everything below is
 * static and runs in milliseconds with no network, so it rides `pnpm -r test`
 * on EVERY later merge — the ratchet `registrySnapshot.test.ts` (same folder)
 * already is for payload freshness. The real consumer proof (`shadcn add`
 * into a throwaway project, then `tsc`) needs npm and minutes, so it is the
 * Python half, run at the L-REG merge and in W5's G5.
 *
 * Every test name starts with the lane id and names the extra it pins.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

interface RegistryFile {
  path: string;
  type: string;
  target?: string;
  content?: string;
}
interface RegistryItem {
  name: string;
  type: string;
  files: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
}

const registry = JSON.parse(read("registry.json")) as { items: RegistryItem[] };
const itemNames = registry.items.map((item) => item.name);
const byName = new Map(registry.items.map((item) => [item.name, item]));

/** The published payload `shadcn add` actually installs, or null when it was never built. */
function payload(name: string): RegistryItem | null {
  const file = path.join(repoRoot, "public", "r", `${name}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RegistryItem) : null;
}

// The same statement-shaped match `docs/verify_registry_install.py` uses
// (BBOX_IMPORT): line-anchored so `skin.css`'s doc-comment mention of
// `@bbox-ui/core/skin.css` stays prose, not a dependency.
const BBOX_IMPORT = /^\s*(?:import|export)\b[^;]*?["'](@bbox-ui\/[^"']+)["']/gm;
const CODE_SUFFIXES = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];

function unpublishedImports(item: RegistryItem): string[] {
  const found = new Set((item.dependencies ?? []).filter((dep) => dep.startsWith("@bbox-ui/")));
  for (const file of item.files) {
    if (!CODE_SUFFIXES.some((suffix) => file.path.endsWith(suffix))) continue;
    for (const match of (file.content ?? "").matchAll(BBOX_IMPORT)) {
      found.add(match[1].split("/").slice(0, 2).join("/"));
    }
  }
  return [...found].sort();
}

/**
 * Which bbox item a `registryDependencies` entry points at, or null. Only a
 * NAMESPACED (`@bbox/block-port`) or URL/path (`…/r/block-port.json`) entry
 * counts: a bare name (`block-port`) is resolved by shadcn against its OWN
 * default registry, never this one — measured 2026-10-06 with shadcn 4.21.3
 * (a relative `./b.json` resolves against the consumer's cwd, not the item,
 * and fails; `@ns/b` with a `registries` entry in components.json and an
 * absolute path both resolve).
 */
function bboxItemReferencedBy(dep: string, self: string): string | null {
  let name: string;
  if (/^@[^/]+\/[^/]+$/.test(dep)) name = dep.split("/")[1];
  else if (dep.includes("/")) name = dep.replace(/\/+$/, "").split("/").pop()!.replace(/\.json$/, "");
  else return null;
  return name !== self && byName.has(name) ? name : null;
}

describe("L-REG — the uninstallable pin is empty, and CLAUDE.md says so", () => {
  it("L-REG pin: EXPECTED_UNINSTALLABLE in docs/verify_registry_install.py is still present and empty", () => {
    const source = read("docs/verify_registry_install.py");
    const start = source.search(/^EXPECTED_UNINSTALLABLE\b[^=\n]*=/m);
    // WHY "still present": the pin is the guard that makes a NEW unpublished
    // import fail by name instead of joining a skip list. Deleting it would
    // pass "empty" trivially and remove the guard (CLAUDE.md, "Which items it
    // skips is derived, not listed by hand — and the derivation is pinned").
    expect(start, "EXPECTED_UNINSTALLABLE was removed — keep the pin, empty").toBeGreaterThanOrEqual(0);
    let rhs = source.slice(source.indexOf("=", start) + 1);
    let depth = 0;
    let end = 0;
    for (; end < rhs.length; end += 1) {
      const ch = rhs[end];
      if ("([{".includes(ch)) depth += 1;
      else if (")]}".includes(ch)) depth -= 1;
      else if (ch === "\n" && depth === 0 && rhs.slice(0, end).trim()) break;
    }
    rhs = rhs.slice(0, end).replace(/#.*$/gm, "").replace(/\s+/g, " ").trim();
    const pinned = [...rhs.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    expect(pinned, "these items are still pinned as uninstallable").toEqual([]);
    expect(rhs, "an empty pin must be a set (`set()`) — `{}` is a dict and never equals the derived set").toMatch(
      /^(?:frozen)?set\(\s*(?:\[\s*\]|\(\s*\))?\s*\)$/,
    );
  });

  it("L-REG CLAUDE.md: 'The registry is the product' states the pin is empty and no longer claims the six do not install", () => {
    const claude = read("CLAUDE.md");
    const start = claude.indexOf("## The registry is the product");
    expect(start, "CLAUDE.md lost its registry section").toBeGreaterThanOrEqual(0);
    const next = claude.indexOf("\n## ", start + 3);
    const section = claude.slice(start, next < 0 ? undefined : next).replace(/\s+/g, " ");
    // A window, not "same sentence": a sentence naming
    // `docs/verify_registry_install.py` has dots in it. The word "empty"
    // appears nowhere in this section on BASE, so the window cannot pass by
    // accident today.
    expect(section, "the registry section never says the pin (EXPECTED_UNINSTALLABLE) is empty").toMatch(
      /(?:EXPECTED_UNINSTALLABLE|\bpin\b).{0,200}?\bempty\b/i,
    );
    // The two bold, present-tense claims the lane makes false. History may
    // stay (the house style keeps "this sentence used to say…"), but not as a
    // statement of how things are today.
    expect(section).not.toContain("**The two adapters cannot be installed by anyone.**");
    expect(section).not.toContain("**But `port` and `block` do NOT install");
  });
});

describe("L-REG — no item ships an import of an unpublished @bbox-ui/* package", () => {
  // WHY per item, from the PUBLISHED payload (public/r), not registry.json:
  // what breaks a consumer is the specifier `shadcn add` copies verbatim, and
  // the payload is exactly those bytes. Six fail today: port, block (frozen
  // v1 -> @bbox-ui/schema), block-region, labeled-group (trunk glyph.tsx ->
  // @bbox-ui/glyph-content), block-node-reactflow, block-shape-tldraw
  // (adapters -> @bbox-ui/core, never even declared).
  it.each(itemNames)("L-REG %s: the published payload imports no unpublished @bbox-ui/* package", (name) => {
    const published = payload(name);
    expect(published, `public/r/${name}.json was never built — run \`npx shadcn@latest build\``).not.toBeNull();
    expect(unpublishedImports(published!), `${name} would 404 on npm or fail tsc in a consumer`).toEqual([]);
  });
});

describe("L-REG — what lands in one project is what each item meant", () => {
  // WHY: verify_registry_install.py installs EVERY item into ONE project. If
  // two items ship DIFFERENT bytes to the same target, `--overwrite` keeps
  // whichever came last, and "every item installed and tsc passed" is true of
  // only one of them. Identical bytes (both lineages' `lib/utils.ts` today)
  // are harmless. Red today on exactly one target: frozen-v1 `block` and the
  // trunk's `block-card` both claim `components/bbox/block.tsx` — invisible
  // until now only because `block` was skipped as uninstallable.
  it("L-REG co-install: no two items ship different content to the same install target", () => {
    const sources = new Map<string, Set<string>>();
    const owners = new Map<string, Set<string>>();
    for (const item of registry.items) {
      for (const file of item.files) {
        const target = (file.target ?? file.path).replace(/^~\//, "");
        if (!sources.has(target)) sources.set(target, new Set());
        if (!owners.has(target)) owners.set(target, new Set());
        sources.get(target)!.add(file.path);
        owners.get(target)!.add(item.name);
      }
    }
    const clashes: string[] = [];
    for (const [target, paths] of sources) {
      const contents = new Set([...paths].map((p) => read(p)));
      if (contents.size > 1) {
        clashes.push(`${target}: ${[...paths].join(" vs ")} (items: ${[...owners.get(target)!].sort().join(", ")})`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("L-REG — the adapters install through registryDependencies", () => {
  // lanes.json L-REG extra: "adapters import copied siblings, declared as
  // registryDependencies (CLAUDE.md 'The two adapters cannot be installed by
  // anyone')". Today both declare only the stock shadcn `utils`.
  it.each(["block-node-reactflow", "block-shape-tldraw"])(
    "L-REG %s: declares a registryDependency on another bbox item of this registry",
    (name) => {
      const item = byName.get(name);
      expect(item, `${name} left the registry — CLAUDE.md and registrySnapshot.test.ts still name it`).toBeDefined();
      const refs = (item!.registryDependencies ?? []).map((dep) => bboxItemReferencedBy(dep, name)).filter(Boolean);
      expect(refs.length, `${name}.registryDependencies = ${JSON.stringify(item!.registryDependencies ?? [])}`).toBeGreaterThan(0);
    },
  );

  // lanes.json L-REG extras: "block-node-reactflow sources the trunk's React
  // Flow node views" and the donor `claude/beautiful-bt-registry` (611d985):
  // "re-express block-port-node-reactflow as registryDependencies, never its
  // stale file list" (branch-dispositions.json: "registryDependencies:
  // [block-port] plus the two node files, deps @xyflow/react only").
  it("L-REG block-node-reactflow: sourced from the trunk, depends on @xyflow/react and on the item that ships BlockPort, re-lists none of that item's files", () => {
    const item = byName.get("block-node-reactflow")!;
    const offTrunk = item.files.map((f) => f.path).filter((p) => !p.startsWith("apps/storybook-basics/src/"));
    expect(offTrunk, "block-node-reactflow still ships files from outside the trunk").toEqual([]);
    expect(item.dependencies ?? []).toContain("@xyflow/react");
    const deps = (item.registryDependencies ?? [])
      .map((dep) => bboxItemReferencedBy(dep, item.name))
      .filter((name): name is string => name !== null)
      .map((name) => byName.get(name)!);
    const shipsBlockPort = deps.some((dep) =>
      dep.files.some((f) => f.path === "apps/storybook-basics/src/components/blockPort.tsx"),
    );
    expect(shipsBlockPort, "no registryDependency ships the trunk's BlockPort").toBe(true);
    const providedByDeps = new Set(deps.flatMap((dep) => dep.files.map((f) => f.path)));
    const relisted = item.files.map((f) => f.path).filter((p) => providedByDeps.has(p));
    expect(relisted, "files a registryDependency already ships are re-listed").toEqual([]);
  });
});

describe("L-REG — the donor and the presets ship", () => {
  // Donor claude/beautiful-bt-registry 611d985: "the bbox-block-layout item"
  // — layoutSimpleBlock (packages/bbox-ui/src/blockLayout.ts:361), the one
  // function that answers "how big is this card" without a DOM.
  it("L-REG donor bbox-block-layout: an item that publishes layoutSimpleBlock", () => {
    const item = byName.get("bbox-block-layout");
    expect(item, "registry.json has no bbox-block-layout item").toBeDefined();
    const published = payload("bbox-block-layout");
    expect(published, "public/r/bbox-block-layout.json was never built").not.toBeNull();
    const ships = published!.files.some((f) => /export function layoutSimpleBlock\b/.test(f.content ?? ""));
    expect(ships, "no file of bbox-block-layout exports layoutSimpleBlock").toBe(true);
  });

  // docs/CONTROL-FLOW-PLAN.md §11 item 6: "A `presets/` target rule in
  // docs/build_menu_registry_items.py so `value`, `loop`, `branch` can be
  // registry items." Pinned by SOURCE FILE, not by item name — the name is the
  // builder's (brief default: block-value, region-loop, region-branch).
  it.each([
    ["value", "apps/storybook-basics/src/components/block.value.tsx"],
    ["loop", "apps/storybook-basics/src/scene/region.loop.ts"],
    ["branch", "apps/storybook-basics/src/scene/region.branch.ts"],
  ])("L-REG preset %s: some registry item ships %s", (_preset, source) => {
    const shipping = registry.items.filter((item) => item.files.some((f) => f.path === source)).map((i) => i.name);
    expect(shipping.length, `no registry item ships ${source}`).toBeGreaterThan(0);
  });
});

describe("L-REG — the trunk glyph's grammar ships as a sibling and stays the package's grammar", () => {
  // CLAUDE.md: glyph.tsx "imports `@bbox-ui/glyph-content`, `private: true`
  // and unpublished … Fixing it needs the same source change (copy the
  // package's ~110 lines as a sibling)". A copy is a second derivation of one
  // grammar, and the editor's glyph picker still ENCODES through the package
  // (editor/glyphPicker/glyphPicker.tsx) while glyph.tsx DECODES — so the copy
  // must stay behaviour-identical or a picked icon stops rendering.
  const CORPUS: Array<string | null | undefined> = [
    undefined, null, "", "lucide:star", "lucide:", "lucide:arrow-right", "emoji:🙂", "emoji:",
    "data:image/png;base64,iVBORw0KGgo=", "http://example.com/a.png", "https://example.com/b.svg",
    "text:AB", "text:", "plain words", "LUCIDE:star", " lucide:star", "image:https://x", "emoji:🙂🙂",
  ];

  it("L-REG glyph: TRUNK/components/glyph.tsx decodes through a relative sibling identical in behaviour to @bbox-ui/glyph-content", async () => {
    const glyphFile = path.join(repoRoot, "apps/storybook-basics/src/components/glyph.tsx");
    const glyphSource = readFileSync(glyphFile, "utf8");
    const match = glyphSource.match(/import\s*\{[^}]*\bdecodeGlyphContent\b[^}]*\}\s*from\s*["']([^"']+)["']/);
    expect(match, "glyph.tsx no longer imports decodeGlyphContent from a module").not.toBeNull();
    const specifier = match![1];
    expect(specifier, "glyph.tsx still imports the unpublished package").toMatch(/^\./);
    const base = path.resolve(path.dirname(glyphFile), specifier);
    const resolved = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base].find((p) => existsSync(p));
    expect(resolved, `glyph.tsx imports ${specifier}, which does not exist`).toBeDefined();
    const sibling = (await import(/* @vite-ignore */ pathToFileURL(resolved!).href)) as typeof glyphContentPackage;
    for (const name of ["decodeGlyphContent", "encodeGlyphContent", "sameGlyphContent"] as const) {
      expect(typeof sibling[name], `${specifier} does not export ${name}`).toBe("function");
    }
    for (const raw of CORPUS) {
      const ours = sibling.decodeGlyphContent(raw);
      const theirs = glyphContentPackage.decodeGlyphContent(raw);
      expect(ours, `decode(${JSON.stringify(raw)})`).toEqual(theirs);
      expect(sibling.encodeGlyphContent(theirs), `encode(decode(${JSON.stringify(raw)}))`).toBe(
        glyphContentPackage.encodeGlyphContent(theirs),
      );
      for (const other of CORPUS) {
        const b = glyphContentPackage.decodeGlyphContent(other);
        expect(sibling.sameGlyphContent(theirs, b)).toBe(glyphContentPackage.sameGlyphContent(theirs, b));
      }
    }
  });
});
