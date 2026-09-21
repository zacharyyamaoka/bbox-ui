// src/editor/glyphPicker/index.ts — the ONE import every trigger uses.
//
// P-043's whole content is "one picker, every trigger": a canvas glyph, an
// inspector row and a menu row must open the SAME surface, not three
// look-alikes. Routing them through one barrel is the cheap mechanical half
// of that — `grep -rn 'editor/glyphPicker'` enumerates every trigger in the
// repo, and a second picker cannot appear without showing up as a second
// specifier.
//
// `LucideGlyphResolver` ships from here too, for the same reason its package
// sibling does: the resolver and the picker are two halves of one seam (the
// picker writes `lucide:<kebab>`, the resolver is what makes that string
// paint), and a host that mounted one without the other would store icons it
// cannot draw.
export { GlyphPicker, type GlyphPickerProps, encodePickedContent, makeChooseHandlers, IconsGrid, EmojiGrid } from "./glyphPicker";
export { resolveLucideName, LucideGlyphResolver } from "./resolveLucideName";
export { loadLucideLibrary, peekLucideLibrary, subscribeLucideLibrary, type LucideLibrary, type LucideLibraryEntry } from "./lucideLibrary";
export { loadEmojiLibrary, peekEmojiLibrary, type EmojiLibrary, type EmojiEntry } from "./emojiLibrary";
