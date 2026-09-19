// src/chrome/fileActions.ts — the file group of the chrome bar's burger, and
// the ONE place this app turns a board into bytes and back.
//
// A plain `.tldr` is the file format (plan §8.3): our shapes' props ARE the
// document, so tldraw's own serializer round-trips a board with zero backend.
// The archive's `.systemsketch` envelope is deliberately not ported.
//
// WHY this file holds no JSX even though every action carries an icon: a
// `MenuAction.icon` is a `ReactNode`, which `createElement` produces from a
// `.ts` file just as well — and keeping the file-format code out of a
// component file is what lets `src/menus.smoke.test.tsx` import
// `serializeBoard` directly as "a pure function of the editor" without
// mounting anything.
import { createElement } from "react";
import { FilePlus2, FolderOpen, Save } from "lucide-react";
import {
  TLDRAW_FILE_EXTENSION,
  parseTldrawJsonFile,
  serializeTldrawJson,
  serializeTldrawJsonBlob,
  type Editor,
  type TLUiToastsContextType,
} from "tldraw";

import type { MenuAction } from "@trunk/components/chromeBar";

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
  /** What the board is called right now, used as the download's file name.
   *  Host data because the name is the chrome bar's state — the document
   *  model has no field for it (see `chromeBar.tsx`'s `DEFAULT_BOARD_NAME`). */
  boardName?: string;
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
 * Exported on its own (not just as the burger row's `run`) because it is the
 * seam the acceptance test measures — "the serializer the burger uses is
 * exposed for tests as a pure function of the editor"
 * (src/menus.smoke.test.tsx). One function, one behaviour, no second path.
 */
export function serializeBoard(editor: Editor): Promise<string> {
  return serializeTldrawJson(editor);
}

/** Hand the browser a `.tldr` download of the current board. */
export async function saveBoard(editor: Editor, name: string = DEFAULT_BOARD_FILE_NAME): Promise<void> {
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

/** Ask for a `.tldr`, and resolve its text — or `null` if nothing was picked. */
function pickTldrawFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = TLDRAW_FILE_EXTENSION;
    input.style.display = "none";
    document.body.appendChild(input);
    const finish = (value: string | null) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        void file.text().then(finish, () => finish(null));
      },
      { once: true },
    );
    // WHY `cancel` is listened for at all: without it a dismissed picker
    // leaves this promise pending forever and the hidden input in the DOM.
    // It is Chromium/Firefox-only, so `change` above still has to be the one
    // that actually resolves the happy path.
    input.addEventListener("cancel", () => finish(null), { once: true });
    input.click();
  });
}

/**
 * Load a `.tldr` over the current board.
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
 *     the shape — "Open .tldr…" looked like it did nothing. With
 *     `NavigationPanel` switched off (App.tsx) there is no stock zoom menu
 *     left to recover with, only the chrome bar's home button.
 *   - one `editor.run`, so the swap, the history reset and the camera move
 *     land in a single transaction the way tldraw's own `transact` does.
 *
 * Two things from that helper are deliberately NOT ported: its localized toast
 * copy (`msg(...)`, which needs the UI translation context — the failure
 * branch below writes its own instead) and `extractAssets`, which rehydrates
 * `data:` image/video assets. This app's vocabulary is the five `ss-*` shapes
 * and none of them carries an asset, so there is nothing for it to extract.
 */
export async function openBoard(editor: Editor, helpers: FileActionHelpers): Promise<void> {
  const text = await pickTldrawFile();
  if (text === null) return;
  const parsed = parseTldrawJsonFile({ json: text, schema: editor.store.schema });
  if (!parsed.ok) {
    helpers.addToast({
      severity: "error",
      title: "Could not open that file",
      // The parse error's own discriminant, verbatim — a person who picked
      // the wrong file and a person whose file is from a newer SystemSketch
      // need to be able to tell those apart.
      description: `${TLDRAW_FILE_EXTENSION} parse failed: ${parsed.error.type}`,
    });
    return;
  }
  editor.run(() => {
    editor.loadSnapshot(parsed.value.getStoreSnapshot());
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
}

/**
 * Empty the current page.
 *
 * WHY a confirm only when the page is non-empty: "New board" on an empty
 * board is a no-op, and a modal that guards a no-op teaches people to dismiss
 * modals without reading them. WHY one `editor.run`: the delete has to undo
 * as ONE step, the same reason `shapes/wire/createWire.ts` wraps its shape
 * and both bindings in one.
 */
export async function newBoard(editor: Editor, helpers: FileActionHelpers): Promise<void> {
  if (editor.getCurrentPageShapeIds().size > 0) {
    const confirmed = await helpers.confirm({
      title: "New board",
      body: "This clears every shape on the page. It can be undone with Ctrl+Z.",
      confirmLabel: "Clear the board",
    });
    if (!confirmed) return;
  }
  editor.run(() => {
    editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
  });
}

/**
 * The file group, as `MenuAction[]`.
 *
 * It feeds BOTH the burger and the file title's dropdown/context menu — the
 * chrome bar takes one list for both on purpose ("one list so the two cannot
 * drift", chromeBar.tsx's `fileActions` doc), so this function is called once
 * per render and its result passed twice.
 *
 * No `shortcut` on any row: this app wires no keybinding for these yet, and
 * the kit renders `shortcut` as a literal hint. A hint for a key that does
 * nothing is the kind of lie docs/menus/MENU-KIT-DESIGN.md §4 calls out
 * ("actual keybindings... this split is documented so they cannot silently
 * drift").
 */
export function fileActionsFor(editor: Editor, helpers: FileActionHelpers): MenuAction[] {
  return [
    {
      id: "new",
      label: "New board",
      icon: createElement(FilePlus2),
      run: () => {
        void newBoard(editor, helpers);
      },
    },
    {
      id: "open",
      label: `Open ${TLDRAW_FILE_EXTENSION}…`,
      icon: createElement(FolderOpen),
      run: () => {
        void openBoard(editor, helpers);
      },
    },
    {
      id: "save",
      label: `Save ${TLDRAW_FILE_EXTENSION}…`,
      icon: createElement(Save),
      run: () => {
        void saveBoard(editor, fileNameFor(helpers.boardName));
      },
    },
  ];
}
