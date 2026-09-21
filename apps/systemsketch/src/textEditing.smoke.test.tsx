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
//          normalization, trimming, substitution, or clipping"), AND on every
//          exit route, including the routes that fire no `blur` at all. The
//          second describe below is the one the item exists for.
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

import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE } from "./shapes/types";
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

interface BlockShapeLike {
  id: TLShapeId;
  props: { name: string; description: string };
}

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

function placeBlock(name: string): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x: 240,
    y: 200,
    props: { name, view: "simple", w: 320, h: 90, ports: NO_PORTS },
  } as never);
  return id;
}

/**
 * The title AT REST inside THIS block's own header — in place, by
 * construction, and `data-editing="false"` so it is never the editing control
 * (which wears the same `data-slot`, because it is the same title). Waiting on
 * the resting one is what makes a second double-click land on an element that
 * is still attached.
 */
async function titleOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(
    () => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-header"] [data-slot="ss-block-title"][data-editing="false"]`),
    { what: `the resting title of ${id}` },
  );
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

/** The same shape of string as P-030's `AWKWARD`, at module scope because the
 *  block-title case below is in a different `describe`. */
const AWKWARD_TITLE = "  lead  béta 漢字  ";

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

/** Let tldraw's click counter lapse between two separate gestures — see the
 *  one call site for the measurement. */
const settleClicks = () => new Promise((resolve) => setTimeout(resolve, 500));

describe("P-039 / P-026 — a block's title edits in place, on the card", () => {
  it("a double-click on the title opens an EditableText control INSIDE the block's own header, and typing writes props.name", async () => {
    app = await mountApp();
    const id = placeBlock("estimate");
    const title = await titleOf(id);
    expect(title.textContent).toBe("estimate");
    const restingFont = getComputedStyle(title).fontSize;

    await userEvent.dblClick(title);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the block's editing session opened" });

    // IN PLACE is the item, so it is asserted structurally: the control is a
    // descendant of this block's own header, not of a panel elsewhere.
    const control = await waitFor(
      () => document.querySelector<HTMLInputElement>(`[data-ss-node="${id}"] [data-slot="block-header"] [data-slot="editable-text-input"]`),
      { what: "the EditableText control in the header" },
    );
    expect(control.tagName).toBe("INPUT");
    // "The control must not move the text" — EditableText's own contract, and
    // the reason BlockFace passes `size="custom"`. If Block's `text-sm` ever
    // changes, this is what goes red instead of the title silently jumping.
    expect(getComputedStyle(control).fontSize).toBe(restingFont);

    await userEvent.keyboard("{Control>}a{/Control}pose_from_frame");
    await waitFor(() => (app!.editor.getShape(id) as BlockShapeLike).props.name === "pose_from_frame", {
      what: "props.name followed the keystrokes",
    });

    // What `canEdit` took away: with it false, tldraw's own double-click
    // branch creates a stock `text` shape on top of the block and types into
    // THAT. Nothing on this page may be one.
    expect(app.editor.getCurrentPageShapes().filter((shape) => shape.type === "text")).toHaveLength(0);

    await userEvent.keyboard("{Enter}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "the session closed on Enter" });
    expect((app.editor.getShape(id) as BlockShapeLike).props.name).toBe("pose_from_frame");
    expect((await titleOf(id)).textContent).toBe("pose_from_frame");
  });

  it("P-021 on this surface too: the caret lands on the character the press landed on", async () => {
    app = await mountApp();
    const name = "alpha_beta_gamma";
    const id = placeBlock(name);
    const title = await titleOf(id);

    const rect = title.getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const expected = characterOffsetAtX(title, clickX);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(name.length);

    await userEvent.dblClick(title);
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the editing session opened" });
    await userEvent.keyboard("Z");
    const after = await waitFor(() => {
      const value = (app!.editor.getShape(id) as BlockShapeLike).props.name;
      return value !== name ? value : null;
    }, { what: "the keystroke reached props.name" });
    expect(after).toBe(`${name.slice(0, expected)}Z${name.slice(expected)}`);
  });

  it("Escape puts the name back; the whole-title whitespace and non-ASCII survive a commit", async () => {
    app = await mountApp();
    const id = placeBlock("keep me");
    await userEvent.dblClick(await titleOf(id));
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the editing session opened" });
    await userEvent.keyboard("{Control>}a{/Control}throw away");
    await waitFor(() => (app!.editor.getShape(id) as BlockShapeLike).props.name === "throw away", { what: "the replacement was written" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => (app!.editor.getShape(id) as BlockShapeLike).props.name === "keep me", { what: "Escape put the original back" });

    // P-030 on this surface: the same awkward string, committed through the
    // title rather than through a CodeEditor.
    //
    // WHY the pause: tldraw counts clicks in a time window
    // (`ClickManager`, `options.doubleClickDurationMs`), so a second
    // double-click fired microseconds after the first one is read as the
    // third and fourth clicks of ONE gesture, not as a new double-click —
    // measured here, this case failed at exactly that and passed with the
    // window allowed to lapse. It is a fact about driving the app faster than
    // a hand can, not about the app.
    await settleClicks();
    await userEvent.dblClick(await titleOf(id));
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "a second session opened" });
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard(AWKWARD_TITLE);
    await waitFor(() => (app!.editor.getShape(id) as BlockShapeLike).props.name === AWKWARD_TITLE, {
      what: `props.name is exactly ${JSON.stringify(AWKWARD_TITLE)}`,
    });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => app!.editor.getEditingShapeId() === null, { what: "the session closed" });
    expect((app.editor.getShape(id) as BlockShapeLike).props.name).toBe(AWKWARD_TITLE);
  });
});

