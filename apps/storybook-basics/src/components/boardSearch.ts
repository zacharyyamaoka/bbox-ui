// src/components/boardSearch.ts — the quick switcher's Find half, ported from
// SystemSketch's board search:
//   /home/bam/systemsketch/src/commands/boardSearch.ts:156-176
//     (`findTextOccurrences`, `wordCharacter`) — carried over character for
//     character, it was already pure
//   /home/bam/systemsketch/src/commands/boardSearch.ts:206-259 (`searchBoard`)
//     — the cross-page sweep, restated over text the host hands in
//   /home/bam/systemsketch/src/commands/boardSearch.ts:262-268
//     (`replaceStringRanges`) and :495-507 (`boardSearchMatchSnippet`)
//
// Engine-free by rule (CLAUDE.md, "The core imports no canvas engine"): the
// donor walked `editor.getPages()` and read text through `ShapeUtil.getText()`.
// Here the HOST does that walk and hands in a flat, already-ordered list of
// `SearchableText`. What travels is the matching, the ordering-preservation,
// the snippet and the range arithmetic; what stays with the host is every
// question only a canvas can answer — which shapes exist, what order they read
// in, whether one is hidden or locked, and how to write a new value back.
//
// Deliberately NOT ported, and why, in one place so it is not mistaken for an
// oversight: `locateTextLeaves`/`replaceRichTextRanges`/`partialForReplacement`
// (donor :110-152, :288-360) rewrite a ProseMirror document in place while
// preserving its marks. That is arithmetic ON TLDRAW'S OWN SCHEMA — it reads
// `richTextValidator`, `TLShapePartial` and `editor.updateShape`. The pure
// half of it is `replaceTextRanges` below; the host composes that with its own
// schema knowledge. The donor's `format-boundary` blocker survives as the
// generic `replaceBlocker` string a host may stamp on a source.

export interface TextSearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

/** One searchable string the host exposes, in the order it should be read. */
export interface SearchableText<TMeta = unknown> {
  /** Stable id of the thing that owns this text. */
  sourceId: string;
  /** Heading the match files under — a page name, a file, a section. */
  group?: string;
  /** What this text IS, for the result row: "Block title", "Frame name"… */
  field: string;
  text: string;
  /** Why this source cannot be replaced into, if it cannot. */
  replaceBlocker?: string;
  /** Opaque host payload, returned untouched on every match it produces. */
  meta?: TMeta;
}

export interface TextSearchMatch<TMeta = unknown> {
  /** Stable for one revision of the sources; treat it as an opaque UI key. */
  id: string;
  sourceId: string;
  group?: string;
  field: string;
  text: string;
  start: number;
  end: number;
  /** Which occurrence within this source, 0-based. */
  occurrence: number;
  replaceable: boolean;
  replaceBlocker?: string;
  meta?: TMeta;
}

export interface TextReplacement {
  start: number;
  end: number;
  value: string;
}

/** The whole new text for one source — what a host writes back, if it agrees. */
export interface TextSourceUpdate<TMeta = unknown> {
  sourceId: string;
  field: string;
  text: string;
  meta?: TMeta;
}

function wordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

/**
 * Ordered, non-overlapping occurrences, without interpreting the query as a
 * regex. Ported unchanged from the donor (:156-176) — the escape is what keeps
 * a user typing `(` from either throwing or silently matching nothing.
 */
export function findTextOccurrences(
  text: string,
  query: string,
  options: TextSearchOptions = {},
): Array<{ start: number; end: number }> {
  if (!query) return [];
  const flags = options.matchCase ? "gu" : "giu";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, flags);
  const occurrences: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (options.wholeWord && (wordCharacter(text[start - 1]) || wordCharacter(text[end]))) continue;
    occurrences.push({ start, end });
  }
  return occurrences;
}

