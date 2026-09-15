/**
 * Grammar-agnostic text-geometry helpers for the "click a rendered row and
 * land in source mode with the caret already there" gesture — the seam
 * `CodeField`'s `mode="rendered"` rows use to compute what `onOpenSource`
 * reports. Pure DOM; no grammar, no host.
 */

/** Absolute character offset of the start of `lineIndex` within `source`. */
export function lineStartOffset(source: string, lineIndex: number): number {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let offset = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i++) offset += lines[i].length + 1;
  return offset;
}

/**
 * How far into `container`'s own text a click at (clientX, clientY) landed —
 * used to map a pixel click on a *rendered* row (built from separate name /
 * punctuation / type spans, not the raw source) back onto an approximate
 * column in that row's raw source line. Exact for the common case where the
 * row was authored with the same single-space `name: type = value` spacing
 * the read view renders; if punctuation was written differently, the mapped
 * column is a reasonable placement, not a guarantee.
 */
export function caretOffsetFromPoint(container: HTMLElement, clientX: number, clientY: number): number {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let nodeOffset = 0;
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range) {
      node = range.startContainer;
      nodeOffset = range.startOffset;
    }
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      node = pos.offsetNode;
      nodeOffset = pos.offset;
    }
  }
  if (!node || !container.contains(node)) return container.textContent?.length ?? 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    // Chrome that shares the row but is not part of the source line — a
    // chevron glyph — is marked `data-caret-ignore`; counting it shifted
    // every mapped column one character right of the click.
    if (current.parentElement?.closest("[data-caret-ignore]")) {
      if (current === node) return offset;
      continue;
    }
    if (current === node) return offset + nodeOffset;
    offset += current.textContent?.length ?? 0;
  }
  return offset;
}
