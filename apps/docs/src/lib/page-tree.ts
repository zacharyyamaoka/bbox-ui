import type { source } from "@/lib/source";

export type PageTreeNode = (typeof source.pageTree)["children"][number];
export type PageTreeFolder = Extract<PageTreeNode, { type: "folder" }>;
export type PageTreePage = Extract<PageTreeNode, { type: "page" }>;

// Recursively find all pages in a folder tree.
export function getAllPagesFromFolder(folder: PageTreeFolder): PageTreePage[] {
  const pages: PageTreePage[] = [];

  for (const child of folder.children) {
    if (child.type === "page") {
      pages.push(child);
    } else if (child.type === "folder") {
      pages.push(...getAllPagesFromFolder(child));
    }
  }

  return pages;
}

// Get all pages from a folder (flattened, no base/radix distinction).
// WHY the filter: a folder's own index page appears among its children too,
// and the sidebar/mobile-nav already link it as the group header — listing it
// again as its first child reads as a duplicate. Was a hardcoded
// `endsWith("/components")` when components was the only section; matching
// the folder's index URL keeps the same behaviour for every section
// (components / scene / editor) without a list to maintain.
export function getPagesFromFolder(folder: PageTreeFolder): PageTreePage[] {
  const indexUrl = folder.index?.url;
  return getAllPagesFromFolder(folder).filter(
    (page) => page.url !== indexUrl,
  );
}