/**
 * Open the right rail on the Inspector the way a person does — the status
 * strip's Frames launcher, then the rail's own surface switch. The same two
 * presses `src/inspector.smoke.test.tsx` drives; restated here rather than
 * shared because a smoke test that imports another smoke test's helper pulls
 * its module graph in too.
 */
async function openInspector(): Promise<HTMLElement> {
  const launcher = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-status-frames"]'), {
    what: "the Frames launcher in the status strip",
  });
  await userEvent.click(launcher);
  const tab = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), {
    what: "the Inspector surface switch",
  });
  await userEvent.click(tab);
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="inspector"]'), {
    what: "the inspector panel",
  });
}

const descriptionField = () =>
  waitFor(() => app!.root.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]'), {
    what: "the description field",
  });

/**
 * Type `text` one character at a time and check `read()` after EVERY one.
 *
 * WHY this and not one `keyboard(text)` followed by one assertion at the end:
 * the end-state assertion is satisfied by a field that buffers the whole
 * sentence and delivers it on the way out, which is exactly the design P-030
 * is about. Asserting per keystroke is the only shape that can tell
 * write-through apart from a buffer, and write-through is what makes every
 * exit route below safe — there is no pending text for an exit to lose,
 * because there is never any pending text.
 *
 * WHY the assertion is bare rather than wrapped in `waitFor`, which is what
 * the rest of this file uses: `waitFor` polls for up to ten seconds, so it
 * would pass a field that debounced its write — and a debounced write loses
 * exactly the tail P-030 is about when the field is torn out mid-timer. A
 * keystroke is a DISCRETE event, so React flushes the store write before
 * `userEvent.keyboard` resolves; anything later than that is the bug.
 */
async function typeWritingThrough(text: string, read: () => string) {
  let typed = "";
  for (const character of text) {
    await userEvent.keyboard(character);
    typed += character;
    expect(read()).toBe(typed);
  }
}

/**
 * P-030's HARD HALF, and the reason the item exists: a focused text control
 * REMOVED FROM THE DOM. Chrome fires no `blur` for such an element, so any
 * surface whose text only reaches the store on a commit loses everything typed
 * since the last one — and panel unmount and tab switch are the routes that
 * get there.
 *
 * WHAT ACTUALLY PROTECTS THE TEXT IN THIS APP, and it is not a fourth commit
 * route: no exit route carries text at all. Each of the four text surfaces
 * writes through on every keystroke, so the store is never behind the field:
 *
 *   shapes/block/BlockFace.tsx:186   the block title      EditableText `onChange`
 *   shapes/port/PortFace.tsx:236     the port declaration CodeEditor  `onWrite`
 *   shapes/code/CodeFace.tsx:148     a code cell          CodeEditor  `onWrite`
 *   chrome/panels.tsx:152            the description      Textarea    `onChange`
 *
 * MEASURED WHILE WRITING THIS, and worth keeping because it is the opposite of
 * what the routes look like: on BOTH routes below a `blur` does fire, even
 * though the element is being removed. tldraw refocuses its own container on
 * the way out of a session and on its own Escape handling
 * (`useDocumentEvents.mjs`), and that `focus()` blurs the field synchronously
 * before React unmounts it. So the browser hazard is real but unreachable
 * here — which is precisely why these tests do not lean on a blur counter as
 * their oracle. They assert the store per keystroke instead, which is a claim
 * about this app and not about tldraw's keyboard wiring.
 */
