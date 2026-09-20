// src/review/boardParam.ts — `?board=<same-origin url>` opens that .tldr on boot.
//
// A retained review server (scripts/review_runtime.py) serves the built app at
// `/?board=/__review/board.tldr`; the APP has to open that board itself, or the
// person is handed a blank canvas and has to rebuild the change by hand — the
// failure docs/REVIEW-BOARDS-PLAN.md exists to end. Contract 3 there is this
// file. Wired only from main.tsx; App.tsx does not know it exists.
import { parseTldrawJsonFile, type Editor } from "tldraw";

export type BoardUrl = { ok: true; url: string } | { ok: false; reason: string };
export type BoardLoadResult = { ok: true; shapeCount: number } | { ok: false; reason: string };

export interface BootOptions {
  /** `null` → the app mounts with no persistence at all; `undefined` → the app's own default. */
  persistenceKey: null | undefined;
  /** `null` when the URL has no `board` param. */
  board: BoardUrl | null;
}

/**
 * The board URL named by `search`, or `null` when there is no `board` param.
 *
 * WHY same-origin only: the value comes from a link someone was handed, and the
 * page is about to `fetch` it and feed the body to the document loader. A
 * cross-origin URL would let any link make this app pull arbitrary bytes into a
 * tldraw store, so it is refused with a visible reason instead of fetched.
 * `//host/x` is refused explicitly (it is a path-looking cross-origin URL), as
 * is `/\host`, which browsers normalise to `//host`.
 *
 * The value is read literally as `URLSearchParams` gives it: the literal
 * `?board=/__review/board.tldr` is the form that is handed out, and `%2F` is
 * accepted only because URLSearchParams decodes it for free.
 */
export function boardUrlFromSearch(search: string, origin: string): BoardUrl | null {
  const params = new URLSearchParams(search);
  if (!params.has("board")) return null;
  const value = params.get("board") ?? "";
  if (value.trim() === "") return { ok: false, reason: "the board parameter is empty" };
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return { ok: false, reason: "a protocol-relative board URL points at another origin" };
  }
  let resolved: URL;
  try {
    // A leading "/" resolves against this origin; anything else must be absolute.
    resolved = value.startsWith("/") ? new URL(value, origin) : new URL(value);
  } catch {
    return { ok: false, reason: "the board parameter is not a same-origin path or URL" };
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return { ok: false, reason: `the ${resolved.protocol} scheme cannot be a board` };
  }
  if (resolved.origin !== origin) {
    return { ok: false, reason: `${resolved.origin} is not this app's origin (${origin}); only same-origin boards are opened` };
  }
  return { ok: true, url: resolved.href };
}

/**
 * What main.tsx mounts the app with.
 *
 * WHY `persistenceKey: null` while `?board=` is present — valid OR invalid: a
 * review board is disposable. Reload resets it, and nothing done to it is ever
 * written into the IndexedDB board a person actually works in. Invalid counts
 * too, so a mistyped link cannot leave a blank canvas that then autosaves over
 * a real board.
 */
export function bootOptionsFor(search: string, origin: string): BootOptions {
  const board = boardUrlFromSearch(search, origin);
  return { persistenceKey: board === null ? undefined : null, board };
}

/**
 * Fetch `url`, parse it as a `.tldr` and swap it in for the current board.
 *
 * WHY the swap is duplicated from `chrome/fileActions.ts`'s `openBoard` rather
 * than imported: that file is being rewritten on
 * `claude/chrome-files-settings-2026-09-19`, and importing it would couple two
 * in-flight branches. Every step is deliberate and measured there (see the doc
 * comment on `openBoard`): `clearHistory` so Ctrl+Z cannot resurrect the
 * previous board, `zoomToBounds` with `immediate` so the viewport lands on the
 * content, one `editor.run` so it is a single transaction.
 * // owed: converge with openBoard once chrome-files-settings lands
 */
export async function loadBoardFromUrl(editor: Editor, url: string): Promise<BoardLoadResult> {
  let text: string;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status} ${response.statusText}`.trim() };
    text = await response.text();
  } catch (cause) {
    return { ok: false, reason: `fetch failed: ${cause instanceof Error ? cause.message : String(cause)}` };
  }
  const parsed = parseTldrawJsonFile({ json: text, schema: editor.store.schema });
  if (!parsed.ok) return { ok: false, reason: `.tldr parse failed: ${parsed.error.type}` };
  const snapshot = parsed.value.getStoreSnapshot();
  // WHY refuse BEFORE the swap rather than banner after it: a blank board must not replace
  // whatever the editor is showing — the swap also clears undo history, so it cannot be
  // taken back. It is counted over every page (not just the current one): a page switch is a
  // person's call, but a board with no shapes anywhere is never something they meant to open.
  const hasShapes = Object.values(snapshot.store).some((record) => record.typeName === "shape");
  if (!hasShapes) return { ok: false, reason: "it loaded but contains no shapes, so the canvas would be blank" };
  editor.run(() => {
    editor.loadSnapshot(snapshot);
    editor.clearHistory();
    const bounds = editor.getCurrentPageBounds();
    if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, immediate: true });
  });
  return { ok: true, shapeCount: editor.getCurrentPageShapeIds().size };
}

/**
 * A visible banner saying the board did not open.
 *
 * WHY plain DOM on `document.body`: this runs from `onEditorReady`, outside the
 * React tree, so tldraw's toast hooks are out of reach — and a silent blank
 * canvas is precisely the failure this whole seam exists to end. There is no
 * close button on purpose: it stays until the page is reloaded, so it cannot be
 * dismissed by a stray click before it is read. `light-dark()` keeps it legible
 * in both colour schemes without a stylesheet.
 */
export function showBoardLoadError(message: string): void {
  document.querySelector('[data-testid="board-load-error"]')?.remove();
  const banner = document.createElement("div");
  banner.setAttribute("data-testid", "board-load-error");
  banner.setAttribute("role", "alert");
  banner.style.cssText = [
    "position:fixed",
    "left:50%",
    "top:16px",
    "transform:translateX(-50%)",
    "z-index:2147483000",
    "max-width:min(720px,calc(100vw - 32px))",
    "padding:12px 16px",
    "border-radius:8px",
    "border:1px solid light-dark(#c0392b,#ff8a80)",
    "color-scheme:light dark",
    "background:light-dark(#fdecea,#3b1516)",
    "color:light-dark(#5a1010,#ffd9d6)",
    "font:14px/1.4 system-ui,sans-serif",
    "overflow-wrap:anywhere",
    "box-shadow:0 4px 16px rgba(0,0,0,.25)",
  ].join(";");
  banner.textContent = message;
  document.body.appendChild(banner);
}

/**
 * main.tsx's one call: open the board named by the URL, or say why not.
 * Resolves once the outcome (loaded or banner shown) is settled.
 */
export async function openBoardFromBoot(editor: Editor, board: BoardUrl | null, search: string = window.location.search): Promise<void> {
  if (board === null) return;
  if (!board.ok) {
    // The raw value is what the person typed, so it is what they need to see.
    const raw = new URLSearchParams(search).get("board") ?? "";
    showBoardLoadError(`Could not open the board "${raw}": ${board.reason}`);
    return;
  }
  const loaded = await loadBoardFromUrl(editor, board.url);
  if (!loaded.ok) showBoardLoadError(`Could not open the board ${board.url}: ${loaded.reason}`);
}
