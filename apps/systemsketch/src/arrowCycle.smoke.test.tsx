// src/arrowCycle.smoke.test.tsx — Excalidraw's "press A again for the next
// arrow", as the archive had it.
//
// Zach, 2026-09-19: "Please add the excalidraw interaction of multi pressing
// A to cycle through arrow types. Please refer to the old system sketch to
// see how this was implemented." And, the same day: "by default elbow arrows
// should always be used."
//
// The donor's rule, read from its code rather than remembered
// (/home/bam/systemsketch/src/toolbar/toolbarModel.ts:55,107-151 and
// toolbarIntegration.ts:98-103,154-169,249-261):
//
//   - presets cycle straight → curve → elbow → straight, and a fresh app
//     starts on ELBOW, so A walks elbow, straight, curve, elbow, …;
//   - A while the arrow tool is active advances; A from any other tool
//     re-arms the LAST preset (so drawing an arrow, which drops back to the
//     select tool, never skips one);
//   - a preset maps onto stock tldraw arrow props: elbow → `kind: "elbow"`;
//     straight → `kind: "arc"`, `bend: 0`; curve → `kind: "arc"`, `bend: 32`
//     (CURVE_ARROW_BEND, toolbarIntegration.ts:46);
//   - the dock's shape face shows the preset, and its popout lists the arrows
//     in the order A reaches them with the press count beside each
//     (SystemSketchToolbar.tsx:72-93,307,330-338);
//   - the last preset is remembered across reloads.
//
// Labels are spelled here from the donor (SystemSketchToolbar.tsx:72-76), not
// imported from the code under test, so the test is not the implementation
// grading itself.
import { ArrowShapeKindStyle, type TLArrowShape, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PREFERENCES_KEY } from "./chrome/ShareMenu";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

type Preset = "straight" | "curve" | "elbow";

const LABEL: Record<Preset, string> = {
  elbow: "Elbow arrow",
  straight: "Straight arrow",
  curve: "Curved arrow",
};

let app: MountedApp | null = null;

function clearStoredPreferences() {
  try {
    localStorage.removeItem(PREFERENCES_KEY);
  } catch {
    // A browser without storage still has a first press that lands on elbow.
  }
}

beforeEach(clearStoredPreferences);
afterEach(() => {
  app?.unmount();
  app = null;
  // Never leak a preset into the next test file (same origin, same storage).
  clearStoredPreferences();
});

function shapeFace(): HTMLElement | null {
  return app!.root.querySelector<HTMLElement>('[data-testid="ss-dock-family-shape"]');
}

async function focusCanvas() {
  // "press A on the canvas": give the board the focus a person's click would.
  const canvas = canvasOf(app!.root);
  const rect = canvas.getBoundingClientRect();
  await userEvent.click(canvas, { position: { x: Math.round(rect.width * 0.25), y: Math.round(rect.height * 0.3) } });
  await waitFor(() => app!.editor.getCurrentToolId() === "select", { what: "select tool after a bare canvas click" });
}

async function pressA() {
  await userEvent.keyboard("a");
}

async function expectArmed(preset: Preset) {
  await waitFor(() => app!.editor.getCurrentToolId() === "arrow", { what: `arrow tool active for ${preset}` });
  await waitFor(() => (shapeFace()?.getAttribute("aria-label") ?? "").startsWith(LABEL[preset]), {
    what: `dock face showing "${LABEL[preset]}" (was "${shapeFace()?.getAttribute("aria-label")}")`,
  });
  expect(shapeFace()!.getAttribute("aria-pressed")).toBe("true");
  expect(app!.editor.getStyleForNextShape(ArrowShapeKindStyle)).toBe(preset === "elbow" ? "elbow" : "arc");
}

async function drawArrow(from: { x: number; y: number }, to: { x: number; y: number }): Promise<TLArrowShape> {
  const before = new Set<TLShapeId>(app!.editor.getCurrentPageShapeIds());
  const canvas = canvasOf(app!.root);
  await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: from, targetPosition: to });
  return waitFor(
    () => app!.editor.getCurrentPageShapes().find((shape) => shape.type === "arrow" && !before.has(shape.id)) as TLArrowShape | undefined,
    { what: "a newly drawn arrow" },
  );
}

