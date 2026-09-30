// src/files/launchConfig.ts — the two facts about THIS window the document
// session must not read from globals directly: where the file host is, and
// the address bar.
//
// CONTRACT committed (and implemented — it is ~60 lines of seam, not
// behaviour) by the planning lane, docs/CHROME-FILES-SETTINGS-PLAN.md. Lane
// `app-wiring` imports it; the smoke tests install their own values through
// the setters. Off-limits to builders, like src/testing/harness.tsx, because
// the acceptance tests stand on it.
//
// WHY an adapter over `window.location` and `window.open` rather than calling
// them: the donor's document session navigated the WINDOW on Open and New
// (`/home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:686-733`,
// `window.location.assign(documentHref(path))`), and a smoke test runs inside
// Vitest's own iframe — one real `assign` and the test runner itself is gone.
// With the adapter, production keeps the donor's exact navigation ("the URL
// is the document": `?board=/abs/path.tldr`) and a test records it instead,
// then remounts the app on the recorded board to prove the reopen.
//
// WHY the file host's origin is configurable at all: production is same
// origin (the dock's Stable server mounts `/api/workspace/*`; the vite dev
// server proxies it), so the default is `""`. The smoke tests run a real host
// over a TEMP root on an ephemeral port — cross-origin — and must never be
// able to reach one serving `/home/bam/SystemSketch`.

/** A second window, taken synchronously inside the gesture that asked for it
 *  and pointed at a board later — "a popup opened after an awaited round trip
 *  is the one Chrome blocks" (donor LocalWorkspace.tsx:713-716). */
export interface WindowTarget {
  navigate(url: string): void;
  close(): void;
}

export interface DocumentLocation {
  /** The board this window was opened on (`?board=<abs path>`), or null. */
  initialBoard(): string | null;
  /** Put `path` in the address bar WITHOUT reloading (Save As, Rename on a
   *  file-backed board); `null` drops `?board=`. */
  replaceBoard(path: string | null): void;
  /** Leave this page for `url` (Open/New from a scratch board; a
   *  `.systemsketch` handed to the archived app — `.bbox` and `.tldr` open
   *  in this one). */
  assign(url: string): void;
  /** Open a new window NOW; `null` when the browser refused (pop-up blocked). */
  openWindow(): WindowTarget | null;
  /** The URL that opens `path` in this app: `?board=<path>` on this page. */
  boardHref(path: string): string;
  /** The URL of a fresh window with a blank, never-persisted board. */
  freshHref(): string;
}

/** `?fresh=1` — a window with no board and no IndexedDB persistence, so two
 *  windows never share (and live-sync) one scratch store. */
export const FRESH_PARAM = "fresh";
export const BOARD_PARAM = "board";

