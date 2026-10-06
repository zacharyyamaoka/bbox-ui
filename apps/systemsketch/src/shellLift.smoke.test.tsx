// src/shellLift.smoke.test.tsx — B-SHELL-P1 acceptance: the chrome, lifted
// behind HostPort, measured in the real studio in headless Chromium.
//
// Committed RED by the lane's acceptance author before any builder existed
// (docs/lanes/finish-B-SHELL-P1.md). OFF-LIMITS to the builder.
//
// Each test is named after the id it pins in the brief:
//   - SHELL-P1/windows-in-shell — the studio mounts the shell's container
//     (TRUNK/shell/BboxShell.tsx: `[data-slot="bbox-shell"]`, windows in
//     `[data-slot="bbox-shell-windows"]`) and the chrome bar, status strip,
//     floating toolbar and right rail render INSIDE its windows layer.
//   - SHELL-P1/pass-through — docs/WORK-ORDER-HOST-LESS-SHELL.md A1.4:
//     "press-drag a Block from a point covered by the shell's container but by
//     no window — it must move."
//   - SHELL-P1/pill-tracks — A1.4: the floating toolbar is placed from the
//     port's `selection().screenBounds` (≤ 2 px), follows the selection, and
//     hides while `interaction()` reads "moving".
//   - G-STALE carry (a GUARD, green at BASE) — LEDGER.md follow-up "no
//     committed test pins grid / zoom / dev / help as one click in the
//     stacked form" (G-STALE → W5, "or the B-SHELL-P1 lift"): the lift moves
//     the strip, so the lift carries the pin.
//
// Everything spatial is MEASURED (`getBoundingClientRect`, `elementFromPoint`)
// or read from the engine; nothing here passes on DOM presence alone.
import { cdp, page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type Editor, type TLShapeId } from "tldraw";

import {
  SELECTION_OVERLAY_INSET,
  placeFloatingToolbar,
  type Rect,
} from "@trunk/editor/floatingToolbar.placement";
import type { HostPort } from "@trunk/shell/hostPort";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";

/* ------------------------------------------------------------------ */
/* The adapter, loaded without a static import (see tldrawHostPort.smoke) */
/* ------------------------------------------------------------------ */

const ADAPTER_PATH = "./chrome/tldrawHostPort.ts";
type CreateTldrawHostPort = (editor: Editor) => HostPort;
const ADAPTER = import.meta.glob<{ createTldrawHostPort?: CreateTldrawHostPort }>("./chrome/tldrawHostPort.ts");

async function loadAdapter(): Promise<CreateTldrawHostPort> {
  const load = ADAPTER[ADAPTER_PATH];
  expect(
    load,
    "B-SHELL-P1 builds apps/systemsketch/src/chrome/tldrawHostPort.ts (the tldraw HostPort adapter) — it does not exist yet",
  ).toBeTypeOf("function");
  const module = await load!();
  expect(module.createTldrawHostPort, "chrome/tldrawHostPort.ts must export createTldrawHostPort(editor: Editor): HostPort").toBeTypeOf(
    "function",
  );
  return module.createTldrawHostPort!;
}

/* ------------------------------------------------------------------ */

let app: MountedApp | null = null;
afterEach(async () => {
  app?.unmount();
  app = null;
  // The config's desktop posture (vitest.config.ts: 1400×900) for whoever runs next.
  await page.viewport(1400, 900);
  // A viewport change can change the frame's scale; the next drag re-derives it.
  pointerMap = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

function makeBlock(editor: Editor, name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, ports: NO_PORTS } } as never);
  return id;
}

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

function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function contains(outer: Box, point: { x: number; y: number }): boolean {
  return point.x >= outer.left && point.x <= outer.right && point.y >= outer.top && point.y <= outer.bottom;
}

