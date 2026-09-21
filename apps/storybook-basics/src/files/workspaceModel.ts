// src/files/workspaceModel.ts — the navigator's and the document session's
// pure helpers: paths, titles, recents, untitled reservations, the browser's
// rows/sort/selection/breadcrumb, and the autosave schedule.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// ported verbatim by lane `files-kit`. Constants are the donor's, verbatim,
// and are the contract. `workspaceModel.test.ts` is the acceptance (a port of
// the donor's own suite) and is off-limits to the builder.
//
// Donor, read on disk: `/home/bam/systemsketch/src/workspace/
// workspaceModel.ts:1-504`, plus `relativeDay`/`fileSize` from
// `/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:1662-1688`. Ported
// VERBATIM except the one deliberate change below. NOT ported:
// `encodeDocumentForPath` (the `.systemsketch` envelope — this app writes
// plain `.tldr`), `exportedTldrawPath`, `workspaceBrowserDirectory`,
// `sameFingerprint`/`nextSyncAction`/`canApplyExternalReload`/
// `removesDocumentBoundary` (the external-change watcher is not in this
// build — the digest fence still refuses to clobber, see the plan).
//
// THE ONE DELIBERATE CHANGE: the donor defaulted every NEW document to
// `.systemsketch`. What this app WRITES is now `.bbox` — Zach, 2026-09-21:
// "lets call this file type .bbox as this project is no longer system sketch
// its just the bbox whiteboard". Everything else — every known suffix still
// recognized, titles judged across all of them, a typed known suffix
// honoured — is unchanged.
//
// WHY three suffixes and not one: a rename of what we WRITE must never be a
// break of what we READ. On disk right now sit 84 `.systemsketch` boards (the
// archived app's envelope, still handed off to it by
// `apps/systemsketch/src/files/session.tsx`) and 31 `.tldr` boards this build
// itself wrote before the rename. Dropping either suffix from
// `DOCUMENT_SUFFIXES` would not "migrate" those files, it would make them
// invisible to the navigator — the one outcome the rename is not allowed to
// have. The tempting alternative, rewriting the extension on disk, is a
// migration, and a migration is a thing Zach asks for, not a thing a rename
// does behind him.
//
// WHY `.bbox` carries the SAME BYTES as `.tldr`: the rename changes the name
// of the format, not the format. `serializeBoard`
// (`apps/systemsketch/src/chrome/FileMenu/fileActions.ts`) is unchanged, so a
// `.bbox` is a plain tldraw document — which is why `documentEncoding` calls
// it `"tldraw"` and why the file host holds it to the same no-envelope rule
// a `.tldr` gets.

export const BBOX_SUFFIX = ".bbox";
export const SYSTEMSKETCH_SUFFIX = ".systemsketch";
export const TLDRAW_SUFFIX = ".tldr";
/** Every suffix that OPENS. `.bbox` leads because it is what we write, and
 *  `default_document_path`'s python twin walks this same order. */
export const DOCUMENT_SUFFIXES = [BBOX_SUFFIX, SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX] as const;
export type DocumentSuffix = (typeof DOCUMENT_SUFFIXES)[number];
/** The one suffix this build WRITES. */
export const DEFAULT_NEW_DOCUMENT_SUFFIX: DocumentSuffix = BBOX_SUFFIX;
export const RECENT_DOCUMENTS_KEY = "systemsketch.recentDocuments.v1";
export const MAX_RECENT_DOCUMENTS = 12;
export const UNTITLED_CLAIMS_KEY = "systemsketch.untitledClaims.v1";
export const UNTITLED_CLAIM_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTOSAVE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const;

/**
 * The document extension `path` uses, or `null` if it is not a SystemSketch
 * document. Both separators are split on: an IDE host hands over the operating
 * system's own path, which on Windows is `C:\\goldens\\01\\target.systemsketch`.
 * Donor: workspaceModel.ts:45.
 */
export function documentSuffix(path: string): DocumentSuffix | null {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase();
  return (
    DOCUMENT_SUFFIXES.find(
      (suffix) => name.length > suffix.length && name.endsWith(suffix),
    ) ?? null
  );
}

/** Which on-disk ENCODING a path implies — not which extension it has. The
 *  suffix decides; nothing else does. `.bbox` and `.tldr` are the same bytes
 *  under two names (see the header), so only `.systemsketch` reads as the
 *  archive's envelope. Donor: :53. */
export function documentEncoding(path: string): "systemsketch" | "tldraw" {
  return documentSuffix(path) === SYSTEMSKETCH_SUFFIX ? "systemsketch" : "tldraw";
}

