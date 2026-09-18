// src/skin/skin.test.ts — ported and ADAPTED from
// packages/bbox-ui/test/skin.test.ts (frozen v1, read-only donor),
// revision `c83c8b2` in this repo.
//
// WHAT CARRIED OVER UNCHANGED: the CSS comment-stripping parser
// (`skinBlocks`'s own WHY on why a naive regex over raw source is unsafe —
// this file's own header quotes a CSS declaration inside a comment), the
// vocabulary checks (every skin labelled/blurbed, `bboxSkinAttrs` spells
// the one attribute), "declares a block for exactly the skins in
// BBOX_SKINS", "every skin defines exactly the closed token set", the
// axis-boundary check (a suppression token never names a colour), and both
// geometry-invariant checks (stroke-width pinned to 2px across every
// skin, no `transform`/`rotate` anywhere in the file).
//
// WHAT CHANGED, exhaustively:
//   1. The source file list is this app's own components, not the
//      donor's — block.tsx, badge.tsx, port.tsx, trace.tsx,
//      sketchOutline.tsx, codeEditor.css (this port's Tranche 2). NOT an
//      exhaustive list of every component in the repo — see
//      Styles.stories.tsx's own coverage list/assertion for that; this
//      test only has to prove the ones in the list actually read what
//      they claim to.
//   2. DROPPED: "each call site's var() fallback is the one
//      BBOX_SKIN_TOKENS advertises". The donor's whole package already
//      painted one consistent look (every component read `--foreground`/
//      `--card`) before skins existed, so a single global fallback string
//      per token was already true and worth pinning. This app's
//      components were ported/rebuilt independently and genuinely differ
//      in their pre-skin looks (Block: `border-border` + `shadow-sm`;
//      Badge: cva variants with their own colours) — skin.ts's own header
//      explains why `SkinToken.fallback` is documentation-only here. The
//      guarantee that actually matters (S1: no skin set renders
//      byte-identical to today, PER component) is asserted in
//      Styles.stories.tsx against real `getComputedStyle` output in a
//      real browser, which is a stronger check than a textual regex match
//      would have been anyway.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BBOX_SKINS, BBOX_SKIN_LABELS, BBOX_SKIN_BLURBS, BBOX_SKIN_TOKENS, BBOX_SKIN_ATTR, bboxSkinAttrs } from "./skin";

const skinDir = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(skinDir, "..", "components");
const cssSource = readFileSync(path.join(skinDir, "skin.css"), "utf8");

/** The stylesheet with comments removed — see this file's header on why a
 * parser that reads comments is not parsing CSS (skin.css's own recipe
 * comments quote a declaration verbatim). */
