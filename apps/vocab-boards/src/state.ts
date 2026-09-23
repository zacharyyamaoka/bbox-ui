/**
 * Pure filter/search/sort/routing logic, kept dependency-free from React.
 *
 * Ported from the reference viewer /home/bam/pyblocks/src/goldens/state.ts —
 * `parseQuery`/`serializeQuery`/`parseHash`/`toggleInList` and the
 * localStorage helpers are its code with this corpus's keys substituted, so
 * the two browsers behave identically under the same gestures.
 *
 * WHY the filter/view/sort state lives in the URL hash query, not React state
 * (its words, and they hold here for the same reason): component state dies on
 * navigation; the hash survives it, so Back from a scenario restores the exact
 * list, and a filtered view is bookmarkable and shareable for free.
 */

export type ViewMode = "gallery" | "table";

export type SortMode = "scenario" | "section" | "mechanism" | "vocabulary";

export interface FilterState {
  q: string;
  vocab: string[];
  section: string[];
  kind: string[];
  view: ViewMode;
  sort: SortMode;
}

export const EMPTY_FILTERS: FilterState = {
  q: "",
  vocab: [],
  section: [],
  kind: [],
  view: "gallery",
  sort: "scenario",
};

const LIST_KEYS: Array<keyof Pick<FilterState, "vocab" | "section" | "kind">> = [
  "vocab",
  "section",
  "kind",
];

const SORTS: SortMode[] = ["scenario", "section", "mechanism", "vocabulary"];

/** Parse a hash query string (with or without a leading `?`) into filter state.
 *  Unknown/missing keys fall back to EMPTY_FILTERS. */
export function parseQuery(search: string): FilterState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const listOf = (key: string) => {
    const rawValue = params.get(key);
    return rawValue ? rawValue.split(",").filter(Boolean) : [];
  };
  const view = params.get("view");
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    vocab: listOf("vocab"),
    section: listOf("section"),
    kind: listOf("kind"),
    view: view === "table" || view === "gallery" ? view : EMPTY_FILTERS.view,
    sort: SORTS.includes(sort as SortMode) ? (sort as SortMode) : EMPTY_FILTERS.sort,
  };
}

/** Serialise filter state back to a `key=value&...` query string, omitting
 *  anything at its default so a clean list is a clean hash. */
export function serializeQuery(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const key of LIST_KEYS) {
    const values = state[key];
    if (values.length) params.set(key, values.join(","));
  }
  if (state.view !== EMPTY_FILTERS.view) params.set("view", state.view);
  if (state.sort !== EMPTY_FILTERS.sort) params.set("sort", state.sort);
  return params.toString();
}

export type Route =
  | { kind: "home"; query: string }
  | { kind: "scenario"; id: string; query: string }
  | { kind: "board"; id: string; query: string }
  | { kind: "vocab"; key: string; query: string };

/** Parse `location.hash` (leading `#` included or not) into a Route. Anything
 *  unrecognised falls back to home. */
export function parseHash(hash: string): Route {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const [path, query = ""] = trimmed.split("?");
  const scenario = /^\/sc\/([^/]+)\/?$/.exec(path);
  if (scenario) return { kind: "scenario", id: decodeURIComponent(scenario[1]), query };
  const board = /^\/board\/([^/]+)\/?$/.exec(path);
  if (board) return { kind: "board", id: decodeURIComponent(board[1]), query };
  const vocab = /^\/vocab\/([^/]+)\/?$/.exec(path);
  if (vocab) return { kind: "vocab", key: decodeURIComponent(vocab[1]), query };
  return { kind: "home", query };
}

export function buildHomeHash(query: string): string {
  return query ? `#/?${query}` : "#/";
}

/**
 * A scenario link, optionally anchored at one mechanism.
 *
 * WHY the anchor rides in the QUERY (`b=2`) rather than as a second `#`: a URL
 * has exactly one fragment, and this whole app already lives inside it. The
 * scenario page reads `b` and scrolls that bucket into view itself — which also
 * means the anchor survives Back, which a browser-native `#id` jump inside a
 * hash route cannot do.
 */
export function buildScenarioHash(id: string, query: string, bucketIndex?: number): string {
  const params = new URLSearchParams(query);
  if (bucketIndex !== undefined) params.set("b", String(bucketIndex));
  const rest = params.toString();
  return rest ? `#/sc/${encodeURIComponent(id)}?${rest}` : `#/sc/${encodeURIComponent(id)}`;
}

export function buildBoardHash(id: string, query: string): string {
  return query ? `#/board/${encodeURIComponent(id)}?${query}` : `#/board/${encodeURIComponent(id)}`;
}

export function buildVocabHash(key: string, query: string): string {
  return query ? `#/vocab/${encodeURIComponent(key)}?${query}` : `#/vocab/${encodeURIComponent(key)}`;
}

/** The bucket a scenario link was anchored at, or null. */
export function anchoredBucket(query: string): number | null {
  const value = new URLSearchParams(query).get("b");
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The filter half of a route's query — `b` is an anchor, not a filter, and must
 *  not survive into the list hash or Back would re-scroll a page it left. */
export function filterQueryOf(query: string): string {
  return serializeQuery(parseQuery(query));
}

export function toggleInList<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/* ------------------------------------------------------------- the filter */

export interface Filterable {
  haystack: string;
  members: string[];
  sectionId: string;
  kind: string;
}

export function matchesSearch(item: Filterable, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return item.haystack.includes(needle);
}

function matchesAnyOf(values: string[], candidates: string[]): boolean {
  if (!values.length) return true;
  return candidates.some((candidate) => values.includes(candidate));
}

function matchesOne(values: string[], value: string): boolean {
  if (!values.length) return true;
  return values.includes(value);
}

export function matchesFilters(item: Filterable, filters: FilterState): boolean {
  if (!matchesSearch(item, filters.q)) return false;
  // A vocabulary chip means "a mechanism this tool is IN", so it is an any-of
  // over the bucket's members, not an equality — a bucket is six tools wide.
  if (!matchesAnyOf(filters.vocab, item.members)) return false;
  if (!matchesOne(filters.section, item.sectionId)) return false;
  if (!matchesOne(filters.kind, item.kind)) return false;
  return true;
}

/* ------------------------------------- per-viewer conveniences, not routes */

/*
 * The reference viewer's rule, kept: the gallery's column count and the
 * dashboard's open state are CONVENIENCES, not part of what the page is
 * showing. They live in localStorage so they do not clutter a shared link,
 * while everything that changes WHICH cards are on screen lives in the hash.
 * Every accessor is try/caught because storage throws in a locked-down context.
 */

const COLUMNS_STORAGE_KEY = "vocab.columns";
export const DEFAULT_COLUMNS = 4;
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;

export function clampColumns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COLUMNS;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(value)));
}

export function loadColumns(): number {
  try {
    const rawValue = localStorage.getItem(COLUMNS_STORAGE_KEY);
    return rawValue === null ? DEFAULT_COLUMNS : clampColumns(Number(rawValue));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function storeColumns(value: number): void {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, String(clampColumns(value)));
  } catch {
    // best-effort convenience only
  }
}

const DASHBOARD_STORAGE_KEY = "vocab.dashboard-open";

/** Open on a first visit — the dashboard carries the headline finding — but
 *  remembered once he shuts it, because someone working through 705 cards wants
 *  the list back on every return from a scenario, not once per visit. */
export function loadDashboardOpen(): boolean {
  try {
    return localStorage.getItem(DASHBOARD_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function storeDashboardOpen(open: boolean): void {
  try {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // best-effort convenience only
  }
}
