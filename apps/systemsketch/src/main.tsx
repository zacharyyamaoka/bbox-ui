import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Editor } from "tldraw";

import { App } from "./App";
import { bootOptionsFor, openBoardFromBoot } from "./review/boardParam";

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

// WHY: `?board=` opens a disposable review board (persistenceKey null) — see review/boardParam.ts.
const boot = bootOptionsFor(location.search, location.origin);

createRoot(root).render(
  <StrictMode>
    <App
      persistenceKey={boot.persistenceKey}
      onEditorReady={(editor) => {
        rememberForConsole(editor);
        void openBoardFromBoot(editor, boot.board);
      }}
    />
  </StrictMode>,
);
