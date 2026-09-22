// src/inspectorOpens.smoke.test.tsx — clicking an object opens the right-hand
// Inspector on it, against the real mounted app.
//
// Zach, 2026-09-21: "We need the right inspect menu to come up when we click on
// objects! can you please implement this asap!!!" The policy under test is
// `chrome/inspectorFollowsSelection.ts`. Every press here is a real Playwright
// pointer event on the painted face, every selection or movement claim is read
// from the engine, and every panel claim names the subject it shows — never
// the bare presence of a control.
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import type { BlockShape } from "./shapes/block/BlockShapeUtil";
import { createCornerBlock } from "./shapes/region/cornerBlock";
import { BLOCK_SHAPE_TYPE, REGION_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/** A body press only selects a block whose body paints something — the
 *  description is what gives a simple/port card a body at all
 *  (`blockBodyPress.smoke.test.tsx`'s fixture note). */
const DESCRIPTION = "reads a frame and answers with a pose";

function placeBlock(name: string, x: number, y: number, description = DESCRIPTION): TLShapeId {
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

async function cardOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block"]`), { what: `the card of ${id}` });
}

/** Mid-body of the card, in viewport px, measured off the rendered boxes. */
async function bodyPointOf(id: TLShapeId): Promise<{ x: number; y: number }> {
  const card = await cardOf(id);
  const header = await waitFor(() => card.querySelector<HTMLElement>(':scope > [data-slot="block-header"]'), { what: `the header of ${id}` });
  const cardRect = card.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  return { x: cardRect.left + cardRect.width / 2, y: (headerRect.bottom + cardRect.bottom) / 2 };
}

/** A real press at an exact viewport point (see blockBodyPress.smoke.test.tsx). */
async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

async function clickBlock(id: TLShapeId) {
  await clickAtScreen(await bodyPointOf(id));
}

/** Bare canvas — clear of every fixture below, of the top-left bar, the
 *  bottom-centre dock and the right rail. */
const EMPTY = { x: 640, y: 640 };

const railPanel = () => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"]');
const inspectorPanel = () => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="inspector"]');
const subjectText = () => inspectorPanel()?.querySelector<HTMLElement>('[data-slot="inspector-subject"]')?.textContent ?? null;

async function inspectorNaming(name: string): Promise<HTMLElement> {
  return waitFor(() => (subjectText() === name ? inspectorPanel() : null), { what: `the Inspector naming ${name}` });
}

