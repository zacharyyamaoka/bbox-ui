import { describe, expect, it } from "vitest";

import { measureText, splitGraphemes, truncateToWidth } from "../src/detach/stockPartials";

const ELLIPSIS = "…";

/**
 * True when `prefix` is a concatenation of complete grapheme clusters of
 * `text`, in order from the start — the property a truthful ellipsis cut
 * must preserve (no dangling ZWJ, no orphaned combining mark, no half
 * surrogate, no split flag).
 */
function isGraphemePrefix(text: string, prefix: string): boolean {
  let assembled = "";
  if (prefix === "") return true;
  for (const grapheme of splitGraphemes(text)) {
    assembled += grapheme;
    if (assembled === prefix) return true;
    if (assembled.length > prefix.length) return false;
  }
  return false;
}

/** Sweep every width that forces a cut and assert each lands on a cluster. */
function expectCleanCutsEverywhere(text: string, px = 44, weight = 500) {
  const fullWidth = measureText(text, px, weight);
  expect(truncateToWidth(text, px, fullWidth, weight)).toBe(text);
  for (let maxW = 1; maxW < fullWidth; maxW += 7) {
    const emitted = truncateToWidth(text, px, maxW, weight);
    expect(emitted.endsWith(ELLIPSIS)).toBe(true);
    const prefix = emitted.slice(0, -1);
    expect(isGraphemePrefix(text, prefix)).toBe(true);
    // Never a dangling zero-width joiner before the ellipsis.
    expect(prefix.endsWith("‍")).toBe(false);
    // Never a lone high surrogate.
    if (prefix.length > 0) {
      const last = prefix.charCodeAt(prefix.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
  }
}

describe("truncateToWidth cuts on grapheme clusters", () => {
  it("keeps a ZWJ emoji family whole (the judge's reproducer)", () => {
    expectCleanCutsEverywhere("A👩‍❤️‍💋‍👩 followed by a long title");
  });

  it("keeps combining marks on their base letters", () => {
    expectCleanCutsEverywhere("de\u0301tection re\u0301sume\u0301 nai\u0308ve");
  });

  it("keeps surrogate pairs whole", () => {
    expectCleanCutsEverywhere("𝕏𝕪𝕫 mathematical 𝔸𝔹ℂ letters");
  });

  it("keeps regional-indicator flags whole", () => {
    expectCleanCutsEverywhere("🇨🇦🇯🇵🇧🇷 flags in a title");
  });

  it("splitGraphemes treats each of those as one unit", () => {
    expect(splitGraphemes("A👩‍❤️‍💋‍👩B")).toEqual(["A", "👩‍❤️‍💋‍👩", "B"]);
    expect(splitGraphemes("e\u0301x")).toEqual(["e\u0301", "x"]);
    expect(splitGraphemes("🇨🇦🇯🇵")).toEqual(["🇨🇦", "🇯🇵"]);
  });
});
