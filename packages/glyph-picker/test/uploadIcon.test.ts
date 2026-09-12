import { describe, expect, it } from "vitest";
import { ICON_MAX_EDGE_PX, ICON_MAX_SVG_BYTES, fetchIconFromUrl, prepareIconImage, scaledIconDimensions } from "../src/uploadIcon";

// WHY these tests stop at the SVG path and the pure downscale ratio, same
// as SystemSketch's own `uploadIcon.test.ts`: the raster path also needs
// `createImageBitmap` and a `<canvas>` 2d context, neither of which jsdom
// implements. That path is exercised for real by the Storybook CDP proof
// (a synthetic paste of a 2×2 PNG) instead.
describe("prepareIconImage", () => {
  it("passes an SVG through untouched, reading its declared size", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><rect/></svg>';
    const file = new File([svg], "mark.svg", { type: "image/svg+xml" });
    const prepared = await prepareIconImage(file);
    expect(prepared.kind).toBe("svg");
    expect(prepared.file).toBe(file);
    expect(prepared.width).toBe(48);
    expect(prepared.height).toBe(32);
    expect(prepared.originalBytes).toBe(file.size);
    expect(prepared.storedBytes).toBe(file.size);
  });

  it("falls back to viewBox when an SVG has no explicit width/height", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><rect/></svg>';
    const file = new File([svg], "mark.svg", { type: "image/svg+xml" });
    const prepared = await prepareIconImage(file);
    expect(prepared).toMatchObject({ width: 24, height: 18 });
  });

  it("recognises a bare .svg extension without the image/svg+xml MIME type", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';
    const file = new File([svg], "mark.svg", { type: "" });
    const prepared = await prepareIconImage(file);
    expect(prepared.kind).toBe("svg");
  });

  it("rejects an SVG over the size cap before ever reading its markup", async () => {
    const oversized = `<svg xmlns="http://www.w3.org/2000/svg">${"<!-- padding -->".repeat(
      Math.ceil((ICON_MAX_SVG_BYTES + 1024) / "<!-- padding -->".length),
    )}</svg>`;
    expect(oversized.length).toBeGreaterThan(ICON_MAX_SVG_BYTES);
    const file = new File([oversized], "huge.svg", { type: "image/svg+xml" });
    await expect(prepareIconImage(file)).rejects.toThrow(/^this SVG is [\d,]+ KB; the limit is 1,024 KB$/);
  });

  it("accepts an SVG right at the size cap", async () => {
    const wrapper = (padding: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!--${padding}--></svg>`;
    const padding = "x".repeat(ICON_MAX_SVG_BYTES - wrapper("").length);
    const svg = wrapper(padding);
    expect(svg.length).toBe(ICON_MAX_SVG_BYTES);
    const file = new File([svg], "exact.svg", { type: "image/svg+xml" });
    await expect(prepareIconImage(file)).resolves.toMatchObject({ kind: "svg" });
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
