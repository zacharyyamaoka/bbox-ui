// src/inspector.smoke.test.tsx — RULING 9's acceptance, against the real
// mounted app.
//
// Zach: "the eye visibility control for this is in the right hand inspector
// menu." The previous wave's failure this file is written against is a
// mechanism with no callers — a pure layer, a green unit test, a story, and
// NOTHING on the board. So every assertion here goes through the running
// app's own chrome and measures the effect on the BOARD or on the persisted
// shape record, never the presence of a control:
//
//   - the launcher in the bottom-right status strip actually opens a panel;
//   - the panel names the SELECTED block;
//   - pressing its eye writes `showDescription` into `ss-block`'s props AND
//     removes the sentence from the block's own painted DOM;
//   - pressing it again brings the authored characters back, which is what
//     makes it an eye and not a delete;
//   - typing in the panel reaches the shape the canvas is painting.
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/** Authored with a double space on purpose: `feedback_truthful_property_rendering`
 *  applies to a description exactly as it does to a port declaration. */
const TEXT = "Estimates  pose from a frame.";

function placeBlock(name: string, description: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, description, view: "port", w: 220, h: 140, ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

function propsOf(id: TLShapeId): BlockShape["props"] {
  return (app!.editor.getShape(id) as BlockShape).props;
}

/** The block's painted face on the canvas — `BlockPort` stamps the tldraw
 *  shape id as `data-block-id` (shapes/block/BlockFace.tsx). */
function faceOf(id: TLShapeId): HTMLElement {
  const face = app!.root.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!face) throw new Error(`no painted face for ${id}`);
  return face;
}

const sentenceOn = (id: TLShapeId) => faceOf(id).querySelector<HTMLElement>('[data-slot="block-description"]');

/**
 * Open the right rail on the Inspector the way a person does: the status
 * strip's Frames launcher opens the rail, then the rail's own surface switch
 * moves it to the Inspector. Two real presses, no state setter.
 *
 * WHY there is no Inspector launcher in the strip to press instead — measured,
 * and `chrome/panels.tsx`'s `SurfaceSwitch` carries the numbers: a sixth strip
 * cell lifts the bottom-right cluster off the corner row, the placement Zach
 * rejected. The last assertion in the first test below is this file's own
 * guard on that.
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

describe("ruling 9 — the description, and its eye in the right-hand inspector", () => {
  it("paints the stored description on the block face, character for character", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", TEXT, 300, 300);
    const sentence = await waitFor(() => sentenceOn(id), { what: "the description on the block face" });
    expect(sentence.textContent).toBe(TEXT);
    // It is INSIDE the card, below the header — measured, not inferred from
    // DOM order.
    const face = faceOf(id).getBoundingClientRect();
    const rect = sentence.getBoundingClientRect();
    expect(rect.top).toBeGreaterThan(face.top);
    expect(rect.bottom).toBeLessThanOrEqual(face.bottom + 1);
  });

  it("reaching the inspector costs the corner row nothing — the cluster is still beside the licence", async () => {
    app = await mountApp();
    app.editor.select(placeBlock("estimate()", TEXT, 300, 300));
    await openInspector();
    // The whole reason the Inspector is a rail SURFACE and not a sixth strip
    // launcher (chrome/panels.tsx's `SurfaceSwitch`, with the measurements).
    // `src/corner.smoke.test.tsx` owns this rule; this is the one assertion
    // that ties ruling 9 to it, so a future lane that "just adds a launcher"
    // fails here as well as there.
    const placed = await waitFor(() => app!.root.querySelector<HTMLElement>("[data-corner-placement]"), { what: "the corner cluster" });
    expect(placed.getAttribute("data-corner-placement")).toBe("beside-licence");
  });

  it("the eye writes the shape prop AND removes the sentence from the board; pressing it again restores the text", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", TEXT, 300, 300);
    await waitFor(() => sentenceOn(id), { what: "the description on the block face" });
    app.editor.select(id);

    const panel = await openInspector();
    // The panel is about the SELECTED block, not about the first one on the
    // page.
    const subject = await waitFor(() => panel.querySelector<HTMLElement>('[data-slot="inspector-subject"]'), { what: "the subject" });
    expect(subject.textContent).toBe("estimate()");

    const eye = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="ss-inspector-description-eye"]'), { what: "the eye" });
    expect(eye.getAttribute("aria-pressed")).toBe("true");
    expect(propsOf(id).showDescription).toBe(true);

    await userEvent.click(eye);

    // THE DOCUMENT changed…
    await waitFor(() => propsOf(id).showDescription === false, { what: "showDescription false on the shape record" });
    // …and so did the BOARD.
    await waitFor(() => (sentenceOn(id) === null ? true : null), { what: "the sentence gone from the block face" });
    // Hiding is not deleting: the text is still on the record and still in
    // the field, so nothing was thrown away.
    expect(propsOf(id).description).toBe(TEXT);
    const field = panel.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]');
    expect(field?.value).toBe(TEXT);

    await userEvent.click(eye);
    const again = await waitFor(() => sentenceOn(id), { what: "the description back on the block face" });
    expect(again.textContent).toBe(TEXT);
    expect(propsOf(id).showDescription).toBe(true);
  });

  it("typing in the inspector reaches the shape the canvas is painting", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", "", 300, 300);
    app.editor.select(id);
    const panel = await openInspector();

    // An empty description paints nothing even with the eye on — the frozen
    // v1 gate (`resolved.description && data.description`).
    expect(propsOf(id).showDescription).toBe(true);
    expect(sentenceOn(id)).toBeNull();

    const field = await waitFor(() => panel.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]'), {
      what: "the description field",
    });
    await userEvent.fill(field, "Reads a frame.");

    await waitFor(() => propsOf(id).description === "Reads a frame.", { what: "the description on the shape record" });
    const sentence = await waitFor(() => sentenceOn(id), { what: "the description on the block face" });
    expect(sentence.textContent).toBe("Reads a frame.");
  });

  it("nothing selected gets copy, not a blank column", async () => {
    app = await mountApp();
    placeBlock("estimate()", TEXT, 300, 300);
    app.editor.selectNone();
    const panel = await openInspector();
    const empty = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="ss-inspector-empty"]'), { what: "the empty state" });
    expect(empty.textContent).toContain("Select a block");
  });
});
