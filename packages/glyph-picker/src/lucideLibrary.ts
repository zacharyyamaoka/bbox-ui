/**
 * packages/glyph-picker/src/lucideLibrary.ts
 *
 * The whole Lucide library, loaded lazily — one JSON chunk, one lazy
 * `import()`, per docs/GLYPH-PLAN.md D6 (SystemSketch's proven path over
 * `lucide-react/dynamic`, which emits one chunk file per icon: 1,818 of
 * them). Ported BY VALUE from SystemSketch's own
 * `src/blocks/ui/iconPicker/lucideLibrary.ts`; `data/lucide-icons.json` is
 * the same generated file, copied byte-for-byte.
 *
 * WHY `byKebab`, which the donor does not have (only `byName`, keyed by the
 * lucide-react PascalCase export): docs/GLYPH-PLAN.md's contract encodes a
 * picked icon as `lucide:<kebab>` ("the donor's kebab field"), not the
 * PascalCase name SystemSketch's own `BlockIconRef` stores — a different
 * grammar decision made for this package, so resolution has to key off the
 * same field the content string carries.
 */
import { createElement, type CSSProperties } from "react";

export type LucideIconNode = ReadonlyArray<readonly [tag: string, attrs: Readonly<Record<string, string | number>>]>;

export interface LucideLibraryEntry {
  /** lucide-react export name — carried through for parity with the donor's
   *  data, not itself used as a lookup key here (see `byKebab` above). */
  readonly name: string;
  /** lucide's own kebab-case id, shown to people AND the identity this
   *  package stores in a Glyph's `content` (`lucide:<kebab>`). */
  readonly kebab: string;
  readonly tags: readonly string[];
  readonly node: LucideIconNode;
}

export interface LucideLibrary {
  readonly version: string;
  readonly entries: readonly LucideLibraryEntry[];
  readonly byKebab: ReadonlyMap<string, LucideLibraryEntry>;
  search(query: string): LucideLibraryEntry[];
}

let loaded: LucideLibrary | null = null;
let loading: Promise<LucideLibrary> | null = null;
const listeners = new Set<() => void>();

/** Synchronous view: null until `loadLucideLibrary()` has resolved once. */
export function peekLucideLibrary(): LucideLibrary | null {
  return loaded;
}

/** Notifies once the library becomes available; returns the unsubscribe. */
export function subscribeLucideLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadLucideLibrary(): Promise<LucideLibrary> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = import("./data/lucide-icons.json").then((module) => {
      const data = (module.default ?? module) as unknown as { version: string; icons: LucideLibraryEntry[] };
      loaded = buildLucideLibrary(data.version, data.icons);
      for (const listener of listeners) listener();
      return loaded;
    });
  }
  return loading;
}

export function buildLucideLibrary(version: string, entries: readonly LucideLibraryEntry[]): LucideLibrary {
  const byKebab = new Map(entries.map((entry) => [entry.kebab, entry]));
  return {
    version,
    entries,
    byKebab,
    search: (query) => searchLucide(entries, query),
  };
}

/**
 * Notion-style filter: every typed word must match the icon's id or one of
 * its tags. Ranked id-exact > id-prefix > tag-exact > id-contains >
 * tag-prefix > tag-contains, then alphabetical. No fuzzing — Notion doesn't
 * fuzz either. Ported unchanged from the donor.
 */
export function searchLucide(entries: readonly LucideLibraryEntry[], query: string): LucideLibraryEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...entries];
  const scored: Array<[number, LucideLibraryEntry]> = [];
  for (const entry of entries) {
    let score = 0;
    for (const term of terms) {
      let best = 0;
      if (entry.kebab === term) best = 100;
      else if (entry.kebab.startsWith(term)) best = 60;
      else if (entry.kebab.includes(term)) best = 40;
      for (const tag of entry.tags) {
        if (tag === term) best = Math.max(best, 50);
        else if (tag.startsWith(term)) best = Math.max(best, 30);
        else if (tag.includes(term)) best = Math.max(best, 15);
      }
      if (best === 0) {
        score = 0;
        break;
      }
      score += best;
    }
    if (score > 0) scored.push([score, entry]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].kebab.localeCompare(b[1].kebab));
  return scored.map(([, entry]) => entry);
}

/**
 * Renders a Lucide node with lucide-react's default SVG attributes —
 * `createElement` per node tuple, never `innerHTML` (plan's contract). No
 * `lucide-react` import: the JSON already carries each icon's raw node
 * tuples, so this draws the identical markup lucide-react's own generated
 * components would, without paying for the 1,818-component module graph.
 */
export function LucideNodeSvg({
  node,
  size,
  className,
  style,
}: {
  node: LucideIconNode;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
      style,
      "aria-hidden": "true",
    },
    ...node.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index })),
  );
}
