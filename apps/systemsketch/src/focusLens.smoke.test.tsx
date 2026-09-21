// src/focusLens.smoke.test.tsx — parity item P-025, "propagation focus lens:
// focus DIMS, isolate HIDES", driven in the real app.
//
// The claim under test is NOT "a control renders". It is that the lens reads
// the REAL document graph — wires and bindings the app made, projected through
// `sceneFromStore.ts` — and that its two modes do two genuinely different
// things to the board: DIM changes paint only, ISOLATE takes the shapes out of
// the engine as well, which is the half CSS cannot do.
//
// The fixture is a chain with a branch off the middle, so a bounded walk has
// something real to exclude:  a → b → seed → c,  and  far (unconnected).
import { createShapeId, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation } from "./files/launchConfig";
import { BLOCK_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
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

const PORTS = {
  left: [{ id: "in", declaration: "in: Pose" }],
  right: [{ id: "out", declaration: "out: Pose" }],
  top: [],
  bottom: [],
};

function block(name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports: PORTS } } as never);
  return id;
}

function wire(from: TLShapeId, to: TLShapeId): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: WIRE_SHAPE_TYPE, x: 0, y: 0 } as never);
  app!.editor.createBinding({ type: WIRE_BINDING_TYPE, fromId: id, toId: from, props: { terminal: "start", portId: "out" } } as never);
  app!.editor.createBinding({ type: WIRE_BINDING_TYPE, fromId: id, toId: to, props: { terminal: "end", portId: "in" } } as never);
  return id;
}

interface Chain {
  a: TLShapeId;
  b: TLShapeId;
  seed: TLShapeId;
  c: TLShapeId;
  d: TLShapeId;
  far: TLShapeId;
}

/** a → b → seed → c → d, plus `far`, which nothing reaches. */
function chain(): Chain {
  const a = block("a", 40, 300);
  const b = block("b", 280, 300);
  const seed = block("seed", 520, 300);
  const c = block("c", 760, 300);
  const d = block("d", 1000, 300);
  const far = block("far", 280, 560);
  wire(a, b);
  wire(b, seed);
  wire(seed, c);
  wire(c, d);
  return { a, b, seed, c, d, far };
}

const lens = () => document.querySelector<HTMLElement>('[data-testid="ss-focus-lens"]');
const controlIn = (lensEl: HTMLElement, id: string) =>
  lensEl.querySelector<HTMLElement>(`[data-testid="${id}"]`);

/** The container attribute the DIM stylesheet keys off, as the browser reads it. */
const dimAttribute = () => app!.editor.getContainer().getAttribute("data-ss-focus");

/** COMPUTED paint, not a class name — the claim is that the shape looks dim. */
function filterOf(id: TLShapeId): string {
  const host = app!.root.querySelector<HTMLElement>(`.tl-shape[data-shape-id="${id}"]`);
  if (!host) return "missing";
  return getComputedStyle(host).filter;
}

async function startFocus(seed: TLShapeId): Promise<HTMLElement> {
  app!.editor.setSelectedShapes([seed]);
  const lensEl = await waitFor(() => lens(), { what: "the focus lens, once one shape is selected" });
  const start = await waitFor(() => controlIn(lensEl, "focus-start"), { what: "the Focus trigger" });
  await userEvent.click(start);
  await waitFor(() => controlIn(lensEl, "focus-clear"), { what: "the lens to become active" });
  return lensEl;
}