const css = cssSource.replace(/\/\*[\s\S]*?\*\//g, "");

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

  it("the token set is exactly 15 — the closed set this port is not allowed to grow (S5)", () => {
    expect(BBOX_SKIN_TOKENS).toHaveLength(15);
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

describe("components read the tokens skin.ts documents", () => {
  // Tranche 2 of this port (see the Styles stories' own coverage table for
  // the rest, and which components are deliberately excluded because they
  // paint nothing).
  const sources = [
    "block.tsx",
    "badge.tsx",
    "port.tsx",
    "trace.tsx",
    "codeEditor.css",
  ]
    .map((f) => readFileSync(path.join(componentsDir, f), "utf8"))
    .join("\n");
  const sketchOutlineSource = readFileSync(path.join(skinDir, "sketchOutline.tsx"), "utf8");
  const allSources = `${sources}\n${sketchOutlineSource}`;

  // The one token no Tranche 2 component needs: `--bbox-skin-font-sans` is
  // for a text slot that writes `font-family` INLINE (a TextBox/EditableText
  // rung), which beats plain inheritance the way `--bbox-skin-font` alone
  // cannot — none of Block/Badge/Port/Trace/CodeEditor do that. It stays in
  // the closed 15 (S5) because the token vocabulary is fixed regardless of
  // which tranche is landed; this allowlist is what keeps "not read yet" a
  // documented, asserted fact instead of a token quietly rotting unread
  // forever. Re-check this list at the next tranche and shrink it.
  const DEFERRED_TO_LATER_TRANCHES = new Set(["bbox-skin-font-sans"]);

  it("every token is actually read by at least one component in this port, or is on the deferred list", () => {
    for (const token of BBOX_SKIN_TOKENS) {
      if (DEFERRED_TO_LATER_TRANCHES.has(token.name)) continue;
      expect(allSources.includes(`--${token.name}`), `${token.name} is read somewhere`).toBe(true);
    }
  });

  it("the deferred list is exactly the tokens genuinely unread by this tranche — no wider than it has to be", () => {
    for (const name of DEFERRED_TO_LATER_TRANCHES) {
      expect(allSources.includes(`--${name}`), `${name} should be UNREAD (deferred) — remove it from the list if a later edit added a reader`).toBe(false);
    }
  });
});

describe("the axis boundary", () => {
  it("a suppression token never names a colour", () => {
    // `--bbox-skin-line-override` and `--bbox-skin-dot-rings` exist so a
    // skin can say "do not paint the CSS line"; the colour belongs to the
    // component's own state cascade (Port's ring, Badge's outline
    // variant). If a skin ever set one of them to a real colour, the skin
    // would be governing a field state already owns.
    const ALLOWED = new Set(["transparent", "none", "currentColor", "initial"]);
    for (const name of ["bbox-skin-line-override", "bbox-skin-dot-rings"]) {
      for (const m of css.matchAll(new RegExp(`--${name}\\s*:\\s*([^;]+);`, "g"))) {
        expect(ALLOWED.has(m[1].trim()), `--${name} is set to "${m[1].trim()}"`).toBe(true);
      }
    }
  });
});

describe("coverage (S4) — the deliberately-excluded half of the claim", () => {
  // Styles.stories.tsx's `AllComponents` story carries the OTHER half —
  // "every included component reads >=1 token" — against the same list
  // this test's sibling above checks. This half is "every EXCLUDED
  // component paints nothing", so a component can't quietly go
  // unskinned by omission from both lists.
  it("bar.tsx paints nothing of its own — no border, background, box-shadow or stroke", () => {
    const barSource = readFileSync(path.join(componentsDir, "bar.tsx"), "utf8")
      // Strip comments first — this file's own header explains why (a WHY
      // comment that quotes a class name is not the class being applied).
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const needle of ["border", "bg-", "background", "boxShadow", "box-shadow", "stroke"]) {
      expect(barSource.includes(needle), `bar.tsx should not contain "${needle}" outside comments`).toBe(false);
    }
  });
});

describe("the geometry invariant", () => {
  it("no skin changes the stroke width", () => {
    // Border WIDTH is geometry, not paint — a skin that stroked a
    // hairline would slide every drawn ring/outline out from under the
    // CSS geometry it is meant to land on exactly (block.tsx's
    // `BLOCK_BORDER_PX`, port.tsx's `PORT_STATE_RING_PX`-derived
    // SketchOutline sizing). Until every one of those constants reads
    // this token back out of CSS instead of hardcoding it, every skin
    // must agree on its value.
    const widths = new Set<string>();
    for (const match of css.matchAll(/\[data-bbox-skin="[\w-]+"\]\s*\{([^}]*)\}/g)) {
      const width = match[1].match(/--bbox-skin-stroke-width\s*:\s*([^;]+);/);
      if (width) widths.add(width[1].trim());
    }
    expect([...widths]).toEqual(["2px"]);
  });

  it("no skin can introduce a transform", () => {
    // A degree or two of tilt is the obvious sketch move and the one thing
    // a skin must never do: a rotated DOM stops agreeing with the host's
    // own hit-test box and port anchors, which this package does not own.
    expect(css).not.toMatch(/\btransform\s*:/);
    expect(css).not.toMatch(/\brotate\s*\(/);
  });
});
