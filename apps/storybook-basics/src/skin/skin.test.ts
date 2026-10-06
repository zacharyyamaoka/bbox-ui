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
//      donor's — block.tsx, badge.tsx, port.tsx, trace.tsx, codeEditor.css
//      (this port's Tranche 2). NOT an exhaustive list of every component
//      in the repo — see Styles.stories.tsx's own coverage list/assertion
//      for that; this test only has to prove the ones in the list actually
//      read what they claim to. `sketchOutline.tsx` was on this list
//      before migration M8 (docs/peps/0001-sketch-skin-at-the-boundary.md)
//      deleted the file; `sketchAtEdge.ts` (src/skin/, not
//      src/components/) joined in its place as `--bbox-skin-ink`'s new
//      sole reader, and `--bbox-skin-outline` — the token the deleted file
//      carried alone — was retired outright rather than needing one; see
//      point 3 below.
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
//   3. The token set is 13, not the donor's 15: migration M8 deletes
//      `bbox-skin-crisp`/`bbox-skin-outline` (see skin.ts's own header)
//      now that the core renders no in-core twin for either to switch.

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

  it("the token set is exactly 13 — the closed set this port is not allowed to grow (S5)", () => {
    expect(BBOX_SKIN_TOKENS).toHaveLength(13);
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
  // Every PAINTING component across all five tranches (see Styles.stories.
  // tsx's own coverage table for the full per-component token list, and
  // "coverage (S4)" below for the components deliberately EXCLUDED because
  // they paint nothing of their own).
  const sources = [
    // Tranche 2 (block, badge, port, trace, codeEditor)
    "block.tsx",
    "badge.tsx",
    "port.tsx",
    "trace.tsx",
    "codeEditor.css",
    // Tranche 3 (composites)
    "labeledPort.tsx",
    "portEdge.tsx",
    "blockMembers.tsx",
    "traceTerminal.tsx",
    // Tranche 4 (shadcn primitives)
    "button.tsx",
    "toggle.tsx",
    "tooltip.tsx",
    "dropdown-menu.tsx",
    "editableText.tsx",
    "text.tsx",
    "foldingChevron.tsx",
  ]
    .map((f) => readFileSync(path.join(componentsDir, f), "utf8"))
    .join("\n");
  // WHY sketchAtEdge.ts joins the scan where sketchOutline.tsx (deleted at
  // migration M8) used to: `--bbox-skin-ink` is no longer read by any
  // component directly — its one remaining reader is the boundary pass's
  // own fallback chain (`createBoxTwinSvg`'s and the ring loop's
  // `var(--bbox-ink-state, var(--bbox-skin-ink, …))`), which lives in
  // `src/skin/`, not `src/components/`. `bbox-skin-outline`, the OTHER
  // token sketchOutline.tsx used to carry, is gone from BBOX_SKIN_TOKENS
  // entirely (skin.ts's own header) rather than needing a new reader.
  const sketchAtEdgeSource = readFileSync(path.join(skinDir, "sketchAtEdge.ts"), "utf8");
  const allSources = `${sources}\n${sketchAtEdgeSource}`;

  // Tranche 5 (components/block.value.tsx) reads NOTHING new here — see the coverage
  // (S4) describe block below for why `ValueCapsule` is on the excluded
  // list rather than a sixth source file.

  it("every token in the closed 13 is actually read by at least one component in this port (S5 x coverage)", () => {
    for (const token of BBOX_SKIN_TOKENS) {
      expect(allSources.includes(`--${token.name}`), `${token.name} is read somewhere`).toBe(true);
    }
  });
});

