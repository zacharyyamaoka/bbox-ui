import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "tldraw";

import { App } from "./App";
import { persistenceKeyForSearch } from "./files/launchConfig";

const root = document.getElementById("root");
if (!root) throw new Error("no #root in index.html");

/**
 * WHY the dev-only handle: the app keeps no global state, so in a browser there
 * is otherwise NO way to reach the editor — not from the console, not from a
 * driver script. tldraw's own docs suggest exactly this (`onMount={(editor) =>
 * { window.editor = editor }}`), the committed smoke harness reaches the
 * editor through this same `onEditorReady` prop, and `import.meta.env.DEV`
 * keeps it out of a production bundle.
 */
function rememberForConsole(editor: Editor) {
  if (import.meta.env.DEV) (window as unknown as { editor: Editor }).editor = editor;
}

/**
 * WHY the persistence key is decided from the ADDRESS BAR (added 2026-09-19
 * with real files): a window opened on `?board=<path>` is backed by that file
 * — the bytes on disk are the persistence — and a `?fresh=1` window
 * (File ▸ New window) is deliberately empty. Both pass `null`, so neither
 * shares tldraw's IndexedDB document with the plain scratch launch. Without
 * this, two windows would live-sync one IndexedDB store and the second window
 * would open holding the first one's board.
 *
 * WHY this file boots `files/launchConfig` and NOT `review/boardParam` (the
 * merge conflict this branch had to settle — work order Z4, 2026-09-20): both
 * branches grew a `?board=` and they compute the SAME persistence key (null
 * when `?board=` is set, undefined otherwise). `persistenceKeyForSearch` is
 * the strict superset — it also nulls the key for `?fresh=1`, which the
 * stopgap never knew about — and it is the half wired to the real file host,
 * so a board opened by URL is the same document Save and Rename write back to.
 * Booting both would OPEN THE BOARD TWICE: the files session resolves
 * `documentLocation().initialBoard()` through the host while
 * `openBoardFromBoot` independently fetches the same path and swaps the store,
 * and the second swap calls `clearHistory` — so the race is silent and costs
 * the user their undo stack. `review/boardParam.ts` stays in the tree with its
 * own passing tests but has no production caller from here; deleting it is
 * Zach's call on Z4, not a merge-resolution side effect.
 */
createRoot(root).render(
  <StrictMode>
    <App persistenceKey={persistenceKeyForSearch(window.location.search)} onEditorReady={rememberForConsole} />
  </StrictMode>,
);
