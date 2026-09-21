import { describe, expect, it } from "vitest";
import { ICON_MAX_EDGE_PX, ICON_MAX_SVG_BYTES, fetchIconFromUrl, prepareIconImage, scaledIconDimensions } from "./uploadIcon";

// src/editor/glyphPicker/uploadIcon.test.ts — the trunk-lineage copy of
// packages/glyph-picker/test/uploadIcon.test.ts, trimmed to what a
// `environment: "node"` project can actually run (see the first describe).
//
// WHY the donor stops at the SVG path and the pure downscale ratio in the
// first place: the raster path needs `createImageBitmap` and a `<canvas>` 2d
// context, which jsdom does not implement either. That path is exercised for
// real in a browser instead.
describe("prepareIconImage", () => {
  // WHY only the size-cap case survives here, when the package copy of this
  // file (packages/glyph-picker/test/uploadIcon.test.ts) runs seven: this
  // app's `unit` project is `environment: "node"` (vitest.config.ts), and
  // `prepareIconImage` reads SVG markup through a DOM `FileReader`. The four
  // markup-parsing cases therefore cannot run here at all — not a weaker
  // assertion, an absent global. They still run, unchanged, against the
  // byte-identical `uploadIcon.ts` in the package's jsdom project, and the
  // raster path is covered where it has always had to be: a real browser
  // (GlyphPicker.stories.tsx's play functions, and the app's
  // `glyph.smoke.test.tsx`).
  //
  // This one stays because it is the case that must hold WITHOUT a DOM: the
  // cap is checked against `file.size` before a single byte is read, which is
  // exactly why an oversized upload cannot cost a main-thread parse. A mutant
  // that moved the check after the read would go red here and nowhere else in
  // this project.
  it("rejects an SVG over the size cap before ever reading its markup", async () => {
    const oversized = `<svg xmlns="http://www.w3.org/2000/svg">${"<!-- padding -->".repeat(
      Math.ceil((ICON_MAX_SVG_BYTES + 1024) / "<!-- padding -->".length),
    )}</svg>`;
    expect(oversized.length).toBeGreaterThan(ICON_MAX_SVG_BYTES);
    const file = new File([oversized], "huge.svg", { type: "image/svg+xml" });
    await expect(prepareIconImage(file)).rejects.toThrow(/^this SVG is [\d,]+ KB; the limit is 1,024 KB$/);
  });
});

describe("scaledIconDimensions", () => {
  it("leaves an image already within the ceiling unscaled", () => {
    expect(scaledIconDimensions(120, 80)).toEqual({ width: 120, height: 80 });
  });

  it("downscales so the longest edge lands exactly on the ceiling", () => {
    const result = scaledIconDimensions(1000, 634);
    expect(Math.max(result.width, result.height)).toBe(ICON_MAX_EDGE_PX);
    expect(result).toEqual({ width: 256, height: 162 });
  });

  it("scales a portrait image by its tall edge", () => {
    expect(scaledIconDimensions(300, 1200)).toEqual({ width: 64, height: 256 });
  });

  it("never rounds a dimension down to zero", () => {
    expect(scaledIconDimensions(1, 10000)).toEqual({ width: 1, height: 256 });
  });
});

describe("fetchIconFromUrl", () => {
  it("names the file from the URL and preserves the response content type", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } })) as typeof fetch;
    try {
      const file = await fetchIconFromUrl("https://example.com/logos/mark.png?x=1");
      expect(file.name).toBe("mark.png");
      expect(file.type).toBe("image/png");
      expect(file.size).toBe(bytes.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces the status when the fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    try {
      await expect(fetchIconFromUrl("https://example.com/missing.png")).rejects.toThrow("request failed (404)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