function hrefWith(search: URLSearchParams): string {
  const query = search.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

/**
 * A real second OS window, not a tab — donor `newWindowFeatures`
 * (LocalWorkspace.tsx:189-200), verbatim: `popup` is what makes Chrome open a
 * separate window, and the dock runs in `--app` mode where that window
 * inherits the same chromeless frame.
 */
function newWindowFeatures(): string {
  const width = Math.max(900, Math.round((window.outerWidth || 1440) * 0.92));
  const height = Math.max(640, Math.round((window.outerHeight || 900) * 0.92));
  return ["popup=yes", "noopener=no", `width=${width}`, `height=${height}`, `left=${(window.screenX || 0) + 48}`, `top=${(window.screenY || 0) + 48}`].join(",");
}

export const browserDocumentLocation: DocumentLocation = {
  initialBoard() {
    const value = new URLSearchParams(window.location.search).get(BOARD_PARAM)?.trim();
    return value ? value : null;
  },
  replaceBoard(path) {
    const search = new URLSearchParams(window.location.search);
    search.delete(FRESH_PARAM);
    if (path === null) search.delete(BOARD_PARAM);
    else search.set(BOARD_PARAM, path);
    window.history.replaceState(window.history.state, "", hrefWith(search));
  },
  assign(url) {
    window.location.assign(url);
  },
  openWindow() {
    const handle = window.open("", "_blank", newWindowFeatures());
    if (!handle) return null;
    return {
      navigate(url) {
        handle.location.replace(new URL(url, window.location.href).toString());
        handle.focus();
      },
      close() {
        handle.close();
      },
    };
  },
  boardHref(path) {
    const search = new URLSearchParams();
    search.set(BOARD_PARAM, path);
    return hrefWith(search);
  },
  freshHref() {
    const search = new URLSearchParams();
    search.set(FRESH_PARAM, "1");
    return hrefWith(search);
  },
};

/**
 * The absolute link a HUMAN is handed — `http://127.0.0.1:4340/?board=/abs/path.tldr`
 * — as opposed to `boardHref`, the relative href the app navigates ITSELF
 * with. Same value space, two renderings: `URLSearchParams.set` (what
 * `boardHref` uses) escapes every `/` to `%2F`, which opens fine but is
 * unreadable in a handoff; this keeps the `=` and every `/` literal and
 * escapes only `# & + %`, the four characters that would end the query,
 * split it, turn into a space, or be read as an escape. A literal `/` is
 * legal in a query (RFC 3986 §3.4), so `URLSearchParams` on the receiving
 * side (`initialBoard`, `persistenceKeyForSearch`) reads it back unchanged —
 * `launchConfig.test.ts` pins that both spellings parse to the same path.
 *
 * Ported from claude/board-url-2026-09-20 (`boardParam.ts` `boardLinkFor`,
 * `869eb22`) WITHOUT that branch's second boot path: this app already
 * opens `?board=` here, through the real file host. The review-board
 * generator (`skills/bbox-review-board/scripts/create_review_board.mjs`)
 * imports THIS function through the dev server, so there is one builder,
 * not a copy kept "in step". WHY here and not in the trunk: it spells THIS
 * app's launch contract (`BOARD_PARAM`, read by `initialBoard` above); the
 * trunk's `documentHref` (`@trunk/files/workspaceModel`) stays the in-app
 * builder, and the test parses all three renderings back to one path.
 *
 * WHY it exists (Zach, 2026-09-19, rating a handoff that made him open the
 * board by hand Bad): "you should make it so I can open this file
 * directly." And WHY never a markdown `[text](url)` link around it: a chat
 * client escapes the `=` to `%3D`, `URLSearchParams` then reads one key
 * named `board=/abs/path` and there is no `board` param at all.
 */
export function boardLinkFor(path: string, origin: string): string {
  const literal = path.replace(/[#&+%]/g, (character) => encodeURIComponent(character));
  return `${origin.replace(/\/+$/, "")}/?${BOARD_PARAM}=${literal}`;
}

/**
 * What `main.tsx` passes as `<App persistenceKey>`: a file-backed or fresh
 * window persists NOTHING to IndexedDB (the file on disk is the persistence,
 * or there is none yet); a plain launch keeps the app's own scratch board
 * (`undefined` → App's default key), exactly as before this build.
 */
export function persistenceKeyForSearch(search: string): null | undefined {
  const query = new URLSearchParams(search);
  return query.get(BOARD_PARAM)?.trim() || query.has(FRESH_PARAM) ? null : undefined;
}

let fileHostOrigin = "";
let documentLocationImpl: DocumentLocation = browserDocumentLocation;

/** `""` = same origin (production). */
export function fileHostBaseUrl(): string {
  return fileHostOrigin;
}

export function setFileHostBaseUrl(url: string): void {
  fileHostOrigin = url.replace(/\/+$/, "");
}

export function documentLocation(): DocumentLocation {
  return documentLocationImpl;
}

export function setDocumentLocation(next: DocumentLocation): void {
  documentLocationImpl = next;
}

/** Back to production values — a smoke test's `afterEach`. */
export function resetLaunchConfig(): void {
  fileHostOrigin = "";
  documentLocationImpl = browserDocumentLocation;
}

/** A `DocumentLocation` that records instead of navigating — for tests. */
export interface MemoryDocumentLocation extends DocumentLocation {
  /** The board this window would now show: its `initialBoard`, then the last
   *  `replaceBoard`, or the `?board=` of the last `assign`. */
  readonly board: string | null;
  /** Every `assign(url)`, in order. */
  readonly assigned: readonly string[];
  /** Every `openWindow()` and where each was pointed (null until pointed). */
  readonly windows: readonly { url: string | null; closed: boolean }[];
}

export function memoryDocumentLocation(options: { initialBoard?: string | null; popupsBlocked?: boolean } = {}): MemoryDocumentLocation {
  let board: string | null = options.initialBoard ?? null;
  const assigned: string[] = [];
  const windows: { url: string | null; closed: boolean }[] = [];
  const base = "http://systemsketch.test/";
  return {
    get board() {
      return board;
    },
    get assigned() {
      return assigned;
    },
    get windows() {
      return windows;
    },
    initialBoard: () => options.initialBoard ?? null,
    replaceBoard(path) {
      board = path;
    },
    assign(url) {
      assigned.push(url);
      const target = new URL(url, base).searchParams.get(BOARD_PARAM);
      if (target) board = target;
    },
    openWindow() {
      if (options.popupsBlocked) return null;
      const record = { url: null as string | null, closed: false };
      windows.push(record);
      return {
        navigate(url) {
          record.url = url;
        },
        close() {
          record.closed = true;
        },
      };
    },
    boardHref: (path) => `/?${BOARD_PARAM}=${encodeURIComponent(path)}`,
    freshHref: () => `/?${FRESH_PARAM}=1`,
  };
}
