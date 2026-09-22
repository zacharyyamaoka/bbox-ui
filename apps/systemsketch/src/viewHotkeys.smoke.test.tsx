// src/viewHotkeys.smoke.test.tsx — 1/2/3/4 switch the selected Block's face,
// against the real mounted app.
//
// Zach, 2026-09-22: "add feature where clicking 1 or 2 or 3 or 4 when the
// block/region is expanded will switch it between simple, port, expanded,
// expanded opaque (if/when thoose views are support)". The policy under
// test is `chrome/ContextualPopupMenu/viewHotkeys.ts`. Every selection here
// is a real pointer press on the painted face (see
// `src/inspectorOpens.smoke.test.tsx`), every key press is a real
// `userEvent.keyboard`, and every claim about what painted is read off the
// DOM — `data-view` on the Block's own `[data-slot="block-port"]` wrapper
// (`@trunk/components/blockPort.tsx:369`), never bare presence.
import { createShapeId, type Editor, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { createCornerBlock } from "./shapes/region/cornerBlock";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "./shapes/types";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

function placeBlock(name: string, x: number, y: number, view: BlockShape["props"]["view"] = "port"): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, description: "", view, w: 220, h: 140, ports: NO_PORTS },
  } as never);
  return id;
}

function viewOf(id: TLShapeId): BlockShape["props"]["view"] {
  return (app!.editor.getShape(id) as BlockShape).props.view;
}

async function cardOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block"]`), { what: `the card of ${id}` });
}

/** The `data-view` tldraw's own `blockPort.tsx` stamps on ITS wrapper — the
 *  painted face's own record of which view it is showing, not a re-read of
 *  the shape's stored prop. */
async function paintedViewOf(id: TLShapeId): Promise<string | null> {
  const wrapper = await waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-port"]`), {
    what: `the block-port wrapper of ${id}`,
  });
  return wrapper.getAttribute("data-view");
}

/**
 * Centre of the card's HEADER, in viewport px — clicked rather than the
 * body's midpoint `src/inspectorOpens.smoke.test.tsx` uses, because that
 * fixture is always `view: "port"`. `expanded` is frame-like
 * (`BlockShapeUtil.tsx`'s own note beside `getGeometry`), and a press over
 * an EMPTY frame's body area does not select the frame — measured here as a
 * second block staying unselected however the first press was spaced. The
 * header is real Block chrome in every view, never frame content, so it
 * selects the shape regardless of which face is showing.
 */
async function headerPointOf(id: TLShapeId): Promise<{ x: number; y: number }> {
  const card = await cardOf(id);
  const header = await waitFor(() => card.querySelector<HTMLElement>(':scope > [data-slot="block-header"]'), { what: `the header of ${id}` });
  const rect = header.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

/**
 * A shift-click that ADDS a shape to the selection — dispatched through
 * `editor.dispatch` (`src/testing/harness.tsx`'s documented
 * `dispatchPointerTap` fallback, extended with `shiftKey: true`) rather than
 * a real held Shift key.
 *
 * WHY: a real held key via `userEvent.keyboard('{Shift>}')` / `{/Shift}`
 * measurably leaked past this file's own tests. Every test using it here
 * passed on its own, but the FULL suite ran two failures that are not on
 * the documented list (`app.smoke.test.tsx`'s tool-arming click,
 * `interfaceScale.smoke.test.tsx`'s pill-position check) — both click-driven,
 * both passing in isolation. Removing this file from the run made the full
 * suite go back to exactly the 9 documented failures; putting it back
 * reproduced the same 2 extra failures twice in a row. tldraw's own
 * `pointer_down`/`pointer_up` info carries `shiftKey` as a plain boolean on
 * the event, so dispatching it directly reaches the same `select.idle`
 * add-to-selection branch a real shift-click would, with no OS/CDP modifier
 * ever actually held — nothing left for a later file to inherit.
 */
function shiftClickAtScreen(editor: Editor, screen: { x: number; y: number }) {
  const base = {
    type: "pointer" as const,
    target: "canvas" as const,
    point: { x: screen.x, y: screen.y, z: 0.5 },
    pointerId: 1,
    button: 0,
    isPen: false,
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    accelKey: false,
  };
  editor.dispatch({ ...base, name: "pointer_down" });
  editor.dispatch({ ...base, name: "pointer_up" });
}

async function clickBlock(id: TLShapeId, addToSelection = false) {
  const point = await headerPointOf(id);
  if (addToSelection) shiftClickAtScreen(app!.editor, point);
  else await clickAtScreen(point);
}

/** How many Ctrl+Z it takes for `predicate` to become true, capped so a
 *  failure reports a real number rather than hanging — the same idiom
 *  `src/undoGranularity.smoke.test.tsx` uses for P-014. */
async function undoStepsUntil(predicate: () => boolean, what: string): Promise<number> {
  for (let step = 1; step <= 10; step += 1) {
    app!.editor.undo();
    await nextFrame();
    if (predicate()) return step;
  }
  throw new Error(`${what}: 10 undos never satisfied it`);
}

describe("1/2/3 switch the selected Block's view", () => {
  it("pressing 1 then 3 writes props.view and the painted face follows", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300, "port");
    await clickBlock(id);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === id ? true : null), { what: "the block selected" });
    expect(viewOf(id)).toBe("port");

    await userEvent.keyboard("1");
    await waitFor(() => (viewOf(id) === "simple" ? true : null), { what: "props.view -> simple" });
    expect(await paintedViewOf(id)).toBe("simple");

    await userEvent.keyboard("3");
    await waitFor(() => (viewOf(id) === "expanded" ? true : null), { what: "props.view -> expanded" });
    expect(await paintedViewOf(id)).toBe("expanded");
  });

  it("multi-select: 1 sets every selected block to Simple", async () => {
    app = await mountApp();
    const a = placeBlock("estimate()", 200, 260, "port");
    const b = placeBlock("refine()", 560, 260, "expanded");
    await clickBlock(a);
    await clickBlock(b, true);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "both blocks selected" });

    await userEvent.keyboard("1");

    await waitFor(() => (viewOf(a) === "simple" && viewOf(b) === "simple" ? true : null), { what: "both blocks switched to simple" });
    expect(await paintedViewOf(a)).toBe("simple");
    expect(await paintedViewOf(b)).toBe("simple");
  });

  it("one Ctrl+Z restores every shape a key press touched", async () => {
    app = await mountApp();
    const a = placeBlock("estimate()", 200, 260, "port");
    const b = placeBlock("refine()", 560, 260, "expanded");
    await clickBlock(a);
    await clickBlock(b, true);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "both blocks selected" });
    // A clean boundary before the gesture under test, same reasoning
    // `undoGranularity.smoke.test.tsx` gives for marking before a bare
    // `createShape`: without it the undo below could reach past this
    // press into the fixtures' own creation.
    app.editor.markHistoryStoppingPoint("fixture");

    await userEvent.keyboard("1");
    await waitFor(() => (viewOf(a) === "simple" && viewOf(b) === "simple" ? true : null), { what: "both switched to simple" });

    app.editor.focus();
    const steps = await undoStepsUntil(() => viewOf(a) === "port" && viewOf(b) === "expanded", "one Ctrl+Z restoring both blocks");
    expect(steps).toBe(1);
    expect(app.editor.getShape(a), "block a survived").toBeDefined();
    expect(app.editor.getShape(b), "block b survived").toBeDefined();
  });

  it("4 (expanded opaque) is a no-op — no BlockView carries it yet", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300, "port");
    await clickBlock(id);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === id ? true : null), { what: "the block selected" });

    await userEvent.keyboard("4");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(viewOf(id)).toBe("port");
    expect(await paintedViewOf(id)).toBe("port");
  });

  it("nothing selected: 1/2/3/4 do nothing", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300, "port");
    await cardOf(id);
    app.editor.selectNone();
    app.editor.focus();
    await waitFor(() => app!.editor.getInstanceState().isFocused, { what: "the canvas focused" });

    await userEvent.keyboard("1");
    await userEvent.keyboard("2");
    await userEvent.keyboard("3");
    await userEvent.keyboard("4");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(viewOf(id)).toBe("port");
  });
});

