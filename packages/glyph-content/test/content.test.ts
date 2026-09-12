import { describe, expect, it } from "vitest";
import { decodeGlyphContent, encodeGlyphContent, sameGlyphContent, type GlyphContent } from "../src/content";

describe("decodeGlyphContent", () => {
  it.each<[string | undefined | null, GlyphContent]>([
    ["", { kind: "none" }],
    [undefined, { kind: "none" }],
    [null, { kind: "none" }],
    ["lucide:rocket", { kind: "lucide", name: "rocket" }],
    ["emoji:🚀", { kind: "emoji", char: "🚀" }],
    ["data:image/png;base64,AAAA", { kind: "image", src: "data:image/png;base64,AAAA" }],
    ["http://example.com/a.png", { kind: "image", src: "http://example.com/a.png" }],
    ["https://example.com/a.png", { kind: "image", src: "https://example.com/a.png" }],
    ["text:◆", { kind: "text", text: "◆" }],
  ])("decodes %p", (raw, expected) => {
    expect(decodeGlyphContent(raw)).toEqual(expected);
  });

  it("is lenient: a bare string matching no prefix or scheme renders as text rather than throwing", () => {
    // The exact case a legacy Glyph seed carries — see glyph.fields.ts's own
    // history (GLYPH_FIELDS.content used to default to "🔍" as literal
    // children, before this grammar existed).
    expect(decodeGlyphContent("🔍")).toEqual({ kind: "text", text: "🔍" });
    expect(decodeGlyphContent("◆")).toEqual({ kind: "text", text: "◆" });
  });

  it("an empty lucide/emoji/text name after the prefix decodes to an empty payload, not none", () => {
    expect(decodeGlyphContent("lucide:")).toEqual({ kind: "lucide", name: "" });
    expect(decodeGlyphContent("emoji:")).toEqual({ kind: "emoji", char: "" });
    expect(decodeGlyphContent("text:")).toEqual({ kind: "text", text: "" });
  });

  it("a colon inside the payload stays in the payload — only the FIRST prefix match is consumed", () => {
    expect(decodeGlyphContent("text:a:b:c")).toEqual({ kind: "text", text: "a:b:c" });
  });
});

describe("encodeGlyphContent", () => {
  it.each<[GlyphContent, string]>([
    [{ kind: "none" }, ""],
    [{ kind: "lucide", name: "rocket" }, "lucide:rocket"],
    [{ kind: "emoji", char: "🚀" }, "emoji:🚀"],
    [{ kind: "image", src: "data:image/png;base64,AAAA" }, "data:image/png;base64,AAAA"],
    [{ kind: "image", src: "https://example.com/a.png" }, "https://example.com/a.png"],
    [{ kind: "text", text: "◆" }, "text:◆"],
  ])("encodes %o", (content, expected) => {
    expect(encodeGlyphContent(content)).toBe(expected);
  });

  it("never prefixes an image src — decode recognises it by its own data:/http(s): scheme", () => {
    const encoded = encodeGlyphContent({ kind: "image", src: "http://x/y.png" });
    expect(encoded.startsWith("image:")).toBe(false);
    expect(encoded).toBe("http://x/y.png");
  });
});

describe("round trip — encode(decode(x)) === x for every canonical string", () => {
  // "Canonical" means: a string this package itself would produce, or one
  // matching a documented prefix/scheme. decode's leniency branch ("🔍") is
  // intentionally NOT canonical — see its own test above — so it is not
  // asserted here.
  const CANONICAL: string[] = [
    "",
    "lucide:rocket",
    "lucide:circle-check-big",
    "emoji:🚀",
    "emoji:🔍",
    "data:image/png;base64,AAAA",
    "http://example.com/a.png",
    "https://example.com/a.png",
    "text:◆",
    "text:",
    "text:a:b:c",
  ];

  it.each(CANONICAL)("round-trips %p", (raw) => {
    expect(encodeGlyphContent(decodeGlyphContent(raw))).toBe(raw);
  });

  // MUTATION GUARD: a decode/encode pair that quietly swapped a branch (e.g.
  // encode's "lucide" case returning `content.name` alone, or decode's
  // "emoji:" check using `includes` instead of `startsWith`) still passes a
  // same-kind-only test suite. These pin the FULL string, not just the kind,
  // so slicing at the wrong offset or dropping/duplicating a prefix fails
  // loudly instead of surviving as an off-by-one.
  it("MUTATION: the lucide prefix is exactly 'lucide:' — no more, no less", () => {
    expect(encodeGlyphContent({ kind: "lucide", name: "x" })).toBe("lucide:x");
    expect(decodeGlyphContent("lucide:x").kind === "lucide" && (decodeGlyphContent("lucide:x") as { name: string }).name).toBe(
      "x",
    );
  });

  it("MUTATION: decode never trims, lowercases or otherwise mutates the payload", () => {
    expect(decodeGlyphContent("lucide: Rocket ")).toEqual({ kind: "lucide", name: " Rocket " });
    expect(decodeGlyphContent("text: Hi ")).toEqual({ kind: "text", text: " Hi " });
  });
});

describe("sameGlyphContent", () => {
  it("is true for two values of the same kind with an equal payload", () => {
    expect(sameGlyphContent({ kind: "lucide", name: "rocket" }, { kind: "lucide", name: "rocket" })).toBe(true);
    expect(sameGlyphContent({ kind: "none" }, { kind: "none" })).toBe(true);
  });

  it("is false across different kinds, even with a coincidentally equal payload string", () => {
    expect(sameGlyphContent({ kind: "text", text: "rocket" }, { kind: "lucide", name: "rocket" })).toBe(false);
  });

  it("is false for the same kind with a different payload", () => {
    expect(sameGlyphContent({ kind: "emoji", char: "🚀" }, { kind: "emoji", char: "🔍" })).toBe(false);
    expect(sameGlyphContent({ kind: "image", src: "a" }, { kind: "image", src: "b" })).toBe(false);
  });
});