describe("Tooltip / DropdownMenu — S1 checked at the source, not the DOM", () => {
  // Styles.stories.tsx's own header explains why: both render their real
  // content through a Base UI `Portal` (`document.body` by default), which
  // ESCAPES the `data-bbox-skin` attribute a story stamps on its own DOM
  // subtree, so a live per-skin `getComputedStyle` comparison (the recipe
  // every other Tranche 3-4 component gets in `NoSkinRegression`) isn't
  // reachable without teaching both files a portal `container` override —
  // new scope past "wire the token". This is the substitute: the exact
  // byte-identical fallback literal — what `rounded-md`/`rounded-lg`/
  // `bg-border` resolved to BEFORE the token — is present verbatim, so a
  // consumer with no skin imported gets the unchanged pixel.
  it("tooltip.tsx's radius token falls back to the exact pre-port rounded-md literal", () => {
    const src = readFileSync(path.join(componentsDir, "tooltip.tsx"), "utf8");
    expect(src).toContain('borderRadius: "var(--bbox-skin-radius, var(--radius-md))"');
  });

  it("dropdown-menu.tsx's radius token falls back to the exact pre-port rounded-lg literal", () => {
    const src = readFileSync(path.join(componentsDir, "dropdown-menu.tsx"), "utf8");
    expect(src).toContain('borderRadius: "var(--bbox-skin-radius, var(--radius-lg))"');
  });

  it("dropdown-menu.tsx's separator stroke token falls back to the exact pre-port bg-border literal", () => {
    const src = readFileSync(path.join(componentsDir, "dropdown-menu.tsx"), "utf8");
    expect(src).toContain('background: "var(--bbox-skin-stroke, var(--color-border))"');
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
  //
  // Tranches 3-5 add five more: `blockPort.tsx`, `traceBadge.tsx` and
  // `wireLayer.tsx` (Tranche 3) are pure POSITIONING wrappers around
  // already-wired children (BlockPort composes Block+PortEdge+Port,
  // TraceBadge composes Badge+EditableText, WireLayer composes Trace) —
  // none of them sets a border/background/box-shadow/stroke of its own.
  // `collapsible.tsx` (Tranche 4) is a headless Base UI wrapper with no
  // className or style anywhere. `components/block.value.tsx` (Tranche 5) is
  // checked separately below — it DOES contain the words "border" and
  // "background", but only as a permanent, skin-independent SUPPRESSION.
  const PAINTLESS_COMPONENTS = ["bar.tsx", "blockPort.tsx", "traceBadge.tsx", "wireLayer.tsx", "collapsible.tsx"];

  it.each(PAINTLESS_COMPONENTS)("%s paints nothing of its own — no border, background, box-shadow or stroke", (file) => {
    const source = readFileSync(path.join(componentsDir, file), "utf8")
      // Strip comments first — this file's own header explains why (a WHY
      // comment that quotes a class name is not the class being applied).
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const needle of ["border", "bg-", "background", "boxShadow", "box-shadow", "stroke"]) {
      expect(source.includes(needle), `${file} should not contain "${needle}" outside comments`).toBe(false);
    }
  });

  it("components/block.value.tsx's border/background overrides are a permanent suppression, not a paint a skin could drive", () => {
    // `ValueCapsule` composes `Block`+`BlockPort`+`CodeEditor` — all
    // already wired — and deliberately OVERRIDES the CodeEditor's own
    // skin-driven border/background to a hardcoded "transparent" ("the
    // pill IS the box... the editor's own card chrome... goes", this
    // file's own comment) so the capsule reads as one shape, not a field
    // floating inside a pill. That override is unconditional in every
    // skin — there is no colour here for a token to drive — which is
    // different from "paints nothing" (bar.tsx) but the same conclusion:
    // no NEW token read belongs in this file. Its own `borderRadius`
    // (`valueCapsuleRadiusPx`) is geometry the preset owns outright (T6:
    // "equal to half the height", Zach's own arithmetic) and MUST keep
    // winning over Block's `--bbox-skin-radius` in every skin — reading a
    // radius token here would be the regression, not the fix.
    const valueSource = readFileSync(path.join(componentsDir, "block.value.tsx"), "utf8");
    expect(valueSource).toMatch(/background:\s*"transparent"/);
    expect(valueSource).toMatch(/borderColor:\s*"transparent"/);
  });
});

describe("the geometry invariant", () => {
  it("no skin changes the stroke width", () => {
    // Border WIDTH is geometry, not paint — a skin that stroked a
    // hairline would slide every drawn ring/outline out from under the
    // CSS geometry it is meant to land on exactly. The boundary pass
    // (src/skin/sketchAtEdge.ts) now measures this width live off
    // `getComputedStyle(el).borderTopWidth` for boxes, and off
    // `port.tsx`'s own published `data-bbox-ring-pen` for a Port's ring —
    // both of which assume every skin agrees on this token's value, which
    // is exactly what this test pins.
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

/* ==================================================================== */
/* The ten-skin set (Zach, 2026-09-17/18) — order, naming, distinctness. */
/* ==================================================================== */

/** Every `[data-bbox-skin="…"] { … }` block, as id -> token -> value. The
 * sibling `skinBlocks()` above deliberately returns names only (it exists
 * to prove the closed set is closed); these checks need the VALUES. */
function skinDecls(): Map<string, Map<string, string>> {
  const found = new Map<string, Map<string, string>>();
  for (const match of css.matchAll(/\[data-bbox-skin="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    const decls = new Map<string, string>();
    for (const d of match[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      decls.set(d[1], d[2].replace(/\s+/g, " ").trim());
    }
    found.set(match[1], decls);
  }
  return found;
}

describe("the picker order is the product", () => {
  // `.storybook/preview.tsx` builds the toolbar by mapping BBOX_SKINS, and
  // Styles.stories.tsx builds its columns the same way — so this array's
  // order IS what Zach reads, and he specified it directly:
  //   1. No skin (today)  2. Unstyled  3. Sketch  4. Shadcn
  //   5. No. 1  6. No. 2  7. No. 3  8. No. 4  9. No. 5
  //   then, asked for one at a time: 10. No. 6 (Notion), 11. No. 7 (Obsidian)
  // Rung 1 is the ABSENCE of the attribute and is deliberately not a
  // member — see skin.ts's own note on why modelling it as one would make
  // "switch back to nothing" unexpressible.
  it("is exactly the order asked for, not merely the same set", () => {
    expect([...BBOX_SKINS]).toEqual([
      "unstyled",
      "sketch",
      "shadcn",
      "vellum",
      "blueprint",
      "brutal",
      "terminal",
      "porcelain",
      "notion",
      "obsidian",
    ]);
  });

  it("the three named rungs come first and carry no number", () => {
    for (const skin of BBOX_SKINS.slice(0, 3)) {
      expect(BBOX_SKIN_LABELS[skin], `label for ${skin}`).not.toMatch(/No\./);
    }
  });

  it("each numbered style is labelled with its own number, in position order", () => {
    const numbered = BBOX_SKINS.slice(3);
    expect(numbered).toHaveLength(7);
    numbered.forEach((skin, i) => {
      expect(BBOX_SKIN_LABELS[skin], `label for ${skin}`).toMatch(new RegExp(`^No\\. ${i + 1} · `));
    });
  });
});

describe("the numbered styles are orthogonal, not shades of one", () => {
  it("no two skins declare the same token values", () => {
    // A copy-pasted skin is the failure this catches: it would show up in
    // the picker, look like a choice, and be a duplicate. The LIVE version
    // of this claim — distinct `getComputedStyle` signatures in a real
    // browser — is Styles.stories.tsx's `AllSkins` play function; this is
    // the cheap source-level half that fails at `vitest` speed.
    const signatures = new Map<string, string>();
    for (const [skin, decls] of skinDecls()) {
      const signature = [...decls.entries()].sort().map(([k, v]) => `${k}:${v}`).join(";");
      const twin = signatures.get(signature);
      expect(twin, `${skin} is byte-identical to ${twin}`).toBeUndefined();
      signatures.set(signature, skin);
    }
  });

  it("the set spans its expressive range on every axis it owns", () => {
    // Not "they differ somewhere" (the check above) — that a skin set can
    // pass while every skin varies only its font. Each axis below has to
    // be genuinely used, or the "completely different looks and feels"
    // claim is nominal.
    const decls = skinDecls();
    const distinct = (token: string) => new Set([...decls.values()].map((d) => d.get(token))).size;
    expect(distinct("bbox-skin-radius"), "corner").toBeGreaterThanOrEqual(6);
    expect(distinct("bbox-skin-radius-pill"), "the small-thing corner").toBeGreaterThanOrEqual(4);
    expect(distinct("bbox-skin-surface"), "fill").toBeGreaterThanOrEqual(7);
    expect(distinct("bbox-skin-stroke"), "line").toBeGreaterThanOrEqual(7);
    expect(distinct("bbox-skin-shadow"), "depth").toBeGreaterThanOrEqual(5);
    expect(distinct("bbox-skin-font"), "letterform").toBeGreaterThanOrEqual(8);
  });
});

describe("unstyled is undecorated, NOT invisible", () => {
  // The rung exists because Zach reads layout through it ("I like actually
  // just seeing things in the unstyled way then its good.. clears away the
  // distortions"). A stray paint token would quietly put a distortion back
  // — and so, it turned out, would an ABSENT one: the first pass painted
  // the border `transparent`, which is the literal reading of "every paint
  // token off" and the wrong one. Zach, same day: "BUG unstyled doesn't
  // even show an outline which is bad! unstyled should look like the BASE
  // UI primatives." A lens you cannot see through is not a lens. Both
  // halves are pinned below so neither mistake can come back.
  const OFF: Record<string, string> = {
    "bbox-skin-radius": "0px",
    "bbox-skin-radius-pill": "0px",
    "bbox-skin-surface": "transparent",
    "bbox-skin-shadow": "none",
    // No `bbox-skin-outline` row: migration M8 retired that token (see this
    // file's header, point 3), so "the drawn outline is off" is now simply
    // "unstyled is not sketch" — the boundary pass only ever runs for
    // sketch (`.storybook/preview.tsx`, `Styles.stories.tsx`'s `AtEdge`).
  };

  it.each(Object.entries(OFF))("%s is off (%s)", (token, value) => {
    expect(skinDecls().get("unstyled")?.get(token)).toBe(value);
  });

  it("draws a line — the UA's own, not one this repo picked", () => {
    // `ButtonBorder` is a CSS Color 4 system colour: the paint the browser
    // puts on a <button> nobody styled. Naming a theme token or a literal
    // here would make the rung a design decision, which is the one thing
    // it must not be.
    expect(skinDecls().get("unstyled")?.get("bbox-skin-stroke")).toBe("ButtonBorder");
  });

  it("leaves the outline-variant primitives a line too", () => {
    // The other half of the same bug: blanking `line-override` left a row
    // of floating words where Base UI would show bordered controls.
    // `currentColor` is still not a colour the SKIN chose — it is the
    // element's own text colour — which keeps it on the right side of the
    // axis boundary the suppression tokens exist to protect.
    expect(skinDecls().get("unstyled")?.get("bbox-skin-line-override")).toBe("currentColor");
  });

  it("still leaves the state axis alone — Port's rings are not a skin's to blank", () => {
    // The point of the rung: the boxes vanish and the wiring does not,
    // which is only true while the skin keeps its hands off the one token
    // that would suppress state-owned paint.
    expect(skinDecls().get("unstyled")?.get("bbox-skin-dot-rings")).toBe("initial");
  });

  it("reaches the UA font by naming a generic family, never `initial`", () => {
    // `initial` on a custom property is the guaranteed-invalid value, so
    // `var(--bbox-skin-font, inherit)` would fall through to `inherit` and
    // silently keep the body font — the rung would look styled. Naming the
    // generic family is the only spelling that actually reaches Times.
    expect(skinDecls().get("unstyled")?.get("bbox-skin-font")).toBe("serif");
    expect(skinDecls().get("unstyled")?.get("bbox-skin-font-sans")).toBe("serif");
  });
});
