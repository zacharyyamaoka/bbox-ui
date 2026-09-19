// src/chrome/fileActions.ts — STUB. Lane L4 builds it.
//
// A plain `.tldr` is the file format (plan §8.3): our shapes' props ARE the
// document, so tldraw's own `serializeTldrawJsonBlob` / `parseAndLoadDocument`
// round-trip a board with zero backend. The archive's `.systemsketch` envelope
// is deliberately not ported.
import type { Editor } from "tldraw";

export function serializeBoard(_editor: Editor): Promise<string> {
  throw new Error('not built — see docs/SYSTEMSKETCH-REBUILD-PLAN.md L3/L4');
}