describe("a region has no view prop to write — the key is a no-op on it", () => {
  it("a mixed selection of a block and a region's corner card: only the block changes", async () => {
    app = await mountApp();
    const regionId = createShapeId();
    app.editor.createShape({ id: regionId, type: REGION_SHAPE_TYPE, x: 40, y: 400, props: { kind: "while", name: "While Loop", w: 460, h: 260 } } as never);
    const cardId = createCornerBlock(app.editor, regionId, "while");
    if (!cardId) throw new Error("no corner card minted");
    await cardOf(cardId);
    const before = JSON.parse(JSON.stringify(app.editor.getShape(regionId)!.props)) as unknown;

    const blockId = placeBlock("estimate()", 700, 300, "port");
    await clickBlock(blockId);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === blockId ? true : null), { what: "the block selected" });
    // Shift-click the corner card: `cornerBlock.ts`'s `redirectCornerSelection`
    // turns a press on the card into a selection of the REGION, so this adds
    // the region — not the card — to the selection.
    await clickBlock(cardId, true);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "block + region selected" });
    expect(app.editor.getSelectedShapeIds()).toContain(regionId);

    await userEvent.keyboard("1");

    await waitFor(() => (viewOf(blockId) === "simple" ? true : null), { what: "the block switched to simple" });
    // `ss-region` has no `view` field at all (RegionShapeUtil.tsx's schema) —
    // the region's props are byte-identical to before the press, not merely
    // missing a `view` key.
    expect(JSON.parse(JSON.stringify(app.editor.getShape(regionId)!.props))).toEqual(before);
  });
});

describe("typing in the Inspector never fires a view hotkey", () => {
  const railPanel = () => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"]');
  const subjectText = () => railPanel()?.querySelector<HTMLElement>('[data-slot="inspector-subject"]')?.textContent ?? null;

  it("typing \"1\" into the description changes the description, not the view", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300, "port");
    await clickBlock(id);
    await waitFor(() => (subjectText() === "estimate()" ? true : null), { what: "the Inspector naming estimate()" });

    const field = await waitFor(
      () => railPanel()?.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]') ?? null,
      { what: "the description field" },
    );
    await userEvent.click(field);
    await userEvent.keyboard("1");

    await waitFor(() => (field.value === "1" ? true : null), { what: "the \"1\" landing in the description" });
    expect((app.editor.getShape(id) as BlockShape).props.description).toBe("1");
    expect(viewOf(id), "the view never moved").toBe("port");
  });
});
