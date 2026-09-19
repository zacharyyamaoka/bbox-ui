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
 */
createRoot(root).render(
  <StrictMode>
    <App persistenceKey={persistenceKeyForSearch(window.location.search)} onEditorReady={rememberForConsole} />
  </StrictMode>,
);
