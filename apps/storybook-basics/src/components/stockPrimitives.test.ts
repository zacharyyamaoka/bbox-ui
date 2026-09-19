// src/components/stockPrimitives.test.ts — the stock shadcn primitives the
// trunk lacked, copied VERBATIM. ACCEPTANCE committed by the planning lane of
// docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
// `stock-primitives`.
//
// The oracle is the stock registry itself, snapshotted on 2026-09-19 into
// docs/provenance/shadcn-base-nova/<name>.json (see its README). "Verbatim"
// is checked three ways a hand-rolled look-alike cannot pass:
//   1. the module exports EXACTLY the stock export list (no more, no fewer);
//   2. every Tailwind class string in the stock source appears, character for
//      character, in the copy — the look IS those strings;
//   3. none of the registry-only specifiers survive (`from "cn"`,
//      `@/registry/…`, `icon-placeholder`), and the header comment names the
//      stock URL it was copied from and the word "verbatim".
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");

const PRIMITIVES = ["dialog", "switch", "radio-group", "select", "label", "input", "table", "field"] as const;

function stockSource(name: string): string {
  const item = JSON.parse(readFileSync(path.join(repo, "docs/provenance/shadcn-base-nova", `${name}.json`), "utf8")) as { files: { content: string }[] };
  return item.files[0].content;
}

function exportList(source: string): string[] {
  return [...source.matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
}

/** Double-quoted literals that look like Tailwind class lists (≥2 tokens, one with a `-` or `:`). */
function classStrings(source: string): string[] {
  return [...source.matchAll(/"([^"\n]{12,})"/g)]
    .map((match) => match[1])
    .filter((literal) => literal.includes(" ") && /[-:]/.test(literal) && !literal.startsWith("@") && !literal.includes("/components/"));
}

describe.each(PRIMITIVES)("stock %s", (name) => {
  const file = path.join(here, `${name}.tsx`);

  it("exists in src/components and exports exactly the stock names", async () => {
    const copy = readFileSync(file, "utf8");
    expect(exportList(copy)).toEqual(exportList(stockSource(name)));
    const module = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    for (const exported of exportList(stockSource(name))) expect(module[exported], exported).toBeDefined();
  });

  it("carries every class string of the stock source, character for character", () => {
    const copy = readFileSync(file, "utf8");
    const missing = classStrings(stockSource(name)).filter((literal) => !copy.includes(literal));
    expect(missing).toEqual([]);
  });

  it("resolves inside this repo and says where it came from", () => {
    const copy = readFileSync(file, "utf8");
    expect(copy).not.toMatch(/from "cn"/);
    expect(copy).not.toMatch(/@\/registry\//);
    expect(copy).not.toMatch(/icon-placeholder|IconPlaceholder/);
    expect(copy).toMatch(/from "\.\.\/lib\/utils"/);
    const header = copy.split("\n").slice(0, 25).join("\n");
    expect(header).toContain(`https://ui.shadcn.com/r/styles/base-nova/${name}.json`);
    expect(header.toLowerCase()).toContain("verbatim");
  });
});
