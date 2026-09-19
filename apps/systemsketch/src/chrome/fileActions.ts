// src/chrome/fileActions.ts — the ONE place this app turns a board into bytes
// and back.
//
// A plain `.tldr` is the file format (plan §8.3): our shapes' props ARE the
// document, so tldraw's own serializer round-trips a board with zero backend.
// The archive's `.systemsketch` envelope is deliberately not ported — a
// `.systemsketch` row in the navigator hands off to the archived app instead
// (`src/files/session.tsx`).
//
// WHY this file no longer BUILDS any menu (it used to export `fileActionsFor`,
// three rows: New board / Open .tldr… / Save .tldr…): Zach, 2026-09-19 — "all
// of the feedback regarding the chrome should be made in bbox-ui
// editor-components, not in system sketch". The burger's shape and order now
// come from `@trunk/components/appMenu`'s `buildAppMenu`/`FILE_MENU_ROWS`, and
// the app only says which rows it can honour and what each one runs
// (`src/files/session.tsx`). What is left here is the format seam — bytes in,
// bytes out — which is genuinely the app's, not the menu kit's.
//
// WHY it still holds no JSX: `src/menus.smoke.test.tsx` imports
// `serializeBoard` directly as "a pure function of the editor", with nothing
// mounted. A `.ts` file keeps that import cheap.
import {
  TLDRAW_FILE_EXTENSION,
  parseTldrawJsonFile,
  serializeTldrawJson,
  serializeTldrawJsonBlob,
  type Editor,
  type TLUiToastsContextType,
} from "tldraw";

/**
 * The two host services a file action needs and this module refuses to own.
 *
 * WHY they arrive as callbacks instead of this file calling `useToasts()` /
 * `useDialogs()` itself: those are React hooks, and every function here is a
 * plain async function a test (or a keyboard shortcut, or a later command
 * palette) can call with no component mounted. `src/chrome/chromeBar.tsx` is
 * the one place that reads the hooks and closes over them — the same
 * "confirm dialogs and toasts are host's" split
 * docs/menus/MENU-KIT-DESIGN.md §4 draws for the chrome bar itself.
 */
export interface FileActionHelpers {
  addToast: TLUiToastsContextType["addToast"];
  /** Resolves `true` only if the person said yes. */
  confirm(prompt: { title: string; body: string; confirmLabel: string }): Promise<boolean>;
}

/** The download name, minus the extension, when the board has no usable one. */
export const DEFAULT_BOARD_FILE_NAME = "board";

/** A board name, made safe to be a file name. Characters a filesystem
 *  refuses become `-` rather than disappearing, so the name stays
 *  recognisable instead of silently losing a word. */
