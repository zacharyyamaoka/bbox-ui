// src/diffMark.smoke.test.tsx — P-035, against the real mounted app in real
// headless Chromium.
//
// Zach's line on the item is "all the visual primitives should support kinda
// these states". The claim under test is NOT "a prop exists" — it is that the
// mark is a genuine tldraw `StyleProp`, which in this repo's reading means
// three things at once:
//
//   1. one press sets it on EVERY selected shape, across kinds;
//   2. it ARMS the next shape drawn;
//   3. it persists on the record.
//
// Each is measured on the editor and on the painted DOM, never on the presence
// of a button — `selectionPill.smoke.test.tsx`'s own rule, and the reason it
// exists: a pill full of controls wired to nothing passes a DOM-presence suite
// completely.
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { DiffMarkStyle } from "./shapes/shared/diffMark";
import { BLOCK_SHAPE_TYPE, PORT_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

function placeBlock(name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, view: "port", ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

function placePort(x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: PORT_SHAPE_TYPE, x, y, props: { declaration: "gain: float" } } as never);
  return id;
}

/** A LOOSE cable — no bindings, so it needs no drag gesture to exist. Its
 *  `diff` is the only thing this file asks of it. */
function placeWire(x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: WIRE_SHAPE_TYPE, x: 0, y: 0, props: { start: { x, y }, end: { x: x + 140, y } } } as never);
  return id;
}

function markOf(id: TLShapeId): string {
  return (app!.editor.getShape(id)!.props as { diff: string }).diff;
}

async function pill(): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
    what: "the floating toolbar visible",
  });
}

/** Press the Diff control's trigger, then the named value inside its panel —
 *  the REAL user path, through the pill, not `setStyleForSelectedShapes`.
 *
 *  SELECTORS MOVED, 2026-09-24, and nothing this file asserts moved with them.
 *  The pill's six per-style rows were replaced by the trunk's `ControlStrip`
 *  over `chrome/ContextualPopupMenu/appearanceModel.ts`, so the Diff row is now
 *  a control with `id: "diff"` in the recipe's last group:
 *
 *    ss-style-diff        → ss-control-diff
 *    ss-style-diff-panel  → ss-control-panel-diff
 *    ss-style-diff-<v>    → [data-control="diff"][data-value="<v>"]
 *
 *  The last one is the kit's contract rather than a rename: a `ControlPanel`
 *  option button carries no test id at all (`controlPanel.tsx`'s
 *  `ControlOptionButton`), so control-and-value IS how an option is addressed.
 *  Everything below still measures the editor and the painted DOM, never the
 *  presence of a button. */
async function pressDiff(value: string): Promise<void> {
  const bar = await pill();
  const trigger = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-control-diff"]'), {
    what: "the Diff control's trigger on the pill",
  });
  await userEvent.click(trigger);
  // The panel portals to document.body, so it is not inside `bar`.
  const panel = await waitFor(() => document.querySelector<HTMLElement>('[data-testid="ss-control-panel-diff"]'), {
    what: "the Diff panel",
  });
  const option = await waitFor(() => panel.querySelector<HTMLElement>(`[data-control="diff"][data-value="${value}"]`), {
    what: `the "${value}" option`,
  });
  await userEvent.click(option);
  await userEvent.keyboard("{Escape}");
}