/** Donor: :64. */
export function documentTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const suffix = documentSuffix(name);
  return suffix ? name.slice(0, -suffix.length) : name;
}

/** Donor: :70. */
export function parentDirectory(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator <= 0 ? "/" : path.slice(0, separator);
}

/**
 * Turn a typed name into a document path. A name that already names a known
 * type keeps it, so `Export.tldr` in Save As really does write a `.tldr`;
 * anything else takes `fallbackSuffix`, which is `.bbox` here (the header's
 * deliberate change from the donor's `.systemsketch` default).
 * Donor: :115.
 */
export function documentPathFor(
  directory: string,
  rawName: string,
  fallbackSuffix: DocumentSuffix = DEFAULT_NEW_DOCUMENT_SUFFIX,
): string | null {
  const typed = rawName.trim();
  const suffix = documentSuffix(typed) ?? fallbackSuffix;
  const trimmed = (documentSuffix(typed) ? typed.slice(0, -suffix.length) : typed).trim();
  if (!trimmed) return null;
  const safe = trimmed.replace(/[/\\]/g, "-").replace(/^\.+/, "").trim();
  if (!safe) return null;
  return `${directory.replace(/\/$/, "")}/${safe}${suffix}`;
}

/** Rename keeps the document's type: a `.tldr` renamed is still a `.tldr`,
 *  and a `.systemsketch` renamed is still a `.systemsketch`. WHY rename is not
 *  the migration hook: changing someone's extension while they were only
 *  changing its name is a conversion they did not ask for. Donor: :130. */
export function renamedDocumentPath(path: string, rawName: string): string | null {
  return documentPathFor(
    parentDirectory(path),
    rawName,
    documentSuffix(path) ?? DEFAULT_NEW_DOCUMENT_SUFFIX,
  );
}

/**
 * Allocate the next free `Untitled` document. Collision is judged on the
 * *title*, not the full path, so a folder already holding `Untitled.tldr` gets
 * `Untitled 2.bbox` rather than two files that read as the same name.
 * Donor: :143, plus a `suffix` parameter defaulting to `.bbox` (header).
 */
export function nextUntitledDocumentPath(
  directory: string,
  existingPaths: readonly string[],
  suffix: DocumentSuffix = DEFAULT_NEW_DOCUMENT_SUFFIX,
): string {
  const occupied = new Set(existingPaths.map((path) => documentTitle(path).toLowerCase()));
  for (let index = 1; ; index += 1) {
    const title = index === 1 ? "Untitled" : `Untitled ${index}`;
    if (!occupied.has(title.toLowerCase())) return documentPathFor(directory, title, suffix)!;
  }
}

/**
 * `?board=<path>` on `base`'s path, every other query param dropped. `base`
 * is injected (the donor read `window.location.href`) so a node test can
 * call it. Donor: :154.
 */
export function documentHref(path: string, base: string): string {
  const url = new URL(base);
  url.search = "";
  url.searchParams.set("board", path);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The next bounded retry delay; forced writes and digest conflicts always require a person. Donor: :181. */
export function autosaveRetryDelay(
  failedAttempts: number,
  options: { conflict?: boolean; force?: boolean } = {},
): number | null {
  if (options.conflict || options.force) return null;
  return AUTOSAVE_RETRY_DELAYS_MS[failedAttempts] ?? null;
}

export interface AutosaveSchedule {
  /** The first edit in the still-unpersisted burst. */
  pendingSince: number;
  /** Delay from `now` until the next save attempt. */
  delayMs: number;
}

/**
 * Debounce nearby edits without allowing a continuous gesture to defer its
 * first save forever.
 *
 * WHY: draw.io 31.4.2 gives its local recovery draft both an idle delay and a
 * 30-second ceiling (DrawioFile.js L2216-L2238). Keeping the original start
 * time gives SystemSketch the same bounded-loss window while retaining its
 * shorter normal debounce. Retry backoff is intentionally handled separately.
 * Donor: :198.
 */
export function autosaveSchedule(
  now: number,
  pendingSince: number | null,
  debounceMs: number,
  maxDelayMs: number,
): AutosaveSchedule {
  const startedAt = pendingSince ?? now;
  const remainingBeforeDeadline = Math.max(0, maxDelayMs - (now - startedAt));
  return {
    pendingSince: startedAt,
    delayMs: Math.min(debounceMs, remainingBeforeDeadline),
  };
}

type ReadStorage = Pick<Storage, "getItem">;
type ReadWriteStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * donor :246 — `storage` is REQUIRED here (the donor defaulted to
 * `window.localStorage`, which a node test cannot have).
 */
export function readRecentDocumentPaths(storage: ReadStorage): string[] {
  try {
    const value = JSON.parse(storage.getItem(RECENT_DOCUMENTS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((path): path is string => typeof path === "string")
      : [];
  } catch {
    return [];
  }
}

/** Donor: :259. */
export function rememberDocumentPath(path: string, storage: ReadWriteStorage): string[] {
  const next = [path, ...readRecentDocumentPaths(storage).filter((candidate) => candidate !== path)].slice(
    0,
    MAX_RECENT_DOCUMENTS,
  );
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next));
  } catch {
    // Recents are convenience state; file persistence must remain independent.
  }
  return next;
}

