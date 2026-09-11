import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STATE_LABELS,
  APPEARANCE_STATES,
  LENS_LABELS,
  LENSES,
  PERSISTABLE_APPEARANCE_STATES,
  STATE_TOKENS,
  TONE_LABELS,
  TONE_TOKENS,
  TONES,
  toneOverride,
  type AppearanceState,
} from "../src/appearance";
import {
  APPEARANCE_FIELDS,
  LENS_BEFORE_FIELD,
  LENS_FIELD,
  STATE_FIELD,
  TONE_FIELD,
} from "../src/appearance.fields";

/* ------------------------------------------------------------------ */
/* §1 — vocabulary pins                                                */
/* ------------------------------------------------------------------ */

describe("AppearanceState — the six-rung ladder", () => {
  it("is exactly the board's six states, in board order", () => {
    expect(APPEARANCE_STATES).toEqual([
      "empty",
      "outOfFocus",
      "valueSet",
      "wired",
      "received",
      "hidden",
    ]);
  });

  it("labels match the board verbatim, including Zach's own spelling of 'Recived'", () => {
    expect(APPEARANCE_STATE_LABELS.received).toBe("Data Recived");
    expect(APPEARANCE_STATE_LABELS).toEqual({
      empty: "Empty",
      outOfFocus: "Out of Focus",
      valueSet: "Default Value",
      wired: "Wired",
      received: "Data Recived",
      hidden: "Hidden",
    });
  });

  it("PERSISTABLE_APPEARANCE_STATES excludes only 'received'", () => {
    expect(PERSISTABLE_APPEARANCE_STATES).toEqual([
      "empty",
      "outOfFocus",
      "valueSet",
      "wired",
      "hidden",
    ]);
    expect(PERSISTABLE_APPEARANCE_STATES).not.toContain("received");
  });

  it("every state has a STATE_TOKENS entry, and only 'hidden' is unpainted", () => {
    for (const state of APPEARANCE_STATES) {
      expect(STATE_TOKENS[state]).toBeDefined();
    }
    expect(STATE_TOKENS.hidden).toEqual({ ring: null, fill: null });
  });

  it("the ring-vs-fill two-bit reading matches the colour grammar table (§3)", () => {
    const expected: Record<AppearanceState, { ring: string | null; fill: string | null }> = {
      empty: { ring: "foreground", fill: null },
      outOfFocus: { ring: "muted-foreground", fill: null },
      valueSet: { ring: "muted-foreground", fill: "muted" },
      wired: { ring: "primary", fill: "primary" },
      received: { ring: "bbox-received", fill: "bbox-received" },
      hidden: { ring: null, fill: null },
    };
    expect(STATE_TOKENS).toEqual(expected);
  });

  it("only 'wired' and 'received' carry a true hue — everything else is neutral ink", () => {
    const hued = APPEARANCE_STATES.filter(
      (state) => STATE_TOKENS[state].ring === "primary" || STATE_TOKENS[state].ring === "bbox-received",
    );
    expect(hued.sort()).toEqual(["received", "wired"]);
  });
});

describe("Tone — the escape hatch", () => {
  it("is exactly the five members, 'neutral' first", () => {
    expect(TONES).toEqual(["neutral", "accent", "warning", "success", "danger"]);
  });

  it("labels are title-cased, one per tone", () => {
    expect(TONE_LABELS).toEqual({
      neutral: "Neutral",
      accent: "Accent",
      warning: "Warning",
      success: "Success",
      danger: "Danger",
    });
  });

  it("'neutral' resolves to no token — it means 'let state drive'", () => {
    expect(TONE_TOKENS.neutral).toBeNull();
  });

  it("every non-neutral tone resolves to its own bbox- token", () => {
    expect(TONE_TOKENS).toMatchObject({
      accent: "bbox-accent",
      warning: "bbox-warning",
      success: "bbox-success",
      danger: "bbox-danger",
    });
  });
});

describe("toneOverride — sugar that writes the override layer, not a preset", () => {
  it("returns undefined for 'neutral' — nothing to override", () => {
    expect(toneOverride("neutral", ["lineColor", "fillColor"])).toBeUndefined();
  });

  it("writes the tone's token onto every governed field id given", () => {
    expect(toneOverride("danger", ["lineColor", "fillColor"])).toEqual({
      lineColor: "bbox-danger",
      fillColor: "bbox-danger",
    });
  });

  it("writes onto zero fields as an empty object when given none", () => {
    expect(toneOverride("accent", [])).toEqual({});
  });
});

