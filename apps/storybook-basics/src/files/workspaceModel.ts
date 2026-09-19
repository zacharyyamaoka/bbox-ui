// src/files/workspaceModel.ts — the navigator's and the document session's
// pure helpers: paths, titles, recents, untitled reservations, the browser's
// rows/sort/selection/breadcrumb, and the autosave schedule.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// every function THROWS until lane `files-kit` ports its body. Constants are
// the donor's, verbatim, and are the contract. `workspaceModel.test.ts` is the
// acceptance (a port of the donor's own suite) and is off-limits to the
// builder.
//
// Donor, read on disk: `/home/bam/systemsketch/src/workspace/
// workspaceModel.ts:1-504`, plus `relativeDay`/`fileSize` from
// `/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:1662-1688`. Port
// the bodies VERBATIM except the one deliberate change below. NOT ported:
// `encodeDocumentForPath` (the `.systemsketch` envelope — this app writes
// plain `.tldr`), `exportedTldrawPath`, `workspaceBrowserDirectory`,
// `sameFingerprint`/`nextSyncAction`/`canApplyExternalReload`/
// `removesDocumentBoundary` (the external-change watcher is not in this
// build — the digest fence still refuses to clobber, see the plan).
//
// THE ONE DELIBERATE CHANGE: the donor defaulted every NEW document to
// `.systemsketch`. This app's file format is a plain `.tldr` (the rebuild
// plan §8.3; `apps/systemsketch/src/chrome/fileActions.ts` header), so
// `documentPathFor` and `nextUntitledDocumentPath` default to
// `DEFAULT_NEW_DOCUMENT_SUFFIX` = `.tldr`. Everything else — both suffixes
// recognized, titles judged across both, a typed known suffix honoured — is
// unchanged.

