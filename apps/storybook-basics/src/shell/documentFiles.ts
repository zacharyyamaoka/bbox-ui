// src/shell/documentFiles.ts — File ▸ Open… and Save for a host that brings no
// file session of its own, over `HostPort.serialize()` / `load()`.
//
// B-SHELL-P1: the `documentIo` capability gates File ▸ Open / Save
// (HOST-PORT.md "Capabilities — four, not five"). A host with a real file
// model — the studio's `files/session.tsx`, which talks to a file host — hands
// the bar its own rows and never reaches this file. A host without one (the
// no-host runner, a React Flow host on its first day) still earns working
// rows: the browser's own file picker in, a download out. The bytes are the
// host's own format either way (constraint 5); the shell never reads them.
//
// Reference: the studio's pre-file-host download/open, apps/systemsketch/src/
// chrome/FileMenu/fileActions.ts (`downloadBoard`, `loadBoardText`) at 75991ce —
// the same two browser mechanisms, re-expressed over the port.
import type { HostPort } from "./hostPort";

/** Pick a file and hand its text to `load()`. A refusal is surfaced with the
 *  host's own reason; nothing is thrown at the menu that raised it. */
export function openDocumentFile(port: HostPort, onRefused?: (reason: string) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const result = port.load(text);
      if (!result.ok) (onRefused ?? ((reason: string) => window.alert(reason)))(result.reason);
    });
  });
  input.click();
}

/** `serialize()` and download the bytes, named after the board. */
export async function saveDocumentFile(port: HostPort, name: string): Promise<void> {
  const text = await port.serialize();
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.trim() || "board"}.json`;
  anchor.click();
  // Released on the next turn: revoking synchronously can cancel the
  // download in Chromium before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