function storedPreset(): string | undefined {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    return raw ? (JSON.parse(raw) as { lastArrowPreset?: string }).lastArrowPreset : undefined;
  } catch {
    return undefined;
  }
}

describe("multi-press A cycles the arrow type (the archive's rule, elbow first)", () => {
  it("A walks elbow → straight → curve → elbow, with the arrow tool live after every press", async () => {
    app = await mountApp();
    await focusCanvas();
    for (const preset of ["elbow", "straight", "curve", "elbow"] as const) {
      await pressA();
      await expectArmed(preset);
    }
  });

  it("the 2nd press draws a straight arrow; A after drawing re-arms the last preset; curve draws bent, elbow draws elbowed", async () => {
    app = await mountApp();
    await focusCanvas();

    await pressA();
    await expectArmed("elbow");
    await pressA();
    await expectArmed("straight");
    const straight = await drawArrow({ x: 300, y: 300 }, { x: 520, y: 360 });
    expect(straight.props.kind).toBe("arc");
    expect(straight.props.bend).toBe(0);
    // Drawing hands back to the select tool…
    await waitFor(() => app!.editor.getCurrentToolId() !== "arrow", { what: "the arrow tool let go after drawing" });

    // …so the next A RE-ARMS straight rather than skipping to curve.
    await pressA();
    await expectArmed("straight");
    await pressA();
    await expectArmed("curve");
    const curved = await drawArrow({ x: 300, y: 460 }, { x: 520, y: 520 });
    expect(curved.props.kind).toBe("arc");
    expect(curved.props.bend).toBe(32);

    await pressA();
    await expectArmed("curve");
    await pressA();
    await expectArmed("elbow");
    const elbow = await drawArrow({ x: 700, y: 300 }, { x: 900, y: 420 });
    expect(elbow.props.kind).toBe("elbow");
  });

  it("the last preset survives a remount, and the first A after it re-arms that preset rather than resetting to elbow", async () => {
    app = await mountApp();
    await focusCanvas();
    for (const preset of ["elbow", "straight", "curve"] as const) {
      await pressA();
      await expectArmed(preset);
    }
    expect(storedPreset()).toBe("curve");

    app.unmount();
    app = await mountApp();
    // At rest the shape face remembers the arrow it last drew, and the next
    // shape tldraw would draw is already the remembered kind.
    await waitFor(() => (shapeFace()?.getAttribute("aria-label") ?? "").startsWith(LABEL.curve), { what: "the face remembering Curved arrow" });
    expect(shapeFace()!.getAttribute("aria-pressed")).toBe("false");
    expect(app.editor.getStyleForNextShape(ArrowShapeKindStyle)).toBe("arc");

    await focusCanvas();
    await pressA();
    await expectArmed("curve");
    const curved = await drawArrow({ x: 300, y: 300 }, { x: 520, y: 380 });
    expect(curved.props.bend).toBe(32);
  });

  it("a corrupt stored preset costs the memory, never the tool: the first A still lands on elbow", async () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ lastArrowPreset: "sideways", lastShapeTool: 42 }));
    app = await mountApp();
    await focusCanvas();
    await pressA();
    await expectArmed("elbow");
  });

  it("the dock's shape popout lists the arrows in the order A reaches them, with press counts, and a row arms that preset", async () => {
    app = await mountApp();
    const face = await waitFor(() => shapeFace(), { what: "the shape face" });
    await userEvent.click(face);
    const rows = await waitFor(() => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter((el) => /arrow/i.test(el.textContent ?? ""));
      return found.length === 3 ? found : null;
    }, { what: "three arrow rows" });
    expect(rows.map((row) => row.textContent?.trim())).toEqual(["Elbow arrowA", "Straight arrowA × 2", "Curved arrowA × 3"]);
    expect(document.body.textContent).toContain("Arrows · repeat A to cycle");

    await userEvent.click(rows[2]);
    await expectArmed("curve");
    expect(storedPreset()).toBe("curve");
    // With the arrow tool live, A ADVANCES from the picked preset.
    await pressA();
    await expectArmed("elbow");
  });
});