describe("P-030 — every exit route, including the ones that unmount a focused field", () => {
  it("the panel closes under the description field while focus is inside it", async () => {
    app = await mountApp();
    const id = placeBlock("estimate");
    await openInspector();
    app.editor.select(id);
    const field = await descriptionField();
    await userEvent.click(field);

    await typeWritingThrough(AWKWARD_TITLE, () => (app!.editor.getShape(id) as BlockShapeLike).props.description);

    // The field really is the focused element when the panel is told to close
    // — otherwise the case being measured is one the user had already left,
    // which is the easy one.
    expect(field.ownerDocument.activeElement).toBe(field);

    // Escape closes the rail (chrome/panels.tsx:240) — a real user action, and
    // a keyboard one, which is the only kind that does not begin with a press
    // landing somewhere else.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !field.isConnected, { what: "the panel closed under the field" });

    expect((app.editor.getShape(id) as BlockShapeLike).props.description).toBe(AWKWARD_TITLE);

    // …and it is all still there when the panel comes back, character for
    // character, which is the half a person would actually notice.
    //
    // WHY the block is selected again first: that one Escape did two things on
    // purpose. `chrome/panels.tsx:235-236` says the listener deliberately does
    // not stop propagation — "closing the panel and cancelling the gesture at
    // the same time is the behaviour both stock tldraw and the donor have" —
    // so tldraw's own handler cleared the selection as well, and an inspector
    // with no subject shows its empty state rather than a field. Re-selecting
    // is what a person does by clicking the block again.
    app.editor.select(id);
    await openInspector();
    expect((await descriptionField()).value).toBe(AWKWARD_TITLE);
  });

  it("the block's title control is unmounted mid-edit while it still holds focus", async () => {
    app = await mountApp();
    const id = placeBlock("estimate");
    await userEvent.dblClick(await titleOf(id));
    await waitFor(() => app!.editor.getEditingShapeId() === id, { what: "the title session opened" });
    const control = await waitFor(
      () => document.querySelector<HTMLInputElement>(`[data-ss-node="${id}"] [data-slot="editable-text-input"]`),
      { what: "the title control" },
    );

    await userEvent.keyboard("{Control>}a{/Control}");
    await typeWritingThrough("pose_from_frame", () => (app!.editor.getShape(id) as BlockShapeLike).props.name);
    expect(control.ownerDocument.activeElement).toBe(control);

    // The engine's own route out of a session — `shapes/shared/editingSession.
    // ts`'s two calls, which is what a tool change, a programmatic close or a
    // document reload takes. Driven directly rather than through a press,
    // because a press blurs the field before React unmounts anything and so
    // cannot produce the unmount-while-focused case at all.
    app.editor.setEditingShape(null);
    app.editor.complete();

    await waitFor(() => !control.isConnected, { what: "the control was removed from the DOM" });
    expect((app.editor.getShape(id) as BlockShapeLike).props.name).toBe("pose_from_frame");
    expect((await titleOf(id)).textContent).toBe("pose_from_frame");
  });

  it("switching the rail to another surface and back keeps the description exactly as typed", async () => {
    app = await mountApp();
    const id = placeBlock("estimate");
    await openInspector();
    app.editor.select(id);
    const field = await descriptionField();
    await userEvent.click(field);
    await typeWritingThrough(AWKWARD_TITLE, () => (app!.editor.getShape(id) as BlockShapeLike).props.description);

    const frames = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-frames"]'), {
      what: "the Frames surface switch",
    });
    await userEvent.click(frames);
    await waitFor(() => !field.isConnected, { what: "the surface switch unmounted the description field" });

    const back = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), {
      what: "the Inspector surface switch",
    });
    await userEvent.click(back);

    expect((await descriptionField()).value).toBe(AWKWARD_TITLE);
    expect((app.editor.getShape(id) as BlockShapeLike).props.description).toBe(AWKWARD_TITLE);
  });
});