/** Let any selection-driven React update land before asserting an absence. */
async function settle() {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function pressStrip(testId: string) {
  const launcher = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-testid="${testId}"]`), { what: testId });
  await userEvent.click(launcher);
}

/** Open the Inspector by hand: Frames launcher, then the rail's surface switch. */
async function openInspectorByHand(): Promise<HTMLElement> {
  await pressStrip("ss-status-frames");
  const tab = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), { what: "the Inspector surface switch" });
  await userEvent.click(tab);
  return waitFor(inspectorPanel, { what: "the inspector panel" });
}

describe("clicking an object opens the right-hand Inspector on it", () => {
  it("a click on a block opens the rail on the Inspector, naming that block", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await cardOf(id);
    await settle();
    expect(railPanel(), "nothing open before the click").toBeNull();

    await clickBlock(id);

    await inspectorNaming("estimate()");
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    // The panel is the real one, wired to that block: its field carries the
    // block's own stored description.
    const field = inspectorPanel()!.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]');
    expect(field?.value).toBe(DESCRIPTION);
  });

  it("clicking another block while it is open retargets the SAME panel — no close and reopen", async () => {
    app = await mountApp();
    const a = placeBlock("estimate()", 200, 260);
    const b = placeBlock("refine()", 520, 260);
    await clickBlock(a);
    const panel = await inspectorNaming("estimate()");

    // Any close/reopen would unmount the shell; record every removal.
    let removed = false;
    const watch = new MutationObserver((records) => {
      for (const record of records) for (const node of record.removedNodes) if (node === panel || (node as Element).contains?.(panel)) removed = true;
    });
    watch.observe(app.root, { childList: true, subtree: true });

    await clickBlock(b);
    await inspectorNaming("refine()");
    watch.disconnect();
    expect(app.editor.getSelectedShapeIds()).toEqual([b]);
    expect(inspectorPanel()).toBe(panel);
    expect(removed, "the panel shell was never removed").toBe(false);
  });

  it("an edit made after the click lands on the clicked block", async () => {
    app = await mountApp();
    const a = placeBlock("estimate()", 200, 260);
    const b = placeBlock("refine()", 520, 260);
    await clickBlock(a);
    await clickBlock(b);
    const panel = await inspectorNaming("refine()");
    const field = panel.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]')!;
    await userEvent.fill(field, "Refines a pose.");
    await waitFor(() => propsOf(b).description === "Refines a pose.", { what: "the description on refine()" });
    expect(propsOf(a).description).toBe(DESCRIPTION);
  });
});

describe("the Inspector follows deselection only when a click opened it", () => {
  it("clicking empty canvas closes an Inspector the click opened", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await clickBlock(id);
    await inspectorNaming("estimate()");

    await clickAtScreen(EMPTY);

    await waitFor(() => app!.editor.getSelectedShapeIds().length === 0, { what: "the selection cleared" });
    await waitFor(() => (railPanel() === null ? true : null), { what: "the rail closed" });
  });

  it("Escape closes an Inspector the click opened", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await clickBlock(id);
    await inspectorNaming("estimate()");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => app!.editor.getSelectedShapeIds().length === 0, { what: "the selection cleared" });
    await waitFor(() => (railPanel() === null ? true : null), { what: "the rail closed" });
  });

  it("an Inspector the user opened stays open on its empty state when they deselect", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await cardOf(id);
    await openInspectorByHand();

    await clickBlock(id);
    await inspectorNaming("estimate()");

    await clickAtScreen(EMPTY);
    await waitFor(() => app!.editor.getSelectedShapeIds().length === 0, { what: "the selection cleared" });
    await settle();
    const panel = inspectorPanel();
    expect(panel, "still open").not.toBeNull();
    const empty = await waitFor(() => panel!.querySelector<HTMLElement>('[data-testid="ss-inspector-empty"]'), { what: "the empty state" });
    expect(empty.textContent).toContain("Select a block");
  });

  it("switching an auto-opened rail by hand makes it the user's — deselecting no longer closes it", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await clickBlock(id);
    await inspectorNaming("estimate()");
    // The rail's own surface switch is a user action on the rail.
    const frames = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-frames"]'), { what: "Frames switch" });
    await userEvent.click(frames);
    const inspector = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-panel-surface-inspector"]'), { what: "Inspector switch" });
    await userEvent.click(inspector);
    await inspectorNaming("estimate()");

    await clickAtScreen(EMPTY);
    await waitFor(() => app!.editor.getSelectedShapeIds().length === 0, { what: "the selection cleared" });
    await settle();
    expect(inspectorPanel(), "the user's panel stays").not.toBeNull();
  });
});

describe("selecting never hijacks a rail showing Frames or Problems", () => {
  for (const [surface, launcher] of [
    ["frames", "ss-status-frames"],
    ["problems", "ss-status-problems"],
  ] as const) {
    it(`${surface} stays showing when a block is clicked`, async () => {
      app = await mountApp();
      const id = placeBlock("estimate()", 300, 300);
      await cardOf(id);
      await pressStrip(launcher);
      await waitFor(() => app!.root.querySelector(`[data-slot="panel-shell"][data-surface="${surface}"]`), { what: `the ${surface} panel` });

      await clickBlock(id);
      await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === id ? true : null), { what: "the block selected" });
      await settle();
      expect(railPanel()?.getAttribute("data-surface")).toBe(surface);

      // …and deselecting does not close it either: it was never the click's.
      await clickAtScreen(EMPTY);
      await waitFor(() => app!.editor.getSelectedShapeIds().length === 0, { what: "the selection cleared" });
      await settle();
      expect(railPanel()?.getAttribute("data-surface")).toBe(surface);
    });
  }
});

describe("the canvas gestures around a click are intact", () => {
  it("a press-drag on a block still moves it by the distance dragged", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    const start = await bodyPointOf(id);
    const before = { x: app.editor.getShape(id)!.x, y: app.editor.getShape(id)!.y };
    const element = document.elementFromPoint(start.x, start.y)!;
    const rect = element.getBoundingClientRect();
    await userEvent.dragAndDrop(element, canvasOf(app.root), {
      sourcePosition: { x: Math.round(start.x - rect.left), y: Math.round(start.y - rect.top) },
      targetPosition: { x: Math.round(start.x + 120), y: Math.round(start.y + 60) },
    });
    await waitFor(() => (app!.editor.getShape(id)!.x !== before.x ? true : null), { what: "the block moved" });
    const after = app.editor.getShape(id)!;
    expect(Math.abs(after.x - before.x - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - before.y - 60)).toBeLessThanOrEqual(2);
  });

  it("a marquee over several blocks does not open the Inspector", async () => {
    app = await mountApp();
    const a = placeBlock("estimate()", 200, 260);
    const b = placeBlock("refine()", 480, 260);
    await cardOf(a);
    await cardOf(b);
    const canvas = canvasOf(app.root);
    // From empty canvas above-left of both to below-right of both.
    const from = app.editor.pageToViewport({ x: 150, y: 200 });
    const to = app.editor.pageToViewport({ x: 760, y: 460 });
    const startEl = document.elementFromPoint(from.x, from.y)!;
    const startRect = startEl.getBoundingClientRect();
    await userEvent.dragAndDrop(startEl, canvas, {
      sourcePosition: { x: Math.round(from.x - startRect.left), y: Math.round(from.y - startRect.top) },
      targetPosition: { x: Math.round(to.x), y: Math.round(to.y) },
    });
    await waitFor(() => (app!.editor.getSelectedShapeIds().length === 2 ? true : null), { what: "both blocks marquee-selected" });
    await settle();
    expect(railPanel()).toBeNull();
  });

  it("the canvas keeps keyboard focus: Delete deletes the clicked block", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await clickBlock(id);
    const panel = await inspectorNaming("estimate()");
    expect(panel.contains(document.activeElement), "the panel took no focus").toBe(false);

    await userEvent.keyboard("{Delete}");

    await waitFor(() => (app!.editor.getShape(id) === undefined ? true : null), { what: "the block deleted" });
  });

  it("the canvas keeps keyboard focus: an arrow key nudges the clicked block", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await clickBlock(id);
    await inspectorNaming("estimate()");
    const before = app.editor.getShape(id)!.x;

    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => (app!.editor.getShape(id)!.x > before ? true : null), { what: "the block nudged right" });
  });

  it("opening the panel is not an undo entry — one Ctrl+Z after click-then-edit undoes the edit", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await cardOf(id);
    app.editor.markHistoryStoppingPoint("fixture");
    await clickBlock(id);
    const panel = await inspectorNaming("estimate()");
    const eye = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="ss-inspector-description-eye"]'), { what: "the eye" });
    await userEvent.click(eye);
    await waitFor(() => propsOf(id).showDescription === false, { what: "the eye's write" });

    app.editor.focus();
    await userEvent.keyboard("{Control>}z{/Control}");

    await waitFor(() => propsOf(id).showDescription === true, { what: "Ctrl+Z undid the eye" });
    expect(app.editor.getShape(id), "the block itself survived").toBeDefined();
    // The panel is untouched by the undo: still open, still on that block.
    expect(subjectText()).toBe("estimate()");
  });
});

describe("a region is inspected through its corner card", () => {
  function placeRegionWithCard(): { regionId: TLShapeId; cardId: TLShapeId } {
    const regionId = createShapeId();
    app!.editor.createShape({ id: regionId, type: REGION_SHAPE_TYPE, x: 240, y: 180, props: { kind: "while", name: "While Loop", w: 460, h: 300 } } as never);
    const cardId = createCornerBlock(app!.editor, regionId, "while");
    if (!cardId) throw new Error("no corner card minted");
    return { regionId, cardId };
  }

  it("a click that selects the REGION opens the Inspector on its card, and edits write to the card", async () => {
    app = await mountApp();
    const { regionId, cardId } = placeRegionWithCard();
    const card = await cardOf(cardId);
    const regionEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${regionId}"]`), { what: "the region" });
    // The title strip BESIDE the card: region chrome (`RegionShapeUtil.getGeometry`).
    const cardRect = card.getBoundingClientRect();
    const regionRect = regionEl.getBoundingClientRect();
    await clickAtScreen({ x: regionRect.right - 24, y: cardRect.top + cardRect.height / 2 });

    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === regionId ? true : null), { what: "the region selected" });
    const panel = await inspectorNaming("While Loop");

    const field = panel.querySelector<HTMLTextAreaElement>('[data-testid="ss-inspector-description-text"]')!;
    await userEvent.fill(field, "Runs while the pose is unstable.");
    await waitFor(() => propsOf(cardId).description === "Runs while the pose is unstable.", { what: "the description on the CARD" });
    expect((app.editor.getShape(regionId)!.props as Record<string, unknown>).description, "nothing written to the region").toBeUndefined();
  });

  it("a click on the corner card opens the Inspector on the card, whichever of card or region it selects", async () => {
    app = await mountApp();
    const { regionId, cardId } = placeRegionWithCard();
    const card = await cardOf(cardId);
    const header = await waitFor(() => card.querySelector<HTMLElement>(':scope > [data-slot="block-header"]'), { what: "the card header" });
    const rect = header.getBoundingClientRect();
    // Right end of the header: clear of the glyph (which opens its own picker).
    await clickAtScreen({ x: rect.right - 12, y: rect.top + rect.height / 2 });

    await waitFor(() => {
      const selected = app!.editor.getSelectedShapeIds();
      return selected.length === 1 && (selected[0] === cardId || selected[0] === regionId) ? true : null;
    }, { what: "the card or its region selected" });
    await inspectorNaming("While Loop");
  });

  it("a directly selected corner card is its own subject", async () => {
    app = await mountApp();
    const { cardId } = placeRegionWithCard();
    await cardOf(cardId);
    await openInspectorByHand();
    app.editor.select(cardId);
    await inspectorNaming("While Loop");
  });
});

