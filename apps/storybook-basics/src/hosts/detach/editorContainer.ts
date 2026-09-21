/**
 * src/hosts/detach/editorContainer.ts — which DOM subtree belongs to which
 * `Editor`, for the one query a `DetachableKind` cannot avoid: finding the
 * `.tl-shape` element a `bbox-node` shape rendered into, by id.
 *
 * WHY this exists at all: `shapeIdForNode` (`../hosts/tldrawHost.tsx`) is
 * DETERMINISTIC — the same scene-node id always mints the same tldraw shape
 * id. That is safe within one `Editor` (each has its own isolated shape
 * store), but a page that mounts SEVERAL `TldrawHost`s at once — exactly
 * what this lane's own 3-column/3-row gallery does — can easily have the
 * SAME `data-shape-id` value on screen in more than one host at the same
 * time, if two cells happen to use the same scene-node id (measured
 * 2026-09-18: a `document.querySelector('[data-shape-id="…"]')` picked
 * whichever cell's element happened to come first in DOM order,
 * cross-contaminating every OTHER cell's detach output with the first
 * cell's geometry — a ~20px port-position defect that had nothing to do
 * with the detach kit's own math). Scoping the query to the right editor's
 * own container is the actual fix; giving every gallery cell a globally
 * unique node id would only have hidden the same bug at smaller scale.
 */
import type { Editor } from "tldraw";

const containers = new WeakMap<Editor, HTMLElement>();

/** Call once, when a host's editor is ready — `../hosts/tldrawHost.tsx`'s
 *  own `onEditorReady(editor, container)` hands both halves together. */
export function registerEditorContainer(editor: Editor, container: HTMLElement) {
  containers.set(editor, container);
}

/** The container a `DetachableKind` should scope its DOM queries to, or
 *  `null` when the caller never registered one (a single-host page has no
 *  collision to guard against, so this is a safety net, not a requirement —
 *  callers fall back to `document` in that case, same as before this file
 *  existed). */
export function containerFor(editor: Editor): HTMLElement | null {
  return containers.get(editor) ?? null;
}
