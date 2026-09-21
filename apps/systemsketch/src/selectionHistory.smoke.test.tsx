// src/selectionHistory.smoke.test.tsx — parity item P-029, "mouse back and
// forward buttons walk the selection history", driven in the real app.
//
// WHY the presses are dispatched as real `PointerEvent`s on `window` rather
// than through `userEvent`: Playwright's mouse API exposes left/middle/right
// only — there is no way to ask it for button 3 or 4, which is the whole
// gesture. What is NOT faked here is everything else: the real `<App/>`, the
// real tldraw editor, the real `installSelectionHistory` listener attached by
// the real `onMount`, and the selection read back off the editor.
//
// The one thing this file cannot prove is that `preventDefault` on `mouseup`
// stops Chrome navigating away — a headless page has no history to go back to.
// It asserts the call instead (`defaultPrevented`), which is the observable
// half; the browser behaviour behind it is the measurement cited at the seam.
import { createShapeId, type TLShapeId } from "tldraw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;

beforeEach(() => {
  setDocumentLocation(memoryDocumentLocation());
});

afterEach(() => {
  app?.unmount();
  app = null;
  resetLaunchConfig();
});

const BACK = 3;
const FORWARD = 4;

/** A real side-button press, on the element under the pointer. */
function press(button: number, target: EventTarget = document.body): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { button, buttons: 0, bubbles: true, cancelable: true, composed: true }),
  );
}

/** The release, which is the event the listener has to swallow. */
function release(button: number, target: EventTarget = document.body): MouseEvent {
  const event = new MouseEvent("mouseup", { button, bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

function placeBlock(name: string, x: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y: 200,
    props: { name, description: "", view: "port", w: 160, h: 120, ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

const selected = () => app!.editor.getSelectedShapeIds().map(String).sort();

describe("The mouse's side buttons walk the selection history", () => {
  it("back returns to the previous selection, forward returns to the newer one", async () => {
    app = await mountApp();
    const first = placeBlock("first", 80);
    const second = placeBlock("second", 300);
    const third = placeBlock("third", 520);

    app.editor.setSelectedShapes([first]);
    app.editor.setSelectedShapes([second]);
    app.editor.setSelectedShapes([third]);
    await waitFor(() => selected().join() === String(third), { what: "the third block selected" });

    press(BACK);
    await waitFor(() => selected().join() === String(second), {
      what: `back once; selection is ${selected().join()}`,
    });

    press(BACK);
    await waitFor(() => selected().join() === String(first), {
      what: `back twice; selection is ${selected().join()}`,
    });

    press(FORWARD);
    await waitFor(() => selected().join() === String(second), {
      what: `forward once; selection is ${selected().join()}`,
    });
  });

  it("swallows the release of BOTH side buttons even when it has nowhere to go", async () => {
    app = await mountApp();
    // Nothing recorded at all: the ends of an EMPTY journal are still ours, or
    // Chrome leaves the page and takes the unsaved board with it.
    expect(release(BACK).defaultPrevented).toBe(true);
    expect(release(FORWARD).defaultPrevented).toBe(true);
    // And an ordinary left-click release is left completely alone.
    expect(release(0).defaultPrevented).toBe(false);
  });

  it("does not hijack the button while the pointer is over a text field", async () => {
    app = await mountApp();
    const first = placeBlock("first", 80);
    const second = placeBlock("second", 300);
    app.editor.setSelectedShapes([first]);
    app.editor.setSelectedShapes([second]);
    await waitFor(() => selected().join() === String(second));

    const field = document.createElement("input");
    document.body.appendChild(field);
    press(BACK, field);
    // Give the reaction the same window a real step would have had.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(selected().join()).toBe(String(second));
    field.remove();

    // The same press over the canvas DOES step — so the line above is a guard,
    // not a dead gesture.
    press(BACK);
    await waitFor(() => selected().join() === String(first), { what: "back over the canvas" });
  });

  it("walks past a selection whose shapes have been deleted", async () => {
    app = await mountApp();
    const first = placeBlock("first", 80);
    const doomed = placeBlock("doomed", 300);
    const third = placeBlock("third", 520);

    app.editor.setSelectedShapes([first]);
    app.editor.setSelectedShapes([doomed]);
    app.editor.setSelectedShapes([third]);
    await waitFor(() => selected().join() === String(third));

    app.editor.deleteShapes([doomed]);

    press(BACK);
    await waitFor(() => selected().join() === String(first), {
      what: `one press back should skip the deleted entry; selection is ${selected().join()}`,
    });
  });

  it("goes back to a selection on another page, switching to that page", async () => {
    app = await mountApp();
    const here = placeBlock("here", 80);
    app.editor.setSelectedShapes([here]);

    const firstPage = app.editor.getCurrentPageId();
    app.editor.createPage({ name: "Second page" });
    const secondPage = app.editor.getPages().find((page) => page.id !== firstPage)!;
    app.editor.setCurrentPage(secondPage.id);
    const there = placeBlock("there", 80);
    app.editor.setSelectedShapes([there]);
    await waitFor(() => selected().join() === String(there));

    press(BACK);
    await waitFor(() => app!.editor.getCurrentPageId() === firstPage, {
      what: "back to the first page",
    });
    expect(selected().join()).toBe(String(here));
  });
});
