// src/railClose.smoke.test.tsx — the right rail's ✕ is really clickable, at
// both a desktop and a narrow viewport, against tldraw's own `SharePanel`
// chip (`PyblocksBackendPanel`, `data-testid="ss-backend"`, mounted from
// `App.tsx`'s `SharePanel:` line).
//
// Bug (measured by another lane, 2026-09-22): at 1400x900, with the rail
// open, `document.elementFromPoint` at the centre of the rail's ✕
// (`chrome/panels.tsx`'s `SystemSketchPanel`) returned the backend chip, not
// the close button — the chip painted over the rail's own header. A real
// click on ✕ timed out. `./chrome/panels.tsx`'s `useRailTop` fixes it by
// measuring the chip's own box and clearing it; this file is that fix's
// acceptance, against the REAL mounted app and REAL pointer events — never
// DOM-presence-asserted.
import { createShapeId, type TLShapeId } from "tldraw";
import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(async () => {
  app?.unmount();
  app = null;
  // The config's own desktop posture (vitest.config.ts: 1400×900) for
  // whoever runs next in this file — the same reset `corner.smoke.test.tsx`
  // uses.
  await page.viewport(1400, 900);
});

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const BACKEND_CHIP = '[data-testid="ss-backend"]';

/** Mid-body of a placed block's card — the same point `inspectorOpens.
 *  smoke.test.tsx`'s `bodyPointOf` clicks to open the Inspector. */
async function cardOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block"]`), { what: `the card of ${id}` });
}

async function bodyPointOf(id: TLShapeId): Promise<{ x: number; y: number }> {
  const card = await cardOf(id);
  const header = await waitFor(() => card.querySelector<HTMLElement>(':scope > [data-slot="block-header"]'), { what: `the header of ${id}` });
  const cardRect = card.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  return { x: cardRect.left + cardRect.width / 2, y: (headerRect.bottom + cardRect.bottom) / 2 };
}

/** A real press at an exact viewport point, same shape as `inspectorOpens.
 *  smoke.test.tsx`'s `clickAtScreen`. */
async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

async function clickBlock(id: TLShapeId) {
  await clickAtScreen(await bodyPointOf(id));
}

function placeBlock(name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, description: "reads a frame and answers with a pose", view: "port", w: 220, h: 140, ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

async function pressStrip(testId: string) {
  const launcher = await waitFor(() => app!.root.querySelector<HTMLElement>(`[data-testid="${testId}"]`), { what: testId });
  await userEvent.click(launcher);
}

const railPanel = () => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"]');
const railClose = () => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell-close"]');
const backendChip = () => app!.root.querySelector<HTMLElement>(BACKEND_CHIP);

/** Open the rail on the Inspector by clicking a real block — the common path
 *  the bug report names ("the rail now opens automatically when you click a
 *  block... every user hits this"). */
async function openInspectorByClick(): Promise<TLShapeId> {
  const id = placeBlock("estimate()", 300, 300);
  await cardOf(id);
  await clickBlock(id);
  await waitFor(railPanel, { what: "the rail opened by the click" });
  return id;
}

describe.each([
  { label: "1400x900 (desktop)", width: 1400, height: 900 },
  { label: "720x900 (narrow)", width: 720, height: 900 },
])("the rail's ✕ clears the SharePanel chip — $label", ({ width, height }) => {
  it("elementFromPoint at the ✕'s centre is the close button, and a real click on it closes the rail", async () => {
    await page.viewport(width, height);
    app = await mountApp();
    await openInspectorByClick();

    const close = railClose()!;
    const rect = close.getBoundingClientRect();
    const centre = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    const hit = document.elementFromPoint(centre.x, centre.y);
    expect(hit, "element under the ✕'s centre").not.toBeNull();
    expect(close.contains(hit) || hit === close, `the ✕'s centre hit ${hit?.outerHTML.slice(0, 160)}`).toBe(true);

    await userEvent.click(close);
    await waitFor(() => (railPanel() === null ? true : null), { what: "the rail closed after a real click on ✕" });
  });

  it("the rail and the backend chip never overlap, for Frames, Problems and Inspector alike", async () => {
    await page.viewport(width, height);
    app = await mountApp();

    // Frames and Problems: opened from the bottom-right strip.
    await pressStrip("ss-status-frames");
    let shell = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="frames"]'), { what: "the rail on Frames" });
    expect(intersects(box(shell), box(backendChip()!)), "Frames rail vs backend chip").toBe(false);

    await pressStrip("ss-status-problems");
    shell = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="problems"]'), { what: "the rail on Problems" });
    expect(intersects(box(shell), box(backendChip()!)), "Problems rail vs backend chip").toBe(false);

    // Inspector: opened by clicking a block — but only a CLOSED rail follows
    // a click (`inspectorFollowsSelection.ts`'s own WHY: "never switch a
    // rail that is already showing Frames or Problems"), so close the one
    // Problems left open first (same launcher, toggle-closes).
    await pressStrip("ss-status-problems");
    await waitFor(() => (railPanel() === null ? true : null), { what: "the rail closed by hand" });
    await openInspectorByClick();
    shell = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"][data-surface="inspector"]'), { what: "the rail on Inspector" });
    expect(intersects(box(shell), box(backendChip()!)), "Inspector rail vs backend chip").toBe(false);
  });

  it("the backend chip stays visible and readable — status info, never hidden", async () => {
    await page.viewport(width, height);
    app = await mountApp();
    await openInspectorByClick();

    const chip = backendChip()!;
    const style = getComputedStyle(chip);
    expect(style.display).not.toBe("none");
    expect(style.visibility).toBe("visible");
    expect(Number(style.opacity)).toBeGreaterThan(0);
    const rect = chip.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(chip.textContent ?? "").toContain("Backend");
    // The chip's own centre still hits the chip itself — the rail cleared
    // it rather than the chip losing hit-testability.
    const centre = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    const hit = document.elementFromPoint(centre.x, centre.y);
    expect(chip.contains(hit) || hit === chip, `the chip's own centre hit ${hit?.outerHTML.slice(0, 160)}`).toBe(true);
  });
});
