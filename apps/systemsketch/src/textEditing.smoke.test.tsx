// src/textEditing.smoke.test.tsx — the TEXT EDITING lane's acceptance, driven
// through the real app in a real Chromium tab.
//
// Two backlog items are measured here, both on real user actions:
//
//   P-021  the caret lands on the character you clicked, not at the start,
//          the end, or on a select-all.
//   P-030  WYSIWYG commit: whatever was typed is what the store holds —
//          leading, trailing and doubled whitespace and non-ASCII included
//          (Zach's `feedback_truthful_property_rendering`: "no silent
//          normalization, trimming, substitution, or clipping").
//
// WHY the click position is not passed to `dblClick`: vitest's
// `UserEventDoubleClickOptions` is an EMPTY interface in 4.1.11 (checked in
// node_modules, not assumed), so there is no supported way to aim a
// double-click at a pixel. `dblClick(label)` hits the element's CENTRE, and
// the test computes — independently, from `Range` rectangles rather than from
// the `caretRangeFromPoint` the implementation uses — which character that
// centre is on. Two different browser APIs answering the same question is the
// independent oracle; reusing `caretOffsetFromPoint` here would be the
// implementation grading its own homework.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { CODE_SHAPE_TYPE, PORT_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

interface PortShapeLike {
  id: TLShapeId;
  props: { declaration: string; direction: "in" | "out" };
}
interface CodeShapeLike {
  id: TLShapeId;
  props: { code: string; language: string };
}

function placePort(declaration: string, direction: "in" | "out" = "in"): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: PORT_SHAPE_TYPE, x: 220, y: 180, props: { declaration, direction } } as never);
  return id;
}

/**
 * Which character offset a caret would take at `clientX` inside `label`,
 * measured with `Range.getBoundingClientRect()` — the INDEPENDENT oracle (see
 * this file's header). Caret snapping is the standard one: the near half of a
 * glyph puts the caret before it, the far half after it.
 */
function characterOffsetAtX(label: HTMLElement, clientX: number): number {
  const doc = label.ownerDocument;
  const walker = doc.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      const range = doc.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) {
        return clientX < rect.left + rect.width / 2 ? consumed + i : consumed + i + 1;
      }
    }
    consumed += text.length;
  }
  return consumed;
}

describe("P-021 — the caret lands on the character you clicked", () => {
  it("a double-click in the middle of a port label opens the editor with the caret there, not at either end", async () => {
    app = await mountApp();
    const declaration = "alpha_beta: float";
    const id = placePort(declaration);

    const label = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`),
      { what: "the resting port label" },
    );
    expect(label.textContent).toBe(declaration);

    const rect = label.getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const expected = characterOffsetAtX(label, clickX);
    // The premise of the measurement: the centre of this label really is in
    // the middle of the string. If it were not, the assertion below would pass
    // for a start/end caret too and prove nothing.
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(declaration.length);

    await userEvent.dblClick(label);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the rename session opened" });

    // One character, typed. Where it lands IS where the caret was — and a
    // select-all (what this shape did before P-021) would have replaced the
    // whole line with it instead.
    await userEvent.keyboard("Z");
    const after = await waitFor(() => {
      const value = (app!.editor.getShape(id) as PortShapeLike).props.declaration;
      return value !== declaration ? value : null;
    }, { what: "the keystroke reached props.declaration" });

    expect(after).toBe(`${declaration.slice(0, expected)}Z${declaration.slice(expected)}`);
    // Restated as the backlog item words it, so a failure reads as the bug:
    expect(after).not.toBe("Z");
    expect(after).not.toBe(`Z${declaration}`);
    expect(after).not.toBe(`${declaration}Z`);
  });

  it("falls back to select-all when the session opens with no press on the text", async () => {
    // The other half of the contract: a rename that was NOT opened by clicking
    // a character has no clicked character, and the OS rename idiom (replace
    // the whole label) is what it should do. Driven by asking tldraw to edit
    // the shape directly — the same thing a keyboard entry point would do.
    app = await mountApp();
    const id = placePort("old_name");
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"]`), { what: "the label" });
    app.editor.select(id);
    app.editor.setEditingShape(id);
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="true"]`), { what: "the editor mounted" });
    await userEvent.keyboard("fresh");
    await waitFor(() => (app!.editor.getShape(id) as PortShapeLike).props.declaration === "fresh", { what: "select-all replaced the whole label" });
  });
});

describe("P-030 — nothing you type is lost", () => {
  // One string carrying every way a commit path silently loses text: leading
  // whitespace, a doubled internal space, trailing whitespace, an accented
  // letter and a CJK pair. `feedback_truthful_property_rendering`.
  const AWKWARD = "  lead  béta 漢字  ";

  it("a port declaration keeps its leading, doubled and trailing whitespace and its non-ASCII", async () => {
    app = await mountApp();
    const id = placePort("x");
    const label = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"]`),
      { what: "the resting port label" },
    );
    await userEvent.dblClick(label);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the rename session opened" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard(AWKWARD);

    await waitFor(() => (app!.editor.getShape(id) as PortShapeLike).props.declaration === AWKWARD, {
      what: `props.declaration is exactly ${JSON.stringify(AWKWARD)}`,
    });

    // …and leaving the field does not tidy it on the way out.
    await userEvent.keyboard("{Enter}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "the session closed" });
    expect((app.editor.getShape(id) as PortShapeLike).props.declaration).toBe(AWKWARD);

    // …and what is PAINTED reassembles the stored line character for
    // character, which is the other half of the same rule.
    const resting = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="port-label"][data-editing="false"]`),
      { what: "the label at rest again" },
    );
    expect(resting.textContent).toBe(AWKWARD);
  });

  it("a code cell keeps trailing whitespace on a line, blank lines and non-ASCII", async () => {
    app = await mountApp();
    const id = createShapeId();
    app.editor.createShape({ id, type: CODE_SHAPE_TYPE, x: 140, y: 120, props: { code: "", language: "python" } } as never);
    const face = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-slot="code-editor"]`),
      { what: "the CodeEditor face" },
    );
    await userEvent.dblClick(face);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "editing the code shape" });

    // A trailing space before the newline, a blank line, and a non-ASCII
    // identifier — three separate things a "helpful" commit tidies away.
    await userEvent.keyboard("a = 1  {Enter}{Enter}naïve = 'κ'");
    const expected = "a = 1  \n\nnaïve = 'κ'";
    await waitFor(() => (app!.editor.getShape(id) as CodeShapeLike).props.code === expected, {
      what: `props.code is exactly ${JSON.stringify(expected)}`,
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "editing ended" });
    expect((app.editor.getShape(id) as CodeShapeLike).props.code).toBe(expected);
  });
});