export function fileNameFor(boardName: string | undefined): string {
  const cleaned = (boardName ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_BOARD_FILE_NAME;
}

/**
 * The board as `.tldr` text. Pure in the only sense that matters here: it
 * reads the editor and writes nothing.
 *
 * Exported on its own (not just as a menu row's `run`) because it is the seam
 * the acceptance measures — "the serializer the file commands use is still
 * exposed as a pure function of the editor" (src/menus.smoke.test.tsx, and
 * `boardWith()` in src/files.smoke.test.tsx builds every fixture through it).
 * One function, one behaviour, no second path.
 */
export function serializeBoard(editor: Editor): Promise<string> {
  return serializeTldrawJson(editor);
}

/** Hand the browser a `.tldr` download of the current board. Kept for the
 *  "Export to tldraw…" row a host that is NOT file-backed would want; this
 *  app's own file already IS a `.tldr`, so it passes no `exportCopy`
 *  callback and the row is absent (`appMenu.ts`'s `FILE_MENU_ROWS`). */
export async function downloadBoard(editor: Editor, name: string = DEFAULT_BOARD_FILE_NAME): Promise<void> {
  const blob = await serializeTldrawJsonBlob(editor);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}${TLDRAW_FILE_EXTENSION}`;
    link.rel = "noopener";
    // Appended rather than clicked detached: Firefox ignores a click on an
    // anchor that is not in the document, and this costs one frame.
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked on the next task, not synchronously: revoking before the
    // browser has started reading the object URL cancels the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** What `loadBoardText` answers. A failure names WHY in a sentence a person
 *  can act on, and — the part that matters — leaves the editor untouched. */
export type BoardLoadResult = { ok: true } | { ok: false; reason: string };

/**
 * Load `.tldr` text over the current board.
 *
 * WHY this is hand-assembled rather than tldraw's own `parseAndLoadDocument`,
 * which is what the lane brief named: that helper is marked "Excluded from
 * this release type" in tldraw 5.3.2's public entry
 * (`tldraw/dist-cjs/index.d.ts:3164`), so importing it fails `tsc` — and
 * reaching past the public entry is exactly what
 * `src/document/stockBoundary.test.ts` forbids.
 *
 * So the body below is a deliberate re-implementation of
 * `tldraw/dist-esm/lib/utils/tldr/file.mjs:201-209`, and it is NOT enough to
 * parse and `loadSnapshot` — the three lines around that swap are the ones a
 * person notices:
 *
 *   - `editor.clearHistory()`, because `Store.loadStoreSnapshot` runs its
 *     `clear()` + `put()` through `atomic(fn, false)` with
 *     `isMergingRemoteChanges` false (Store.mjs:476-480, :265), so the whole
 *     document swap is recorded as a **user** history entry. Without this,
 *     Ctrl+Z immediately after opening a file silently brings the PREVIOUS
 *     board back — measured through this very function before the line
 *     existed: `getCanUndo()` true, `undo()` restored the old shapes.
 *   - `editor.zoomToBounds(...)`, because a saved board's content can sit
 *     anywhere in page space while the camera is wherever the last board left
 *     it. Measured the same way: opening a board whose only block sits at page
 *     (5000, 5000) left the camera at {0,0,1} and the viewport nowhere near
 *     the shape — "Open…" looked like it did nothing.
 *   - one `editor.run`, so the swap, the history reset and the camera move
 *     land in a single transaction the way tldraw's own `transact` does.
 *
 * WHY it returns a result instead of raising a toast itself (changed
 * 2026-09-19): a file this build cannot read must ALSO be fenced off from
 * being written back over — `src/files.smoke.test.tsx` writes a `.tldr`
 * carrying the archived app's own `block` shape and requires the bytes on
 * disk to be byte-identical after a Ctrl+S. The document session needs the
 * failure as a VALUE it can hold (`readable: false`), not as a toast that has
 * already been shown and forgotten.
 *
 * Two things from tldraw's helper are deliberately NOT ported: its localized
 * toast copy (`msg(...)`, which needs the UI translation context) and
 * `extractAssets`, which rehydrates `data:` image/video assets. This app's
 * vocabulary is the five `ss-*` shapes and none of them carries an asset, so
 * there is nothing for it to extract.
 */
export function loadBoardText(editor: Editor, text: string): BoardLoadResult {
  let parsed: ReturnType<typeof parseTldrawJsonFile>;
  try {
    parsed = parseTldrawJsonFile({ json: text, schema: editor.store.schema });
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
  if (!parsed.ok) {
    // The parse error's own discriminant, verbatim — a person who picked the
    // wrong file and a person whose file is from a newer SystemSketch need to
    // be able to tell those apart.
    return { ok: false, reason: `${TLDRAW_FILE_EXTENSION} parse failed: ${parsed.error.type}` };
  }
  const snapshot = parsed.value.getStoreSnapshot();
  editor.run(() => {
    editor.loadSnapshot(snapshot);
    // Ordered exactly as file.mjs orders it: the snapshot's own diff has
    // already reached the history recorder synchronously by now
    // (HistoryAccumulator.add calls its interceptors inline, Store.mjs:860),
    // so clearing here really does discard it.
    editor.clearHistory();
    const bounds = editor.getCurrentPageBounds();
    // `immediate` because this is a document swap, not a navigation — an
    // animated fly-in from the previous board's camera is motion that means
    // nothing. Stock passes the same two options.
    if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, immediate: true });
  });
  return { ok: true };
}

/**
 * Empty the current page.
 *
 * WHY one `editor.run`: the delete has to undo as ONE step, the same reason
 * `shapes/wire/createWire.ts` wraps its shape and both bindings in one.
 */
export function clearBoard(editor: Editor): void {
  editor.run(() => {
    editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
  });
}