/**
 * Every occurrence across every source, in the order the sources were given.
 *
 * WHY the host's order is kept verbatim rather than re-sorted here: the donor
 * spent 30 lines (`shapeOrderPath`/`compareOrderPaths`, :178-204) proving that
 * a fractional index only orders SIBLINGS, so comparing two raw indices out of
 * a flat page set compares numbers that were never on the same scale — it
 * measured a frame's child sorting above the frame it sits inside, differently
 * on every run. That fix is real and it is entirely about tldraw's ancestor
 * chain. Re-deriving a reading order from data that no longer carries one
 * would be inventing the same bug; the host, which still has the chain, sorts.
 */
export function searchTextSources<TMeta>(
  sources: readonly SearchableText<TMeta>[],
  query: string,
  options: TextSearchOptions = {},
): Array<TextSearchMatch<TMeta>> {
  if (!query) return [];
  const matches: Array<TextSearchMatch<TMeta>> = [];
  for (const source of sources) {
    findTextOccurrences(source.text, query, options).forEach(({ start, end }, occurrence) => {
      matches.push({
        id: `${source.sourceId}|${source.field}|${start}`,
        sourceId: source.sourceId,
        group: source.group,
        field: source.field,
        text: source.text,
        start,
        end,
        occurrence,
        replaceable: !source.replaceBlocker,
        replaceBlocker: source.replaceBlocker,
        meta: source.meta,
      });
    });
  }
  return matches;
}

/**
 * Apply ranges back-to-front so an earlier replacement cannot shift a later
 * one's offsets. Ported unchanged from the donor (:262-268).
 */
export function replaceTextRanges(text: string, replacements: readonly TextReplacement[]): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, replacement) =>
        `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`,
      text,
    );
}

/** The full new text for one match — what the host writes back, if it agrees. */
export function replacedTextForMatch(match: TextSearchMatch, replacement: string): string {
  return replaceTextRanges(match.text, [{ start: match.start, end: match.end, value: replacement }]);
}

/**
 * The replaced text for every safe match, one entry per SOURCE.
 *
 * WHY grouped by source and not returned as a match list: two matches in one
 * string have to be applied together or the second one's offsets are already
 * stale. The donor grouped for the same reason (:404-412) and then wrote all
 * of them inside one editor transaction; here the grouping is the deliverable
 * and the transaction is the host's.
 */
export function replaceAllInSources<TMeta>(
  sources: readonly SearchableText<TMeta>[],
  query: string,
  replacement: string,
  options: TextSearchOptions = {},
): { replacedCount: number; skippedCount: number; updates: Array<TextSourceUpdate<TMeta>> } {
  const matches = searchTextSources(sources, query, options);
  const groups = new Map<string, Array<TextSearchMatch<TMeta>>>();
  for (const match of matches.filter((candidate) => candidate.replaceable)) {
    const key = `${match.sourceId}|${match.field}`;
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }

  const updates: Array<TextSourceUpdate<TMeta>> = [];
  let replacedCount = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const text = replaceTextRanges(
      first.text,
      group.map((match) => ({ start: match.start, end: match.end, value: replacement })),
    );
    if (text === first.text) continue;
    updates.push({ sourceId: first.sourceId, field: first.field, text, meta: first.meta });
    replacedCount += group.length;
  }
  return { replacedCount, skippedCount: matches.length - replacedCount, updates };
}

/**
 * The match with a little text either side, for the result row. Ported from
 * the donor (:495-507), ellipses and all.
 */
export function searchMatchSnippet(
  match: TextSearchMatch,
  contextLength = 36,
): { before: string; found: string; after: string } {
  const beforeStart = Math.max(0, match.start - contextLength);
  const afterEnd = Math.min(match.text.length, match.end + contextLength);
  return {
    before: `${beforeStart > 0 ? "…" : ""}${match.text.slice(beforeStart, match.start)}`,
    found: match.text.slice(match.start, match.end),
    after: `${match.text.slice(match.end, afterEnd)}${afterEnd < match.text.length ? "…" : ""}`,
  };
}
