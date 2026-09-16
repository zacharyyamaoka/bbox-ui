/**
 * packages/glyph-picker/src/emojiLibrary.ts
 *
 * The emoji set for the picker's Emoji tab: names from unicode-emoji-json,
 * keywords from emojibase. Ported BY VALUE, unchanged, from SystemSketch's
 * `src/blocks/ui/iconPicker/emojiLibrary.ts` — this file has no tldraw
 * touches at all, so nothing about it needed adapting. `data/emoji.json`
 * is the same generated file, copied byte-for-byte.
 */

export interface EmojiEntry {
  readonly char: string;
  readonly name: string;
  readonly slug: string;
  readonly group: string;
  readonly keywords: readonly string[];
  readonly skinTone: boolean;
}

export interface EmojiLibrary {
  readonly version: string;
  readonly entries: readonly EmojiEntry[];
  /** Unicode group names in Notion's order, only those present. */
  readonly groups: readonly string[];
  /** Same shape as `LucideLibrary.byKebab` — the Emoji tab's Recent section
   *  looks entries up by slug. */
  readonly bySlug: ReadonlyMap<string, EmojiEntry>;
  search(query: string): EmojiEntry[];
}

/** Notion's group order, which is also Unicode's. */
export const EMOJI_GROUP_ORDER: readonly string[] = [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];

/** Fitzpatrick modifiers; index 0 is "no tone". */
export const EMOJI_SKIN_TONES: readonly string[] = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];

/** The font stack that draws emoji in colour on Linux, macOS and Windows. */
export const EMOJI_FONT_FAMILY = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla",sans-serif';

let loaded: EmojiLibrary | null = null;
let loading: Promise<EmojiLibrary> | null = null;

export function peekEmojiLibrary(): EmojiLibrary | null {
  return loaded;
}

export function loadEmojiLibrary(): Promise<EmojiLibrary> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = import("./data/emoji.json").then((module) => {
      const data = (module.default ?? module) as unknown as { version: string; emoji: EmojiEntry[] };
      loaded = buildEmojiLibrary(data.version, data.emoji);
      return loaded;
    });
  }
  return loading;
}

export function buildEmojiLibrary(version: string, entries: readonly EmojiEntry[]): EmojiLibrary {
  const present = new Set(entries.map((entry) => entry.group));
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  return {
    version,
    entries,
    groups: EMOJI_GROUP_ORDER.filter((group) => present.has(group)),
    bySlug,
    search: (query) => searchEmoji(entries, query),
  };
}

/** Every typed word must appear in the name, the slug, or a keyword. Order is the set's own. */
export function searchEmoji(entries: readonly EmojiEntry[], query: string): EmojiEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entries];
  return entries.filter((entry) =>
    terms.every(
      (term) =>
        entry.name.includes(term) || entry.slug.includes(term) || entry.keywords.some((keyword) => keyword.includes(term)),
    ),
  );
}

/** Applies a Fitzpatrick tone to an emoji that supports one; others come back unchanged. */
export function applySkinTone(entry: EmojiEntry, tone: number): string {
  const modifier = EMOJI_SKIN_TONES[tone] ?? "";
  return entry.skinTone && modifier ? entry.char + modifier : entry.char;
}