describe("Lens — the diff/lint overlay", () => {
  it("is exactly the six members, 'normal' first", () => {
    expect(LENSES).toEqual(["normal", "added", "removed", "changed", "error", "warning"]);
  });

  it("labels are title-cased, one per lens", () => {
    expect(LENS_LABELS).toEqual({
      normal: "Normal",
      added: "Added",
      removed: "Removed",
      changed: "Changed",
      error: "Error",
      warning: "Warning",
    });
  });
});

/* ------------------------------------------------------------------ */
/* §2 — APPEARANCE_FIELDS pins                                        */
/* ------------------------------------------------------------------ */

describe("APPEARANCE_FIELDS — the shared bundle", () => {
  it("is exactly state, tone, lens, lensBefore, in that order", () => {
    expect(APPEARANCE_FIELDS.map((f) => f.id)).toEqual(["state", "tone", "lens", "lensBefore"]);
    expect(APPEARANCE_FIELDS).toEqual([STATE_FIELD, TONE_FIELD, LENS_FIELD, LENS_BEFORE_FIELD]);
  });

  it("STATE_FIELD defaults to 'empty' and offers every AppearanceState as an option", () => {
    expect(STATE_FIELD.defaultValue).toBe("empty");
    expect(STATE_FIELD.kind).toBe("segments");
    expect(STATE_FIELD.options?.map((o) => o.value)).toEqual(APPEARANCE_STATES);
  });

  it("TONE_FIELD defaults to 'neutral' and offers every Tone as an option", () => {
    expect(TONE_FIELD.defaultValue).toBe("neutral");
    expect(TONE_FIELD.options?.map((o) => o.value)).toEqual(TONES);
  });

  it("LENS_FIELD defaults to 'normal' and offers every Lens as an option", () => {
    expect(LENS_FIELD.defaultValue).toBe("normal");
    expect(LENS_FIELD.options?.map((o) => o.value)).toEqual(LENSES);
  });

  it("LENS_BEFORE_FIELD is a free-text field defaulting to empty", () => {
    expect(LENS_BEFORE_FIELD.kind).toBe("text");
    expect(LENS_BEFORE_FIELD.defaultValue).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* §3 — colour grammar: re-derive theme.css's real values, mechanically*/
/* ------------------------------------------------------------------ */

/**
 * OKLCH -> sRGB hex, the standard OKLab matrices (Björn Ottosson). This
 * re-derivation is what makes a future `theme.css` edit that drifts a
 * token's contrast below the WCAG 1.4.11 floor a mechanical test
 * failure, not something caught only by eyeballing a swatch — see
 * T1-SPEC.md §3.1.
 */
function oklchToHex(L: number, C: number, hueDeg: number): string {
  const hRad = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const toSrgbByte = (c: number) => {
    const clamped = Math.min(1, Math.max(0, c));
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${toSrgbByte(rLin)}${toSrgbByte(gLin)}${toSrgbByte(bLin)}`;
}

function relativeLuminance(hex: string): number {
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, `(L1+0.05)/(L2+0.05)` with the lighter on top. */
function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const THEME_CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../src/theme.css");
const THEME_CSS = readFileSync(THEME_CSS_PATH, "utf-8");

/** Pull `--token: oklch(L C H)` out of a specific `:root` block so light
 * and dark values (which reuse the same custom property names) are read
 * from the right selector rather than whichever occurrence regex finds
 * first. */
function extractOklch(block: string, token: string): [number, number, number] {
  const re = new RegExp(`--${token}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`);
  const match = block.match(re);
  if (!match) throw new Error(`token --${token} not found in theme.css block`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const LIGHT_BLOCK = THEME_CSS.split(":root {")[1]?.split("}")[0] ?? "";
const DARK_BLOCK = THEME_CSS.split(':root[data-theme="dark"] {')[1]?.split("}")[0] ?? "";

describe("theme.css — real values re-derived, not eyeballed (§3.1)", () => {
  const LIGHT_EXPECTED: Record<string, { hex: string; bg: string; contrast: number }> = {
    foreground: { hex: "#141414", bg: "#ffffff", contrast: 18.47 },
    "muted-foreground": { hex: "#666666", bg: "#ffffff", contrast: 5.75 },
    primary: { hex: "#e76000", bg: "#ffffff", contrast: 3.46 },
    "bbox-received": { hex: "#009b28", bg: "#ffffff", contrast: 3.65 },
    "bbox-warning": { hex: "#bb8500", bg: "#ffffff", contrast: 3.26 },
    "bbox-success": { hex: "#009b28", bg: "#ffffff", contrast: 3.65 },
    "bbox-danger": { hex: "#c92f33", bg: "#ffffff", contrast: 5.35 },
    "bbox-accent": { hex: "#4377f0", bg: "#ffffff", contrast: 4.08 },
  };

  for (const [token, expected] of Object.entries(LIGHT_EXPECTED)) {
    it(`light --${token} converts to ${expected.hex} and clears the WCAG 1.4.11 ≥3:1 floor`, () => {
      const [L, C, H] = extractOklch(LIGHT_BLOCK, token);
      const hex = oklchToHex(L, C, H);
      expect(hex).toBe(expected.hex);
      const contrast = contrastRatio(hex, expected.bg);
      expect(contrast).toBeGreaterThanOrEqual(3);
      expect(contrast).toBeCloseTo(expected.contrast, 0);
    });
  }

  const DARK_EXPECTED: Record<string, { hex: string; bg: string; contrast: number }> = {
    foreground: { hex: "#f8f8f8", bg: "#0a0a0a", contrast: 18.68 },
    "muted-foreground": { hex: "#a1a1a1", bg: "#0a0a0a", contrast: 7.63 },
    primary: { hex: "#ff914b", bg: "#0a0a0a", contrast: 8.87 },
    "bbox-received": { hex: "#68d36f", bg: "#0a0a0a", contrast: 10.5 },
    "bbox-warning": { hex: "#eab532", bg: "#0a0a0a", contrast: 10.49 },
    "bbox-danger": { hex: "#fd736d", bg: "#0a0a0a", contrast: 7.41 },
    "bbox-accent": { hex: "#6799ff", bg: "#0a0a0a", contrast: 7.16 },
  };

  for (const [token, expected] of Object.entries(DARK_EXPECTED)) {
    it(`dark --${token} converts to ${expected.hex} and clears the WCAG 1.4.11 ≥3:1 floor`, () => {
      const [L, C, H] = extractOklch(DARK_BLOCK, token);
      const hex = oklchToHex(L, C, H);
      expect(hex).toBe(expected.hex);
      const contrast = contrastRatio(hex, expected.bg);
      expect(contrast).toBeGreaterThanOrEqual(3);
      expect(contrast).toBeCloseTo(expected.contrast, 0);
    });
  }

  it("the two corrected tokens (--primary, --bbox-received) are darkened from their old, sub-floor values", () => {
    // The shipped values this spec found and fixed: 0.71/48 (2.75:1) and
    // 0.65/145 (3.00:1, zero margin) — both below/at the 3:1 floor.
    const oldPrimaryHex = oklchToHex(0.71, 0.19, 48);
    const oldReceivedHex = oklchToHex(0.65, 0.19, 145);
    expect(contrastRatio(oldPrimaryHex, "#ffffff")).toBeLessThan(3);
    expect(contrastRatio(oldReceivedHex, "#ffffff")).toBeCloseTo(3, 1);

    const [pL] = extractOklch(LIGHT_BLOCK, "primary");
    const [rL] = extractOklch(LIGHT_BLOCK, "bbox-received");
    expect(pL).toBeLessThan(0.71);
    expect(rL).toBeLessThan(0.65);
  });

  it("--bbox-received and --bbox-success share numbers today but remain two separate tokens (§3.3)", () => {
    expect(extractOklch(LIGHT_BLOCK, "bbox-received")).toEqual(
      extractOklch(LIGHT_BLOCK, "bbox-success"),
    );
    // Still two distinct custom properties — a shared value is not a shared name.
    expect(THEME_CSS).toMatch(/--bbox-received:/);
    expect(THEME_CSS).toMatch(/--bbox-success:/);
  });

  it("dark mode is stamped in both the media-query block and the explicit [data-theme='dark'] block", () => {
    const mediaBlock = THEME_CSS.split("@media (prefers-color-scheme: dark)")[1] ?? "";
    expect(mediaBlock).toMatch(/--primary: oklch\(0\.78 0\.17 48\)/);
    expect(DARK_BLOCK).toMatch(/--primary: oklch\(0\.78 0\.17 48\)/);
  });

  it("every new bbox- token is mapped into the Tailwind @theme inline block", () => {
    const themeBlock = THEME_CSS.split("@theme inline {")[1]?.split("}")[0] ?? "";
    expect(themeBlock).toMatch(/--color-bbox-warning: var\(--bbox-warning\)/);
    expect(themeBlock).toMatch(/--color-bbox-success: var\(--bbox-success\)/);
    expect(themeBlock).toMatch(/--color-bbox-danger: var\(--bbox-danger\)/);
    expect(themeBlock).toMatch(/--color-bbox-accent: var\(--bbox-accent\)/);
  });
});