describe("P-035 — the diff mark is a real StyleProp", () => {
  it("ONE press marks a block, a port AND a cable at once — the cross-kind write is the whole reason it is a style", async () => {
    // This is the case that separates `ss:diff` from `routing` and `tunnel`,
    // which `selectionActions.ts:151,176` deliberately keep as plain props
    // BECAUSE "a style writes to the OTHER kinds in a mixed selection". Here
    // that is the feature: marking a proposed change means marking the block,
    // its port and the cable that came with them, in one gesture.
    app = await mountApp();
    const block = placeBlock("estimate()", 300, 300);
    const port = placePort(560, 300);
    const wire = placeWire(300, 520);
    app.editor.select(block, port, wire);

    expect([markOf(block), markOf(port), markOf(wire)], "all three start unmarked").toEqual(["normal", "normal", "normal"]);

    await pressDiff("added");

    await waitFor(
      () => (markOf(block) === "added" && markOf(port) === "added" && markOf(wire) === "added" ? true : null),
      { what: `all three marked (block=${markOf(block)} port=${markOf(port)} wire=${markOf(wire)})` },
    );

    // And it is ONE undo, because `setStyle` marks a stopping point before the
    // write — the same idiom `arrangeActions.ts` uses for align.
    app.editor.undo();
    await waitFor(() => (markOf(block) === "normal" && markOf(wire) === "normal" ? true : null), {
      what: "one undo clears the whole batch",
    });
  });

  it("the mark is PAINTED inside the block's own box, in the ink the mark table names", async () => {
    app = await mountApp();
    const block = placeBlock("estimate()", 300, 300);
    app.editor.select(block);
    await pressDiff("removed");

    const layer = await waitFor(
      () => app!.root.querySelector<HTMLElement>(`[data-shape-id="${block}"] [data-slot="ss-diff-mark"]`),
      { what: "the diff mark layer on the block" },
    );
    expect(layer.getAttribute("data-ss-diff")).toBe("removed");

    // INSIDE the box, not around it — `docs/INVALID-STATES-PLAN.md` §6 leaves
    // outer box-shadows to the diagnostic axis so a shape can be changed AND
    // broken at once. An `inset` shadow is what that rule looks like in CSS,
    // and `getComputedStyle` is the only honest way to tell the two apart.
    const shadow = getComputedStyle(layer).boxShadow;
    expect(shadow, `the ring is INSET, not an outer glow (got ${shadow})`).toContain("inset");

    // The sign is drawn, and it is the real minus sign the mark table names.
    const sign = layer.querySelector<HTMLElement>('[data-slot="ss-diff-sign"]');
    expect(sign?.textContent).toBe("−");

    // The layer must not add a grab surface: it covers the whole face, so a
    // marked block that answered hit tests here would swallow every press on
    // its own body.
    expect(getComputedStyle(layer).pointerEvents).toBe("none");
  });

  it("marking a block does NOT resize it — the layer is out of flow, so the measured hug is unchanged", async () => {
    // The trap this pins: `NodeShapeFrame`'s wrapper is `width: max-content`
    // and `useMeasuredShape` writes that hug back into `props.w`/`props.h`. An
    // in-flow mark element would widen the record the moment the user marked
    // it, i.e. marking a block would move every cable attached to it.
    app = await mountApp();
    const block = placeBlock("estimate()", 300, 300);
    app.editor.select(block);
    await waitFor(() => (app!.editor.getShape(block)!.props as { w: number }).w > 0 ? true : null, { what: "a measured width" });
    const before = app.editor.getShape(block)!.props as { w: number; h: number };
    const size = { w: before.w, h: before.h };

    await pressDiff("added");
    await waitFor(() => (markOf(block) === "added" ? true : null), { what: "the mark to land" });
    // Give the measurement pass every chance to run and report a change.
    await waitFor(() => (app!.root.querySelector(`[data-shape-id="${block}"] [data-slot="ss-diff-mark"]`) ? true : null), {
      what: "the mark painted",
    });

    const after = app.editor.getShape(block)!.props as { w: number; h: number };
    expect(Math.abs(after.w - size.w), `width unchanged by marking (${size.w} -> ${after.w})`).toBeLessThan(0.5);
    expect(Math.abs(after.h - size.h), `height unchanged by marking (${size.h} -> ${after.h})`).toBeLessThan(0.5);
  });

  it("a marked cable repaints its own stroke, and taking the mark off brings the authored colour back", async () => {
    // A line has no fill, so its stroke IS its fill channel — §6 puts "cable
    // backdrops" on the diagnostic side. The second half is the load-bearing
    // one: the mark is a LENS over `props.color`, never an edit of it.
    app = await mountApp();
    const wire = placeWire(320, 400);
    app.editor.updateShape({ id: wire, type: WIRE_SHAPE_TYPE, props: { color: "#ff00ff" } } as never);
    app.editor.select(wire);

    const line = await waitFor(
      () => app!.root.querySelector<SVGPathElement>(`[data-shape-id="${wire}"] [data-slot="trace-line"]`),
      { what: "the painted cable" },
    );
    const authored = getComputedStyle(line).stroke;

    await pressDiff("modified");
    await waitFor(() => (markOf(wire) === "modified" ? true : null), { what: "the cable marked" });
    await waitFor(
      () => (getComputedStyle(line).stroke !== authored ? true : null),
      { what: `the stroke to change away from the authored colour (${authored})` },
    );
    // The mark is on the group too, so a stylesheet or a test can find it.
    expect(app.root.querySelector(`[data-shape-id="${wire}"] [data-ss-diff="modified"]`)).not.toBeNull();
    // `props.color` is untouched — that is what makes the lens reversible.
    expect((app.editor.getShape(wire)!.props as { color: string }).color).toBe("#ff00ff");

    await pressDiff("normal");
    await waitFor(() => (getComputedStyle(line).stroke === authored ? true : null), {
      what: `the authored colour to come back (${authored})`,
    });
  });

  it("ARMS the next shape: after marking, a block created by the app is born with the same mark", async () => {
    // Criterion 2, and the one a plain prop can never have. tldraw folds
    // `getStyleForNextShape` into the initial props of EVERY new shape
    // (Editor.mjs:6336-6338), so annotating a proposal — drawing three more
    // blocks that are all part of the change — is one press, not one per
    // shape. Note the new block is created with an explicit `props` object
    // that says nothing about `diff`: the arming has to survive that merge.
    app = await mountApp();
    app.editor.select(placeBlock("first", 300, 300));
    await pressDiff("added");
    await waitFor(() => (app!.editor.getStyleForNextShape(DiffMarkStyle) === "added" ? true : null), {
      what: "the style armed for the next shape",
    });

    const next = placeBlock("second", 700, 300);
    expect(markOf(next), "the NEXT block is born marked").toBe("added");
    // And it is armed for a different KIND too, which is what "every visual
    // primitive" means.
    expect(markOf(placeWire(300, 560)), "so is the next cable").toBe("added");
  });

  it("PERSISTS: the mark survives a save and reload of the document", async () => {
    // Criterion 3. `showDescription` and `glyph` earned persistence on ruling
    // 9's test — an authoring decision about the document, which a board that
    // forgot it on reload would lie about. A diff mark is the same kind of
    // decision; `error`/`warning` are NOT, which is why they are no part of
    // this prop (`shapes/shared/diffMark.ts`).
    app = await mountApp();
    const block = placeBlock("estimate()", 300, 300);
    app.editor.select(block);
    await pressDiff("removed");
    await waitFor(() => (markOf(block) === "removed" ? true : null), { what: "the mark to land" });

    const snapshot = app.editor.getSnapshot();
    app.editor.loadSnapshot(app.editor.getSnapshot()); // no-op round trip, then the real one
    app.editor.selectNone();
    app.editor.deleteShapes([block]);
    expect(app.editor.getShape(block), "deleted").toBeUndefined();

    app.editor.loadSnapshot(snapshot);
    expect(markOf(block), "the mark came back off the document").toBe("removed");
  });
});
