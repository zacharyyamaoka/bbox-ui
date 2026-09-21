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

const PRIMITIVES = ["dialog", "switch", "radio-group", "select", "label", "input", "table", "field", "command", "input-group", "textarea", "slider"] as const;


/** Stock primitives carrying a DOCUMENTED deviation from the registry copy.
 *
 *  WHY this exists rather than dropping the file from PRIMITIVES: a deviation
 *  that is merely exempt is a deviation nobody can see widening. Every stock
 *  class string this repo deliberately does NOT carry is listed here, and the
 *  check below asserts the set of missing strings is EXACTLY this list — so a
 *  second, undeclared drift fails just as loudly as it would for a verbatim
 *  file, and the other two guarantees (exact export list, no registry-only
 *  specifiers) keep applying untouched. */
const DEVIATIONS: Record<string, { readonly why: string; readonly drop: readonly string[] }> = {
  slider: {
    why:
      "Stock styles the track, indicator and vertical layout behind `data-horizontal:`/" +
      "`data-vertical:`. Base UI emits `data-orientation=\"horizontal\"`, and Tailwind lowers " +
      "`data-horizontal:` to the attribute-PRESENCE selector `[data-horizontal]`, which can " +
      "never match it. Measured before the fix: track height 0px. See slider.tsx's header; " +
      "separator.tsx documents the same upstream bug.",
    drop: [
      "data-horizontal:w-full data-vertical:h-full",
      "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
      "relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1",
      "bg-primary select-none data-horizontal:h-full data-vertical:w-full",
    ],
  },
};

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
    const declared = [...(DEVIATIONS[name]?.drop ?? [])].sort();
    expect([...missing].sort()).toEqual(declared);
  });

  it("declares any deviation, and a deviating file does not claim to be verbatim", () => {
    const deviation = DEVIATIONS[name];
    const header = readFileSync(file, "utf8").split("\n").slice(0, 40).join("\n");
    if (!deviation) {
      expect(header.toLowerCase()).toContain("verbatim");
      return;
    }
    // A declared deviation must be explained where a reader will meet it.
    expect(deviation.why.length).toBeGreaterThan(80);
    expect(header.toLowerCase()).toContain("not copied verbatim");
    expect(header.toLowerCase()).toContain("why");
  });

  it("resolves inside this repo and says where it came from", () => {
    const copy = readFileSync(file, "utf8");
    expect(copy).not.toMatch(/from "cn"/);
    expect(copy).not.toMatch(/@\/registry\//);
    expect(copy).not.toMatch(/icon-placeholder|IconPlaceholder/);
    expect(copy).toMatch(/from "\.\.\/lib\/utils"/);
    const header = copy.split("\n").slice(0, 40).join("\n");
    expect(header).toContain(`https://ui.shadcn.com/r/styles/base-nova/${name}.json`);
  });
});
