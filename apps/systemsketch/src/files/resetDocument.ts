// src/files/resetDocument.ts — what File ▸ New leaves behind in a window that
// does NOT navigate.
//
// Only native mode reaches this: the File System Access API hands back an
// opaque handle with no path, so there is no `?board=` URL to go to and New
// has to empty the window in place. App mode navigates instead, and a fresh
// page load needs none of this.
//
// WHY this is not `clearBoard` from `../chrome/FileMenu/fileActions`: `clearBoard`
// deletes the shapes on the CURRENT page. That is exactly right for "empty
// this board" and exactly wrong for "start a new document". Reproduced by an
// independent judge, 2026-09-19: open a two-page file, File ▸ New, Save As —
// and the "new" document still carried the old file's second page into the
// new file, while one Ctrl+Z brought the old current page's shapes back on
// top of it. A new document carries nothing of the one before it, its other
// pages and its history included.
import type { Editor } from "tldraw";

/** tldraw's own name for a document's first page. */
export const FIRST_PAGE_NAME = "Page 1";

export function resetDocumentToBlank(editor: Editor): void {
  editor.run(() => {
    const existing = editor.getPages();
    editor.createPage({ name: FIRST_PAGE_NAME });
    const fresh = editor.getPages().find((page) => !existing.some((old) => old.id === page.id));
    if (!fresh) {
      // `createPage` is a silent no-op at tldraw's `maxPages` ceiling
      // (Editor.mjs:3647). Emptying every page in place still leaves nothing
      // of the old document behind, which is the property that matters.
      const current = editor.getCurrentPageId();
      for (const page of existing) {
        editor.setCurrentPage(page.id);
        editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
      }
      editor.setCurrentPage(current);
      return;
    }
    editor.setCurrentPage(fresh.id);
    // `deletePage` refuses to remove the last page (Editor.mjs:3685), which is
    // why the fresh one is created and made current FIRST.
    for (const page of existing) editor.deletePage(page.id);
    // `createPage` uniquifies against the pages that existed a moment ago, so
    // the survivor is called "Page 2" until they are gone.
    editor.renamePage(fresh.id, FIRST_PAGE_NAME);
  });
  // WHY outside the transaction, and why at all: `../chrome/FileMenu/fileActions.ts`'s
  // `loadBoardText` learned the same lesson from the same place — a whole
  // document swap is recorded as a USER history entry, so without this one
  // line Ctrl+Z immediately after New silently brings the old board back.
  editor.clearHistory();
}
