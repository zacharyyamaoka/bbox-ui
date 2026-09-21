// src/components/caretGeometry.ts — where in a string did a click land?
//
// PLACEMENT: this reads the DOM (`caretRangeFromPoint`, text nodes), so it is
// not `scene/` material however pure the walk looks — `scene/` may not import
// a DOM type, let alone call one (README's placement table). It sits in
// `components/` because every surface that needs it is a text surface:
// `editableText.tsx`'s control, `codeEditor.tsx`'s host, and the shapes that
// swap one in.
//
// WHY it exists at all: a click-to-edit control replaces PAINTED text with an
// editing control, and the control has no idea where the pointer was. Without
// this the caret can only land somewhere constant — offset 0, the end, or a
// select-all — and "I clicked the `f` in `frame` and the caret went to the
// end" is the bug the backlog files as P-021. The archive solved it the same
// way (/home/bam/systemsketch/src/blocks/babble/caretGeometry.ts); this is
// that lesson re-derived with two differences, both deliberate:
//
//  1. The tree walk is a plain depth-first recursion over `childNodes`, not a
//     `TreeWalker`. A `TreeWalker` can only be made by a real `Document`, so
//     the walk — which is where the archive's one recorded bug was, an
//     un-skipped chevron shifting every column one character right — could
//     only ever be tested in a browser. Recursion makes it testable in Node
//     against a literal tree, which is what `caretGeometry.test.ts` does.
//  2. The document comes from `container.ownerDocument`, never the `document`
//     global. Storybook renders its stories in an IFRAME; a global lookup
//     asks the wrong document and answers `null` for every point in it.

/** `Node.TEXT_NODE` / `Node.ELEMENT_NODE`, spelled out — the constants are on
 *  the DOM `Node` interface, which a literal test tree does not implement. */
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Mark chrome that shares a text row but is not part of the string: a fold
 * chevron, a glyph, a count badge. Its characters are skipped when mapping a
 * pixel back onto a character offset.
 *
 * WHY it is needed rather than "just don't put chrome in the row": the
 * archive measured the alternative. Counting the expand chevron's `▸` shifted
 * every mapped column one character right of the click — a caret that lands
 * one character off is worse than one that lands at the end, because it looks
 * like it worked.
 */
export const CARET_IGNORE_ATTR = "data-caret-ignore";

function textLengthOf(node: Node): number {
  return node.textContent?.length ?? 0;
}

function isCaretIgnored(node: Node): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false;
  const element = node as Element;
  // WHY the `typeof` guard rather than `getAttribute?.(...) !== null`: optional
  // chaining on a missing method yields `undefined`, and `undefined !== null`
  // is TRUE — so the terse spelling marks every element with no `getAttribute`
  // as ignored chrome and silently drops its characters from the count.
  return typeof element.getAttribute === "function" && element.getAttribute(CARET_IGNORE_ATTR) !== null;
}

function containsNode(ancestor: Node, node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    if (current === ancestor) return true;
  }
  return false;
}

/**
 * How many characters of `container`'s own text sit before the DOM position
 * (`target`, `targetOffset`) — `null` when `target` is not under `container`
 * at all, so a caller can tell "not here" from "offset 0".
 *
 * `targetOffset` follows the DOM's own two meanings, because that is what a
 * `Range`/`CaretPosition` hands back: a CHARACTER index when `target` is a
 * text node, a CHILD index when it is an element.
 *
 * Pure over the tree — no `document`, no globals — which is the whole reason
 * the offset arithmetic is separable from `caretOffsetFromPoint` below.
 */
export function caretTextOffset(container: Node, target: Node, targetOffset: number): number | null {
  let before = 0;
  let answer: number | null = null;

  const walk = (node: Node): boolean => {
    if (node !== container && isCaretIgnored(node)) {
      // The point landed inside chrome. Answer with the position the chrome
      // sits at rather than refusing: a click on the glyph beside a title
      // means "the start of the title", not "nowhere".
      if (containsNode(node, target)) {
        answer = before;
        return true;
      }
      return false;
    }
    if (node === target) {
      if (node.nodeType === TEXT_NODE) {
        answer = before + Math.max(0, Math.min(targetOffset, textLengthOf(node)));
        return true;
      }
      let sum = before;
      const children = node.childNodes;
      for (let i = 0; i < targetOffset && i < children.length; i++) {
        const child = children[i];
        if (child && !isCaretIgnored(child)) sum += textLengthOf(child);
      }
      answer = sum;
      return true;
    }
    if (node.nodeType === TEXT_NODE) {
      before += textLengthOf(node);
      return false;
    }
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child && walk(child)) return true;
    }
    return false;
  };

  walk(container);
  return answer;
}

interface CaretHit {
  node: Node;
  offset: number;
}

/**
 * The browser's own "what character is under this pixel" answer, through
 * whichever of the two spellings this engine ships.
 *
 * `caretRangeFromPoint` is WebKit/Blink's original and is still what Chrome
 * implements; `caretPositionFromPoint` is the standardised replacement
 * Firefox ships and Chrome has been adding. Neither is universal, so both are
 * tried — the archive's own shape, kept.
 */
function caretHitAt(doc: Document, clientX: number, clientY: number): CaretHit | null {
  const withRange = doc as Document & {
    caretRangeFromPoint?(x: number, y: number): Range | null;
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  };
  if (typeof withRange.caretRangeFromPoint === "function") {
    const range = withRange.caretRangeFromPoint(clientX, clientY);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  if (typeof withRange.caretPositionFromPoint === "function") {
    const position = withRange.caretPositionFromPoint(clientX, clientY);
    if (position) return { node: position.offsetNode, offset: position.offset };
  }
  return null;
}

/**
 * The character offset a click at (clientX, clientY) landed on within
 * `container`'s text.
 *
 * Falls back to the END of the text — never 0 — when the engine has no caret
 * API or the point resolves outside the container. WHY the end and not the
 * start: a click that misses the letters is nearly always past the last one
 * (the slack at the end of a short label inside a wider box), and the end is
 * also where a person who meant "keep typing" wants to be. Landing at 0
 * instead puts the caret in front of text the user can then only destroy by
 * typing over it.
 */
export function caretOffsetFromPoint(container: HTMLElement, clientX: number, clientY: number): number {
  const fallback = container.textContent?.length ?? 0;
  const doc = container.ownerDocument;
  if (!doc) return fallback;
  const hit = caretHitAt(doc, clientX, clientY);
  if (!hit || !containsNode(container, hit.node)) return fallback;
  return caretTextOffset(container, hit.node, hit.offset) ?? fallback;
}