describe("objects the Inspector has nothing to say about do not open it", () => {
  it("a stock tldraw shape does not open it; with the Inspector already showing, it shows the empty state", async () => {
    app = await mountApp();
    const geoId = createShapeId();
    app.editor.createShape({ id: geoId, type: "geo", x: 300, y: 300, props: { w: 160, h: 120 } } as never);
    await waitFor(() => app!.root.querySelector(`[data-shape-id="${geoId}"]`), { what: "the geo shape" });
    const centre = app.editor.pageToViewport({ x: 380, y: 360 });

    await clickAtScreen(centre);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === geoId ? true : null), { what: "the geo shape selected" });
    await settle();
    expect(railPanel()).toBeNull();

    app.editor.selectNone();
    const panel = await openInspectorByHand();
    await clickAtScreen(centre);
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === geoId ? true : null), { what: "the geo shape selected again" });
    await waitFor(() => panel.querySelector('[data-testid="ss-inspector-empty"]'), { what: "the empty state" });
  });

  it("a plain region with no corner card does not open it", async () => {
    app = await mountApp();
    const regionId = createShapeId();
    app.editor.createShape({ id: regionId, type: REGION_SHAPE_TYPE, x: 240, y: 180, props: { kind: "plain", name: "", w: 400, h: 260 } } as never);
    const regionEl = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-shape-id="${regionId}"]`), { what: "the region" });
    // Its outline: the frame's own left wall, halfway down.
    const rect = regionEl.getBoundingClientRect();
    await clickAtScreen({ x: rect.left + 1, y: rect.top + rect.height / 2 });
    await waitFor(() => (app!.editor.getSelectedShapeIds()[0] === regionId ? true : null), { what: "the plain region selected" });
    await settle();
    expect(railPanel()).toBeNull();
  });

  it("a programmatic selection is not a click and does not open it", async () => {
    app = await mountApp();
    const id = placeBlock("estimate()", 300, 300);
    await cardOf(id);
    app.editor.select(id);
    await settle();
    expect(railPanel()).toBeNull();
  });
});
