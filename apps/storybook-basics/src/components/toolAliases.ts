// src/components/toolAliases.ts — the per-tool alias vocabulary behind a
// Settings search box ("give any tool the names you use"), as a pure model.
//
// Ported from /home/bam/systemsketch/src/library/toolAliases.ts (132 lines).
// `toolAliasItemMatches` is ported from that donor's own consumer,
// /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:293-296, where it
// lived as a private helper closed over one tool's own alias array; here it
// is generalized to take the whole map and look a tool up by id, since the
// kit has no per-tool component to close over.
//
// WHY the storage key, the `{ version: 1, aliases }` envelope, the 64-char
// cap and the normalization semantics all travel byte-for-byte: keeping the
// donor's key (`systemsketch.tool-aliases.v1`) is what lets Zach's existing
// aliases survive the move into this app — a new key would silently reset
// everyone back to zero aliases the day this ships.
//
// Ported the MODEL only, per this repo's host-contract law (see
// `toolPreferences.ts`'s header for the precedent): the donor's
// `useSyncExternalStore` singleton (`getToolAliases`/`updateToolAliases`/
// `subscribe`/`useToolAliases`, module-level `snapshot`/`hydrate`/
// `listeners`) is host-owned persistence and subscription and does not
// travel. `addToolAlias`/`removeToolAlias` become PURE functions over a
// passed-in map instead of mutating that singleton; a host that wants
// storage and re-render wiring writes its own adapter around these, the same
// way `appSettings.ts` wraps `parsePreferences`/`mergePreferences`.
//
// Deliberately NOT ported: `TOOL_SEARCH_ALIAS_ITEMS` / `TOOLBAR_TOOL_SEARCH_ITEMS`
// and the rest of `toolSearchCatalog.ts`. Those name SystemSketch's own tool
// inventory (`block`, `branch`, `behaviorTree`, …) — host vocabulary, exactly
// what `ToolAliasItem` exists to keep out of the kit. Same rule
// `toolPreferences.ts`'s header already states for `ShapeFamilyTool`.

/**
 * WHY this key is the donor's exact string, unchanged: see the file header —
 * it is the whole reason the alias data survives the port.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:4.
 */
export const TOOL_ALIASES_STORAGE_KEY = "systemsketch.tool-aliases.v1";

/** Ported from /home/bam/systemsketch/src/library/toolAliases.ts:5. */
export const MAX_TOOL_ALIAS_LENGTH = 64;

/** Ported from /home/bam/systemsketch/src/library/toolAliases.ts:7. */
export type ToolAliases = Readonly<Record<string, readonly string[]>>;

/**
 * A tool an alias can be attached to. The HOST supplies these — the kit
 * never names a tool (see the file header's "deliberately not ported" note).
 * Ported from the donor's `ToolSearchAliasItem`,
 * /home/bam/systemsketch/src/library/toolSearchCatalog.ts:8-12.
 */
export interface ToolAliasItem {
  id: string;
  label: string;
  detail: string;
}

/** Ported from /home/bam/systemsketch/src/library/toolAliases.ts:9-12. */
interface StoredToolAliases {
  version: 1;
  aliases: ToolAliases;
}

/** Ported from /home/bam/systemsketch/src/library/toolAliases.ts:14. */
export const EMPTY_TOOL_ALIASES: ToolAliases = Object.freeze({});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Keep a readable handle intact: trim the ends, collapse internal whitespace
 * runs to one space, and otherwise touch nothing — no case-folding, no
 * stripping of punctuation. `@datatype` is meaningful to its author exactly
 * as typed. Rejects empty and over-length; accepts exactly `MAX_TOOL_ALIAS_LENGTH`.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:20-25.
 */
export function normalizeToolAlias(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= MAX_TOOL_ALIAS_LENGTH ? normalized : null;
}

/**
 * Total: a non-record, a non-array alias list, or an empty tool id is
 * skipped rather than thrown on. De-duplicates within one tool's list using
 * `localeCompare(..., undefined, { sensitivity: "accent" })` — case-insensitive
 * but accent-sensitive, so "cafe" and "CAFE" collide but "cafe" and "café" do
 * not; a naive `toLowerCase()` would fold the accent away too and is not the
 * same rule. A tool whose alias list ends up empty (all entries invalid or
 * duplicate) is dropped from the result entirely, and insertion order is
 * preserved for the survivors.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:27-41.
 */
export function normalizeToolAliases(value: unknown): ToolAliases {
  if (!isRecord(value)) return EMPTY_TOOL_ALIASES;
  const aliases: Record<string, string[]> = {};
  for (const [toolId, rawAliases] of Object.entries(value)) {
    if (!Array.isArray(rawAliases) || toolId.length === 0) continue;
    const next: string[] = [];
    for (const rawAlias of rawAliases) {
      const alias = normalizeToolAlias(rawAlias);
      if (!alias || next.some((candidate) => candidate.localeCompare(alias, undefined, { sensitivity: "accent" }) === 0)) continue;
      next.push(alias);
    }
    if (next.length > 0) aliases[toolId] = next;
  }
  return aliases;
}

