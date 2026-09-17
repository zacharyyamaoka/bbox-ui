import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BBOX_SKINS, BBOX_SKIN_LABELS, BBOX_SKIN_BLURBS, BBOX_SKIN_TOKENS, BBOX_SKIN_ATTR, bboxSkinAttrs } from "../src/skin";

/**
 * `skin.ts` declares the vocabulary; `skin.css` paints it; four components
 * read it. Nothing in TypeScript connects those three, so every drift
 * between them is silent AND invisible: a token the CSS forgets, or a
 * fallback that stops matching its call site, renders as "the default
 * skin" — which looks like a design decision rather than a typo. That is
 * what this file is for.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const css = readFileSync(path.join(srcDir, "skin.css"), "utf8");

/** Every `[data-bbox-skin="…"] { … }` block, as id -> declared token names. */
function skinBlocks(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of css.matchAll(/\[data-bbox-skin="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    found.set(match[1], [...match[2].matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]).sort());
  }
  return found;
}

describe("skin vocabulary", () => {
  it("every skin is labelled and blurbed", () => {
    for (const skin of BBOX_SKINS) {
      expect(BBOX_SKIN_LABELS[skin], `label for ${skin}`).toBeTruthy();
      expect(BBOX_SKIN_BLURBS[skin], `blurb for ${skin}`).toBeTruthy();
    }
  });

  it("bboxSkinAttrs spells the one attribute a host has to get right", () => {
    expect(bboxSkinAttrs("sketch")).toEqual({ [BBOX_SKIN_ATTR]: "sketch" });
    expect(BBOX_SKIN_ATTR).toBe("data-bbox-skin");
  });
});

describe("skin.css agrees with skin.ts", () => {
  it("declares a block for exactly the skins in BBOX_SKINS", () => {
    expect([...skinBlocks().keys()].sort()).toEqual([...BBOX_SKINS].sort());
  });

  it("every skin defines exactly the closed token set — no more, no fewer", () => {
    const expected = BBOX_SKIN_TOKENS.map((t) => t.name).sort();
    for (const [skin, declared] of skinBlocks()) {
      // Both directions on purpose. A MISSING token silently inherits the
      // previous skin's value (the switcher looks half-broken); an EXTRA
      // one is a property no component reads, which reads as a control
      // that does nothing.
      expect(declared, `tokens declared by ${skin}`).toEqual(expected);
    }
  });
});

/**
 * Every `var(--<name>, <fallback>)` in `text`, with the fallback extracted by
 * walking parens rather than by regex.
 *
 * WHY not a regex: the fallbacks are themselves `var()` calls
 * (`var(--bbox-skin-stroke, var(--color-foreground))`), and a regex that
 * stops at the first `)` silently truncates one to
 * `var(--color-foreground` — which is not a value any browser would accept,
 * yet compared equal to nothing and would have quietly weakened the check.
 * That is exactly the assertion this file exists to keep honest.
 */
function fallbacksFor(name: string, text: string): string[] {
  const out: string[] = [];
  const needle = `--${name},`;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    let depth = 0;
    let end = i + needle.length;
    while (end < text.length) {
      const ch = text[end];
      if (ch === "(") depth++;
      else if (ch === ")") {
        if (depth === 0) break;
        depth--;
      }
      end++;
    }
    out.push(text.slice(i + needle.length, end).trim());
  }
  return out;
}

describe("components read the tokens skin.ts documents", () => {
  const sources = ["block.tsx", "region.tsx", "pill.tsx", "port.tsx"]
    .map((f) => readFileSync(path.join(srcDir, f), "utf8"))
    .join("\n");

  it("every token is actually read by at least one component", () => {
    for (const token of BBOX_SKIN_TOKENS) {
      expect(sources.includes(`--${token.name}`), `${token.name} is read somewhere`).toBe(true);
    }
  });

  it("each call site's var() fallback is the one BBOX_SKIN_TOKENS advertises", () => {
    // This is the assertion that keeps `skin.css` OPTIONAL. The promise to a
    // consumer who never imports it is "you render today's pixels", and that
    // promise lives entirely in the fallback baked into each call site —
    // which nothing else checks, because a wrong fallback still compiles and
    // still paints something.
    for (const token of BBOX_SKIN_TOKENS) {
      const fallbacks = fallbacksFor(token.name, sources);
      if (fallbacks.length === 0) continue; // covered by the test above
      for (const fallback of fallbacks) {
        expect(fallback, `fallback at a --${token.name} call site`).toBe(token.fallback);
      }
    }
  });
});

describe("the geometry invariant", () => {
  it("no skin changes the stroke width", () => {
    // Border WIDTH is geometry in this codebase, not paint:
    // `port.layout.ts`'s BLOCK_BORDER_PX insets every wall-mounted port's
    // anchor by it and `region.tsx`'s REGION_BORDER_PX places the corner
    // Block by it, so a skin that stroked a hairline would slide every port
    // out from under the host's own edge endpoints — in both adapters,
    // silently, with every other test green. Until those two constants read
    // the token, every skin must agree on it.
    //
    // The full spatial check (every port-dot centre and block box, measured
    // with getBoundingClientRect across all three skins in both hosts) is
    // `demos/capture-skins.mjs`; it needs a browser, so it cannot live here.
    // This is the half that can fail in CI.
    const widths = new Set<string>();
    for (const match of css.matchAll(/\[data-bbox-skin="[\w-]+"\]\s*\{([^}]*)\}/g)) {
      const width = match[1].match(/--bbox-skin-stroke-width\s*:\s*([^;]+);/);
      if (width) widths.add(width[1].trim());
    }
    expect([...widths]).toEqual(["2px"]);
  });

  it("no skin can introduce a transform", () => {
    // A degree or two of tilt is the obvious sketch move and the one thing a
    // skin must never do: a rotated DOM stops agreeing with the host's own
    // hit-test box and port anchors, which the core does not own.
    expect(css).not.toMatch(/\btransform\s*:/);
    expect(css).not.toMatch(/\brotate\s*\(/);
  });
});