/** Laid out, non-empty and inside the viewport — "on screen", measured. */
function expectOnScreen(name: string, el: Element): void {
  const r = el.getBoundingClientRect();
  expect(r.width, `${name} has no width`).toBeGreaterThan(0);
  expect(r.height, `${name} has no height`).toBeGreaterThan(0);
  expect(r.left, `${name} starts left of the viewport`).toBeGreaterThanOrEqual(0);
  expect(r.top, `${name} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(r.right, `${name} ends right of the viewport`).toBeLessThanOrEqual(innerWidth);
  expect(r.bottom, `${name} ends below the viewport`).toBeLessThanOrEqual(innerHeight);
}

const VISIBLE_PILL = '[data-slot="floating-toolbar"][data-visible="true"]';
const CHROME_BAR = '[role="toolbar"][aria-label="Board and depth navigation"]';

/* ------------------------------------------------------------------ */
/* Real, pausable pointer input over CDP.                              */
/* ------------------------------------------------------------------ */
//
// Copied from `interfaceScaleCommit.smoke.test.tsx:53-134` (a test file
// cannot import another's helpers). WHY CDP and not `userEvent`: vitest's
// `userEvent` has no mouse down / move / up — its `dragAndDrop` presses, moves
// and releases inside one await, so nothing can be observed while the button
// is held, which is exactly when the pill must be hidden and `interaction()`
// must read "moving". WHY the map is DERIVED: vitest CSS-scales the 1400×900
// test iframe into the real window (measured 0.8×), and CDP addresses the
// top-level page; that file measured a translation-only calibration silently
// missing its target by 40 px.

let pointerMap: { scaleX: number; scaleY: number; originX: number; originY: number } | null = null;

async function probeAt(pageX: number, pageY: number): Promise<MouseEvent> {
  const landed = new Promise<MouseEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("mousemove", onMove, true);
      reject(new Error(`CDP mouse input never reached the test frame (probe at ${pageX},${pageY})`));
    }, 5_000);
    function onMove(event: MouseEvent) {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove, true);
      resolve(event);
    }
    window.addEventListener("mousemove", onMove, true);
  });
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pageX, y: pageY, button: "none", buttons: 0 });
  return landed;
}

async function pointerMapping(): Promise<NonNullable<typeof pointerMap>> {
  // Re-derived per test: `page.viewport` can change the frame's scale between tests.
  const near = await probeAt(200, 150);
  const far = await probeAt(600, 450);
  const scaleX = (600 - 200) / (far.clientX - near.clientX);
  const scaleY = (450 - 150) / (far.clientY - near.clientY);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new Error(`could not map CDP coordinates onto this frame: ${JSON.stringify({ near: [near.clientX, near.clientY], far: [far.clientX, far.clientY] })}`);
  }
  pointerMap = { scaleX, scaleY, originX: 200 - scaleX * near.clientX, originY: 150 - scaleY * near.clientY };
  return pointerMap;
}

async function mouseAt(type: "mousePressed" | "mouseMoved" | "mouseReleased", point: { x: number; y: number }): Promise<void> {
  const map = pointerMap ?? (await pointerMapping());
  await cdp().send("Input.dispatchMouseEvent", {
    type,
    x: map.originX + map.scaleX * point.x,
    y: map.originY + map.scaleY * point.y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: type === "mouseMoved" ? 0 : 1,
    pointerType: "mouse",
  });
  await nextFrame();
}

/* ------------------------------------------------------------------ */

describe("B-SHELL-P1 — the chrome lives in the shell", () => {
  it("SHELL-P1/windows-in-shell: the chrome bar, status strip, floating toolbar and right rail render inside the shell's windows layer, each on screen", async () => {
    app = await mountApp();
    const shell = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="bbox-shell"]'), {
      what: "the studio mounts the shell's container ([data-slot=bbox-shell], TRUNK/shell/BboxShell.tsx) — the chrome lift",
      timeout: 5_000,
    });
    const windows = shell.querySelector<HTMLElement>('[data-slot="bbox-shell-windows"]');
    expect(windows, "the shell's windows layer").not.toBeNull();

    const bar = await waitFor(() => app!.root.querySelector<HTMLElement>(CHROME_BAR), { what: "the chrome bar" });
    const strip = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="status-strip"]'), { what: "the status strip" });

    const id = makeBlock(app.editor, "Inside", 560, 420);
    app.editor.select(id);
    const pill = await waitFor(() => app!.root.querySelector<HTMLElement>(VISIBLE_PILL), { what: "the floating toolbar on a selection" });

    const framesLauncher = strip.querySelector<HTMLElement>('button[aria-label="Frames"]');
    expect(framesLauncher, "the strip's Frames launcher").not.toBeNull();
    await userEvent.click(framesLauncher!);
    const rail = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="panel-shell"]'), { what: "the right rail on Frames" });

    for (const [name, el] of [
      ["the chrome bar", bar],
      ["the status strip", strip],
      ["the floating toolbar", pill],
      ["the right rail", rail],
    ] as const) {
      expect(windows!.contains(el), `${name} is not inside the shell's windows layer`).toBe(true);
      expectOnScreen(name, el);
    }
  });

  it("SHELL-P1/pass-through (A1.4): a press-drag on a block under the shell's container but under no window moves the block", async () => {
    app = await mountApp();
    const editor = app.editor;
    const id = makeBlock(editor, "Under", 560, 420);
    const shape = await waitFor(() => document.querySelector<HTMLElement>(`[data-shape-id="${id}"]`), { what: "the block rendered" });
    const shell = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="bbox-shell"]'), {
      what: "the studio mounts the shell's container ([data-slot=bbox-shell]) — without it there is nothing to pass through",
      timeout: 5_000,
    });

    const start = centre(shape);
    // Non-vacuity: the press point IS covered by the shell's container…
    expect(contains(box(shell), start), "the press point is inside the shell's container").toBe(true);
    // …and lands on the canvas, not on the shell or any window.
    const hit = document.elementFromPoint(start.x, start.y);
    expect(hit?.closest(".tl-canvas"), `the press point hit ${hit?.outerHTML.slice(0, 160)} — the shell is swallowing canvas presses`).not.toBeNull();

    const before = editor.getShapePageBounds(id)!;
    const delta = { x: 150, y: 90 };
    await mouseAt("mouseMoved", start);
    await mouseAt("mousePressed", start);
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      await mouseAt("mouseMoved", { x: start.x + delta.x * fraction, y: start.y + delta.y * fraction });
    }
    await mouseAt("mouseReleased", { x: start.x + delta.x, y: start.y + delta.y });

    const after = await waitFor(() => {
      const bounds = editor.getShapePageBounds(id)!;
      return bounds.x !== before.x || bounds.y !== before.y ? bounds : null;
    }, { what: "the block moved under the drag" });
    // Camera at z=1 (harness), so a screen delta is a page delta.
    expect(Math.abs(after.x - before.x - delta.x), `moved by x ${after.x - before.x}`).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - before.y - delta.y), `moved by y ${after.y - before.y}`).toBeLessThanOrEqual(2);
  });

  it("SHELL-P1/pill-tracks (A1.4): the pill is placed from selection().screenBounds (≤ 2 px), follows a move, and hides while interaction() reads moving", async () => {
    app = await mountApp();
    const editor = app.editor;
    const createTldrawHostPort = await loadAdapter();
    const id = makeBlock(editor, "Track", 560, 420);
    await waitFor(() => document.querySelector(`[data-shape-id="${id}"]`), { what: "the block rendered" });
    const port = createTldrawHostPort(editor);
    port.select([id]);

    /**
     * The placement the SHELL must produce, computed from the PORT's own
     * readings with the trunk's own placement function — the oracle is the
     * trunk's `placeFloatingToolbar` (not this file's arithmetic), fed the
     * tldraw host's measured overlay inset. The selection is mid-screen, so
     * no bottom obstacle can bind. Polled, because placement settles in a
     * microtask after the selection moves.
     */
    async function expectPillPlacedFromPort(what: string): Promise<{ x: number; y: number }> {
      const container = editor.getContainer().getBoundingClientRect();
      const deadline = performance.now() + 5_000;
      let last = "";
      for (;;) {
        const pill = app!.root.querySelector<HTMLElement>(VISIBLE_PILL);
        const bounds: Rect | null = port.selection().screenBounds;
        if (pill && bounds) {
          const rect = pill.getBoundingClientRect();
          const viewport = port.viewport().screenBounds;
          const expected = await placeFloatingToolbar({
            selection: bounds,
            menu: { w: rect.width, h: rect.height },
            viewport: { w: viewport.w, h: viewport.h },
            overlayInset: SELECTION_OVERLAY_INSET,
          });
          const actual = { x: rect.left - container.left, y: rect.top - container.top };
          last = `${what}: pill at (${actual.x.toFixed(1)}, ${actual.y.toFixed(1)}), placement from selection().screenBounds ${JSON.stringify(bounds)} says (${expected.x}, ${expected.y}) ${expected.side}`;
          if (Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2) return actual;
        } else {
          last = `${what}: ${pill ? "" : "no visible pill; "}${bounds ? "" : "selection().screenBounds is null"}`;
        }
        if (performance.now() > deadline) throw new Error(`the pill does not track the port's selection bounds — ${last}`);
        await nextFrame();
      }
    }

    // The port's bounds are the engine's, container-relative (constraint 6).
    const engine = editor.getSelectionRotatedScreenBounds()!;
    const viewportScreen = editor.getViewportScreenBounds();
    const reported = port.selection().screenBounds!;
    expect(reported, "selection().screenBounds for a selected block").not.toBeNull();
    for (const [key, value] of [
      ["x", engine.x - viewportScreen.x],
      ["y", engine.y - viewportScreen.y],
      ["w", engine.w],
      ["h", engine.h],
    ] as const) {
      expect(Math.abs(reported[key] - value), `screenBounds.${key}: port ${reported[key]} vs engine ${value}`).toBeLessThanOrEqual(0.5);
    }

    const first = await expectPillPlacedFromPort("on select");

    // Follows a move made through the port's own command.
    port.nodes({ kind: "update", patches: [{ id, position: { x: 760, y: 420 } }] });
    const moved = await expectPillPlacedFromPort("after nodes(update) moved the block 200 px right");
    expect(moved.x - first.x, "the pill followed the block").toBeGreaterThan(150);

    // Hides for the length of a drag, and the port says why.
    const shape = document.querySelector<HTMLElement>(`[data-shape-id="${id}"]`)!;
    const start = centre(shape);
    await mouseAt("mouseMoved", start);
    await mouseAt("mousePressed", start);
    await mouseAt("mouseMoved", { x: start.x + 30, y: start.y + 20 });
    await mouseAt("mouseMoved", { x: start.x + 60, y: start.y + 40 });
    await waitFor(() => port.interaction() === "moving", { what: `interaction() to read "moving" mid-drag (reads ${port.interaction()})` });
    await waitFor(() => app!.root.querySelector(VISIBLE_PILL) === null, { what: "the pill hidden while the block is being dragged" });
    await mouseAt("mouseReleased", { x: start.x + 60, y: start.y + 40 });
    await waitFor(() => port.interaction() === "idle", { what: `interaction() back to "idle" after the drop (reads ${port.interaction()})` });
    await expectPillPlacedFromPort("back after the drop");
  });

  it("G-STALE carry (guard, green at BASE): at 720×900 the strip is stacked and every one of its cells is one click", async () => {
    await page.viewport(720, 900);
    app = await mountApp();
    const strip = await waitFor(
      () => {
        const el = app!.root.querySelector<HTMLElement>('[data-slot="status-strip"]');
        // Two 40 px rows, measured — not an attribute the lift may rename.
        return el && el.getBoundingClientRect().height >= 80 ? el : null;
      },
      { what: "the status strip in its stacked (two-row) form at 720 px" },
    );
    const cells = [...strip.querySelectorAll<HTMLElement>("button")];
    // grid · frames · problems | zoom | dev · help (statusStrip.tsx's items + the readout's menu trigger).
    expect(cells.map((cell) => cell.getAttribute("aria-label") ?? cell.textContent?.trim() ?? "?").length).toBeGreaterThanOrEqual(6);
    for (const cell of cells) {
      const at = centre(cell);
      const hit = document.elementFromPoint(at.x, at.y);
      expect(
        hit !== null && cell.contains(hit),
        `${cell.getAttribute("aria-label") ?? cell.textContent?.trim()} at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}) is covered by ${hit?.outerHTML.slice(0, 120)}`,
      ).toBe(true);
    }
  });
});