describe("The propagation focus lens", () => {
  it("offers nothing until exactly one scene object is selected", async () => {
    app = await mountApp();
    const { a, b } = chain();
    expect(lens()).toBeNull();

    app.editor.setSelectedShapes([a, b]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(lens(), "two shapes have no single seed").toBeNull();

    app.editor.setSelectedShapes([a]);
    await waitFor(() => lens(), { what: "the lens with one shape selected" });
  });

  it("DIMS what the walk excludes and leaves what it includes alone", async () => {
    app = await mountApp();
    const { a, seed, c, far } = chain();
    await startFocus(seed);

    await waitFor(() => dimAttribute() === "dim", { what: `the dim attribute; saw ${dimAttribute()}` });

    // One step each way from `seed` reaches `b` and `c`; `a` is two upstream
    // steps away and `far` is not connected at all, so both stay dim.
    await waitFor(() => filterOf(c) === "none", { what: `c, one step downstream; saw ${filterOf(c)}` });
    expect(filterOf(seed)).toBe("none");
    expect(filterOf(a)).toContain("opacity");
    expect(filterOf(far)).toContain("opacity");

    // DIM is paint and only paint: the excluded shapes are still fully part of
    // the document and still selectable.
    expect(app.editor.isShapeHidden(a)).toBe(false);
    expect(app.editor.getShape(a)).toBeTruthy();
  });

  it("widening the downstream slider brings another layer back", async () => {
    app = await mountApp();
    const { d, seed } = chain();
    const lensEl = await startFocus(seed);
    // One step downstream reaches `c`; `d` is two away and starts dim.
    await waitFor(() => filterOf(d).includes("opacity"), { what: `d dim at one step; saw ${filterOf(d)}` });

    // The DOWNSTREAM slider is the plain left-to-right one — upstream is
    // deliberately RTL ("We made the left slider flipped", Zach 2026-09-18),
    // and that flip is the trunk story's claim to measure, not this file's.
    //
    // A real mouse click at a real coordinate on the real track. Two easier
    // routes were measured and ruled out: `.focus()` on the Slider's hidden
    // input does not stick inside the tldraw container (the next keystroke
    // arrived with `document.activeElement === BODY`), and Playwright refuses
    // to click the thumb — "element is not visible", Base UI paints it around
    // a zero-size input. Clicking the far right of the track is what a hand
    // does, and for a 1..2 range it means 2.
    const control = lensEl.querySelector<HTMLElement>('[data-testid="focus-downstream"]')!;
    const track = control.querySelector<HTMLElement>('[data-slot="slider-track"]')!;
    const input = control.querySelector<HTMLInputElement>("input")!;
    await userEvent.click(track, {
      position: { x: Math.max(1, track.clientWidth - 2), y: Math.max(1, Math.floor(track.clientHeight / 2)) },
    });

    await waitFor(() => input.value === "2", { what: `the slider to move; value ${input.value}` });

    await waitFor(() => filterOf(d) === "none", {
      what: `d at two downstream steps; saw ${filterOf(d)}, readout ${controlIn(lensEl, "focus-downstream-count")?.textContent}`,
    });
  });

  it("ISOLATE hides the excluded shapes from the ENGINE, not just from the eye", async () => {
    app = await mountApp();
    const { a, seed, c, far } = chain();
    const lensEl = await startFocus(seed);

    await userEvent.click(controlIn(lensEl, "focus-mode")!);

    await waitFor(() => app!.editor.isShapeHidden(far), {
      what: "the unconnected block to be hidden from the engine",
    });
    expect(app.editor.isShapeHidden(a), "two upstream steps away").toBe(true);
    expect(app.editor.isShapeHidden(c), "one step downstream — included").toBe(false);
    expect(app.editor.isShapeHidden(seed), "the seed itself").toBe(false);

    // Hidden, not deleted. The difference from DIM, measured where it actually
    // lives: tldraw's HIT TEST skips a hidden shape (Editor.mjs:4344), so the
    // pointer no longer finds `far` where it still sits. CSS could never do
    // that — hit-testing is geometric, off the records, not off the DOM.
    expect(app.editor.getShape(far)).toBeTruthy();
    const where = app.editor.getShapePageBounds(far)!.center;
    expect(app.editor.getShapeAtPoint(where, { hitInside: true })).toBeUndefined();
    expect(filterOf(far), "and it is not even rendered").toBe("missing");

    // And the dim stylesheet is NOT also running — the two modes are exclusive.
    expect(dimAttribute()).toBeNull();
  });

  it("Clear puts the whole board back, in both modes", async () => {
    app = await mountApp();
    const { far, seed } = chain();
    const lensEl = await startFocus(seed);
    await userEvent.click(controlIn(lensEl, "focus-mode")!);
    await waitFor(() => app!.editor.isShapeHidden(far));

    await userEvent.click(controlIn(lensEl, "focus-clear")!);

    await waitFor(() => app!.editor.isShapeHidden(far) === false, { what: "the board back after Clear" });
    expect(dimAttribute()).toBeNull();
    expect(filterOf(far)).toBe("none");
  });

  it("deleting the seed takes the lens down with it, rather than leaving the board dark", async () => {
    app = await mountApp();
    const { a, seed } = chain();
    await startFocus(seed);
    await waitFor(() => filterOf(a).includes("opacity"));

    app.editor.deleteShapes([seed]);

    await waitFor(() => dimAttribute() === null, { what: `the lens to clear; saw ${dimAttribute()}` });
    await waitFor(() => filterOf(a) === "none", { what: `a repainted; saw ${filterOf(a)}` });
  });
});