export const SYSTEMSKETCH_SUFFIX = ".systemsketch";
export const TLDRAW_SUFFIX = ".tldr";
export const DOCUMENT_SUFFIXES = [SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX] as const;
export type DocumentSuffix = (typeof DOCUMENT_SUFFIXES)[number];
export const DEFAULT_NEW_DOCUMENT_SUFFIX: DocumentSuffix = TLDRAW_SUFFIX;
export const RECENT_DOCUMENTS_KEY = "systemsketch.recentDocuments.v1";
export const MAX_RECENT_DOCUMENTS = 12;
export const UNTITLED_CLAIMS_KEY = "systemsketch.untitledClaims.v1";
export const UNTITLED_CLAIM_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTOSAVE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const;

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented (lane files-kit)`);
};

/** donor :45 — the suffix `path` uses (case-insensitive, either separator), or null. */
export function documentSuffix(path: string): DocumentSuffix | null {
  void path;
  return todo("documentSuffix");
}

/** donor :53 */
export function documentEncoding(path: string): "systemsketch" | "tldraw" {
  void path;
  return todo("documentEncoding");
}

/** donor :64 */
export function documentTitle(path: string): string {
  void path;
  return todo("documentTitle");
}

/** donor :70 */
export function parentDirectory(path: string): string {
  void path;
  return todo("parentDirectory");
}

/** donor :115, default suffix changed to `.tldr` (header). */
export function documentPathFor(directory: string, rawName: string, fallbackSuffix: DocumentSuffix = DEFAULT_NEW_DOCUMENT_SUFFIX): string | null {
  void directory;
  void rawName;
  void fallbackSuffix;
  return todo("documentPathFor");
}

/** donor :130 — rename keeps the document's type. */
export function renamedDocumentPath(path: string, rawName: string): string | null {
  void path;
  void rawName;
  return todo("renamedDocumentPath");
}

/** donor :143, plus a `suffix` parameter defaulting to `.tldr` (header). */
export function nextUntitledDocumentPath(directory: string, existingPaths: readonly string[], suffix: DocumentSuffix = DEFAULT_NEW_DOCUMENT_SUFFIX): string {
  void directory;
  void existingPaths;
  void suffix;
  return todo("nextUntitledDocumentPath");
}

/** donor :154 — `?board=<path>` on `base`'s path, every other query param
 *  dropped. `base` is injected (the donor read `window.location.href`) so a
 *  node test can call it. */
export function documentHref(path: string, base: string): string {
  void path;
  void base;
  return todo("documentHref");
}

/** donor :181 */
export function autosaveRetryDelay(failedAttempts: number, options: { conflict?: boolean; force?: boolean } = {}): number | null {
  void failedAttempts;
  void options;
  return todo("autosaveRetryDelay");
}

export interface AutosaveSchedule {
  /** The first edit in the still-unpersisted burst. */
  pendingSince: number;
  /** Delay from `now` until the next save attempt. */
  delayMs: number;
}

/** donor :198 */
export function autosaveSchedule(now: number, pendingSince: number | null, debounceMs: number, maxDelayMs: number): AutosaveSchedule {
  void now;
  void pendingSince;
  void debounceMs;
  void maxDelayMs;
  return todo("autosaveSchedule");
}

type ReadStorage = Pick<Storage, "getItem">;
type ReadWriteStorage = Pick<Storage, "getItem" | "setItem">;

/** donor :246 — `storage` is REQUIRED here (the donor defaulted to
 *  `window.localStorage`, which a node test cannot have). */
export function readRecentDocumentPaths(storage: ReadStorage): string[] {
  void storage;
  return todo("readRecentDocumentPaths");
}

/** donor :259 */
export function rememberDocumentPath(path: string, storage: ReadWriteStorage): string[] {
  void path;
  void storage;
  return todo("rememberDocumentPath");
}

/** donor :273 */
export function forgetDocumentPath(path: string, storage: ReadWriteStorage): string[] {
  void path;
  void storage;
  return todo("forgetDocumentPath");
}

/** donor :286 */
export function replaceRememberedDocumentPath(previousPath: string, nextPath: string, storage: ReadWriteStorage): string[] {
  void previousPath;
  void nextPath;
  void storage;
  return todo("replaceRememberedDocumentPath");
}

/** donor :322 */
export function readUntitledClaims(now: number, storage: ReadStorage): string[] {
  void now;
  void storage;
  return todo("readUntitledClaims");
}

/** donor :342 */
export function claimUntitledPath(path: string, now: number, storage: ReadWriteStorage): string[] {
  void path;
  void now;
  void storage;
  return todo("claimUntitledPath");
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

/** donor :393 — folders first, then documents, filtered and sorted. */
export function browserRows(
  listing: BrowserListingShape | null,
  query: string,
  sort: WorkspaceBrowserSort = "name",
  direction: WorkspaceBrowserSortDirection = sort === "modified" ? "descending" : "ascending",
): BrowserRow[] {
  void listing;
  void query;
  void sort;
  void direction;
  return todo("browserRows");
}

/** donor :454 */
export function resolveBrowserSelection(rows: readonly BrowserRow[], selectedPath: string | null): string | null {
  void rows;
  void selectedPath;
  return todo("resolveBrowserSelection");
}

/** donor :464 */
export function moveBrowserSelection(rows: readonly BrowserRow[], selectedPath: string | null, delta: number): string | null {
  void rows;
  void selectedPath;
  void delta;
  return todo("moveBrowserSelection");
}

export interface BreadcrumbSegment {
  label: string;
  path: string;
}

/** donor :487 */
export function breadcrumbTrail(directory: string, root: string): BreadcrumbSegment[] {
  void directory;
  void root;
  return todo("breadcrumbTrail");
}

/** LocalWorkspace.tsx:1662 `relativeDay`, with `now` injected: a time today
 *  ("2:05 PM"), "Yesterday", "N days ago" under a week, else "Sep 3".
 *  `mtime` is in SECONDS (the host's `st_mtime`). */
export function formatRelativeDay(mtime: number, now: number): string {
  void mtime;
  void now;
  return todo("formatRelativeDay");
}

/** LocalWorkspace.tsx:1671 `fileSize` — `null` → "—"; "4.9 KB", "12 KB", "13 MB". */
export function formatFileSize(size: number | null): string {
  void size;
  return todo("formatFileSize");
}
