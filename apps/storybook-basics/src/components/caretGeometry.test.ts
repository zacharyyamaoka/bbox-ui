// src/components/caretGeometry.test.ts — the offset arithmetic, against a
// literal tree.
//
// WHY a hand-built tree rather than jsdom or a browser story: the walk is the
// only part of `caretGeometry.ts` that can be wrong in an interesting way, and
// it is pure over `childNodes`/`textContent`/`parentNode`. This repo has no
// jsdom (checked, not assumed — `ls node_modules | grep jsdom` is empty), and
// the browser projects are the unstable ones. A literal tree tests exactly the
// thing that broke in the archive, in milliseconds, in Node.
import { describe, expect, it } from "vitest";

import { CARET_IGNORE_ATTR, caretTextOffset } from "./caretGeometry";

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

interface FakeNode {
  nodeType: number;
  textContent: string;
  childNodes: FakeNode[];
  parentNode: FakeNode | null;
  getAttribute?(name: string): string | null;
}

function text(value: string): FakeNode {
  return { nodeType: TEXT_NODE, textContent: value, childNodes: [], parentNode: null };
}

function element(children: FakeNode[], attributes: Record<string, string> = {}): FakeNode {
  const node: FakeNode = {
    nodeType: ELEMENT_NODE,
    textContent: children.map((child) => child.textContent).join(""),
    childNodes: children,
    parentNode: null,
    getAttribute: (name) => attributes[name] ?? null,
  };
  for (const child of children) child.parentNode = node;
  return node;
}

/** `caretTextOffset` types its arguments as real DOM `Node`s; the tree above
 *  implements exactly the four members it reads. */
const offsetOf = (container: FakeNode, target: FakeNode, targetOffset: number) =>
  caretTextOffset(container as unknown as Node, target as unknown as Node, targetOffset);

describe("caretTextOffset", () => {
  it("returns the offset within a single text node", () => {
    const run = text("frame");
    const container = element([run]);
    expect(offsetOf(container, run, 0)).toBe(0);
    expect(offsetOf(container, run, 3)).toBe(3);
    expect(offsetOf(container, run, 5)).toBe(5);
  });

  it("sums the runs before the one that was hit — the port label's two spans", () => {
    // Exactly what `RestingLabel` paints (shapes/port/PortFace.tsx): the name
    // in one span, `:` plus the annotation in another, concatenating back to
    // the stored declaration character for character.
    const name = text("gain_x");
    const annotation = text(": float");
    const container = element([element([name]), element([annotation])]);
    // Click on the `f` of `float`: 6 characters of name, then `: ` then 0.
    expect(offsetOf(container, annotation, 2)).toBe(8);
    expect(offsetOf(container, name, 6)).toBe(6);
  });

  it("does not count chrome marked data-caret-ignore", () => {
    // The archive's own measured bug: counting a fold chevron's glyph shifted
    // every mapped column one character right of the click.
    const chevron = text("▸");
    const label = text("estimate");
    const container = element([element([chevron], { [CARET_IGNORE_ATTR]: "" }), element([label])]);
    expect(offsetOf(container, label, 3)).toBe(3);
  });

  it("answers with the position of the chrome when the point lands inside it", () => {
    const chevron = text("▸");
    const label = text("estimate");
    const container = element([element([chevron], { [CARET_IGNORE_ATTR]: "" }), element([label])]);
    expect(offsetOf(container, chevron, 1)).toBe(0);
  });

  it("clamps an offset past the end of its own text node", () => {
    const run = text("ab");
    const container = element([run]);
    expect(offsetOf(container, run, 99)).toBe(2);
    expect(offsetOf(container, run, -3)).toBe(0);
  });

  it("reads an ELEMENT target's offset as a child index, not a character index", () => {
    // What `caretPositionFromPoint` hands back when the point lands between
    // two inline children rather than inside one.
    const first = element([text("abc")]);
    const second = element([text("de")]);
    const container = element([first, second]);
    expect(offsetOf(container, container, 0)).toBe(0);
    expect(offsetOf(container, container, 1)).toBe(3);
    expect(offsetOf(container, container, 2)).toBe(5);
  });

  it("returns null for a node outside the container, so a caller can fall back", () => {
    const outside = text("elsewhere");
    const container = element([text("frame")]);
    expect(offsetOf(container, outside, 2)).toBeNull();
  });

  it("counts astral characters the way the DOM does — UTF-16 units", () => {
    // The declaration is a JS string and every downstream offset
    // (`CodeEditor`'s `cursorAt`, CodeMirror's document) is a UTF-16 index, so
    // an emoji ahead of the caret must advance it by 2, not 1.
    const glyph = text("\u{1F50D}x");
    const tail = text(": int");
    const container = element([element([glyph]), element([tail])]);
    expect(offsetOf(container, tail, 1)).toBe(4);
  });
});