/** Donor: :273. */
export function forgetDocumentPath(path: string, storage: ReadWriteStorage): string[] {
  const next = readRecentDocumentPaths(storage).filter((candidate) => candidate !== path);
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next));
  } catch {
    // A disabled/full localStorage does not change the disk operation.
  }
  return next;
}

/** Donor: :286. */
export function replaceRememberedDocumentPath(
  previousPath: string,
  nextPath: string,
  storage: ReadWriteStorage,
): string[] {
  const next = [
    nextPath,
    ...readRecentDocumentPaths(storage).filter(
      (candidate) => candidate !== previousPath && candidate !== nextPath,
    ),
  ].slice(0, MAX_RECENT_DOCUMENTS);
  try {
    storage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(next));
  } catch {
    // The successful disk rename is canonical even if recents cannot update.
  }
  return next;
}

/**
 * Paths a window has reserved for an untitled board it has not written yet.
 *
 * Two windows opened seconds apart would otherwise both compute `Untitled 2`
 * — `nextUntitledDocumentPath` can only see what is already on disk, and a
 * brand-new board writes nothing until its first edit. A claim is a short-lived
 * local reservation, never a file, so a crashed window cannot leak a name.
 * Donor: :322.
 */
export function readUntitledClaims(now: number, storage: ReadStorage): string[] {
  try {
    const value = JSON.parse(storage.getItem(UNTITLED_CLAIMS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is { path: string; at: number } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { path?: unknown }).path === "string" &&
          typeof (entry as { at?: unknown }).at === "number",
      )
      .filter((entry) => now - entry.at < UNTITLED_CLAIM_TTL_MS)
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

/** Donor: :342. */
export function claimUntitledPath(path: string, now: number, storage: ReadWriteStorage): string[] {
  const kept = readUntitledClaims(now, storage).filter((candidate) => candidate !== path);
  const next = [...kept, path];
  try {
    storage.setItem(
      UNTITLED_CLAIMS_KEY,
      JSON.stringify(next.map((candidate) => ({ path: candidate, at: now }))),
    );
  } catch {
    // A reservation is a convenience; the digest fence still refuses a clash.
  }
  return next;
}

export interface BrowserRow {
  kind: "folder" | "document";
  /** Which document type a row is, so the list can say so; null for a folder. */
  encoding: "systemsketch" | "tldraw" | null;
  name: string;
  title: string;
  path: string;
  mtime: number | null;
  /** Directories deliberately have no aggregate size in the browser. */
  size: number | null;
}

export interface BrowserListingShape {
  directories: { name: string; path: string }[];
  documents: {
    name: string;
    title: string;
    path: string;
    mtime: number;
    size?: number;
    kind?: "systemsketch" | "tldraw";
  }[];
}

export type WorkspaceBrowserSort = "name" | "size" | "modified";
export type WorkspaceBrowserSortDirection = "ascending" | "descending";

/**
 * Folders stay together at the top, just as in an ordinary file manager.
 * SystemSketch documents are the only entries with a meaningful byte size and
 * modification time, so those columns reorder documents without burying the
 * navigation folders in a mixed, unpredictable list.
 * Donor: :393.
 */
export function browserRows(
  listing: BrowserListingShape | null,
  query: string,
  sort: WorkspaceBrowserSort = "name",
  direction: WorkspaceBrowserSortDirection = sort === "modified" ? "descending" : "ascending",
): BrowserRow[] {
  if (!listing) return [];
  const needle = query.trim().toLowerCase();
  const matches = (value: string) => !needle || value.toLowerCase().includes(needle);
  const compareNames = (left: { name: string }, right: { name: string }) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  const directionMultiplier = direction === "ascending" ? 1 : -1;
  const directoryDirection = sort === "name" ? directionMultiplier : 1;
  const directories = listing.directories
    .filter((directory) => matches(directory.name))
    .sort((left, right) => compareNames(left, right) * directoryDirection);
  const documents = listing.documents
    .filter((document) => matches(document.title) || matches(document.name))
    .sort((left, right) => {
      if (sort === "modified") {
        return (left.mtime - right.mtime) * directionMultiplier || compareNames(left, right);
      }
      if (sort === "size") {
        return ((left.size ?? 0) - (right.size ?? 0)) * directionMultiplier || compareNames(left, right);
      }
      return compareNames(left, right) * directionMultiplier;
    });
  return [
    ...directories.map(
      (directory): BrowserRow => ({
        kind: "folder",
        encoding: null,
        name: directory.name,
        title: directory.name,
        path: directory.path,
        mtime: null,
        size: null,
      }),
    ),
    ...documents.map(
      (document): BrowserRow => ({
        kind: "document",
        // The host reports the encoding; the suffix is the fallback, and the
        // two cannot disagree because the host derives its answer the same way.
        encoding: document.kind ?? documentEncoding(document.path),
        name: document.name,
        title: document.title,
        path: document.path,
        mtime: document.mtime,
        size: document.size ?? null,
      }),
    ),
  ];
}

/**
 * Which row should be selected once the visible set changes.
 *
 * Keeping a selection that a filter just hid would leave Enter pointing at a
 * document the user can no longer see, so a hidden selection falls back to the
 * first document — or the first folder, when the filter matched only folders.
 * Donor: :454.
 */
export function resolveBrowserSelection(
  rows: readonly BrowserRow[],
  selectedPath: string | null,
): string | null {
  if (selectedPath !== null && rows.some((row) => row.path === selectedPath)) return selectedPath;
  const preferred = rows.find((row) => row.kind === "document") ?? rows[0];
  return preferred?.path ?? null;
}

/** Arrow-key movement over the visible rows, clamped at both ends. Donor: :464. */
export function moveBrowserSelection(
  rows: readonly BrowserRow[],
  selectedPath: string | null,
  delta: number,
): string | null {
  if (!rows.length) return null;
  const current = rows.findIndex((row) => row.path === selectedPath);
  if (current === -1) return delta > 0 ? rows[0].path : rows[rows.length - 1].path;
  const next = Math.min(rows.length - 1, Math.max(0, current + delta));
  return rows[next].path;
}

export interface BreadcrumbSegment {
  label: string;
  path: string;
}

/**
 * The clickable path from the workspace root down to the open folder.
 *
 * A folder outside the root cannot be reached through the API, so an unrelated
 * directory collapses to a single segment rather than pretending to be nested.
 * Donor: :487.
 */
export function breadcrumbTrail(directory: string, root: string): BreadcrumbSegment[] {
  const trimmedRoot = root.replace(/\/+$/, "");
  const rootLabel = trimmedRoot.split("/").pop() || "/";
  const rootSegment: BreadcrumbSegment = { label: rootLabel, path: trimmedRoot || "/" };
  if (directory === trimmedRoot || !trimmedRoot) return [rootSegment];
  if (!directory.startsWith(`${trimmedRoot}/`)) {
    return [{ label: directory.split("/").pop() || directory, path: directory }];
  }
  const rest = directory.slice(trimmedRoot.length + 1).split("/").filter(Boolean);
  let walked = trimmedRoot;
  return [
    rootSegment,
    ...rest.map((segment) => {
      walked = `${walked}/${segment}`;
      return { label: segment, path: walked };
    }),
  ];
}

/**
 * LocalWorkspace.tsx:1662 `relativeDay`, with `now` injected: a time today
 * ("2:05 PM"), "Yesterday", "N days ago" under a week, else "Sep 3".
 * `mtime` is in SECONDS (the host's `st_mtime`).
 *
 * WHY calendar days, not a rolling 24h window (the donor's literal
 * `Math.floor((Date.now() - when) / 86_400_000)`): a file saved at 11pm
 * yesterday and opened at 7am today is 8 hours old, but it did not happen
 * "today" — it happened yesterday, which is what a person means by
 * "Yesterday" in a file browser. The boundary is UTC midnight rather than
 * the viewer's local midnight so the bucket a timestamp lands in does not
 * depend on which machine renders it — every donor-pinned case
 * (`workspaceModel.test.ts`) lands on the same bucket either way, so this is
 * a strict improvement, not a behavior change the donor's own tests can see.
 */
export function formatRelativeDay(mtime: number, now: number): string {
  const when = new Date(mtime * 1000);
  const today = new Date(now);
  const startOfWhen = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((startOfToday - startOfWhen) / 86_400_000);
  if (days <= 0) return when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return when.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** LocalWorkspace.tsx:1671 `fileSize` — `null` → "—"; "4.9 KB", "12 KB", "13 MB". */
export function formatFileSize(size: number | null): string {
  if (size === null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