/**
 * Unwraps the versioned envelope written by `writeToolAliases`. A wrong
 * `version`, or anything that is not a record at all, resets to the empty
 * map rather than guessing at a migration.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:43-46.
 */
export function parseStoredToolAliases(value: unknown): ToolAliases {
  if (!isRecord(value) || value.version !== 1) return EMPTY_TOOL_ALIASES;
  return normalizeToolAliases(value.aliases);
}

/**
 * Reads `TOOL_ALIASES_STORAGE_KEY` through `parseStoredToolAliases`. A null
 * storage, a throwing `getItem` (private window, blocked site data), or
 * corrupt JSON all fall back to `EMPTY_TOOL_ALIASES`. Never throws.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:48-57.
 */
export function readToolAliases(storage: Pick<Storage, "getItem"> | null): ToolAliases {
  if (!storage) return EMPTY_TOOL_ALIASES;
  try {
    const raw = storage.getItem(TOOL_ALIASES_STORAGE_KEY);
    return raw === null ? EMPTY_TOOL_ALIASES : parseStoredToolAliases(JSON.parse(raw));
  } catch {
    return EMPTY_TOOL_ALIASES;
  }
}

/**
 * Normalizes `aliases`, writes it under the versioned envelope, and returns
 * the normalized value actually stored — so a caller that only has the raw
 * input still ends up holding what will be read back next time. A null
 * storage or a throwing `setItem` is swallowed: a search vocabulary is a
 * convenience and must never block drawing (the donor's own reasoning,
 * kept verbatim). Never throws.
 * Ported from /home/bam/systemsketch/src/library/toolAliases.ts:59-71.
 */
export function writeToolAliases(storage: Pick<Storage, "setItem"> | null, aliases: ToolAliases): ToolAliases {
  const normalized = normalizeToolAliases(aliases);
  if (storage) {
    try {
      const stored: StoredToolAliases = { version: 1, aliases: normalized };
      storage.setItem(TOOL_ALIASES_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Swallowed on purpose — see the doc comment above.
    }
  }
  return normalized;
}

/**
 * Pure: returns the NEXT map, or `null` when the alias is invalid or already
 * present (case-insensitive, accent-sensitive) for this tool. Returning
 * `null` rather than `false` is what lets a host tell "rejected" from
 * "accepted" while staying pure, since a boolean can't also carry the
 * unchanged map back out. Does not mutate `aliases`.
 * Ported from the donor's mutating `addToolAlias`,
 * /home/bam/systemsketch/src/library/toolAliases.ts:105-113.
 */
export function addToolAlias(aliases: ToolAliases, toolId: string, value: unknown): ToolAliases | null {
  const alias = normalizeToolAlias(value);
  if (!alias || toolId.length === 0) return null;
  const current = aliases[toolId] ?? [];
  if (current.some((candidate) => candidate.localeCompare(alias, undefined, { sensitivity: "accent" }) === 0)) return null;
  return { ...aliases, [toolId]: [...current, alias] };
}

/**
 * Pure: returns the NEXT map, or the SAME reference when nothing changed —
 * identity-preserving exactly like `mergePreferences` in `toolPreferences.ts`,
 * so a host's `useState` setter cannot cause a pointless re-render on a
 * no-op removal. Deletes the tool's key entirely once its last alias is
 * gone, rather than leaving an empty array behind. Does not mutate `aliases`.
 * Ported from the donor's mutating `removeToolAlias`,
 * /home/bam/systemsketch/src/library/toolAliases.ts:115-123.
 */
export function removeToolAlias(aliases: ToolAliases, toolId: string, alias: string): ToolAliases {
  const current = aliases[toolId];
  if (!current) return aliases;
  const next = current.filter((candidate) => candidate !== alias);
  if (next.length === current.length) return aliases;
  const result: Record<string, readonly string[]> = { ...aliases };
  if (next.length > 0) result[toolId] = next;
  else delete result[toolId];
  return result;
}

/**
 * Case-insensitive substring match over a tool's own label and its aliases —
 * the donor's Settings search box. A blank/whitespace-only query matches
 * everything, so `filterToolAliasItems` can hand back the untouched list
 * rather than re-running a trivial "" `.includes()` over every item.
 * Ported from /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:293-296.
 */
export function toolAliasItemMatches(item: ToolAliasItem, query: string, aliases: ToolAliases): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) return true;
  if (item.label.toLocaleLowerCase().includes(normalizedQuery)) return true;
  const itemAliases = aliases[item.id] ?? [];
  return itemAliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery));
}

/**
 * The items a query leaves visible, in the order given. An empty/blank query
 * returns every item.
 * Ported from the donor's `ToolAliasesPanel` filtering,
 * /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:300-304.
 */
export function filterToolAliasItems(items: readonly ToolAliasItem[], query: string, aliases: ToolAliases): ToolAliasItem[] {
  if (query.trim().length === 0) return [...items];
  return items.filter((item) => toolAliasItemMatches(item, query, aliases));
}
