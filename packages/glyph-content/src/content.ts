/**
 * @bbox-ui/glyph-content — packages/glyph-content/src/content.ts
 *
 * The grammar behind `Glyph`'s `content: string` prop
 * (docs/GLYPH-PLAN.md's contract table). Zero dependencies — no React, no
 * host engine, no picker UI — so `@bbox-ui/core` can depend on this
 * package without gaining a single new runtime dependency of its own
 * (the plan's "zero deps in core" stock-part row), and the picker package
 * can depend on it without dragging React or a UI library in.
 *
 * WHY content is one encoded STRING and not a tagged object prop: it is
 * the FieldValue every other field already is (schema/field.ts:
 * `string | number | boolean`) — a `FieldSpec` with `kind: "glyph"` has to
 * fit that same shape to reuse `readFields`/`resolveField`/Storybook's
 * `args` unmodified. It is also SystemSketch's own `iconRef.ts` grammar by
 * value (not by import — that repo is not a dependency here), so porting
 * `BlockIconPicker.tsx` in phase 3 does not have to re-encode a single
 * saved board.
 */

export type GlyphContent =
  | { kind: "none" }
  | { kind: "lucide"; name: string }
  | { kind: "emoji"; char: string }
  | { kind: "image"; src: string }
  | { kind: "text"; text: string };

const LUCIDE_PREFIX = "lucide:";
const EMOJI_PREFIX = "emoji:";
const TEXT_PREFIX = "text:";

/**
 * Decode the stored string into the tagged union a renderer switches on.
 *
 * Order matters, and it is deliberately NOT alphabetical: `data:`/`http(s):`
 * are recognised by their own URL scheme rather than a `bbox-ui`-invented
 * prefix, so `encodeGlyphContent` can hand a pasted/uploaded URL straight
 * through unprefixed (an image src IS its own tag) — swap the order and an
 * upload whose URL happened to start `lucide:` (it can't; schemes don't)
 * would be the only real ambiguity, so this is a documented ordering
 * choice, not an accident of `if`/`else if`.
 *
 * The final `else` is the leniency clause D1–D6 requires: a bare string
 * that matches nothing above (an old seed like `"🔍"`, or hand-typed
 * `"◆"` before this grammar existed) still renders — as literal text,
 * never a thrown error.
 */
export function decodeGlyphContent(raw: string | undefined | null): GlyphContent {
  if (raw === undefined || raw === null || raw === "") return { kind: "none" };
  if (raw.startsWith(LUCIDE_PREFIX)) return { kind: "lucide", name: raw.slice(LUCIDE_PREFIX.length) };
  if (raw.startsWith(EMOJI_PREFIX)) return { kind: "emoji", char: raw.slice(EMOJI_PREFIX.length) };
  if (raw.startsWith("data:") || raw.startsWith("http://") || raw.startsWith("https://")) {
    return { kind: "image", src: raw };
  }
  if (raw.startsWith(TEXT_PREFIX)) return { kind: "text", text: raw.slice(TEXT_PREFIX.length) };
  return { kind: "text", text: raw };
}

/**
 * The exact inverse of `decodeGlyphContent` for every CANONICAL string —
 * one produced by this function itself, or matching one of its four
 * prefixes/schemes. It is NOT the inverse of decode's leniency branch: a
 * bare legacy string decodes to `{kind:"text", text: raw}` but re-encodes
 * with the explicit `text:` prefix, because encode always produces a
 * string decode would take the FIRST branch for, never the fallback —
 * every value this package writes is self-describing from here on.
 */
export function encodeGlyphContent(content: GlyphContent): string {
  switch (content.kind) {
    case "none":
      return "";
    case "lucide":
      return `${LUCIDE_PREFIX}${content.name}`;
    case "emoji":
      return `${EMOJI_PREFIX}${content.char}`;
    case "image":
      // WHY no prefix: `content.src` already carries its own `data:`/
      // `http(s):` scheme, which is exactly what decode's image branch
      // matches on. Prefixing it (`image:${content.src}`) would produce a
      // string decode does not recognise as an image at all.
      return content.src;
    case "text":
      return `${TEXT_PREFIX}${content.text}`;
  }
}

/** Structural equality — two GlyphContent values that decode differently
 *  are never equal; two of the same kind are equal iff their one payload
 *  field matches. Used by the picker to skip an `onChange` that would not
 *  actually change anything (e.g. re-picking the icon already selected). */
export function sameGlyphContent(a: GlyphContent, b: GlyphContent): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "none":
      return true;
    case "lucide":
      return a.name === (b as typeof a).name;
    case "emoji":
      return a.char === (b as typeof a).char;
    case "image":
      return a.src === (b as typeof a).src;
    case "text":
      return a.text === (b as typeof a).text;
  }
}
